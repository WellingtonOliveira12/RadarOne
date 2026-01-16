# Mercado Livre - Autenticacao

Este documento explica como configurar a autenticacao do Mercado Livre no RadarOne.

## Por que precisa de autenticacao?

O Mercado Livre pode exigir login para certas buscas, especialmente:
- Buscas em categorias especificas
- Buscas com filtros avancados
- Quando detecta muitas requisicoes do mesmo IP
- Quando exibe mensagem "Para continuar, acesse sua conta"

## Visao Geral do Fluxo

```
┌─────────────────────────────────────────────────────────────────┐
│  LOCAL (seu computador)                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1. Execute: npm run ml:login                           │   │
│  │  2. Navegador abre, faca login manualmente              │   │
│  │  3. Pressione ENTER quando logado                       │   │
│  │  4. Sessao salva em worker/sessions/mercadolivre/       │   │
│  │  5. Execute: npm run ml:state:encode                    │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  RENDER (producao)                                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Configure uma das opcoes:                              │   │
│  │                                                          │   │
│  │  OPCAO A (Secret File):                                 │   │
│  │    - Adicione arquivo em Secret Files                   │   │
│  │    - Configure ML_STORAGE_STATE_PATH                    │   │
│  │                                                          │   │
│  │  OPCAO B (ENV Base64):                                  │   │
│  │    - Configure ML_STORAGE_STATE_B64                     │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Passo a Passo

### 1. Gerar Sessao Localmente

```bash
cd worker

# Abre navegador para login manual
npm run ml:login
```

O script vai:
1. Abrir um navegador Chromium **visivel**
2. Navegar para o Mercado Livre
3. Aguardar voce fazer login manualmente
4. Salvar a sessao apos voce pressionar ENTER

**IMPORTANTE:** Faca login usando seu metodo preferido (QR Code, SMS, Email, etc). O script nao armazena sua senha.

### 2. Gerar Base64 (para ENV)

```bash
npm run ml:state:encode
```

Isso gera o valor base64 para copiar no Render.

### 3. Configurar no Render

#### OPCAO A: Secret File (Recomendado)

1. Va em **Dashboard > Seu Servico > Environment**
2. Clique na aba **Secret Files**
3. Clique **Add Secret File**
4. Configure:
   - **Filename:** `ml-storage-state.json`
   - **Contents:** Cole o conteudo de `worker/sessions/mercadolivre/storageState.json`
5. Va em **Environment Variables** e adicione:
   - **Key:** `ML_STORAGE_STATE_PATH`
   - **Value:** `/etc/secrets/ml-storage-state.json`
6. Faca deploy

#### OPCAO B: Variavel de Ambiente Base64

1. Va em **Dashboard > Seu Servico > Environment**
2. Clique **Add Environment Variable**
3. Configure:
   - **Key:** `ML_STORAGE_STATE_B64`
   - **Value:** Cole o conteudo de `worker/sessions/mercadolivre/storageState.base64.txt`
4. Faca deploy

**Nota:** A opcao A (Secret File) e melhor para arquivos grandes, pois env vars tem limite de tamanho.

## Verificar se Funcionou

Apos o deploy, verifique os logs. Voce deve ver:

```
ML_AUTH_PROVIDER: [PRIORITY A] Secret File valido em /etc/secrets/ml-storage-state.json
ML_AUTH_STATE: loaded=true source=secret_file path=/etc/secrets/ml-storage-state.json
ML_AUTH_OK: Usando sessao de secret_file
```

Ou para base64:

```
ML_AUTH_PROVIDER: [PRIORITY B] ENV base64 decodificado para /tmp/radarone-sessions/mercadolivre-from-env.json
ML_AUTH_STATE: loaded=true source=env_base64 path=/tmp/radarone-sessions/mercadolivre-from-env.json
ML_AUTH_OK: Usando sessao de env_base64
```

## Quando Renovar a Sessao

A sessao do Mercado Livre geralmente dura cerca de 14 dias. Voce precisara gerar uma nova quando:

1. Os logs mostrarem `ML_AUTH_EXPIRED` ou `ML_LOGIN_REQUIRED`
2. O scraper comecar a retornar 0 anuncios
3. Screenshots forenses mostrarem pagina de login

Para renovar, repita o processo:
1. `npm run ml:login` (local)
2. `npm run ml:state:encode`
3. Atualize no Render

## Prioridade de Carregamento

O sistema tenta carregar sessao nesta ordem:

1. **PRIORIDADE A:** Secret File via `ML_STORAGE_STATE_PATH`
2. **PRIORIDADE B:** ENV Base64 via `ML_STORAGE_STATE_B64` ou `SESSION_MERCADO_LIVRE`
3. **PRIORIDADE C:** Session Manager (se `USE_SESSION_MANAGER=true`)
4. **FALLBACK:** Contexto anonimo (sem autenticacao)

## Variaveis de Ambiente

| Variavel | Descricao | Exemplo |
|----------|-----------|---------|
| `ML_STORAGE_STATE_PATH` | Caminho para arquivo storageState | `/etc/secrets/ml-storage-state.json` |
| `ML_STORAGE_STATE_B64` | storageState em base64 | `eyJjb29raWVzIjpbLi4u...` |
| `SESSION_MERCADO_LIVRE` | (Legado) storageState em base64 | `eyJjb29raWVzIjpbLi4u...` |

## Arquivos Gerados

Apos executar `npm run ml:login`:

```
worker/sessions/mercadolivre/
├── storageState.json       # Sessao do Playwright (cookies + localStorage)
└── storageState.base64.txt # Versao base64 para env var
```

**IMPORTANTE:** Esses arquivos contem cookies de sessao. NUNCA commite no git (ja estao no .gitignore).

## Seguranca

- A sessao contem apenas cookies e localStorage, **nao sua senha**
- Os arquivos sao ignorados pelo git automaticamente
- No Render, use Secret Files em vez de env vars quando possivel
- A sessao expira automaticamente apos ~14 dias

## Troubleshooting

Veja [FAQ_MERCADO_LIVRE.md](./FAQ_MERCADO_LIVRE.md) para problemas comuns.
