# 🎟️ Cupons de Upgrade - Documentação Completa

## 📋 Resumo da Feature

Implementação de **dois tipos de cupons** para o RadarOne:

### Tipo A: TRIAL_UPGRADE (NOVO)
- **Uso**: Página `/plans`
- **Resultado**: Libera acesso premium temporário por X dias (1-60 dias)
- **NÃO altera cobrança**: Apenas cria subscription temporária
- **Contabilização**: Imediata ao resgatar cupom

### Tipo B: DISCOUNT (EXISTENTE)
- **Uso**: Checkout/assinatura
- **Resultado**: Aplica desconto financeiro (% ou R$)
- **Contabilização**: Quando pagamento é confirmado
- **Nota**: Como o checkout é externo (Kiwify), validação é feita mas aplicação real fica no provedor

---

## 📁 Arquivos Alterados

### Backend

**Migração de Schema**
- `backend/prisma/schema.prisma` - Adicionado `purpose` e `durationDays` ao modelo Coupon
- `backend/prisma/migrations/20260102022135_add_coupon_purpose_and_duration/` - Nova migration

**Controllers**
- `backend/src/controllers/coupon.controller.ts:162-359` - Novo endpoint `redeemTrialUpgrade()`
- `backend/src/controllers/admin.controller.ts:2329-2470` - `createCoupon()` atualizado
- `backend/src/controllers/admin.controller.ts:2477-2580` - `updateCoupon()` atualizado

**Routes**
- `backend/src/routes/coupon.routes.ts:13-15` - Nova rota POST `/redeem-trial-upgrade`

### Frontend

**Páginas**
- `frontend/src/pages/PlansPage.tsx:45-53` - Novo state para cupom
- `frontend/src/pages/PlansPage.tsx:101-147` - Nova função `handleApplyCoupon()`
- `frontend/src/pages/PlansPage.tsx:230-285` - Nova UI de cupom (input + sucesso)
- `frontend/src/pages/PlansPage.tsx:519-601` - Novos estilos CSS

**Admin**
- `frontend/src/pages/AdminCouponsPage.tsx:137-147` - Atualizado formData com `purpose` e `durationDays`
- `frontend/src/pages/AdminCouponsPage.tsx:234-270` - Validação condicional por tipo
- `frontend/src/pages/AdminCouponsPage.tsx:272-313` - `handleCreateCoupon()` envia novos campos
- `frontend/src/pages/AdminCouponsPage.tsx:316-375` - `handleEditCoupon()` envia novos campos
- `frontend/src/pages/AdminCouponsPage.tsx:453-467` - `openEditModal()` carrega novos campos
- `frontend/src/pages/AdminCouponsPage.tsx:1165-1231` - Modal criar: campos condicionais
- `frontend/src/pages/AdminCouponsPage.tsx:1303-1369` - Modal editar: campos condicionais

---

## ✅ O que Funciona (Já Implementado)

### ✅ Backend
- [x] Schema atualizado com `purpose` e `durationDays` (backwards-compatible)
- [x] Migration aplicada no banco de dados
- [x] Endpoint `/api/coupons/redeem-trial-upgrade` funcionando
- [x] Admin pode criar cupons de ambos os tipos
- [x] Admin pode editar cupons de ambos os tipos
- [x] Validações corretas por tipo de cupom

### ✅ Frontend
- [x] Página `/plans` exibe campo de cupom (apenas para usuários logados)
- [x] Validação e mensagens de erro/sucesso
- [x] Modal admin com campos condicionais (purpose + durationDays)
- [x] Interface responsiva e intuitiva

### ✅ Sistema de Autorização
- [x] Trial upgrades são reconhecidos automaticamente (subscription.status=TRIAL)
- [x] Middleware `checkTrialExpired` funciona corretamente
- [x] Helper `getSubscriptionStatus` verifica trial válido

---

## ⚠️ Limitações Conhecidas

1. **Desconto no Checkout Externo**: Como o checkout é feito via Kiwify (externo), cupons de DISCOUNT são validados mas a aplicação real do desconto deve ser feita manualmente ou via integração com Kiwify.

2. **Sem Stacking de Upgrades**: Não é possível acumular múltiplos trial upgrades. Se aplicar novo cupom, o anterior é cancelado.

3. **Sem Downgrade Automático**: Cupom não pode ser usado se usuário já tem subscription ACTIVE do mesmo plano.

---

## 🧪 Como Testar Localmente

### 1. Preparar Ambiente

```bash
# Backend: aplicar migration
cd backend
npx prisma migrate dev

# Frontend: instalar dependências (se necessário)
cd ../frontend
npm install

# Rodar backend
cd ../backend
npm run dev

# Rodar frontend (em outro terminal)
cd ../frontend
npm run dev
```

### 2. Criar Cupom de TRIAL_UPGRADE (Admin)

1. Login como admin no sistema
2. Acessar `/admin/coupons`
3. Clicar em "+ Novo Cupom"
4. Preencher:
   - **Código**: `VIP7D` (exemplo)
   - **Descrição**: `Acesso VIP por 7 dias`
   - **Finalidade**: `Trial Upgrade (Acesso Temporário)`
   - **Duração (dias)**: `7`
   - **Plano Aplicável**: Escolher plano desejado (ou "Todos os planos")
   - **Máximo de Usos**: `10` (ou deixar vazio para ilimitado)
   - **Data de Expiração**: Escolher data futura
5. Salvar

### 3. Resgatar Cupom (/plans)

1. Login como usuário normal
2. Acessar `/plans`
3. Ver seção "Tem um cupom de upgrade?"
4. Digite `VIP7D` e clique em "Aplicar cupom"
5. Deve aparecer mensagem de sucesso: "Cupom aplicado! Você ganhou acesso ao plano X por 7 dias!"
6. Botão "Ir para o Dashboard" aparece
7. Acessar dashboard e verificar que tem acesso premium

### 4. Verificar Subscription Criada

1. Login como admin
2. Acessar `/admin/subscriptions`
3. Verificar que foi criada uma subscription com:
   - Status: `TRIAL`
   - Plano: O plano definido no cupom
   - `trialEndsAt`: Data atual + 7 dias
   - `externalProvider`: `COUPON_TRIAL_UPGRADE`

### 5. Testar Acesso Premium

1. Como usuário com cupom aplicado
2. Tentar criar monitores acima do limite free
3. Deve ter sucesso (acesso ao plano superior)

---

## 🚀 Checklist de Deploy

### Pré-Deploy

- [ ] Revisar código (git diff)
- [ ] Testar localmente (seguir seção "Como Testar")
- [ ] Backup do banco de dados de produção

### Deploy Backend

```bash
# 1. Pull das mudanças
cd backend
git pull origin main

# 2. Aplicar migration
npx prisma migrate deploy

# 3. Rebuild (se necessário)
npm run build

# 4. Restart do servidor
pm2 restart radarone-backend
# OU
systemctl restart radarone-backend
```

### Deploy Frontend

```bash
# 1. Pull das mudanças
cd frontend
git pull origin main

# 2. Build
npm run build

# 3. Deploy (depende do setup)
# Vercel: git push origin main (auto-deploy)
# Nginx: copiar build/ para /var/www/radarone/
```

### Pós-Deploy

- [ ] Verificar logs do backend (erros de migration)
- [ ] Testar criação de cupom TRIAL_UPGRADE no admin
- [ ] Testar resgate de cupom na página /plans
- [ ] Verificar subscription criada no banco
- [ ] Monitorar logs por 1 hora

---

## 🔄 Plano de Rollback

### Se algo der errado (cenário crítico)

#### 1. Rollback do Código (Git)

```bash
# Backend
cd backend
git revert <commit-hash-da-feature>
git push origin main
pm2 restart radarone-backend

# Frontend
cd frontend
git revert <commit-hash-da-feature>
git push origin main
npm run build
```

#### 2. Rollback do Banco de Dados

**IMPORTANTE**: A migration adiciona campos **nullable** (purpose e durationDays), então **NÃO quebra** cupons existentes.

Se precisar reverter a migration:

```bash
cd backend

# Ver migrations aplicadas
npx prisma migrate status

# Reverter última migration (CUIDADO: pode perder dados)
# Recomendação: NÃO faça isso em produção sem backup
npx prisma migrate reset # APENAS EM DEV

# EM PRODUÇÃO: remover migration manualmente do banco
psql -U radarone_user -d radarone_prod
```

```sql
-- Remover colunas adicionadas (se NECESSÁRIO)
ALTER TABLE coupons DROP COLUMN purpose;
ALTER TABLE coupons DROP COLUMN duration_days;

-- Remover registro da migration
DELETE FROM _prisma_migrations
WHERE migration_name = '20260102022135_add_coupon_purpose_and_duration';
```

**Nota**: Como os campos são nullable, **não é necessário** rollback do banco. Apenas do código já resolve.

---

## 🧩 Diferenças entre TRIAL_UPGRADE e DISCOUNT

| Aspecto | TRIAL_UPGRADE | DISCOUNT |
|---------|---------------|----------|
| **Onde usar** | Página `/plans` | Checkout (externo Kiwify) |
| **O que faz** | Cria subscription TRIAL temporária | Reduz preço no checkout |
| **Campos necessários** | `purpose=TRIAL_UPGRADE`, `durationDays` | `purpose=DISCOUNT`, `discountType`, `discountValue` |
| **Quando contabiliza** | Imediatamente ao resgatar | Quando pagamento é confirmado |
| **Altera cobrança?** | Não | Sim |
| **Endpoint** | POST `/api/coupons/redeem-trial-upgrade` | POST `/api/coupons/validate` (validação apenas) |
| **Requer login?** | Sim | Não (pode validar sem login) |

---

## 📊 Quando o Cupom é Contabilizado

### TRIAL_UPGRADE
1. Usuário aplica cupom na página `/plans`
2. Backend valida cupom (ativo, não expirado, dentro de maxUses)
3. **Imediatamente**:
   - `CouponUsage` é criado
   - `usedCount` é incrementado
4. Subscription TRIAL é criada
5. Usuário ganha acesso

**Contabilização**: Imediata, no momento do resgate

### DISCOUNT
1. Usuário insere cupom no checkout (Kiwify)
2. Kiwify valida cupom via API (future integration)
3. Desconto é aplicado no pagamento
4. **Após confirmação de pagamento**:
   - Webhook Kiwify notifica backend
   - Backend contabiliza uso do cupom

**Contabilização**: Após pagamento confirmado (via webhook)

---

## 📝 Exemplos de Uso

### Criar Cupom de 7 Dias VIP

```json
POST /api/admin/coupons
{
  "code": "VIP7D",
  "description": "Acesso VIP por 7 dias",
  "purpose": "TRIAL_UPGRADE",
  "durationDays": 7,
  "maxUses": 100,
  "expiresAt": "2026-03-01T23:59:59",
  "appliesToPlanId": "<id-do-plano-premium>"
}
```

### Criar Cupom de 20% de Desconto

```json
POST /api/admin/coupons
{
  "code": "DESC20",
  "description": "20% de desconto",
  "purpose": "DISCOUNT",
  "discountType": "PERCENTAGE",
  "discountValue": 20,
  "maxUses": 50,
  "expiresAt": "2026-03-01T23:59:59",
  "appliesToPlanId": null
}
```

---

## 🐛 Troubleshooting

### Cupom não está aplicando

1. Verificar se cupom está ativo: `isActive = true`
2. Verificar se não expirou: `expiresAt > now`
3. Verificar se não atingiu limite: `usedCount < maxUses`
4. Ver logs do backend para erro específico

### Usuário não consegue acessar premium após cupom

1. Verificar se subscription foi criada: `/api/admin/subscriptions`
2. Verificar status: deve ser `TRIAL`
3. Verificar `trialEndsAt`: deve ser no futuro
4. Limpar cache do frontend (F5)

### Migration falhou

```bash
# Ver status
npx prisma migrate status

# Resolver migration pendente
npx prisma migrate resolve --applied "20260102022135_add_coupon_purpose_and_duration"

# Ou aplicar novamente
npx prisma migrate deploy
```

---

## 🎯 Próximos Passos (Opcionais)

1. **Integração com Kiwify**: Aplicar desconto real no checkout via API Kiwify
2. **Testes E2E**: Playwright para cobrir fluxos completos
3. **Analytics**: Rastrear uso de cupons (quais mais usados, taxa de conversão)
4. **Notificações**: Email quando cupom de trial upgrade está prestes a expirar
5. **Admin Dashboard**: Gráfico de uso de cupons por tipo

---

## 📞 Contato

Dúvidas ou problemas? Abrir issue no repositório ou contatar o time de desenvolvimento.

**Última atualização**: 02/01/2026
**Versão**: 1.0.0
**Status**: ✅ Pronto para produção
