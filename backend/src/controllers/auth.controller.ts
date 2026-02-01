import { ErrorCodes } from '../constants/errorCodes';
import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { validateCpf, encryptCpf } from '../utils/crypto';
import { startTrialForUser } from '../services/billingService';
import { sendWelcomeEmail } from '../services/emailService';
import { logError, logInfo } from '../utils/loggerHelpers';
import { createRefreshToken, rotateRefreshToken, revokeAllUserTokens, revokeRefreshToken } from '../services/refreshTokenService';
import { setRefreshTokenCookie, clearRefreshTokenCookie, getRefreshTokenFromCookie } from '../utils/cookieHelpers';

/**
 * Controller de Autenticação
 *
 * AUTH_STEP States:
 * - NONE: Não autenticado
 * - TWO_FACTOR_REQUIRED: Senha validada, aguardando 2FA
 * - AUTHENTICATED: Totalmente autenticado
 */

// Enum para estados de autenticação
export enum AuthStep {
  NONE = 'NONE',
  TWO_FACTOR_REQUIRED = 'TWO_FACTOR_REQUIRED',
  AUTHENTICATED = 'AUTHENTICATED'
}

/**
 * Sanitiza email para logs (oculta parte do email)
 */
function sanitizeEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.charAt(0)}***@${domain}`;
}

export class AuthController {
  /**
   * Registro de novo usuário
   */
  static async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, name, phone, cpf, telegramUsername } = req.body;

      // Validações básicas
      if (!email || !password || !name) {
        res.status(400).json({ error: 'Campos obrigatórios faltando (email, password, name)' });
        return;
      }

      // Validar CPF se fornecido
      if (cpf) {
        if (!validateCpf(cpf)) {
          res.status(400).json({ error: 'CPF inválido' });
          return;
        }
      }

      // Normalizar email antes de verificar duplicação
      const normalizedEmail = email.trim().toLowerCase();

      // Verifica se usuário já existe (case-insensitive)
      const existingUser = await prisma.user.findFirst({
        where: {
          email: {
            equals: normalizedEmail,
            mode: 'insensitive'
          }
        }
      });

      if (existingUser) {
        res.status(409).json({
          error: 'Você já tem cadastro. Faça login para entrar.',
          errorCode: ErrorCodes.USER_ALREADY_EXISTS
        });
        return;
      }

      // Verifica CPF duplicado se fornecido (usa hash SHA256 para validação robusta)
      // CRÍTICO: usar findFirst porque cpfHash NÃO tem unique constraint no banco (migration comentou)
      if (cpf) {
        const encrypted = encryptCpf(cpf);
        const existingCpf = await prisma.user.findFirst({
          where: { cpfHash: encrypted.hash }
        });

        if (existingCpf) {
          res.status(409).json({
            error: 'Você já tem cadastro. Faça login para entrar.',
            errorCode: ErrorCodes.USER_ALREADY_EXISTS
          });
          return;
        }
      }

      // Hash da senha
      const hashedPassword = await bcrypt.hash(password, 10);

      // Criptografar CPF se fornecido
      let cpfEncrypted: string | undefined;
      let cpfLast4: string | undefined;
      let cpfHash: string | undefined;

      if (cpf) {
        const encrypted = encryptCpf(cpf);
        cpfEncrypted = encrypted.encrypted;
        cpfLast4 = encrypted.last4;
        cpfHash = encrypted.hash;
      }

      // Cria usuário (usando email normalizado)
      // CRÍTICO: envolver em try/catch para tratar P2002 (race condition de email duplicado)
      let user;
      try {
        user = await prisma.user.create({
          data: {
            email: normalizedEmail,
            passwordHash: hashedPassword,
            name,
            phone,
            cpfEncrypted,
            cpfLast4,
            cpfHash
          },
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            cpfLast4: true,
            role: true,
            createdAt: true
          }
        });
      } catch (createError: any) {
        // Tratar erro de unique constraint (P2002) - race condition
        if (createError.code === 'P2002') {
          // Verificar qual campo violou a constraint
          const target = createError.meta?.target;

          if (target && (target.includes('email') || target.includes('users_email_unique_lower'))) {
            logInfo('Race condition detected: email already exists', { email: sanitizeEmail(normalizedEmail) });
            res.status(409).json({
              error: 'Você já tem cadastro. Faça login para entrar.',
              errorCode: ErrorCodes.USER_ALREADY_EXISTS
            });
            return;
          }
        }

        // Se não for P2002 ou for outro campo, re-throw para catch externo
        throw createError;
      }

      // Enviar e-mail de boas-vindas (não bloqueia o registro se falhar)
      sendWelcomeEmail(user.email, user.name).catch((err) => {
        logError('Failed to send welcome email', { err, email: sanitizeEmail(user.email) });
      });

      // Criar assinatura trial automática (plano FREE por padrão)
      try {
        await startTrialForUser(user.id, 'free');
      } catch (trialError) {
        logError('Failed to create automatic trial', { err: trialError, userId: user.id });
        // Continua mesmo se falhar o trial (usuário já foi criado)
      }

      // Se tiver telegramUsername, criar TelegramAccount (precisa de chatId, então só cria placeholder)
      // A vinculação real acontece quando o usuário conecta no bot do Telegram
      if (telegramUsername) {
        try {
          // Por enquanto não criamos TelegramAccount sem chatId
          // O usuário precisará conectar no bot do Telegram para vincular
          logInfo('Telegram username provided, awaiting bot connection', { telegramUsername });
        } catch (telegramError) {
          logError('Failed to process Telegram', { err: telegramError });
        }
      }

      logInfo('User registered successfully', { userId: user.id, email: sanitizeEmail(user.email) });

      res.status(201).json({
        message: 'Usuário criado com sucesso',
        user
      });
    } catch (error) {
      logError('Failed to register user', { err: error, requestId: req.requestId });
      res.status(500).json({ error: 'Erro ao criar usuário' });
    }
  }

  /**
   * Login de usuário
   */
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        logInfo('Login attempt with missing credentials', { hasEmail: !!email, hasPassword: !!password });
        res.status(400).json({ error: 'Email e senha são obrigatórios' });
        return;
      }

      // Normalizar email (trim + toLowerCase) para evitar problemas de case/espaços
      const normalizedEmail = email.trim().toLowerCase();

      logInfo('Login attempt', { email: sanitizeEmail(normalizedEmail), requestId: req.requestId });

      // Busca usuário (case insensitive)
      const user = await prisma.user.findFirst({
        where: {
          email: {
            equals: normalizedEmail,
            mode: 'insensitive'
          }
        },
        include: {
          subscriptions: {
            where: {
              status: 'ACTIVE'
            },
            include: {
              plan: true
            }
          }
        }
      });

      if (!user) {
        logInfo('Login failed: user not found', { email: sanitizeEmail(normalizedEmail) });
        res.status(401).json({ error: 'Credenciais inválidas' });
        return;
      }

      logInfo('User found, checking password', { userId: user.id, email: sanitizeEmail(user.email) });

      // Verifica senha
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        logInfo('Login failed: invalid password', { userId: user.id, email: sanitizeEmail(user.email) });
        res.status(401).json({ error: 'Credenciais inválidas' });
        return;
      }

      logInfo('Password valid, checking user status', { userId: user.id });

      // Verifica se usuário está ativo e não bloqueado
      if (!user.isActive || user.blocked) {
        logInfo('Login blocked: user inactive or blocked', {
          userId: user.id,
          isActive: user.isActive,
          blocked: user.blocked
        });
        res.status(403).json({ error: 'Usuário bloqueado. Entre em contato com o suporte' });
        return;
      }

      // FASE 4.4: Verifica se usuário tem 2FA habilitado
      if (user.twoFactorEnabled) {
        // Gerar token temporário de 2FA (curta duração - 5 minutos)
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          throw new Error('JWT_SECRET não configurado');
        }

        const tempToken = jwt.sign(
          {
            userId: user.id,
            type: 'two_factor_pending',
            twoFactorVerified: false
          },
          secret,
          { expiresIn: '5m' }
        );

        logInfo('Login requires 2FA verification', { userId: user.id });

        // Retorna resposta com authStep claro e token temporário
        res.json({
          authStep: AuthStep.TWO_FACTOR_REQUIRED,
          requiresTwoFactor: true,
          tempToken, // Token temporário para verificação 2FA
          userId: user.id,
          message: 'Digite o código do seu aplicativo autenticador'
        });
        return;
      }

      // Gera access token JWT (curto: 15 minutos)
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw new Error('JWT_SECRET não configurado');
      }

      const accessExpiresIn = (process.env.ACCESS_TOKEN_EXPIRES_IN || '15m') as any;
      const token = jwt.sign(
        { userId: user.id },
        secret,
        { expiresIn: accessExpiresIn } as SignOptions
      );

      // Gera refresh token (httpOnly cookie, 7 dias)
      const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '') as string;
      const { token: refreshToken, expiresAt } = await createRefreshToken(user.id, {
        userAgent: req.get('user-agent'),
        ipAddress: typeof clientIp === 'string' ? clientIp.split(',')[0].trim() : clientIp,
      });
      setRefreshTokenCookie(res, refreshToken, expiresAt);

      // Remove senha do objeto
      const { passwordHash: _, ...userWithoutPassword } = user;

      logInfo('User logged in successfully', { userId: user.id, email: sanitizeEmail(user.email) });

      res.json({
        authStep: AuthStep.AUTHENTICATED,
        message: 'Login realizado com sucesso',
        token,
        user: userWithoutPassword
      });
    } catch (error) {
      logError('Failed to login', { err: error, requestId: req.requestId });
      res.status(500).json({ error: 'Erro ao fazer login' });
    }
  }

  /**
   * Retorna dados do usuário autenticado
   */
  static async me(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;

      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          isActive: true,
          blocked: true,
          createdAt: true,
          subscriptions: {
            where: {
              status: { in: ['ACTIVE', 'TRIAL'] }
            },
            include: {
              plan: true
            }
          }
        }
      });

      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      // CRITICAL: Prevent caching of auth/session endpoints
      // Without these headers, browsers may return 304 Not Modified
      // causing stale session data to appear in the UI
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      res.json({ user });
    } catch (error) {
      logError('Failed to fetch user data', { err: error, requestId: req.requestId });
      res.status(500).json({ error: 'Erro ao buscar dados' });
    }
  }

  /**
   * Solicita reset de senha
   * POST /api/auth/forgot-password
   */
  static async requestPasswordReset(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;

      if (!email) {
        res.status(400).json({ error: 'Email é obrigatório' });
        return;
      }

      // Buscar usuário pelo email (case-insensitive)
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() }
      });

      // Comportamento condicional baseado em ENV (DEV vs PROD)
      // Em DEV: revelar se email não existe (útil para UX/testes)
      // Em PROD: sempre retornar mensagem genérica (segurança contra enumeração)
      const revealEmailNotFound = process.env.REVEAL_EMAIL_NOT_FOUND === 'true';
      const genericMessage = 'Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha.';

      // Se o usuário não existir
      if (!user) {
        logInfo('Password reset attempt for unregistered email', { email: sanitizeEmail(email) });

        if (revealEmailNotFound) {
          // DEV: retornar erro específico
          res.status(404).json({
            error: 'E-mail não cadastrado',
            errorCode: ErrorCodes.EMAIL_NOT_FOUND
          });
          return;
        } else {
          // PROD: retornar mensagem genérica (não revelar se existe)
          res.json({ message: genericMessage });
          return;
        }
      }

      // Verificar se usuário está bloqueado
      if (user.blocked) {
        logInfo('Password reset attempt for blocked user', { email: sanitizeEmail(email) });
        res.json({ message: genericMessage });
        return;
      }

      // Gerar token JWT para reset de senha
      // IMPORTANTE: Em produção, PASSWORD_RESET_SECRET é OBRIGATÓRIA (não usa fallback)
      const isProduction = process.env.NODE_ENV === 'production';
      const resetSecret = process.env.PASSWORD_RESET_SECRET;
      const jwtSecret = process.env.JWT_SECRET;

      if (!resetSecret && isProduction) {
        // Em produção, exigir PASSWORD_RESET_SECRET separada
        throw new Error('PASSWORD_RESET_SECRET não configurada (obrigatória em produção)');
      }

      const secret = resetSecret || jwtSecret;
      if (!secret) {
        throw new Error('JWT_SECRET ou PASSWORD_RESET_SECRET devem estar configurados');
      }

      const resetToken = jwt.sign(
        {
          sub: user.id,  // userId no payload
          type: 'password_reset'  // tipo do token para validação
        },
        secret,
        { expiresIn: '30m' }  // 30 minutos
      );

      // Enviar email com link de reset (não bloqueia a resposta se falhar)
      const emailService = await import('../services/emailService');
      emailService.sendPasswordResetEmail(user.email, resetToken).catch((err) => {
        logError('Failed to send password reset email', { err, email: sanitizeEmail(user.email) });
      });

      logInfo('Password reset email sent', { email: sanitizeEmail(user.email) });

      // Retorna sempre a mesma mensagem genérica
      res.json({ message: genericMessage });
    } catch (error) {
      logError('Failed to request password reset', { err: error, requestId: req.requestId });
      res.status(500).json({ error: 'Erro ao processar solicitação' });
    }
  }

  /**
   * Redefine a senha usando o token
   * POST /api/auth/reset-password
   */
  static async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const { token, password } = req.body;

      // Validações básicas
      if (!token || !password) {
        res.status(400).json({ error: 'Token e nova senha são obrigatórios' });
        return;
      }

      // Validar senha (mínimo 8 caracteres)
      if (password.length < 8) {
        res.status(400).json({ error: 'A senha deve ter no mínimo 8 caracteres' });
        return;
      }

      // Verificar e decodificar o token JWT
      // IMPORTANTE: Deve usar a MESMA secret usada para gerar o token
      const isProduction = process.env.NODE_ENV === 'production';
      const resetSecret = process.env.PASSWORD_RESET_SECRET;
      const jwtSecret = process.env.JWT_SECRET;

      if (!resetSecret && isProduction) {
        throw new Error('PASSWORD_RESET_SECRET não configurada (obrigatória em produção)');
      }

      const secret = resetSecret || jwtSecret;
      if (!secret) {
        throw new Error('JWT_SECRET ou PASSWORD_RESET_SECRET devem estar configurados');
      }

      let decoded: any;
      try {
        decoded = jwt.verify(token, secret);
      } catch (jwtError: any) {
        if (jwtError.name === 'TokenExpiredError') {
          res.status(401).json({ error: 'Link de recuperação expirado. Solicite um novo link.' });
          return;
        }
        res.status(401).json({ error: 'Link de recuperação inválido' });
        return;
      }

      // Validar que é um token de reset de senha
      if (decoded.type !== 'password_reset') {
        res.status(401).json({ error: 'Token inválido para esta operação' });
        return;
      }

      const userId = decoded.sub;
      if (!userId) {
        res.status(401).json({ error: 'Token inválido' });
        return;
      }

      // Buscar usuário
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      // Verificar se usuário está bloqueado
      if (user.blocked) {
        res.status(403).json({ error: 'Usuário bloqueado. Entre em contato com o suporte' });
        return;
      }

      // Gerar hash da nova senha (mesmo método usado no registro)
      const newPasswordHash = await bcrypt.hash(password, 10);

      // Atualizar senha no banco
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash }
      });

      logInfo('Password reset successful', { userId, email: sanitizeEmail(user.email) });

      // Enviar email de confirmação (não bloqueia a resposta se falhar)
      const emailService = await import('../services/emailService');
      emailService.sendPasswordChangedEmail(user.email).catch((err) => {
        logError('Failed to send password changed confirmation email', { err, email: sanitizeEmail(user.email) });
      });

      res.json({
        message: 'Senha redefinida com sucesso. Você já pode fazer login com a nova senha.'
      });
    } catch (error) {
      logError('Failed to reset password', { err: error, requestId: req.requestId });
      res.status(500).json({ error: 'Erro ao redefinir senha' });
    }
  }

  // ============================================
  // REFRESH TOKEN & LOGOUT
  // ============================================

  /**
   * Rotaciona refresh token e emite novo access token
   * POST /api/auth/refresh
   * Cookie: radarone_refresh (httpOnly)
   */
  static async refresh(req: Request, res: Response): Promise<void> {
    try {
      const oldRefreshToken = getRefreshTokenFromCookie(req);

      if (!oldRefreshToken) {
        res.status(401).json({ errorCode: 'NO_REFRESH_TOKEN', message: 'Sessão expirada. Faça login novamente.' });
        return;
      }

      const result = await rotateRefreshToken(oldRefreshToken, {
        userAgent: req.get('user-agent'),
        ipAddress: ((req.headers['x-forwarded-for'] || req.socket.remoteAddress || '') as string).split(',')[0].trim(),
      });

      if (!result) {
        clearRefreshTokenCookie(res);
        res.status(401).json({ errorCode: 'INVALID_REFRESH_TOKEN', message: 'Sessão inválida. Faça login novamente.' });
        return;
      }

      // Buscar user para verificar status
      const user = await prisma.user.findUnique({
        where: { id: result.userId },
        select: { id: true, blocked: true, isActive: true, twoFactorEnabled: true },
      });

      if (!user || user.blocked || !user.isActive) {
        clearRefreshTokenCookie(res);
        await revokeAllUserTokens(result.userId);
        res.status(401).json({ errorCode: 'USER_BLOCKED', message: 'Conta bloqueada' });
        return;
      }

      // Novo access token
      const secret = process.env.JWT_SECRET!;
      const accessExpiresIn = (process.env.ACCESS_TOKEN_EXPIRES_IN || '15m') as any;
      const accessToken = jwt.sign(
        { userId: user.id, twoFactorVerified: user.twoFactorEnabled ? true : undefined },
        secret,
        { expiresIn: accessExpiresIn } as SignOptions
      );

      // Novo refresh cookie
      setRefreshTokenCookie(res, result.token, result.expiresAt);

      res.json({
        token: accessToken,
        expiresIn: accessExpiresIn,
      });
    } catch (error) {
      logError('Failed to refresh token', { err: error, requestId: req.requestId });
      res.status(500).json({ error: 'Erro ao renovar sessão' });
    }
  }

  /**
   * Logout — revoga refresh token e limpa cookie
   * POST /api/auth/logout
   */
  static async logout(req: Request, res: Response): Promise<void> {
    try {
      const refreshToken = getRefreshTokenFromCookie(req);

      if (refreshToken) {
        await revokeRefreshToken(refreshToken);
      }

      // Se logado, revogar todos os tokens (logout completo)
      if (req.userId) {
        await revokeAllUserTokens(req.userId);
      }

      clearRefreshTokenCookie(res);

      res.json({ message: 'Logout realizado com sucesso' });
    } catch (error) {
      logError('Failed to logout', { err: error, requestId: req.requestId });
      // Mesmo com erro, limpar cookie
      clearRefreshTokenCookie(res);
      res.json({ message: 'Logout realizado' });
    }
  }

  // ============================================
  // FASE 4.4 - Two-Factor Authentication (2FA)
  // ============================================

  /**
   * Inicia configuração de 2FA
   * GET /api/auth/2fa/setup
   * Requer autenticação
   */
  static async setup2FA(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, twoFactorEnabled: true }
      });

      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      if (user.twoFactorEnabled) {
        res.status(400).json({ error: '2FA já está habilitado' });
        return;
      }

      // Gerar secret, QR code e backup codes
      const twoFactorService = await import('../services/twoFactorService');
      const setup = await twoFactorService.setupTwoFactor(userId, user.email);

      logInfo('2FA setup initiated', { userId });

      res.json({
        secret: setup.secret,
        qrCode: setup.qrCodeDataUrl,
        backupCodes: setup.backupCodes,
        message: 'Escaneie o QR Code com seu aplicativo autenticador'
      });
    } catch (error) {
      logError('Failed to setup 2FA', { err: error, requestId: req.requestId });
      res.status(500).json({ error: 'Erro ao configurar 2FA' });
    }
  }

  /**
   * Confirma e habilita 2FA
   * POST /api/auth/2fa/enable
   * Body: { code, secret, backupCodes }
   */
  static async enable2FA(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const { code, secret, backupCodes } = req.body;

      if (!code || !secret || !backupCodes) {
        res.status(400).json({ error: 'Código, secret e backup codes são obrigatórios' });
        return;
      }

      // Verificar código fornecido
      const twoFactorService = await import('../services/twoFactorService');
      const isValid = twoFactorService.verifyTOTP(secret, code);

      if (!isValid) {
        res.status(400).json({ error: 'Código inválido. Tente novamente' });
        return;
      }

      // Salvar 2FA no banco
      await twoFactorService.enableTwoFactor(userId, secret, backupCodes);

      logInfo('2FA enabled successfully', { userId });

      res.json({
        message: '2FA habilitado com sucesso',
        enabled: true
      });
    } catch (error) {
      logError('Failed to enable 2FA', { err: error, requestId: req.requestId });
      res.status(500).json({ error: 'Erro ao habilitar 2FA' });
    }
  }

  /**
   * Desabilita 2FA
   * POST /api/auth/2fa/disable
   * Body: { password }
   */
  static async disable2FA(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const { password } = req.body;

      if (!password) {
        res.status(400).json({ error: 'Senha é obrigatória para desativar 2FA' });
        return;
      }

      // Buscar usuário
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true, twoFactorEnabled: true }
      });

      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      if (!user.twoFactorEnabled) {
        res.status(400).json({ error: '2FA não está habilitado' });
        return;
      }

      // Verificar senha
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        res.status(401).json({ error: 'Senha incorreta' });
        return;
      }

      // Desabilitar 2FA
      const twoFactorService = await import('../services/twoFactorService');
      await twoFactorService.disableTwoFactor(userId);

      logInfo('2FA disabled successfully', { userId });

      res.json({
        message: '2FA desabilitado com sucesso',
        enabled: false
      });
    } catch (error) {
      logError('Failed to disable 2FA', { err: error, requestId: req.requestId });
      res.status(500).json({ error: 'Erro ao desabilitar 2FA' });
    }
  }

  /**
   * Verifica código 2FA durante login
   * POST /api/auth/2fa/verify
   * Body: { userId, code }
   */
  static async verify2FA(req: Request, res: Response): Promise<void> {
    try {
      const { userId: bodyUserId, code } = req.body;

      if (!bodyUserId || !code) {
        res.status(400).json({ errorCode: 'VALIDATION_ERROR', message: 'userId e code são obrigatórios' });
        return;
      }

      // Derivar userId do tempToken (fonte confiável) quando disponível
      let userId = bodyUserId;
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const tempToken = authHeader.slice(7);
          const jwtSecret = process.env.JWT_SECRET;
          if (jwtSecret) {
            const decoded = jwt.verify(tempToken, jwtSecret) as any;
            if (decoded.type === 'two_factor_pending' && decoded.userId) {
              userId = decoded.userId;
            }
          }
        } catch {
          // tempToken expirado ou inválido — continuar com bodyUserId
        }
      }

      // Verificar código
      const twoFactorService = await import('../services/twoFactorService');
      const result = await twoFactorService.verifyTwoFactorCode(userId, code);

      if (!result.valid) {
        res.status(401).json({ errorCode: 'INVALID_2FA_CODE', message: 'Código inválido' });
        return;
      }

      // Buscar usuário completo
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          subscriptions: {
            where: { status: 'ACTIVE' },
            include: { plan: true }
          }
        }
      });

      if (!user) {
        res.status(404).json({ errorCode: 'USER_NOT_FOUND', message: 'Usuário não encontrado' });
        return;
      }

      // Atualizar lastLoginAt e lastLoginIp
      const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
      await prisma.user.update({
        where: { id: userId },
        data: {
          lastLoginAt: new Date(),
          lastLoginIp: typeof ipAddress === 'string' ? ipAddress : ipAddress[0]
        }
      });

      // Gerar access token JWT (curto: 15 minutos, admins: 15 minutos também)
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw new Error('JWT_SECRET não configurado');
      }

      const accessExpiresIn = (process.env.ACCESS_TOKEN_EXPIRES_IN || '15m') as any;
      const token = jwt.sign(
        { userId: user.id, twoFactorVerified: true },
        secret,
        { expiresIn: accessExpiresIn } as SignOptions
      );

      // Gera refresh token (httpOnly cookie)
      const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '') as string;
      const { token: refreshToken, expiresAt } = await createRefreshToken(user.id, {
        userAgent: req.get('user-agent'),
        ipAddress: typeof clientIp === 'string' ? clientIp.split(',')[0].trim() : clientIp,
      });
      setRefreshTokenCookie(res, refreshToken, expiresAt);

      // Remove senha do objeto
      const { passwordHash: _, ...userWithoutPassword } = user;

      logInfo('2FA verification successful, user logged in', {
        userId: user.id,
        isBackupCode: result.isBackupCode
      });

      if (result.isBackupCode) {
        res.json({
          authStep: AuthStep.AUTHENTICATED,
          message: 'Login realizado com código de backup. Gere novos códigos em breve!',
          token,
          user: userWithoutPassword,
          warningBackupCode: true
        });
      } else {
        res.json({
          authStep: AuthStep.AUTHENTICATED,
          message: 'Login realizado com sucesso',
          token,
          user: userWithoutPassword
        });
      }
    } catch (error) {
      logError('Failed to verify 2FA', { err: error, requestId: req.requestId });
      res.status(500).json({ errorCode: 'INTERNAL_ERROR', message: 'Erro ao verificar código 2FA' });
    }
  }

  /**
   * Regenera códigos de backup
   * POST /api/auth/2fa/backup-codes
   * Body: { password }
   */
  static async regenerateBackupCodes(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const { password } = req.body;

      if (!password) {
        res.status(400).json({ error: 'Senha é obrigatória' });
        return;
      }

      // Buscar usuário
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true, twoFactorEnabled: true }
      });

      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      if (!user.twoFactorEnabled) {
        res.status(400).json({ error: '2FA não está habilitado' });
        return;
      }

      // Verificar senha
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        res.status(401).json({ error: 'Senha incorreta' });
        return;
      }

      // Regenerar códigos
      const twoFactorService = await import('../services/twoFactorService');
      const newBackupCodes = await twoFactorService.regenerateBackupCodes(userId);

      logInfo('Backup codes regenerated', { userId });

      res.json({
        message: 'Novos códigos de backup gerados',
        backupCodes: newBackupCodes
      });
    } catch (error) {
      logError('Failed to regenerate backup codes', { err: error, requestId: req.requestId });
      res.status(500).json({ error: 'Erro ao regenerar códigos de backup' });
    }
  }

  /**
   * Retorna status de 2FA do usuário
   * GET /api/auth/2fa/status
   */
  static async get2FAStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          twoFactorEnabled: true,
          twoFactorBackupCodes: true
        }
      });

      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      res.json({
        enabled: user.twoFactorEnabled,
        backupCodesRemaining: user.twoFactorBackupCodes.length
      });
    } catch (error) {
      logError('Failed to get 2FA status', { err: error, requestId: req.requestId });
      res.status(500).json({ error: 'Erro ao buscar status de 2FA' });
    }
  }

  // ============================================
  // FASE 4.4 - Revalidação de Senha para Ações Críticas
  // ============================================

  /**
   * Revalida senha do usuário para ações críticas
   * POST /api/auth/revalidate-password
   * Body: { password }
   */
  static async revalidatePassword(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const { password } = req.body;

      if (!password) {
        res.status(400).json({ error: 'Senha é obrigatória' });
        return;
      }

      // Buscar usuário
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true }
      });

      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }

      // Verificar senha
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        res.status(401).json({ error: 'Senha incorreta' });
        return;
      }

      // Atualizar timestamp de última validação
      await prisma.user.update({
        where: { id: userId },
        data: {
          lastPasswordValidated: new Date()
        }
      });

      logInfo('Password revalidated successfully', { userId });

      res.json({
        message: 'Senha validada com sucesso',
        validated: true
      });
    } catch (error) {
      logError('Failed to revalidate password', { err: error, requestId: req.requestId });
      res.status(500).json({ error: 'Erro ao validar senha' });
    }
  }

  // ============================================
  // ENDPOINT /auth/status - Estado de Autenticação
  // ============================================

  /**
   * Retorna o estado completo de autenticação do usuário
   * GET /api/auth/status
   *
   * Resposta:
   * - authStep: NONE | TWO_FACTOR_REQUIRED | AUTHENTICATED
   * - isAuthenticated: boolean
   * - twoFactorEnabled: boolean
   * - twoFactorVerified: boolean (se 2FA foi completado nesta sessão)
   * - user?: dados do usuário (se autenticado)
   */
  static async getAuthStatus(req: Request, res: Response): Promise<void> {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      // Sem token = não autenticado
      if (!token) {
        res.json({
          authStep: AuthStep.NONE,
          isAuthenticated: false,
          twoFactorEnabled: false,
          twoFactorVerified: false,
          requiredStep: null
        });
        return;
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw new Error('JWT_SECRET não configurado');
      }

      let decoded: any;
      try {
        decoded = jwt.verify(token, secret);
      } catch (jwtError: any) {
        // Token expirado ou inválido
        res.json({
          authStep: AuthStep.NONE,
          isAuthenticated: false,
          twoFactorEnabled: false,
          twoFactorVerified: false,
          requiredStep: null,
          tokenError: jwtError.name === 'TokenExpiredError' ? 'expired' : 'invalid'
        });
        return;
      }

      const userId = decoded.userId;
      if (!userId) {
        res.json({
          authStep: AuthStep.NONE,
          isAuthenticated: false,
          twoFactorEnabled: false,
          twoFactorVerified: false,
          requiredStep: null
        });
        return;
      }

      // Buscar usuário
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          blocked: true,
          twoFactorEnabled: true,
          subscriptions: {
            where: { status: { in: ['ACTIVE', 'TRIAL'] } },
            include: { plan: true }
          }
        }
      });

      if (!user) {
        res.json({
          authStep: AuthStep.NONE,
          isAuthenticated: false,
          twoFactorEnabled: false,
          twoFactorVerified: false,
          requiredStep: null
        });
        return;
      }

      // Verificar se usuário está bloqueado
      if (user.blocked || !user.isActive) {
        res.json({
          authStep: AuthStep.NONE,
          isAuthenticated: false,
          twoFactorEnabled: user.twoFactorEnabled,
          twoFactorVerified: false,
          requiredStep: null,
          blocked: true
        });
        return;
      }

      // Verificar se é token temporário de 2FA pendente
      if (decoded.type === 'two_factor_pending' && !decoded.twoFactorVerified) {
        res.json({
          authStep: AuthStep.TWO_FACTOR_REQUIRED,
          isAuthenticated: false,
          twoFactorEnabled: true,
          twoFactorVerified: false,
          requiredStep: 'TWO_FACTOR_VERIFICATION',
          userId: user.id
        });
        return;
      }

      // Se 2FA está habilitado, verificar se foi verificado nesta sessão
      const twoFactorVerified = decoded.twoFactorVerified === true;

      if (user.twoFactorEnabled && !twoFactorVerified) {
        res.json({
          authStep: AuthStep.TWO_FACTOR_REQUIRED,
          isAuthenticated: false,
          twoFactorEnabled: true,
          twoFactorVerified: false,
          requiredStep: 'TWO_FACTOR_VERIFICATION',
          userId: user.id
        });
        return;
      }

      // Totalmente autenticado
      const { twoFactorEnabled, ...userWithoutSensitive } = user;

      // Prevent caching
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      res.json({
        authStep: AuthStep.AUTHENTICATED,
        isAuthenticated: true,
        twoFactorEnabled: user.twoFactorEnabled,
        twoFactorVerified: twoFactorVerified || !user.twoFactorEnabled,
        requiredStep: null,
        user: userWithoutSensitive
      });
    } catch (error) {
      logError('Failed to get auth status', { err: error, requestId: req.requestId });
      res.status(500).json({ error: 'Erro ao verificar status de autenticação' });
    }
  }
}
