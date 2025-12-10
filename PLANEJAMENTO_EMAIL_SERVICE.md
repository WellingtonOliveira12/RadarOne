# 📧 PLANEJAMENTO - Email Service Real (Resend)

**Data:** 06/12/2024
**Objetivo:** Implementar serviço de e-mail real com Resend para notificações do RadarOne

---

## 📋 ANÁLISE DO CÓDIGO ATUAL

### Arquivos Existentes

1. **emailService.ts** (atual)
   - ✅ Interface `EmailParams` definida
   - ❌ Implementação é apenas console.log (stub)
   - ❌ Não tem provedor real

2. **notificationService.ts** (atual)
   - ✅ Usa Telegram como prioridade
   - ⚠️ Email é apenas fallback (quando Telegram falha)
   - ❌ **PROBLEMA:** Deveria enviar SEMPRE para ambos

3. **auth.controller.ts** (atual)
   - ✅ Cria usuário
   - ✅ Inicia trial automático
   - ❌ Não envia e-mail de boas-vindas

4. **billingService.ts** (atual)
   - ✅ `startTrialForUser()` cria subscription com trial
   - ❌ Não dispara notificação de trial iniciado

### Schema Prisma - Campos Relevantes

```prisma
User {
  email: String (obrigatório, único)
  name: String
}

Subscription {
  status: SubscriptionStatus (TRIAL, ACTIVE, EXPIRED, etc)
  trialEndsAt: DateTime?
  validUntil: DateTime?
  isTrial: Boolean
}
```

---

## 🎯 FUNÇÕES A IMPLEMENTAR

### emailService.ts (novo)

```typescript
// 1. Função genérica (já existe interface)
sendEmail(params: EmailParams): Promise<boolean>

// 2. Templates específicos
sendWelcomeEmail(userEmail: string, userName: string): Promise<boolean>

sendTrialStartedEmail(
  userEmail: string,
  userName: string,
  planName: string,
  trialDays: number
): Promise<boolean>

sendTrialEndingEmail(
  userEmail: string,
  userName: string,
  planName: string,
  daysRemaining: number
): Promise<boolean>

sendTrialExpiredEmail(
  userEmail: string,
  userName: string,
  planName: string
): Promise<boolean>

sendSubscriptionExpiredEmail(
  userEmail: string,
  userName: string,
  planName: string
): Promise<boolean>

sendNewListingEmail(
  userEmail: string,
  userName: string,
  monitorName: string,
  listingTitle: string,
  listingPrice: number | undefined,
  listingUrl: string
): Promise<boolean>
```

---

## 📍 PONTOS DE DISPARO

### 1. **Boas-vindas** (Welcome)
- **Onde:** `auth.controller.ts` → método `register()`
- **Quando:** Logo após criar usuário (antes de criar trial)
- **Dados:** Nome do usuário, email
- **Template:** Boas-vindas + explicação do trial gratuito

### 2. **Trial Iniciado**
- **Onde:** `billingService.ts` → `startTrialForUser()`
- **Quando:** Logo após criar subscription trial
- **Dados:** Nome do usuário, nome do plano, dias de trial
- **Template:** Confirmação do trial + features do plano

### 3. **Trial Terminando** (3 dias antes)
- **Onde:** Job/Cron diário (criar novo arquivo)
- **Quando:** Diariamente, verificar subscriptions com `trialEndsAt` em 3 dias
- **Dados:** Nome do usuário, plano, dias restantes
- **Template:** Lembrete + link para upgrade
- **Arquivo novo:** `src/jobs/checkTrialExpiring.ts`

### 4. **Trial Expirado**
- **Onde:** Job/Cron diário
- **Quando:** Diariamente, verificar subscriptions com `trialEndsAt` <= hoje
- **Dados:** Nome do usuário, plano
- **Template:** Trial expirou + incentivo para assinar
- **Arquivo novo:** `src/jobs/checkTrialExpiring.ts` (mesma função)

### 5. **Plano Expirado** (pagamento vencido)
- **Onde:** Job/Cron diário
- **Quando:** Diariamente, verificar subscriptions com `validUntil` <= hoje e status ACTIVE
- **Dados:** Nome do usuário, plano
- **Template:** Plano expirou + renovar assinatura
- **Arquivo novo:** `src/jobs/checkSubscriptionExpired.ts`

### 6. **Novo Anúncio** (já existe, só atualizar)
- **Onde:** `notificationService.ts` → `notifyNewListing()`
- **Quando:** Quando worker encontra novo anúncio
- **Mudança:** Enviar **SEMPRE** Telegram E Email (não fallback)

---

## 🔧 VARIÁVEIS DE AMBIENTE

### .env (adicionar)
```bash
# Email Service (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=RadarOne <noreply@radarone.com.br>
EMAIL_FROM_NAME=RadarOne
EMAIL_REPLY_TO=contato@radarone.com.br

# URLs do Frontend (para links nos e-mails)
FRONTEND_URL=http://localhost:5173
```

### .env.example (atualizar)
```bash
# Email Service (Resend) - OBRIGATÓRIO
RESEND_API_KEY=re_your_resend_api_key_here
EMAIL_FROM=RadarOne <noreply@seudominio.com.br>
EMAIL_FROM_NAME=RadarOne
EMAIL_REPLY_TO=contato@seudominio.com.br

# URLs
FRONTEND_URL=http://localhost:5173
```

---

## 📦 DEPENDÊNCIA

```bash
npm install resend
```

**Resend** foi escolhido por:
- ✅ SDK oficial Node.js simples
- ✅ API moderna e fácil de usar
- ✅ 100 emails/dia grátis (suficiente para testes)
- ✅ $20/mês para 50k emails (mais barato que SendGrid)
- ✅ Excelente DX (Developer Experience)
- ✅ Suporte a templates HTML + texto

---

## 🗂️ ARQUIVOS A CRIAR/MODIFICAR

### Criar Novos
1. ✅ `PLANEJAMENTO_EMAIL_SERVICE.md` (este arquivo)
2. ⏳ `backend/src/jobs/checkTrialExpiring.ts` - Job para verificar trials expirando
3. ⏳ `backend/src/jobs/checkSubscriptionExpired.ts` - Job para verificar planos expirados
4. ⏳ `backend/docs/EMAIL_SETUP.md` - Documentação de configuração

### Modificar Existentes
1. ⏳ `backend/src/services/emailService.ts` - Implementar Resend
2. ⏳ `backend/src/services/notificationService.ts` - Sempre enviar Telegram E Email
3. ⏳ `backend/src/controllers/auth.controller.ts` - Disparar e-mail de boas-vindas
4. ⏳ `backend/src/services/billingService.ts` - Disparar e-mail de trial iniciado
5. ⏳ `backend/.env.example` - Adicionar variáveis do Resend
6. ⏳ `backend/package.json` - Adicionar script para rodar jobs (opcional)

---

## 🔄 FLUXO DE ENVIO (Telegram E Email)

### Estratégia: SEMPRE AMBOS

```typescript
// notificationService.ts - ANTES (fallback)
if (telegram) {
  sendTelegram();
  return; // ❌ Para aqui
}
sendEmail(); // Só executa se Telegram falhar

// notificationService.ts - DEPOIS (sempre ambos)
const promises = [];

if (telegram) {
  promises.push(sendTelegram());
}

if (email) {
  promises.push(sendEmail());
}

await Promise.allSettled(promises); // ✅ Envia para todos
```

---

## 📊 RESUMO DA IMPLEMENTAÇÃO

### FASE 2 - Execução

1. ✅ Instalar `resend`
2. ✅ Implementar `emailService.ts` com 6 funções
3. ✅ Atualizar `notificationService.ts` para enviar ambos
4. ✅ Adicionar disparo em `auth.controller.ts` (boas-vindas)
5. ✅ Adicionar disparo em `billingService.ts` (trial iniciado)
6. ✅ Criar `checkTrialExpiring.ts` (job)
7. ✅ Criar `checkSubscriptionExpired.ts` (job)
8. ✅ Atualizar `.env.example`

### FASE 3 - Validação

1. ✅ `npm run build` (backend deve compilar)
2. ✅ Criar endpoint `POST /api/dev/test-email` (temporário)
3. ✅ Documentar em `EMAIL_SETUP.md`

---

## ⚠️ IMPORTANTE

### O que NÃO fazer
- ❌ Não alterar schema Prisma
- ❌ Não mexer em CPF criptografado
- ❌ Não alterar lógica de planos/assinaturas
- ❌ Não adicionar campos de rastreamento de e-mail (ainda)

### O que fazer
- ✅ Sempre enviar Telegram E Email (nunca fallback)
- ✅ Usar templates HTML simples e bonitos
- ✅ Incluir nome do usuário nos e-mails
- ✅ Incluir links para o frontend
- ✅ Log detalhado de envios (console.log por enquanto)

---

## 🚀 PRÓXIMA ETAPA

Com este planejamento aprovado, vamos para **FASE 2 - EXECUÇÃO**:
1. Instalar Resend
2. Implementar emailService.ts
3. Atualizar notificationService.ts
4. Conectar todos os pontos de disparo
5. Criar jobs de verificação
6. Testar

---

**Status:** ✅ PLANEJAMENTO CONCLUÍDO
**Próximo passo:** FASE 2 - Execução
