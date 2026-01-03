# WORKER TEST PLAN - RadarOne
**Data:** 02/01/2026
**Objetivo:** Validar funcionamento end-to-end do worker de monitoramento

---

## OVERVIEW

Este plano de testes cobre:
1. **Testes Unitários:** Utils (rate-limiter, retry, captcha)
2. **Testes de Integração:** Scrapers por fonte
3. **Testes End-to-End:** Fluxo completo (scraping → dedup → alerta)
4. **Testes de Carga:** Escalabilidade e limites
5. **Testes de Resiliência:** Falhas, bloqueios, timeouts

---

## 1. TESTES UNITÁRIOS

### 1.1 Rate Limiter

**Arquivo:** `worker/src/utils/rate-limiter.ts`

**Teste 1.1.1: Token Bucket - Consumo básico**
```typescript
// worker/__tests__/rate-limiter.test.ts
import { rateLimiter } from '../src/utils/rate-limiter';

describe('Rate Limiter', () => {
  beforeEach(() => {
    rateLimiter.resetAll();
  });

  test('should allow immediate acquisition when bucket is full', async () => {
    const start = Date.now();
    await rateLimiter.acquire('MERCADO_LIVRE');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100); // Sem espera
  });

  test('should wait when rate limit is reached', async () => {
    // MERCADO_LIVRE: 10 tokens, 60s interval
    // Consome 10 tokens rapidamente
    for (let i = 0; i < 10; i++) {
      await rateLimiter.acquire('MERCADO_LIVRE');
    }

    // 11º token deve esperar
    const start = Date.now();
    await rateLimiter.acquire('MERCADO_LIVRE');
    const duration = Date.now() - start;

    expect(duration).toBeGreaterThan(5000); // Esperou refill
  });

  test('should refill tokens over time', async () => {
    // Consome todos os tokens
    for (let i = 0; i < 10; i++) {
      await rateLimiter.acquire('MERCADO_LIVRE');
    }

    // Aguarda intervalo de refill (60s para ML)
    await new Promise(resolve => setTimeout(resolve, 61000));

    // Deve ter 10 tokens novamente
    const status = rateLimiter.getStatus('MERCADO_LIVRE');
    expect(status?.tokens).toBe(10);
  });

  test('should have different buckets per site', async () => {
    await rateLimiter.acquire('MERCADO_LIVRE');
    await rateLimiter.acquire('OLX');

    const mlStatus = rateLimiter.getStatus('MERCADO_LIVRE');
    const olxStatus = rateLimiter.getStatus('OLX');

    expect(mlStatus?.tokens).toBeLessThan(20); // Consumiu 1
    expect(olxStatus?.tokens).toBeLessThan(30); // Consumiu 1
    expect(mlStatus?.tokens).not.toBe(olxStatus?.tokens); // Diferentes
  });
});
```

**Checklist:**
- [ ] Criar `worker/__tests__/rate-limiter.test.ts`
- [ ] Rodar: `cd worker && npm test rate-limiter`
- [ ] Validar 100% coverage do rate-limiter.ts

---

### 1.2 Retry Helper

**Arquivo:** `worker/src/utils/retry-helper.ts`

**Teste 1.2.1: Backoff Exponencial**
```typescript
// worker/__tests__/retry-helper.test.ts
import { retry, retryPresets, isRetriableError } from '../src/utils/retry-helper';

describe('Retry Helper', () => {
  test('should succeed on first attempt', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      return 'success';
    };

    const result = await retry(fn, { maxAttempts: 3 });

    expect(result).toBe('success');
    expect(attempts).toBe(1);
  });

  test('should retry on failure and succeed', async () => {
    let attempts = 0;
    const fn = async () => {
      attempts++;
      if (attempts < 3) throw new Error('Fail');
      return 'success';
    };

    const result = await retry(fn, { maxAttempts: 5 });

    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  test('should throw after max attempts', async () => {
    const fn = async () => {
      throw new Error('Always fail');
    };

    await expect(retry(fn, { maxAttempts: 3 })).rejects.toThrow('Always fail');
  });

  test('should apply exponential backoff', async () => {
    const delays: number[] = [];
    let attempts = 0;

    const fn = async () => {
      attempts++;
      throw new Error('Fail');
    };

    const onRetry = (error: Error, attempt: number) => {
      if (attempts > 1) {
        delays.push(Date.now());
      }
    };

    try {
      await retry(fn, {
        maxAttempts: 4,
        initialDelay: 1000,
        backoffFactor: 2,
        onRetry
      });
    } catch {}

    // Delay entre tentativas deve crescer: 1s, 2s, 4s
    const intervals = delays.map((d, i) => i > 0 ? d - delays[i-1] : 0).slice(1);
    expect(intervals[0]).toBeGreaterThanOrEqual(900); // ~1s
    expect(intervals[1]).toBeGreaterThanOrEqual(1900); // ~2s
  }, 10000);

  test('should identify retriable errors', () => {
    expect(isRetriableError({ message: 'net::ERR_CONNECTION_REFUSED' })).toBe(true);
    expect(isRetriableError({ message: 'timeout exceeded' })).toBe(true);
    expect(isRetriableError({ status: 429 })).toBe(true);
    expect(isRetriableError({ status: 500 })).toBe(true);
    expect(isRetriableError({ status: 404 })).toBe(false); // Não recuperável
  });
});
```

**Checklist:**
- [ ] Criar `worker/__tests__/retry-helper.test.ts`
- [ ] Rodar: `cd worker && npm test retry-helper`
- [ ] Validar delays (pode demorar 10s+)

---

### 1.3 Captcha Solver

**Teste 1.3.1: Configuração**
```typescript
// worker/__tests__/captcha-solver.test.ts
import { CaptchaSolver } from '../src/utils/captcha-solver';

describe('Captcha Solver', () => {
  test('should be disabled without env vars', () => {
    delete process.env.CAPTCHA_SERVICE;
    delete process.env.CAPTCHA_API_KEY;

    const solver = new CaptchaSolver();
    expect(solver.isEnabled()).toBe(false);
  });

  test('should be enabled with env vars', () => {
    process.env.CAPTCHA_SERVICE = '2captcha';
    process.env.CAPTCHA_API_KEY = 'test-key';

    const solver = new CaptchaSolver();
    expect(solver.isEnabled()).toBe(true);
  });

  // Testes de integração com 2Captcha/Anti-Captcha
  // requerem chaves de API reais (não incluir em CI)
});
```

**Checklist:**
- [ ] Criar `worker/__tests__/captcha-solver.test.ts`
- [ ] Testar configuração (não requer API)
- [ ] Testes de integração: manuais (custo $$)

---

## 2. TESTES DE INTEGRAÇÃO (Scrapers)

### 2.1 Mercado Livre Scraper

**Arquivo:** `worker/src/scrapers/mercadolivre-scraper.ts`

**Teste 2.1.1: Scraping de URL válida**
```typescript
// worker/__tests__/scrapers/mercadolivre.test.ts
import { scrapeMercadoLivre } from '../../src/scrapers/mercadolivre-scraper';

describe('Mercado Livre Scraper', () => {
  test('should scrape valid search URL', async () => {
    const monitor = {
      id: 'test-1',
      name: 'iPhone 13',
      site: 'MERCADO_LIVRE',
      searchUrl: 'https://lista.mercadolivre.com.br/iphone-13',
      priceMin: null,
      priceMax: null,
      active: true
    };

    const ads = await scrapeMercadoLivre(monitor);

    expect(ads).toBeDefined();
    expect(ads.length).toBeGreaterThan(0);

    // Validar estrutura do primeiro anúncio
    const firstAd = ads[0];
    expect(firstAd).toHaveProperty('externalId');
    expect(firstAd).toHaveProperty('title');
    expect(firstAd).toHaveProperty('price');
    expect(firstAd).toHaveProperty('url');

    // ExternalId padrão MLB
    expect(firstAd.externalId).toMatch(/^MLB\d+$/);

    // URL absoluta
    expect(firstAd.url).toMatch(/^https?:\/\//);

    console.log(`✅ Extraiu ${ads.length} anúncios`);
    console.log(`📦 Primeiro: ${firstAd.title} - R$ ${firstAd.price}`);
  }, 60000); // Timeout 60s

  test('should apply price filters', async () => {
    const monitor = {
      id: 'test-2',
      name: 'iPhone 13 (filtered)',
      site: 'MERCADO_LIVRE',
      searchUrl: 'https://lista.mercadolivre.com.br/iphone-13',
      priceMin: 2000,
      priceMax: 3000,
      active: true
    };

    const ads = await scrapeMercadoLivre(monitor);

    // Todos os anúncios devem estar na faixa de preço
    ads.forEach(ad => {
      expect(ad.price).toBeGreaterThanOrEqual(2000);
      expect(ad.price).toBeLessThanOrEqual(3000);
    });
  }, 60000);

  test('should return empty array for invalid URL', async () => {
    const monitor = {
      id: 'test-3',
      name: 'Invalid',
      site: 'MERCADO_LIVRE',
      searchUrl: 'https://lista.mercadolivre.com.br/produto-inexistente-xyz-123',
      priceMin: null,
      priceMax: null,
      active: true
    };

    const ads = await scrapeMercadoLivre(monitor);

    expect(ads).toEqual([]);
  }, 60000);
});
```

**Checklist:**
- [ ] Criar `worker/__tests__/scrapers/mercadolivre.test.ts`
- [ ] Rodar: `npm test mercadolivre`
- [ ] Validar extração (externalId, price, title, url)
- [ ] Validar filtros de preço
- [ ] Validar tratamento de URL inválida

---

### 2.2 OLX Scraper

**Teste 2.2.1: Scraping OLX**
```typescript
// worker/__tests__/scrapers/olx.test.ts
import { scrapeOLX } from '../../src/scrapers/olx-scraper';

describe('OLX Scraper', () => {
  test('should scrape OLX search URL', async () => {
    const monitor = {
      id: 'test-olx-1',
      name: 'Corolla 2020',
      site: 'OLX',
      searchUrl: 'https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/estado-sp?q=corolla',
      priceMin: null,
      priceMax: null,
      active: true
    };

    const ads = await scrapeOLX(monitor);

    expect(ads.length).toBeGreaterThan(0);
    expect(ads[0]).toHaveProperty('externalId');
    expect(ads[0]).toHaveProperty('title');

    console.log(`✅ OLX: ${ads.length} anúncios`);
  }, 60000);
});
```

**Checklist:**
- [ ] Criar `worker/__tests__/scrapers/olx.test.ts`
- [ ] Rodar: `npm test olx`
- [ ] Validar seletor `[data-ds-component="DS-AdCard"]`

---

### 2.3 Leilão Scraper

**Teste 2.3.1: Detecção automática de plataforma**
```typescript
// worker/__tests__/scrapers/leilao.test.ts
import { scrapeLeilao } from '../../src/scrapers/leilao-scraper';

describe('Leilão Scraper', () => {
  test('should detect Superbid platform', async () => {
    const monitor = {
      id: 'test-leilao-1',
      name: 'Carros Superbid',
      site: 'LEILAO',
      searchUrl: 'https://www.superbid.net/pesquisa?q=carro',
      priceMin: null,
      priceMax: null,
      active: true
    };

    const ads = await scrapeLeilao(monitor);

    expect(ads.length).toBeGreaterThan(0);

    // ExternalId deve ter prefixo SB-
    expect(ads[0].externalId).toMatch(/^SB-/);

    console.log(`✅ Superbid: ${ads.length} lotes`);
  }, 60000);

  test('should detect VIP Leilões platform', async () => {
    const monitor = {
      id: 'test-leilao-2',
      name: 'VIP Leilões',
      site: 'LEILAO',
      searchUrl: 'https://www.vipleiloes.com.br/busca?termo=veiculo',
      priceMin: null,
      priceMax: null,
      active: true
    };

    const ads = await scrapeLeilao(monitor);

    expect(ads.length).toBeGreaterThan(0);
    expect(ads[0].externalId).toMatch(/^VIP-/);
  }, 60000);

  test('should use generic fallback for unknown sites', async () => {
    const monitor = {
      id: 'test-leilao-3',
      name: 'Site Genérico',
      site: 'LEILAO',
      searchUrl: 'https://www.sodresantoro.com.br/leiloes',
      priceMin: null,
      priceMax: null,
      active: true
    };

    const ads = await scrapeLeilao(monitor);

    // Fallback genérico pode retornar 0 ou N anúncios
    expect(Array.isArray(ads)).toBe(true);
  }, 60000);
});
```

**Checklist:**
- [ ] Criar `worker/__tests__/scrapers/leilao.test.ts`
- [ ] Testar Superbid (prefixo SB-)
- [ ] Testar VIP (prefixo VIP-)
- [ ] Testar fallback genérico

---

## 3. TESTES END-TO-END

### 3.1 Fluxo Completo: Scraping → Dedup → Alerta

**Pré-requisitos:**
- Banco de dados de teste (Docker ou local)
- Telegram bot configurado (chat de teste)
- .env configurado

**Setup:**
```bash
# Criar banco de teste
docker run -d --name radarone-test-db \
  -e POSTGRES_DB=radarone_test \
  -e POSTGRES_USER=test \
  -e POSTGRES_PASSWORD=test \
  -p 5433:5432 \
  postgres:15

# Migrar schema
cd backend/
DATABASE_URL="postgresql://test:test@localhost:5433/radarone_test" npx prisma migrate deploy

# Criar usuário de teste
DATABASE_URL="postgresql://test:test@localhost:5433/radarone_test" \
  npx ts-node scripts/create-test-user.ts
```

**Teste E2E:**
```typescript
// worker/__tests__/e2e/full-flow.test.ts
import { PrismaClient } from '@prisma/client';
import { MonitorRunner } from '../../src/services/monitor-runner';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_TEST } }
});

describe('E2E: Full Flow', () => {
  let testUserId: string;
  let testMonitorId: string;

  beforeAll(async () => {
    // Criar usuário de teste
    const user = await prisma.user.create({
      data: {
        name: 'Test User',
        email: 'test@example.com',
        cpfHash: 'test-hash',
        telegramChatId: process.env.TELEGRAM_TEST_CHAT_ID,
        subscriptions: {
          create: {
            planId: 'plan-basico',
            status: 'ACTIVE',
            queriesLimit: 1000,
            queriesUsed: 0,
            validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          }
        }
      }
    });
    testUserId = user.id;

    // Criar monitor de teste
    const monitor = await prisma.monitor.create({
      data: {
        userId: testUserId,
        name: 'Test Monitor - iPhone 13',
        site: 'MERCADO_LIVRE',
        searchUrl: 'https://lista.mercadolivre.com.br/iphone-13',
        active: true,
        alertsEnabled: true
      }
    });
    testMonitorId = monitor.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.monitor.delete({ where: { id: testMonitorId } });
    await prisma.user.delete({ where: { id: testUserId } });
    await prisma.$disconnect();
  });

  test('should execute monitor and send alerts', async () => {
    // Buscar monitor com relações
    const monitor = await prisma.monitor.findUnique({
      where: { id: testMonitorId },
      include: {
        user: {
          include: {
            subscriptions: { where: { status: 'ACTIVE' } }
          }
        }
      }
    });

    // Executar monitor
    await MonitorRunner.run(monitor!);

    // Validar resultados
    const logs = await prisma.monitorLog.findMany({
      where: { monitorId: testMonitorId },
      orderBy: { createdAt: 'desc' }
    });

    expect(logs.length).toBeGreaterThan(0);

    const lastLog = logs[0];
    expect(lastLog.status).toBe('SUCCESS');
    expect(lastLog.adsFound).toBeGreaterThan(0);
    expect(lastLog.newAds).toBeGreaterThanOrEqual(0); // Primeira vez: todos são novos

    // Verificar AdSeen
    const adsSeen = await prisma.adSeen.findMany({
      where: { monitorId: testMonitorId }
    });

    expect(adsSeen.length).toBe(lastLog.adsFound);

    // Se alertsEnabled e há anúncios novos, deve ter enviado alertas
    if (lastLog.newAds > 0) {
      expect(lastLog.alertsSent).toBeGreaterThan(0);

      // Verificar flag alertSent
      const alertedAds = adsSeen.filter(ad => ad.alertSent);
      expect(alertedAds.length).toBe(lastLog.alertsSent);
    }

    // Verificar incremento de consultas
    const subscription = await prisma.subscription.findFirst({
      where: { userId: testUserId, status: 'ACTIVE' }
    });

    expect(subscription!.queriesUsed).toBe(1);

    console.log(`✅ Monitor executado: ${lastLog.adsFound} ads, ${lastLog.newAds} novos, ${lastLog.alertsSent} alertas`);
  }, 120000); // Timeout 2min

  test('should not send duplicate alerts on second run', async () => {
    const monitor = await prisma.monitor.findUnique({
      where: { id: testMonitorId },
      include: {
        user: {
          include: {
            subscriptions: { where: { status: 'ACTIVE' } }
          }
        }
      }
    });

    // Segunda execução
    await MonitorRunner.run(monitor!);

    const logs = await prisma.monitorLog.findMany({
      where: { monitorId: testMonitorId },
      orderBy: { createdAt: 'desc' },
      take: 2
    });

    const lastLog = logs[0];

    // Segunda execução: mesmos anúncios = 0 novos
    expect(lastLog.newAds).toBe(0);
    expect(lastLog.alertsSent).toBe(0);

    console.log(`✅ Segunda execução: ${lastLog.adsFound} ads, 0 novos, 0 alertas (dedup OK)`);
  }, 120000);
});
```

**Checklist:**
- [ ] Criar `worker/__tests__/e2e/full-flow.test.ts`
- [ ] Configurar banco de teste
- [ ] Criar usuário + monitor de teste
- [ ] Executar MonitorRunner.run()
- [ ] Validar logs (SUCCESS, adsFound > 0)
- [ ] Validar AdSeen (dedup)
- [ ] Validar alertas (se newAds > 0)
- [ ] Validar incremento de consultas
- [ ] Executar 2x e validar não duplicação

---

### 3.2 Teste de Loop Principal (Worker Index)

**Teste 3.2.1: Worker Loop**
```typescript
// worker/__tests__/e2e/worker-loop.test.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import { PrismaClient } from '@prisma/client';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

describe('E2E: Worker Loop', () => {
  test('should process multiple monitors in sequence', async () => {
    // Criar 3 monitores ativos
    const user = await prisma.user.findFirst();

    const monitors = await Promise.all([
      prisma.monitor.create({
        data: {
          userId: user!.id,
          name: 'Monitor 1',
          site: 'MERCADO_LIVRE',
          searchUrl: 'https://lista.mercadolivre.com.br/iphone',
          active: true
        }
      }),
      prisma.monitor.create({
        data: {
          userId: user!.id,
          name: 'Monitor 2',
          site: 'OLX',
          searchUrl: 'https://www.olx.com.br/imoveis/venda',
          active: true
        }
      }),
      prisma.monitor.create({
        data: {
          userId: user!.id,
          name: 'Monitor 3',
          site: 'MERCADO_LIVRE',
          searchUrl: 'https://lista.mercadolivre.com.br/notebook',
          active: true
        }
      })
    ]);

    // Executar worker por 30 segundos
    const workerProcess = exec('cd worker && npm run dev');

    await new Promise(resolve => setTimeout(resolve, 30000));

    workerProcess.kill();

    // Validar que todos foram processados
    for (const monitor of monitors) {
      const logs = await prisma.monitorLog.findMany({
        where: { monitorId: monitor.id }
      });

      expect(logs.length).toBeGreaterThan(0);
    }

    // Cleanup
    await prisma.monitor.deleteMany({
      where: { id: { in: monitors.map(m => m.id) } }
    });

    console.log(`✅ Worker processou ${monitors.length} monitores`);
  }, 60000);
});
```

**Checklist:**
- [ ] Testar worker em modo dev (30s)
- [ ] Validar processamento de múltiplos monitores
- [ ] Validar delay de 2s entre monitores

---

## 4. TESTES DE CARGA E PERFORMANCE

### 4.1 Capacidade de Monitores

**Teste 4.1.1: Escalabilidade**
```typescript
// worker/__tests__/performance/capacity.test.ts
describe('Performance: Capacity', () => {
  test('should measure time to process N monitors', async () => {
    const monitorCounts = [5, 10, 20, 50];

    for (const count of monitorCounts) {
      // Criar N monitores
      const monitors = await createTestMonitors(count);

      const start = Date.now();

      for (const monitor of monitors) {
        await MonitorRunner.run(monitor);
      }

      const duration = Date.now() - start;
      const avgTime = duration / count;

      console.log(`📊 ${count} monitores: ${(duration / 1000).toFixed(2)}s (${(avgTime / 1000).toFixed(2)}s/monitor)`);

      // Cleanup
      await deleteTestMonitors(monitors.map(m => m.id));

      // Expectativa: < 30s por monitor
      expect(avgTime).toBeLessThan(30000);
    }
  }, 600000); // Timeout 10min
});
```

**Checklist:**
- [ ] Criar `worker/__tests__/performance/capacity.test.ts`
- [ ] Medir tempo: 5, 10, 20, 50 monitores
- [ ] Registrar: tempo total, tempo médio/monitor
- [ ] Identificar bottleneck (scraping? dedup? logs?)

---

### 4.2 Rate Limiting

**Teste 4.2.1: Não ultrapassar limites**
```typescript
// worker/__tests__/performance/rate-limiting.test.ts
describe('Performance: Rate Limiting', () => {
  test('should respect rate limits per site', async () => {
    // Criar 30 monitores do Mercado Livre
    const monitors = await createMLMonitors(30);

    const start = Date.now();

    for (const monitor of monitors) {
      await MonitorRunner.run(monitor);
    }

    const duration = Date.now() - start;

    // ML: 10 req/min = 600 req/hora
    // 30 monitores devem levar no mínimo 3 minutos (180s)
    expect(duration).toBeGreaterThan(180000);

    console.log(`⏱️  30 monitores ML: ${(duration / 1000).toFixed(2)}s`);
  }, 600000);
});
```

**Checklist:**
- [ ] Testar com 30 monitores do mesmo site
- [ ] Validar que rate limit é respeitado
- [ ] Medir tempo mínimo esperado

---

## 5. TESTES DE RESILIÊNCIA

### 5.1 Falhas de Rede

**Teste 5.1.1: Timeout**
```typescript
// worker/__tests__/resilience/network-failures.test.ts
describe('Resilience: Network Failures', () => {
  test('should retry on timeout', async () => {
    const monitor = {
      id: 'test-timeout',
      name: 'Timeout Test',
      site: 'MERCADO_LIVRE',
      searchUrl: 'https://httpstat.us/524?sleep=40000', // Simula timeout
      active: true
    };

    // Deve falhar após retries
    await expect(scrapeMercadoLivre(monitor)).rejects.toThrow();

    // Verificar logs de retry
    // (console.warn deve mostrar "Attempt X/7 failed")
  }, 300000); // 5min timeout
});

  test('should handle 503 gracefully', async () => {
    const monitor = {
      id: 'test-503',
      name: '503 Test',
      site: 'MERCADO_LIVRE',
      searchUrl: 'https://httpstat.us/503',
      active: true
    };

    await expect(scrapeMercadoLivre(monitor)).rejects.toThrow();
  }, 120000);
});
```

**Checklist:**
- [ ] Simular timeout (httpstat.us/524)
- [ ] Simular 503 (httpstat.us/503)
- [ ] Validar retries (logs)
- [ ] Validar backoff exponencial

---

### 5.2 Bloqueios e Captchas

**Teste 5.2.1: Detecção de bloqueio**
```typescript
// worker/__tests__/resilience/blocking.test.ts
describe('Resilience: Blocking', () => {
  test('should detect when page returns no results', async () => {
    const monitor = {
      id: 'test-blocked',
      name: 'Blocked Test',
      site: 'MERCADO_LIVRE',
      searchUrl: 'https://lista.mercadolivre.com.br/produto-inexistente-xyz-abc-123',
      active: true
    };

    const ads = await scrapeMercadoLivre(monitor);

    // Página vazia != erro, mas retorna []
    expect(ads).toEqual([]);

    // Logs devem mostrar: "No results found or page structure changed"
  }, 60000);
});
```

**Checklist:**
- [ ] Testar URL inválida (página vazia)
- [ ] Validar retorno: [] (não erro)
- [ ] Logs informativos

---

### 5.3 Mudanças de HTML

**Teste 5.3.1: Parser robusto**
```typescript
// worker/__tests__/resilience/html-changes.test.ts
describe('Resilience: HTML Changes', () => {
  test('should handle missing optional fields', async () => {
    // Criar página HTML mockada sem imageUrl e location
    const mockPage = {
      $$eval: async (selector: string, fn: Function) => {
        return [{
          title: 'Test Product',
          price: 100,
          url: 'https://example.com/test',
          externalId: 'MLB123',
          // imageUrl: undefined,
          // location: undefined
        }];
      }
    };

    // Executar extração (mockada)
    // Deve retornar anúncio mesmo sem campos opcionais
  });
});
```

**Checklist:**
- [ ] Testar campos opcionais ausentes
- [ ] Validar que scraper não quebra
- [ ] Validar estrutura mínima (externalId, title, price, url)

---

## 6. TESTES MANUAIS (Checklist de Produção)

### 6.1 Deploy e Configuração

**Checklist Pré-Deploy:**
- [ ] worker/.env configurado
- [ ] DATABASE_URL válida (produção)
- [ ] TELEGRAM_BOT_TOKEN válida
- [ ] Playwright instalado: `npm run playwright:install`
- [ ] Build sem erros: `npm run build`
- [ ] Prisma client gerado: `npm run prisma:generate`

**Checklist Deploy (Render):**
- [ ] Serviço criado: tipo "Worker"
- [ ] Root directory: `worker`
- [ ] Build command: `npm install && npm run playwright:install && npm run build`
- [ ] Start command: `npm start`
- [ ] Env vars configuradas
- [ ] Deploy executado
- [ ] Logs mostram: "RadarOne Worker iniciado"
- [ ] Logs mostram: "Conectado ao banco de dados"

---

### 6.2 Validação End-to-End em Produção

**Teste Manual 6.2.1: Criar Monitor e Validar Alerta**

1. **Criar Usuário de Teste:**
   - Acessar frontend em produção
   - Registrar usuário com Telegram configurado

2. **Criar Monitor:**
   - Site: Mercado Livre
   - Nome: "iPhone 13 Teste"
   - URL: https://lista.mercadolivre.com.br/iphone-13
   - Filtros: R$ 2.000 - R$ 3.000
   - Salvar

3. **Aguardar Execução:**
   - Intervalo: 5 minutos (CHECK_INTERVAL_MINUTES)
   - Monitorar logs do worker no Render
   - Buscar: "Executando monitor: iPhone 13 Teste"

4. **Validar Logs:**
   ```
   ✅ Logs esperados:
   - "🔍 Executando monitor: iPhone 13 Teste (MERCADO_LIVRE)"
   - "📦 X anúncios encontrados"
   - "✨ Y anúncios novos"
   - "📤 Alerta enviado para chat XXXXXXXXX" (se newAds > 0)
   - "✅ Monitor executado com sucesso (Xms)"
   ```

5. **Validar Banco:**
   ```sql
   -- MonitorLog
   SELECT * FROM monitor_logs
   WHERE monitor_id = 'ID_DO_MONITOR'
   ORDER BY created_at DESC LIMIT 1;

   -- Deve ter: status = SUCCESS, ads_found > 0

   -- AdSeen
   SELECT COUNT(*) FROM ads_seen
   WHERE monitor_id = 'ID_DO_MONITOR';

   -- Deve ter: N registros (onde N = ads_found)
   ```

6. **Validar Telegram:**
   - Abrir app do Telegram
   - Verificar mensagem do bot
   - Formato esperado:
     ```
     🔔 Novo anúncio encontrado!

     📌 Monitor: iPhone 13 Teste

     📝 iPhone 13 128GB Azul
     💰 R$ 2.350,00
     📍 São Paulo - SP

     🔗 Ver anúncio
     ```

7. **Executar Novamente (Testar Dedup):**
   - Aguardar próximo ciclo (5 min)
   - Validar logs: "✨ 0 anúncios novos"
   - Validar Telegram: SEM nova mensagem
   - Validar banco: `new_ads = 0`, `alerts_sent = 0`

**Checklist:**
- [ ] Monitor criado
- [ ] Aguardado 5-10 minutos
- [ ] Logs verificados (SUCCESS)
- [ ] Banco verificado (MonitorLog, AdSeen)
- [ ] Telegram verificado (alerta recebido)
- [ ] Dedup verificado (segunda execução sem alerta)

---

### 6.3 Teste de Múltiplas Fontes

**Teste Manual 6.3.1: 8 Monitores (1 por fonte)**

Criar monitores para:
1. ✅ Mercado Livre
2. ✅ OLX
3. ✅ Webmotors
4. ✅ iCarros
5. ✅ Zap Imóveis
6. ✅ Viva Real
7. ✅ Imovelweb
8. ✅ Leilão (Superbid)

**Aguardar 1 ciclo e validar:**
- [ ] Todos executaram (8 logs no banco)
- [ ] Todos retornaram ads (ou [] se página vazia)
- [ ] Todos enviaram alertas (se newAds > 0)
- [ ] Tempo total < 5 minutos (capacidade)

---

## 7. MÉTRICAS E OBSERVABILIDADE

### 7.1 Métricas a Monitorar

**Performance:**
- Tempo médio por monitor (por site)
- Throughput: monitores/hora
- Taxa de sucesso/erro (%)

**Qualidade:**
- Anúncios extraídos/monitor (média)
- Taxa de deduplicação (%)
- Taxa de alertas enviados (%)

**Resiliência:**
- Taxa de retry (%)
- Timeouts/hora
- Circuit breaker opens/dia

**Capacidade:**
- Monitores ativos totais
- Fila de pendentes (se BullMQ)
- Worker uptime

### 7.2 Dashboard de Teste

```sql
-- Criar views para métricas

CREATE VIEW monitor_metrics AS
SELECT
  site,
  COUNT(*) as total_executions,
  AVG(execution_time) as avg_time_ms,
  AVG(ads_found) as avg_ads,
  SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END)::float / COUNT(*) as success_rate
FROM monitor_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY site;

-- Query de exemplo
SELECT * FROM monitor_metrics ORDER BY total_executions DESC;
```

**Checklist:**
- [ ] Criar queries de métricas
- [ ] Exportar para CSV (análise)
- [ ] Criar dashboard no Metabase/Grafana (opcional)

---

## 8. CHECKLIST FINAL DE ACEITAÇÃO

### 8.1 Funcionalidade

- [ ] Worker inicia sem erros
- [ ] Conecta ao banco de dados
- [ ] Busca monitores ativos
- [ ] Executa scrapers corretamente (8 fontes)
- [ ] Aplica filtros de preço
- [ ] Deduplica anúncios (externalId)
- [ ] Envia alertas via Telegram
- [ ] Registra logs (MonitorLog, UsageLog)
- [ ] Incrementa contador de consultas
- [ ] Atualiza lastCheckedAt
- [ ] Respeita rate limiting por site
- [ ] Faz retry com backoff exponencial
- [ ] Trata erros gracefully (não quebra)

### 8.2 Performance

- [ ] Processa ≥ 20 monitores em 5 minutos
- [ ] Tempo médio/monitor < 30 segundos
- [ ] Não ultrapassa rate limits (nenhum bloqueio)
- [ ] CPU < 80% (média)
- [ ] Memória < 1GB (média)

### 8.3 Confiabilidade

- [ ] Uptime > 99% (7 dias)
- [ ] Taxa de sucesso > 95%
- [ ] Alertas entregues em < 10 segundos após novo anúncio
- [ ] Zero alertas duplicados
- [ ] Zero crashes não tratados

### 8.4 Observabilidade

- [ ] Logs estruturados (JSON) no Render
- [ ] Sentry capturando erros (se integrado)
- [ ] Métricas exportáveis (SQL queries)
- [ ] Dashboard de admin com estatísticas

---

## 9. COMANDOS ÚTEIS

### Rodar Testes Localmente

```bash
# Todos os testes
cd worker/
npm test

# Testes unitários
npm test -- --testPathPattern=__tests__/unit

# Testes de integração (scrapers)
npm test -- --testPathPattern=__tests__/scrapers

# Teste específico
npm test mercadolivre

# E2E (requer banco de teste)
DATABASE_URL_TEST="postgresql://..." npm test e2e

# Com coverage
npm test -- --coverage
```

### Debug de Scrapers

```bash
# Executar scraper individual (debug)
cd worker/
npx ts-node-dev --respawn scripts/test-scraper.ts MERCADO_LIVRE "https://lista.mercadolivre.com.br/iphone-13"

# Ver rate limiter status
npx ts-node-dev scripts/rate-limit-status.ts

# Testar Telegram
npx ts-node-dev scripts/test-telegram.ts "CHAT_ID" "Mensagem de teste"
```

### Validar Banco

```sql
-- Monitores ativos
SELECT id, name, site, active, last_checked_at
FROM monitors
WHERE active = true
ORDER BY last_checked_at DESC NULLS LAST;

-- Logs recentes
SELECT
  ml.created_at,
  m.name,
  m.site,
  ml.status,
  ml.ads_found,
  ml.new_ads,
  ml.alerts_sent,
  ml.execution_time
FROM monitor_logs ml
JOIN monitors m ON ml.monitor_id = m.id
ORDER BY ml.created_at DESC
LIMIT 20;

-- Taxa de sucesso (últimas 24h)
SELECT
  site,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as success,
  ROUND(SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 2) as success_rate_pct
FROM monitor_logs ml
JOIN monitors m ON ml.monitor_id = m.id
WHERE ml.created_at > NOW() - INTERVAL '24 hours'
GROUP BY site;
```

---

## 10. CRONOGRAMA DE TESTES

| Fase | Atividade | Tempo | Responsável |
|------|-----------|-------|-------------|
| 1 | Testes Unitários (rate-limiter, retry) | 2h | Dev |
| 2 | Testes de Integração (scrapers) | 4h | Dev |
| 3 | Testes E2E (local) | 2h | Dev + QA |
| 4 | Deploy em staging | 1h | DevOps |
| 5 | Testes E2E (staging) | 2h | QA |
| 6 | Testes de carga (50 monitores) | 2h | DevOps |
| 7 | Deploy em produção | 1h | DevOps |
| 8 | Smoke tests (produção) | 1h | QA |
| 9 | Monitoramento (48h) | 2d | Todos |
| 10 | Revisão de métricas | 1h | PM + Dev |

**Total:** ~15 horas + 2 dias de monitoramento

---

**FIM DO TEST PLAN**

Todos os testes executados com sucesso = Worker pronto para produção ✅
