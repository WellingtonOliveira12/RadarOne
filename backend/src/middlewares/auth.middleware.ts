import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../server';
import { logWithUser } from '../utils/loggerHelpers';
import { AppError } from '../errors/AppError';

// Estende o tipo Request para incluir userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

interface JwtPayload {
  userId: string;
}

/**
 * Middleware de autenticação JWT
 * Verifica se o token é válido e adiciona userId ao request
 */
export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      throw AppError.invalidToken('Token de autenticação não fornecido');
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET não configurado');
    }

    const decoded = jwt.verify(token, secret) as JwtPayload;
    req.userId = decoded.userId;
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      next(AppError.invalidToken('Token de autenticação inválido ou expirado'));
    }
  }
};

/**
 * Middleware para verificar se o usuário é admin
 * Deve ser usado APÓS authenticateToken
 */
export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }

    // TODO: Verificar role do usuário no banco
    // const user = await prisma.user.findUnique({
    //   where: { id: req.userId },
    //   select: { role: true }
    // });
    //
    // if (user?.role !== 'ADMIN') {
    //   res.status(403).json({ error: 'Acesso negado. Requer privilégios de admin' });
    //   return;
    // }

    next();
  } catch (error) {
    res.status(500).json({ error: 'Erro ao verificar permissões' });
  }
};

/**
 * Middleware para verificar se o trial FREE expirou
 * Bloqueia acesso aos recursos se:
 * 1. Usuário tem plano FREE (trial)
 * 2. Trial já expirou (trialEndsAt < now)
 *
 * Deve ser usado APÓS authenticateToken
 */
export const checkTrialExpired = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      throw AppError.unauthorized('Usuário não autenticado');
    }

    // Buscar assinatura ativa ou trial do usuário
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: req.userId,
        status: { in: ['ACTIVE', 'TRIAL'] }
      },
      include: {
        plan: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Se não tem assinatura, bloquear acesso
    if (!subscription) {
      throw AppError.subscriptionRequired('Você precisa assinar um plano para acessar este recurso');
    }

    // Se é trial e já expirou, bloquear acesso (exceto se for vitalício)
    if (subscription.status === 'TRIAL' && subscription.trialEndsAt && !subscription.isLifetime) {
      const now = new Date();
      if (subscription.trialEndsAt < now) {
        // Calcular quantos dias expirou
        const daysExpired = Math.ceil((now.getTime() - subscription.trialEndsAt.getTime()) / (1000 * 60 * 60 * 24));

        // Logar evento TRIAL_EXPIRED para analytics/monitoramento
        logWithUser(req.userId, 'warn', 'Trial expirado - acesso bloqueado', {
          eventType: 'TRIAL_EXPIRED',
          planName: subscription.plan.name,
          planSlug: subscription.plan.slug,
          trialEndedAt: subscription.trialEndsAt.toISOString(),
          daysExpired,
          endpoint: `${req.method} ${req.path}`,
          userAgent: req.headers['user-agent'],
        });

        throw AppError.trialExpired('Seu período de teste gratuito expirou. Assine um plano para continuar');
      }
    }

    // Se passou por todas as verificações, permitir acesso
    next();
  } catch (error) {
    next(error);
  }
};

// ============================================
// FASE 4.4 - Segurança Avançada Admin
// ============================================

/**
 * Middleware para exigir revalidação recente de senha
 * Usado em ações críticas de admin (bloquear usuários, cancelar assinaturas, etc)
 * Deve ser usado APÓS authenticateToken
 */
export const requireRecentPasswordValidation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { lastPasswordValidated: true }
    });

    if (!user) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }

    // Verificar se senha foi validada nos últimos 15 minutos
    const VALIDATION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutos
    const now = new Date();

    if (!user.lastPasswordValidated) {
      res.status(403).json({
        error: 'Ação crítica requer revalidação de senha',
        requiresPasswordRevalidation: true
      });
      return;
    }

    const timeSinceValidation = now.getTime() - user.lastPasswordValidated.getTime();

    if (timeSinceValidation > VALIDATION_TIMEOUT_MS) {
      res.status(403).json({
        error: 'Sua sessão de segurança expirou. Revalide sua senha para continuar',
        requiresPasswordRevalidation: true
      });
      return;
    }

    // Senha validada recentemente, permitir acesso
    next();
  } catch (error) {
    res.status(500).json({ error: 'Erro ao verificar revalidação de senha' });
  }
};

/**
 * Middleware para verificar IP whitelist (foundation FASE 4.4)
 * Verifica se o IP do usuário está na whitelist (se configurada)
 * Deve ser usado APÓS authenticateToken
 */
export const checkIpWhitelist = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { allowedIps: true, role: true }
    });

    if (!user) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }

    // Se não há whitelist configurada, permitir acesso
    if (!user.allowedIps || user.allowedIps.length === 0) {
      next();
      return;
    }

    // Obter IP do request
    const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '') as string;
    const ip = typeof clientIp === 'string' ? clientIp.split(',')[0].trim() : '';

    // Verificar se IP está na whitelist
    if (!user.allowedIps.includes(ip)) {
      logWithUser(req.userId, 'warn', 'IP whitelist violation', {
        clientIp: ip,
        allowedIps: user.allowedIps,
        endpoint: `${req.method} ${req.path}`,
      });

      res.status(403).json({
        error: 'Acesso negado. Seu IP não está autorizado',
        clientIp: ip
      });
      return;
    }

    // IP na whitelist, permitir acesso
    next();
  } catch (error) {
    res.status(500).json({ error: 'Erro ao verificar IP whitelist' });
  }
};
