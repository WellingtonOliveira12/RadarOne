/**
 * Constantes da aplicação
 */

// Versão da aplicação (atualizar manualmente quando fizer deploys importantes)
export const APP_VERSION = '1.1.0';

// Data do último build (será substituída em produção)
export const BUILD_DATE = new Date().toISOString();

// Ambiente
export const IS_PRODUCTION = import.meta.env.PROD;
export const IS_DEVELOPMENT = import.meta.env.DEV;

// API Base URL
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

// Telegram Bot
export const TELEGRAM_BOT_USERNAME = 'RadarOneAlertaBot';
export const TELEGRAM_BOT_LINK = `https://t.me/${TELEGRAM_BOT_USERNAME}`;
