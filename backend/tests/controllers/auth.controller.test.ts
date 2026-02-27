import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for AuthController
 *
 * Tests:
 * - register: validation, duplicate detection, user creation
 * - login: credential validation, 2FA flow, token generation
 * - me: authenticated user data retrieval
 * - refresh: token rotation
 * - logout: token revocation
 * - requestPasswordReset: email-based password reset flow
 * - resetPassword: token validation and password update
 * - revalidatePassword: password re-confirmation for critical actions
 */

// ============================================
// Mocks (hoisted)
// ============================================

const {
  mockPrisma,
  mockBcrypt,
  mockStartTrial,
  mockSendWelcomeEmail,
  mockSendPasswordResetEmail,
  mockSendPasswordChangedEmail,
  mockCreateRefreshToken,
  mockRotateRefreshToken,
  mockRevokeAllUserTokens,
  mockRevokeRefreshToken,
  mockSetRefreshTokenCookie,
  mockClearRefreshTokenCookie,
  mockGetRefreshTokenFromCookie,
  mockValidateCpf,
  mockEncryptCpf,
} = vi.hoisted(() => ({
  mockPrisma: {
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
  mockBcrypt: {
    hash: vi.fn().mockResolvedValue('hashed_password_123'),
    compare: vi.fn(),
  },
  mockStartTrial: vi.fn().mockResolvedValue(undefined),
  mockSendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  mockSendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  mockSendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
  mockCreateRefreshToken: vi.fn(),
  mockRotateRefreshToken: vi.fn(),
  mockRevokeAllUserTokens: vi.fn().mockResolvedValue(undefined),
  mockRevokeRefreshToken: vi.fn().mockResolvedValue(undefined),
  mockSetRefreshTokenCookie: vi.fn(),
  mockClearRefreshTokenCookie: vi.fn(),
  mockGetRefreshTokenFromCookie: vi.fn(),
  mockValidateCpf: vi.fn().mockReturnValue(true),
  mockEncryptCpf: vi.fn().mockReturnValue({
    encrypted: 'enc_cpf',
    last4: '1234',
    hash: 'hash_cpf',
  }),
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('bcrypt', () => ({
  default: mockBcrypt,
}));

vi.mock('../../src/services/billingService', () => ({
  startTrialForUser: mockStartTrial,
}));

vi.mock('../../src/services/emailService', () => ({
  sendWelcomeEmail: mockSendWelcomeEmail,
  sendPasswordResetEmail: mockSendPasswordResetEmail,
  sendPasswordChangedEmail: mockSendPasswordChangedEmail,
}));

vi.mock('../../src/services/refreshTokenService', () => ({
  createRefreshToken: mockCreateRefreshToken,
  rotateRefreshToken: mockRotateRefreshToken,
  revokeAllUserTokens: mockRevokeAllUserTokens,
  revokeRefreshToken: mockRevokeRefreshToken,
}));

vi.mock('../../src/utils/cookieHelpers', () => ({
  setRefreshTokenCookie: mockSetRefreshTokenCookie,
  clearRefreshTokenCookie: mockClearRefreshTokenCookie,
  getRefreshTokenFromCookie: mockGetRefreshTokenFromCookie,
}));

vi.mock('../../src/utils/crypto', () => ({
  validateCpf: mockValidateCpf,
  encryptCpf: mockEncryptCpf,
}));

vi.mock('../../src/utils/loggerHelpers', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarning: vi.fn(),
  logSimpleInfo: vi.fn(),
}));

// Mock Sentry
vi.mock('../../src/monitoring/sentry', () => ({
  initSentry: vi.fn(),
  captureException: vi.fn(),
  captureJobException: vi.fn(),
  captureMessage: vi.fn(),
  isSentryInitialized: vi.fn().mockReturnValue(false),
}));

import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';
import { AuthController, AuthStep } from '../../src/controllers/auth.controller';

// ============================================
// Helpers
// ============================================

const TEST_JWT_SECRET = 'test-jwt-secret-controller';

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    cookies: {},
    body: {},
    method: 'POST',
    path: '/api/auth',
    get: vi.fn().mockReturnValue('test-user-agent'),
    socket: { remoteAddress: '127.0.0.1' },
    requestId: 'req-test-123',
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    cookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

const MOCK_USER = {
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  phone: null,
  cpfLast4: null,
  role: 'USER',
  isActive: true,
  blocked: false,
  passwordHash: 'hashed_password_123',
  twoFactorEnabled: false,
  twoFactorBackupCodes: [],
  createdAt: new Date('2026-01-01'),
  subscriptions: [],
};

// ============================================
// register
// ============================================

describe('AuthController.register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    // Re-setup mock implementations (vitest mockReset: true clears them)
    mockBcrypt.hash.mockResolvedValue('hashed_password_123');
    mockBcrypt.compare.mockResolvedValue(false);
    mockValidateCpf.mockReturnValue(true);
    mockEncryptCpf.mockReturnValue({ encrypted: 'enc_cpf', last4: '1234', hash: 'hash_cpf' });
    mockStartTrial.mockResolvedValue(undefined);
    mockSendWelcomeEmail.mockResolvedValue(undefined);
  });

  it('should return 400 for missing required fields (email)', async () => {
    const req = createMockReq({ body: { password: '12345678', name: 'Test' } });
    const res = createMockRes();

    await AuthController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('obrigatórios') })
    );
  });

  it('should return 400 for missing required fields (password)', async () => {
    const req = createMockReq({ body: { email: 'test@example.com', name: 'Test' } });
    const res = createMockRes();

    await AuthController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 for missing required fields (name)', async () => {
    const req = createMockReq({ body: { email: 'test@example.com', password: '12345678' } });
    const res = createMockRes();

    await AuthController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 for invalid CPF', async () => {
    mockValidateCpf.mockReturnValue(false);

    const req = createMockReq({
      body: { email: 'test@example.com', password: '12345678', name: 'Test', cpf: '00000000000' },
    });
    const res = createMockRes();

    await AuthController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'CPF inválido' })
    );
  });

  it('should return 409 if email already exists', async () => {
    mockValidateCpf.mockReturnValue(true);
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'existing-user' });

    const req = createMockReq({
      body: { email: 'existing@example.com', password: '12345678', name: 'Test' },
    });
    const res = createMockRes();

    await AuthController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'USER_ALREADY_EXISTS' })
    );
  });

  it('should return 201 on successful registration', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      id: 'new-user',
      email: 'new@example.com',
      name: 'New User',
      phone: null,
      cpfLast4: null,
      role: 'USER',
      createdAt: new Date(),
    });

    const req = createMockReq({
      body: { email: 'new@example.com', password: '12345678', name: 'New User' },
    });
    const res = createMockRes();

    await AuthController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Usuário criado com sucesso',
        user: expect.objectContaining({ id: 'new-user' }),
      })
    );
  });

  it('should normalize email to lowercase and trim before creating', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      id: 'new-user',
      email: 'test@example.com',
      name: 'Test',
      phone: null,
      cpfLast4: null,
      role: 'USER',
      createdAt: new Date(),
    });

    const req = createMockReq({
      body: { email: '  Test@Example.COM  ', password: '12345678', name: 'Test' },
    });
    const res = createMockRes();

    await AuthController.register(req, res);

    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'test@example.com' }),
      })
    );
  });

  it('should handle P2002 unique constraint error (race condition)', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const p2002Error: any = new Error('Unique constraint');
    p2002Error.code = 'P2002';
    p2002Error.meta = { target: ['email'] };
    mockPrisma.user.create.mockRejectedValue(p2002Error);

    const req = createMockReq({
      body: { email: 'race@example.com', password: '12345678', name: 'Race' },
    });
    const res = createMockRes();

    await AuthController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'USER_ALREADY_EXISTS' })
    );
  });

  it('should call startTrialForUser after successful registration', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      id: 'new-user',
      email: 'new@example.com',
      name: 'New User',
      phone: null,
      cpfLast4: null,
      role: 'USER',
      createdAt: new Date(),
    });

    const req = createMockReq({
      body: { email: 'new@example.com', password: '12345678', name: 'New User' },
    });
    const res = createMockRes();

    await AuthController.register(req, res);

    expect(mockStartTrial).toHaveBeenCalledWith('new-user', 'free');
  });

  it('should return 500 on unexpected database error', async () => {
    mockPrisma.user.findFirst.mockRejectedValue(new Error('DB down'));

    const req = createMockReq({
      body: { email: 'test@example.com', password: '12345678', name: 'Test' },
    });
    const res = createMockRes();

    await AuthController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao criar usuário' });
  });
});

// ============================================
// login
// ============================================

describe('AuthController.login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    // Re-setup mock implementations (vitest mockReset: true clears them)
    mockBcrypt.compare.mockResolvedValue(false);
    mockCreateRefreshToken.mockResolvedValue({
      token: 'refresh-token-abc',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  });

  it('should return 400 for missing email', async () => {
    const req = createMockReq({ body: { password: '12345678' } });
    const res = createMockRes();

    await AuthController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Email e senha são obrigatórios' })
    );
  });

  it('should return 400 for missing password', async () => {
    const req = createMockReq({ body: { email: 'test@example.com' } });
    const res = createMockRes();

    await AuthController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 for missing both email and password', async () => {
    const req = createMockReq({ body: {} });
    const res = createMockRes();

    await AuthController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 401 for non-existent user', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    const req = createMockReq({
      body: { email: 'unknown@example.com', password: '12345678' },
    });
    const res = createMockRes();

    await AuthController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Credenciais inválidas' });
  });

  it('should return 401 for invalid password', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ ...MOCK_USER });
    mockBcrypt.compare.mockResolvedValue(false);

    const req = createMockReq({
      body: { email: 'test@example.com', password: 'wrongpassword' },
    });
    const res = createMockRes();

    await AuthController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Credenciais inválidas' });
  });

  it('should return 403 if user is inactive', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ ...MOCK_USER, isActive: false });
    mockBcrypt.compare.mockResolvedValue(true);

    const req = createMockReq({
      body: { email: 'test@example.com', password: '12345678' },
    });
    const res = createMockRes();

    await AuthController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('bloqueado') })
    );
  });

  it('should return 403 if user is blocked', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ ...MOCK_USER, blocked: true });
    mockBcrypt.compare.mockResolvedValue(true);

    const req = createMockReq({
      body: { email: 'test@example.com', password: '12345678' },
    });
    const res = createMockRes();

    await AuthController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should return tokens on successful login (no 2FA)', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ ...MOCK_USER });
    mockBcrypt.compare.mockResolvedValue(true);

    const req = createMockReq({
      body: { email: 'test@example.com', password: '12345678' },
    });
    const res = createMockRes();

    await AuthController.login(req, res);

    // Should return 200 (default, no status call needed)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        authStep: AuthStep.AUTHENTICATED,
        token: expect.any(String),
        user: expect.objectContaining({ id: 'user-123' }),
      })
    );
    // Token should be valid
    const response = (res.json as any).mock.calls[0][0];
    const decoded = jwt.verify(response.token, TEST_JWT_SECRET) as any;
    expect(decoded.userId).toBe('user-123');
  });

  it('should return TWO_FACTOR_REQUIRED when 2FA is enabled', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      ...MOCK_USER,
      twoFactorEnabled: true,
    });
    mockBcrypt.compare.mockResolvedValue(true);

    const req = createMockReq({
      body: { email: 'test@example.com', password: '12345678' },
    });
    const res = createMockRes();

    await AuthController.login(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        authStep: AuthStep.TWO_FACTOR_REQUIRED,
        requiresTwoFactor: true,
        tempToken: expect.any(String),
        userId: 'user-123',
      })
    );
  });

  it('should not include passwordHash in response user object', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ ...MOCK_USER });
    mockBcrypt.compare.mockResolvedValue(true);

    const req = createMockReq({
      body: { email: 'test@example.com', password: '12345678' },
    });
    const res = createMockRes();

    await AuthController.login(req, res);

    const response = (res.json as any).mock.calls[0][0];
    expect(response.user).not.toHaveProperty('passwordHash');
  });

  it('should set refresh token cookie on successful login', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ ...MOCK_USER });
    mockBcrypt.compare.mockResolvedValue(true);

    const req = createMockReq({
      body: { email: 'test@example.com', password: '12345678' },
    });
    const res = createMockRes();

    await AuthController.login(req, res);

    expect(mockCreateRefreshToken).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({
        userAgent: expect.any(String),
        ipAddress: expect.any(String),
      })
    );
    expect(mockSetRefreshTokenCookie).toHaveBeenCalled();
  });

  it('should return 500 on unexpected error', async () => {
    mockPrisma.user.findFirst.mockRejectedValue(new Error('DB error'));

    const req = createMockReq({
      body: { email: 'test@example.com', password: '12345678' },
    });
    const res = createMockRes();

    await AuthController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao fazer login' });
  });
});

// ============================================
// me
// ============================================

describe('AuthController.me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 if userId is not set', async () => {
    const req = createMockReq();
    const res = createMockRes();

    await AuthController.me(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should return 404 if user is not found', async () => {
    const req = createMockReq();
    req.userId = 'nonexistent';
    const res = createMockRes();

    mockPrisma.user.findUnique.mockResolvedValue(null);

    await AuthController.me(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('should return user data with no-cache headers', async () => {
    const req = createMockReq();
    req.userId = 'user-123';
    const res = createMockRes();

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      role: 'USER',
      isActive: true,
      blocked: false,
      createdAt: new Date(),
      subscriptions: [],
    });

    await AuthController.me(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ id: 'user-123' }),
      })
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, private'
    );
  });
});

// ============================================
// refresh
// ============================================

describe('AuthController.refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    // Re-setup mock implementations (vitest mockReset: true clears them)
    mockGetRefreshTokenFromCookie.mockReturnValue(undefined);
    mockRevokeAllUserTokens.mockResolvedValue(undefined);
    mockRevokeRefreshToken.mockResolvedValue(undefined);
    mockClearRefreshTokenCookie.mockReturnValue(undefined);
    mockSetRefreshTokenCookie.mockReturnValue(undefined);
  });

  it('should return 401 if no refresh token cookie', async () => {
    mockGetRefreshTokenFromCookie.mockReturnValue(undefined);

    const req = createMockReq();
    const res = createMockRes();

    await AuthController.refresh(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'NO_REFRESH_TOKEN' })
    );
  });

  it('should return 401 if refresh token rotation fails', async () => {
    mockGetRefreshTokenFromCookie.mockReturnValue('invalid-refresh-token');
    mockRotateRefreshToken.mockResolvedValue(null);

    const req = createMockReq();
    const res = createMockRes();

    await AuthController.refresh(req, res);

    expect(mockClearRefreshTokenCookie).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'INVALID_REFRESH_TOKEN' })
    );
  });

  it('should return 401 if user is blocked', async () => {
    mockGetRefreshTokenFromCookie.mockReturnValue('valid-refresh');
    mockRotateRefreshToken.mockResolvedValue({
      token: 'new-refresh',
      userId: 'user-blocked',
      expiresAt: new Date(),
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-blocked',
      blocked: true,
      isActive: true,
      twoFactorEnabled: false,
    });

    const req = createMockReq();
    const res = createMockRes();

    await AuthController.refresh(req, res);

    expect(mockClearRefreshTokenCookie).toHaveBeenCalled();
    expect(mockRevokeAllUserTokens).toHaveBeenCalledWith('user-blocked');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'USER_BLOCKED' })
    );
  });

  it('should return new access token on successful refresh', async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    mockGetRefreshTokenFromCookie.mockReturnValue('valid-refresh');
    mockRotateRefreshToken.mockResolvedValue({
      token: 'new-refresh-token',
      userId: 'user-123',
      expiresAt: futureDate,
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-123',
      blocked: false,
      isActive: true,
      twoFactorEnabled: false,
    });

    const req = createMockReq();
    const res = createMockRes();

    await AuthController.refresh(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        token: expect.any(String),
        expiresIn: expect.any(String),
      })
    );

    // Verify the new access token is valid
    const response = (res.json as any).mock.calls[0][0];
    const decoded = jwt.verify(response.token, TEST_JWT_SECRET) as any;
    expect(decoded.userId).toBe('user-123');

    // Verify new refresh cookie was set
    expect(mockSetRefreshTokenCookie).toHaveBeenCalledWith(
      res,
      'new-refresh-token',
      futureDate
    );
  });

  it('should return 500 on unexpected error', async () => {
    mockGetRefreshTokenFromCookie.mockReturnValue('valid-refresh');
    mockRotateRefreshToken.mockRejectedValue(new Error('Redis down'));

    const req = createMockReq();
    const res = createMockRes();

    await AuthController.refresh(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao renovar sessão' });
  });
});

// ============================================
// logout
// ============================================

describe('AuthController.logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup mock implementations (vitest mockReset: true clears them)
    mockGetRefreshTokenFromCookie.mockReturnValue(undefined);
    mockRevokeRefreshToken.mockResolvedValue(undefined);
    mockRevokeAllUserTokens.mockResolvedValue(undefined);
    mockClearRefreshTokenCookie.mockReturnValue(undefined);
  });

  it('should revoke refresh token and clear cookie', async () => {
    mockGetRefreshTokenFromCookie.mockReturnValue('refresh-to-revoke');
    const req = createMockReq();
    req.userId = 'user-123';
    const res = createMockRes();

    await AuthController.logout(req, res);

    expect(mockRevokeRefreshToken).toHaveBeenCalledWith('refresh-to-revoke');
    expect(mockRevokeAllUserTokens).toHaveBeenCalledWith('user-123');
    expect(mockClearRefreshTokenCookie).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: 'Logout realizado com sucesso' });
  });

  it('should handle logout when no refresh token is present', async () => {
    mockGetRefreshTokenFromCookie.mockReturnValue(undefined);
    const req = createMockReq();
    const res = createMockRes();

    await AuthController.logout(req, res);

    expect(mockRevokeRefreshToken).not.toHaveBeenCalled();
    expect(mockClearRefreshTokenCookie).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: 'Logout realizado com sucesso' });
  });

  it('should clear cookie even on error and still respond with success', async () => {
    mockGetRefreshTokenFromCookie.mockReturnValue('refresh-token');
    mockRevokeRefreshToken.mockRejectedValue(new Error('Redis error'));
    const req = createMockReq();
    const res = createMockRes();

    await AuthController.logout(req, res);

    expect(mockClearRefreshTokenCookie).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: 'Logout realizado' });
  });
});

// ============================================
// requestPasswordReset
// ============================================

describe('AuthController.requestPasswordReset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    delete process.env.PASSWORD_RESET_SECRET;
    delete process.env.REVEAL_EMAIL_NOT_FOUND;
    process.env.NODE_ENV = 'test';
    // Re-setup mock implementations (vitest mockReset: true clears them)
    mockSendPasswordResetEmail.mockResolvedValue(undefined);
    mockSendPasswordChangedEmail.mockResolvedValue(undefined);
  });

  it('should return 400 if email is missing', async () => {
    const req = createMockReq({ body: {} });
    const res = createMockRes();

    await AuthController.requestPasswordReset(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Email é obrigatório' });
  });

  it('should return generic message for non-existent email (production behavior)', async () => {
    process.env.REVEAL_EMAIL_NOT_FOUND = 'false';
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const req = createMockReq({ body: { email: 'unknown@example.com' } });
    const res = createMockRes();

    await AuthController.requestPasswordReset(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Se este e-mail estiver cadastrado'),
      })
    );
    // Should NOT leak that email does not exist
    expect(res.status).not.toHaveBeenCalledWith(404);
  });

  it('should return 404 for non-existent email when REVEAL_EMAIL_NOT_FOUND is true', async () => {
    process.env.REVEAL_EMAIL_NOT_FOUND = 'true';
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const req = createMockReq({ body: { email: 'unknown@example.com' } });
    const res = createMockRes();

    await AuthController.requestPasswordReset(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'EMAIL_NOT_FOUND' })
    );
  });

  it('should return generic message for blocked user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER, blocked: true });

    const req = createMockReq({ body: { email: 'test@example.com' } });
    const res = createMockRes();

    await AuthController.requestPasswordReset(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Se este e-mail estiver cadastrado'),
      })
    );
  });

  it('should send password reset email for valid user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });

    const req = createMockReq({ body: { email: 'test@example.com' } });
    const res = createMockRes();

    await AuthController.requestPasswordReset(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Se este e-mail estiver cadastrado'),
      })
    );
  });
});

// ============================================
// resetPassword
// ============================================

describe('AuthController.resetPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    delete process.env.PASSWORD_RESET_SECRET;
    process.env.NODE_ENV = 'test';
    // Re-setup mock implementations (vitest mockReset: true clears them)
    mockBcrypt.hash.mockResolvedValue('hashed_new_password');
    mockSendPasswordChangedEmail.mockResolvedValue(undefined);
  });

  it('should return 400 if token is missing', async () => {
    const req = createMockReq({ body: { password: 'newpassword123' } });
    const res = createMockRes();

    await AuthController.resetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 if password is missing', async () => {
    const req = createMockReq({ body: { token: 'some-token' } });
    const res = createMockRes();

    await AuthController.resetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should return 400 if password is too short', async () => {
    const req = createMockReq({ body: { token: 'some-token', password: '1234567' } });
    const res = createMockRes();

    await AuthController.resetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('8 caracteres') })
    );
  });

  it('should return 401 for expired reset token', async () => {
    const expiredToken = jwt.sign(
      { sub: 'user-123', type: 'password_reset' },
      TEST_JWT_SECRET,
      { expiresIn: '0s' }
    );

    const req = createMockReq({ body: { token: expiredToken, password: 'newpassword123' } });
    const res = createMockRes();

    await AuthController.resetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('expirado') })
    );
  });

  it('should return 401 for invalid reset token', async () => {
    const req = createMockReq({
      body: { token: 'completely-invalid-token', password: 'newpassword123' },
    });
    const res = createMockRes();

    await AuthController.resetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('inválido') })
    );
  });

  it('should return 401 for token with wrong type', async () => {
    const wrongTypeToken = jwt.sign(
      { sub: 'user-123', type: 'access' },
      TEST_JWT_SECRET,
      { expiresIn: '30m' }
    );

    const req = createMockReq({
      body: { token: wrongTypeToken, password: 'newpassword123' },
    });
    const res = createMockRes();

    await AuthController.resetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Token inválido para esta operação' })
    );
  });

  it('should return 403 if user is blocked', async () => {
    const validToken = jwt.sign(
      { sub: 'user-blocked', type: 'password_reset' },
      TEST_JWT_SECRET,
      { expiresIn: '30m' }
    );
    mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER, id: 'user-blocked', blocked: true });

    const req = createMockReq({ body: { token: validToken, password: 'newpassword123' } });
    const res = createMockRes();

    await AuthController.resetPassword(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should successfully reset password with valid token', async () => {
    const validToken = jwt.sign(
      { sub: 'user-123', type: 'password_reset' },
      TEST_JWT_SECRET,
      { expiresIn: '30m' }
    );
    mockPrisma.user.findUnique.mockResolvedValue({ ...MOCK_USER });
    mockPrisma.user.update.mockResolvedValue({});

    const req = createMockReq({ body: { token: validToken, password: 'newpassword123' } });
    const res = createMockRes();

    await AuthController.resetPassword(req, res);

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-123' },
      data: { passwordHash: 'hashed_new_password' },
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Senha redefinida com sucesso'),
      })
    );
  });
});

// ============================================
// revalidatePassword
// ============================================

describe('AuthController.revalidatePassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup mock implementations (vitest mockReset: true clears them)
    mockBcrypt.compare.mockResolvedValue(false);
  });

  it('should return 401 if userId is not set', async () => {
    const req = createMockReq({ body: { password: 'mypassword' } });
    const res = createMockRes();

    await AuthController.revalidatePassword(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should return 400 if password is missing', async () => {
    const req = createMockReq({ body: {} });
    req.userId = 'user-123';
    const res = createMockRes();

    await AuthController.revalidatePassword(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Senha é obrigatória' });
  });

  it('should return 404 if user is not found', async () => {
    const req = createMockReq({ body: { password: 'mypassword' } });
    req.userId = 'nonexistent';
    const res = createMockRes();

    mockPrisma.user.findUnique.mockResolvedValue(null);

    await AuthController.revalidatePassword(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('should return 401 for incorrect password', async () => {
    const req = createMockReq({ body: { password: 'wrongpassword' } });
    req.userId = 'user-123';
    const res = createMockRes();

    mockPrisma.user.findUnique.mockResolvedValue({ passwordHash: 'hashed' });
    mockBcrypt.compare.mockResolvedValue(false);

    await AuthController.revalidatePassword(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Senha incorreta' });
  });

  it('should update lastPasswordValidated and return success', async () => {
    const req = createMockReq({ body: { password: 'correctpassword' } });
    req.userId = 'user-123';
    const res = createMockRes();

    mockPrisma.user.findUnique.mockResolvedValue({ passwordHash: 'hashed' });
    mockBcrypt.compare.mockResolvedValue(true);
    mockPrisma.user.update.mockResolvedValue({});

    await AuthController.revalidatePassword(req, res);

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-123' },
      data: { lastPasswordValidated: expect.any(Date) },
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ validated: true })
    );
  });
});

// ============================================
// getAuthStatus
// ============================================

describe('AuthController.getAuthStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = TEST_JWT_SECRET;
  });

  it('should return NONE when no token is provided', async () => {
    const req = createMockReq({ headers: {} });
    const res = createMockRes();

    await AuthController.getAuthStatus(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        authStep: AuthStep.NONE,
        isAuthenticated: false,
      })
    );
  });

  it('should return NONE with tokenError=expired for expired token', async () => {
    const expiredToken = jwt.sign({ userId: 'user-123' }, TEST_JWT_SECRET, { expiresIn: '0s' });
    const req = createMockReq({
      headers: { authorization: `Bearer ${expiredToken}` },
    });
    const res = createMockRes();

    await AuthController.getAuthStatus(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        authStep: AuthStep.NONE,
        isAuthenticated: false,
        tokenError: 'expired',
      })
    );
  });

  it('should return AUTHENTICATED for valid user without 2FA', async () => {
    const validToken = jwt.sign({ userId: 'user-123' }, TEST_JWT_SECRET, { expiresIn: '15m' });
    const req = createMockReq({
      headers: { authorization: `Bearer ${validToken}` },
    });
    const res = createMockRes();

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test',
      role: 'USER',
      isActive: true,
      blocked: false,
      twoFactorEnabled: false,
      subscriptions: [],
    });

    await AuthController.getAuthStatus(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        authStep: AuthStep.AUTHENTICATED,
        isAuthenticated: true,
        twoFactorVerified: true, // true because 2FA is not enabled
      })
    );
  });

  it('should return TWO_FACTOR_REQUIRED for 2FA-pending token', async () => {
    const tempToken = jwt.sign(
      { userId: 'user-123', type: 'two_factor_pending', twoFactorVerified: false },
      TEST_JWT_SECRET,
      { expiresIn: '5m' }
    );
    const req = createMockReq({
      headers: { authorization: `Bearer ${tempToken}` },
    });
    const res = createMockRes();

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test',
      role: 'USER',
      isActive: true,
      blocked: false,
      twoFactorEnabled: true,
      subscriptions: [],
    });

    await AuthController.getAuthStatus(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        authStep: AuthStep.TWO_FACTOR_REQUIRED,
        isAuthenticated: false,
        twoFactorEnabled: true,
        twoFactorVerified: false,
        requiredStep: 'TWO_FACTOR_VERIFICATION',
      })
    );
  });

  it('should return NONE for blocked user', async () => {
    const validToken = jwt.sign({ userId: 'user-123' }, TEST_JWT_SECRET, { expiresIn: '15m' });
    const req = createMockReq({
      headers: { authorization: `Bearer ${validToken}` },
    });
    const res = createMockRes();

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test',
      role: 'USER',
      isActive: true,
      blocked: true,
      twoFactorEnabled: false,
      subscriptions: [],
    });

    await AuthController.getAuthStatus(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        authStep: AuthStep.NONE,
        isAuthenticated: false,
        blocked: true,
      })
    );
  });
});
