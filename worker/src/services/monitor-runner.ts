import { Monitor, MonitorSite, LogStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { scrapeMercadoLivre } from '../scrapers/mercadolivre-scraper';
import { scrapeOLX } from '../scrapers/olx-scraper';
import { scrapeFacebook } from '../scrapers/facebook-scraper';
import { scrapeWebmotors } from '../scrapers/webmotors-scraper';
import { scrapeIcarros } from '../scrapers/icarros-scraper';
import { scrapeZapImoveis } from '../scrapers/zapimoveis-scraper';
import { scrapeVivaReal } from '../scrapers/vivareal-scraper';
import { scrapeImovelweb } from '../scrapers/imovelweb-scraper';
import { scrapeLeilao } from '../scrapers/leilao-scraper';
import { TelegramService } from './telegram-service';
import { emailService } from './email-service';
import { circuitBreaker } from '../utils/circuit-breaker';
import { log } from '../utils/logger';
import { userSessionService } from './user-session-service';
import { isAuthError } from './session-provider';
import { StatsRecorder, mapPageType } from './stats-recorder';
import { getDefaultUrl } from '../engine/default-urls';

/**
 * MonitorRunner
 * Orquestra a execução de um monitor específico
 */

interface Ad {
  externalId: string;
  title: string;
  description?: string;
  price?: number;
  url: string;
  imageUrl?: string;
  location?: string;
  publishedAt?: Date;
}

export class MonitorRunner {
  /**
   * Executa um monitor
   */
  static async run(monitor: any) {
    const startTime = Date.now();
    log.monitorStart(monitor.id, monitor.name, monitor.site);

    try {
      // Verifica se usuário tem assinatura ativa
      if (!monitor.user.subscriptions || monitor.user.subscriptions.length === 0) {
        log.warn('Usuário sem assinatura ativa', { monitorId: monitor.id });
        return;
      }

      const subscription = monitor.user.subscriptions[0];

      // Fallback defensivo: URL default por plataforma (edge case: searchUrl vazio no DB)
      if (!monitor.searchUrl) {
        const defaultUrl = getDefaultUrl(monitor.site);
        if (defaultUrl) {
          (monitor as any).searchUrl = defaultUrl;
          log.info('MONITOR_DEFAULT_URL', { monitorId: monitor.id, site: monitor.site, url: defaultUrl });
        }
      }

      // Guard: STRUCTURED_FILTERS sem URL builder implementado → skip gracioso
      const monitorMode = (monitor as any).mode as string | undefined;
      if (monitorMode === 'STRUCTURED_FILTERS' && !monitor.searchUrl) {
        log.info('MONITOR_SKIPPED: STRUCTURED_FILTERS sem searchUrl', { monitorId: monitor.id });
        await this.logExecution(monitor.id, {
          status: 'SKIPPED',
          error: 'STRUCTURED_FILTERS: URL builder not implemented',
          executionTime: Date.now() - startTime,
        });
        return;
      }

      // Verifica se usuário tem consultas disponíveis
      if (subscription.queriesUsed >= subscription.queriesLimit) {
        log.warn('Limite de consultas atingido', {
          monitorId: monitor.id,
          queriesUsed: subscription.queriesUsed,
          queriesLimit: subscription.queriesLimit,
        });
        return;
      }

      // ═══════════════════════════════════════════════════════════════
      // VERIFICAÇÃO DE SESSÃO DO USUÁRIO
      // ═══════════════════════════════════════════════════════════════
      const siteRequiresAuth = userSessionService.siteRequiresAuth(monitor.site);

      if (siteRequiresAuth) {
        const sessionStatus = await userSessionService.getSessionStatus(
          monitor.userId,
          monitor.site
        );

        // Se não existe sessão e site requer auth → SKIPPED
        if (!sessionStatus.exists) {
          log.info('MONITOR_SKIPPED: Sessão necessária mas não configurada', {
            monitorId: monitor.id,
            site: monitor.site,
            reason: 'SESSION_REQUIRED',
          });

          await this.logExecution(monitor.id, {
            status: 'SKIPPED',
            error: 'SESSION_REQUIRED: Este site requer conexão de conta',
            executionTime: Date.now() - startTime,
          });

          // NÃO incrementa circuit breaker!
          return;
        }

        // Se sessão precisa de ação do usuário → SKIPPED + re-notifica com cooldown
        if (sessionStatus.needsAction) {
          log.info('MONITOR_SKIPPED: Sessão precisa ser reconectada', {
            monitorId: monitor.id,
            site: monitor.site,
            status: sessionStatus.status,
            reason: 'NEEDS_REAUTH',
          });

          // Re-notifica com cooldown de 6h (idempotente: não muda status se já NEEDS_REAUTH)
          const { notified } = await userSessionService.markNeedsReauth(
            monitor.userId,
            monitor.site,
            `Sessão ${sessionStatus.status} — monitor SKIPado`
          );

          if (notified) {
            await this.sendReauthNotification(monitor);
          }

          await this.logExecution(monitor.id, {
            status: 'SKIPPED',
            error: `NEEDS_REAUTH: Sessão ${sessionStatus.status}. Reconecte sua conta.`,
            executionTime: Date.now() - startTime,
          });

          // NÃO incrementa circuit breaker!
          return;
        }
      }
      // ═══════════════════════════════════════════════════════════════

      // Executa scraping com circuit breaker
      // Para sites que requerem auth, usa chave por userId+site para não afetar outros usuários
      const ads = siteRequiresAuth
        ? await circuitBreaker.executeForUser(monitor.site, monitor.userId, () => this.scrape(monitor))
        : await circuitBreaker.execute(monitor.site, () => this.scrape(monitor));

      // Log de filtros aplicados e diagnóstico
      const diagData = (monitor as any).__lastDiagnosis;
      if (diagData?.metrics) {
        const m = diagData.metrics;
        log.info('FILTER_SUMMARY', {
          monitorId: monitor.id,
          site: monitor.site,
          adsRaw: m.adsRaw,
          adsValid: m.adsValid,
          skippedReasons: m.skippedReasons,
          filters: {
            priceMin: monitor.priceMin ?? null,
            priceMax: monitor.priceMax ?? null,
            country: (monitor as any).country ?? null,
            stateRegion: (monitor as any).stateRegion ?? null,
            city: (monitor as any).city ?? null,
          },
        });
      }

      // Processa anúncios
      const newAds = await this.processAds(monitor.id, ads);

      // Envia alertas para anúncios novos
      let alertsSent = 0;
      if (newAds.length > 0 && monitor.alertsEnabled) {
        alertsSent = await this.sendAlerts(monitor, newAds);
      }

      // Incrementa contador de consultas
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          queriesUsed: subscription.queriesUsed + 1,
        },
      });

      // Extract diagnosis from monitor if engine attached it
      const diagnosis = (monitor as any).__lastDiagnosis || undefined;

      // Registra log de sucesso
      await this.logExecution(monitor.id, {
        status: 'SUCCESS',
        adsFound: ads.length,
        newAds: newAds.length,
        alertsSent,
        executionTime: Date.now() - startTime,
        diagnosis,
      });

      // Registra metricas de execucao (best-effort)
      const now = new Date();
      const durationMs = Date.now() - startTime;
      await StatsRecorder.record({
        site: monitor.site,
        monitorId: monitor.id,
        userId: monitor.userId,
        startedAt: new Date(startTime),
        finishedAt: now,
        durationMs,
        pageType: mapPageType(diagnosis?.pageType),
        adsFound: ads.length,
        success: true,
      });

      // Atualiza lastCheckedAt
      await prisma.monitor.update({
        where: { id: monitor.id },
        data: {
          lastCheckedAt: new Date(),
          lastAlertAt: alertsSent > 0 ? new Date() : undefined,
        },
      });

      const duration = Date.now() - startTime;
      log.monitorSuccess(monitor.id, ads.length, newAds.length, alertsSent, duration);
    } catch (error: any) {
      const duration = Date.now() - startTime;

      // ═══════════════════════════════════════════════════════════════
      // TRATAMENTO ESPECIAL PARA ERROS DE AUTENTICAÇÃO
      // ═══════════════════════════════════════════════════════════════
      if (isAuthError(error)) {
        log.warn('MONITOR_AUTH_ERROR: Erro de autenticação detectado', {
          monitorId: monitor.id,
          site: monitor.site,
          error: error.message,
        });

        // Marca sessão como NEEDS_REAUTH (com cooldown de notificação)
        const { notified } = await userSessionService.markNeedsReauth(
          monitor.userId,
          monitor.site,
          error.message
        );

        // Envia alerta ao usuário se dentro do cooldown
        if (notified) {
          await this.sendReauthNotification(monitor);
        }

        // Log como SKIPPED, NÃO como ERROR
        await this.logExecution(monitor.id, {
          status: 'SKIPPED',
          error: `AUTH_ERROR: ${error.message}`,
          executionTime: duration,
        });

        // Registra metricas de execucao (best-effort)
        await StatsRecorder.record({
          site: monitor.site,
          monitorId: monitor.id,
          userId: monitor.userId,
          startedAt: new Date(startTime),
          finishedAt: new Date(),
          durationMs: duration,
          pageType: 'LOGIN_REQUIRED',
          adsFound: 0,
          success: false,
          errorCode: 'AUTH_ERROR',
        });

        // NÃO alimenta circuit breaker!
        // O circuit breaker só deve abrir para falhas reais (timeout, crash, etc.)
        return;
      }
      // ═══════════════════════════════════════════════════════════════

      // Erro normal → comportamento existente
      log.monitorError(monitor.id, error, duration);

      // Extract diagnosis from monitor if engine attached it
      const errorDiagnosis = (monitor as any).__lastDiagnosis || undefined;

      // Registra log de erro
      await this.logExecution(monitor.id, {
        status: 'ERROR',
        error: error.message,
        executionTime: duration,
        diagnosis: errorDiagnosis,
      });

      // Registra metricas de execucao (best-effort)
      await StatsRecorder.record({
        site: monitor.site,
        monitorId: monitor.id,
        userId: monitor.userId,
        startedAt: new Date(startTime),
        finishedAt: new Date(),
        durationMs: duration,
        pageType: mapPageType(errorDiagnosis?.pageType) || 'ERROR',
        adsFound: 0,
        success: false,
        errorCode: error.message?.slice(0, 200),
      });
    }
  }

  /**
   * Envia notificação ao usuário quando sessão precisa ser reconectada.
   * Cooldown de 6h é gerenciado por markNeedsReauth — este método só é chamado quando deve notificar.
   */
  private static async sendReauthNotification(monitor: any): Promise<void> {
    const telegramChatId =
      monitor.user.notificationSettings?.telegramChatId ||
      monitor.user.telegramAccounts?.[0]?.chatId ||
      null;

    const siteName = this.formatSiteName(monitor.site);
    const connectionsUrl = 'https://radarone.com.br/dashboard/connections';
    const safeName = TelegramService.escapeHtml(monitor.name);

    const telegramMessage =
      `⚠️ <b>Sessão Expirada — ${siteName}</b>\n\n` +
      `O monitor "<b>${safeName}</b>" está pausado porque sua sessão do ${siteName} expirou.\n\n` +
      `<b>O que fazer:</b>\n` +
      `1. Acesse <a href="${connectionsUrl}">Connections</a>\n` +
      `2. Localize ${siteName} e reconecte seus cookies\n` +
      `3. Seus monitores voltarão a funcionar automaticamente\n\n` +
      `Sem reconexão, os monitores do ${siteName} ficam pausados.`;

    // Envia por Telegram se disponível
    if (telegramChatId) {
      try {
        await TelegramService.sendMessage(telegramChatId, telegramMessage);
        log.info('REAUTH_NOTIFICATION: Enviado por Telegram', {
          monitorId: monitor.id,
          userId: monitor.userId,
          site: monitor.site,
        });
      } catch (e) {
        // Ignora erro de notificação
      }
    }

    // Envia por Email se disponível
    if (monitor.user.email && emailService.isEnabled()) {
      try {
        await emailService.sendAdAlert({
          to: monitor.user.email,
          monitorName: `[RECONEXÃO NECESSÁRIA] ${siteName}`,
          ad: {
            title: `Sua sessão do ${siteName} expirou`,
            description:
              `O monitor "${monitor.name}" está pausado. ` +
              `Acesse Connections e reconecte seus cookies do ${siteName} para reativar.`,
            url: connectionsUrl,
            price: undefined,
          },
        });
        log.info('REAUTH_NOTIFICATION: Enviado por Email', {
          monitorId: monitor.id,
          userId: monitor.userId,
          site: monitor.site,
        });
      } catch (e) {
        // Ignora erro de notificação
      }
    }
  }

  /**
   * Formata nome do site para exibição (MERCADO_LIVRE → Mercado Livre)
   */
  private static formatSiteName(site: string): string {
    const names: Record<string, string> = {
      MERCADO_LIVRE: 'Mercado Livre',
      OLX: 'OLX',
      FACEBOOK_MARKETPLACE: 'Facebook Marketplace',
      WEBMOTORS: 'Webmotors',
      ICARROS: 'iCarros',
      ZAP_IMOVEIS: 'Zap Imóveis',
      VIVA_REAL: 'Viva Real',
      IMOVELWEB: 'ImovelWeb',
      LEILAO: 'Leilão',
    };
    return names[site] || site;
  }

  /**
   * Executa scraping conforme o site configurado
   * Todos os scrapers implementados com rate limiting e retry automáticos
   */
  private static async scrape(monitor: any): Promise<Ad[]> {
    switch (monitor.site as MonitorSite) {
      case MonitorSite.MERCADO_LIVRE:
        return await scrapeMercadoLivre(monitor);

      case MonitorSite.OLX:
        return await scrapeOLX(monitor);

      case MonitorSite.FACEBOOK_MARKETPLACE:
        return await scrapeFacebook(monitor);

      case MonitorSite.WEBMOTORS:
        return await scrapeWebmotors(monitor);

      case MonitorSite.ICARROS:
        return await scrapeIcarros(monitor);

      case MonitorSite.ZAP_IMOVEIS:
        return await scrapeZapImoveis(monitor);

      case MonitorSite.VIVA_REAL:
        return await scrapeVivaReal(monitor);

      case MonitorSite.IMOVELWEB:
        return await scrapeImovelweb(monitor);

      case MonitorSite.LEILAO:
        return await scrapeLeilao(monitor);

      default:
        throw new Error(`Site não suportado: ${monitor.site}`);
    }
  }

  /**
   * Processa anúncios: salva novos e atualiza existentes
   */
  private static async processAds(monitorId: string, ads: Ad[]): Promise<Ad[]> {
    const newAds: Ad[] = [];

    for (const ad of ads) {
      // Verifica se anúncio já existe
      const existing = await prisma.adSeen.findUnique({
        where: {
          monitorId_externalId: {
            monitorId,
            externalId: ad.externalId,
          },
        },
      });

      if (existing) {
        // Atualiza lastSeenAt
        await prisma.adSeen.update({
          where: { id: existing.id },
          data: { lastSeenAt: new Date() },
        });
      } else {
        // Cria novo registro
        await prisma.adSeen.create({
          data: {
            monitorId,
            externalId: ad.externalId,
            title: ad.title,
            description: ad.description,
            price: ad.price,
            url: ad.url,
            imageUrl: ad.imageUrl,
            location: ad.location,
            publishedAt: ad.publishedAt,
          },
        });

        newAds.push(ad);
      }
    }

    return newAds;
  }

  /**
   * Envia alertas via Telegram e Email (multi-canal)
   */
  private static async sendAlerts(monitor: any, ads: Ad[]): Promise<number> {
    // FIX: Buscar telegramChatId de notificationSettings ou telegramAccounts
    const telegramChatId =
      monitor.user.notificationSettings?.telegramChatId ||
      monitor.user.telegramAccounts?.[0]?.chatId ||
      null;

    const telegramEnabled = monitor.user.notificationSettings?.telegramEnabled !== false;
    const hasTelegram = !!(telegramChatId && telegramEnabled);
    const emailEnabled = monitor.user.notificationSettings?.emailEnabled !== false;
    const hasEmail = !!(monitor.user.email && emailEnabled);

    // Log para debug
    log.info('📋 Canais de notificação do usuário', {
      monitorId: monitor.id,
      userId: monitor.user.id,
      hasTelegram,
      hasEmail,
      emailEnabled,
      telegramChatId: telegramChatId ? '***' + telegramChatId.slice(-4) : null,
    });

    if (!hasTelegram && !hasEmail) {
      console.log('⚠️  Usuário sem canais de notificação configurados (Telegram ou Email)');
      return 0;
    }

    let sentCount = 0;

    for (const ad of ads) {
      let alertSent = false;

      // Tenta enviar por Telegram
      if (hasTelegram) {
        try {
          await TelegramService.sendAdAlert(telegramChatId, {
            monitorName: monitor.name,
            ad,
          });

          alertSent = true;
          log.info('📱 Alerta enviado por Telegram', {
            monitorId: monitor.id,
            adId: ad.externalId,
            channel: 'telegram',
          });

          // Delay entre alertas para evitar rate limit do Telegram
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error: any) {
          log.warn('❌ Erro ao enviar alerta por Telegram', {
            monitorId: monitor.id,
            adId: ad.externalId,
            channel: 'telegram',
            error: error.message,
          });
        }
      }

      // Tenta enviar por Email
      if (hasEmail && emailService.isEnabled()) {
        try {
          const result = await emailService.sendAdAlert({
            to: monitor.user.email,
            monitorName: monitor.name,
            ad,
          });

          if (result.success) {
            alertSent = true;
            log.info('📧 Alerta enviado por Email', {
              monitorId: monitor.id,
              adId: ad.externalId,
              channel: 'email',
              messageId: result.messageId,
            });
          }

          // Delay entre emails
          await new Promise((resolve) => setTimeout(resolve, 300));
        } catch (error: any) {
          log.warn('❌ Erro ao enviar alerta por Email', {
            monitorId: monitor.id,
            adId: ad.externalId,
            channel: 'email',
            error: error.message,
          });
        }
      }

      // Marca alerta como enviado se pelo menos um canal funcionou
      if (alertSent) {
        await prisma.adSeen.updateMany({
          where: {
            monitorId: monitor.id,
            externalId: ad.externalId,
          },
          data: {
            alertSent: true,
            alertSentAt: new Date(),
          },
        });

        sentCount++;
      }
    }

    return sentCount;
  }

  /**
   * Registra log de execução
   */
  private static async logExecution(
    monitorId: string,
    data: {
      status: 'SUCCESS' | 'ERROR' | 'SKIPPED';
      adsFound?: number;
      newAds?: number;
      alertsSent?: number;
      error?: string;
      executionTime?: number;
      diagnosis?: any;
    }
  ) {
    // Mapeia para o enum do Prisma
    const statusMap: Record<string, LogStatus> = {
      'SUCCESS': LogStatus.SUCCESS,
      'ERROR': LogStatus.ERROR,
      'SKIPPED': LogStatus.SKIPPED,
    };

    await prisma.monitorLog.create({
      data: {
        monitorId,
        status: statusMap[data.status] || LogStatus.ERROR,
        adsFound: data.adsFound || 0,
        newAds: data.newAds || 0,
        alertsSent: data.alertsSent || 0,
        error: data.error,
        executionTime: data.executionTime,
        diagnosis: data.diagnosis || undefined,
      },
    });

    // Registra no UsageLog (apenas para SUCCESS, não para SKIPPED)
    if (data.status === 'SUCCESS') {
      await prisma.usageLog.create({
        data: {
          userId: (await prisma.monitor.findUnique({ where: { id: monitorId } }))!
            .userId,
          action: 'monitor_check',
          details: data,
        },
      });
    }
  }
}
