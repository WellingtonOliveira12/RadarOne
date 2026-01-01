/**
 * Script de validação de configuração de produção
 *
 * Valida todas as variáveis de ambiente críticas para segurança
 * e compliance antes de rodar em produção.
 *
 * Uso:
 *   npm run validate:config
 *   ts-node scripts/validate-production-config.ts
 */

import dotenv from 'dotenv';

dotenv.config();

interface ValidationResult {
  name: string;
  valid: boolean;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  recommendation?: string;
}

const results: ValidationResult[] = [];

function validate(
  name: string,
  condition: boolean,
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
  message: string,
  recommendation?: string
) {
  results.push({ name, valid: condition, severity, message, recommendation });
}

console.log('🔍 VALIDANDO CONFIGURAÇÃO DE PRODUÇÃO - RADARONE\n');
console.log('═'.repeat(60));

const isProduction = process.env.NODE_ENV === 'production';

// ============================================
// JWT E AUTENTICAÇÃO
// ============================================

const jwtSecret = process.env.JWT_SECRET || '';
validate(
  'JWT_SECRET',
  jwtSecret.length >= 32,
  'CRITICAL',
  `JWT_SECRET tem ${jwtSecret.length} caracteres (mínimo: 32)`,
  'Gere uma secret forte: openssl rand -base64 32'
);

validate(
  'JWT_SECRET não é default',
  jwtSecret !== 'your-super-secret-jwt-key-change-this-in-production',
  'CRITICAL',
  'JWT_SECRET ainda está com valor padrão do .env.example',
  'Troque imediatamente por valor único'
);

const passwordResetSecret = process.env.PASSWORD_RESET_SECRET || '';
validate(
  'PASSWORD_RESET_SECRET separada',
  passwordResetSecret.length > 0 && passwordResetSecret !== jwtSecret,
  'HIGH',
  passwordResetSecret.length === 0
    ? 'PASSWORD_RESET_SECRET não configurada (usando JWT_SECRET)'
    : 'PASSWORD_RESET_SECRET configurada corretamente',
  'Configure uma secret separada para maior segurança'
);

// ============================================
// SEGURANÇA E PRIVACIDADE
// ============================================

const cpfEncryptionKey = process.env.CPF_ENCRYPTION_KEY || '';
validate(
  'CPF_ENCRYPTION_KEY',
  cpfEncryptionKey.length === 64 && /^[0-9a-f]{64}$/i.test(cpfEncryptionKey),
  'CRITICAL',
  cpfEncryptionKey.length === 64
    ? 'CPF_ENCRYPTION_KEY tem 64 caracteres hexadecimais (OK)'
    : `CPF_ENCRYPTION_KEY inválido (${cpfEncryptionKey.length} chars, esperado: 64 hex)`,
  'Gere uma chave válida: openssl rand -hex 32'
);

validate(
  'CPF_ENCRYPTION_KEY não é default',
  cpfEncryptionKey !== '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  'CRITICAL',
  'CPF_ENCRYPTION_KEY ainda está com valor padrão',
  'URGENTE: Troque por valor único e rotacione CPFs criptografados'
);

const revealEmailNotFound = process.env.REVEAL_EMAIL_NOT_FOUND === 'true';
validate(
  'REVEAL_EMAIL_NOT_FOUND',
  !revealEmailNotFound || !isProduction,
  'MEDIUM',
  revealEmailNotFound
    ? 'REVEAL_EMAIL_NOT_FOUND=true (permite enumeração de usuários)'
    : 'REVEAL_EMAIL_NOT_FOUND=false (seguro)',
  'Em produção, deve ser false ou não definido'
);

// ============================================
// WEBHOOKS E INTEGRAÇÕES
// ============================================

const kiwifyWebhookSecret = process.env.KIWIFY_WEBHOOK_SECRET || '';
validate(
  'KIWIFY_WEBHOOK_SECRET',
  kiwifyWebhookSecret.length > 0,
  'HIGH',
  kiwifyWebhookSecret.length > 0
    ? 'KIWIFY_WEBHOOK_SECRET configurado'
    : 'KIWIFY_WEBHOOK_SECRET NÃO configurado (webhooks não serão validados)',
  'Configure para validar assinatura HMAC dos webhooks'
);

validate(
  'KIWIFY_WEBHOOK_SECRET não é default',
  kiwifyWebhookSecret !== 'your-kiwify-webhook-secret',
  'HIGH',
  'KIWIFY_WEBHOOK_SECRET ainda está com valor padrão',
  'Troque pelo valor configurado no painel da Kiwify'
);

const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
validate(
  'TELEGRAM_WEBHOOK_SECRET',
  telegramWebhookSecret.length >= 32,
  'MEDIUM',
  `TELEGRAM_WEBHOOK_SECRET tem ${telegramWebhookSecret.length} caracteres (mínimo: 32)`,
  'Gere uma secret forte: openssl rand -hex 32'
);

validate(
  'TELEGRAM_WEBHOOK_SECRET não é default',
  telegramWebhookSecret !== 'your-telegram-webhook-secret-change-in-production',
  'MEDIUM',
  'TELEGRAM_WEBHOOK_SECRET ainda está com valor padrão',
  'Troque por valor único'
);

// ============================================
// DATABASE
// ============================================

const databaseUrl = process.env.DATABASE_URL || '';
validate(
  'DATABASE_URL',
  databaseUrl.length > 0 && databaseUrl.includes('postgresql://'),
  'CRITICAL',
  databaseUrl.length > 0
    ? 'DATABASE_URL configurado'
    : 'DATABASE_URL NÃO configurado',
  'Configure a URL do PostgreSQL (Neon)'
);

validate(
  'DATABASE_URL não é localhost',
  !databaseUrl.includes('localhost') || !isProduction,
  'CRITICAL',
  databaseUrl.includes('localhost')
    ? 'DATABASE_URL aponta para localhost (DESENVOLVIMENTO)'
    : 'DATABASE_URL configurado para produção',
  'Em produção, deve apontar para Neon ou outro DB cloud'
);

validate(
  'DATABASE_URL usa SSL',
  databaseUrl.includes('sslmode=require') || !isProduction,
  'HIGH',
  databaseUrl.includes('sslmode=require')
    ? 'DATABASE_URL usa SSL (seguro)'
    : 'DATABASE_URL NÃO usa SSL',
  'Adicione ?sslmode=require na URL de produção'
);

// ============================================
// EMAIL SERVICE
// ============================================

const resendApiKey = process.env.RESEND_API_KEY || '';
validate(
  'RESEND_API_KEY',
  resendApiKey.startsWith('re_') && resendApiKey.length > 10,
  'HIGH',
  resendApiKey.length > 0
    ? 'RESEND_API_KEY configurado'
    : 'RESEND_API_KEY NÃO configurado (emails não serão enviados)',
  'Configure a API key do Resend'
);

// ============================================
// URLS E CORS
// ============================================

const publicUrl = process.env.PUBLIC_URL || '';
validate(
  'PUBLIC_URL',
  publicUrl.startsWith('https://') || !isProduction,
  'MEDIUM',
  publicUrl.startsWith('https://')
    ? 'PUBLIC_URL usa HTTPS'
    : 'PUBLIC_URL não usa HTTPS',
  'Em produção, deve usar HTTPS'
);

const frontendUrl = process.env.FRONTEND_URL || '';
validate(
  'FRONTEND_URL',
  frontendUrl.startsWith('https://') || !isProduction,
  'MEDIUM',
  frontendUrl.startsWith('https://')
    ? 'FRONTEND_URL usa HTTPS'
    : 'FRONTEND_URL não usa HTTPS',
  'Em produção, deve usar HTTPS'
);

// ============================================
// RESULTADO DA VALIDAÇÃO
// ============================================

console.log('\n📊 RESULTADO DA VALIDAÇÃO\n');
console.log('═'.repeat(60));

const criticalIssues = results.filter(r => !r.valid && r.severity === 'CRITICAL');
const highIssues = results.filter(r => !r.valid && r.severity === 'HIGH');
const mediumIssues = results.filter(r => !r.valid && r.severity === 'MEDIUM');
const lowIssues = results.filter(r => !r.valid && r.severity === 'LOW');

const totalIssues = criticalIssues.length + highIssues.length + mediumIssues.length + lowIssues.length;

if (totalIssues === 0) {
  console.log('✅ TODAS AS VALIDAÇÕES PASSARAM!\n');
  console.log('Sistema está configurado corretamente para produção.\n');
  process.exit(0);
}

// Exibir issues por severidade
if (criticalIssues.length > 0) {
  console.log('🔴 CRÍTICO (deve corrigir AGORA):');
  console.log('─'.repeat(60));
  criticalIssues.forEach(issue => {
    console.log(`\n❌ ${issue.name}`);
    console.log(`   ${issue.message}`);
    if (issue.recommendation) {
      console.log(`   💡 ${issue.recommendation}`);
    }
  });
  console.log('\n');
}

if (highIssues.length > 0) {
  console.log('🟠 ALTO (corrigir antes de produção):');
  console.log('─'.repeat(60));
  highIssues.forEach(issue => {
    console.log(`\n⚠️  ${issue.name}`);
    console.log(`   ${issue.message}`);
    if (issue.recommendation) {
      console.log(`   💡 ${issue.recommendation}`);
    }
  });
  console.log('\n');
}

if (mediumIssues.length > 0) {
  console.log('🟡 MÉDIO (recomendado corrigir):');
  console.log('─'.repeat(60));
  mediumIssues.forEach(issue => {
    console.log(`\n⚠️  ${issue.name}`);
    console.log(`   ${issue.message}`);
    if (issue.recommendation) {
      console.log(`   💡 ${issue.recommendation}`);
    }
  });
  console.log('\n');
}

if (lowIssues.length > 0) {
  console.log('🟢 BAIXO (opcional):');
  console.log('─'.repeat(60));
  lowIssues.forEach(issue => {
    console.log(`\nℹ️  ${issue.name}`);
    console.log(`   ${issue.message}`);
    if (issue.recommendation) {
      console.log(`   💡 ${issue.recommendation}`);
    }
  });
  console.log('\n');
}

console.log('═'.repeat(60));
console.log(`\n📈 RESUMO:`);
console.log(`   🔴 Crítico: ${criticalIssues.length}`);
console.log(`   🟠 Alto: ${highIssues.length}`);
console.log(`   🟡 Médio: ${mediumIssues.length}`);
console.log(`   🟢 Baixo: ${lowIssues.length}`);
console.log(`   Total de issues: ${totalIssues}\n`);

if (criticalIssues.length > 0) {
  console.log('⛔ NÃO RODAR EM PRODUÇÃO até corrigir issues CRÍTICOS!\n');
  process.exit(1);
}

if (highIssues.length > 0 && isProduction) {
  console.log('⚠️  RECOMENDADO corrigir issues ALTOS antes de produção.\n');
  process.exit(1);
}

console.log('✅ Configuração aceitável para produção.\n');
process.exit(0);
