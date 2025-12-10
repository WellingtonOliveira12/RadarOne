# 🚀 PROMPT PARA PRÓXIMA SESSÃO - Área Administrativa RadarOne

**Data de Criação:** 06/12/2024
**Sessão Atual:** Implementação Gateway Kiwify (Concluída ✅)
**Próxima Sessão:** Passo 6 - Área Administrativa

---

## 📋 COPIE E COLE ESTE PROMPT NA PRÓXIMA SESSÃO

```
Você está continuando o desenvolvimento do RadarOne SaaS.

CONTEXTO DO QUE JÁ FOI FEITO:

✅ SESSÃO 1: Completar 15% faltantes
- Scheduler automático (node-cron) ✅
- EmailService com Resend ✅
- NotificationService (Telegram E Email) ✅
- Jobs de trial e subscription ✅
- Testes end-to-end passando ✅

✅ SESSÃO 2: Gateway de Pagamento Kiwify
- Tipos TypeScript para webhooks ✅
- WebhookController com 6 handlers ✅
- KiwifyService para checkout ✅
- Endpoint POST /api/subscriptions/create-checkout ✅
- Endpoint POST /api/webhooks/kiwify ✅
- Documentação completa (KIWIFY_INTEGRATION_GUIDE.md) ✅
- Backend compila sem erros ✅

ESTADO ATUAL DO PROJETO:
- Backend: 100% funcional
- Frontend: 100% implementado (SaaS completo)
- Database: Schema completo, 5 planos seedados
- Emails: Resend configurado (modo DEV)
- Scheduler: Jobs rodando automaticamente
- Gateway: Kiwify integrado e pronto para configuração
- Compilação: ✅ SEM ERROS

---

## 🎯 SUA MISSÃO AGORA: PASSO 6 - ÁREA ADMINISTRATIVA

Implementar endpoints de administração para gerenciar o sistema RadarOne.

Execute na seguinte ordem, SEM perguntar:

### FASE 1: Criar Controller de Admin

Criar arquivo: `backend/src/controllers/admin.controller.ts`

Implementar os seguintes métodos (classe AdminController):

1. **listUsers(req, res)** - GET /api/admin/users
   - Listar todos os usuários com paginação
   - Filtros: status (blocked/active), role, email (search)
   - Incluir: subscription atual, total de monitores
   - Paginação: page, limit (default: 20)
   - Ordenação: createdAt DESC
   - Retornar: users[], total, page, totalPages

2. **getUserDetails(req, res)** - GET /api/admin/users/:id
   - Detalhes completos de 1 usuário
   - Incluir: subscriptions (histórico), monitors, usage_logs
   - Estatísticas: total de monitores, alertas enviados, último login
   - NÃO retornar: passwordHash, cpfEncrypted (apenas cpfLast4)

3. **blockUser(req, res)** - POST /api/admin/users/:id/block
   - Marcar user.blocked = true
   - Cancelar subscriptions ativas
   - Desativar monitores
   - Enviar email de notificação (opcional)
   - Registrar log de ação

4. **unblockUser(req, res)** - POST /api/admin/users/:id/unblock
   - Marcar user.blocked = false
   - Registrar log de ação

5. **listSubscriptions(req, res)** - GET /api/admin/subscriptions
   - Listar todas as subscriptions
   - Filtros: status, planId, userId
   - Incluir: user (name, email), plan (name)
   - Paginação: page, limit
   - Ordenação: createdAt DESC

6. **updateSubscription(req, res)** - PATCH /api/admin/subscriptions/:id
   - Atualizar status manualmente
   - Atualizar validUntil
   - Body: { status?, validUntil? }
   - Registrar log de alteração

7. **getSystemStats(req, res)** - GET /api/admin/stats
   - Total de usuários (ativos, bloqueados)
   - Total de subscriptions por status
   - Total de monitores (ativos, inativos)
   - Total de webhooks processados (últimos 7 dias)
   - Receita estimada mensal (sum de subscriptions ACTIVE)
   - Top 5 planos mais populares

8. **listWebhookLogs(req, res)** - GET /api/admin/webhooks
   - Listar logs de webhooks
   - Filtros: event, processed (true/false)
   - Paginação: page, limit
   - Ordenação: createdAt DESC
   - Incluir: payload (resumido), error

9. **listMonitors(req, res)** - GET /api/admin/monitors
   - Listar todos os monitores
   - Filtros: userId, site, active
   - Incluir: user (name, email)
   - Paginação: page, limit

### FASE 2: Criar Middleware de Admin

Criar arquivo: `backend/src/middlewares/admin.middleware.ts`

Implementar função: `requireAdmin(req, res, next)`
- Verificar se req.userId existe (já autenticado)
- Buscar usuário no banco
- Verificar se user.role === 'ADMIN'
- Se não: retornar 403 { error: 'Acesso negado. Apenas administradores.' }
- Se sim: chamar next()

### FASE 3: Criar Rotas de Admin

Criar arquivo: `backend/src/routes/admin.routes.ts`

```typescript
import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { requireAdmin } from '../middlewares/admin.middleware';

const router = Router();

// Todas as rotas de admin requerem: authenticate + requireAdmin
// (authenticate já aplicado no server.ts)

// Usuários
router.get('/users', requireAdmin, AdminController.listUsers);
router.get('/users/:id', requireAdmin, AdminController.getUserDetails);
router.post('/users/:id/block', requireAdmin, AdminController.blockUser);
router.post('/users/:id/unblock', requireAdmin, AdminController.unblockUser);

// Subscriptions
router.get('/subscriptions', requireAdmin, AdminController.listSubscriptions);
router.patch('/subscriptions/:id', requireAdmin, AdminController.updateSubscription);

// Sistema
router.get('/stats', requireAdmin, AdminController.getSystemStats);
router.get('/webhooks', requireAdmin, AdminController.listWebhookLogs);
router.get('/monitors', requireAdmin, AdminController.listMonitors);

export default router;
```

### FASE 4: Integrar no Server

Editar: `backend/src/server.ts`

1. Importar:
```typescript
import adminRoutes from './routes/admin.routes';
```

2. Adicionar rota (após linha das outras rotas):
```typescript
app.use('/api/admin', authenticateToken, adminRoutes); // Protegida (auth + admin)
```

### FASE 5: Criar Usuário Admin de Teste

Criar arquivo: `backend/scripts/create-admin.ts`

```typescript
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createAdmin() {
  const email = 'admin@radarone.com';
  const password = 'admin123'; // TROCAR EM PRODUÇÃO!

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('❌ Admin já existe');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.create({
    data: {
      name: 'Administrador',
      email,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
    }
  });

  console.log('✅ Admin criado:', admin.email);
  console.log('📧 Email:', email);
  console.log('🔑 Senha:', password);

  await prisma.$disconnect();
}

createAdmin();
```

Executar:
```bash
npx ts-node backend/scripts/create-admin.ts
```

### FASE 6: Testar Compilação

```bash
cd backend
npm run build
```

Verificar: ✅ Compila sem erros

### FASE 7: Testar Endpoints

1. Criar admin:
```bash
npx ts-node backend/scripts/create-admin.ts
```

2. Fazer login como admin:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@radarone.com","password":"admin123"}'
```

Copiar o token JWT retornado.

3. Testar endpoint de stats:
```bash
curl -X GET http://localhost:3000/api/admin/stats \
  -H "Authorization: Bearer SEU_TOKEN_JWT"
```

4. Testar listagem de usuários:
```bash
curl -X GET "http://localhost:3000/api/admin/users?page=1&limit=10" \
  -H "Authorization: Bearer SEU_TOKEN_JWT"
```

### FASE 8: Gerar Documentação

Criar arquivo: `ADMIN_MODULE_REPORT.md`

Incluir:
- Arquivos criados (4 arquivos + 1 script)
- Endpoints implementados (9 endpoints)
- Como criar usuário admin
- Exemplos de uso de cada endpoint
- Tabela de permissões
- Estatísticas (linhas de código, etc.)

---

## ⚠️ REGRAS IMPORTANTES

1. SEMPRE verificar user.role === 'ADMIN' em todas as rotas admin
2. NUNCA retornar passwordHash ou cpfEncrypted nas respostas
3. SEMPRE usar paginação em listagens (default: 20 itens)
4. SEMPRE registrar logs de ações administrativas
5. SEMPRE validar req.userId antes de buscar usuário
6. Incluir comentários claros em todos os métodos
7. Tratar erros adequadamente (try/catch)
8. Seguir padrão de código existente

---

## 📊 CHECKLIST DE ENTREGA

Ao finalizar, você deve ter:

- [ ] AdminController com 9 métodos implementados
- [ ] Middleware requireAdmin
- [ ] Rotas /api/admin/* registradas
- [ ] Script create-admin.ts funcional
- [ ] Backend compilando sem erros
- [ ] Testes manuais executados
- [ ] Documentação ADMIN_MODULE_REPORT.md gerada
- [ ] Logs claros de todas as ações

---

## 🎯 RESULTADO ESPERADO

Ao final desta sessão, o RadarOne terá:

✅ Área administrativa completa
✅ 9 endpoints de admin funcionais
✅ Controle total sobre usuários e subscriptions
✅ Dashboard de estatísticas do sistema
✅ Logs de webhooks acessíveis
✅ Sistema de permissões (USER vs ADMIN)

---

COMECE AGORA executando as 8 fases em ordem!
```

---

## 📌 NOTAS ADICIONAIS

- O arquivo KIWIFY_INTEGRATION_GUIDE.md contém toda a documentação do Kiwify
- O arquivo COMPLETION_REPORT.md contém o status completo até a sessão anterior
- O arquivo CURRENT_PROJECT_DIAGNOSTIC.md contém diagnóstico detalhado
- Backend está em /Users/wellingtonbarrosdeoliveira/RadarOne/backend
- Banco de dados: radarone (PostgreSQL local)
- 5 planos já seedados: FREE, STARTER, PRO, PREMIUM, ULTRA

---

**Criado por:** Claude Sonnet 4.5
**Data:** 06/12/2024
**Próxima Etapa:** Área Administrativa
