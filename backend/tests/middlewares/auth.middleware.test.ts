import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for auth middleware
 *
 * Tests:
 * - authenticateToken: JWT validation, userId injection, error handling
 * - requireAdmin: role-based access control
 * - checkTrialExpired: subscription validation
 * - requireRecentPasswordValidation: password revalidation timeout
 * - checkIpWhitelist: IP-based access control
 */

// ============================================
// Mocks (hoisted)
// ============================================

const { mockPrisma, mockGetCurrentSubscription } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
    },
    subscription: {
      findFirst: vi.fn(),
    },
  },
  mockGetCurrentSubscription: vi.fn(),
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('../../src/utils/loggerHelpers', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarning: vi.fn(),
  logSimpleInfo: vi.fn(),
  logWithUser: vi.fn(),
}));

vi.mock('../../src/services/subscriptionService', () => ({
  getCurrentSubscriptionForUser: mockGetCurrentSubscription,
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
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../src/errors/AppError';
import {
  authenticateToken,
  requireAdmin,
  checkTrialExpired,
  requireRecentPasswordValidation,
  checkIpWhitelist,
} from '../../src/middlewares/auth.middleware';

// ============================================
// Helpers
// ============================================

const TEST_JWT_SECRET = 'test-jwt-secret-middleware';

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    cookies: {},
    body: {},
    method: 'GET',
    path: '/test',
    get: vi.fn(),
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

function createMockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

// ============================================
// authenticateToken
// ============================================

describe('authenticateToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = TEST_JWT_SECRET;
  });

  it('should reject request without authorization header', () => {
    const req = createMockReq({ headers: {} });
    const res = createMockRes();
    const next = createMockNext();

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    const error = (next as any).mock.calls[0][0];
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(401);
  });

  it('should reject request with empty Bearer token', () => {
    const req = createMockReq({
      headers: { authorization: 'Bearer ' },
    });
    const res = createMockRes();
    const next = createMockNext();

    authenticateToken(req, res, next);

    // "Bearer ".split(' ')[1] is empty string which is falsy
    expect(next).toHaveBeenCalledOnce();
    const error = (next as any).mock.calls[0][0];
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(401);
  });

  it('should reject request with invalid JWT token', () => {
    const req = createMockReq({
      headers: { authorization: 'Bearer invalid.token.here' },
    });
    const res = createMockRes();
    const next = createMockNext();

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    const error = (next as any).mock.calls[0][0];
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(401);
    expect(error.message).toContain('inválido ou expirado');
  });

  it('should reject request with expired JWT token', () => {
    const expiredToken = jwt.sign(
      { userId: 'user-1' },
      TEST_JWT_SECRET,
      { expiresIn: '0s' }
    );

    const req = createMockReq({
      headers: { authorization: `Bearer ${expiredToken}` },
    });
    const res = createMockRes();
    const next = createMockNext();

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    const error = (next as any).mock.calls[0][0];
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(401);
  });

  it('should reject token signed with wrong secret', () => {
    const wrongSecretToken = jwt.sign(
      { userId: 'user-1' },
      'wrong-secret',
      { expiresIn: '15m' }
    );

    const req = createMockReq({
      headers: { authorization: `Bearer ${wrongSecretToken}` },
    });
    const res = createMockRes();
    const next = createMockNext();

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    const error = (next as any).mock.calls[0][0];
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(401);
  });

  it('should set req.userId for valid token and call next()', () => {
    const validToken = jwt.sign(
      { userId: 'user-abc-123' },
      TEST_JWT_SECRET,
      { expiresIn: '15m' }
    );

    const req = createMockReq({
      headers: { authorization: `Bearer ${validToken}` },
    });
    const res = createMockRes();
    const next = createMockNext();

    authenticateToken(req, res, next);

    expect(req.userId).toBe('user-abc-123');
    expect(next).toHaveBeenCalledOnce();
    // next() called without arguments means success
    expect((next as any).mock.calls[0][0]).toBeUndefined();
  });

  it('should handle malformed authorization header (no Bearer prefix)', () => {
    const validToken = jwt.sign(
      { userId: 'user-1' },
      TEST_JWT_SECRET,
      { expiresIn: '15m' }
    );

    const req = createMockReq({
      headers: { authorization: validToken }, // Missing "Bearer " prefix
    });
    const res = createMockRes();
    const next = createMockNext();

    authenticateToken(req, res, next);

    // authHeader.split(' ')[1] will be the second part after split, which won't be a valid token
    expect(next).toHaveBeenCalledOnce();
    const error = (next as any).mock.calls[0][0];
    expect(error).toBeInstanceOf(AppError);
  });

  it('should throw when JWT_SECRET is not configured', () => {
    delete process.env.JWT_SECRET;

    const validToken = jwt.sign({ userId: 'user-1' }, 'any-secret', { expiresIn: '15m' });
    const req = createMockReq({
      headers: { authorization: `Bearer ${validToken}` },
    });
    const res = createMockRes();
    const next = createMockNext();

    authenticateToken(req, res, next);

    // When JWT_SECRET is missing, it throws a generic Error, which gets caught
    // and converted to AppError.invalidToken
    expect(next).toHaveBeenCalledOnce();
    const error = (next as any).mock.calls[0][0];
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(401);
  });
});

// ============================================
// requireAdmin
// ============================================

describe('requireAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 if req.userId is not set', async () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();

    await requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Não autenticado' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 404 if user is not found in database', async () => {
    const req = createMockReq();
    req.userId = 'nonexistent-user';
    const res = createMockRes();
    const next = createMockNext();

    mockPrisma.user.findUnique.mockResolvedValue(null);

    await requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Usuário não encontrado' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 for non-admin user roles', async () => {
    const req = createMockReq();
    req.userId = 'user-regular';
    const res = createMockRes();
    const next = createMockNext();

    mockPrisma.user.findUnique.mockResolvedValue({ role: 'USER' });

    await requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Acesso negado. Requer privilégios de admin',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    'ADMIN',
    'ADMIN_SUPER',
    'ADMIN_SUPPORT',
    'ADMIN_FINANCE',
    'ADMIN_READ',
  ])('should allow access for role %s', async (role) => {
    const req = createMockReq();
    req.userId = 'admin-user';
    const res = createMockRes();
    const next = createMockNext();

    mockPrisma.user.findUnique.mockResolvedValue({ role });

    await requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 500 on database error', async () => {
    const req = createMockReq();
    req.userId = 'user-1';
    const res = createMockRes();
    const next = createMockNext();

    mockPrisma.user.findUnique.mockRejectedValue(new Error('DB connection failed'));

    await requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao verificar permissões' });
  });
});

// ============================================
// checkTrialExpired
// ============================================

describe('checkTrialExpired', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call next() when user has valid subscription', async () => {
    const req = createMockReq();
    req.userId = 'user-with-sub';
    const res = createMockRes();
    const next = createMockNext();

    mockGetCurrentSubscription.mockResolvedValue({ id: 'sub-1', status: 'ACTIVE' });

    await checkTrialExpired(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    // next() called without error
    expect((next as any).mock.calls[0][0]).toBeUndefined();
  });

  it('should pass AppError.unauthorized when userId is missing', async () => {
    const req = createMockReq();
    // No userId set
    const res = createMockRes();
    const next = createMockNext();

    await checkTrialExpired(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    const error = (next as any).mock.calls[0][0];
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(401);
  });

  it('should pass trialExpired error when trial is expired', async () => {
    const req = createMockReq();
    req.userId = 'user-expired-trial';
    const res = createMockRes();
    const next = createMockNext();

    mockGetCurrentSubscription.mockResolvedValue(null);
    mockPrisma.subscription.findFirst.mockResolvedValue({
      id: 'sub-expired',
      status: 'TRIAL',
      isTrial: true,
      trialEndsAt: new Date(Date.now() - 86400000), // expired yesterday
    });

    await checkTrialExpired(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    const error = (next as any).mock.calls[0][0];
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(403);
    expect(error.errorCode).toBe('TRIAL_EXPIRED');
  });

  it('should pass subscriptionRequired error when no subscription at all', async () => {
    const req = createMockReq();
    req.userId = 'user-no-sub';
    const res = createMockRes();
    const next = createMockNext();

    mockGetCurrentSubscription.mockResolvedValue(null);
    mockPrisma.subscription.findFirst.mockResolvedValue(null);

    await checkTrialExpired(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    const error = (next as any).mock.calls[0][0];
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(403);
    expect(error.errorCode).toBe('SUBSCRIPTION_REQUIRED');
  });
});

// ============================================
// requireRecentPasswordValidation
// ============================================

describe('requireRecentPasswordValidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 if req.userId is not set', async () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();

    await requireRecentPasswordValidation(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 404 if user is not found', async () => {
    const req = createMockReq();
    req.userId = 'nonexistent';
    const res = createMockRes();
    const next = createMockNext();

    mockPrisma.user.findUnique.mockResolvedValue(null);

    await requireRecentPasswordValidation(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('should return 403 if password was never validated', async () => {
    const req = createMockReq();
    req.userId = 'user-1';
    const res = createMockRes();
    const next = createMockNext();

    mockPrisma.user.findUnique.mockResolvedValue({ lastPasswordValidated: null });

    await requireRecentPasswordValidation(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ requiresPasswordRevalidation: true })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 if password validation expired (> 15 minutes)', async () => {
    const req = createMockReq();
    req.userId = 'user-1';
    const res = createMockRes();
    const next = createMockNext();

    // 20 minutes ago
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000);
    mockPrisma.user.findUnique.mockResolvedValue({
      lastPasswordValidated: twentyMinutesAgo,
    });

    await requireRecentPasswordValidation(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ requiresPasswordRevalidation: true })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() if password was validated recently (< 15 minutes)', async () => {
    const req = createMockReq();
    req.userId = 'user-1';
    const res = createMockRes();
    const next = createMockNext();

    // 5 minutes ago
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    mockPrisma.user.findUnique.mockResolvedValue({
      lastPasswordValidated: fiveMinutesAgo,
    });

    await requireRecentPasswordValidation(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ============================================
// checkIpWhitelist
// ============================================

describe('checkIpWhitelist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 if req.userId is not set', async () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();

    await checkIpWhitelist(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() if user has no IP whitelist configured', async () => {
    const req = createMockReq();
    req.userId = 'user-1';
    const res = createMockRes();
    const next = createMockNext();

    mockPrisma.user.findUnique.mockResolvedValue({ allowedIps: [], role: 'USER' });

    await checkIpWhitelist(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('should call next() if client IP is in whitelist', async () => {
    const req = createMockReq({
      headers: { 'x-forwarded-for': '192.168.1.100' },
    });
    req.userId = 'user-1';
    const res = createMockRes();
    const next = createMockNext();

    mockPrisma.user.findUnique.mockResolvedValue({
      allowedIps: ['192.168.1.100', '10.0.0.1'],
      role: 'ADMIN',
    });

    await checkIpWhitelist(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 403 if client IP is not in whitelist', async () => {
    const req = createMockReq({
      headers: { 'x-forwarded-for': '192.168.1.200' },
    });
    req.userId = 'user-1';
    const res = createMockRes();
    const next = createMockNext();

    mockPrisma.user.findUnique.mockResolvedValue({
      allowedIps: ['192.168.1.100'],
      role: 'ADMIN',
    });

    await checkIpWhitelist(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Acesso negado. Seu IP não está autorizado',
        clientIp: '192.168.1.200',
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should use first IP from x-forwarded-for header (comma-separated)', async () => {
    const req = createMockReq({
      headers: { 'x-forwarded-for': '10.0.0.5, 192.168.1.1, 172.16.0.1' },
    });
    req.userId = 'user-1';
    const res = createMockRes();
    const next = createMockNext();

    mockPrisma.user.findUnique.mockResolvedValue({
      allowedIps: ['10.0.0.5'],
      role: 'USER',
    });

    await checkIpWhitelist(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
