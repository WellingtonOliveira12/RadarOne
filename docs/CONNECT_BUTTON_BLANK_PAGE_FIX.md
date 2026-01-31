# Fix: Tela vazia ao clicar "Conectar conta" na página Conexões

## Causa raiz

Quando a API `GET /api/sessions` falha (cold start do Render, erro de rede, timeout), o estado `supportedSites` permanece `[]` (array vazio). A página renderiza o header e FAQ, mas **zero SiteCards** — resultando em uma tela que parece vazia/em branco sem nenhuma ação possível para o usuário.

O erro era mostrado apenas como um toast temporário que desaparece após alguns segundos, sem nenhum indicador persistente na página.

## Evidências

- **Rota:** `/settings/connections` → `ConnectionsPage`
- **Botão "Conectar conta":** Dentro do `SiteCard`, dispara `fileInputRef.current?.click()` (abre file picker). NÃO navega para outra rota.
- **Fluxo do bug:** API falha → `supportedSites = []` → filtro `['MERCADO_LIVRE'].includes(site.id)` não encontra nada → nenhum card renderizado → página parece vazia
- **Console:** toast de erro aparecia brevemente, sem erro JS persistente

## Correções

### 1. Fallback de sites suportados (`FALLBACK_SUPPORTED_SITES`)
- Constante hardcoded com Mercado Livre como site suportado
- `effectiveSites = supportedSites.length > 0 ? supportedSites : FALLBACK_SUPPORTED_SITES`
- Garante que o card SEMPRE aparece, mesmo se a API falhar

### 2. Estado de erro persistente na página (`fetchError`)
- Novo estado `fetchError` que mantém a mensagem de erro visível na página
- Alert vermelho com botão "Tentar novamente" sempre visível enquanto há erro
- Substitui o toast temporário que desaparecia

### 3. Testes automatizados (Vitest)
- `ConnectionsPage.test.tsx` com 3 cenários:
  - API sucesso → renderiza card do ML com botão "Conectar conta"
  - API falha → renderiza card via fallback + alerta de erro com retry
  - Loading → mostra spinner

## Como validar

1. `cd frontend && npm run build` — sem erros
2. `npx vitest run src/pages/__tests__/ConnectionsPage.test.tsx` — 3 testes passam
3. Teste manual: desconectar internet, acessar /settings/connections → deve mostrar card do ML + alerta de erro
