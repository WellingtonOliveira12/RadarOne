/**
 * ============================================================
 * AUTH TYPES - Sistema de Autenticação Escalável
 * ============================================================
 */

import { BrowserContext, Page } from 'playwright';

// ============================================================
// ENUMS
// ============================================================

/**
 * Status operacional de uma conta
 */
export enum AccountStatus {
  /** Conta funcionando normalmente */
  OK = 'OK',
  /** Conta com problemas intermitentes */
  DEGRADED = 'DEGRADED',
  /** Requer intervenção humana (MFA manual, etc) */
  NEEDS_REAUTH = 'NEEDS_REAUTH',
  /** Conta bloqueada pelo site */
  BLOCKED = 'BLOCKED',
  /** Site mudou e fluxo precisa atualização */
  SITE_CHANGED = 'SITE_CHANGED',
  /** Conta desabilitada manualmente */
  DISABLED = 'DISABLED',
}

/**
 * Tipo de MFA suportado
 */
export enum MFAType {
  /** Sem MFA */
  NONE = 'NONE',
  /** TOTP (Google Authenticator, etc) */
  TOTP = 'TOTP',
  /** OTP por email */
  EMAIL_OTP = 'EMAIL_OTP',
  /** OTP por SMS (não suportado automaticamente) */
  SMS_OTP = 'SMS_OTP',
  /** Aprovação no app (não suportado automaticamente) */
  APP_APPROVAL = 'APP_APPROVAL',
}

/**
 * Resultado de detecção de página
 */
export enum PageDetectionResult {
  /** Usuário está logado */
  LOGGED_IN = 'LOGGED_IN',
  /** Página de login detectada */
  LOGIN_PAGE = 'LOGIN_PAGE',
  /** MFA/OTP requerido */
  MFA_REQUIRED = 'MFA_REQUIRED',
  /** Challenge (captcha, etc) */
  CHALLENGE = 'CHALLENGE',
  /** Conta bloqueada */
  ACCOUNT_BLOCKED = 'ACCOUNT_BLOCKED',
  /** Página normal (conteúdo) */
  CONTENT_PAGE = 'CONTENT_PAGE',
  /** Não determinado */
  UNKNOWN = 'UNKNOWN',
}

// ============================================================
// INTERFACES - CONTA
// ============================================================

/**
 * Credenciais de uma conta
 */
export interface AccountCredentials {
  /** Email ou username */
  username: string;
  /** Senha (criptografada no banco) */
  password: string;
  /** Segredo TOTP (base32) para gerar códigos */
  totpSecret?: string;
  /** Email para receber OTP (se diferente do username) */
  otpEmail?: string;
  /** Senha do email OTP */
  otpEmailPassword?: string;
}

/**
 * Configuração de uma conta no pool
 */
export interface AccountConfig {
  /** ID único da conta */
  accountId: string;
  /** Site associado (MERCADO_LIVRE, SUPERBID, etc) */
  site: string;
  /** Credenciais */
  credentials: AccountCredentials;
  /** Tipo de MFA configurado */
  mfaType: MFAType;
  /** Status atual */
  status: AccountStatus;
  /** Prioridade (maior = mais preferido) */
  priority: number;
  /** Última vez que foi usada com sucesso */
  lastSuccessAt?: Date;
  /** Última vez que falhou */
  lastFailureAt?: Date;
  /** Contador de falhas consecutivas */
  consecutiveFailures: number;
  /** Mensagem de erro/status */
  statusMessage?: string;
  /** Metadata adicional */
  metadata?: Record<string, any>;
}

// ============================================================
// INTERFACES - SESSÃO
// ============================================================

/**
 * Estado de uma sessão
 */
export interface SessionState {
  /** ID da conta */
  accountId: string;
  /** Site */
  site: string;
  /** Caminho do userDataDir */
  userDataDir: string;
  /** Se está autenticado */
  isAuthenticated: boolean;
  /** Quando a sessão foi criada */
  createdAt: Date;
  /** Última validação bem-sucedida */
  lastValidatedAt?: Date;
  /** Expiração estimada */
  expiresAt?: Date;
}

/**
 * Resultado de operação de autenticação
 */
export interface AuthResult {
  success: boolean;
  /** Tipo de resultado da página */
  pageResult: PageDetectionResult;
  /** Mensagem de erro se falhou */
  error?: string;
  /** Se precisa de intervenção manual */
  needsManualIntervention?: boolean;
  /** Instruções para intervenção */
  manualInstructions?: string;
}

// ============================================================
// INTERFACES - CONTEXTO
// ============================================================

/**
 * Contexto autenticado retornado pelo SessionManager
 */
export interface AuthenticatedContext {
  /** Browser context do Playwright */
  context: BrowserContext;
  /** ID da conta usada */
  accountId: string;
  /** Site */
  site: string;
  /** Estado da sessão */
  sessionState: SessionState;
  /** Função para liberar o contexto */
  release: () => Promise<void>;
  /** Função para marcar como inválido (força renovação) */
  invalidate: (reason: string) => Promise<void>;
}

// ============================================================
// INTERFACES - AUTH FLOW
// ============================================================

/**
 * Configuração de site para autenticação
 */
export interface SiteAuthConfig {
  /** ID do site */
  siteId: string;
  /** Nome para display */
  displayName: string;
  /** Domínio principal */
  domain: string;
  /** URL de login */
  loginUrl: string;
  /** URL para validar se está logado */
  validationUrl: string;
  /** Tipos de MFA suportados */
  supportedMFA: MFAType[];
  /** Timeout de sessão estimado (horas) */
  sessionTimeoutHours: number;
  /** Rate limit (requests por minuto) */
  rateLimit: number;
}

/**
 * Interface para fluxos de autenticação específicos por site
 */
export interface IAuthFlow {
  /** Site ID */
  readonly siteId: string;

  /** Detecta estado atual da página */
  detectPageState(page: Page): Promise<PageDetectionResult>;

  /** Executa login com credenciais */
  performLogin(page: Page, credentials: AccountCredentials): Promise<AuthResult>;

  /** Resolve MFA se possível */
  handleMFA(page: Page, account: AccountConfig): Promise<AuthResult>;

  /** Valida se sessão está ativa */
  validateSession(page: Page): Promise<boolean>;

  /** Verifica se é página de conteúdo válido */
  isContentPage(page: Page): Promise<boolean>;
}

// ============================================================
// INTERFACES - EVENTOS
// ============================================================

/**
 * Eventos de autenticação para logging
 */
export type AuthEventType =
  | 'AUTH_LOAD'
  | 'AUTH_OK'
  | 'AUTH_RENEW_START'
  | 'AUTH_RENEW_OK'
  | 'AUTH_RENEW_FAILED'
  | 'AUTH_MFA_REQUIRED'
  | 'AUTH_MFA_SOLVED'
  | 'AUTH_MFA_FAILED'
  | 'AUTH_BLOCKED'
  | 'AUTH_FAILED'
  | 'AUTH_CHALLENGE'
  | 'AUTH_SITE_CHANGED'
  | 'AUTH_CONTEXT_CREATED'
  | 'AUTH_CONTEXT_RELEASED'
  | 'AUTH_SESSION_EXPIRED';

export interface AuthEvent {
  type: AuthEventType;
  site: string;
  accountId: string;
  timestamp: Date;
  details?: Record<string, any>;
}

// ============================================================
// INTERFACES - CIRCUIT BREAKER
// ============================================================

export interface CircuitBreakerState {
  site: string;
  isOpen: boolean;
  failures: number;
  lastFailure?: Date;
  openedAt?: Date;
  halfOpenAt?: Date;
}

// ============================================================
// CONSTANTES
// ============================================================

/** Diretório base para sessões persistentes */
export const SESSIONS_BASE_DIR = process.env.SESSIONS_DIR || '/var/data/sessions';

/** Fallback para desenvolvimento local */
export const SESSIONS_BASE_DIR_DEV = '/tmp/radarone-sessions';

/** Máximo de falhas antes de abrir circuit breaker */
export const CIRCUIT_BREAKER_THRESHOLD = 5;

/** Tempo para tentar novamente após circuit abrir (ms) */
export const CIRCUIT_BREAKER_TIMEOUT = 5 * 60 * 1000; // 5 minutos

/** Máximo de tentativas de renovação */
export const MAX_RENEW_ATTEMPTS = 3;

/** Timeout para operações de autenticação (ms) */
export const AUTH_TIMEOUT = 60 * 1000; // 1 minuto
