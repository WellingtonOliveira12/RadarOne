# 🔗 Integração Kiwify - Cupons de Desconto

## 📋 Status Atual

✅ **PREPARADO**: Código pronto para receber cupons
⚠️ **PENDENTE**: Aplicação real do desconto depende da API Kiwify

---

## ✨ O que JÁ está implementado

### Backend

1. ✅ **Validação de cupons no checkout**
   - `POST /api/subscriptions/create-checkout` aceita `couponCode`
   - Valida cupom (ativo, não expirado, dentro de maxUses)
   - Rejeita cupons TRIAL_UPGRADE (apenas DISCOUNT no checkout)

2. ✅ **Cupom adicionado à URL Kiwify**
   - Query params: `?coupon=XXX&discount_code=XXX`
   - Log de warning se Kiwify não suportar

3. ✅ **Interface preparada**
   - `CheckoutParams.couponCode`
   - `generateCheckoutUrl()` aceita cupons

### Arquivos Modificados

- `backend/src/services/kiwifyService.ts:20` - Interface CheckoutParams
- `backend/src/services/kiwifyService.ts:86-112` - Lógica de cupom na URL
- `backend/src/controllers/subscription.controller.ts:397-452` - Validação no checkout

---

## ⚠️ O que FALTA (Depende da API Kiwify)

A aplicação REAL do desconto no checkout Kiwify requer:

### Opção 1: API REST da Kiwify (IDEAL)

Se Kiwify tiver API REST para cupons:

```typescript
// Exemplo hipotético
import axios from 'axios';

async function applyKiwifyCoupon(productId: string, couponCode: string) {
  const response = await axios.post('https://api.kiwify.com.br/v1/coupons/apply', {
    product_id: productId,
    coupon_code: couponCode,
  }, {
    headers: {
      'Authorization': `Bearer ${process.env.KIWIFY_API_KEY}`,
    },
  });

  return {
    originalPrice: response.data.original_price,
    discountedPrice: response.data.discounted_price,
    discount: response.data.discount,
  };
}
```

### Opção 2: Query Params (SE KIWIFY SUPORTAR)

```typescript
// Já implementado no código atual
// Kiwify precisa reconhecer:
// https://pay.kiwify.com.br/{product_id}?coupon=CODE123
```

### Opção 3: Webhooks (Contabilização Manual)

Se Kiwify não suporta cupons nativamente:

1. **Criar produto temporário** com preço reduzido
2. **Processar reembolso** parcial após pagamento
3. **Migrar para outro gateway** (Stripe, Paddle, Mercado Pago)

---

## 🔧 Como Completar a Integração

### Passo 1: Verificar Documentação Kiwify

```bash
# Consultar docs oficiais
https://docs.kiwify.com.br/
```

Procurar por:
- Suporte a cupons de desconto
- API REST endpoints
- Query parameters aceitos
- Webhook payload fields

### Passo 2: Testar Query Params (Mais Rápido)

```bash
# Teste manual
https://pay.kiwify.com.br/{PRODUCT_ID}?email=test@email.com&coupon=TESTCODE
```

Se funcionar:
- ✅ Nada mais precisa ser feito no código!
- ✅ Kiwify já aplica desconto automaticamente

### Passo 3: Implementar API REST (Se Disponível)

Se Kiwify tiver API, adicionar em `kiwifyService.ts`:

```typescript
// Novo arquivo: backend/src/services/kiwifyApi.ts
import axios from 'axios';

const KIWIFY_API_URL = process.env.KIWIFY_API_URL || 'https://api.kiwify.com.br/v1';
const KIWIFY_API_KEY = process.env.KIWIFY_API_KEY;

export async function createKiwifyCheckoutWithCoupon(params: {
  productId: string;
  email: string;
  couponCode: string;
}) {
  const response = await axios.post(`${KIWIFY_API_URL}/checkouts`, {
    product_id: params.productId,
    customer_email: params.email,
    coupon_code: params.couponCode,
  }, {
    headers: {
      'Authorization': `Bearer ${KIWIFY_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  return {
    checkoutUrl: response.data.checkout_url,
    finalPrice: response.data.final_price,
  };
}
```

Atualizar `generateCheckoutUrl()`:

```typescript
if (couponCode && KIWIFY_API_KEY) {
  // Usar API REST para aplicar cupom
  const apiResult = await createKiwifyCheckoutWithCoupon({
    productId: plan.kiwifyProductId,
    email: user.email,
    couponCode,
  });

  return {
    checkoutUrl: apiResult.checkoutUrl,
    planName: plan.name,
    price: apiResult.finalPrice,
  };
}
```

### Passo 4: Atualizar Webhook Handler

Se Kiwify enviar desconto no webhook, atualizar handler:

```typescript
// backend/src/controllers/webhook.controller.ts
// (procurar handler de webhook Kiwify)

// Adicionar campos do webhook:
const {
  product_id,
  customer_email,
  status,
  coupon_code,        // ADICIONAR
  original_price,     // ADICIONAR
  final_price,        // ADICIONAR
  discount_amount,    // ADICIONAR
} = webhookPayload;

// Registrar cupom usado
if (coupon_code) {
  await prisma.couponUsage.create({
    data: {
      couponId: (await prisma.coupon.findUnique({ where: { code: coupon_code } }))!.id,
      userId: user.id,
    },
  });

  await prisma.coupon.update({
    where: { code: coupon_code },
    data: { usedCount: { increment: 1 } },
  });
}
```

---

## 🧪 Como Testar

### Teste Local (Mock)

```bash
# 1. Criar cupom de teste no admin
# Code: TESTE10
# Type: PERCENTAGE
# Value: 10
# Purpose: DISCOUNT

# 2. Criar checkout com cupom
curl -X POST http://localhost:4000/api/subscriptions/create-checkout \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"planSlug":"premium","couponCode":"TESTE10"}'

# 3. Verificar URL gerada
# Deve conter: ?coupon=TESTE10&discount_code=TESTE10
```

### Teste em Produção

1. Criar cupom real no admin
2. Tentar checkout com cupom
3. Verificar em Kiwify se desconto foi aplicado
4. Se não funcionou, verificar logs do backend

---

## 📊 Alternativas se Kiwify Não Suportar Cupons

### 1. Produtos Temporários (Workaround)

```typescript
// Criar produto Kiwify com preço reduzido temporariamente
// Exemplo: Plano Premium R$99 → Criar "Premium-DESC10" R$89,10
```

**Prós**: Funciona imediatamente
**Contras**: Gerenciamento manual, não escala

### 2. Reembolso Parcial (Workaround)

```typescript
// 1. Usuário paga preço cheio
// 2. Webhook ativa subscription
// 3. Sistema processa reembolso parcial via API Kiwify
```

**Prós**: Desconto real aplicado
**Contras**: Experiência ruim para usuário, atraso

### 3. Migrar Gateway (Solução Definitiva)

Considerar migração para:
- **Stripe**: Suporte nativo a cupons, API robusta
- **Paddle**: Otimizado para SaaS, cupons built-in
- **Mercado Pago**: Brasileiro, suporta cupons

**Prós**: Funcionalidade completa
**Contras**: Esforço de migração

---

## ✅ Checklist de Implementação

- [x] Validação de cupons no backend
- [x] Cupom adicionado à URL Kiwify
- [x] Separação DISCOUNT vs TRIAL_UPGRADE
- [ ] Verificar documentação Kiwify
- [ ] Testar query params com cupom
- [ ] Implementar API REST (se disponível)
- [ ] Atualizar webhook handler
- [ ] Testes E2E do fluxo completo
- [ ] Documentar para usuários finais

---

## 📞 Próximos Passos

1. **Contatar Kiwify**: Perguntar sobre suporte a cupons
2. **Testar URL**: Fazer checkout manual com `?coupon=CODE`
3. **Implementar**: Seguir Passo 3 ou Passo 4 acima
4. **Testar**: Verificar todo o fluxo (checkout → webhook → contabilização)

---

## 💡 Dicas

- Sempre validar cupom no backend (já implementado)
- Nunca confiar apenas no frontend
- Contabilizar uso APENAS no webhook de confirmação
- Logar todas as tentativas de uso de cupom
- Monitorar taxa de conversão com cupons

---

**Status**: ⚠️ Aguardando documentação/API Kiwify
**Última atualização**: 02/01/2026
**Responsável**: Time de Desenvolvimento RadarOne
