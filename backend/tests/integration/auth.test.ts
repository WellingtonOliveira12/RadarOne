import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Testes de integração para fluxos de autenticação
 * Valida: login, refresh token rotation, logout, 2FA
 *
 * Nota: estes testes mockam Prisma e bcrypt para rodar sem banco.
 * Para testes E2E com banco real, usar seed-e2e.ts + Playwright.
 */

// Mock Prisma
vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    subscription: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn((fns: any[]) => Promise.all(fns)),
  },
}));

// Mock bcrypt
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed_password'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

// Mock email service
vi.mock('../../src/services/emailService', () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
}));

// Mock billing service
vi.mock('../../src/services/billingService', () => ({
  startTrialForUser: vi.fn().mockResolvedValue(undefined),
}));

// Mock Sentry
vi.mock('../../src/monitoring/sentry', () => ({
  initSentry: vi.fn(),
  captureException: vi.fn(),
  captureJobException: vi.fn(),
  captureMessage: vi.fn(),
  isSentryInitialized: vi.fn().mockReturnValue(false),
}));

import { prisma } from '../../src/lib/prisma';
import jwt from 'jsonwebtoken';
import { createRefreshToken, rotateRefreshToken, revokeAllUserTokens } from '../../src/services/refreshTokenService';
import { LoginRequestSchema, RegisterRequestSchema } from '../../src/schemas/api-responses';

const TEST_JWT_SECRET = 'test-jwt-secret';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = TEST_JWT_SECRET;
});

describe('Refresh Token Service', () => {
  const mockUserId = 'user_123';

  it('deve criar um refresh token', async () => {
    vi.mocked(prisma.refreshToken.count).mockResolvedValue(0);
    vi.mocked(prisma.refreshToken.create).mockResolvedValue({} as any);

    const result = await createRefreshToken(mockUserId);

    expect(result.token).toBeDefined();
    expect(result.token.length).toBe(128); // 64 bytes hex = 128 chars
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(prisma.refreshToken.create).toHaveBeenCalledOnce();
  });

  it('deve revogar token mais antigo quando exceder limite', async () => {
    vi.mocked(prisma.refreshToken.count).mockResolvedValue(5); // MAX_TOKENS_PER_USER
    vi.mocked(prisma.refreshToken.findFirst).mockResolvedValue({ id: 'oldest' } as any);
    vi.mocked(prisma.refreshToken.update).mockResolvedValue({} as any);
    vi.mocked(prisma.refreshToken.create).mockResolvedValue({} as any);

    await createRefreshToken(mockUserId);

    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'oldest' },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('deve rotacionar refresh token corretamente', async () => {
    const existingToken = {
      id: 'token_1',
      userId: mockUserId,
      tokenHash: 'hash_1',
      family: 'family_1',
      expiresAt: new Date(Date.now() + 86400000), // +1 day
      revokedAt: null,
      replacedBy: null,
      createdAt: new Date(),
    };

    vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue(existingToken as any);
    vi.mocked(prisma.$transaction).mockResolvedValue([{}, {}]);

    const result = await rotateRefreshToken('any_token');

    expect(result).not.toBeNull();
    expect(result!.token).toBeDefined();
    expect(result!.userId).toBe(mockUserId);
  });

  it('deve detectar replay attack e revogar toda a família', async () => {
    const revokedToken = {
      id: 'token_1',
      userId: mockUserId,
      tokenHash: 'hash_1',
      family: 'family_1',
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: new Date(), // JÁ REVOGADO
      replacedBy: 'hash_2',
      createdAt: new Date(),
    };

    vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue(revokedToken as any);
    vi.mocked(prisma.refreshToken.updateMany).mockResolvedValue({ count: 3 } as any);

    const result = await rotateRefreshToken('stolen_token');

    expect(result).toBeNull();
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { family: 'family_1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('deve retornar null para token expirado', async () => {
    const expiredToken = {
      id: 'token_1',
      userId: mockUserId,
      tokenHash: 'hash_1',
      family: 'family_1',
      expiresAt: new Date(Date.now() - 86400000), // -1 day (EXPIRED)
      revokedAt: null,
      createdAt: new Date(),
    };

    vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue(expiredToken as any);
    vi.mocked(prisma.refreshToken.update).mockResolvedValue({} as any);

    const result = await rotateRefreshToken('expired_token');

    expect(result).toBeNull();
  });

  it('deve revogar todos os tokens do usuário no logout', async () => {
    vi.mocked(prisma.refreshToken.updateMany).mockResolvedValue({ count: 3 } as any);

    await revokeAllUserTokens(mockUserId);

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: mockUserId, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

describe('JWT Access Token', () => {
  it('deve gerar access token com expiração curta', () => {
    const token = jwt.sign({ userId: 'user_123' }, TEST_JWT_SECRET, { expiresIn: '15m' });
    const decoded = jwt.verify(token, TEST_JWT_SECRET) as any;

    expect(decoded.userId).toBe('user_123');
    // Token deve expirar em ~15 minutos (900 segundos)
    const expiresIn = decoded.exp - decoded.iat;
    expect(expiresIn).toBe(900);
  });

  it('deve rejeitar token expirado', () => {
    const token = jwt.sign({ userId: 'user_123' }, TEST_JWT_SECRET, { expiresIn: '0s' });

    expect(() => jwt.verify(token, TEST_JWT_SECRET)).toThrow();
  });
});

describe('Zod Validation Schemas', () => {
  // Import schemas
  // Schemas already imported at top level

  it('deve validar login request', () => {
    const result = LoginRequestSchema.safeParse({
      email: 'Test@Example.COM  ',
      password: 'mypassword',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // Transform: trim + lowercase
      expect(result.data.email).toBe('test@example.com');
    }
  });

  it('deve rejeitar login sem email válido', () => {
    const result = LoginRequestSchema.safeParse({
      email: 'not-an-email',
      password: 'mypassword',
    });

    expect(result.success).toBe(false);
  });

  it('deve rejeitar registro com senha curta', () => {
    const result = RegisterRequestSchema.safeParse({
      email: 'test@example.com',
      password: '123',
      name: 'Test',
    });

    expect(result.success).toBe(false);
  });
});
