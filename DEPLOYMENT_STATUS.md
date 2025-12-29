# RadarOne - Status do Deploy em Produção

**Data:** 28 de Dezembro de 2025
**Commit mais recente:** `ba3c0aa - chore(frontend): restore GA4 tag`

---

## ✅ ALTERAÇÕES PRONTAS PARA DEPLOY

### Google Analytics 4 (GA4)
- ✅ Tag GA4 adicionada ao `frontend/index.html`
- ✅ ID configurado: `G-RBF10SSGSW`
- ✅ Script gtag.js carregado via CDN
- ✅ dataLayer inicializado
- ✅ Código commitado e pushed para `origin/main`

**Arquivos modificados:**
- `frontend/index.html` (linhas 13-20)

---

## 🚀 INSTRUÇÕES DE DEPLOY

### 1. Configurar Environment Variables no Render

**Frontend (radarone-frontend):**
```bash
VITE_ANALYTICS_ID=G-RBF10SSGSW
VITE_API_BASE_URL=https://radarone.onrender.com
VITE_APP_VERSION=1.0.1
```

**Backend (radarone-backend):**
```bash
# Já configurado - sem alterações necessárias
```

### 2. Deploy no Render

#### Opção A: Auto-Deploy (Recomendado)
Render detecta automaticamente push para `main` e faz deploy.

**Status:**
- ✅ Código pushed para `origin/main`
- ⏳ Aguardando Render iniciar build...

**Verificar em:**
- Dashboard → radarone-frontend → Events

#### Opção B: Manual Deploy
1. Acessar [Render Dashboard](https://dashboard.render.com)
2. Selecionar **radarone-frontend**
3. Clicar em **Manual Deploy**
4. Selecionar **Deploy latest commit**
5. Aguardar build completar (1-2 minutos)

### 3. Verificar Deploy

#### A. Verificar Build Logs
```
Render Dashboard → radarone-frontend → Logs
```

**Buscar por:**
```
✓ built in X.XXs
```

#### B. Verificar Site Live
```bash
# Usando o script de verificação
cd ~/RadarOne
./verify-ga4-production.sh https://radarone-frontend.onrender.com

# Ou manualmente
curl -s https://radarone-frontend.onrender.com | grep -i "G-RBF10SSGSW"
```

#### C. Verificar no Browser
1. Abrir: `https://radarone-frontend.onrender.com` (ou seu domínio custom)
2. Abrir DevTools (F12)
3. **Network Tab:**
   - Filtrar por "gtag"
   - Verificar request para `googletagmanager.com/gtag/js?id=G-RBF10SSGSW`
   - Verificar requests para `google-analytics.com/g/collect`
4. **Console Tab:**
   ```javascript
   // Verificar se gtag está definido
   typeof gtag
   // Deve retornar: "function"

   // Verificar dataLayer
   window.dataLayer
   // Deve retornar: Array com eventos

   // Verificar ID
   window.dataLayer.find(item => item[2] === 'G-RBF10SSGSW')
   // Deve retornar: objeto com config
   ```

#### D. Verificar no Google Analytics
1. Acessar: [Google Analytics](https://analytics.google.com)
2. Selecionar propriedade **RadarOne** (G-RBF10SSGSW)
3. Ir para: **Reports → Realtime**
4. Com o site aberto em outra aba, verificar:
   - ✅ 1+ usuário ativo
   - ✅ Pageviews sendo registrados
   - ✅ Eventos sendo capturados

---

## 📋 CHECKLIST DE VALIDAÇÃO

### Pré-Deploy
- [x] Código commitado
- [x] Push para `origin/main` realizado
- [x] Build local passou sem erros
- [x] GA4 tag presente no HTML
- [ ] Environment variables configuradas no Render

### Deploy
- [ ] Build iniciado no Render
- [ ] Build completado com sucesso
- [ ] Deploy ativo (status: Live)
- [ ] Site acessível via URL

### Pós-Deploy
- [ ] GA4 tag presente no HTML em produção
- [ ] Script gtag.js carrega sem erros
- [ ] Requests para Google Analytics aparecem no Network
- [ ] dataLayer está populado
- [ ] Google Analytics Realtime mostra usuários ativos
- [ ] Pageviews sendo rastreados

---

## 🔍 TROUBLESHOOTING

### Problema: Build falha no Render

**Verificar:**
```bash
# Logs do Render → Procurar por erros
# Comum: falta de environment variables
```

**Solução:**
1. Verificar se todas as env vars estão configuradas
2. Limpar build cache: Manual Deploy → Clear build cache & deploy

### Problema: GA4 não aparece no HTML

**Verificar:**
```bash
curl -s https://SEU-SITE.onrender.com | grep "G-RBF10SSGSW"
```

**Solução:**
1. Verificar se o deploy pegou o commit correto
2. Limpar cache do CDN (se houver)
3. Hard refresh no browser (Ctrl+Shift+R)

### Problema: GA4 não rastreia eventos

**Verificar:**
1. Console do browser → Erros de CORS?
2. Network → gtag.js carrega com status 200?
3. Ad blockers desabilitados?

**Solução:**
1. Verificar Content Security Policy (CSP)
2. Adicionar domínios do Google Analytics à whitelist
3. Testar em modo anônimo

### Problema: Realtime não mostra usuários

**Possíveis causas:**
- Tag GA4 não carregou
- ID errado no código
- Ad blocker ativo
- Debug mode não habilitado

**Solução:**
```javascript
// Console do browser
gtag('config', 'G-RBF10SSGSW', { 'debug_mode': true });
```

Então verificar em:
https://analytics.google.com/analytics/web/ → DebugView

---

## 📊 URLs IMPORTANTES

### Render
- **Dashboard:** https://dashboard.render.com
- **Frontend Service:** https://dashboard.render.com/web/[SERVICE_ID]
- **Backend Service:** https://dashboard.render.com/web/[SERVICE_ID]

### Google Analytics
- **Dashboard:** https://analytics.google.com
- **Property ID:** G-RBF10SSGSW
- **Realtime:** https://analytics.google.com/analytics/web/#/realtime
- **DebugView:** https://analytics.google.com/analytics/web/#/debugview

### Produção
- **Frontend:** https://radarone-frontend.onrender.com (ou domínio custom)
- **Backend API:** https://radarone.onrender.com
- **Health Check:** https://radarone.onrender.com/health

---

## 🎯 PRÓXIMOS PASSOS

### Após Deploy com Sucesso
1. ✅ Validar GA4 funcionando
2. ✅ Verificar Realtime mostrando dados
3. ⬜ Configurar Goals/Conversions no GA4
4. ⬜ Configurar Audiences
5. ⬜ Setup eventos customizados (se necessário)

### Otimizações Futuras
- [ ] Implementar Google Tag Manager (GTM)
- [ ] Adicionar eventos customizados (cliques, formulários)
- [ ] Configurar Enhanced Measurement
- [ ] Setup de ecommerce tracking (se aplicável)

---

## 📞 COMANDOS ÚTEIS

```bash
# Verificar produção
./verify-ga4-production.sh https://SEU-SITE.com

# Build local para testar
cd frontend && npm run build && npm run preview

# Ver últimos commits
git log --oneline -10

# Forçar rebuild no Render (via API)
curl -X POST https://api.render.com/v1/services/[SERVICE_ID]/deploys \
  -H "Authorization: Bearer [API_KEY]"

# Verificar se site está up
curl -I https://SEU-SITE.com

# Debug GA4 no browser
# Console:
window.dataLayer
gtag('event', 'test', { 'event_category': 'debug' })
```

---

**Status Atual:** ✅ Código pronto | ⏳ Aguardando deploy no Render

**Responsável:** Wellington Barros
**Projeto:** RadarOne
**Versão:** 1.0.1 (com GA4)
