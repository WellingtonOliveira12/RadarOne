# Google Analytics 4 - Setup Completo e Validação

## O que foi implementado

### 1. Carregamento Garantido do GA4

**Arquivo:** `index.html`
- Script GA4 agora usa variável de ambiente `VITE_ANALYTICS_ID`
- Carrega apenas quando a variável está configurada
- Logs de debug no console (apenas em desenvolvimento)
- Implementação no `<head>` para carregamento prioritário

### 2. Sistema de Fallback

**Arquivo:** `src/lib/analytics.ts`
- Função `initAnalytics()` melhorada com logs detalhados
- Detecta se GA4 já foi carregado pelo index.html
- Carrega como fallback se necessário
- Logs em desenvolvimento para facilitar debug

### 3. Redirect www → apex

**Arquivo:** `public/_redirects`
- Criado arquivo de redirects para Render
- Redirect 301 de www.radarone.com.br → radarone.com.br
- Necessário porque Google Analytics testa em www

### 4. Variável de Ambiente

**Arquivo:** `.env`
- Adicionado `VITE_ANALYTICS_ID=G-RBF10SSGSW`

---

## Configuração no Render

### Variáveis de Ambiente Necessárias

No painel do Render (radarone-frontend), certifique-se que existe:

```
VITE_ANALYTICS_ID=G-RBF10SSGSW
```

**IMPORTANTE:** Após adicionar/modificar variáveis, é necessário fazer um novo deploy!

### Redirects (já configurado)

O arquivo `public/_redirects` será copiado para o build automaticamente.
O Render suporta este formato nativamente.

---

## Validação Local (Desenvolvimento)

### 1. Verificar variável de ambiente

```bash
cd /Users/wellingtonbarrosdeoliveira/RadarOne/frontend
cat .env
# Deve mostrar VITE_ANALYTICS_ID=G-RBF10SSGSW
```

### 2. Rodar em desenvolvimento

```bash
npm run dev
```

### 3. Abrir o DevTools Console

Você deve ver logs como:
```
[GA4] ✅ Script carregado via index.html: G-RBF10SSGSW
[GA4] 📊 Analytics inicializado com anonymize_ip=true
[GA4] ✅ Analytics já inicializado (via index.html)
[GA4] 📊 ID: G-RBF10SSGSW
```

### 4. Verificar Network Tab

- Abra DevTools → Network
- Filtre por "google"
- Deve aparecer requests para:
  - `googletagmanager.com/gtag/js?id=G-RBF10SSGSW`
  - `google-analytics.com/g/collect`

---

## Validação em Produção

### 1. Deploy no Render

```bash
cd /Users/wellingtonbarrosdeoliveira/RadarOne/frontend
npm run build

# Fazer commit e push (o Render fará deploy automático)
git add .
git commit -m "feat(analytics): garantir carregamento do GA4 em produção"
git push origin main
```

### 2. Aguardar Deploy

- Acesse: https://dashboard.render.com
- Aguarde o build completar (~3-5 min)
- Verifique os logs do build

### 3. Testar o Site

Abra: https://radarone.com.br

**DevTools → Network:**
- Deve mostrar requests para googletagmanager.com
- Deve mostrar requests para google-analytics.com

**DevTools → Console:**
- NÃO deve mostrar logs (produção)
- NÃO deve mostrar erros relacionados ao GA4

### 4. View Source

```bash
curl https://radarone.com.br | grep -A 10 "googletagmanager"
```

Deve aparecer o script do gtag.js no HTML.

---

## Validação no Google Analytics

### 1. DebugView (Tempo Real)

**Como atilentar:**

1. Instale a extensão: [Google Analytics Debugger](https://chrome.google.com/webstore/detail/google-analytics-debugger/jnkmfdileelhofjcijamephohjechhna)
2. Ative a extensão (ícone fica azul)
3. Acesse: https://radarone.com.br

**No Google Analytics:**

1. Acesse: [Google Analytics](https://analytics.google.com)
2. Navegue: Admin → Data Streams → Web → G-RBF10SSGSW
3. Clique em "View tag details" → "DebugView"

**O que deve aparecer:**
- Evento `page_view` quando carregar a página
- Evento `help_menu_interaction` quando clicar em Ajuda

### 2. Testar Instalação

**Google Analytics:**

1. Admin → Data Streams → Web
2. Clique no stream G-RBF10SSGSW
3. Clique em "Testar instalação" ou "Test installation"

**Ações para testar:**
- Abra https://radarone.com.br em uma aba anônima
- Clique em diferentes páginas
- Clique no menu "Ajuda"

**Resultado esperado:**
- "Receiving hits from your website" ✅
- Eventos aparecendo no DebugView em tempo real

---

## Checklist de Validação Completa

### Desenvolvimento (Local)

- [ ] Console mostra `[GA4] ✅ Script carregado via index.html`
- [ ] Console mostra ID correto: `G-RBF10SSGSW`
- [ ] Network tab mostra request para `googletagmanager.com`
- [ ] Network tab mostra requests para `google-analytics.com/g/collect`
- [ ] Não há erros no console relacionados ao GA4

### Produção (radarone.com.br)

- [ ] View-source mostra script gtag.js no `<head>`
- [ ] Network tab mostra request para `googletagmanager.com`
- [ ] Network tab mostra requests para `google-analytics.com/g/collect`
- [ ] Não há erros no console
- [ ] Redirect www → apex funciona (testar https://www.radarone.com.br)

### Google Analytics Dashboard

- [ ] DebugView mostra eventos em tempo real
- [ ] Evento `page_view` aparece ao carregar páginas
- [ ] Evento `help_menu_interaction` aparece ao clicar em Ajuda
- [ ] "Testar instalação" mostra "Receiving hits" ✅
- [ ] Relatórios começam a mostrar dados (pode levar até 24h)

---

## Comandos Úteis para Validação

### Local

```bash
# Ver variáveis de ambiente
cat frontend/.env

# Rodar em dev
cd frontend
npm run dev

# Build local (testar se compila)
npm run build

# Preview do build
npm run preview
```

### Produção

```bash
# Testar se script está no HTML
curl -s https://radarone.com.br | grep -i "googletagmanager"

# Testar redirect www
curl -I https://www.radarone.com.br
# Deve retornar: Location: https://radarone.com.br/

# Testar API do GA4 (avançado)
curl -s https://radarone.com.br | grep -oE 'G-[A-Z0-9]+'
# Deve retornar: G-RBF10SSGSW
```

### Chrome DevTools

```javascript
// Console do navegador - verificar se GA4 está carregado
console.log('gtag exists:', typeof window.gtag === 'function');
console.log('dataLayer exists:', Array.isArray(window.dataLayer));
console.log('dataLayer contents:', window.dataLayer);

// Enviar evento de teste
if (window.gtag) {
  window.gtag('event', 'test_event', { test_param: 'test_value' });
  console.log('Evento de teste enviado!');
}
```

---

## Troubleshooting

### "Script não aparece no view-source"

**Causa:** Variável VITE_ANALYTICS_ID não configurada no Render

**Solução:**
1. Render Dashboard → radarone-frontend → Environment
2. Adicionar: `VITE_ANALYTICS_ID=G-RBF10SSGSW`
3. Fazer novo deploy

### "Google Analytics não detecta o site"

**Causa possível:** Testando em www.radarone.com.br

**Solução:**
- Sempre usar https://radarone.com.br (sem www)
- O redirect www→apex resolve isso automaticamente
- Aguardar propagação do deploy (pode levar alguns minutos)

### "DebugView não mostra eventos"

**Solução:**
1. Instalar Google Analytics Debugger
2. Ativar a extensão (ícone azul)
3. Abrir aba anônima
4. Acessar o site
5. Aguardar 1-2 minutos

### "Network mostra erro ao carregar gtag.js"

**Causa:** AdBlocker ou extensões de privacidade

**Solução:**
- Desabilitar AdBlockers
- Testar em aba anônima sem extensões
- Testar em outro navegador

---

## Próximos Passos (Opcional)

### 1. Configurar Google Tag Manager (GTM)

Para gerenciamento mais flexível de tags:
- Criar conta no GTM
- Substituir script direto por GTM
- Gerenciar GA4 e outras tags via GTM

### 2. Enhanced Measurement

No Google Analytics:
- Admin → Data Streams → Enhanced Measurement
- Ativar: Scrolls, Outbound clicks, Site search, Video engagement

### 3. Conversões

Configurar eventos importantes como conversões:
- `subscription_created` → Conversão
- `select_plan` → Conversão
- Usar no Google Ads para otimização

---

## Referências

- [Google Analytics 4 Documentation](https://developers.google.com/analytics/devguides/collection/ga4)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [Render Static Sites](https://render.com/docs/static-sites)
- [Render Redirects](https://render.com/docs/redirects-rewrites)
