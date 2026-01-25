# RadarOne - Auditoria Técnica de Arquitetura

**Versão:** 1.0
**Data:** 24 de Janeiro de 2026
**Autor:** Claude Code (Auditoria Automatizada)
**Classificação:** Documento Técnico Interno

---

## Sumário

1. [Visão Arquitetural Geral](#1-visão-arquitetural-geral)
2. [Estrutura do Repositório](#2-estrutura-do-repositório)
3. [Frontend - Análise Profunda](#3-frontend---análise-profunda)
4. [Backend API - Análise Profunda](#4-backend-api---análise-profunda)
5. [Worker - Análise Profunda](#5-worker---análise-profunda)
6. [Autenticação, Sessão e Segurança](#6-autenticação-sessão-e-segurança)
7. [Jobs e Background Processing](#7-jobs-e-background-processing)
8. [Integrações Externas](#8-integrações-externas)
9. [Infraestrutura e Deploy](#9-infraestrutura-e-deploy)
10. [Banco de Dados](#10-banco-de-dados)
11. [Padrões, Qualidade e Manutenibilidade](#11-padrões-qualidade-e-manutenibilidade)
12. [Problemas Técnicos Conhecidos](#12-problemas-técnicos-conhecidos)
13. [Dívida Técnica e Próximos Passos](#13-dívida-técnica-e-próximos-passos)
14. [Avaliação Final](#14-avaliação-final)

---

## 1. Visão Arquitetural Geral

### 1.1 Tipo de Sistema

**Classificação:** SaaS B2C com Background Processing
- **Multi-tenant:** Sim (dados isolados por userId)
- **Event-driven:** Parcial (webhooks Kiwify/Telegram, jobs cron)
- **Stateless API:** Sim (JWT, sem sessão server-side)

### 1.2 Contexto de Negócio

RadarOne é uma plataforma de monitoramento de anúncios em marketplaces. O sistema precisa:
- Executar scraping periódico de múltiplos sites
- Processar alto volume de monitores (potencialmente milhares)
- Entregar notificações em tempo quasi-real
- Gerenciar sessões autenticadas de sites terceiros

### 1.3 Diagrama Arquitetural

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USUÁRIO FINAL                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React + Vite)                              │
│  radarone.com.br                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                     │
│  │ Pages    │  │ Context  │  │ Services │  │Components│                     │
│  │ (34)     │  │ (Auth)   │  │ (API)    │  │ (Guards) │                     │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘                     │
│                           Chakra UI + React Router v7                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                              HTTPS + JWT
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BACKEND API (Node.js + Express)                       │
│  api.radarone.com.br                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │Controllers│ │Services  │  │Middleware│  │  Jobs    │  │  Utils   │      │
│  │   (14)   │  │  (13)    │  │   (5)    │  │   (8)    │  │  (10)    │      │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘      │
│                          Prisma ORM + JWT + Rate Limiting                    │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
              ▼                  ▼                  ▼
┌─────────────────────┐ ┌───────────────┐ ┌────────────────────┐
│     PostgreSQL      │ │    Redis      │ │     WORKER         │
│       (Neon)        │ │  (Opcional)   │ │   (Playwright)     │
│  ┌───────────────┐  │ │  ┌─────────┐  │ │  ┌──────────────┐  │
│  │ 17 Models     │  │ │  │ BullMQ  │  │ │  │ 8 Scrapers   │  │
│  │ + Indexes     │  │ │  │ Queues  │  │ │  │ + Services   │  │
│  └───────────────┘  │ │  └─────────┘  │ │  │ + Resiliência│  │
└─────────────────────┘ └───────────────┘ │  └──────────────┘  │
                                          └────────────────────┘
                                                   │
                                    ┌──────────────┼──────────────┐
                                    │              │              │
                                    ▼              ▼              ▼
                              ┌──────────┐  ┌──────────┐  ┌──────────┐
                              │ Telegram │  │  Email   │  │  Sites   │
                              │   Bot    │  │ (Resend) │  │ (ML,OLX) │
                              └──────────┘  └──────────┘  └──────────┘
```

### 1.4 Métricas do Sistema

| Componente | Arquivos | Linhas de Código | Linguagem |
|------------|----------|------------------|-----------|
| Frontend   | 48 TSX + 20 TS | ~18.000 | TypeScript |
| Backend    | 77 TS | ~19.300 | TypeScript |
| Worker     | 45 TS | ~8.500 | TypeScript |
| **Total**  | **190** | **~45.800** | TypeScript |

---

## 2. Estrutura do Repositório

### 2.1 Mapa de Diretórios

```
RadarOne/
├── frontend/                      # Aplicação React
│   ├── src/
│   │   ├── components/           # Componentes reutilizáveis
│   │   │   ├── admin/           # Componentes específicos admin
│   │   │   └── ui/              # Primitivos UI
│   │   ├── context/             # Estado global (AuthContext)
│   │   ├── hooks/               # Hooks customizados
│   │   ├── lib/                 # Utilitários (auth, logout, analytics)
│   │   ├── pages/               # 34 páginas
│   │   ├── services/            # API client, auth
│   │   ├── utils/               # Helpers
│   │   └── router.tsx           # Definição de rotas
│   └── package.json
│
├── backend/                       # API Express
│   ├── src/
│   │   ├── controllers/         # 14 controllers
│   │   ├── services/            # 13 services (lógica de negócio)
│   │   ├── middlewares/         # 5 middlewares
│   │   ├── routes/              # 16 arquivos de rotas
│   │   ├── jobs/                # 8 jobs agendados
│   │   ├── utils/               # Helpers (crypto, logger)
│   │   ├── errors/              # AppError class
│   │   ├── constants/           # ErrorCodes
│   │   └── server.ts            # Entry point
│   ├── prisma/
│   │   └── schema.prisma        # 17 models
│   └── package.json
│
├── worker/                        # Serviço de scraping
│   ├── src/
│   │   ├── scrapers/            # 8 scrapers específicos
│   │   ├── services/            # queue-manager, monitor-runner
│   │   ├── auth/                # Autenticação de sites
│   │   ├── utils/               # rate-limiter, retry, circuit-breaker
│   │   ├── worker.ts            # Loop principal
│   │   └── bootstrap.ts         # Inicialização Playwright
│   └── package.json
│
├── docs/                          # Documentação
├── render.yaml                    # Deploy configuration
└── README.md
```

### 2.2 Responsabilidades por Módulo

| Pasta | Responsabilidade | Observações |
|-------|------------------|-------------|
| `frontend/src/context` | Estado global de autenticação | Context API, sem Redux |
| `frontend/src/services` | Comunicação HTTP | Retry, timeout, error handling |
| `backend/src/controllers` | HTTP handlers | Validação básica, delegação |
| `backend/src/services` | Lógica de negócio | Regras canônicas |
| `backend/src/middlewares` | Cross-cutting concerns | Auth, rate limit, errors |
| `backend/src/jobs` | Background tasks | Cron com node-cron |
| `worker/src/scrapers` | Extração de dados | Playwright + seletores CSS |
| `worker/src/utils` | Resiliência | Circuit breaker, retry, rate limit |

---

## 3. Frontend - Análise Profunda

### 3.1 Stack Tecnológica

| Tecnologia | Versão | Propósito |
|------------|--------|-----------|
| React | 19.2.0 | Framework UI |
| TypeScript | 5.9.3 | Type safety |
| Vite | 7.2.4 | Build tool |
| React Router | 7.10.0 | Roteamento |
| Chakra UI | 2.10.9 | Componentes UI |
| Axios | 1.13.2 | HTTP client |
| Zod | 4.1.13 | Validação |
| Sentry | 10.30.0 | Error tracking |

### 3.2 Arquitetura de Estado

```
┌─────────────────────────────────────────────────────────┐
│                    AuthContext                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │  user: User | null                              │    │
│  │  loading: boolean                               │    │
│  │  authStep: NONE | TWO_FACTOR_REQUIRED |         │    │
│  │            AUTHENTICATED                        │    │
│  │  login() / logout() / register() / refetch()   │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Estado Local (por página)                   │
│  - Monitores, planos, configurações                     │
│  - Sem cache global (sem React Query/SWR)               │
└─────────────────────────────────────────────────────────┘
```

**Decisão Técnica:** Context API ao invés de Redux/Zustand
- **Prós:** Simplicidade, menos boilerplate
- **Contras:** Sem caching, sem devtools avançados
- **Avaliação:** Adequado para escopo atual

### 3.3 Comunicação com API

**Arquivo:** `frontend/src/services/api.ts` (277 linhas)

```typescript
// Padrão implementado
const api = {
  get<T>(path, token?): Promise<T>,
  post<T>(path, body?, token?): Promise<T>,
  request<T>(path, options): Promise<T>,
  requestWithRetry<T>(path, options): Promise<T>,  // Para cold start
};
```

**Características:**
- Timeout: 30s (padrão), 45s (com retry)
- Retry: 3 tentativas, backoff exponencial (1.5s, 3s, 6s)
- Auto-logout: Em 401 + INVALID_TOKEN
- Subscription redirect: Em 403 + TRIAL_EXPIRED

**Risco Identificado:** Token em localStorage (vulnerável a XSS)

### 3.4 Proteção de Rotas

| Componente | Função | Validação |
|------------|--------|-----------|
| `ProtectedRoute` | Autenticação básica | user != null |
| `RequireSubscriptionRoute` | Subscription válida | getSubscriptionStatus() |
| `AdminProtectedRoute` | Role admin | Fetch /admin/stats |
| `RedirectIfAuthenticated` | Evita acesso a /login | Redireciona se logado |

**Risco:** AdminProtectedRoute faz fetch a cada mount (sem cache)

### 3.5 Pontos Fortes

1. **Error handling robusto** - Diferencia timeout, rede, HTTP
2. **Cold start handling** - Retry automático para Render
3. **Type guards** - Discriminação de tipos (isTwoFactorRequired)
4. **Code splitting** - Admin pages com lazy loading

### 3.6 Dívida Técnica

| Item | Severidade | Recomendação |
|------|------------|--------------|
| Sem cache de dados | Alta | Implementar React Query |
| Token em localStorage | Alta | Considerar HTTP-only cookies |
| AdminProtectedRoute sem cache | Média | Cachear role 5min |
| subscriptions: any[] | Baixa | Tipar corretamente |

---

## 4. Backend API - Análise Profunda

### 4.1 Stack Tecnológica

| Tecnologia | Versão | Propósito |
|------------|--------|-----------|
| Node.js | 20+ | Runtime |
| Express | 5.2.1 | Framework HTTP |
| TypeScript | 5.9.3 | Type safety |
| Prisma | 7.1.0 | ORM |
| JWT | 9.0.3 | Autenticação |
| bcrypt | 6.0.0 | Hash de senhas |
| node-cron | 4.2.1 | Agendamento |
| Pino | 10.1.0 | Logging |

### 4.2 Arquitetura em Camadas

```
┌─────────────────────────────────────────────────────────┐
│                      Routes                              │
│  Definição de endpoints e middlewares por rota          │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    Controllers                           │
│  - Validação de input (básica)                          │
│  - Delegação para services                              │
│  - Formatação de response                               │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                     Services                             │
│  - Lógica de negócio                                    │
│  - Validações complexas                                 │
│  - Orquestração de operações                            │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                  Prisma (Repository)                     │
│  - Data access                                          │
│  - Queries otimizadas                                   │
└─────────────────────────────────────────────────────────┘
```

### 4.3 Error Handling Padronizado

**Arquivo:** `backend/src/errors/AppError.ts`

```typescript
export class AppError extends Error {
  statusCode: number;
  errorCode: ErrorCode;
  details?: any;

  // Factory methods
  static invalidToken(): AppError
  static trialExpired(): AppError
  static validationError(msg, details): AppError
  // ...
}
```

**Middleware:** `errorHandler.middleware.ts`
- Sempre retorna: `{ errorCode, message, details? }`
- Mascaramento em produção
- Log estruturado com Pino

### 4.4 Autenticação

```
┌─────────────────────────────────────────────────────────┐
│                    Fluxo de Login                        │
│                                                          │
│  1. POST /auth/login (email, password)                  │
│     └─ Rate limit: 10/15min                             │
│                                                          │
│  2. Valida credenciais (bcrypt)                         │
│     └─ Se 2FA habilitado → tempToken (5min)             │
│     └─ Senão → JWT final (7d)                           │
│                                                          │
│  3. POST /auth/2fa/verify (tempToken, code)             │
│     └─ Valida TOTP ou backup code                       │
│     └─ Retorna JWT final                                │
└─────────────────────────────────────────────────────────┘
```

### 4.5 Função Canônica - Exemplo de Excelência

**Arquivo:** `backend/src/services/subscriptionService.ts`

```typescript
/**
 * REGRAS DE PRIORIDADE:
 * 1. Subscription VITALÍCIA + ACTIVE → SEMPRE válida
 * 2. ACTIVE com validUntil >= now
 * 3. TRIAL com trialEndsAt >= now
 * 4. Caso contrário: null
 */
export async function getCurrentSubscriptionForUser(
  userId: string
): Promise<SubscriptionWithPlan | null>
```

**Por que é excelente:**
- Documentação clara das regras
- Fonte única de verdade
- Reutilizável em múltiplos contextos
- Edge cases documentados

### 4.6 Endpoints por Categoria

| Categoria | Quantidade | Autenticação |
|-----------|------------|--------------|
| Auth | 13 | Público/JWT |
| Monitors | 6 | JWT + Subscription |
| Subscriptions | 5 | JWT |
| Admin | 25+ | JWT + Admin Role |
| Webhooks | 2 | HMAC/Secret |
| Telegram | 10 | Público/JWT |
| Notificações | 5 | JWT |

### 4.7 Dívida Técnica Backend

| Item | Severidade | Evidência |
|------|------------|-----------|
| 394 console.log | Alta | Grep no código |
| 225 usos de `any` | Alta | TypeScript analysis |
| Sem validação declarativa | Média | Zod não usado em controllers |
| Lógica em controllers | Média | auth.controller tem 1.134 linhas |

---

## 5. Worker - Análise Profunda

### 5.1 Arquitetura de Processamento

```
┌─────────────────────────────────────────────────────────┐
│                    TICK (1 minuto)                       │
│  1. Busca monitores ativos                              │
│  2. Filtra elegíveis (lastCheckedAt + interval)         │
│  3. Enfileira ou processa                               │
└────────────────────────┬────────────────────────────────┘
                         │
          ┌──────────────┴──────────────┐
          │                             │
     ┌────▼────┐                  ┌─────▼─────┐
     │ BullMQ  │                  │   LOOP    │
     │ (Redis) │                  │(Sequencial)│
     │ 5 workers│                  │ 2s delay  │
     └────┬────┘                  └─────┬─────┘
          │                             │
          └──────────────┬──────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│               MonitorRunner.run(monitor)                 │
│  1. Valida sessão do usuário (se necessário)            │
│  2. Aplica circuit breaker                              │
│  3. Executa scraper apropriado                          │
│  4. Filtra anúncios novos                               │
│  5. Envia notificações                                  │
│  6. Atualiza banco                                      │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Scrapers Implementados

| Scraper | Tamanho | Complexidade | Auth Necessária |
|---------|---------|--------------|-----------------|
| Mercado Livre | 848 linhas | Alta | Sim (sessão) |
| OLX | ~200 linhas | Média | Não |
| Webmotors | ~200 linhas | Média | Não |
| iCarros | ~200 linhas | Média | Não |
| Zap Imóveis | ~200 linhas | Média | Não |
| Viva Real | ~200 linhas | Média | Não |
| ImovelWeb | ~200 linhas | Média | Não |
| Leilão | ~400 linhas | Alta | Opcional |

### 5.3 Padrões de Resiliência

#### Circuit Breaker
```
CLOSED ──(5 falhas)──► OPEN ──(15min)──► HALF_OPEN ──(sucesso)──► CLOSED
                                              │
                                              └──(falha)──► OPEN
```

#### Rate Limiting (Token Bucket)
| Site | Tokens/Min | Max Burst |
|------|-----------|-----------|
| Mercado Livre | 10 | 20 |
| OLX | 15 | 30 |
| Leilão | 5 | 10 |

#### Retry com Backoff
```typescript
retryPresets.scraping = {
  maxAttempts: 7,
  initialDelay: 3000,
  maxDelay: 30000,
  backoffFactor: 2
}
```

### 5.4 Autenticação em Cascata (Mercado Livre)

```
Prioridade 0: UserSession do banco (userId)
     ↓ falha
Prioridade A: Secret File (ML_STORAGE_STATE_PATH)
     ↓ falha
Prioridade B: ENV base64 (ML_STORAGE_STATE_B64)
     ↓ falha
Prioridade C: Session Manager (userDataDir)
     ↓ falha
Fallback: Contexto anônimo
```

### 5.5 Gargalos de Escalabilidade

| Gargalo | Impacto | Solução |
|---------|---------|---------|
| Browser por request | 100-200MB RAM cada | Implementar pool |
| Loop sequencial | 100 monitores/hora | Usar BullMQ obrigatório |
| Duplo retry | 21 tentativas por job | Remover retry interno |
| Rate limit global | Um usuário bloqueia outros | Rate limit por usuário |
| Sem índice | Full table scan | Criar índice composto |

### 5.6 Throughput Estimado

| Modo | Workers | Throughput |
|------|---------|-----------|
| Loop | 1 | ~100/hora |
| BullMQ | 5 | ~600-900/hora |
| BullMQ | 10 | ~1.200-1.800/hora |
| Otimizado | 10 | ~2.000-3.000/hora |

---

## 6. Autenticação, Sessão e Segurança

### 6.1 Estratégia JWT

| Aspecto | Configuração |
|---------|--------------|
| Secret | JWT_SECRET (env) |
| Expiração | 7 dias |
| Payload | { userId: string } |
| Armazenamento (FE) | localStorage |

**Risco:** Token em localStorage vulnerável a XSS

### 6.2 Fluxo 2FA

```
1. Login (email + senha)
   ↓
2. Se 2FA habilitado:
   - Retorna tempToken (5 min)
   - authStep: TWO_FACTOR_REQUIRED
   ↓
3. POST /2fa/verify (tempToken + code)
   - Valida TOTP (Google Authenticator)
   - OU valida backup code
   ↓
4. Retorna JWT final (7 dias)
   - authStep: AUTHENTICATED
```

### 6.3 Sessão de Sites Externos

```
┌─────────────────────────────────────────────────────────┐
│                   UserSession (DB)                       │
│                                                          │
│  userId + site + domain                                 │
│  ┌─────────────────────────────────────────────────┐    │
│  │ encryptedStorageState (AES-256-GCM)             │    │
│  │ status: ACTIVE | EXPIRED | NEEDS_REAUTH         │    │
│  │ expiresAt, lastUsedAt                           │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### 6.4 Proteções Implementadas

| Proteção | Status | Localização |
|----------|--------|-------------|
| bcrypt (senhas) | ✅ | auth.controller.ts |
| AES-256-GCM (CPF) | ✅ | crypto.ts |
| Rate limiting | ✅ | rateLimit.middleware.ts |
| CORS restritivo | ✅ | server.ts |
| Error masking (prod) | ✅ | errorHandler.middleware.ts |
| 2FA (TOTP) | ✅ | auth.controller.ts |
| Audit logs | ✅ | AuditLog model |

---

## 7. Jobs e Background Processing

### 7.1 Lista de Jobs

| Job | Frequência | Horário | Função |
|-----|------------|---------|--------|
| warmupPing | 10 min | - | Evita cold start Render |
| checkTrialExpiring | Diário | 09:00 | Notifica trials |
| checkSubscriptionExpired | Diário | 10:00 | Marca expirados |
| resetMonthlyQueries | 1º/mês | 03:00 | Reset contadores |
| checkCouponAlerts | Diário | 11:00 | Alertas de cupons |
| checkTrialUpgradeExpiring | Diário | 12:00 | Cupons expirando |
| checkAbandonedCoupons | Diário | 13:00 | Email cupom abandonado |
| checkSessionExpiring | Diário | 14:00 | Sessões ML expirando |

### 7.2 Contrato de Retorno

```typescript
interface JobRunResult {
  processedCount: number;
  successCount: number;
  errorCount: number;
  summary: string;
  metadata?: Record<string, any>;
}
```

### 7.3 Observabilidade

- **Registro:** Todas as execuções salvam em `JobRun`
- **Visualização:** /admin/jobs
- **Alertas:** AdminAlert para falhas
- **Sentry:** Captura exceções não tratadas

---

## 8. Integrações Externas

### 8.1 Telegram

| Aspecto | Detalhe |
|---------|---------|
| Tipo | Bot API + Webhook |
| Fluxo | Gera token → Deep link → User clica → Webhook recebe |
| Armazenamento | TelegramAccount + NotificationSettings |
| Notificações | Alertas de novos anúncios |

### 8.2 Kiwify

| Aspecto | Detalhe |
|---------|---------|
| Tipo | Checkout redirect + Webhooks |
| Eventos | compra_aprovada, subscription_renewed, chargeback |
| Validação | HMAC SHA256 |
| Fluxo | Gera URL → Redirect → Pagamento → Webhook ativa |

### 8.3 Resend (Email)

| Aspecto | Detalhe |
|---------|---------|
| Tipo | REST API |
| Templates | Welcome, trial expiring, alertas, cupons |
| Backoff | 30 min após 3+ erros |

### 8.4 Mercado Livre

| Aspecto | Detalhe |
|---------|---------|
| Tipo | StorageState (não OAuth) |
| Autenticação | Upload de cookies/localStorage |
| Validade | ~30 dias |
| Criptografia | AES-256-CBC |

---

## 9. Infraestrutura e Deploy

### 9.1 Ambiente Render

| Serviço | Tipo | Plano | Região |
|---------|------|-------|--------|
| radarone-backend | Web Service | Starter | Oregon |
| radarone-worker | Background Worker | Starter | Oregon |
| PostgreSQL | Externo (Neon) | - | - |
| Redis | Opcional | - | - |

### 9.2 Cold Start

**Problema:** Render free/starter dorme após 15 min inatividade
**Mitigação:**
- Job warmupPing a cada 10 min
- Frontend retry com backoff (3 tentativas, 45s timeout)

### 9.3 Variáveis de Ambiente

**Críticas (Backend):**
```
DATABASE_URL
JWT_SECRET
TELEGRAM_BOT_TOKEN
RESEND_API_KEY
KIWIFY_WEBHOOK_SECRET
CPF_ENCRYPTION_KEY
```

**Críticas (Worker):**
```
DATABASE_URL
PLAYWRIGHT_BROWSERS_PATH
TELEGRAM_BOT_TOKEN
REDIS_URL (opcional)
```

### 9.4 Observabilidade

| Ferramenta | Uso |
|------------|-----|
| Sentry | Error tracking |
| Pino | Structured logging |
| /health | Health check |
| JobRun | Histórico de jobs |
| AdminAlert | Alertas internos |

---

## 10. Banco de Dados

### 10.1 Modelo Lógico Principal

```
User (1) ──────────── (N) Subscription
  │                         │
  │                         └──── Plan
  │
  ├── (N) Monitor ──── (N) AdSeen
  │         │
  │         └──── (N) MonitorLog
  │
  ├── (N) TelegramAccount
  ├── (1) NotificationSettings
  ├── (N) UserSession
  └── (N) UsageLog
```

### 10.2 Tabelas Principais

| Tabela | Registros Esperados | Índices Críticos |
|--------|---------------------|------------------|
| users | ~10.000 | email (unique) |
| monitors | ~50.000 | (userId), (active, lastCheckedAt) |
| ads_seen | ~500.000 | (monitorId, externalId) |
| monitor_logs | ~1.000.000 | (monitorId), (createdAt) |
| subscriptions | ~15.000 | (userId), (status) |

### 10.3 Índice Faltante

```sql
-- Recomendado para tick do worker
CREATE INDEX idx_monitors_active_checked
ON monitors(active, last_checked_at);
```

---

## 11. Padrões, Qualidade e Manutenibilidade

### 11.1 Consistência de Código

| Aspecto | Frontend | Backend | Worker |
|---------|----------|---------|--------|
| TypeScript strict | Parcial | Parcial | Parcial |
| Error handling | Excelente | Bom | Bom |
| Logging | Básico | Estruturado | Estruturado |
| Documentação | Boa | Excelente | Boa |

### 11.2 Métricas de Qualidade

| Métrica | Valor | Avaliação |
|---------|-------|-----------|
| Usos de `any` | 225+ | Precisa melhorar |
| console.log | 394 | Migrar para logger |
| Cobertura de testes | ~20% | Aumentar |
| Duplicação | Baixa | Bom |

### 11.3 Facilidade de Onboarding

**Pontos positivos:**
- README detalhado
- Estrutura clara de pastas
- Documentação inline (subscriptionService)
- Error codes padronizados

**Pontos negativos:**
- Muitos arquivos de documentação dispersos
- Falta guia de contribuição
- Sem setup automatizado (docker-compose parcial)

---

## 12. Problemas Técnicos Conhecidos

### 12.1 Cold Start / Login Travado

**Sintoma:** Spinner infinito ao fazer login
**Causa:** Backend Render dormindo
**Correção:** Retry com backoff implementado
**Status:** ✅ Corrigido (frontend/src/services/api.ts)

### 12.2 Logout Indevido ao Navegar

**Sintoma:** Usuário deslogado ao clicar em "Monitores"
**Causa:** Endpoint /api/sessions retornava 401, triggering auto-logout
**Correção:** Adicionado `skipAutoLogout: true` em chamadas não-críticas
**Status:** ✅ Corrigido (commit 877df42)

### 12.3 2FA Desativar não Deslogava

**Sintoma:** Expectativa de logout após desativar 2FA
**Causa:** Comportamento intencional (sessão válida continua)
**Status:** ⚠️ Comportamento mantido (documentado)

### 12.4 Sessão Mercado Livre Expirando

**Sintoma:** Monitores ML param de funcionar
**Causa:** StorageState expira (~30 dias)
**Correção:** Job checkSessionExpiring notifica com 3 dias de antecedência
**Status:** ✅ Mitigado (notificação implementada)

---

## 13. Dívida Técnica e Próximos Passos

### 13.1 Dívida Crítica (Resolver Imediatamente)

| Item | Severidade | Esforço | Impacto |
|------|------------|---------|---------|
| 394 console.log | Alta | 2h | Observabilidade |
| Índice monitors faltante | Alta | 30min | Performance |
| Browser pool (worker) | Alta | 4h | RAM -70% |
| Rate limit por usuário | Alta | 2h | Isolamento |

### 13.2 Dívida Alta (Próximas 2 semanas)

| Item | Severidade | Esforço | Impacto |
|------|------------|---------|---------|
| Cache de dados (React Query) | Alta | 8h | UX |
| Remover duplo retry worker | Alta | 2h | Simplicidade |
| Tipar responses da API | Alta | 4h | Type safety |
| Validação declarativa (Zod) | Média | 8h | Manutenibilidade |

### 13.3 Dívida Média (Próximo mês)

| Item | Severidade | Esforço | Impacto |
|------|------------|---------|---------|
| HTTP-only cookies | Média | 8h | Segurança |
| Refresh token | Média | 6h | UX |
| Testes unitários (+50%) | Média | 20h | Qualidade |
| Refatorar auth.controller | Média | 8h | Manutenibilidade |

### 13.4 Roadmap Técnico Sugerido

```
Semana 1:
├── Converter console.log → logger
├── Criar índice monitors
├── Implementar browser pool
└── Rate limit por usuário

Semana 2-3:
├── Implementar React Query
├── Remover duplo retry
├── Tipar responses API
└── Testes críticos

Mês 2:
├── Refatorar auth.controller
├── Implementar refresh token
├── Aumentar cobertura testes
└── Documentação técnica
```

---

## 14. Avaliação Final

### 14.1 Pontos Fortes

1. **Arquitetura bem definida** - Separação clara frontend/backend/worker
2. **Error handling robusto** - AppError + middleware global + retry
3. **Resiliência no worker** - Circuit breaker, rate limit, retry
4. **Segurança básica sólida** - JWT, bcrypt, 2FA, rate limiting
5. **Autenticação sofisticada** - Cascata de 5 níveis para ML
6. **Jobs bem organizados** - Cron com logging e métricas
7. **Código documentado** - Funções canônicas bem explicadas

### 14.2 Diferenciais Arquiteturais

1. **Dual-mode worker** - BullMQ ou loop (flexibilidade)
2. **Cold start handling** - Retry inteligente no frontend
3. **Diagnóstico forense** - Screenshots e HTML em falhas
4. **Session provider abstraction** - Preparado para browser remoto

### 14.3 Por que Contribuir

- **Código limpo** - TypeScript bem estruturado
- **Padrões estabelecidos** - Fácil seguir convenções
- **Oportunidades claras** - Dívida técnica documentada
- **Produto real** - Em produção com usuários
- **Stack moderna** - React 19, Express 5, Prisma 7

### 14.4 Maturidade por Componente

| Componente | Score | Estado |
|------------|-------|--------|
| Frontend | 7.5/10 | Produção ready, melhorias em cache |
| Backend | 7.5/10 | Produção ready, melhorias em tipagem |
| Worker | 7.0/10 | Produção ready, melhorias em escala |
| Infraestrutura | 7.0/10 | Funcional, observabilidade básica |
| **Média** | **7.3/10** | **Produção Ready** |

### 14.5 Conclusão

O RadarOne é um sistema **tecnicamente sólido e bem arquitetado** para sua fase atual. A base de código é limpa, os padrões são consistentes e há documentação inline adequada.

As principais oportunidades de evolução estão em:
- **Escalabilidade** (browser pool, índices, rate limit por usuário)
- **Type safety** (eliminar `any`, tipar responses)
- **Observabilidade** (migrar console.log, métricas de negócio)

Com as melhorias sugeridas, o sistema pode evoluir de **~600 monitores/hora** para **~2.000+ monitores/hora** sem mudança significativa de infraestrutura.

---

**Documento gerado automaticamente via auditoria de código**
**Data:** 24 de Janeiro de 2026
**Ferramenta:** Claude Code

---

## Apêndice A: Arquivos Analisados

### Frontend (principais)
- `frontend/src/context/AuthContext.tsx`
- `frontend/src/services/api.ts`
- `frontend/src/components/ProtectedRoute.tsx`
- `frontend/src/components/RequireSubscriptionRoute.tsx`
- `frontend/src/components/AdminProtectedRoute.tsx`
- `frontend/src/router.tsx`

### Backend (principais)
- `backend/src/server.ts`
- `backend/src/controllers/auth.controller.ts`
- `backend/src/services/subscriptionService.ts`
- `backend/src/errors/AppError.ts`
- `backend/src/middlewares/auth.middleware.ts`
- `backend/src/jobs/scheduler.ts`

### Worker (principais)
- `worker/src/worker.ts`
- `worker/src/bootstrap.ts`
- `worker/src/scrapers/mercadolivre-scraper.ts`
- `worker/src/services/queue-manager.ts`
- `worker/src/utils/rate-limiter.ts`
- `worker/src/utils/circuit-breaker.ts`
- `worker/src/utils/retry-helper.ts`
