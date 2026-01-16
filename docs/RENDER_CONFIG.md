# Configuracao do Render - RadarOne

## Servicos

### 1. RadarOne (Backend Web)
- Tipo: Web Service
- Runtime: Node.js

### 2. radarone-worker (Worker)
- Tipo: Background Worker
- Runtime: Node.js

---

## Variaveis de Ambiente

### AMBOS OS SERVICOS (backend + worker)

| Variavel | Descricao | Obrigatorio |
|----------|-----------|-------------|
| `DATABASE_URL` | URL do PostgreSQL | SIM |
| `NODE_ENV` | `production` | SIM |

### APENAS NO WORKER

| Variavel | Descricao | Obrigatorio |
|----------|-----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Token do bot Telegram | SIM (para alertas) |
| `RESEND_API_KEY` | API key do Resend | NAO (email opcional) |
| `EMAIL_FROM` | Remetente. Use `onboarding@resend.dev` para teste | NAO |
| `PLAYWRIGHT_BROWSERS_PATH` | `./pw-browsers` | SIM |
| `ML_STORAGE_STATE_B64` | Sessao ML em base64 | NAO (melhora scraping) |
| `CHECK_INTERVAL_MINUTES` | Intervalo do tick (default: 1) | NAO |

### MERCADO LIVRE - Opcoes de Sessao (escolha UMA)

**Opcao A - Secret File (Recomendado):**
1. Va em Environment > Secret Files
2. Add Secret File:
   - Filename: `ml-storage-state.json`
   - Contents: conteudo do storageState.json
3. Add Environment Variable:
   - Key: `ML_STORAGE_STATE_PATH`
   - Value: `/etc/secrets/ml-storage-state.json`

**Opcao B - ENV Base64:**
1. Add Environment Variable:
   - Key: `ML_STORAGE_STATE_B64`
   - Value: conteudo do storageState.base64.txt

---

## Como Gerar Sessao do Mercado Livre

```bash
cd worker

# 1. Abre navegador para login manual
npm run ml:login

# 2. Faca login no ML (QR Code, SMS, etc)

# 3. Pressione ENTER quando logado

# 4. Gere o base64
npm run ml:state:encode

# 5. Copie para clipboard (macOS)
cat sessions/mercadolivre/storageState.base64.txt | pbcopy
```

---

## Como Testar Email

```bash
# Local
npm run test:email seu-email@gmail.com

# Verifique a caixa de entrada
```

Se der erro "API key is invalid":
1. Gere nova key em https://resend.com/api-keys
2. Atualize RESEND_API_KEY no Render
3. Deploy

Se der erro de dominio:
1. Use `EMAIL_FROM=onboarding@resend.dev`
2. Ou verifique seu dominio em https://resend.com/domains

---

## Logs Esperados

### Startup do Worker

```
EMAIL_SERVICE: Habilitado (from=...)
ML_AUTH_PROVIDER: [PRIORITY B] ENV base64 decodificado...
SESSION_MANAGER: Inicializado
RadarOne Worker iniciado
```

### Scraping com Sucesso

```
ML_SCRAPER_START: ...
ML_AUTH_STATE: loaded=true source=env_base64
ML_AUTH_OK: Usando sessao de env_base64
ML_SCRAPER_SUCCESS: 48 anuncios extraidos
```

### Quando Precisa Reautenticar

```
ML_LOGIN_REQUIRED: Mercado Livre exigindo login
SESSION_MANAGER: Site marcado como needs_reauth
ML_SITE_BACKOFF: Site em backoff por 60 minutos
```

---

## Troubleshooting

### Email nao funciona

1. Verifique logs: `EMAIL_FATAL: API key invalida`
2. Gere nova key no Resend
3. Use `EMAIL_FROM=onboarding@resend.dev` para teste

### ML retorna 0 anuncios

1. Verifique logs: `ML_LOGIN_REQUIRED` ou `ML_CHALLENGE`
2. Gere nova sessao: `npm run ml:login`
3. Atualize no Render e deploy

### Site em backoff

O sistema entra em backoff automaticamente quando:
- 3 erros consecutivos (15 min)
- Login required detectado (60 min)
- Site bloqueado (120 min)

Aguarde o tempo ou:
1. Gere nova sessao
2. Redeploy (reseta backoff em memoria)
