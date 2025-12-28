# 📊 Google Analytics 4 - Checklist de Validação em Produção

Use este checklist após configurar `VITE_ANALYTICS_ID` em produção para validar que o GA4 está funcionando corretamente.

## ✅ Checklist Completo

### 1. Configuração no Render.com

- [ ] Variável `VITE_ANALYTICS_ID` adicionada no Render Dashboard
- [ ] Valor correto (formato: `G-XXXXXXXXXX`)
- [ ] Redeploy realizado após adicionar variável
- [ ] Deploy concluído com sucesso

### 2. Verificação Técnica

**Script GA4 Carregado:**
- [ ] Abrir aplicação em produção
- [ ] DevTools (F12) → aba Network
- [ ] Filtrar por `googletagmanager`
- [ ] Confirmar: `gtag/js?id=G-XXXXXXXXXX` aparece

**DataLayer Inicializado:**
- [ ] DevTools → aba Console
- [ ] Digitar: `window.dataLayer`
- [ ] Confirmar: Array com eventos

**Gtag Disponível:**
- [ ] DevTools → aba Console
- [ ] Digitar: `typeof window.gtag`
- [ ] Confirmar: `"function"`

### 3. Teste de Eventos em Tempo Real

**Setup:**
- [ ] Abrir [Google Analytics](https://analytics.google.com)
- [ ] Ir em **Relatórios** → **Tempo real**
- [ ] Manter aba aberta

**Testar eventos básicos:**
- [ ] Fazer login → evento `login` aparece
- [ ] Navegar entre páginas → evento `page_view` aparece
- [ ] Clicar no menu Ajuda → evento `help_menu_interaction` aparece
- [ ] Ir em /manual → evento `help_page_view` aparece
- [ ] Ir em /plans → evento `view_plans` aparece

**Testar eventos de monitores (se tiver acesso):**
- [ ] Criar monitor → evento `monitor_created` aparece
- [ ] Deletar monitor → evento `monitor_deleted` aparece

**Timing:**
- [ ] Eventos aparecem em 5-10 segundos (delay normal)

### 4. Validação de Privacidade (LGPD)

**anonymize_ip ativado:**
- [ ] DevTools → Console
- [ ] Digitar: `window.dataLayer`
- [ ] Procurar por evento `config`
- [ ] Confirmar: `anonymize_ip: true`

**Ausência de PII nos eventos:**
- [ ] Em GA4 Tempo Real → clicar em um evento
- [ ] Verificar parâmetros do evento
- [ ] Confirmar NENHUM parâmetro contém:
  - [ ] Email completo
  - [ ] Nome completo do usuário
  - [ ] CPF/CNPJ
  - [ ] ID de usuário direto
  - [ ] Endereço IP completo

**Parâmetros seguros permitidos:**
- [ ] `plan_name: "PRO"` ✅
- [ ] `site: "MERCADO_LIVRE"` ✅
- [ ] `action: "open"` ✅
- [ ] Valores genéricos/categóricos ✅

### 5. Teste com Google Tag Assistant

**Instalação:**
- [ ] Instalar extensão: [Tag Assistant](https://tagassistant.google.com/)
- [ ] Abrir aplicação em produção
- [ ] Clicar no ícone da extensão

**Validação:**
- [ ] Clicar em **Connect**
- [ ] Navegar pela aplicação (login, páginas, menu)
- [ ] Verificar na extensão:
  - [ ] Tag GA4 está disparando (ícone verde)
  - [ ] Eventos aparecem na lista
  - [ ] Sem erros ou warnings
  - [ ] Measurement ID correto (`G-XXXXXXXXXX`)

### 6. Verificação de Console Logs

**Em produção (não deve ter logs):**
- [ ] DevTools → Console
- [ ] Filtrar por `[ANALYTICS]`
- [ ] Confirmar: **Nenhum log** aparece (logs só em DEV)

**Em desenvolvimento (deve ter logs):**
- [ ] Rodar localmente com `npm run dev`
- [ ] DevTools → Console
- [ ] Filtrar por `[ANALYTICS]`
- [ ] Confirmar: Logs `[ANALYTICS] Event:` aparecem
- [ ] Confirmar: Script GA4 **não** é carregado (Network limpo)

### 7. Validação de Dados no GA4

**Aguardar 24-48 horas após deploy, então verificar:**
- [ ] GA4 → Relatórios → Aquisição → Visão geral do tráfego
- [ ] Confirmar: Sessões aparecem
- [ ] GA4 → Engajamento → Eventos
- [ ] Confirmar: Eventos customizados aparecem
  - [ ] `login`
  - [ ] `monitor_created`
  - [ ] `help_menu_interaction`
  - [ ] `view_plans`

### 8. Teste de Builds

**Build local com analytics:**
- [ ] Configurar `.env.local` com `VITE_ANALYTICS_ID=G-TEST`
- [ ] Rodar `npm run build`
- [ ] Build **não deve falhar**
- [ ] Confirmar: `dist/` gerado com sucesso

**Build sem analytics:**
- [ ] Remover `VITE_ANALYTICS_ID` do `.env.local`
- [ ] Rodar `npm run build`
- [ ] Build **não deve falhar**
- [ ] Aplicação funciona normalmente (analytics desabilitado)

## ❌ Troubleshooting

### Problema: Eventos não aparecem em Tempo Real

**Soluções:**
1. Verificar se `VITE_ANALYTICS_ID` está correto no Render
2. Verificar se fez redeploy após adicionar variável
3. Esperar 5-10 segundos (delay normal do GA4)
4. Abrir em aba anônima (extensões podem bloquear)
5. Verificar Network → deve ter `gtag/js?id=G-XXX`

### Problema: Script GA4 não carrega

**Soluções:**
1. Verificar se variável tem prefixo `VITE_` (não apenas `ANALYTICS_ID`)
2. Verificar se fez redeploy (variáveis Vite são build-time)
3. Verificar se não há ad blocker ativo
4. Verificar console por erros de CORS

### Problema: Eventos duplicados

**Soluções:**
1. Verificar console: mensagem "Já foi inicializado"
2. Verificar se `initAnalytics()` é chamado apenas 1x
3. Verificar se há múltiplos IDs configurados

### Problema: Dados em produção vs desenvolvimento

**Comportamento esperado:**
- **Desenvolvimento:** Apenas `console.log` (sem envio ao GA4)
- **Produção:** Eventos enviados ao GA4 (sem console.log)

## 📚 Referências

- [README - Seção GA4](../README.md#-google-analytics-4---configuração-completa)
- [Documentação GA4 Oficial](https://developers.google.com/analytics/devguides/collection/ga4)
- [Tag Assistant](https://tagassistant.google.com/)
- [LGPD e Analytics](https://support.google.com/analytics/answer/9019185)

---

**Última atualização:** 2025-12-28
**Versão:** 1.0
