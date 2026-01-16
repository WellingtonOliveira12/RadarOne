# Autenticação de Sessões - RadarOne Worker

Este documento explica como configurar e manter sessões de autenticação para sites que exigem login (como Mercado Livre).

## Visão Geral

Alguns sites exigem autenticação para certas buscas. O sistema usa **storageState** do Playwright para persistir cookies e localStorage de sessões autenticadas.

### Fluxo

```
┌─────────────────────────────────────────────────────────────────┐
│  LOCAL (sua máquina)                                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1. Executa script de geração de sessão                 │   │
│  │  2. Navega no browser visível                           │   │
│  │  3. Faz login manualmente (incluindo MFA se houver)     │   │
│  │  4. Script salva storageState.json                      │   │
│  │  5. Gera base64 para configurar no Render               │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  RENDER (produção)                                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1. Worker inicia e carrega SESSION_* de env vars       │   │
│  │  2. Decodifica base64 e salva em /tmp/sessions/         │   │
│  │  3. Scraper usa contexto com storageState               │   │
│  │  4. Se sessão expirar, logs indicam necessidade de      │   │
│  │     renovação manual                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Sites Suportados

| Site | ID | Env Var | Validade Típica |
|------|-----|---------|-----------------|
| Mercado Livre | MERCADO_LIVRE | SESSION_MERCADO_LIVRE | 14 dias |
| Superbid | SUPERBID | SESSION_SUPERBID | 7 dias |
| Sodré Santoro | SODRE_SANTORO | SESSION_SODRE_SANTORO | 7 dias |
| Zukerman | ZUKERMAN | SESSION_ZUKERMAN | 7 dias |

---

## 1. Gerando Sessão (Local)

### Pré-requisitos

```bash
cd worker
npm install
```

### Mercado Livre

```bash
# Gerar nova sessão
npx ts-node scripts/auth/mercadolivre-session.ts

# Validar sessão existente
npx ts-node scripts/auth/mercadolivre-session.ts --validate

# Testar busca com sessão
npx ts-node scripts/auth/mercadolivre-session.ts --test-search "iphone 14"
```

### Outros sites (genérico)

```bash
npx ts-node scripts/auth/generate-session.ts SUPERBID
npx ts-node scripts/auth/generate-session.ts SODRE_SANTORO
npx ts-node scripts/auth/generate-session.ts ZUKERMAN
```

### O que acontece

1. Abre navegador **visível** (headful)
2. Navega para página de login do site
3. **VOCÊ faz login manualmente** (incluindo MFA/OTP se solicitado)
4. Pressiona ENTER quando estiver logado
5. Script salva arquivos:
   - `sessions/{site}.json` - storageState completo
   - `sessions/{site}.base64.txt` - valor para env var

---

## 2. Configurando no Render

### Opção A: Variável de Ambiente (Recomendado)

1. No Render Dashboard, vá em **Environment**
2. Clique em **Add Environment Variable**
3. Configure:
   - **Key**: `SESSION_MERCADO_LIVRE`
   - **Value**: conteúdo do arquivo `sessions/mercado_livre.base64.txt`
4. Clique **Save Changes**
5. Faça **Manual Deploy**

### Opção B: Secret File

1. No Render Dashboard, vá em **Settings > Secret Files**
2. Clique em **Add Secret File**
3. Configure:
   - **Filename**: `/tmp/radarone-sessions/mercado_livre.json`
   - **Contents**: conteúdo do arquivo `sessions/mercado_livre.json`
4. Salve e faça deploy

---

## 3. Logs de Autenticação

### Sucesso

```
ML_AUTH_STATE: loaded=true source=env path=/tmp/radarone-sessions/mercado_livre.json
ML_AUTH_CONTEXT: Usando sessão autenticada de env
ML_SCRAPER_SUCCESS: 42 anúncios extraídos
ML_AUTH_SUCCESS: Scraping com sessão autenticada funcionou
```

### Sessão Expirada

```
ML_AUTH_STATE: loaded=true source=env path=/tmp/radarone-sessions/mercado_livre.json
ML_AUTH_CONTEXT: Usando sessão autenticada de env
ML_LOGIN_REQUIRED: Mercado Livre exigindo login para esta busca
ML_AUTH_EXPIRED: Sessão autenticada expirou ou é inválida
ML_AUTH_SESSION_EXPIRED: Sessão do Mercado Livre expirou...
```

### Sem Sessão Configurada

```
ML_AUTH_STATE: loaded=false source=none path=none
ML_AUTH_FALLBACK: Usando contexto sem autenticação
ML_LOGIN_REQUIRED: Esta busca requer autenticação...
```

---

## 4. Renovando Sessão Expirada

Quando ver `ML_AUTH_SESSION_EXPIRED` nos logs:

1. **Localmente**, execute:
   ```bash
   npx ts-node scripts/auth/mercadolivre-session.ts
   ```

2. Faça login no navegador que abrir

3. Copie o novo valor base64 gerado

4. No **Render**, atualize a variável `SESSION_MERCADO_LIVRE`

5. Faça **redeploy**

### Frequência de Renovação

- **Mercado Livre**: a cada ~14 dias (ou quando expirar)
- **Outros sites**: a cada ~7 dias

---

## 5. Troubleshooting

### "Site exige MFA mas não consigo completar"

MFA (autenticação de dois fatores) só pode ser completada manualmente. O script CLI abre navegador visível justamente para isso.

Se o site pedir MFA durante a geração de sessão:
1. Complete o MFA normalmente (SMS, app, email)
2. Aguarde login completar
3. Pressione ENTER no terminal

### "Sessão expira muito rápido"

Alguns fatores podem invalidar sessões:
- IP diferente (Render vs local)
- User-Agent diferente
- Muitas requisições em curto período

Soluções:
- Aumente o intervalo entre execuções do monitor
- Considere usar proxy residencial
- Gere sessão mais frequentemente

### "Logs mostram LOGIN_REQUIRED mas sessão está configurada"

Verifique:
1. A variável `SESSION_MERCADO_LIVRE` está corretamente configurada?
2. O valor é base64 válido? (não JSON direto)
3. Fez redeploy após configurar?

Teste:
```bash
# Localmente, valide a sessão
npx ts-node scripts/auth/mercadolivre-session.ts --validate
```

---

## 6. Segurança

### O que é armazenado

O storageState contém:
- Cookies de sessão
- localStorage relevante
- Não contém senhas

### Boas práticas

- **Nunca** commite arquivos `.json` ou `.base64.txt` no git
- Use variáveis de ambiente secretas no Render
- Não compartilhe valores de sessão
- Renove sessões periodicamente

### Arquivos ignorados (já no .gitignore)

```
sessions/
*.base64.txt
```

---

## 7. Estrutura de Arquivos

```
worker/
├── scripts/
│   └── auth/
│       ├── generate-session.ts      # Script genérico
│       └── mercadolivre-session.ts  # Script específico ML
├── src/
│   ├── config/
│   │   └── auth-sites.ts            # Configurações por site
│   ├── utils/
│   │   └── auth-manager.ts          # Gerenciador de autenticação
│   └── scrapers/
│       └── mercadolivre-scraper.ts  # Scraper integrado com auth
├── sessions/                         # (ignorado no git)
│   ├── mercado_livre.json
│   └── mercado_livre.base64.txt
└── AUTH-SESSIONS.md                  # Esta documentação
```

---

## 8. Adicionando Novo Site

1. Adicione configuração em `src/config/auth-sites.ts`:

```typescript
NOVO_SITE: {
  siteId: 'NOVO_SITE',
  displayName: 'Nome do Site',
  loginUrl: 'https://site.com/login',
  validationUrl: 'https://site.com/',
  domain: 'site.com',
  loggedInSelectors: ['.user-menu'],
  loginPageSelectors: ['input[name="email"]'],
  loginRequiredTexts: ['faça login'],
  sessionExpiryDays: 7,
  mayRequireMFA: false,
}
```

2. Gere sessão:
```bash
npx ts-node scripts/auth/generate-session.ts NOVO_SITE
```

3. Configure no Render: `SESSION_NOVO_SITE`

4. Use no scraper:
```typescript
import { authManager } from '../utils/auth-manager';

const { context, browser } = await authManager.getAuthenticatedContext('NOVO_SITE');
```
