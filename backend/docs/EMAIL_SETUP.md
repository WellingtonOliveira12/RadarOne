# 📧 Configuração do Email Service (Resend)

**Data:** 06/12/2024
**Provedor:** Resend
**Status:** ✅ Implementado e funcionando

---

## 📋 PASSO A PASSO - Configuração

### 1. Criar conta no Resend

1. Acesse: https://resend.com/signup
2. Crie uma conta gratuita (100 emails/dia, 3.000/mês)
3. Confirme seu e-mail

### 2. Adicionar domínio (Opcional mas recomendado)

**Para usar seu próprio domínio:**

1. Acesse: https://resend.com/domains
2. Clique em "Add Domain"
3. Digite seu domínio (ex: `radarone.com.br`)
4. Adicione os registros DNS fornecidos:
   - **SPF Record** (TXT)
   - **DKIM Record** (TXT)
   - **DMARC Record** (TXT opcional)

5. Aguarde verificação (pode levar até 72h, mas geralmente é instantâneo)

**Sem domínio próprio:**
- Você pode usar `onboarding@resend.dev` para testes
- Limite: 100 e-mails/dia
- Não é recomendado para produção

### 3. Gerar API Key

1. Acesse: https://resend.com/api-keys
2. Clique em "Create API Key"
3. Nome sugerido: `RadarOne - Production` ou `RadarOne - Development`
4. Permissão: **Sending access** (suficiente)
5. Copie a chave (começa com `re_...`)
6. ⚠️ **ATENÇÃO:** A chave só é mostrada uma vez! Salve em local seguro.

### 4. Configurar variáveis de ambiente

Edite o arquivo `.env` do backend:

```bash
# Email Service (Resend)
RESEND_API_KEY=re_sua_chave_aqui_123456789abcdef
EMAIL_FROM=RadarOne <noreply@radarone.com.br>
EMAIL_FROM_NAME=RadarOne
EMAIL_REPLY_TO=contato@radarone.com.br
FRONTEND_URL=http://localhost:5173
```

**Explicação:**
- `RESEND_API_KEY`: Chave da API que você copiou
- `EMAIL_FROM`: Nome e e-mail remetente (use seu domínio verificado)
- `EMAIL_FROM_NAME`: Nome que aparece no e-mail
- `EMAIL_REPLY_TO`: E-mail para respostas (opcional)
- `FRONTEND_URL`: URL do frontend (para links nos e-mails)

### 5. Testar envio de e-mail

**Método 1: Endpoint de teste (Desenvolvimento)**

```bash
# 1. Iniciar o backend
cd backend
npm run dev

# 2. Em outro terminal, enviar teste via curl
curl -X POST http://localhost:3000/api/dev/test-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "seuemail@gmail.com",
    "type": "welcome"
  }'
```

**Tipos de e-mail disponíveis:**
- `welcome` - Boas-vindas
- `trial-started` - Trial iniciado
- `trial-ending` - Trial terminando
- `trial-expired` - Trial expirado
- `subscription-expired` - Assinatura expirada
- `new-listing` - Novo anúncio encontrado

**Método 2: Registrar um novo usuário**

1. Acesse o frontend: http://localhost:5173
2. Clique em "Registrar"
3. Preencha os dados
4. **Verifique seu e-mail!** (pode cair no spam)

**Método 3: Rodar jobs manualmente**

```bash
# Job de trials expirando
npx ts-node src/jobs/checkTrialExpiring.ts

# Job de assinaturas expiradas
npx ts-node src/jobs/checkSubscriptionExpired.ts
```

---

## 📧 E-MAILS IMPLEMENTADOS

### 1. **Boas-vindas** (Welcome)
- **Trigger:** Ao criar conta
- **Arquivo:** `auth.controller.ts:81`
- **Template:** HTML bonito com botão "Acessar Dashboard"

### 2. **Trial Iniciado**
- **Trigger:** Ao iniciar trial (registro ou escolher plano)
- **Arquivo:** `billingService.ts:123`
- **Template:** HTML com destaque para dias grátis

### 3. **Trial Terminando** (3 dias antes)
- **Trigger:** Job diário `checkTrialExpiring.ts`
- **Template:** Aviso amarelo com CTA para upgrade

### 4. **Trial Expirado**
- **Trigger:** Job diário `checkTrialExpiring.ts`
- **Template:** Vermelho com incentivo para assinar

### 5. **Assinatura Expirada**
- **Trigger:** Job diário `checkSubscriptionExpired.ts`
- **Template:** Aviso de renovação

### 6. **Novo Anúncio**
- **Trigger:** Worker de monitoramento
- **Arquivo:** `notificationService.ts:64`
- **Template:** Card azul com detalhes do anúncio
- **Importante:** Envia SEMPRE Telegram E Email (ambos, não fallback)

---

## ⚙️ CONFIGURANDO JOBS (Cron)

### Opção 1: Cron nativo do Linux/Mac

Edite o crontab:
```bash
crontab -e
```

Adicione as linhas:
```bash
# Verificar trials expirando - Diariamente às 9h
0 9 * * * cd /caminho/para/RadarOne/backend && npx ts-node src/jobs/checkTrialExpiring.ts >> /var/log/radarone-trials.log 2>&1

# Verificar assinaturas expiradas - Diariamente às 10h
0 10 * * * cd /caminho/para/RadarOne/backend && npx ts-node src/jobs/checkSubscriptionExpired.ts >> /var/log/radarone-subscriptions.log 2>&1
```

### Opção 2: node-cron (Recomendado)

**1. Instalar:**
```bash
npm install node-cron
npm install -D @types/node-cron
```

**2. Criar arquivo `src/jobs/scheduler.ts`:**
```typescript
import cron from 'node-cron';
import { checkTrialExpiring } from './checkTrialExpiring';
import { checkSubscriptionExpired } from './checkSubscriptionExpired';

// Verificar trials expirando - Diariamente às 9h
cron.schedule('0 9 * * *', async () => {
  console.log('[CRON] Executando checkTrialExpiring...');
  await checkTrialExpiring();
});

// Verificar assinaturas expiradas - Diariamente às 10h
cron.schedule('0 10 * * *', async () => {
  console.log('[CRON] Executando checkSubscriptionExpired...');
  await checkSubscriptionExpired();
});

console.log('✅ Jobs agendados com sucesso!');
```

**3. Importar no `server.ts`:**
```typescript
// Agendar jobs (após conectar ao banco)
import './jobs/scheduler';
```

### Opção 3: Serviços na nuvem

- **Vercel Cron:** https://vercel.com/docs/cron-jobs
- **Render Cron Jobs:** https://render.com/docs/cronjobs
- **Railway Cron:** Via deploy separado
- **AWS EventBridge:** Lambda functions

---

## 🔍 MONITORAMENTO

### Logs do Resend

Acesse: https://resend.com/emails

Você verá:
- ✅ E-mails enviados com sucesso
- ❌ E-mails que falharam (bounce, spam, etc)
- 📊 Taxa de abertura e cliques
- 🕐 Histórico completo

### Logs do Backend

```bash
# Procurar logs de e-mail
grep "\[EMAIL" logs/backend.log

# Ver apenas erros
grep "\[EMAIL ERROR\]" logs/backend.log

# Ver e-mails enviados com sucesso
grep "\[EMAIL SENT\]" logs/backend.log
```

---

## ⚠️ TROUBLESHOOTING

### "Erro: Missing API key"
- Verifique se `RESEND_API_KEY` está no `.env`
- Certifique-se que a chave começa com `re_`
- Reinicie o backend após alterar `.env`

### "Erro: Domain not verified"
- Aguarde verificação DNS (até 72h)
- Use `onboarding@resend.dev` temporariamente
- Verifique os registros DNS no painel do Resend

### E-mails caindo no spam
- Configure SPF, DKIM e DMARC corretamente
- Use um domínio verificado
- Evite palavras spam no assunto ("Grátis", "Ganhe", etc)
- Inclua link de unsubscribe (futuro)

### E-mails não chegam
1. Verifique logs do backend: `[EMAIL SENT]`
2. Verifique painel do Resend
3. Teste com outro e-mail
4. Verifique pasta de spam
5. Aguarde alguns minutos (pode demorar)

---

## 📊 LIMITES E CUSTOS

### Plano Gratuito (Free)
- ✅ **100 e-mails/dia**
- ✅ **3.000 e-mails/mês**
- ✅ Domínio próprio
- ✅ API completa
- ✅ Logs ilimitados

### Plano Pago (se necessário)
- **$20/mês** - 50.000 e-mails/mês
- **$80/mês** - 500.000 e-mails/mês
- Suporte prioritário
- Webhooks de delivery

**Comparação:**
- SendGrid Free: 100/dia (mas interface pior)
- Mailgun: $35/mês para 50k
- AWS SES: $0.10 por 1000 (mas complexo de configurar)

---

## 🎯 PRÓXIMOS PASSOS

### Melhorias Futuras

1. **Webhook de delivery**
   - Receber confirmação de entrega
   - Rastrear aberturas e cliques
   - Marcar e-mails bounced

2. **Templates avançados**
   - Templates MJML
   - Preview antes de enviar
   - Testes A/B

3. **Unsubscribe**
   - Link para cancelar notificações
   - Preferências de e-mail

4. **Anexos**
   - Enviar PDFs
   - Relatórios mensais

---

## ✅ CHECKLIST DE PRODUÇÃO

Antes de lançar:

- [ ] Domínio próprio verificado
- [ ] SPF, DKIM, DMARC configurados
- [ ] API key de produção criada
- [ ] Variáveis `.env` corretas
- [ ] Jobs agendados (cron)
- [ ] Endpoint `/api/dev` bloqueado/removido
- [ ] Logs configurados
- [ ] Monitoramento ativo (Resend dashboard)
- [ ] Testes de todos os templates
- [ ] E-mails não caindo no spam

---

**🎯 Generated with Claude Code**
**Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>**
