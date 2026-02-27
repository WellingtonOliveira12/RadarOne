declare module 'node-telegram-bot-api' {
  interface TelegramBotOptions {
    polling?: boolean | { interval?: number; autoStart?: boolean };
    webHook?: boolean | { port?: number; host?: string };
    onlyFirstMatch?: boolean;
    filepath?: boolean;
  }

  interface SendMessageOptions {
    parse_mode?: 'Markdown' | 'MarkdownV2' | 'HTML';
    reply_markup?: unknown;
    disable_web_page_preview?: boolean;
    disable_notification?: boolean;
    caption?: string;
    [key: string]: unknown;
  }

  interface Message {
    message_id: number;
    from?: {
      id: number;
      is_bot: boolean;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
      title?: string;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    date: number;
    text?: string;
    photo?: Array<{ file_id: string; width: number; height: number }>;
  }

  class TelegramBot {
    constructor(token: string, options?: TelegramBotOptions);
    sendMessage(chatId: number | string, text: string, options?: SendMessageOptions): Promise<Message>;
    sendPhoto(chatId: number | string, photo: string | Buffer, options?: SendMessageOptions): Promise<Message>;
    getMe(): Promise<{ id: number; is_bot: boolean; first_name: string; username?: string }>;
    getChat(chatId: number | string): Promise<{ id: number; type: string; title?: string; username?: string; first_name?: string; description?: string }>;
    on(event: string, callback: (msg: Message, match?: RegExpExecArray | null) => void): void;
    onText(regexp: RegExp, callback: (msg: Message, match: RegExpExecArray | null) => void): void;
    stopPolling(): Promise<void>;
  }

  export = TelegramBot;
}
