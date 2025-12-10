import { prisma } from '../server';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export async function linkTelegramAccount(userId: string, chatId: string, username?: string) {
  return await prisma.telegramAccount.upsert({
    where: { chatId },
    update: { userId, username, active: true },
    create: { userId, chatId, username, active: true }
  });
}

export async function getUserTelegramAccount(userId: string) {
  return await prisma.telegramAccount.findFirst({
    where: { userId, active: true }
  });
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  if (!BOT_TOKEN) {
    console.warn('[TELEGRAM] BOT_TOKEN não configurado');
    return false;
  }

  const url = 'https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML'
      })
    });

    return response.ok;
  } catch (error) {
    console.error('[TELEGRAM] Erro ao enviar mensagem:', error);
    return false;
  }
}
