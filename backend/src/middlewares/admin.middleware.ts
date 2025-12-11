import { Request, Response, NextFunction } from 'express';
import { prisma } from '../server';

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
      return res.status(401).json({ error: 'Usuário não autenticado' });
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
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Verificar se usuário não está bloqueado
    if (user.blocked) {
      return res.status(403).json({ error: 'Usuário bloqueado' });
    }

    // Verificar se usuário tem role de ADMIN
    if (user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }

    // Usuário é admin, permitir acesso
    next();

  } catch (error) {
    console.error('Erro no middleware requireAdmin:', error);
    return res.status(500).json({ error: 'Erro ao verificar permissões' });
  }
}
