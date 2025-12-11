# Deploy do Backend RadarOne na Render

## Variáveis de Ambiente Obrigatórias

Configure estas variáveis no painel da Render (Settings → Environment):

```bash
# Database (Neon ou outro PostgreSQL)
DATABASE_URL=postgresql://neondb_owner:********@ep-xxx.sa-east-1.aws.neon.tech/radarone_prod?sslmode=require

# Server
NODE_ENV=production
PORT=3000
PUBLIC_URL=https://radarone.onrender.com

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-min-32-chars
JWT_EXPIRES_IN=7d

# Kiwify
KIWIFY_API_KEY=your-kiwify-api-key
KIWIFY_WEBHOOK_SECRET=your-kiwify-webhook-secret
KIWIFY_BASE_URL=https://api.kiwify.com.br

# Telegram
TELEGRAM_BOT_TOKEN=your-telegram-bot-token

# Email (Resend)
RESEND_API_KEY=re_your_resend_api_key_here
EMAIL_FROM=RadarOne <noreply@seudominio.com.br>
EMAIL_FROM_NAME=RadarOne
EMAIL_REPLY_TO=contato@seudominio.com.br

# CORS
FRONTEND_URL=https://seu-frontend.vercel.app

# Criptografia (LGPD - CPF)
# Gerar com: openssl rand -hex 32
CPF_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

## Configuração do Webhook na Kiwify

Após o deploy, configure o webhook da Kiwify:

1. Acesse: https://app.kiwify.com.br/configuracoes/webhooks
2. Adicione a URL: `https://radarone.onrender.com/api/webhooks/kiwify`
3. Configure o Secret (mesmo valor de `KIWIFY_WEBHOOK_SECRET`)
4. Marque todos os eventos:
   - ✓ Compra aprovada
   - ✓ Assinatura renovada
   - ✓ Assinatura cancelada
   - ✓ Assinatura atrasada
   - ✓ Compra reembolsada
   - ✓ Chargeback

## Build Commands (Render)

```bash
# Build Command
npm install && npx prisma generate && npx prisma migrate deploy && npm run build

# Start Command
npm start
```

## Verificação Pós-Deploy

1. **Health Check:**
   ```bash
   curl https://radarone.onrender.com/health
   ```

2. **Verificar Logs:**
   - Procure por: `🔗 Webhook Kiwify: https://radarone.onrender.com/api/webhooks/kiwify`
   - Confirme que está usando `0.0.0.0` e não `localhost`

3. **Testar Webhook:**
   - Faça uma compra de teste na Kiwify
   - Verifique os logs da Render para confirmar recebimento
   - Confirme criação de subscription no banco

## Troubleshooting

### Webhook não está sendo recebido

1. Verifique se `PUBLIC_URL` está configurado corretamente
2. Verifique se o servidor está ouvindo em `0.0.0.0` (não `localhost`)
3. Confirme que a URL do webhook na Kiwify está correta
4. Verifique os logs da Render para erros de HMAC signature

### Erro de conexão com banco

1. Confirme que `DATABASE_URL` está correto e com `?sslmode=require`
2. Verifique se o IP da Render está permitido no firewall do Neon
3. Execute migrations: `npx prisma migrate deploy`

### Erro de CORS

1. Confirme que `FRONTEND_URL` está configurado
2. Verifique se o frontend está usando a URL correta da API
