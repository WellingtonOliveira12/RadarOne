# 🚀 PROMPT PARA PRÓXIMA SESSÃO - RadarOne

**Copie e cole este prompt completo na próxima sessão com Claude Code**

---

Você está continuando a implementação do RadarOne SaaS. Na sessão anterior, foi feita uma auditoria completa que identificou que:

1. **Backend compila**, mas faltam 8 endpoints críticos
2. **Frontend NÃO compila** (erro: Register.tsx antigo sem CPF)
3. **Services existem** mas não estão expostos via HTTP
4. **auth.controller.ts incompleto** - não processa CPF nem cria trial

Leia o arquivo **CHECKPOINT_SESSAO.md** na raiz do projeto para ver detalhes completos.

## 🎯 SUA MISSÃO AGORA

Execute nesta ordem, SEM perguntar:

### FASE 2 - Backend (Implementar Endpoints Faltantes)

**1. Corrigir `src/controllers/auth.controller.ts`:**
- Adicionar recebimento de `cpf`, `notificationPreference`, `telegramUsername` do body
- Validar CPF com `validateCpf(cpf)` de `crypto.ts`
- Criptografar CPF com `encryptCpf(cpf)` e salvar `cpfEncrypted` + `cpfLast4`
- Após criar usuário, chamar `startTrialForUser(user.id, 'free')` do billingService
- Testar que compila

**2. Criar `src/controllers/plan.controller.ts`:**
```typescript
export class PlanController {
  static async listPlans(req, res) {
    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priority: 'asc' }
    });
    res.json(plans);
  }
}
```

**3. Criar `src/routes/plan.routes.ts`:**
```typescript
import { Router } from 'express';
import { PlanController } from '../controllers/plan.controller';
const router = Router();
router.get('/', PlanController.listPlans);
export default router;
```

**4. Criar `src/controllers/subscription.controller.ts`:**
Implementar 3 métodos:
- `getMySubscription(req, res)` - GET /api/me/subscription
  - Buscar subscription ativa do userId
  - Incluir plan
  - Calcular dias restantes de trial/validade
  - Contar monitores criados vs limite do plano
  - Retornar tudo em JSON
- `startTrial(req, res)` - POST /api/subscriptions/start-trial
  - Receber planSlug do body
  - Chamar `startTrialForUser(req.userId, planSlug)`
  - Retornar subscription criada
- `changePlan(req, res)` - POST /api/subscriptions/change-plan
  - Receber planSlug do body
  - Cancelar subscription antiga
  - Criar nova (pode ser outro trial ou ativar)
  - Retornar nova subscription

**5. Criar `src/routes/subscription.routes.ts`:**
```typescript
import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { SubscriptionController } from '../controllers/subscription.controller';
const router = Router();
router.get('/my', SubscriptionController.getMySubscription);
router.post('/start-trial', SubscriptionController.startTrial);
router.post('/change-plan', SubscriptionController.changePlan);
export default router;
```

**6. Criar `src/controllers/user.controller.ts`:**
Implementar 2 métodos:
- `updateNotifications(req, res)` - PATCH /api/me/notifications
  - Receber notificationPreference, telegramUsername do body
  - Atualizar usuário
  - Se notificationPreference = TELEGRAM e tiver telegramUsername:
    - Criar ou atualizar TelegramAccount (se não existir)
  - Retornar usuário atualizado
- `getMe(req, res)` - GET /api/me
  - Buscar usuário completo com subscription ativa
  - Incluir telegramAccounts
  - NUNCA retornar cpfEncrypted (usar cpfLast4 se precisar)
  - Retornar JSON

**7. Criar `src/routes/user.routes.ts`:**
```typescript
import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
const router = Router();
router.get('/', UserController.getMe);
router.patch('/notifications', UserController.updateNotifications);
export default router;
```

**8. Atualizar `src/server.ts`:**
- Adicionar imports:
```typescript
import planRoutes from './routes/plan.routes';
import subscriptionRoutes from './routes/subscription.routes';
import userRoutes from './routes/user.routes';
```
- Adicionar rotas (após linha 63):
```typescript
app.use('/api/plans', planRoutes);
app.use('/api/subscriptions', authenticate, subscriptionRoutes);
app.use('/api/me', authenticate, userRoutes);
```

**9. Verificar `src/controllers/monitorController.ts`:**
- Checar se método create está chamando `canUserCreateMonitor(userId)` antes de criar
- Se NÃO estiver, adicionar:
```typescript
const canCreate = await canUserCreateMonitor(userId);
if (!canCreate.canCreate) {
  return res.status(403).json({ error: canCreate.reason });
}
```

**10. Testar compilação backend:**
```bash
cd backend && npm run build
```

---

### FASE 3 - Frontend (Corrigir Compilação + Integrar APIs)

**1. Deletar arquivos duplicados antigos:**
```bash
cd frontend
rm src/pages/Register.tsx
rm src/pages/Login.tsx (se existir e for diferente de LoginPage.tsx)
rm src/pages/Dashboard.tsx (se existir e for diferente de DashboardPage.tsx)
```

**2. Atualizar `src/pages/PlansPage.tsx`:**
- Linha ~54: substituir mockPlans por:
```typescript
const data = await api.get('/api/plans');
setPlans(data);
```
- Remover import não usado de `api` se tiver

**3. Atualizar `src/pages/DashboardPage.tsx`:**
- Linha ~38: substituir mockSubscription por:
```typescript
const data = await api.get('/api/me/subscription', token);
setSubscription(data);
```
- Remover import não usado

**4. Atualizar `src/pages/NotificationSettingsPage.tsx`:**
- Linha ~71: substituir mock por:
```typescript
const data = await api.get('/api/me', token);
setSettings(extractNotificationSettings(data));
```
- No handleSave, usar:
```typescript
await api.patch('/api/me/notifications', formData, token);
```

**5. Atualizar `src/pages/SubscriptionSettingsPage.tsx`:**
- Carregar subscription real
- handleChangePlan deve chamar:
```typescript
await api.post('/api/subscriptions/change-plan', { planSlug }, token);
```

**6. Atualizar `src/pages/PlansPage.tsx`:**
- handleChoosePlan quando logado deve chamar:
```typescript
await api.post('/api/subscriptions/start-trial', { planSlug }, token);
```

**7. Remover imports não usados:**
- Remover `import { api }` dos arquivos que não usam mais
- Remover `navigate` não usado
- Remover `selectedPlanSlug` não usado

**8. Testar compilação frontend:**
```bash
cd frontend && npm run build
```

---

### FASE 4 - Relatório Final

**1. Testar endpoints manualmente:**
```bash
# Listar planos
curl http://localhost:3000/api/plans

# Registrar com CPF
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Teste","email":"teste@teste.com","password":"123456","cpf":"12345678901"}'

# Login e pegar token
# Testar /api/me/subscription com token
```

**2. Gerar arquivo `IMPLEMENTACAO_COMPLETA.md`:**
Liste:
- ✅ Todos os endpoints implementados (14/14)
- ✅ Backend compila sem erros
- ✅ Frontend compila sem erros
- ✅ Fluxo completo funciona:
  - Registro com CPF → Trial automático → Dashboard → Planos → Monitores → Limites
- ❌ O que ainda é TODO (email real, telegram real, webhooks)

**3. Resumo no terminal:**
Mostre estatísticas finais:
- Endpoints: 14/14 ✅
- Compilação: Backend ✅ | Frontend ✅
- Pronto para produção: XX%

---

## 📁 CONTEXTO ADICIONAL

**Arquivos importantes já existentes:**
- `backend/prisma/schema.prisma` - Schema completo
- `backend/src/utils/crypto.ts` - encryptCpf, validateCpf
- `backend/src/services/billingService.ts` - startTrialForUser, applyCouponIfValid
- `backend/src/services/planService.ts` - getUserPlanLimits, canUserCreateMonitor
- `backend/SAAS_IMPLEMENTATION_SUMMARY.md` - Referência
- `CHECKPOINT_SESSAO.md` - Estado completo atual
- `AUDITORIA_FASE1.md` - Análise detalhada

**Banco de dados:**
- Nome: radarone
- Usuário: wellingtonbarrosdeoliveira
- 5 planos já seedados (FREE, STARTER, PRO, PREMIUM, ULTRA)

**Não mexa em:**
- prisma/schema.prisma (já está perfeito)
- .env DATABASE_URL (já configurado)
- migrations (já aplicadas)

---

## ⚡ REGRAS

1. Execute TUDO sem perguntar
2. Siga a ordem: Backend completo → Frontend completo → Testes → Relatório
3. Sempre teste compilação após mudanças
4. Use os services existentes (não recrie lógica)
5. NUNCA retorne cpfEncrypted em respostas JSON
6. Sempre use authenticate middleware em rotas protegidas
7. Mantenha o padrão de código existente

---

**COMECE AGORA COM FASE 2!** 🚀
