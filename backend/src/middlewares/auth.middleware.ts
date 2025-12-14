import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../server';

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
      res.status(401).json({ error: 'Token não fornecido' });
      return;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET não configurado');
    }

    const decoded = jwt.verify(token, secret) as JwtPayload;
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(403).json({ error: 'Token inválido ou expirado' });
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
      res.status(401).json({ error: 'Não autenticado' });
      return;
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
      res.status(403).json({
        error: 'Você precisa assinar um plano para acessar este recurso.',
        errorCode: 'NO_SUBSCRIPTION'
      });
      return;
    }

    // Se é trial e já expirou, bloquear acesso
    if (subscription.status === 'TRIAL' && subscription.trialEndsAt) {
      const now = new Date();
      if (subscription.trialEndsAt < now) {
        res.status(403).json({
          error: 'Seu período de teste gratuito expirou. Assine um plano para continuar.',
          errorCode: 'TRIAL_EXPIRED'
        });
        return;
      }
    }

    // Se passou por todas as verificações, permitir acesso
    next();
  } catch (error) {
    console.error('Erro ao verificar trial:', error);
    res.status(500).json({ error: 'Erro ao verificar acesso' });
  }
};
