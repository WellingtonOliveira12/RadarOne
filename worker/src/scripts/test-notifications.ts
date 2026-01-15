#!/usr/bin/env node
/**
 * Test Notifications Script
 *
 * Testa envio de notificações Telegram e Email de forma isolada,
 * sem depender de banco de dados, monitores ou scrapers.
 *
 * Uso:
 *   Local:  npm run build && node dist/scripts/test-notifications.js
 *   Render: node dist/scripts/test-notifications.js
 *
 * Env vars necessárias:
 *   TELEGRAM_BOT_TOKEN     - Token do bot Telegram
 *   TEST_TELEGRAM_CHAT_ID  - Chat ID para teste
 *   RESEND_API_KEY         - API key do Resend
 *   TEST_EMAIL_TO          - Email para teste
 */

import dotenv from 'dotenv';
dotenv.config();

import { TelegramService } from '../services/telegram-service';
import { emailService } from '../services/email-service';

// Cores ANSI para output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

// Anúncio fake para teste
const FAKE_AD = {
  title: 'iPhone 15 Pro Max 256GB - TESTE RADARONE',
  description: 'Este é um anúncio de teste para validar o sistema de notificações do RadarOne. Se você recebeu esta mensagem, o sistema está funcionando corretamente!',
  price: 8999.99,
  url: 'https://radarone.com.br/test-notification',
  imageUrl: 'https://placehold.co/600x400/667eea/ffffff?text=RadarOne+Test',
  location: 'Teste - Brasil',
};

const MONITOR_NAME = 'Monitor de Teste (Validacao)';

async function testTelegram(): Promise<boolean> {
  const chatId = process.env.TEST_TELEGRAM_CHAT_ID;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  console.log('\n' + '='.repeat(50));
  console.log('TESTE TELEGRAM');
  console.log('='.repeat(50));

  // Validações
  if (!botToken) {
    console.log(`${RED}TELEGRAM_TEST_FAIL: TELEGRAM_BOT_TOKEN nao configurado${RESET}`);
    return false;
  }

  if (!chatId) {
    console.log(`${YELLOW}TELEGRAM_TEST_SKIP: TEST_TELEGRAM_CHAT_ID nao configurado${RESET}`);
    console.log('  Defina TEST_TELEGRAM_CHAT_ID no ambiente para testar');
    return false;
  }

  console.log(`  Bot Token: ${botToken.slice(0, 10)}...`);
  console.log(`  Chat ID: ${chatId}`);

  try {
    await TelegramService.sendAdAlert(chatId, {
      monitorName: MONITOR_NAME,
      ad: FAKE_AD,
    });

    console.log(`${GREEN}TELEGRAM_TEST_OK chatId=${chatId}${RESET}`);
    return true;
  } catch (error: any) {
    console.log(`${RED}TELEGRAM_TEST_FAIL: ${error.message}${RESET}`);

    // Diagnóstico adicional
    if (error.message.includes('chat not found')) {
      console.log('  DICA: O usuario precisa iniciar conversa com o bot primeiro (/start)');
    } else if (error.message.includes('bot was blocked')) {
      console.log('  DICA: O usuario bloqueou o bot. Peca para desbloquear.');
    } else if (error.message.includes('401')) {
      console.log('  DICA: TELEGRAM_BOT_TOKEN invalido ou expirado');
    }

    return false;
  }
}

async function testEmail(): Promise<boolean> {
  const emailTo = process.env.TEST_EMAIL_TO;
  const apiKey = process.env.RESEND_API_KEY;

  console.log('\n' + '='.repeat(50));
  console.log('TESTE EMAIL');
  console.log('='.repeat(50));

  // Validações
  if (!apiKey) {
    console.log(`${RED}EMAIL_TEST_FAIL: RESEND_API_KEY nao configurado${RESET}`);
    return false;
  }

  if (!emailService.isEnabled()) {
    console.log(`${RED}EMAIL_TEST_FAIL: Email service desabilitado${RESET}`);
    return false;
  }

  if (!emailTo) {
    console.log(`${YELLOW}EMAIL_TEST_SKIP: TEST_EMAIL_TO nao configurado${RESET}`);
    console.log('  Defina TEST_EMAIL_TO no ambiente para testar');
    return false;
  }

  console.log(`  API Key: ${apiKey.slice(0, 10)}...`);
  console.log(`  Email To: ${emailTo}`);

  try {
    const result = await emailService.sendAdAlert({
      to: emailTo,
      monitorName: MONITOR_NAME,
      ad: FAKE_AD,
    });

    if (result.success) {
      console.log(`${GREEN}EMAIL_TEST_OK messageId=${result.messageId}${RESET}`);
      return true;
    } else {
      console.log(`${RED}EMAIL_TEST_FAIL: ${result.error}${RESET}`);
      return false;
    }
  } catch (error: any) {
    console.log(`${RED}EMAIL_TEST_FAIL: ${error.message}${RESET}`);

    // Diagnóstico adicional
    if (error.message.includes('401') || error.message.includes('403')) {
      console.log('  DICA: RESEND_API_KEY invalido ou sem permissao');
    } else if (error.message.includes('domain')) {
      console.log('  DICA: Dominio de envio nao verificado no Resend');
    }

    return false;
  }
}

async function main() {
  console.log('');
  console.log('='.repeat(60));
  console.log('  RADARONE - TESTE ISOLADO DE NOTIFICACOES');
  console.log('='.repeat(60));
  console.log(`  Timestamp: ${new Date().toISOString()}`);
  console.log(`  Node: ${process.version}`);

  console.log('\n  Configuracao detectada:');
  console.log(`    TELEGRAM_BOT_TOKEN: ${process.env.TELEGRAM_BOT_TOKEN ? 'OK' : 'NAO CONFIGURADO'}`);
  console.log(`    TEST_TELEGRAM_CHAT_ID: ${process.env.TEST_TELEGRAM_CHAT_ID || 'NAO CONFIGURADO'}`);
  console.log(`    RESEND_API_KEY: ${process.env.RESEND_API_KEY ? 'OK' : 'NAO CONFIGURADO'}`);
  console.log(`    TEST_EMAIL_TO: ${process.env.TEST_EMAIL_TO || 'NAO CONFIGURADO'}`);
  console.log(`    EMAIL_FROM: ${process.env.EMAIL_FROM || 'RadarOne <noreply@radarone.app>'}`);

  // Executar testes
  const telegramOk = await testTelegram();
  const emailOk = await testEmail();

  // Resumo
  console.log('\n' + '='.repeat(50));
  console.log('RESUMO');
  console.log('='.repeat(50));
  console.log(`  Telegram: ${telegramOk ? GREEN + 'PASSOU' + RESET : (process.env.TEST_TELEGRAM_CHAT_ID ? RED + 'FALHOU' + RESET : YELLOW + 'PULADO' + RESET)}`);
  console.log(`  Email:    ${emailOk ? GREEN + 'PASSOU' + RESET : (process.env.TEST_EMAIL_TO ? RED + 'FALHOU' + RESET : YELLOW + 'PULADO' + RESET)}`);
  console.log('='.repeat(50));

  // Exit code
  if (!process.env.TEST_TELEGRAM_CHAT_ID && !process.env.TEST_EMAIL_TO) {
    console.log(`\n${YELLOW}AVISO: Nenhuma variavel de teste configurada.${RESET}`);
    console.log('Configure pelo menos uma das variaveis:');
    console.log('  TEST_TELEGRAM_CHAT_ID=seu_chat_id');
    console.log('  TEST_EMAIL_TO=seu@email.com');
    process.exit(0);
  }

  const allConfiguredPassed =
    (process.env.TEST_TELEGRAM_CHAT_ID ? telegramOk : true) &&
    (process.env.TEST_EMAIL_TO ? emailOk : true);

  process.exit(allConfiguredPassed ? 0 : 1);
}

main().catch((error) => {
  console.error(`${RED}FATAL: ${error.message}${RESET}`);
  process.exit(1);
});
