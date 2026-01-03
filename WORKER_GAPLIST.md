# WORKER GAP LIST - RadarOne
**Data:** 02/01/2026
**Status:** Priorizado e Acionável

---

## LEGENDA DE PRIORIDADES

- **P0 (CRÍTICO):** Bloqueia operação. Worker não funciona ou quebra em produção.
- **P1 (IMPORTANTE):** Afeta confiabilidade, estabilidade ou segurança. Deve ser resolvido em breve.
- **P2 (MELHORIA):** Incrementa performance, observabilidade ou experiência. Pode ser gradual.

---

## P0 - BLOQUEANTES (Resolver AGORA)

### GAP-001: Worker .env não configurado
**Status:** 🔴 BLOQUEANTE
**Arquivo:** `worker/.env`
**Problema:**
- `worker/.env` NÃO EXISTE (apenas .env.example)
- Worker não consegue conectar ao banco (DATABASE_URL)
- Worker não consegue enviar alertas (TELEGRAM_BOT_TOKEN)

**Impacto:**
- Worker NÃO PODE RODAR sem .env

**Solução:**
```bash
cd worker/
cp .env.example .env
# Editar .env com:
# - DATABASE_URL (copiar do backend/.env)
# - TELEGRAM_BOT_TOKEN (copiar do backend/.env)
# - CHECK_INTERVAL_MINUTES (manter 5)
```

**Checklist:**
- [ ] Criar `worker/.env`
- [ ] Configurar DATABASE_URL
- [ ] Configurar TELEGRAM_BOT_TOKEN
- [ ] Testar conexão: `cd worker && npm run dev`
- [ ] Validar logs: "Conectado ao banco de dados"

**Estimativa:** 5 minutos

---

### GAP-002: Worker não está deployado no Render
**Status:** 🔴 BLOQUEANTE
**Problema:**
- Não existe configuração de deploy para o worker
- Não há `render.yaml` na raiz
- Worker provavelmente NÃO ESTÁ RODANDO em produção

**Impacto:**
- Monitores não executam automaticamente
- Sistema não funciona end-to-end em produção

**Solução:**

**Opção A: Render Background Worker (Recomendado)**
1. Acessar painel do Render
2. Criar novo serviço: "Background Worker"
3. Configurações:
   - Nome: `radarone-worker`
   - Root Directory: `worker`
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Environment: Node
   - Plan: Starter (ou Free para testes)
4. Env vars:
   - `DATABASE_URL` (copiar do backend)
   - `TELEGRAM_BOT_TOKEN` (copiar do backend)
   - `CHECK_INTERVAL_MINUTES=5`
   - `NODE_ENV=production`

**Opção B: render.yaml (Infrastructure as Code)**

Criar `render.yaml` na raiz:
```yaml
services:
  # Backend API
  - type: web
    name: radarone-backend
    env: node
    rootDir: backend
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: JWT_SECRET
        sync: false
      - key: TELEGRAM_BOT_TOKEN
        sync: false

  # Worker de Monitoramento
  - type: worker
    name: radarone-worker
    env: node
    rootDir: worker
    buildCommand: npm install && npm run playwright:install && npm run build
    startCommand: npm start
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: TELEGRAM_BOT_TOKEN
        sync: false
      - key: CHECK_INTERVAL_MINUTES
        value: "5"
      - key: NODE_ENV
        value: production
```

**Checklist:**
- [ ] Criar serviço no Render (manual OU render.yaml)
- [ ] Configurar env vars
- [ ] Deploy e validar logs
- [ ] Confirmar que worker inicia: "RadarOne Worker iniciado"
- [ ] Confirmar execução de monitores (logs no Render)
- [ ] Verificar MonitorLog no banco (registros novos)

**Estimativa:** 30 minutos (manual) ou 15 minutos (render.yaml)

---

### GAP-003: Inconsistência Schema vs Scrapers
**Status:** 🔴 BLOQUEANTE
**Arquivos:**
- `backend/prisma/schema.prisma:296` (enum MonitorSite)
- `worker/src/scrapers/`

**Problema:**
1. **FACEBOOK_MARKETPLACE** está no enum mas scraper NÃO EXISTE
   - Frontend permite criar monitor → Worker falha
2. **LEILAO** tem scraper mas NÃO ESTÁ no enum
   - Usuário precisa usar "OUTRO" → confuso

**Impacto:**
- Frontend e Worker desalinhados
- Monitores criados para Facebook Marketplace quebram
- Leilões não aparecem como opção válida

**Solução:**

**Opção A: Adicionar LEILAO e remover FACEBOOK_MARKETPLACE**
```prisma
enum MonitorSite {
  MERCADO_LIVRE
  OLX
  WEBMOTORS
  ICARROS
  ZAP_IMOVEIS
  VIVA_REAL
  IMOVELWEB
  LEILAO        // ✅ ADICIONAR
  // FACEBOOK_MARKETPLACE  ❌ REMOVER (ou implementar scraper)
  OUTRO
}
```

**Opção B: Implementar Facebook Marketplace Scraper**
- Criar `worker/src/scrapers/facebook-scraper.ts`
- Adicionar caso no switch de monitor-runner.ts
- **PROBLEMA:** Facebook é hostil a scraping (requer login, anti-bot agressivo)
- **NÃO RECOMENDADO** para MVP

**Checklist:**
- [ ] Editar `backend/prisma/schema.prisma`
- [ ] Adicionar `LEILAO` ao enum
- [ ] Remover `FACEBOOK_MARKETPLACE` (ou comentar)
- [ ] Gerar migration: `cd backend && npx prisma migrate dev --name add-leilao-site`
- [ ] Deploy migration: `npx prisma migrate deploy` (produção)
- [ ] Atualizar frontend: opções de sites disponíveis
- [ ] Testar criação de monitor de Leilão

**Estimativa:** 20 minutos

---

### GAP-004: Capacidade do Worker não escala
**Status:** 🔴 BLOQUEANTE (para >20 monitores)
**Arquivo:** `worker/src/index.ts:78-83`

**Problema:**
- Monitores processados **sequencialmente** (for loop)
- Delay de 2s entre cada monitor
- Tempo médio por monitor: 10-30 segundos

**Cálculo de Capacidade:**
```
Intervalo: 5 minutos
Tempo por monitor: 12s (médio) + 2s delay = 14s
Capacidade: 300s / 14s = ~21 monitores

Se houver 100 monitores ativos:
  Tempo total: 100 * 14s = 1400s = 23 minutos
  Resultado: Intervalo de 5 min é IMPOSSÍVEL
```

**Impacto:**
- Worker trava com muitos monitores
- Atraso cresce linearmente
- Usuários não recebem alertas no intervalo esperado

**Solução:**

**Opção A: Aumentar intervalo (Quick Fix)**
```bash
# worker/.env
CHECK_INTERVAL_MINUTES=15  # Era 5
```
- Capacidade sobe para ~60 monitores
- Alertas menos frequentes (trade-off)

**Opção B: Implementar Fila (Escalável - RECOMENDADO)**

1. **Instalar BullMQ + Redis:**
```bash
cd worker/
npm install bullmq ioredis
```

2. **Criar Queue Manager:**
```typescript
// worker/src/services/queue-manager.ts
import { Queue, Worker } from 'bullmq';
import { MonitorRunner } from './monitor-runner';

const connection = { host: 'localhost', port: 6379 };

export const monitorQueue = new Queue('monitors', { connection });

export function startWorkers(concurrency = 5) {
  new Worker('monitors', async (job) => {
    const { monitor } = job.data;
    await MonitorRunner.run(monitor);
  }, { connection, concurrency });
}
```

3. **Modificar worker/src/index.ts:**
```typescript
async runMonitors() {
  const monitors = await prisma.monitor.findMany({ where: { active: true } });

  // Adiciona todos à fila
  for (const monitor of monitors) {
    await monitorQueue.add('process', { monitor }, {
      jobId: monitor.id,
      removeOnComplete: 1000,
      removeOnFail: 5000
    });
  }
}
```

4. **Deploy Redis no Render:**
- Adicionar Redis no render.yaml ou criar manualmente
- Configurar REDIS_URL no worker

**Checklist (Opção A - Quick Fix):**
- [ ] Aumentar CHECK_INTERVAL_MINUTES para 15-30 min
- [ ] Deploy e monitorar

**Checklist (Opção B - Escalável):**
- [ ] Instalar BullMQ + ioredis
- [ ] Criar queue-manager.ts
- [ ] Modificar index.ts para usar fila
- [ ] Deploy Redis no Render
- [ ] Configurar REDIS_URL
- [ ] Testar com múltiplos monitores
- [ ] Opcional: instalar Bull Board (dashboard)

**Estimativa:**
- Opção A: 5 minutos
- Opção B: 2-3 horas

---

## P1 - IMPORTANTES (Resolver em Breve)

### GAP-005: Captcha Solver existe mas não é usado
**Status:** 🟡 IMPORTANTE
**Arquivo:** `worker/src/utils/captcha-solver.ts`

**Problema:**
- Captcha solver implementado (2Captcha/Anti-Captcha)
- Nenhum scraper importa ou usa
- Se captcha aparecer → scraper falha silenciosamente

**Impacto:**
- Taxa de erro pode aumentar sem aviso
- Bloqueios por captcha não são tratados

**Solução:**

1. **Integrar em todos os scrapers:**

```typescript
// worker/src/scrapers/mercadolivre-scraper.ts
import { captchaSolver } from '../utils/captcha-solver';

async function scrapeMercadoLivreInternal(monitor) {
  // ... navegação ...

  // Detectar captcha
  const hasCaptcha = await page.evaluate(() => {
    return !!document.querySelector('.g-recaptcha, #g-recaptcha');
  });

  if (hasCaptcha && captchaSolver.isEnabled()) {
    console.log('🔐 Captcha detectado, resolvendo...');
    const result = await captchaSolver.solveRecaptchaV2(page);

    if (!result.success) {
      throw new Error(`Captcha não resolvido: ${result.error}`);
    }

    await page.waitForTimeout(2000); // Aguarda form submit
  }

  // ... extração ...
}
```

2. **Configurar .env:**
```env
CAPTCHA_SERVICE=2captcha
CAPTCHA_API_KEY=sua_chave_aqui
```

**Checklist:**
- [ ] Criar conta em 2captcha.com ou anti-captcha.com
- [ ] Adicionar CAPTCHA_SERVICE e CAPTCHA_API_KEY no .env
- [ ] Integrar em mercadolivre-scraper.ts
- [ ] Integrar em olx-scraper.ts
- [ ] Integrar em leilao-scraper.ts
- [ ] Testar com site que tem captcha
- [ ] Monitorar custos (captchas resolvidos)

**Estimativa:** 1 hora

---

### GAP-006: Sem sistema de login/sessão
**Status:** 🟡 IMPORTANTE (especialmente para leilões)
**Problema:**
- Scrapers navegam sem autenticação
- Cookies não persistem entre execuções
- Cada run = browser limpo

**Impacto:**
- **Leilões:** Alguns sites exigem login para ver lances
- **Mercado Livre:** Filtros avançados podem ser limitados
- **Performance:** Re-autentica a cada vez (se implementado)

**Solução:**

1. **Criar modelo BrowserSession:**
```prisma
model BrowserSession {
  id        String   @id @default(cuid())
  site      String   // MERCADO_LIVRE, OLX, LEILAO
  cookies   String   // JSON criptografado
  expiresAt DateTime
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([site])
  @@map("browser_sessions")
}
```

2. **Criar SessionManager:**
```typescript
// worker/src/utils/session-manager.ts
import { encrypt, decrypt } from './crypto';

export class SessionManager {
  async loadCookies(site: string, page: Page) {
    const session = await prisma.browserSession.findUnique({ where: { site } });

    if (!session || session.expiresAt < new Date()) {
      console.log('🔐 Sessão expirada ou inexistente, fazendo login...');
      await this.login(site, page);
      await this.saveCookies(site, page);
    } else {
      const cookies = JSON.parse(decrypt(session.cookies));
      await page.context().addCookies(cookies);
      console.log('✅ Cookies carregados');
    }
  }

  async login(site: string, page: Page) {
    // Implementar login por site
    switch(site) {
      case 'LEILAO':
        await this.loginLeilao(page);
        break;
      // ...
    }
  }

  async saveCookies(site: string, page: Page) {
    const cookies = await page.context().cookies();
    const encrypted = encrypt(JSON.stringify(cookies));

    await prisma.browserSession.upsert({
      where: { site },
      create: { site, cookies: encrypted, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      update: { cookies: encrypted, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
    });
  }
}
```

3. **Usar nos scrapers:**
```typescript
// worker/src/scrapers/leilao-scraper.ts
import { sessionManager } from '../utils/session-manager';

await page.goto(monitor.searchUrl);
await sessionManager.loadCookies('LEILAO', page);
```

**Checklist:**
- [ ] Criar migration para BrowserSession
- [ ] Implementar crypto.ts (encrypt/decrypt com AES-256)
- [ ] Criar SessionManager
- [ ] Implementar login para cada site que precisa
- [ ] Integrar em scrapers relevantes
- [ ] Testar login + persistência
- [ ] Documentar credenciais (onde guardar?)

**Estimativa:** 3-4 horas

---

### GAP-007: Sem Circuit Breaker por domínio
**Status:** 🟡 IMPORTANTE
**Problema:**
- Se um domínio bloquear, worker continua tentando indefinidamente
- Desperdiça queries e tempo
- Não há cooldown automático

**Impacto:**
- Rate limit do site pode ser atingido repetidamente
- Logs poluídos com erros do mesmo site
- Usuários não recebem alertas de outros monitores enquanto site bloqueado trava

**Solução:**

```typescript
// worker/src/utils/circuit-breaker.ts
interface CircuitState {
  failures: number;
  lastFailure: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

class CircuitBreaker {
  private circuits = new Map<string, CircuitState>();
  private threshold = 5; // 5 falhas consecutivas
  private timeout = 15 * 60 * 1000; // 15 minutos de cooldown

  async execute<T>(domain: string, fn: () => Promise<T>): Promise<T> {
    const circuit = this.getCircuit(domain);

    if (circuit.state === 'OPEN') {
      const elapsed = Date.now() - circuit.lastFailure;

      if (elapsed < this.timeout) {
        throw new Error(`Circuit breaker OPEN for ${domain}. Wait ${Math.round((this.timeout - elapsed) / 1000)}s`);
      }

      circuit.state = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      this.onSuccess(domain);
      return result;
    } catch (error) {
      this.onFailure(domain);
      throw error;
    }
  }

  private onSuccess(domain: string) {
    const circuit = this.getCircuit(domain);
    circuit.failures = 0;
    circuit.state = 'CLOSED';
  }

  private onFailure(domain: string) {
    const circuit = this.getCircuit(domain);
    circuit.failures++;
    circuit.lastFailure = Date.now();

    if (circuit.failures >= this.threshold) {
      circuit.state = 'OPEN';
      console.log(`🚨 Circuit breaker OPEN for ${domain} (${circuit.failures} failures)`);
    }
  }

  private getCircuit(domain: string): CircuitState {
    if (!this.circuits.has(domain)) {
      this.circuits.set(domain, { failures: 0, lastFailure: 0, state: 'CLOSED' });
    }
    return this.circuits.get(domain)!;
  }
}

export const circuitBreaker = new CircuitBreaker();
```

**Uso:**
```typescript
// worker/src/services/monitor-runner.ts
import { circuitBreaker } from '../utils/circuit-breaker';

const ads = await circuitBreaker.execute(monitor.site, () => this.scrape(monitor));
```

**Checklist:**
- [ ] Implementar circuit-breaker.ts
- [ ] Integrar em monitor-runner.ts
- [ ] Configurar threshold e timeout (env vars?)
- [ ] Testar com site que bloqueia
- [ ] Adicionar métrica de circuit state por site
- [ ] Alertar admin quando circuit abre

**Estimativa:** 2 horas

---

### GAP-008: Worker sem Sentry
**Status:** 🟡 IMPORTANTE
**Problema:**
- Backend tem Sentry (server.ts:12)
- Worker NÃO TEM Sentry
- Erros no worker não são rastreados

**Impacto:**
- Debugging difícil em produção
- Sem visibilidade de crashes
- Sem contexto de erros

**Solução:**

```bash
cd worker/
npm install @sentry/node
```

```typescript
// worker/src/monitoring/sentry.ts
import * as Sentry from '@sentry/node';

export function initSentry() {
  if (process.env.NODE_ENV !== 'production') return;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });

  console.log('✅ Sentry initialized');
}
```

```typescript
// worker/src/index.ts
import { initSentry } from './monitoring/sentry';
initSentry();

// ... resto do código

try {
  await MonitorRunner.run(monitor);
} catch (error) {
  Sentry.captureException(error, {
    tags: { monitorId: monitor.id, site: monitor.site }
  });
  console.error('❌ Erro:', error);
}
```

**Checklist:**
- [ ] Instalar @sentry/node
- [ ] Criar monitoring/sentry.ts
- [ ] Inicializar no index.ts
- [ ] Adicionar SENTRY_DSN ao .env
- [ ] Capturar exceções em pontos críticos
- [ ] Testar envio de erro para Sentry
- [ ] Configurar alertas no Sentry

**Estimativa:** 30 minutos

---

### GAP-009: Logs não estruturados no worker
**Status:** 🟡 IMPORTANTE
**Problema:**
- Worker usa console.log (não estruturado)
- Backend usa Pino (estruturado)
- Difícil parsear logs do worker

**Impacto:**
- Debugging difícil
- Logs no Render sem estrutura
- Não há campos padronizados (requestId, monitorId, etc.)

**Solução:**

```bash
cd worker/
npm install pino pino-pretty
```

```typescript
// worker/src/utils/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: { colorize: true }
  } : undefined
});
```

**Uso:**
```typescript
// worker/src/index.ts
import { logger } from './utils/logger';

logger.info({ monitorsCount: monitors.length }, 'Monitores ativos encontrados');
logger.error({ err: error, monitorId: monitor.id }, 'Erro ao executar monitor');
```

**Checklist:**
- [ ] Instalar pino + pino-pretty
- [ ] Criar utils/logger.ts
- [ ] Substituir console.log por logger.info/error/warn
- [ ] Adicionar campos contextuais (monitorId, site, userId)
- [ ] Testar logs estruturados

**Estimativa:** 1 hora

---

## P2 - MELHORIAS (Resolver Gradualmente)

### GAP-010: User-Agent fixo
**Status:** 🟢 MELHORIA
**Problema:**
- Todos os scrapers usam mesmo UA
- Padrão detectável

**Solução:**
```typescript
// worker/src/utils/user-agents.ts
export const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...',
  'Mozilla/5.0 (X11; Linux x86_64)...',
  // ...
];

export function randomUA() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}
```

**Estimativa:** 30 minutos

---

### GAP-011: Sem screenshots em caso de erro
**Status:** 🟢 MELHORIA
**Problema:**
- Quando parser falha, não há evidência visual
- Debugging depende de reproduzir erro

**Solução:**
```typescript
// Em catch de scrapers
await page.screenshot({ path: `/tmp/error-${monitor.id}-${Date.now()}.png` });
// Upload para S3 ou armazenar em base64 no log
```

**Estimativa:** 1 hora

---

### GAP-012: Sem métricas agregadas
**Status:** 🟢 MELHORIA
**Problema:**
- MonitorLog tem dados brutos
- Não há dashboard de performance

**Solução:**
- Implementar endpoint /admin/metrics
- Agregações:
  - Taxa de sucesso por site (últimos 7 dias)
  - Tempo médio de execução por site
  - Anúncios novos por dia (gráfico)
  - Top monitores (mais ativos)

**Estimativa:** 3 horas

---

### GAP-013: Sem alertas de falha do worker
**Status:** 🟢 MELHORIA
**Problema:**
- Se worker parar, admin não sabe
- Sem healthcheck ativo

**Solução:**
- Criar endpoint /health no worker (Express mini-server)
- Render pinga /health a cada 5min
- Se falhar → alerta no Sentry ou email

**Estimativa:** 1 hora

---

### GAP-014: Sem canais alternativos de alerta
**Status:** 🟢 MELHORIA
**Problema:**
- Apenas Telegram implementado
- Usuários podem preferir email, WhatsApp, push

**Solução:**
- Email: Usar serviço do backend (Resend)
- WhatsApp: Integrar com Twilio ou Evolution API
- Push: Usar web-push (backend já tem)

**Estimativa:** 2-4 horas cada canal

---

### GAP-015: Sem proxy/VPN support
**Status:** 🟢 MELHORIA
**Problema:**
- Todas as requisições vêm do mesmo IP (worker)
- Bloqueios afetam todos os monitores

**Solução:**
- Integrar com serviço de proxy (Bright Data, Oxylabs, etc.)
- Rotação de IP por requisição

**Estimativa:** 3 horas

---

## CHECKLIST GERAL DE EXECUÇÃO

### Fase 1: Operacional (P0 - 1 hora)
- [ ] GAP-001: Criar worker/.env
- [ ] GAP-002: Deploy worker no Render
- [ ] GAP-003: Sincronizar schema (LEILAO)
- [ ] GAP-004: Aumentar intervalo (quick fix) OU implementar fila

### Fase 2: Confiabilidade (P1 - 1 semana)
- [ ] GAP-005: Integrar captcha solver
- [ ] GAP-006: Implementar SessionManager (opcional)
- [ ] GAP-007: Circuit breaker
- [ ] GAP-008: Sentry no worker
- [ ] GAP-009: Logger estruturado

### Fase 3: Otimização (P2 - Contínuo)
- [ ] GAP-010: Rotação de UA
- [ ] GAP-011: Screenshots de erro
- [ ] GAP-012: Dashboard de métricas
- [ ] GAP-013: Healthcheck
- [ ] GAP-014: Canais alternativos
- [ ] GAP-015: Proxy support

---

## ESTIMATIVA TOTAL

| Fase | Prioridade | Tempo |
|------|-----------|-------|
| Fase 1 | P0 | 1-4 horas |
| Fase 2 | P1 | 8-12 horas |
| Fase 3 | P2 | 20+ horas |

**Mínimo viável (P0):** 1 hora
**Produção confiável (P0 + P1):** 10-16 horas
**Completo (P0 + P1 + P2):** 30+ horas

---

**FIM DA GAP LIST**

Próximo documento: WORKER_TEST_PLAN.md
