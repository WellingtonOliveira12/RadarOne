import { PrismaClient, Monitor, MonitorSite } from '@prisma/client';
import { scrapeMercadoLivre } from '../scrapers/mercadolivre-scraper';
import { scrapeOLX } from '../scrapers/olx-scraper';
import { scrapeWebmotors } from '../scrapers/webmotors-scraper';
import { scrapeIcarros } from '../scrapers/icarros-scraper';
import { scrapeZapImoveis } from '../scrapers/zapimoveis-scraper';
import { scrapeVivaReal } from '../scrapers/vivareal-scraper';
import { scrapeImovelweb } from '../scrapers/imovelweb-scraper';
import { scrapeLeilao } from '../scrapers/leilao-scraper';
import { TelegramService } from './telegram-service';

/**
 * MonitorRunner
 * Orquestra a execução de um monitor específico
 */

const prisma = new PrismaClient();

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
    console.log(`\n🔍 Executando monitor: ${monitor.name} (${monitor.site})`);

    try {
      // Verifica se usuário tem assinatura ativa
      if (!monitor.user.subscriptions || monitor.user.subscriptions.length === 0) {
        console.log('⚠️  Usuário sem assinatura ativa. Pulando...');
        return;
      }

      const subscription = monitor.user.subscriptions[0];

      // Verifica se usuário tem consultas disponíveis
      if (subscription.queriesUsed >= subscription.queriesLimit) {
        console.log('⚠️  Limite de consultas atingido. Pulando...');
        return;
      }

      // Executa scraping conforme o site
      const ads = await this.scrape(monitor);
      console.log(`📦 ${ads.length} anúncios encontrados`);

      // Processa anúncios
      const newAds = await this.processAds(monitor.id, ads);
      console.log(`✨ ${newAds.length} anúncios novos`);

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

      console.log(`✅ Monitor executado com sucesso (${Date.now() - startTime}ms)`);
    } catch (error: any) {
      console.error(`❌ Erro ao executar monitor:`, error.message);

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
   * Envia alertas via Telegram
   */
  private static async sendAlerts(monitor: any, ads: Ad[]): Promise<number> {
    if (!monitor.user.telegramChatId) {
      console.log('⚠️  Usuário sem Telegram configurado');
      return 0;
    }

    let sentCount = 0;

    for (const ad of ads) {
      try {
        await TelegramService.sendAdAlert(monitor.user.telegramChatId, {
          monitorName: monitor.name,
          ad,
        });

        // Marca alerta como enviado
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

        // Delay entre alertas para evitar rate limit do Telegram
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error('❌ Erro ao enviar alerta:', error);
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
