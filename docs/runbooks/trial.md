# Runbook: Trial do RadarOne

## Causa raiz (incidente 2026-02-16)

O seed de produção (`prisma/seed.ts`) definia `trialDays: 0` para o plano FREE.
Isso fazia `startTrialForUser` calcular `trialEndsAt = now + 0 = now`, criando
trials que expiravam instantaneamente. Usuários novos eram redirecionados para
`/plans?reason=trial_expired` imediatamente após registro.

## Correções aplicadas

1. **Banco de produção**: `UPDATE plans SET trial_days=7 WHERE slug='free'`
2. **Subscriptions quebradas**: Ajustadas com `trial_ends_at = created_at + 7 days`
3. **seed.ts**: Corrigido para `trialDays: 7`
4. **billingService.ts**: Guard rail (fallback 7 dias se trialDays < 1)
5. **planBootValidation.ts**: Verifica integridade dos planos a cada boot do servidor
6. **startTrialForUser**: Transacional, impede duplicatas e reutilização de trial

## SQL de diagnostico

### 1. Verificar trialDays do plano FREE

```sql
SELECT slug, trial_days FROM plans WHERE slug = 'free';
-- Esperado: trial_days = 7
```

### 2. Verificar subscriptions recentes

```sql
SELECT s.id, s.user_id, s.status, s.created_at, s.trial_ends_at,
       (s.trial_ends_at - s.created_at) AS diff
FROM subscriptions s
JOIN plans p ON p.id = s.plan_id
WHERE p.slug = 'free'
ORDER BY s.created_at DESC
LIMIT 20;
-- Esperado: diff ~ 7 days para todas
```

### 3. Contar broken trials (alerta)

```sql
SELECT COUNT(*) AS broken_trials
FROM subscriptions
WHERE is_trial = true
  AND trial_ends_at IS NOT NULL
  AND trial_ends_at <= created_at + interval '5 minutes'
  AND status IN ('TRIAL', 'EXPIRED');
-- Esperado: 0
```

## SQL de correcao (emergencia)

### Corrigir plano FREE

```sql
UPDATE plans SET trial_days = 7 WHERE slug = 'free' AND trial_days < 1;
```

### Corrigir subscriptions quebradas

```sql
UPDATE subscriptions s
SET trial_ends_at = s.created_at + interval '7 days',
    valid_until   = s.created_at + interval '7 days'
FROM plans p
WHERE p.id = s.plan_id
  AND p.slug = 'free'
  AND s.status IN ('TRIAL', 'EXPIRED')
  AND s.trial_ends_at <= s.created_at + interval '5 minutes';
```

### Script automatizado

```bash
cd backend
npx ts-node src/scripts/fix-free-plan-trial-days.ts
```

## Checklist de validacao pos-deploy

- [ ] `SELECT trial_days FROM plans WHERE slug='free'` retorna `7`
- [ ] Query de broken trials retorna `0`
- [ ] Criar usuario novo: `trialEndsAt` ~7 dias no futuro
- [ ] Repetir start-trial: resposta 200 (idempotente, sem nova subscription)
- [ ] Logs do boot mostram `[PLANS] Boot check OK`
- [ ] Job diario checkTrialExpiring nao reporta broken trials

## Protecoes automaticas

| Camada | Protecao |
|--------|----------|
| Boot do servidor | `ensurePlansIntegrity()` corrige trialDays < 1 automaticamente |
| billingService | Guard rail: fallback 7 dias + validacao trialEndsAt > now |
| Transacao | `prisma.$transaction` impede race conditions na criacao de trial |
| Deduplicacao | 1 trial por usuario/plano (qualquer status anterior bloqueia) |
| Cron diario | `checkTrialExpiring` conta broken trials e alerta se > 0 |
| seed.ts | `trialDays: 7` no plano FREE (update + create) |
