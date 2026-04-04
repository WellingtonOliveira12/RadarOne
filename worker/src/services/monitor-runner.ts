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
import { sessionPoolService, MAX_FAILOVER_ATTEMPTS } from './session-pool.service';
import { StatsRecorder, mapPageType } from './stats-recorder';
import { getDefaultUrl } from '../engine/default-urls';
import { buildSearchUrl } from '../engine/url-builder';
import { enrichAdWithFipe } from '../engine/enrichment/fipe';
import type { FipeEnrichment } from '../engine/enrichment/fipe-types';
import { matchAppleReference } from '../engine/enrichment/apple-reference';
import type { AppleReferenceMatch } from '../engine/enrichment/score-types';
import { computeOpportunityScoreV2 } from '../engine/enrichment/score-orchestrator';
import type { OpportunityResult } from '../engine/enrichment/score-types';
import { checkRelevance } from '../engine/relevance-filter';

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
  fipe?: FipeEnrichment;
  appleRef?: AppleReferenceMatch;
  opportunity?: OpportunityResult;
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

      // STRUCTURED_FILTERS: build dynamic URL from location + keyword data
      const monitorMode = (monitor as any).mode as string | undefined;
      if (monitorMode === 'STRUCTURED_FILTERS') {
        log.info('STRUCTURED_FILTERS_ENTRY', {
          monitorId: monitor.id,
          site: monitor.site,
          name: monitor.name,
          searchUrlBefore: monitor.searchUrl?.substring(0, 80) || 'NONE',
          hasFiltersJson: !!((monitor as any).filtersJson),
          filtersJsonKeys: (monitor as any).filtersJson ? Object.keys((monitor as any).filtersJson) : [],
        });
        try {
          const buildResult = buildSearchUrl(monitor as any);
          if (buildResult) {
            (monitor as any).searchUrl = buildResult.url;
            log.info('MONITOR_SEARCH_URL', {
              monitorId: monitor.id,
              site: monitor.site,
              url: buildResult.url,
            });
            log.info('MONITOR_SEARCH_LOCATION', {
              monitorId: monitor.id,
              site: monitor.site,
              location: buildResult.location,
            });
            log.info('MONITOR_SEARCH_MODE', {
              monitorId: monitor.id,
              site: monitor.site,
              mode: 'STRUCTURED_FILTERS',
            });

            // Log advanced filter application details
            const fa = buildResult.filtersApplied;
            if (fa.appliedUrl.length > 0) {
              log.info('FILTERS_APPLIED_URL', {
                monitorId: monitor.id,
                site: monitor.site,
                filters: fa.appliedUrl,
              });
            }
            if (fa.appliedPostProcess.length > 0) {
              log.info('FILTERS_APPLIED_POST_PROCESS', {
                monitorId: monitor.id,
                site: monitor.site,
                filters: fa.appliedPostProcess,
              });
            }
            if (fa.ignored.length > 0) {
              log.info('FILTERS_IGNORED_UNSUPPORTED', {
                monitorId: monitor.id,
                site: monitor.site,
                filters: fa.ignored,
              });
            }
          } else if (!monitor.searchUrl) {
            // No URL builder for this site AND no searchUrl → skip
            log.info('MONITOR_SKIPPED: STRUCTURED_FILTERS without URL builder or searchUrl', {
              monitorId: monitor.id,
              site: monitor.site,
            });
            await this.logExecution(monitor.id, {
              status: 'SKIPPED',
              error: `STRUCTURED_FILTERS: No URL builder for ${monitor.site} and no searchUrl provided`,
              executionTime: Date.now() - startTime,
            });
            return;
          } else if (this.isHomepageUrl(monitor.searchUrl, monitor.site)) {
            // URL builder returned null AND searchUrl is just a homepage (no search params).
            // Navigating to a marketplace homepage is useless — wastes browser slot + time.
            log.warn('MONITOR_SKIPPED_HOMEPAGE_FALLBACK', {
              monitorId: monitor.id,
              site: monitor.site,
              searchUrl: monitor.searchUrl,
              reason: 'STRUCTURED_FILTERS builder returned null and searchUrl is a homepage without search params',
            });
            await this.logExecution(monitor.id, {
              status: 'SKIPPED',
              error: `INVALID_CONFIG: ${monitor.site} monitor has no keywords and searchUrl is just the homepage. Add keywords via the dashboard.`,
              executionTime: Date.now() - startTime,
            });
            return;
          }
        } catch (urlBuildError: any) {
          log.error('FB_URL_BUILD_FAILED', urlBuildError, {
            monitorId: monitor.id,
            site: monitor.site,
          });
          await this.logExecution(monitor.id, {
            status: 'ERROR',
            error: urlBuildError.message,
            executionTime: Date.now() - startTime,
          });
          return;
        }
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
      // SESSION POOL VERIFICATION + FAILOVER
      // ═══════════════════════════════════════════════════════════════
      const siteRequiresAuth = userSessionService.siteRequiresAuth(monitor.site);

      if (siteRequiresAuth) {
        // Recover sessions whose cooldown expired (best-effort, non-blocking)
        await sessionPoolService.recoverCooledDownSessions().catch(() => {});

        const sessionStatus = await userSessionService.getSessionStatus(
          monitor.userId,
          monitor.site
        );

        log.info('SESSION_STATUS_CHECK', {
          monitorId: monitor.id,
          site: monitor.site,
          exists: sessionStatus.exists,
          status: sessionStatus.status || 'N/A',
          needsAction: sessionStatus.needsAction || false,
          poolSize: sessionStatus.poolSize || 0,
          activeCount: sessionStatus.activeCount || 0,
          expiresAt: sessionStatus.expiresAt?.toISOString() || null,
          lastUsedAt: sessionStatus.lastUsedAt?.toISOString() || null,
        });

        // No sessions configured → SKIPPED + notify user
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

          await this.sendSessionRequiredNotification(monitor);
          return;
        }

        // All sessions need action (none active) → SKIPPED + notify
        if (sessionStatus.needsAction) {
          log.info('MONITOR_SKIPPED: Pool sem sessões ativas', {
            monitorId: monitor.id,
            site: monitor.site,
            status: sessionStatus.status,
            poolSize: sessionStatus.poolSize,
            activeCount: sessionStatus.activeCount,
            reason: 'SESSION_POOL_EMPTY',
          });

          const { notified } = await userSessionService.markNeedsReauth(
            monitor.userId,
            monitor.site,
            `Pool vazio — todas sessões ${sessionStatus.status}`
          );

          if (notified) {
            await this.sendPoolDegradedNotification(monitor, sessionStatus.poolSize || 0, 0);
          }

          await this.logExecution(monitor.id, {
            status: 'SKIPPED',
            error: `SESSION_POOL_EMPTY: ${sessionStatus.poolSize} sessões, 0 ativas. Reconecte.`,
            executionTime: Date.now() - startTime,
          });

          return;
        }
      }
      // ═══════════════════════════════════════════════════════════════

      // ═══════════════════════════════════════════════════════════════
      // SCRAPING WITH FAILOVER (multi-session)
      // ═══════════════════════════════════════════════════════════════
      log.info('SCRAPER_START', {
        monitorId: monitor.id,
        site: monitor.site,
        searchUrl: monitor.searchUrl ? monitor.searchUrl.substring(0, 120) : 'N/A',
        mode: (monitor as any).mode || 'URL_ONLY',
      });

      let ads: Ad[];

      if (!siteRequiresAuth) {
        // Non-auth sites: simple execution, no failover needed
        ads = await circuitBreaker.execute(monitor.site, () => this.scrape(monitor));
      } else {
        // Auth sites: failover loop across session pool
        ads = await this.executeWithFailover(monitor, startTime);
      }

      log.info('SCRAPER_RESULT', {
        monitorId: monitor.id,
        site: monitor.site,
        adsExtracted: ads.length,
      });

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
      const allNewAds = await this.processAds(monitor.id, ads);

      // V3: Relevance filter — remove noise ads before enrichment
      // CRITICAL: Only apply keyword-in-title filtering when the monitor has
      // EXPLICIT keywords configured. When keywords come from monitor_name_fallback,
      // the extracted words (e.g., "geral", "ip15promax") are meaningless and would
      // reject all valid ads like "Apple iPhone 15 (128 Gb) - Preto".
      // URL-based filters (category, price, condition) already ensure relevance.
      const monitorKeywordsRaw = (monitor as any).filtersJson?.keywords
        || (monitor as any).filtersJson?.keyword
        || (monitor.keywords && monitor.keywords.length > 0 ? monitor.keywords.join(' ') : '')
        || null;
      const monitorKeywords = monitorKeywordsRaw || monitor.name;
      const keywordsSource = monitorKeywordsRaw ? 'explicit' : 'monitor_name_fallback';
      const skipRelevanceFilter = keywordsSource === 'monitor_name_fallback';

      const newAds: Ad[] = [];
      let relevanceFiltered = 0;

      if (skipRelevanceFilter) {
        // No explicit keywords → accept all new ads (URL filters already ensure relevance)
        newAds.push(...allNewAds);
        if (allNewAds.length > 0) {
          log.info('RELEVANCE_FILTER_BYPASSED', {
            monitorId: monitor.id,
            site: monitor.site,
            reason: 'monitor_name_fallback_keywords',
            newAdsAccepted: allNewAds.length,
            monitorName: monitor.name.substring(0, 60),
          });
        }
      } else {
        // Explicit keywords → apply relevance filter normally
        for (const ad of allNewAds) {
          const relevance = checkRelevance(ad.title, monitor.name, monitorKeywords);
          if (relevance.relevant) {
            newAds.push(ad);
          } else {
            relevanceFiltered++;
            log.info('AD_RELEVANCE_REJECTED', {
              monitorId: monitor.id,
              adId: ad.externalId,
              title: ad.title.substring(0, 60),
              reason: relevance.reason,
              relevanceScore: relevance.score,
              monitorKeywords: monitorKeywords.substring(0, 60),
            });
          }
        }
      }

      log.info('ADS_PROCESSED', {
        monitorId: monitor.id,
        site: monitor.site,
        totalAds: ads.length,
        newAds: newAds.length,
        duplicates: ads.length - allNewAds.length,
        relevanceFiltered,
        keywordsSource,
        skipRelevanceFilter,
        candidateNewAds: allNewAds.length,
        monitorKeywords: monitorKeywords.substring(0, 100),
      });

      // Warn when all new ads were filtered by relevance (only relevant for explicit keywords)
      if (relevanceFiltered > 0 && newAds.length === 0 && allNewAds.length > 0) {
        log.warn('ALL_NEW_ADS_FILTERED_BY_RELEVANCE', {
          monitorId: monitor.id,
          site: monitor.site,
          allNewAdsCount: allNewAds.length,
          relevanceFiltered,
          keywordsSource,
          monitorKeywords: monitorKeywords.substring(0, 100),
        });
      }

      // Enriquece anúncios com FIPE (best-effort, never blocks)
      if (newAds.length > 0) {
        for (const ad of newAds) {
          try {
            const fipeData = await enrichAdWithFipe({ title: ad.title, price: ad.price });
            if (fipeData) {
              ad.fipe = fipeData;
              log.info('FIPE_ENRICHED', {
                monitorId: monitor.id,
                adId: ad.externalId,
                fipePrice: fipeData.price,
                confidence: fipeData.confidence,
                classification: fipeData.classification,
              });
            }
          } catch {
            // FAILSAFE: FIPE enrichment never blocks the pipeline
          }
        }
      }

      // Enriquece anúncios com Apple Reference (best-effort, never blocks)
      if (newAds.length > 0) {
        for (const ad of newAds) {
          try {
            // Only attempt Apple match if no FIPE (avoids double-reference)
            if (!ad.fipe) {
              const appleMatch = await matchAppleReference(ad.title);
              if (appleMatch) {
                ad.appleRef = appleMatch;
                log.info('APPLE_REF_ENRICHED', {
                  monitorId: monitor.id,
                  adId: ad.externalId,
                  model: appleMatch.model,
                  storage: appleMatch.storage,
                  refPrice: appleMatch.referencePrice,
                });
              }
            }
          } catch {
            // FAILSAFE: Apple enrichment never blocks the pipeline
          }
        }
      }

      // Computa Opportunity Score V3 (best-effort, never blocks)
      if (newAds.length > 0) {
        for (const ad of newAds) {
          try {
            const scoreResult = await computeOpportunityScoreV2({
              title: ad.title,
              price: ad.price,
              location: ad.location,
              site: monitor.site,
              monitorId: monitor.id,
              fipe: ad.fipe,
              publishedAt: ad.publishedAt,
              appleRef: ad.appleRef,
            });
            if (scoreResult) {
              ad.opportunity = scoreResult;
            }
          } catch {
            // FAILSAFE: Score never blocks the pipeline
          }
        }
      }

      // V3 Enrichment Summary Log (per ad)
      if (newAds.length > 0) {
        for (const ad of newAds) {
          log.info('V3_AD_ENRICHMENT_SUMMARY', {
            monitorId: monitor.id,
            source: monitor.site,
            adId: ad.externalId,
            title: ad.title.substring(0, 60),
            price: ad.price || null,
            fipeFound: !!ad.fipe,
            fipePrice: ad.fipe?.price || null,
            fipeConfidence: ad.fipe?.confidence || null,
            appleMatch: !!ad.appleRef,
            appleModel: ad.appleRef?.model || null,
            appleRefPrice: ad.appleRef?.referencePrice || null,
            scoreMode: ad.opportunity?.scoreMode || null,
            scoreFinal: ad.opportunity?.score || null,
            scoreLabel: ad.opportunity?.label || null,
            confidence: ad.opportunity?.confidenceLevel || null,
          });
        }
      }

      // Envia alertas para anúncios novos
      let alertsSent = 0;
      if (newAds.length > 0 && monitor.alertsEnabled) {
        log.info('NOTIFICATION_TRIGGERED', {
          monitorId: monitor.id,
          site: monitor.site,
          newAdsCount: newAds.length,
          alertsEnabled: monitor.alertsEnabled,
        });
        alertsSent = await this.sendAlerts(monitor, newAds);
      } else if (newAds.length === 0) {
        log.info('NOTIFICATION_SKIPPED_REASON', {
          monitorId: monitor.id,
          site: monitor.site,
          reason: ads.length === 0
            ? 'no_ads_scraped'
            : allNewAds.length === 0
              ? 'all_duplicates'
              : 'all_filtered_by_relevance',
          totalAds: ads.length,
          duplicates: ads.length - allNewAds.length,
          relevanceFiltered,
        });
      } else if (!monitor.alertsEnabled) {
        log.info('NOTIFICATION_SKIPPED_REASON', {
          monitorId: monitor.id,
          site: monitor.site,
          reason: 'alerts_disabled',
          newAds: newAds.length,
        });
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

      // Update lastCheckedAt (skipped if scheduler already set it at start)
      // Also update lastAlertAt if alerts were sent
      const updateData: any = {};
      if (!(monitor as any).__lastCheckedAtSetByScheduler) {
        updateData.lastCheckedAt = new Date();
      }
      if (alertsSent > 0) {
        updateData.lastAlertAt = new Date();
      }
      if (Object.keys(updateData).length > 0) {
        await prisma.monitor.update({
          where: { id: monitor.id },
          data: updateData,
        });
      }

      const duration = Date.now() - startTime;
      log.monitorSuccess(monitor.id, ads.length, newAds.length, alertsSent, duration);
    } catch (error: any) {
      const duration = Date.now() - startTime;

      // ═══════════════════════════════════════════════════════════════
      // TRATAMENTO ESPECIAL PARA ERROS DE AUTENTICAÇÃO
      // ═══════════════════════════════════════════════════════════════
      if (isAuthError(error)) {
        log.warn('MONITOR_AUTH_ERROR', {
          monitorId: monitor.id,
          site: monitor.site,
          userId: monitor.userId,
          error: error.message,
          duration,
        });

        // Marca sessão como NEEDS_REAUTH (com cooldown de notificação de 6h no DB)
        const { notified } = await userSessionService.markNeedsReauth(
          monitor.userId,
          monitor.site,
          error.message
        );

        log.info('SESSION_MARKED_NEEDS_REAUTH', {
          monitorId: monitor.id,
          site: monitor.site,
          userId: monitor.userId,
          notified,
          reason: error.message,
        });

        // Envia alerta ao usuário se dentro do cooldown
        if (notified) {
          await this.sendReauthNotification(monitor);
          log.info('REAUTH_NOTIFICATION_SENT', {
            monitorId: monitor.id,
            site: monitor.site,
            userId: monitor.userId,
          });
        } else {
          log.info('REAUTH_NOTIFICATION_SKIPPED_COOLDOWN', {
            monitorId: monitor.id,
            site: monitor.site,
            userId: monitor.userId,
          });
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
   * Sends a proactive notification when a monitor requires session setup.
   * Uses a 6h DB-persisted cooldown to avoid spamming (survives worker restarts).
   *
   * Cooldown key: NotificationLog with title starting with '[SESSION_REQUIRED]'
   * and the same userId within the last 6 hours.
   */
  private static async sendSessionRequiredNotification(monitor: any): Promise<void> {
    const cooldownMs = 6 * 60 * 60 * 1000; // 6 hours
    const cooldownTitle = `[SESSION_REQUIRED] ${monitor.site}`;

    // Check DB-persisted cooldown via NotificationLog title convention
    try {
      const recentNotification = await prisma.notificationLog.findFirst({
        where: {
          userId: monitor.userId,
          title: cooldownTitle,
          createdAt: { gte: new Date(Date.now() - cooldownMs) },
        },
        select: { id: true },
      });

      if (recentNotification) {
        log.info('SESSION_REQUIRED_NOTIFICATION_SKIPPED_COOLDOWN', {
          monitorId: monitor.id,
          userId: monitor.userId,
          site: monitor.site,
        });
        return; // Within cooldown, skip notification
      }
    } catch (e: any) {
      // If DB check fails, fall through and send (better to notify than to silently skip)
      log.warn('SESSION_REQUIRED_COOLDOWN_CHECK_FAILED', { error: e.message });
    }

    const telegramChatId =
      monitor.user.notificationSettings?.telegramChatId ||
      monitor.user.telegramAccounts?.[0]?.chatId ||
      null;

    const siteName = this.formatSiteName(monitor.site);
    const connectionsUrl = 'https://radarone.com.br/dashboard/connections';
    const safeName = TelegramService.escapeHtml(monitor.name);

    const telegramMessage =
      `\u26A0\uFE0F <b>Conexão Necessária — ${siteName}</b>\n\n` +
      `O monitor "<b>${safeName}</b>" precisa que você conecte sua conta do ${siteName} para funcionar.\n\n` +
      `<b>O que fazer:</b>\n` +
      `1. Acesse <a href="${connectionsUrl}">Connections</a>\n` +
      `2. Conecte sua conta do ${siteName}\n` +
      `3. Seus monitores começarão a funcionar automaticamente\n\n` +
      `Sem a conexão, os monitores do ${siteName} ficam pausados.`;

    if (telegramChatId) {
      try {
        await TelegramService.sendMessage(telegramChatId, telegramMessage);
        log.info('SESSION_REQUIRED_NOTIFICATION: Enviado por Telegram', {
          monitorId: monitor.id,
          userId: monitor.userId,
          site: monitor.site,
        });
      } catch (e) {
        // Ignora erro de notificação
      }
    }

    if (monitor.user.email && emailService.isEnabled()) {
      try {
        await emailService.sendAdAlert({
          to: monitor.user.email,
          monitorName: `[CONEXÃO NECESSÁRIA] ${siteName}`,
          ad: {
            title: `Conecte sua conta do ${siteName}`,
            description:
              `O monitor "${monitor.name}" precisa que você conecte sua conta. ` +
              `Acesse Connections e conecte sua conta do ${siteName} para ativar o monitoramento.`,
            url: connectionsUrl,
            price: undefined,
          },
        });
        log.info('SESSION_REQUIRED_NOTIFICATION: Enviado por Email', {
          monitorId: monitor.id,
          userId: monitor.userId,
          site: monitor.site,
        });
      } catch (e) {
        // Ignora erro de notificação
      }
    }

    // Record notification in DB for persistent cooldown (best-effort)
    try {
      const channel = telegramChatId ? 'TELEGRAM' : 'EMAIL';
      const target = telegramChatId
        ? `***${String(telegramChatId).slice(-4)}`
        : monitor.user.email
          ? `***@${monitor.user.email.split('@')[1] || 'unknown'}`
          : 'unknown';

      await prisma.notificationLog.create({
        data: {
          userId: monitor.userId,
          channel,
          title: cooldownTitle,
          message: `Session required for ${this.formatSiteName(monitor.site)}`,
          target,
          status: 'SUCCESS',
        },
      });
    } catch {
      // Best-effort — notification was already sent
    }
  }

  /**
   * Execute scraping with automatic failover across session pool.
   * Tries the best session, and on auth failure retries with next eligible session.
   * Max attempts: MAX_FAILOVER_ATTEMPTS (3).
   */
  private static async executeWithFailover(monitor: any, startTime: number): Promise<Ad[]> {
    const excludeIds: string[] = [];
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_FAILOVER_ATTEMPTS; attempt++) {
      // Select best eligible session from pool
      const selection = await sessionPoolService.selectSession(
        monitor.userId,
        monitor.site,
        excludeIds
      );

      if (!selection.session) {
        // No more sessions available
        log.warn('SESSION_POOL_EXHAUSTED', {
          monitorId: monitor.id,
          site: monitor.site,
          attempt,
          totalExcluded: excludeIds.length,
          poolHealth: selection.poolHealth,
          reason: selection.reason,
        });

        // Send pool degraded/empty notification
        const poolHealth = await sessionPoolService.getPoolHealth(monitor.userId, monitor.site);
        const { notified } = await userSessionService.markNeedsReauth(
          monitor.userId,
          monitor.site,
          `Pool exhausted after ${attempt - 1} failover attempts`
        );

        if (notified) {
          await this.sendPoolDegradedNotification(
            monitor,
            poolHealth.totalSessions,
            poolHealth.activeSessions
          );
        }

        // Throw the last error or a new one so the outer catch handles logging
        throw lastError || new Error(`SESSION_POOL_EXHAUSTED: No eligible sessions for ${monitor.site}`);
      }

      const sessionId = selection.session.id;
      excludeIds.push(sessionId);

      if (attempt > 1) {
        log.info('SESSION_FAILOVER_TRIGGERED', {
          monitorId: monitor.id,
          site: monitor.site,
          attempt,
          sessionId,
          isPrimary: selection.session.isPrimary,
          eligibleRemaining: selection.totalEligible - 1,
        });
      }

      try {
        // Execute scraping with per-user circuit breaker
        const ads = await circuitBreaker.executeForUser(
          monitor.site,
          monitor.userId,
          () => this.scrape(monitor)
        );

        // Success: mark session healthy and reset failures
        await sessionPoolService.markSessionSuccess(sessionId);

        if (attempt > 1) {
          log.info('SESSION_FAILOVER_SUCCESS', {
            monitorId: monitor.id,
            site: monitor.site,
            attempt,
            sessionId,
          });
        }

        return ads;
      } catch (error: any) {
        lastError = error;

        if (isAuthError(error)) {
          // Auth error: quarantine this session and try next
          log.warn('SESSION_AUTH_FAILURE', {
            monitorId: monitor.id,
            site: monitor.site,
            sessionId,
            attempt,
            error: error.message,
          });

          await sessionPoolService.markSessionFailed(sessionId, error.message, 'auth');
          // Continue to next iteration (try next session)
          continue;
        }

        // Non-auth error: don't failover, propagate error
        throw error;
      }
    }

    // All attempts exhausted
    throw lastError || new Error(`SESSION_FAILOVER_EXHAUSTED after ${MAX_FAILOVER_ATTEMPTS} attempts`);
  }

  /**
   * Send notification when session pool is degraded or empty.
   * Includes pool context: total sessions, active count, affected monitors.
   */
  private static async sendPoolDegradedNotification(
    monitor: any,
    totalSessions: number,
    activeSessions: number
  ): Promise<void> {
    const telegramChatId =
      monitor.user.notificationSettings?.telegramChatId ||
      monitor.user.telegramAccounts?.[0]?.chatId ||
      null;

    const siteName = this.formatSiteName(monitor.site);
    const connectionsUrl = 'https://radarone.com.br/dashboard/connections';
    const isEmpty = activeSessions === 0;

    const statusLabel = isEmpty ? 'INDISPONÍVEL' : 'DEGRADADO';
    const emoji = isEmpty ? '🔴' : '🟡';

    const telegramMessage =
      `${emoji} <b>Pool de Sessões ${statusLabel} — ${siteName}</b>\n\n` +
      `${isEmpty
        ? 'Todas as sessões estão inválidas ou expiradas.'
        : `Apenas ${activeSessions} de ${totalSessions} sessões ativas.`
      }\n\n` +
      `<b>Impacto:</b> Monitores do ${siteName} ${isEmpty ? 'estão pausados' : 'podem falhar'}.\n\n` +
      `<b>O que fazer:</b>\n` +
      `1. Acesse <a href="${connectionsUrl}">Connections</a>\n` +
      `2. Reconecte as sessões expiradas do ${siteName}\n` +
      `3. Seus monitores voltarão automaticamente\n\n` +
      `Sessões: ${activeSessions}/${totalSessions} ativas`;

    if (telegramChatId) {
      try {
        await TelegramService.sendMessage(telegramChatId, telegramMessage);
        log.info('POOL_DEGRADED_NOTIFICATION_SENT', {
          monitorId: monitor.id,
          userId: monitor.userId,
          site: monitor.site,
          channel: 'TELEGRAM',
          totalSessions,
          activeSessions,
        });
      } catch (e) {
        // Best-effort
      }
    }

    if (monitor.user.email && emailService.isEnabled()) {
      try {
        await emailService.sendAdAlert({
          to: monitor.user.email,
          monitorName: `[${statusLabel}] Pool de Sessões — ${siteName}`,
          ad: {
            title: `Pool de sessões do ${siteName} ${isEmpty ? 'vazio' : 'degradado'}`,
            description:
              `${isEmpty
                ? 'Todas as sessões estão inválidas. Monitores pausados.'
                : `${activeSessions}/${totalSessions} sessões ativas. Risco de falha.`
              } Acesse Connections e reconecte.`,
            url: connectionsUrl,
            price: undefined,
          },
        });
        log.info('POOL_DEGRADED_NOTIFICATION_SENT', {
          monitorId: monitor.id,
          userId: monitor.userId,
          site: monitor.site,
          channel: 'EMAIL',
          totalSessions,
          activeSessions,
        });
      } catch (e) {
        // Best-effort
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
   * Detects if a URL is just a marketplace homepage without search parameters.
   * These URLs are useless for scraping — they show generic content, not search results.
   */
  private static isHomepageUrl(url: string, site: string): boolean {
    try {
      const parsed = new URL(url);
      const hasSearchParams = parsed.searchParams.has('q') ||
        parsed.searchParams.has('query') ||
        parsed.searchParams.has('search') ||
        parsed.search.length > 1; // Has any non-empty query string

      if (hasSearchParams) return false;

      // Check if path is just root or a known homepage path
      const pathClean = parsed.pathname.replace(/\/+$/, '');
      const homePaths: Record<string, string[]> = {
        OLX: ['', '/autos-e-pecas'],
        FACEBOOK_MARKETPLACE: ['', '/marketplace'],
        MERCADO_LIVRE: [''],
      };

      const siteHomePaths = homePaths[site] || [''];
      return siteHomePaths.includes(pathClean);
    } catch {
      return false;
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
   * Processa anúncios: identifica novos, detecta mudanças de preço e re-alertas.
   *
   * An ad is considered "new" (notification-worthy) if:
   * 1. Never seen before (genuinely new externalId), OR
   * 2. Price changed significantly (>5% or >R$50) since last seen, OR
   * 3. Not alerted for 24h+ and still appearing (re-alert window)
   *
   * This prevents indefinite silence when the marketplace has active listings
   * that keep appearing in scrape results with the same externalId.
   */
  private static async processAds(monitorId: string, ads: Ad[]): Promise<Ad[]> {
    const newAds: Ad[] = [];
    const PRICE_CHANGE_THRESHOLD_PERCENT = 0.05; // 5%
    const PRICE_CHANGE_THRESHOLD_ABS = 50; // R$50
    const REALERT_WINDOW_MS = 12 * 60 * 60 * 1000; // 12h for previously-alerted ads
    const NEVER_ALERTED_WINDOW_MS = 2 * 60 * 60 * 1000; // 2h for never-alerted ads (fast activation)

    for (const ad of ads) {
      const existing = await prisma.adSeen.findUnique({
        where: {
          monitorId_externalId: {
            monitorId,
            externalId: ad.externalId,
          },
        },
      });

      if (!existing) {
        // Case 1: Genuinely new ad — first time seeing this externalId
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
        continue;
      }

      // Ad was seen before — check for re-alert conditions
      const now = new Date();
      let shouldRealert = false;
      let realertReason = '';

      // Case 2: Price changed significantly (>5% or >R$50)
      if (ad.price != null && existing.price != null && ad.price !== existing.price) {
        const priceDiff = Math.abs(ad.price - existing.price);
        const percentChange = priceDiff / existing.price;

        if (percentChange >= PRICE_CHANGE_THRESHOLD_PERCENT || priceDiff >= PRICE_CHANGE_THRESHOLD_ABS) {
          shouldRealert = true;
          realertReason = `price_changed:${existing.price}→${ad.price}`;
        }
      }

      // Case 3: Previously alerted, but 24h+ since last alert → re-alert
      if (!shouldRealert && existing.alertSent) {
        const lastAlertTime = existing.alertSentAt?.getTime() || existing.firstSeenAt.getTime();
        if (now.getTime() - lastAlertTime >= REALERT_WINDOW_MS) {
          shouldRealert = true;
          realertReason = 'realert_window_24h';
        }
      }

      // Case 3b: NEVER alerted + seen for 6h+ → alert now (catches transition from old logic)
      if (!shouldRealert && !existing.alertSent) {
        const timeSinceFirstSeen = now.getTime() - existing.firstSeenAt.getTime();
        if (timeSinceFirstSeen >= NEVER_ALERTED_WINDOW_MS) {
          shouldRealert = true;
          realertReason = 'never_alerted_6h';
        }
      }

      // Update existing record
      await prisma.adSeen.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: now,
          title: ad.title,
          price: ad.price,
          url: ad.url,
          ...(shouldRealert ? { alertSent: false, alertSentAt: null } : {}),
        },
      });

      if (shouldRealert) {
        log.info('AD_REALERT_TRIGGERED', {
          monitorId,
          externalId: ad.externalId,
          reason: realertReason,
          title: ad.title.substring(0, 60),
          oldPrice: existing.price,
          newPrice: ad.price,
          firstSeenAgeHours: Math.round((now.getTime() - existing.firstSeenAt.getTime()) / 3600000),
          alertSent: existing.alertSent,
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
