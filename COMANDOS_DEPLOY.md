# 🚀 Comandos de Deploy - Copie e Cole

## 📝 Passo 1: Commit e Push

```bash
cd /Users/wellingtonbarrosdeoliveira/RadarOne

# Ver o que foi alterado
git status

# Adicionar todos os arquivos
git add .

# Commit
git commit -m "fix: corrigir bug completo cupom VITALICIO

- Frontend: corrigir build + UI vitalício
- Backend: criar função canônica getCurrentSubscriptionForUser
- Backend: redeem vitalício cria ACTIVE + isLifetime=true
- Backend: endpoints e middlewares usam fonte canônica
- Backend: jobs de expiração ignoram vitalícios
- Scripts: migration de dados para subscriptions existentes
- Docs: guia completo de validação

Fixes: usuários perdem premium após logout/login"

# Push para produção
git push origin main
```

✅ **Aguardar:** Deploy automático no Render (~10 minutos total)

---

## 🔍 Passo 2: Verificar Deploy

### 2.1. Verificar commit em produção
```bash
curl https://radarone-backend.onrender.com/api/health/version
```

**Verificar:** Campo `"commit"` é o mesmo do `git log -1 --oneline`

### 2.2. Pegar último commit local
```bash
git log -1 --oneline
```

✅ **Critério:** Os commits devem ser iguais

---

## 🗄️ Passo 3: Executar Migration de Dados

### 3.1. Acessar Render Shell
1. Abra: https://dashboard.render.com
2. Clique em: **radarone-backend**
3. Clique na aba: **Shell**
4. Cole o comando abaixo:

```bash
npx ts-node scripts/fix-vitalicio-subscriptions.ts
```

**Aguardar saída:**
```
[FIX] 🔧 Iniciando correção de cupom VITALICIO e subscriptions...
[1/3] Atualizando cupom VITALICIO...
✅ Cupom VITALICIO atualizado (id: ..., isLifetime=true)
[2/3] Identificando usuários allowlisted...
📧 Emails allowlisted: ...
[3/3] Atualizando subscriptions dos usuários allowlisted...
👤 Usuário: Wellington (...)
   ✅ Subscription atualizada para vitalícia
👤 Usuário: Kristiann (...)
   ✅ Subscription atualizada para vitalícia
[FIX] ✅ Script concluído com sucesso!
   Total de subscriptions corrigidas/criadas: 2
```

✅ **Critério:** Total de subscriptions corrigidas = 2

---

## 🔐 Passo 4: Validar com seu Usuário

### 4.1. Login e pegar token
```bash
curl -X POST https://radarone-backend.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "SEU_EMAIL_AQUI",
    "password": "SUA_SENHA_AQUI"
  }'
```

**Copiar:** O valor do campo `"token"` da resposta

### 4.2. Verificar subscription
```bash
# Substitua TOKEN_AQUI pelo token copiado acima
curl https://radarone-backend.onrender.com/api/subscriptions/my \
  -H "Authorization: Bearer TOKEN_AQUI"
```

**Verificar resposta:**
```json
{
  "subscription": {
    "status": "ACTIVE",         ← deve ser ACTIVE
    "isLifetime": true,         ← deve ser true
    "validUntil": null,         ← deve ser null
    "trialEndsAt": null,        ← deve ser null
    "isTrial": false            ← deve ser false
  },
  "timeRemaining": {
    "daysRemaining": -1,        ← deve ser -1 (ilimitado)
    "expiresAt": null,
    "isExpired": false
  }
}
```

✅ **Critério:** Todos os campos acima corretos

---

## 🎨 Passo 5: Validar no Browser

### 5.1. Abrir Settings
1. Login em: https://radarone-frontend.onrender.com
2. Acesse: https://radarone-frontend.onrender.com/settings/subscription

### 5.2. Verificar UI
✅ **Badge:** Roxo com "♾️ Vitalício"
✅ **Alert verde:** "Você possui acesso VITALÍCIO ao plano X. Seu acesso não expira!"
✅ **NÃO** deve mostrar: "Seu período de teste termina em X dias"

---

## 🔄 Passo 6: Teste de Logout/Login (CRÍTICO)

### 6.1. Fluxo E2E
1. Esteja logado e premium
2. Crie 1 monitor de teste (para provar que tem acesso)
3. **LOGOUT**
4. **LOGIN** novamente
5. Volte para dashboard

✅ **Critério de Sucesso:**
- Dashboard abre normalmente (não redireciona para /plans)
- Monitor criado ainda está lá
- Pode criar novos monitores
- **NÃO pede para reaplicar cupom**

### 6.2. Se falhar
Execute estas queries no Render Shell (backend):

```bash
# Abrir Prisma Studio
npx prisma studio
```

Ou via SQL:
```bash
# Verificar sua subscription
npx prisma db execute --stdin <<EOF
SELECT
  s.id,
  s.status,
  s.isLifetime,
  s.validUntil,
  u.email
FROM subscriptions s
JOIN users u ON s.userId = u.id
WHERE u.email = 'SEU_EMAIL'
  AND s.status IN ('ACTIVE', 'TRIAL')
ORDER BY s.createdAt DESC
LIMIT 1;
EOF
```

**Resultado esperado:**
```
status: ACTIVE
isLifetime: 1 (true)
validUntil: NULL
email: seu_email@...
```

---

## 🐛 Troubleshooting

### Erro 1: "Migration já foi aplicada"
**Sintoma:** Script diz "Subscription já é vitalícia. Ignorando."
**Solução:** Tudo certo! É idempotente. Não precisa fazer nada.

### Erro 2: "VITALICIO_ALLOWED_EMAILS não configurada"
**Solução:**
1. Acesse: https://dashboard.render.com
2. Vá em: **radarone-backend** → **Environment**
3. Adicione variável:
   - Key: `VITALICIO_ALLOWED_EMAILS`
   - Value: `seu_email@...,kristiann@...`
4. Clique em: **Save Changes**
5. Aguarde redeploy
6. Execute migration novamente

### Erro 3: "Cupom VITALICIO não encontrado"
**Solução:**
1. Acesse Admin Panel: https://radarone-frontend.onrender.com/admin/coupons
2. Crie cupom:
   - Code: `VITALICIO`
   - Purpose: `TRIAL_UPGRADE`
   - ✅ Marque: "Cupom Vitalício"
   - Salve
3. Execute migration novamente

### Erro 4: Frontend ainda mostra "60 dias"
**Solução:**
1. Force clear do cache: Ctrl+Shift+R (ou Cmd+Shift+R no Mac)
2. Verifique que o deploy do frontend terminou:
   - https://dashboard.render.com → radarone-frontend
   - Aguarde "Deploy live"
3. Teste em janela anônima

---

## 📊 Logs Úteis

### Ver logs do backend em tempo real
https://dashboard.render.com → radarone-backend → Logs

### Ver logs de job de expiração
Procure por:
```
[JOB] 🔍 Verificando assinaturas expiradas...
[JOB] 🚫 0 assinaturas expiradas  ← subscriptions vitalícias NÃO aparecem aqui
```

### Ver logs de aplicação de cupom
Procure por:
```
[COUPON] Redeem trial upgrade: VITALICIO
[COUPON] Subscription created: ACTIVE + isLifetime=true
```

---

## ✅ Checklist Final

Execute na ordem:

1. **Commit e push**
   - [ ] `git add .`
   - [ ] `git commit -m "..."`
   - [ ] `git push origin main`

2. **Verificar deploy**
   - [ ] Backend deployed
   - [ ] Frontend deployed
   - [ ] `curl /api/health/version` retorna commit correto

3. **Executar migration**
   - [ ] Render Shell → backend
   - [ ] `npx ts-node scripts/fix-vitalicio-subscriptions.ts`
   - [ ] 2 subscriptions corrigidas

4. **Validar API**
   - [ ] Login → pegar token
   - [ ] `curl /api/subscriptions/my` → isLifetime=true

5. **Validar UI**
   - [ ] Settings page → badge "Vitalício"
   - [ ] Alert verde de sucesso
   - [ ] NÃO mostra "termina em X dias"

6. **Teste E2E**
   - [ ] Logout
   - [ ] Login
   - [ ] Continua premium

7. **Monitorar logs**
   - [ ] Sem erros no backend
   - [ ] Sem erros no frontend
   - [ ] Job de expiração ignora vitalícios

---

**Wellington, siga estes comandos em ordem. Está tudo pronto! 🚀**

**Dúvidas?** Consulte:
- Validação detalhada: `VALIDACAO_VITALICIO.md`
- Resumo técnico: `RESUMO_EXECUCAO.md`
