# 🚀 Guia Rápido de Validação - Admin Panel

## ⚡ Validação Express (5 minutos)

### 1. Login Admin
```bash
# Abrir: http://localhost:5173/login
# Email: admin@radarone.com.br
# Senha: [sua senha admin]
```

### 2. Teste Navegação (Bug #1 - CRÍTICO)
```
✓ Após login, estar em /admin/stats OU /dashboard
✓ Se estiver em /dashboard, acessar: http://localhost:5173/admin/stats
✓ Clicar no link "Dashboard Admin" no header
✓ VERIFICAR: Deve permanecer em /admin/stats
✓ NÃO DEVE: Cair em /plans

STATUS: ✅ PASS / ❌ FAIL
```

### 3. Teste Layout Jobs (Bug #2 - CRÍTICO)
```
✓ Acessar: http://localhost:5173/admin/jobs
✓ VERIFICAR: Sidebar visível (esquerda no desktop)
✓ VERIFICAR: Header com "RadarOne Admin"
✓ VERIFICAR: Lista de jobs na tabela
✓ NÃO DEVE: Ter layout diferente/inline

STATUS: ✅ PASS / ❌ FAIL
```

### 4. Teste Navegação Completa
```
Navegar nesta ordem e verificar que sidebar SEMPRE aparece:

1. /admin/stats        → ✓ Sidebar OK
2. /admin/users        → ✓ Sidebar OK
3. /admin/jobs         → ✓ Sidebar OK
4. /admin/alerts       → ✓ Sidebar OK
5. /admin/security     → ✓ Sidebar OK

Clicar "Dashboard Admin" em cada uma → Sempre volta para /admin/stats

STATUS: ✅ PASS / ❌ FAIL
```

---

## 🔍 Validação Intermediária (15 minutos)

### 5. Teste 2FA
```
1. Acessar: /admin/security
2. Verificar status: "2FA DESATIVADO" ou "2FA ATIVADO"

Se DESATIVADO:
  ✓ Clicar "Ativar 2FA"
  ✓ QR Code aparece
  ✓ Escanear com Google Authenticator
  ✓ Digitar código de 6 dígitos
  ✓ Backup codes aparecem (10 códigos)
  ✓ Copiar backup codes
  ✓ Status muda para "ATIVADO"

Se ATIVADO:
  ✓ Mostra "backupCodesRemaining"
  ✓ Botão "Regenerar Códigos de Backup" disponível
  ✓ Botão "Desativar 2FA" disponível

STATUS: ✅ PASS / ❌ FAIL
```

### 6. Teste Alertas
```
1. Acessar: /admin/alerts
2. Verificar:
   ✓ Filtros: Tipo, Status, Período
   ✓ Contador: "TOTAL: X / NÃO LIDOS: Y"
   ✓ Botão "Exportar Alertas"
   ✓ Tabela com alertas (se houver)

3. Badge na Sidebar:
   ✓ Se houver alertas não lidos, badge vermelho aparece
   ✓ Número corresponde ao contador

STATUS: ✅ PASS / ❌ FAIL
```

### 7. Teste Stats
```
1. Acessar: /admin/stats
2. Verificar:
   ✓ Seletor de período (7, 30, 60, 90 dias)
   ✓ Cards com métricas:
     - Total Usuários
     - Usuários Ativos
     - Total Assinaturas
     - Monitores
   ✓ Tabela "Top Planos"
   ✓ Seção "Análise Temporal"

STATUS: ✅ PASS / ❌ FAIL
```

---

## 🧪 Validação Completa (30 minutos)

### 8. Teste Idle Logout
```
⚠️ ATENÇÃO: Requer configurar timeout curto

1. No frontend/.env:
   VITE_SESSION_TIMEOUT_MINUTES=1

2. Reiniciar dev server:
   npm run dev

3. Login como admin
4. Deixar navegador sem interação por 1 minuto
5. Verificar:
   ✓ Logout automático
   ✓ Redirect para /login?reason=session_expired

6. Restaurar timeout:
   VITE_SESSION_TIMEOUT_MINUTES=30

STATUS: ✅ PASS / ❌ FAIL
```

### 9. Teste Audit Logs
```
1. Acessar: /admin/users
2. Bloquear um usuário (botão "Bloquear")
3. Acessar: /admin/audit-logs
4. Verificar:
   ✓ Aparece registro "USER_BLOCKED"
   ✓ Mostra admin que executou
   ✓ Mostra data/hora
   ✓ Badge cor vermelha
   ✓ Clicar "Ver Detalhes" mostra before/after

STATUS: ✅ PASS / ❌ FAIL
```

### 10. Teste Monitores
```
1. Acessar: /admin/monitors
2. Verificar:
   ✓ Lista todos os monitores do sistema
   ✓ Mostra: Nome, Site, Usuário, Status
   ✓ Paginação (se > 20 monitores)
   ✓ Botão "Exportar Monitores"

STATUS: ✅ PASS / ❌ FAIL
```

### 11. Teste Placeholders
```
1. Acessar: /admin/coupons
   ✓ Alert "Interface de Gestão em Desenvolvimento"
   ✓ Instruções claras de workaround

2. Acessar: /admin/settings
   ✓ Lista configurações (se houver)
   ✓ Alert "Visualização Read-Only"
   ✓ Instruções para edição

STATUS: ✅ PASS / ❌ FAIL
```

---

## 📱 Validação Mobile/Responsivo

### 12. Teste Mobile
```
1. Redimensionar navegador para 375px (iPhone)
2. Acessar: /admin/stats
3. Verificar:
   ✓ Sidebar NÃO aparece
   ✓ Botão hambúrguer (☰) aparece no header
   ✓ Clicar hambúrguer abre drawer lateral
   ✓ Drawer contém todos os links
   ✓ Link "Dashboard Admin" no drawer
   ✓ Botão "Sair" no drawer

4. Navegar para /admin/jobs
   ✓ Mesmo comportamento (drawer funciona)

STATUS: ✅ PASS / ❌ FAIL
```

---

## 🎯 Smoke Test Automatizado

```bash
# Executar todos os testes E2E
cd frontend
npm run test:e2e -- admin-smoke.spec.ts

# Resultado esperado:
# ✓ 7 passed (XX.XXs)
```

---

## ❌ Cenários de Falha Conhecidos

### Se "Dashboard Admin" cair em /plans:
```
CAUSA: AdminLayout.tsx não foi atualizado
SOLUÇÃO: Verificar linhas 117 e 171
Deve estar: to="/admin/stats"
```

### Se /admin/jobs não mostrar sidebar:
```
CAUSA: AdminJobsPage.tsx ainda usa layout antigo
SOLUÇÃO: Verificar se import AdminLayout está correto
Deve conter: <AdminLayout>...</AdminLayout>
```

### Se 2FA não funcionar:
```
CAUSA PROVÁVEL: Backend não está rodando ou endpoints 2FA não existem
SOLUÇÃO:
1. Verificar backend/src/routes/auth.routes.ts
2. Endpoints devem existir: /2fa/setup, /2fa/enable, etc.
3. Service twoFactorService.ts deve existir
```

### Se idle logout não funcionar:
```
CAUSA PROVÁVEL: useSessionTimeout não está importado no AuthContext
SOLUÇÃO:
1. Verificar frontend/src/context/AuthContext.tsx
2. Linha 5: import { useSessionTimeout } from '../hooks/useSessionTimeout'
3. Linhas 114-117: useSessionTimeout(() => { logout('session_expired') })
```

---

## ✅ Checklist Final

Antes de marcar como APROVADO:

- [ ] Build passou sem erros
- [ ] Navegação não cai em /plans
- [ ] Todas as telas admin usam AdminLayout
- [ ] /admin/jobs mostra sidebar
- [ ] 2FA funcional (ativar + desativar)
- [ ] Alertas mostram na lista e badge
- [ ] Stats mostra dados reais
- [ ] Audit logs registra ações
- [ ] Monitores lista corretamente
- [ ] Placeholders têm mensagens claras
- [ ] Mobile responsivo (drawer funciona)
- [ ] Smoke tests passam

**Status Geral:** ✅ APROVADO / ⚠️ REVISAR / ❌ REPROVADO

---

## 📞 Troubleshooting Rápido

### Build Falha
```bash
# Limpar cache
rm -rf node_modules dist
npm install
npm run build
```

### Erro TypeScript
```bash
# Verificar tipos
npx tsc --noEmit

# Se houver erros no AdminJobsPage:
# Verificar imports de Chakra UI
```

### Backend não responde
```bash
cd backend
npm run dev

# Verificar logs para erros
# Verificar .env está configurado
```

---

**Última atualização:** 2026-01-01
**Tempo estimado validação completa:** 30 minutos
**Pré-requisito:** Backend rodando + Admin criado no banco
