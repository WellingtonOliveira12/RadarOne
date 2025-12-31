import { Request, Response, NextFunction } from 'express';
import { prisma } from '../server';
import { AppError } from '../errors/AppError';
import { UserRole } from '@prisma/client';

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

    // Verificar se usuário tem role de ADMIN (compatibilidade)
    if (user.role !== 'ADMIN' && user.role !== 'ADMIN_SUPER' && user.role !== 'ADMIN_SUPPORT' && user.role !== 'ADMIN_FINANCE' && user.role !== 'ADMIN_READ') {
      throw AppError.forbidden('Acesso negado. Apenas administradores');
    }

    // Usuário é admin, permitir acesso
    next();

  } catch (error) {
    next(error);
  }
}

/**
 * Middleware para verificar se o usuário tem uma das roles permitidas (FASE 3.2 - RBAC)
 * Deve ser usado após o middleware authenticateToken
 *
 * @param allowedRoles - Array de roles permitidas para acessar a rota
 * @returns Middleware function
 *
 * @example
 * // Apenas ADMIN_SUPER pode acessar
 * router.delete('/users/:id', requireAdminRole([UserRole.ADMIN_SUPER]), deleteUser);
 *
 * @example
 * // ADMIN_SUPER ou ADMIN_FINANCE podem acessar
 * router.patch('/subscriptions/:id', requireAdminRole([UserRole.ADMIN_SUPER, UserRole.ADMIN_FINANCE]), updateSubscription);
 */
export function requireAdminRole(allowedRoles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Verificar se o usuário está autenticado
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

      // ADMIN (legacy) e ADMIN_SUPER sempre têm acesso total (bypass)
      if (user.role === UserRole.ADMIN || user.role === UserRole.ADMIN_SUPER) {
        return next();
      }

      // Verificar se a role do usuário está na lista de roles permitidas
      if (!allowedRoles.includes(user.role)) {
        throw AppError.forbidden(`Acesso negado. Permissões insuficientes. Necessário: ${allowedRoles.join(', ')}`);
      }

      // Usuário tem permissão, permitir acesso
      next();

    } catch (error) {
      next(error);
    }
  };
}
