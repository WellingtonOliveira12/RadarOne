# 📋 API de Cupons - Documentação Completa

## 📚 Índice

- [Visão Geral](#visão-geral)
- [Endpoints Públicos](#endpoints-públicos)
- [Endpoints Admin](#endpoints-admin)
- [Formatos e Validações](#formatos-e-validações)
- [Exemplos de Uso](#exemplos-de-uso)

---

## 🎯 Visão Geral

O sistema de cupons do RadarOne permite criar, gerenciar e aplicar cupons de desconto para planos de assinatura.

**Features:**
- ✅ Cupons de desconto percentual ou fixo
- ✅ Limite de usos
- ✅ Data de expiração
- ✅ Aplicação a planos específicos
- ✅ Import/Export CSV
- ✅ Analytics e relatórios
- ✅ Operações em lote (bulk)

---

## 🌍 Endpoints Públicos

### 1. Validar Cupom

```http
POST /api/coupons/validate
```

**Descrição:** Valida se um cupom é válido e retorna informações sobre o desconto.

**Headers:**
```json
{
  "Content-Type": "application/json"
}
```

**Body:**
```json
{
  "code": "PROMO10",
  "planSlug": "premium" // Opcional
}
```

**Resposta (200 OK):**
```json
{
  "valid": true,
  "coupon": {
    "code": "PROMO10",
    "description": "Desconto de 10% em qualquer plano",
    "discountType": "PERCENTAGE",
    "discountValue": 10,
    "appliesToPlan": "Qualquer plano"
  },
  "message": "Cupom válido! O desconto será aplicado no checkout."
}
```

**Resposta (400/404 - Cupom Inválido):**
```json
{
  "valid": false,
  "error": "Cupom inválido ou não encontrado"
}
```

**Regras de Validação:**
- ✅ Cupom deve existir
- ✅ Cupom deve estar ativo (`isActive: true`)
- ✅ Cupom não deve estar expirado
- ✅ Cupom não deve ter atingido limite de usos
- ✅ Se `planSlug` fornecido, cupom deve ser válido para aquele plano

---

### 2. Aplicar Cupom

```http
POST /api/coupons/apply
```

**Descrição:** Registra o uso de um cupom (para tracking).

**Headers:**
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer <JWT_TOKEN>"
}
```

**Body:**
```json
{
  "code": "PROMO10"
}
```

**Resposta (200 OK):**
```json
{
  "success": true,
  "message": "Cupom aplicado com sucesso! O desconto será refletido no checkout."
}
```

---

## 🔐 Endpoints Admin

> **Autenticação:** Todos os endpoints admin requerem token JWT de usuário com role ADMIN.

### 1. Listar Cupons

```http
GET /api/admin/coupons?page=1&limit=20&code=PROMO&status=active&type=PERCENTAGE
```

**Permissão:** Qualquer ADMIN

**Query Parameters:**
- `page` (opcional): Número da página (default: 1)
- `limit` (opcional): Itens por página (default: 20)
- `code` (opcional): Filtrar por código
- `status` (opcional): `active` ou `inactive`
- `type` (opcional): `PERCENTAGE` ou `FIXED`

**Resposta (200 OK):**
```json
{
  "coupons": [
    {
      "id": "uuid",
      "code": "PROMO10",
      "description": "Desconto de 10%",
      "discountType": "PERCENTAGE",
      "discountValue": 10,
      "maxUses": 100,
      "usedCount": 45,
      "expiresAt": "2027-12-31T23:59:59.000Z",
      "isActive": true,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "plan": {
        "id": "uuid",
        "name": "Premium",
        "slug": "premium"
      },
      "_count": {
        "usageLogs": 45
      }
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}
```

---

### 2. Criar Cupom

```http
POST /api/admin/coupons
```

**Permissão:** ADMIN_SUPER ou ADMIN_FINANCE

**Body:**
```json
{
  "code": "SAVE50",
  "description": "Economize R$ 50",
  "discountType": "FIXED",
  "discountValue": 5000,
  "maxUses": 100,
  "expiresAt": "2027-12-31",
  "appliesToPlanId": "uuid-do-plano"
}
```

**Regras de Validação:**
- `code`: Obrigatório, mínimo 3 caracteres, máximo 50, apenas A-Z0-9_-
- `discountType`: `PERCENTAGE` ou `FIXED`
- `discountValue`: Número positivo. Se PERCENTAGE, max 100. Se FIXED, valor em centavos.
- `maxUses`: Opcional, inteiro >= 1, máximo 1.000.000
- `expiresAt`: Opcional, data futura, máximo 10 anos
- `description`: Opcional, máximo 500 caracteres
- `appliesToPlanId`: Opcional, UUID válido de um plano existente

**Resposta (201 Created):**
```json
{
  "coupon": {
    "id": "uuid",
    "code": "SAVE50",
    ...
  },
  "message": "Cupom criado com sucesso"
}
```

---

### 3. Atualizar Cupom

```http
PUT /api/admin/coupons/:id
```

**Permissão:** ADMIN_SUPER ou ADMIN_FINANCE

**Body:** Mesmos campos do POST (todos opcionais)

---

### 4. Ativar/Desativar Cupom

```http
PATCH /api/admin/coupons/:id/toggle
```

**Permissão:** ADMIN_SUPER ou ADMIN_FINANCE

**Body:**
```json
{
  "isActive": true
}
```

---

### 5. Deletar Cupom

```http
DELETE /api/admin/coupons/:id
```

**Permissão:** ADMIN_SUPER apenas

**Resposta (200 OK):**
```json
{
  "message": "Cupom deletado com sucesso"
}
```

**Nota:** Se o cupom tiver usos registrados, ele será desativado ao invés de deletado (smart delete).

---

### 6. Exportar Cupons (CSV)

```http
GET /api/admin/coupons/export?status=active&type=PERCENTAGE
```

**Permissão:** Qualquer ADMIN

**Query Parameters:** Mesmos de listagem

**Resposta:** Arquivo CSV com headers de download

**Formato CSV:**
```csv
Código,Descrição,Tipo,Valor,Máximo de Usos,Usado,Expira em,Status,Plano,Criado em
PROMO10,Desconto 10%,Percentual,10%,100,45,2027-12-31,Ativo,Premium,2026-01-01
```

---

### 7. Importar Cupons (CSV)

```http
POST /api/admin/coupons/import
```

**Permissão:** ADMIN_SUPER ou ADMIN_FINANCE

**Headers:**
```http
Content-Type: multipart/form-data
Authorization: Bearer <JWT_TOKEN>
```

**Body:**
```
file: <arquivo.csv>
```

**Formato CSV Esperado:**
```csv
code,description,discountType,discountValue,maxUses,expiresAt,planSlug
PROMO10,Desconto 10%,PERCENTAGE,10,100,2027-12-31,
SAVE50,Economize 50,FIXED,5000,50,2027-12-31,premium
```

**Validações Extras:**
- Máximo 1000 linhas por importação
- Código: 3-50 caracteres, alfanuméricos + _ -
- maxUses: 1 a 1.000.000
- expiresAt: Data futura, máximo 10 anos
- description: Máximo 500 caracteres

**Resposta (200 OK):**
```json
{
  "message": "Importação concluída: 98 sucesso, 2 erros",
  "results": {
    "total": 100,
    "success": ["PROMO10", "SAVE50", ...],
    "errors": [
      {
        "line": 5,
        "code": "AB",
        "error": "Código inválido (mínimo 3 caracteres)"
      }
    ]
  }
}
```

---

### 8. Analytics de Cupons

```http
GET /api/admin/coupons/analytics?startDate=2026-01-01&endDate=2026-01-31&groupBy=day
```

**Permissão:** Qualquer ADMIN

**Query Parameters:**
- `startDate` (opcional): Data inicial (default: 30 dias atrás)
- `endDate` (opcional): Data final (default: hoje)
- `groupBy` (opcional): `day`, `week`, `month` (default: `day`)

**Features:**
- ✅ Cache de 5 minutos para melhor performance
- ✅ Métricas detalhadas e agregadas

**Resposta (200 OK):**
```json
{
  "period": {
    "start": "2026-01-01T00:00:00.000Z",
    "end": "2026-01-31T23:59:59.000Z",
    "groupBy": "day"
  },
  "stats": {
    "totalCoupons": 150,
    "usedCoupons": 85,
    "unusedCoupons": 65,
    "totalUsages": 1245,
    "conversionRate": "56.67",
    "activeCoupons": 120,
    "inactiveCoupons": 30,
    "expiringSoon": 5,
    "nearLimit": 8,
    "percentageCoupons": 90,
    "fixedCoupons": 60
  },
  "timeSeries": [
    {
      "period": "2026-01-01",
      "count": 45
    }
  ],
  "topCoupons": [
    {
      "code": "PROMO10",
      "count": 234,
      "type": "PERCENTAGE",
      "value": 10
    }
  ],
  "typeDistribution": [
    {
      "type": "PERCENTAGE",
      "count": 890
    },
    {
      "type": "FIXED",
      "count": 355
    }
  ]
}
```

---

### 9. Operações em Lote (Bulk)

#### 9.1 Ativar/Desativar em Lote

```http
PATCH /api/admin/coupons/bulk/toggle
```

**Permissão:** ADMIN_SUPER ou ADMIN_FINANCE

**Body:**
```json
{
  "couponIds": ["uuid1", "uuid2", "uuid3"],
  "isActive": true
}
```

**Resposta (200 OK):**
```json
{
  "message": "3 cupons atualizados com sucesso",
  "updated": 3
}
```

---

#### 9.2 Deletar em Lote

```http
DELETE /api/admin/coupons/bulk
```

**Permissão:** ADMIN_SUPER apenas

**Body:**
```json
{
  "couponIds": ["uuid1", "uuid2", "uuid3"]
}
```

**Resposta (200 OK):**
```json
{
  "message": "2 cupons deletados, 1 cupons desativados",
  "deleted": 2,
  "deactivated": 1
}
```

**Nota:** Cupons com usos serão desativados, não deletados (smart delete).

---

## 📊 Formatos e Validações

### Tipos de Desconto

| Tipo | Descrição | Valor | Exemplo |
|------|-----------|-------|---------|
| `PERCENTAGE` | Desconto percentual | 1 a 100 | `10` = 10% |
| `FIXED` | Desconto fixo em centavos | > 0 | `5000` = R$ 50,00 |

### Status do Cupom

- ✅ **Ativo**: `isActive: true` - Cupom pode ser usado
- ❌ **Inativo**: `isActive: false` - Cupom não pode ser usado

### Validações de Código

- **Tamanho:** 3 a 50 caracteres
- **Caracteres permitidos:** A-Z, 0-9, hífen (-), underscore (_)
- **Formato:** Sempre convertido para UPPERCASE

### Regras de Expiração

- Data deve ser futura
- Máximo 10 anos no futuro
- Formato: ISO 8601 (`YYYY-MM-DD` ou `YYYY-MM-DDTHH:MM:SS`)

---

## 💡 Exemplos de Uso

### Exemplo 1: Criar Cupom de 10% para Premium

```bash
curl -X POST https://api.radarone.com/api/admin/coupons \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "PREMIUM10",
    "description": "10% de desconto no plano Premium",
    "discountType": "PERCENTAGE",
    "discountValue": 10,
    "maxUses": 100,
    "expiresAt": "2027-12-31",
    "appliesToPlanId": "uuid-do-plano-premium"
  }'
```

### Exemplo 2: Validar Cupom (Frontend)

```javascript
const response = await fetch('/api/coupons/validate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code: 'PROMO10',
    planSlug: 'premium'
  })
});

const result = await response.json();
if (result.valid) {
  console.log(`Desconto: ${result.coupon.discountValue}%`);
}
```

### Exemplo 3: Importar Cupons em Lote

**Arquivo: cupons.csv**
```csv
code,description,discountType,discountValue,maxUses,expiresAt,planSlug
NATAL2026,Natal 2026,PERCENTAGE,20,500,2026-12-31,
ANO_NOVO,Ano Novo,FIXED,10000,200,2027-01-15,
BLACK_FRIDAY,Black Friday,PERCENTAGE,50,1000,2026-11-30,premium
```

**Upload:**
```bash
curl -X POST https://api.radarone.com/api/admin/coupons/import \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@cupons.csv"
```

---

## 🔒 Segurança e Auditoria

Todas as operações admin são registradas em **Audit Logs** com:
- ✅ Email do admin responsável
- ✅ Ação realizada (`COUPON_CREATED`, `COUPON_UPDATED`, etc)
- ✅ Dados antes/depois
- ✅ IP e User-Agent
- ✅ Timestamp

---

## 📈 Performance

- **Cache:** Analytics com cache de 5 minutos
- **Rate Limiting:** Protegido por rate limiter global
- **Paginação:** Padrão de 20 itens por página
- **Validações:** Todas no backend para segurança

---

## 🐛 Tratamento de Erros

Todos os endpoints retornam erros padronizados:

```json
{
  "error": "Mensagem de erro legível"
}
```

**Códigos HTTP:**
- `200` - Sucesso
- `201` - Criado com sucesso
- `400` - Erro de validação
- `401` - Não autenticado
- `403` - Sem permissão
- `404` - Não encontrado
- `500` - Erro interno do servidor

---

## 📞 Suporte

Para dúvidas ou problemas:
- **Email:** suporte@radarone.com.br
- **Docs:** https://docs.radarone.com.br

---

**Última atualização:** 2026-01-01
**Versão da API:** v1.0
