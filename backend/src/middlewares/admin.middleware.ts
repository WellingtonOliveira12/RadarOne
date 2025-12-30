import { Request, Response, NextFunction } from 'express';
import { prisma } from '../server';
import { AppError } from '../errors/AppError';

/**
 * Middleware para verificar se o usuário autenticado é ADMIN
 * Deve ser usado após o middleware authenticateToken
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Verificar se o usuário está autenticado (req.userId setado pelo authenticateToken)
    if (!req.userId) {
      throw AppError.unauthorized('Usuário não autenticado');
    }

    // Buscar usuário no banco
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        role: true,
        blocked: true
      }
    });

    // Verificar se usuário existe
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Usuário não encontrado');
    }

    // Verificar se usuário não está bloqueado
    if (user.blocked) {
      throw AppError.forbidden('Usuário bloqueado. Entre em contato com o suporte');
    }

    // Verificar se usuário tem role de ADMIN
    if (user.role !== 'ADMIN') {
      throw AppError.forbidden('Acesso negado. Apenas administradores');
    }

    // Usuário é admin, permitir acesso
    next();

  } catch (error) {
    next(error);
  }
}
