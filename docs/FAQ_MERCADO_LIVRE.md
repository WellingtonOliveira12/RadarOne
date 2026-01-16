# FAQ - Mercado Livre

Problemas comuns e solucoes para o scraper do Mercado Livre.

## Erros de Autenticacao

### "ML_AUTH_FALLBACK: Usando contexto sem autenticacao"

**Causa:** Nenhuma sessao configurada.

**Solucao:**
1. Execute `npm run ml:login` localmente
2. Configure `ML_STORAGE_STATE_PATH` ou `ML_STORAGE_STATE_B64` no Render
3. Faca deploy

### "ML_LOGIN_REQUIRED: Esta busca requer autenticacao"

**Causa:** O Mercado Livre esta exigindo login para essa busca.

**Solucao:**
1. Gere uma sessao: `npm run ml:login`
2. Configure no Render (veja MERCADO_LIVRE_AUTH.md)

### "ML_AUTH_EXPIRED: Sessao autenticada expirou"

**Causa:** A sessao configurada expirou (~14 dias).

**Solucao:**
1. Gere nova sessao: `npm run ml:login`
2. Atualize no Render

## Erros de Extracao

### "ML_VALIDATION: valid=0 skipped_no_id=X"

**Causa:** O extrator nao conseguiu extrair o ID dos anuncios.

**Solucao:**
- Verifique se o scraper esta atualizado
- O ID e extraido da URL do anuncio (formato MLB-1234567890)
- Se persistir, pode ser mudanca no layout do ML

### "ML_EXTRACTION_ZERO_ADS" / 0 anuncios extraidos

**Causa:** Container encontrado mas nenhum anuncio valido extraido.

**Possiveis causas:**
1. Filtro de preco muito restritivo (verifique priceMin/priceMax)
2. Mudanca no layout do ML
3. Pagina de "sem resultados"

**Solucao:**
1. Verifique screenshot forense em `/tmp/radarone-screenshots/`
2. Revise os filtros do monitor
3. Se for mudanca de layout, abra issue

## Erros de Navegacao

### "ML_CHALLENGE_DETECTED" / Pagina de captcha

**Causa:** O Mercado Livre esta pedindo captcha.

**Solucao:**
1. Configure sessao autenticada (reduz chances de captcha)
2. Se ja tem sessao, gere uma nova
3. Configure captcha solver (2Captcha) se necessario

### "ML_NO_CONTAINER" / Nenhum container encontrado

**Causa:** A pagina nao tem os seletores esperados.

**Possiveis causas:**
1. Bloqueio/captcha nao detectado
2. Mudanca no layout do ML
3. URL de busca invalida

**Solucao:**
1. Verifique screenshot forense
2. Teste a URL manualmente no navegador
3. Se for mudanca de layout, abra issue

## Logs de Diagnostico

### Como interpretar os logs

```
ML_AUTH_STATE: loaded=true source=secret_file path=/etc/secrets/ml.json
```
- `loaded=true`: Sessao carregada com sucesso
- `source=secret_file`: Fonte foi Secret File (melhor opcao)
- `path`: Caminho do arquivo

```
ML_PAGE_DIAGNOSTICS:
  requestedUrl: https://lista.mercadolivre.com.br/...
  finalUrl: https://www.mercadolivre.com.br/gz/account-verification
  isLoginRequired: true
```
- `finalUrl` diferente de `requestedUrl`: Houve redirecionamento
- URL com `/account-verification`: ML pedindo verificacao

```
ML_VALIDATION: valid=5 skipped_no_id=2 skipped_no_price=1
```
- `valid=5`: 5 anuncios validos extraidos
- `skipped_no_id=2`: 2 descartados por nao ter ID
- `skipped_no_price=1`: 1 descartado por nao ter preco

## Screenshots Forenses

O sistema salva screenshots automaticamente em `/tmp/radarone-screenshots/` quando:
- Login e requerido
- Captcha e detectado
- Container nao e encontrado
- Extracao retorna 0 anuncios

Para ver os screenshots no Render:
```bash
# Via Render Shell
ls -la /tmp/radarone-screenshots/
```

## Variaveis de Ambiente

### Obrigatorias

Nenhuma (funciona sem autenticacao, mas algumas buscas podem falhar)

### Recomendadas

| Variavel | Descricao |
|----------|-----------|
| `ML_STORAGE_STATE_PATH` | Caminho para storageState.json |
| `ML_STORAGE_STATE_B64` | storageState em base64 |

### Opcionais

| Variavel | Descricao |
|----------|-----------|
| `USE_SESSION_MANAGER` | `true` para usar Session Manager antigo |
| `TWOCAPTCHA_API_KEY` | API key do 2Captcha para resolver captchas |

## Perguntas Frequentes

### Quanto tempo dura a sessao?

Aproximadamente 14 dias, mas pode variar. O ML pode invalidar mais cedo se detectar atividade suspeita.

### Posso usar mais de uma conta?

O sistema atual suporta uma sessao por vez. Para multiplas contas, use o Session Manager (`USE_SESSION_MANAGER=true`).

### A sessao e segura?

Sim. A sessao contem apenas cookies e localStorage, nao sua senha. Os arquivos sao ignorados pelo git.

### Como saber se preciso renovar a sessao?

Monitore os logs. Se aparecer `ML_LOGIN_REQUIRED` ou `ML_AUTH_EXPIRED`, renove.

### O que fazer se o ML mudar o layout?

1. Verifique screenshots forenses
2. Abra issue no repositorio com detalhes
3. Aguarde atualizacao dos seletores

### Posso testar localmente?

Sim! Use `npm run dev` no worker. A sessao local sera usada automaticamente se existir em `worker/sessions/mercadolivre/`.

## Comandos Uteis

```bash
# Gerar sessao (abre navegador)
npm run ml:login

# Gerar base64 da sessao
npm run ml:state:encode

# Copiar base64 para clipboard (macOS)
cat worker/sessions/mercadolivre/storageState.base64.txt | pbcopy

# Ver arquivos de sessao
ls -la worker/sessions/mercadolivre/

# Executar worker localmente
npm run dev
```
