import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import { prisma } from '../server';
import { validateCpf, encryptCpf } from '../utils/crypto';
import { startTrialForUser } from '../services/billingService';
import { sendWelcomeEmail } from '../services/emailService';
import logger from '../logger';

/**
 * Controller de Autenticação
 * TODO: Implementar validações completas
 */

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

      // Verifica se usuário já existe (email ou CPF)
      const existingUser = await prisma.user.findUnique({
        where: { email }
      });

      if (existingUser) {
        res.status(409).json({
          error: 'Você já tem cadastro. Faça login para entrar.',
          errorCode: 'USER_ALREADY_EXISTS'
        });
        return;
      }

      // Verifica CPF duplicado se fornecido
      if (cpf) {
        const encrypted = encryptCpf(cpf);
        const existingCpf = await prisma.user.findFirst({
          where: { cpfLast4: encrypted.last4 }
        });

        if (existingCpf) {
          res.status(409).json({
            error: 'Você já tem cadastro. Faça login para entrar.',
            errorCode: 'USER_ALREADY_EXISTS'
          });
          return;
        }
      }

      // Hash da senha
      const hashedPassword = await bcrypt.hash(password, 10);

      // Criptografar CPF se fornecido
      let cpfEncrypted: string | undefined;
      let cpfLast4: string | undefined;

      if (cpf) {
        const encrypted = encryptCpf(cpf);
        cpfEncrypted = encrypted.encrypted;
        cpfLast4 = encrypted.last4;
      }

      // Cria usuário
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: hashedPassword,
          name,
          phone,
          cpfEncrypted,
          cpfLast4
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

      // Enviar e-mail de boas-vindas (não bloqueia o registro se falhar)
      sendWelcomeEmail(user.email, user.name).catch((err) => {
        logger.error({ err, email: sanitizeEmail(user.email) }, 'Failed to send welcome email');
      });

      // Criar assinatura trial automática (plano FREE por padrão)
      try {
        await startTrialForUser(user.id, 'free');
      } catch (trialError) {
        logger.error({ err: trialError, userId: user.id }, 'Failed to create automatic trial');
        // Continua mesmo se falhar o trial (usuário já foi criado)
      }

      // Se tiver telegramUsername, criar TelegramAccount (precisa de chatId, então só cria placeholder)
      // A vinculação real acontece quando o usuário conecta no bot do Telegram
      if (telegramUsername) {
        try {
          // Por enquanto não criamos TelegramAccount sem chatId
          // O usuário precisará conectar no bot do Telegram para vincular
          logger.info({ telegramUsername }, 'Telegram username provided, awaiting bot connection');
        } catch (telegramError) {
          logger.error({ err: telegramError }, 'Failed to process Telegram');
        }
      }

      logger.info({ userId: user.id, email: sanitizeEmail(user.email) }, 'User registered successfully');

      res.status(201).json({
        message: 'Usuário criado com sucesso',
        user
      });
    } catch (error) {
      logger.error({ err: error, requestId: req.requestId }, 'Failed to register user');
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
        res.status(400).json({ error: 'Email e senha são obrigatórios' });
        return;
      }

      // Busca usuário
      const user = await prisma.user.findUnique({
        where: { email },
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
        res.status(401).json({ error: 'Credenciais inválidas' });
        return;
      }

      // Verifica senha
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        res.status(401).json({ error: 'Credenciais inválidas' });
        return;
      }

      // Verifica se usuário está ativo e não bloqueado
      if (!user.isActive || user.blocked) {
        res.status(403).json({ error: 'Usuário bloqueado. Entre em contato com o suporte' });
        return;
      }

      // Gera token JWT
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw new Error('JWT_SECRET não configurado');
      }

      const expiresIn = (process.env.JWT_EXPIRES_IN || '7d') as any;
      const options: SignOptions = {
        expiresIn
      };

      const token = jwt.sign(
        { userId: user.id },
        secret,
        options
      );

      // Remove senha do objeto
      const { passwordHash: _, ...userWithoutPassword } = user;

      logger.info({ userId: user.id, email: sanitizeEmail(user.email) }, 'User logged in successfully');

      res.json({
        message: 'Login realizado com sucesso',
        token,
        user: userWithoutPassword
      });
    } catch (error) {
      logger.error({ err: error, requestId: req.requestId }, 'Failed to login');
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

      res.json({ user });
    } catch (error) {
      console.error('Erro ao buscar dados do usuário:', error);
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

      // SEMPRE retornar 200 para não revelar se o email existe ou não (segurança)
      // Mensagem genérica independente de o usuário existir
      const genericMessage = 'Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha.';

      // Se o usuário não existir, retorna sucesso mas não envia email
      if (!user) {
        console.log(`[AUTH] Tentativa de reset para email não cadastrado: ${sanitizeEmail(email)}`);
        res.json({ message: genericMessage });
        return;
      }

      // Verificar se usuário está bloqueado
      if (user.blocked) {
        console.log(`[AUTH] Tentativa de reset para usuário bloqueado: ${sanitizeEmail(email)}`);
        res.json({ message: genericMessage });
        return;
      }

      // Gerar token JWT para reset de senha
      // Usa PASSWORD_RESET_SECRET se existir, caso contrário usa JWT_SECRET
      // IMPORTANTE: Em produção, é recomendado ter uma secret separada
      const secret = process.env.PASSWORD_RESET_SECRET || process.env.JWT_SECRET;
      if (!secret) {
        throw new Error('JWT_SECRET não configurado');
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
      emailService.sendPasswordResetEmail(user.email, user.name, resetToken).catch((err) => {
        console.error('[AUTH] Erro ao enviar e-mail de reset de senha:', err);
      });

      console.log(`[AUTH] Email de reset enviado para: ${sanitizeEmail(user.email)}`);

      // Retorna sempre a mesma mensagem genérica
      res.json({ message: genericMessage });
    } catch (error) {
      console.error('Erro ao solicitar reset de senha:', error);
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
      const secret = process.env.PASSWORD_RESET_SECRET || process.env.JWT_SECRET;
      if (!secret) {
        throw new Error('JWT_SECRET não configurado');
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

      console.log(`[AUTH] Senha redefinida com sucesso para usuário: ${sanitizeEmail(user.email)}`);

      // Enviar email de confirmação (não bloqueia a resposta se falhar)
      const emailService = await import('../services/emailService');
      emailService.sendPasswordChangedEmail(user.email, user.name).catch((err) => {
        console.error('[AUTH] Erro ao enviar e-mail de confirmação de senha alterada:', err);
      });

      res.json({
        message: 'Senha redefinida com sucesso. Você já pode fazer login com a nova senha.'
      });
    } catch (error) {
      console.error('Erro ao redefinir senha:', error);
      res.status(500).json({ error: 'Erro ao redefinir senha' });
    }
  }
}
