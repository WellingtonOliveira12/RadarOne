# Configuração do Telegram Bot - RadarOne

## 1️⃣ Criar o Bot no Telegram

### Passo 1: Falar com @BotFather
1. Abra o Telegram e procure por **@BotFather**
2. Envie `/newbot`
3. Escolha um nome (ex: **RadarOne Notifications**)
4. Escolha um username único terminando em "bot" (ex: **RadarOneBot** ou **RadarOne_Prod_Bot**)

### Passo 2: Obter Token
Após criar o bot, você receberá uma mensagem com o **token**:
```
Use this token to access the HTTP API:
1234567890:ABCdefGHIjklMNOpqrsTUVwxyz123456789
```

**⚠️ IMPORTANTE:** Guarde este token com segurança. Ele dá controle total sobre o bot.

---

## 2️⃣ Configurar Variáveis de Ambiente

### No arquivo `.env` do backend:

```bash
# TELEGRAM
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz123456789
TELEGRAM_BOT_USERNAME=RadarOneBot
TELEGRAM_WEBHOOK_SECRET=generate-a-random-secret-here
```

### Gerar o TELEGRAM_WEBHOOK_SECRET:
```bash
# Opção 1: Usando OpenSSL
openssl rand -hex 32

# Opção 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Opção 3: Online (use um gerador de senhas forte)
# https://www.random.org/strings/
```

**Exemplo de secret seguro:**
```
a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

---

## 3️⃣ Configurar o Webhook

### O que é um Webhook?
Um webhook é uma URL que o Telegram chama quando alguém envia uma mensagem para o bot.

### URL do Webhook
```
https://api.radarone.com.br/api/telegram/webhook?secret=SEU_TELEGRAM_WEBHOOK_SECRET
```

### Configurar no Telegram (3 opções):

#### **Opção 1: Via Backend (Recomendado)**
Crie um script temporário no backend:

```javascript
// scripts/setup-telegram-webhook.js
const axios = require('axios');
require('dotenv').config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://api.radarone.com.br';
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

const webhookUrl = `${PUBLIC_URL}/api/telegram/webhook?secret=${WEBHOOK_SECRET}`;

async function setupWebhook() {
  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`,
      { url: webhookUrl }
    );

    console.log('✅ Webhook configurado com sucesso!');
    console.log('URL:', webhookUrl);
    console.log('Resposta:', response.data);
  } catch (error) {
    console.error('❌ Erro ao configurar webhook:', error.response?.data || error.message);
  }
}

setupWebhook();
```

Executar:
```bash
cd backend
node scripts/setup-telegram-webhook.js
```

#### **Opção 2: Via CURL**
```bash
curl -X POST "https://api.telegram.org/bot<SEU_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://api.radarone.com.br/api/telegram/webhook?secret=<SEU_SECRET>"}'
```

#### **Opção 3: Via Browser**
Acesse no navegador:
```
https://api.telegram.org/bot<SEU_TOKEN>/setWebhook?url=https://api.radarone.com.br/api/telegram/webhook?secret=<SEU_SECRET>
```

### Verificar se Webhook está configurado:
```bash
curl "https://api.telegram.org/bot<SEU_TOKEN>/getWebhookInfo"
```

Resposta esperada:
```json
{
  "ok": true,
  "result": {
    "url": "https://api.radarone.com.br/api/telegram/webhook?secret=...",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

---

## 4️⃣ Configurar no Render

### Variáveis de Ambiente no Render:
1. Acesse seu Web Service no Render: https://dashboard.render.com
2. Vá em **Environment**
3. Adicione as variáveis:

```
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz123456789
TELEGRAM_BOT_USERNAME=RadarOneBot
TELEGRAM_WEBHOOK_SECRET=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

4. Clique em **Save Changes** (vai fazer redeploy automático)

---

## 5️⃣ Testar o Sistema

### Teste 1: Verificar API está online
```bash
curl https://api.radarone.com.br/health
```

Deve retornar:
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

### Teste 2: Configurar Telegram no Frontend
1. Acesse: https://radarone.com.br/settings/notifications
2. Faça login
3. Digite seu @username do Telegram
4. Clique em **Salvar configurações**
5. Clique em **Vincular Telegram**
6. Copie o código gerado (ex: `RADAR-A1B2C3`)

### Teste 3: Vincular no Telegram
1. Abra o Telegram
2. Procure por `@RadarOneBot` (ou o username do seu bot)
3. Envie `/start`
4. Cole o código (ex: `RADAR-A1B2C3`)
5. Deve receber mensagem de confirmação:

```
✅ Conta vinculada com sucesso!

Olá, [Seu Nome]!

Você receberá notificações de novos anúncios aqui no Telegram.
```

### Teste 4: Testar Envio de Mensagem
1. No frontend, clique em **Testar Telegram**
2. Deve receber no Telegram:

```
🎉 Teste de notificação!

Sua conta do Telegram está vinculada corretamente ao RadarOne.
```

---

## 6️⃣ Fluxo Completo de Notificações

### Como funciona:

```
1. Worker detecta novo anúncio
   ↓
2. NotificationService busca configurações do usuário
   ↓
3. Se emailEnabled: Envia via Resend
   ↓
4. Se telegramEnabled E telegramChatId: Envia via Telegram
   ↓
5. Registra em NotificationLog (sucesso ou erro)
```

### Estrutura da Notificação Telegram:

```
🚨 Novo anúncio detectado!

Monitor: [Nome do Monitor]

[Título do Anúncio]

[Ver anúncio] (link clicável)
```

---

## 7️⃣ Troubleshooting

### Problema: Webhook não recebe mensagens

**Verificar:**
1. URL do webhook está correta?
```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

2. Secret está correto no .env?
3. API está online?
```bash
curl https://api.radarone.com.br/health
```

4. Logs do Render mostram requisições chegando?
- Acesse: Dashboard > Logs
- Procure por `[TelegramWebhook]`

### Problema: "Código inválido ou expirado"

**Causas:**
- Código tem validade de **30 minutos**
- Código só pode ser usado **uma vez**
- Gere um novo código e tente novamente

### Problema: Mensagem não chega no Telegram

**Verificar:**
1. Conta está vinculada?
```sql
SELECT telegramEnabled, telegramChatId
FROM "NotificationSettings"
WHERE "userId" = 'SEU_USER_ID';
```

2. Bot foi bloqueado pelo usuário?
- No Telegram, desbloqueie o bot
- Envie `/start` novamente
- Re-vincule a conta

3. Token do bot está correto?
```bash
curl "https://api.telegram.org/bot<TOKEN>/getMe"
```

### Problema: "Unauthorized" no webhook

**Causas:**
- `TELEGRAM_WEBHOOK_SECRET` está diferente entre:
  - `.env` do backend
  - URL do webhook configurada no Telegram

**Solução:**
1. Verificar secret no .env
2. Reconfigurar webhook com secret correto
3. Fazer redeploy no Render

---

## 8️⃣ Segurança

### ✅ Boas Práticas

1. **Nunca** commitar o token do bot no Git
2. **Sempre** usar HTTPS para webhook (Render fornece SSL grátis)
3. **Sempre** validar o `TELEGRAM_WEBHOOK_SECRET`
4. **Nunca** expor o `chatId` dos usuários na API
5. Rotacionar secrets periodicamente
6. Monitorar logs para tentativas de acesso não autorizado

### 🔒 Validação de Segurança

O webhook valida o secret em:
- `backend/src/controllers/telegram.controller.ts:19`

```typescript
if (!validateWebhookSecret(secret)) {
  res.status(401).json({ error: 'Unauthorized' });
  return;
}
```

---

## 9️⃣ Monitoramento

### Logs Importantes

**Backend logs (Render):**
```bash
[TelegramService] Mensagem enviada com sucesso
[TelegramService] Código de vínculo gerado
[TelegramWebhook] Processando mensagem do webhook
[TelegramService] Conta vinculada com sucesso
```

**Erros comuns:**
```bash
[TelegramService] TELEGRAM_BOT_TOKEN não configurado
[TelegramWebhook] Tentativa de acesso não autorizado
[TelegramService] Erro ao enviar mensagem
```

### Métricas no Banco

```sql
-- Total de usuários com Telegram ativo
SELECT COUNT(*)
FROM "NotificationSettings"
WHERE "telegramEnabled" = true
AND "telegramChatId" IS NOT NULL;

-- Notificações enviadas hoje
SELECT
  channel,
  status,
  COUNT(*)
FROM "NotificationLog"
WHERE "createdAt" >= CURRENT_DATE
GROUP BY channel, status;

-- Taxa de sucesso Telegram
SELECT
  status,
  COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() as percentage
FROM "NotificationLog"
WHERE channel = 'TELEGRAM'
GROUP BY status;
```

---

## 🎯 Checklist de Produção

- [ ] Bot criado no @BotFather
- [ ] Token salvo com segurança
- [ ] Variáveis configuradas no Render
- [ ] Webhook configurado e verificado
- [ ] Teste de vinculação funcionando
- [ ] Teste de envio de mensagem funcionando
- [ ] Logs mostrando requisições corretas
- [ ] Banco de dados com NotificationSettings correto
- [ ] Email + Telegram funcionando juntos
- [ ] Monitoramento ativo

---

## 📚 Referências

- [Telegram Bot API](https://core.telegram.org/bots/api)
- [BotFather Commands](https://core.telegram.org/bots#6-botfather)
- [Webhook Guide](https://core.telegram.org/bots/webhooks)
- [Render Docs](https://render.com/docs)
- [Resend Docs](https://resend.com/docs)

---

**Última atualização:** 2025-01-15
**Versão:** 1.0.0
