-- ========================================
-- HELPERS SQL PARA TESTES DE TRIAL
-- ========================================
-- Use estes comandos para configurar cenários de teste no banco de dados.
-- ATENÇÃO: Use apenas em ambiente de desenvolvimento/teste!
--
-- Usuário de teste padrão: e2e-test@radarone.com
-- ========================================

-- 1. CRIAR USUÁRIO DE TESTE (se não existir)
-- ========================================
INSERT INTO users (id, email, name, password, role, cpf_last4, is_active, created_at, updated_at)
VALUES (
  'e2e-test-user-id',
  'e2e-test@radarone.com',
  'E2E Test User',
  '$2b$10$abcdefghijklmnopqrstuvwxyz', -- senha hash (ajustar conforme necessário)
  'USER',
  '1234',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;

-- 2. CENÁRIO: Trial expirando em 2 dias (mostra banner)
-- ========================================
UPDATE subscriptions
SET
  trial_ends_at = NOW() + INTERVAL '2 days',
  valid_until = NOW() + INTERVAL '2 days',
  status = 'TRIAL',
  is_trial = true
WHERE user_id = (SELECT id FROM users WHERE email = 'e2e-test@radarone.com' LIMIT 1)
  AND status IN ('ACTIVE', 'TRIAL', 'EXPIRED');

-- 3. CENÁRIO: Trial EXPIRADO (redireciona para /plans)
-- ========================================
UPDATE subscriptions
SET
  trial_ends_at = NOW() - INTERVAL '1 day',
  valid_until = NOW() - INTERVAL '1 day',
  status = 'TRIAL',
  is_trial = true
WHERE user_id = (SELECT id FROM users WHERE email = 'e2e-test@radarone.com' LIMIT 1);

-- 4. CENÁRIO: Trial com mais de 7 dias (não mostra banner)
-- ========================================
UPDATE subscriptions
SET
  trial_ends_at = NOW() + INTERVAL '10 days',
  valid_until = NOW() + INTERVAL '10 days',
  status = 'TRIAL',
  is_trial = true
WHERE user_id = (SELECT id FROM users WHERE email = 'e2e-test@radarone.com' LIMIT 1);

-- 5. CENÁRIO: Assinatura ATIVA (paga, não mostra banner)
-- ========================================
UPDATE subscriptions
SET
  status = 'ACTIVE',
  is_trial = false,
  trial_ends_at = NULL,
  valid_until = NOW() + INTERVAL '30 days'
WHERE user_id = (SELECT id FROM users WHERE email = 'e2e-test@radarone.com' LIMIT 1);

-- 6. VERIFICAR STATUS ATUAL DO USUÁRIO DE TESTE
-- ========================================
SELECT
  u.email,
  s.status,
  s.is_trial,
  s.trial_ends_at,
  s.valid_until,
  CASE
    WHEN s.trial_ends_at IS NULL THEN 'N/A'
    WHEN s.trial_ends_at < NOW() THEN 'EXPIRADO'
    ELSE CONCAT(CEIL(EXTRACT(EPOCH FROM (s.trial_ends_at - NOW())) / 86400), ' dias')
  END as dias_restantes,
  p.name as plano
FROM users u
LEFT JOIN subscriptions s ON s.user_id = u.id
LEFT JOIN plans p ON p.id = s.plan_id
WHERE u.email = 'e2e-test@radarone.com'
ORDER BY s.created_at DESC
LIMIT 1;

-- 7. CRIAR ASSINATURA DE TESTE (se não existir)
-- ========================================
INSERT INTO subscriptions (
  user_id,
  plan_id,
  status,
  is_trial,
  trial_ends_at,
  valid_until,
  queries_limit,
  queries_used,
  created_at,
  updated_at
)
SELECT
  u.id,
  p.id,
  'TRIAL',
  true,
  NOW() + INTERVAL '7 days',
  NOW() + INTERVAL '7 days',
  1000,
  0,
  NOW(),
  NOW()
FROM users u
CROSS JOIN plans p
WHERE u.email = 'e2e-test@radarone.com'
  AND p.slug = 'free'
  AND NOT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = u.id
    AND s.status IN ('ACTIVE', 'TRIAL')
  )
LIMIT 1;

-- ========================================
-- COMANDOS ÚTEIS DE CLEANUP
-- ========================================

-- Resetar usuário de teste para estado inicial (trial de 7 dias)
UPDATE subscriptions
SET
  trial_ends_at = NOW() + INTERVAL '7 days',
  valid_until = NOW() + INTERVAL '7 days',
  status = 'TRIAL',
  is_trial = true,
  queries_used = 0
WHERE user_id = (SELECT id FROM users WHERE email = 'e2e-test@radarone.com' LIMIT 1);

-- Deletar usuário de teste completamente (CUIDADO!)
-- DELETE FROM subscriptions WHERE user_id = (SELECT id FROM users WHERE email = 'e2e-test@radarone.com' LIMIT 1);
-- DELETE FROM users WHERE email = 'e2e-test@radarone.com';
