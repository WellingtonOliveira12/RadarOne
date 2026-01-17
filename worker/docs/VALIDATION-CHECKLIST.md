# Checklist de Validação — Sessões Persistentes por Usuário

## PRÉ-REQUISITOS

### Ambiente

- [ ] `SESSION_ENCRYPTION_KEY` configurada (32+ caracteres)
- [ ] `RESEND_API_KEY` configurada (para alertas)
- [ ] Banco de dados PostgreSQL acessível
- [ ] Node.js 18+ instalado

### Migration

- [ ] Rodar `npx prisma migrate dev --name add_user_session_status`
- [ ] Verificar que enum `UserSessionStatus` foi criado
- [ ] Verificar que enum `LogStatus` inclui `SKIPPED`
- [ ] Verificar que `user_sessions` tem novos campos

---

## TESTES UNITÁRIOS

### UserSessionService

- [ ] `validateEncryptionKey()` retorna erro se chave ausente
- [ ] `validateEncryptionKey()` retorna erro se chave < 32 chars
- [ ] `validateStorageState()` rejeita JSON inválido
- [ ] `validateStorageState()` rejeita cookies de domínio errado
- [ ] `validateStorageState()` rejeita poucos cookies persistentes
- [ ] `saveUserSession()` criptografa storageState
- [ ] `saveUserSession()` faz upsert corretamente
- [ ] `getUserContext()` retorna erro se sessão não existe
- [ ] `getUserContext()` retorna erro se status = NEEDS_REAUTH
- [ ] `getUserContext()` retorna erro se expirada
- [ ] `getUserContext()` retorna contexto válido se ativa
- [ ] `markNeedsReauth()` atualiza status corretamente
- [ ] `markNeedsReauth()` respeita cooldown de notificação
- [ ] `hasValidSession()` retorna false para sessão expirada
- [ ] `deleteUserSession()` remove sessão do banco

### SessionProvider

- [ ] `getSessionContext()` tenta providers em ordem de prioridade
- [ ] `getSessionContext()` retorna `needsUserAction=true` se não há sessão
- [ ] `isAuthError()` detecta padrões de erro de autenticação
- [ ] `shouldSkipNotError()` retorna true para erros de auth

### RetryHelper

- [ ] `isAuthenticationError()` detecta `LOGIN_REQUIRED`
- [ ] `isAuthenticationError()` detecta `NEEDS_REAUTH`
- [ ] `isRetriableError()` retorna false para erros de auth
- [ ] Retry para após primeiro erro de auth (não 7 tentativas)

### CircuitBreaker

- [ ] Não incrementa falhas para erros de auth
- [ ] Propaga erro mesmo sem incrementar
- [ ] Abre normalmente para erros reais (timeout, etc.)

---

## TESTES E2E

### Cenário 1: Usuário sem sessão, site requer auth

```
DADO: Usuário sem sessão para MERCADO_LIVRE
QUANDO: Monitor é executado
ENTÃO:
  - Status do log = SKIPPED
  - Erro = "SESSION_REQUIRED"
  - Circuit breaker NÃO incrementa
  - UsageLog NÃO é criado
```

- [ ] Verificar no banco: `monitor_logs.status = 'SKIPPED'`
- [ ] Verificar logs: `MONITOR_SKIPPED: Sessão necessária`
- [ ] Verificar circuit breaker: estado continua CLOSED

### Cenário 2: Usuário com sessão válida

```
DADO: Usuário com sessão ACTIVE para MERCADO_LIVRE
QUANDO: Monitor é executado
ENTÃO:
  - Scraper usa contexto com storageState
  - Encontra anúncios normalmente
  - Status do log = SUCCESS
```

- [ ] Verificar: `lastUsedAt` atualizado na sessão
- [ ] Verificar: anúncios salvos em `ads_seen`
- [ ] Verificar: alertas enviados (se houver novos)

### Cenário 3: Sessão expira durante scraping

```
DADO: Usuário com sessão ACTIVE
QUANDO: ML retorna página de login durante scraping
ENTÃO:
  - Erro detectado como AUTH_ERROR
  - Sessão marcada como NEEDS_REAUTH
  - Log = SKIPPED (não ERROR)
  - Notificação enviada (se dentro do cooldown)
  - Circuit breaker NÃO incrementa
```

- [ ] Verificar: `user_sessions.status = 'NEEDS_REAUTH'`
- [ ] Verificar: `metadata.lastErrorReason` preenchido
- [ ] Verificar logs: `MONITOR_AUTH_ERROR`
- [ ] Verificar logs: `USER_SESSION_NEEDS_REAUTH`

### Cenário 4: Upload de arquivo válido

```
DADO: Usuário sem sessão
QUANDO: Faz upload de storageState válido
ENTÃO:
  - Validação passa
  - StorageState criptografado no banco
  - Status = ACTIVE
  - ExpiresAt calculado dos cookies
```

- [ ] Verificar: `encryptedStorageState` é ciphertext (formato `iv:tag:data`)
- [ ] Verificar: `metadata.cookieCount` correto
- [ ] Verificar: `expiresAt` <= 7 dias

### Cenário 5: Upload de arquivo inválido

```
DADO: Usuário tenta upload
QUANDO: Arquivo é JSON inválido ou de outro site
ENTÃO:
  - Erro retornado com mensagem clara
  - Nada salvo no banco
```

- [ ] Testar: JSON malformado → "JSON inválido"
- [ ] Testar: Cookies de OLX para ML → "Nenhum cookie encontrado para mercadolivre"
- [ ] Testar: Sessão já expirada → "Poucos cookies persistentes"

### Cenário 6: Cooldown de notificação

```
DADO: Sessão foi marcada NEEDS_REAUTH há 2 horas
QUANDO: Monitor executa novamente
ENTÃO:
  - NÃO envia nova notificação
  - Apenas marca SKIPPED
```

- [ ] Verificar: notificação enviada apenas 1x por período (6h)
- [ ] Verificar: `metadata.cooldownNotifiedAt` atualizado

---

## TESTES DE REGRESSÃO

### Circuit Breaker

- [ ] Após 5 erros de timeout consecutivos → OPEN
- [ ] Após 5 erros de auth consecutivos → continua CLOSED
- [ ] Mix de erros: 2 timeout + 3 auth → continua CLOSED (só 2 contam)

### Outros Sites

- [ ] Monitor OLX (não requer auth) → funciona normalmente
- [ ] Monitor WebMotors → funciona normalmente
- [ ] Monitor Superbid → mesma lógica do ML

### Performance

- [ ] Tempo de boot com validação de chave: < 100ms
- [ ] Tempo de descriptografia: < 50ms
- [ ] Tempo de criação de contexto: < 2s

---

## DEPLOY

### Pré-deploy

- [ ] Backup do banco de dados
- [ ] Variáveis de ambiente configuradas no Render
  - [ ] `SESSION_ENCRYPTION_KEY` (gerar com `openssl rand -hex 32`)
- [ ] Migration rodada em staging

### Deploy

- [ ] Deploy do worker
- [ ] Verificar logs de inicialização
- [ ] Verificar que `USER_SESSION_SERVICE` não mostra warning de chave

### Pós-deploy

- [ ] Criar monitor de teste no ML
- [ ] Verificar que fica SKIPPED (sem sessão)
- [ ] Fazer upload de sessão teste
- [ ] Verificar que monitor executa OK
- [ ] Forçar expiração e verificar NEEDS_REAUTH

---

## MÉTRICAS A MONITORAR

### Logs

- [ ] Taxa de `MONITOR_SKIPPED` com `SESSION_REQUIRED`
- [ ] Taxa de `MONITOR_AUTH_ERROR`
- [ ] Taxa de `USER_SESSION_NEEDS_REAUTH`
- [ ] Frequência de `REAUTH_NOTIFICATION`

### Banco

- [ ] Contagem de `user_sessions` por status
- [ ] Média de dias até NEEDS_REAUTH
- [ ] % de monitores ML com sessão válida

### Alertas

- [ ] Circuit breaker não deve abrir para ML (se apenas erros de auth)
- [ ] Se abrir, deve ser por timeout/crash real

---

## ROLLBACK

### Se problemas críticos

1. Reverter deploy do worker
2. Rodar migration de rollback (se houver)
3. Limpar cache de sessões

### Migration de rollback

```sql
-- Se precisar reverter
ALTER TABLE user_sessions DROP COLUMN status;
ALTER TABLE user_sessions DROP COLUMN encrypted_storage_state;
-- etc.
```

---

## ASSINATURAS

| Fase | Responsável | Data | Assinatura |
|------|-------------|------|------------|
| Testes unitários | | | |
| Testes E2E | | | |
| Review de código | | | |
| Deploy staging | | | |
| Deploy produção | | | |

---

*Checklist versão 1.0 — Janeiro 2026*
