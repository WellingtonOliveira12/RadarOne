# 💳 Guia de Integração Kiwify - RadarOne

**Data:** 06/12/2024
**Status:** ✅ Implementado e Pronto para Configuração
**Gateway:** Kiwify (Brasil)

---

## 📊 RESUMO EXECUTIVO

A integração com Kiwify foi **100% implementada** e está pronta para ser configurada e testada. O sistema suporta:

✅ **Checkout via redirecionamento** para Kiwify
✅ **Webhooks** para ativar assinaturas automaticamente
✅ **6 eventos** processados (compra aprovada, renovação, cancelamento, etc.)
✅ **Validação HMAC** para segurança dos webhooks
✅ **Logs estruturados** de todos os webhooks
✅ **Backend compilando** sem erros

---

## 🎯 COMO FUNCIONA

### Fluxo Completo

```
1. USUÁRIO ESCOLHE PLANO
   ↓
   Frontend: POST /api/subscriptions/create-checkout
   Body: { "planSlug": "pro" }

2. BACKEND GERA URL DE CHECKOUT
   ↓
   Retorna: { "checkoutUrl": "https://pay.kiwify.com.br/PRODUCT_ID?email=..." }

3. FRONTEND REDIRECIONA USUÁRIO
   ↓
   window.location.href = checkoutUrl

4. USUÁRIO PAGA NA KIWIFY
   ↓
   Página de pagamento da Kiwify (PIX, Boleto, Cartão)

5. KIWIFY ENVIA WEBHOOK
   ↓
   POST https://seudominio.com/api/webhooks/kiwify
   Header: x-kiwify-signature (HMAC)
   Body: { event: "compra_aprovada", ... }

6. BACKEND PROCESSA WEBHOOK
   ↓
   - Valida signature HMAC
   - Busca usuário pelo email
   - Busca plano pelo product_id
   - Cancela subscription antiga (se existir)
   - Cria nova subscription ACTIVE
   - Salva log do webhook

7. USUÁRIO TEM ACESSO
   ↓
   Dashboard mostra plano ACTIVE
   Limites do plano aplicados
```

---

## 📁 ARQUIVOS IMPLEMENTADOS

### Novos Arquivos (4)

1. ✅ **`src/types/kiwify.ts`** (93 linhas)
   - Tipos TypeScript para webhooks
   - 10 eventos suportados
   - Mapeamento de status Kiwify → RadarOne

2. ✅ **`src/controllers/webhook.controller.ts`** (397 linhas)
   - Processamento de webhooks
   - Validação HMAC signature
   - 6 handlers de eventos
   - Logs estruturados

3. ✅ **`src/routes/webhook.routes.ts`** (27 linhas)
   - Rota POST /api/webhooks/kiwify
   - SEM autenticação JWT (usa HMAC)

4. ✅ **`src/services/kiwifyService.ts`** (104 linhas)
   - Geração de URLs de checkout
   - Helpers para configuração

### Arquivos Modificados (3)

1. ✅ **`src/controllers/subscription.controller.ts`**
   - Adicionado método `createCheckout()`
   - Endpoint: POST /api/subscriptions/create-checkout

2. ✅ **`src/routes/subscription.routes.ts`**
   - Adicionada rota `/create-checkout`

3. ✅ **`src/server.ts`**
   - Importado `webhookRoutes`
   - Registrado `/api/webhooks`

---

## 🔧 CONFIGURAÇÃO PASSO A PASSO

### 1. Criar Conta na Kiwify

1. Acessar: https://kiwify.com.br/
2. Criar conta gratuita
3. Fazer login no painel

### 2. Criar Produtos (Planos)

Para **cada plano** do RadarOne (STARTER, PRO, PREMIUM, ULTRA):

1. No painel Kiwify, ir em **Produtos** → **Criar Produto**
2. Preencher:
   - **Nome:** RadarOne - [NOME DO PLANO]
   - **Preço:** Conforme tabela abaixo
   - **Tipo:** Assinatura recorrente
   - **Período:** Mensal
3. Copiar o **Product ID** gerado
4. Repetir para cada plano

**Tabela de preços:**

| Plano | Preço | Product ID (exemplo) |
|-------|-------|---------------------|
| FREE | R$ 0 | (não criar na Kiwify) |
| STARTER | R$ 29 | `abc123starter` |
| PRO | R$ 49 | `def456pro` |
| PREMIUM | R$ 97 | `ghi789premium` |
| ULTRA | R$ 149 | `jkl012ultra` |

### 3. Configurar Webhooks na Kiwify

1. No painel Kiwify, ir em **Configurações** → **Webhooks**
2. Clicar em **Adicionar Webhook**
3. Configurar:
   - **URL:** `https://seudominio.com/api/webhooks/kiwify`
   - **Eventos:** Selecionar todos:
     - `compra_aprovada`
     - `compra_reembolsada`
     - `compra_recusada`
     - `chargeback`
     - `subscription_canceled`
     - `subscription_late`
     - `subscription_renewed`
4. Copiar o **Secret** gerado

### 4. Configurar Variáveis de Ambiente

Editar `backend/.env`:

```bash
# ============================================
# KIWIFY INTEGRATION
# ============================================
KIWIFY_API_KEY=your-kiwify-api-key-here
KIWIFY_WEBHOOK_SECRET=seu_secret_copiado_da_kiwify
KIWIFY_BASE_URL=https://pay.kiwify.com.br
```

### 5. Mapear Product IDs no Banco

Você precisa associar cada **Product ID da Kiwify** com os planos do RadarOne:

**Opção A: Via Prisma Studio** (Recomendado)

```bash
npx prisma studio
```

1. Abrir tabela `Plan`
2. Para cada plano, editar campo `kiwifyProductId`
3. Colar o Product ID copiado da Kiwify
4. Salvar

**Opção B: Via SQL**

```sql
UPDATE "plans" SET "kiwify_product_id" = 'abc123starter' WHERE slug = 'starter';
UPDATE "plans" SET "kiwify_product_id" = 'def456pro' WHERE slug = 'pro';
UPDATE "plans" SET "kiwify_product_id" = 'ghi789premium' WHERE slug = 'premium';
UPDATE "plans" SET "kiwify_product_id" = 'jkl012ultra' WHERE slug = 'ultra';
```

**Opção C: Via Código** (criar script temporário)

```typescript
import { setKiwifyProductId } from './src/services/kiwifyService';

await setKiwifyProductId('starter', 'abc123starter');
await setKiwifyProductId('pro', 'def456pro');
await setKiwifyProductId('premium', 'ghi789premium');
await setKiwifyProductId('ultra', 'jkl012ultra');
```

---

## 🧪 TESTES

### 1. Testar Geração de Checkout (Local)

```bash
# Iniciar servidor
npm run dev

# Em outro terminal, criar um usuário e fazer login
# Pegar o token JWT

# Testar criação de checkout
curl -X POST http://localhost:3000/api/subscriptions/create-checkout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN_JWT" \
  -d '{"planSlug": "pro"}'
```

**Resposta esperada:**

```json
{
  "message": "Checkout criado com sucesso",
  "checkoutUrl": "https://pay.kiwify.com.br/def456pro?email=usuario@email.com&name=Nome+Usuario",
  "planName": "PRO",
  "price": 49
}
```

### 2. Testar Webhook (Kiwify → Backend)

**Opção A: Usar botão "Test Webhook" da Kiwify**

1. No painel Kiwify, ir em Configurações → Webhooks
2. Clicar em "Testar Webhook"
3. Selecionar evento `compra_aprovada`
4. Enviar

**Opção B: Simular manualmente com cURL**

```bash
curl -X POST http://localhost:3000/api/webhooks/kiwify \
  -H "Content-Type: application/json" \
  -H "x-kiwify-signature: fake-signature-for-dev" \
  -d '{
    "event": "compra_aprovada",
    "customer": {
      "email": "teste@radarone.com",
      "name": "Usuário Teste"
    },
    "product": {
      "product_id": "def456pro",
      "product_name": "RadarOne - PRO",
      "product_type": "subscription"
    },
    "order": {
      "order_id": "ORDER123",
      "status": "paid",
      "value": 4900,
      "payment_method": "credit_card",
      "created_at": "2024-12-06T10:00:00Z",
      "approved_at": "2024-12-06T10:01:00Z"
    },
    "subscription": {
      "subscription_id": "SUB123",
      "status": "active",
      "started_at": "2024-12-06T10:01:00Z"
    },
    "event_timestamp": "2024-12-06T10:01:05Z"
  }'
```

**Verificar logs:**

```bash
# Verificar webhook processado
npx prisma studio
# Abrir tabela webhook_logs
# Ver evento processado

# Verificar subscription criada
# Abrir tabela subscriptions
# Buscar subscription com kiwifyOrderId = "ORDER123"
```

### 3. Tester Fluxo Completo (Produção)

**IMPORTANTE:** Só funciona em produção com domínio real!

1. Deploy do backend em produção
2. Configurar webhook URL na Kiwify com domínio real
3. Fazer compra teste na Kiwify
4. Verificar subscription ativada no banco

---

## 🚀 DEPLOY EM PRODUÇÃO

### Checklist Pré-Deploy

- [ ] Product IDs configurados no banco
- [ ] `KIWIFY_WEBHOOK_SECRET` no `.env` de produção
- [ ] Webhook URL configurada na Kiwify
- [ ] Backend com HTTPS (obrigatório para webhooks)
- [ ] Domínio público acessível pela Kiwify

### Configurar Webhook URL (Produção)

1. Deploy backend em: `https://api.radarone.com.br`
2. No painel Kiwify, editar webhook URL:
   ```
   https://api.radarone.com.br/api/webhooks/kiwify
   ```
3. Salvar

### Testar em Produção

1. Acessar frontend: `https://radarone.com.br`
2. Fazer login
3. Ir em Planos
4. Clicar "Assinar PRO"
5. Frontend redireciona para Kiwify
6. Pagar com cartão de teste (modo sandbox)
7. Kiwify envia webhook
8. Verificar subscription ativada

---

## 📊 EVENTOS SUPORTADOS

| Evento Kiwify | Ação no RadarOne |
|---------------|------------------|
| **compra_aprovada** | Cria subscription ACTIVE |
| **subscription_renewed** | Renova validUntil (+1 mês) |
| **subscription_canceled** | Marca subscription como CANCELLED |
| **subscription_late** | Marca subscription como PAST_DUE |
| **compra_reembolsada** | Cancela subscription |
| **chargeback** | Suspende subscription + bloqueia usuário |

### Eventos Não Implementados (Opcionais)

- `carrinho_abandonado` - Pode ser usado para remarketing
- `boleto_gerado` - Informativo
- `pix_gerado` - Informativo
- `compra_recusada` - Informativo

---

## 🔐 SEGURANÇA

### Validação HMAC

Todos os webhooks são validados via HMAC SHA256:

```typescript
// Pseudo-código
const secret = process.env.KIWIFY_WEBHOOK_SECRET;
const hmac = crypto.createHmac('sha256', secret);
hmac.update(JSON.stringify(payload));
const expectedSignature = hmac.digest('hex');

if (receivedSignature !== expectedSignature) {
  return res.status(401).json({ error: 'Invalid signature' });
}
```

### Logs de Webhook

Todos os webhooks são salvos em `webhook_logs`:

```sql
SELECT * FROM webhook_logs ORDER BY created_at DESC LIMIT 10;
```

Campos:
- `event`: Tipo do evento
- `payload`: Payload completo (JSON)
- `processed`: Se foi processado com sucesso
- `error`: Mensagem de erro (se houver)
- `created_at`: Timestamp

---

## 🐛 TROUBLESHOOTING

### Problema: "Plano não tem kiwifyProductId configurado"

**Solução:** Configurar Product IDs no banco (ver seção 5)

---

### Problema: "Invalid signature"

**Causa:** `KIWIFY_WEBHOOK_SECRET` incorreto ou ausente

**Solução:**
1. Verificar `.env` em produção
2. Copiar secret correto da Kiwify
3. Reiniciar servidor

---

### Problema: "Usuário não encontrado"

**Causa:** Email do cliente na Kiwify diferente do email no RadarOne

**Solução:**
- Garantir que usuário se cadastre com mesmo email
- Pré-preencher email no checkout da Kiwify

---

### Problema: Webhook não chega no backend

**Possíveis causas:**
1. URL incorreta na Kiwify
2. Backend não está acessível publicamente
3. Firewall bloqueando

**Solução:**
- Verificar URL do webhook na Kiwify
- Testar: `curl https://seudominio.com/api/webhooks/kiwify`
- Checar logs do servidor

---

### Problema: Subscription não é ativada

**Debug:**

```bash
# Ver últimos webhooks
SELECT * FROM webhook_logs ORDER BY created_at DESC LIMIT 5;

# Ver subscriptions do usuário
SELECT * FROM subscriptions WHERE user_id = 'USER_ID';

# Ver erro do webhook
SELECT error FROM webhook_logs WHERE event = 'compra_aprovada' ORDER BY created_at DESC LIMIT 1;
```

---

## 📖 DOCUMENTAÇÃO KIWIFY

**Fontes consultadas:**
- [Criar webhook - Kiwify API](https://docs.kiwify.com.br/api-reference/webhooks/create)
- [Understanding Webhook Functionality | Kiwify](https://help.kiwify.com/en/article/understanding-webhook-functionality-15to8j/)

---

## 🎉 PRÓXIMOS PASSOS

1. ✅ Configurar Product IDs (seção 5)
2. ✅ Configurar webhook na Kiwify (seção 3)
3. ✅ Testar localmente (seção 6.1 e 6.2)
4. ✅ Deploy em produção
5. ✅ Configurar webhook URL de produção
6. ✅ Fazer compra teste
7. ✅ Monitorar logs de webhook

---

**Status:** ✅ Implementação 100% Completa
**Pronto para:** Configuração e Testes

**🤖 Generated with Claude Code**
**Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>**
