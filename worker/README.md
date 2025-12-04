# RadarOne - Worker

Worker de scraping do RadarOne - Executa monitores e envia alertas via Telegram.

## 🚀 Tecnologias

- **Node.js** + **TypeScript**
- **Playwright** - Automação de browser para scraping
- **Prisma 7** - ORM (compartilha schema com backend)
- **Telegram Bot API** - Envio de alertas

## 📁 Estrutura

```
worker/
├── src/
│   ├── scrapers/          # Scrapers por site
│   │   └── mercadolivre-scraper.ts  ✅ Implementado
│   ├── services/          # Serviços
│   │   ├── monitor-runner.ts        # Orquestrador
│   │   └── telegram-service.ts      # Alertas Telegram
│   ├── types/             # TypeScript types
│   │   └── scraper.ts     # ScrapedAd interface
│   └── index.ts           # Entry point (loop principal)
├── prisma.config.ts       # Config Prisma 7
└── package.json
```

## ⚙️ Configuração

1. Instalar dependências: `npm install`
2. Instalar Playwright: `npm run playwright:install`
3. Configurar `.env`: `cp .env.example .env`
4. Gerar Prisma Client: `npm run prisma:generate`

### Variáveis de Ambiente (.env)

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/radarone"

# Telegram Bot
TELEGRAM_BOT_TOKEN="your_bot_token_here"

# Captcha Solver (Opcional)
CAPTCHA_SERVICE="2captcha"  # ou "anticaptcha"
CAPTCHA_API_KEY="your_api_key_here"

# Worker Config
CHECK_INTERVAL_MINUTES=5
```

### Configuração de Captcha (Opcional)

O worker suporta resolução automática de captchas via 2Captcha ou Anti-Captcha:

1. **2Captcha**:
   - Criar conta em https://2captcha.com
   - Copiar API Key do dashboard
   - Definir `CAPTCHA_SERVICE=2captcha` e `CAPTCHA_API_KEY=sua_chave`

2. **Anti-Captcha**:
   - Criar conta em https://anti-captcha.com
   - Copiar API Key do dashboard
   - Definir `CAPTCHA_SERVICE=anticaptcha` e `CAPTCHA_API_KEY=sua_chave`

Se não configurado, o worker continuará funcionando normalmente, mas pode falhar em sites com captcha.

## 🏃 Executar

```bash
npm run dev
```

## ✅ Scrapers Implementados

### Mercado Livre - ✅ FUNCIONAL
- Extrai anúncios da página de busca
- Aplica filtros de preço (priceMin/priceMax)
- Extrai: título, preço, URL, imagem, localização, ID externo
- Rate limiting: 10 req/min
- Retry automático: 7 tentativas com backoff exponencial

### OLX - ✅ FUNCIONAL
- Extrai anúncios de carros, motos, imóveis
- Seletores: [data-ds-component="DS-AdCard"]
- Rate limiting: 15 req/min
- Suporta anúncios sem preço (trocas)

### WEBMOTORS - ✅ FUNCIONAL
- Portal de veículos (carros e motos)
- Seletores: [data-testid="listing-card"]
- Rate limiting: 12 req/min
- Extração de marca, modelo, ano

### ICARROS - ✅ FUNCIONAL
- Portal de veículos (carros e motos)
- Seletores: .ItemList__ItemWrap, .CardDescription__Title
- Rate limiting: 12 req/min
- Integração com filtros de preço

### ZAP IMÓVEIS - ✅ FUNCIONAL
- Portal de imóveis (venda e locação)
- Seletores: [data-position]
- Rate limiting: 8 req/min
- Extração de endereço e características

### VIVA REAL - ✅ FUNCIONAL
- Portal de imóveis (venda e locação)
- Seletores: .property-card__container
- Rate limiting: 8 req/min
- Integração com data-attributes

### IMOVELWEB - ✅ FUNCIONAL
- Portal de imóveis (venda e locação)
- Seletores: [data-qa="posting PROPERTY"]
- Rate limiting: 10 req/min
- Suporte para múltiplos tipos de imóveis

### LEILÃO - ✅ FUNCIONAL
- Scraper genérico para sites de leilão
- Detecta automaticamente: Superbid, VIP Leilões, Sodré Santoro
- Fallback para sites não identificados
- Rate limiting: 5 req/min (mais conservador)
- Extração adaptativa de estrutura HTML

## 🔄 Fluxo de Execução

1. **Loop Principal** (`index.ts`)
   - Busca monitores ativos no banco (`active = true`)
   - Executa cada monitor via `MonitorRunner`
   - Aguarda intervalo configurado (CHECK_INTERVAL_MINUTES)

2. **MonitorRunner** (`monitor-runner.ts`)
   - Verifica assinatura ativa do usuário
   - Verifica limite de consultas
   - Roteia para scraper correto baseado em `monitor.site`
   - Processa anúncios novos
   - Envia alertas via Telegram
   - Registra logs e incrementa contador de consultas

3. **Scraper** (`mercadolivre-scraper.ts`)
   - Lança browser headless com Playwright
   - Navega para `monitor.searchUrl`
   - Extrai cards de anúncios
   - Aplica filtros de preço
   - Retorna lista de `ScrapedAd[]`

4. **Detecção de Duplicatas**
   - Verifica se anúncio já existe em `AdSeen` (por `externalId`)
   - Se novo: cria registro + envia alerta
   - Se existente: atualiza `lastSeenAt`

5. **Telegram Alert**
   - Formata mensagem em português
   - Preço formatado padrão BR (R$ 2.350,00)
   - Envia com imagem quando disponível
   - Delay de 500ms entre alertas

## 🎉 Features Implementadas

### ✅ Infraestrutura Robusta
- **Rate Limiting**: Token bucket algorithm com configurações por site
  - Evita bloqueios e respeita limites de cada plataforma
  - Configurável: tokensPerInterval, interval, maxTokens
  - Implementado em `utils/rate-limiter.ts`

- **Retry com Backoff Exponencial**:
  - Configurações pré-definidas: quick, standard, aggressive, scraping
  - Retry condicional baseado em tipo de erro
  - Presets personalizáveis por caso de uso
  - Implementado em `utils/retry-helper.ts`

- **Tratamento de Captchas**:
  - Integração com 2Captcha e Anti-Captcha
  - Suporte para ReCAPTCHA v2, hCaptcha
  - Detecção e resolução automática
  - Implementado em `utils/captcha-solver.ts`
  - Configuração via `.env`: CAPTCHA_SERVICE, CAPTCHA_API_KEY

### ✅ Scrapers Completos (8 sites)
- Mercado Livre, OLX, Webmotors, iCarros
- Zap Imóveis, Viva Real, ImovelWeb, Leilão
- Todos com rate limiting e retry automáticos
- Filtros de preço integrados
- Validação robusta de dados

## 🚧 Melhorias Futuras

- [ ] Rotação de user agents avançada
- [ ] Proxy rotation para maior resiliência
- [ ] Métricas e logs estruturados (Winston/Pino)
- [ ] Dashboard de monitoramento em tempo real
- [ ] Notificações por WhatsApp (além de Telegram)
- [ ] Machine Learning para detecção de padrões

