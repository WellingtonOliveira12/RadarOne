# 🚀 Configuração de Variáveis de Ambiente no Render

Este guia explica como configurar corretamente todas as variáveis de ambiente necessárias para o RadarOne funcionar em produção no Render.

---

## 📋 PASSO A PASSO

### 1. Acesse o Dashboard do Render

1. Entre em: https://dashboard.render.com
2. Selecione seu serviço RadarOne (backend)
3. Clique na aba **"Environment"** no menu lateral

---

## ⚙️ VARIÁVEIS OBRIGATÓRIAS

### 🔴 CPF_ENCRYPTION_KEY (CRÍTICO)

**Status:** ⚠️ OBRIGATÓRIA
**Usado para:** Criptografar CPF dos usuários (LGPD compliance)

**Como configurar:**

1. **Gere uma chave segura no seu terminal:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **No Render:**
   - Key: `CPF_ENCRYPTION_KEY`
   - Value: Cole a chave gerada (64 caracteres hexadecimais)

3. **Exemplo de valor:**
   ```
   a3f9d8b7c6e5f4a3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9
   ```

⚠️ **IMPORTANTE:**
- A chave DEVE ter exatamente 64 caracteres
- NUNCA compartilhe esta chave
- NUNCA comite no Git
- Se perder a chave, CPFs criptografados não poderão ser descriptografados

---

### 🔴 DATABASE_URL

**Status:** ⚠️ OBRIGATÓRIA
**Usado para:** Conexão com banco de dados PostgreSQL (Neon)

**Formato:**
```
postgresql://usuario:senha@host/database?sslmode=require
```

**Como obter:**
1. Acesse: https://console.neon.tech
2. Selecione seu projeto
3. Copie a Connection String
4. Cole no Render

**No Render:**
- Key: `DATABASE_URL`
- Value: `postgresql://neondb_owner:******@ep-exemplo.sa-east-1.aws.neon.tech/radarone_prod?sslmode=require`

---

### 🔴 JWT_SECRET

**Status:** ⚠️ OBRIGATÓRIA
**Usado para:** Autenticação de usuários (tokens JWT)

**Como configurar:**

1. **Gere uma secret segura:**
   ```bash
   openssl rand -base64 48
   ```

2. **No Render:**
   - Key: `JWT_SECRET`
   - Value: Cole a secret gerada (mínimo 32 caracteres)

**Exemplo:**
```
Kj3mL8pQ9rS2tU5vW7xY0zA1bC3dE4fG6hI8jK0lM2nO4pQ6rS8tU0vW2xY4zA6
```

---

### 🔴 RESEND_API_KEY

**Status:** ⚠️ OBRIGATÓRIA
**Usado para:** Envio de emails (boas-vindas, reset de senha, notificações)

**Como obter:**
1. Crie conta em: https://resend.com/signup (plano gratuito: 100 emails/dia)
2. Acesse: https://resend.com/api-keys
3. Clique em "Create API Key"
4. Copie a chave

**No Render:**
- Key: `RESEND_API_KEY`
- Value: `re_xxxxxxxxxxxxxxxxxxxxxxxx`

**Também configure:**
- Key: `EMAIL_FROM`
- Value: `RadarOne <noreply@seudominio.com.br>`

- Key: `EMAIL_FROM_NAME`
- Value: `RadarOne`

---

### 🔴 PUBLIC_URL

**Status:** ⚠️ OBRIGATÓRIA
**Usado para:** Webhooks Kiwify e links em emails

**Valor para produção:**
```
https://radarone.onrender.com
```

Ou, se usar domínio customizado:
```
https://api.radarone.com.br
```

**No Render:**
- Key: `PUBLIC_URL`
- Value: URL do seu serviço no Render

---

### 🔴 FRONTEND_URL

**Status:** ⚠️ OBRIGATÓRIA
**Usado para:** CORS e links em emails

**Valor para produção:**
```
https://radarone.app
```

Ou:
```
https://radarone-frontend.onrender.com
```

**No Render:**
- Key: `FRONTEND_URL`
- Value: URL do frontend em produção

---

## 🟡 VARIÁVEIS RECOMENDADAS

### 🟡 NODE_ENV

**No Render:**
- Key: `NODE_ENV`
- Value: `production`

✅ **Benefícios:**
- Logs otimizados
- Validações de segurança ativadas
- Performance melhorada

---

### 🟡 KIWIFY_WEBHOOK_SECRET

**Status:** 🟡 RECOMENDADA (se usar Kiwify)
**Usado para:** Validar webhooks da Kiwify (HMAC SHA256)

**Como configurar:**
1. Acesse painel Kiwify
2. Vá em Webhooks → Configurações
3. Copie ou defina o Webhook Secret
4. Use a MESMA secret no Render

**No Render:**
- Key: `KIWIFY_WEBHOOK_SECRET`
- Value: A secret configurada na Kiwify

⚠️ **IMPORTANTE:**
- Em produção sem esta secret, webhooks serão REJEITADOS
- A secret deve ser a MESMA em ambos os lados

---

## 🟢 VARIÁVEIS OPCIONAIS

### 🟢 SENTRY_DSN

**Status:** 🟢 OPCIONAL
**Usado para:** Monitoramento de erros em produção

**Como obter:**
1. Crie conta em: https://sentry.io/signup/
2. Crie um projeto
3. Copie o DSN

**No Render:**
- Key: `SENTRY_DSN`
- Value: `https://xxx@yyy.ingest.sentry.io/zzz`

---

### 🟢 TELEGRAM_BOT_TOKEN

**Status:** 🟢 OPCIONAL
**Usado para:** Notificações via Telegram

**Como obter:**
1. Fale com @BotFather no Telegram
2. Crie um bot com `/newbot`
3. Copie o token

**No Render:**
- Key: `TELEGRAM_BOT_TOKEN`
- Value: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`

---

### 🟢 KIWIFY_API_KEY

**Status:** 🟢 OPCIONAL
**Usado para:** Integrações com API da Kiwify

**No Render:**
- Key: `KIWIFY_API_KEY`
- Value: Sua API key da Kiwify

---

## ✅ CHECKLIST FINAL

Antes de fazer deploy, confirme:

- [x] `CPF_ENCRYPTION_KEY` configurada (64 caracteres hex)
- [x] `DATABASE_URL` apontando para Neon
- [x] `JWT_SECRET` configurada (mínimo 32 caracteres)
- [x] `RESEND_API_KEY` configurada
- [x] `EMAIL_FROM` configurado
- [x] `PUBLIC_URL` com URL do backend
- [x] `FRONTEND_URL` com URL do frontend
- [x] `NODE_ENV=production`
- [x] `KIWIFY_WEBHOOK_SECRET` (se usar Kiwify)

---

## 🧪 TESTANDO APÓS DEPLOY

### 1. Health Check
```bash
curl https://radarone.onrender.com/healthz
# Deve retornar: ok
```

### 2. Teste de Cadastro
```bash
curl -X POST https://radarone.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Teste",
    "email": "teste@example.com",
    "password": "senha123"
  }'
```

**Sucesso:** Status 201, usuário criado
**Erro de CPF_ENCRYPTION_KEY:** Status 500, mensagem clara sobre configuração

---

## 🆘 TROUBLESHOOTING

### ❌ Erro: "CPF_ENCRYPTION_KEY não configurada"

**Solução:**
1. Gere a chave: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Adicione no Render: Environment → Add Environment Variable
3. Salve e aguarde redeploy automático

---

### ❌ Erro: "ERR_ERL_UNEXPECTED_X_FORWARDED_FOR"

**Solução:**
Este erro foi corrigido na versão atual (trust proxy configurado).
Se ainda aparecer:
1. Verifique se está usando a última versão do código
2. Confirme que `app.set('trust proxy', 1)` está no server.ts

---

### ❌ Erro: "Muitas tentativas de autenticação"

**Causa:** Rate limiting funcionando (10 requisições / 15min)

**Solução:**
- Aguarde 15 minutos
- Ou use IPs diferentes
- É comportamento esperado (proteção contra brute force)

---

### ❌ Erro 404 em "/"

**Solução:**
Este erro foi corrigido. Agora `/` retorna status da API.
Se persistir, verifique se está usando a última versão do código.

---

## 📞 SUPORTE

Se encontrar problemas:
1. Verifique os logs do Render: Dashboard → Logs
2. Confirme que todas as variáveis obrigatórias estão configuradas
3. Teste os endpoints de health check primeiro
4. Revise este guia novamente

---

*Última atualização: 13/12/2025*
