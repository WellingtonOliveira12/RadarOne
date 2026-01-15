import { Monitor, MonitorSite } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { scrapeMercadoLivre } from '../scrapers/mercadolivre-scraper';
import { scrapeOLX } from '../scrapers/olx-scraper';
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

      // Verifica se usuário tem consultas disponíveis
      if (subscription.queriesUsed >= subscription.queriesLimit) {
        log.warn('Limite de consultas atingido', {
          monitorId: monitor.id,
          queriesUsed: subscription.queriesUsed,
          queriesLimit: subscription.queriesLimit,
        });
        return;
      }

      // Executa scraping com circuit breaker
      const ads = await circuitBreaker.execute(monitor.site, () => this.scrape(monitor));

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

      // Registra log de sucesso
      await this.logExecution(monitor.id, {
        status: 'SUCCESS',
        adsFound: ads.length,
        newAds: newAds.length,
        alertsSent,
        executionTime: Date.now() - startTime,
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
      log.monitorError(monitor.id, error, duration);

      // Registra log de erro
      await this.logExecution(monitor.id, {
        status: 'ERROR',
        error: error.message,
        executionTime: Date.now() - startTime,
      });
    }
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
    const hasEmail = !!monitor.user.email;

    // Log para debug
    log.info('📋 Canais de notificação do usuário', {
      monitorId: monitor.id,
      userId: monitor.user.id,
      hasTelegram,
      hasEmail,
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
      status: 'SUCCESS' | 'ERROR';
      adsFound?: number;
      newAds?: number;
      alertsSent?: number;
      error?: string;
      executionTime?: number;
    }
  ) {
    await prisma.monitorLog.create({
      data: {
        monitorId,
        status: data.status,
        adsFound: data.adsFound || 0,
        newAds: data.newAds || 0,
        alertsSent: data.alertsSent || 0,
        error: data.error,
        executionTime: data.executionTime,
      },
    });

    // Registra no UsageLog
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
