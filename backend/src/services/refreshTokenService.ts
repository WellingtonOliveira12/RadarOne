import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { logInfo, logError } from '../utils/loggerHelpers';

const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const MAX_TOKENS_PER_USER = 5; // Máximo de sessões simultâneas

/**
 * Gera hash SHA256 de um token (nunca armazena plain text no banco)
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Gera um refresh token seguro (opaque, 64 bytes hex)
 */
function generateToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Gera um family ID para rastrear cadeia de tokens (replay protection)
 */
function generateFamily(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Cria um novo refresh token para o usuário
 */
export async function createRefreshToken(
  userId: string,
  opts?: { userAgent?: string; ipAddress?: string; family?: string }
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const family = opts?.family || generateFamily();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  // Limpar tokens antigos se exceder limite
  const existingCount = await prisma.refreshToken.count({
    where: { userId, revokedAt: null },
  });

  if (existingCount >= MAX_TOKENS_PER_USER) {
    // Revogar o token mais antigo
    const oldest = await prisma.refreshToken.findFirst({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    if (oldest) {
      await prisma.refreshToken.update({
        where: { id: oldest.id },
        data: { revokedAt: new Date() },
      });
    }
  }

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      family,
      expiresAt,
      userAgent: opts?.userAgent?.substring(0, 255),
      ipAddress: opts?.ipAddress?.substring(0, 45),
    },
  });

  return { token, expiresAt };
}

/**
 * Rotaciona um refresh token (invalidate-on-use + replay detection)
 * Retorna novo token + userId se válido, null se inválido
 */
export async function rotateRefreshToken(
  oldToken: string,
  opts?: { userAgent?: string; ipAddress?: string }
): Promise<{ token: string; expiresAt: Date; userId: string } | null> {
  const oldHash = hashToken(oldToken);

  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: oldHash },
  });

  if (!existing) {
    return null; // Token não encontrado
  }

  // Token já foi revogado → possível replay attack
  if (existing.revokedAt) {
    logError('Refresh token replay detected, revoking entire family', {
      family: existing.family,
      userId: existing.userId,
    });
    // Revogar TODA a família de tokens (segurança)
    await prisma.refreshToken.updateMany({
      where: { family: existing.family, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return null;
  }

  // Token expirado
  if (existing.expiresAt < new Date()) {
    await prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    return null;
  }

  // Gerar novo token na mesma família
  const newToken = generateToken();
  const newHash = hashToken(newToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  // Transação: revogar antigo + criar novo
  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedBy: newHash },
    }),
    prisma.refreshToken.create({
      data: {
        userId: existing.userId,
        tokenHash: newHash,
        family: existing.family,
        expiresAt,
        userAgent: opts?.userAgent?.substring(0, 255),
        ipAddress: opts?.ipAddress?.substring(0, 45),
      },
    }),
  ]);

  logInfo('Refresh token rotated', { userId: existing.userId, family: existing.family });

  return { token: newToken, expiresAt, userId: existing.userId };
}

/**
 * Revoga todos os refresh tokens de um usuário (logout completo)
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  logInfo('All refresh tokens revoked', { userId });
}

/**
 * Revoga um refresh token específico (logout de uma sessão)
 */
export async function revokeRefreshToken(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Limpa tokens expirados (job de manutenção)
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const result = await prisma.refreshToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { revokedAt: { not: null }, createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      ],
    },
  });
  return result.count;
}
