import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for errorHandler middleware
 *
 * Cases tested:
 * - AppError: responds with statusCode, errorCode, message
 * - AppError: includes details when present
 * - AppError: does not include details when absent
 * - AppError: calls logAppError with structured fields
 * - Generic Error (production): responds 500 with generic message
 * - Generic Error (development): responds 500 with actual error message
 * - Generic Error: calls logUnexpectedError
 * - next is never called
 */

// ============================================
// Mocks (hoisted)
// ============================================

const { mockLogAppError, mockLogUnexpectedError } = vi.hoisted(() => ({
  mockLogAppError: vi.fn(),
  mockLogUnexpectedError: vi.fn(),
}));

vi.mock('../../src/utils/loggerHelpers', () => ({
  logAppError: mockLogAppError,
  logUnexpectedError: mockLogUnexpectedError,
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarning: vi.fn(),
  logSimpleInfo: vi.fn(),
}));

// Import AFTER mocks
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../src/errors/AppError';
import { errorHandler } from '../../src/middlewares/errorHandler.middleware';
import { ErrorCodes } from '../../src/constants/errorCodes';

// ============================================
// Helpers
// ============================================

function createMockReq(overrides: Partial<Record<string, any>> = {}): Request {
  return {
    path: '/api/test',
    method: 'GET',
    headers: {},
    cookies: {},
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
// Tests
// ============================================

describe('errorHandler middleware', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  // ============================================
  // AppError handling
  // ============================================

  it('should respond with AppError statusCode and errorCode', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();
    const err = new AppError(400, ErrorCodes.VALIDATION_ERROR, 'Invalid field');

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: ErrorCodes.VALIDATION_ERROR,
        message: 'Invalid field',
      })
    );
  });

  it('should include details in response when AppError has details', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();
    const err = AppError.validationError('Bad input', { field: 'email', reason: 'required' });

    errorHandler(err, req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        details: { field: 'email', reason: 'required' },
      })
    );
  });

  it('should NOT include details key in response when AppError has no details', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();
    const err = AppError.unauthorized();

    errorHandler(err, req, res, next);

    const jsonArg = (res.json as any).mock.calls[0][0];
    expect(jsonArg).not.toHaveProperty('details');
  });

  it('should call logAppError with structured error metadata', () => {
    const req = createMockReq({ path: '/api/auth/login', method: 'POST' });
    (req as any).userId = 'user-123';
    const res = createMockRes();
    const next = createMockNext();
    const err = new AppError(401, ErrorCodes.INVALID_TOKEN, 'Token expired');

    errorHandler(err, req, res, next);

    expect(mockLogAppError).toHaveBeenCalledWith({
      errorCode: ErrorCodes.INVALID_TOKEN,
      message: 'Token expired',
      statusCode: 401,
      path: '/api/auth/login',
      method: 'POST',
      userId: 'user-123',
    });
  });

  it('should handle 403 Forbidden AppError correctly', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();
    const err = AppError.forbidden('Access denied to resource');

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: ErrorCodes.FORBIDDEN,
        message: 'Access denied to resource',
      })
    );
  });

  it('should handle 409 UserAlreadyExists AppError correctly', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();
    const err = AppError.userAlreadyExists();

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: ErrorCodes.USER_ALREADY_EXISTS,
      })
    );
  });

  it('should handle 500 InternalError AppError correctly', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();
    const err = AppError.internalError('Something went wrong internally');

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: ErrorCodes.INTERNAL_ERROR,
        message: 'Something went wrong internally',
      })
    );
  });

  it('should NOT call next for AppError', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();
    const err = AppError.unauthorized();

    errorHandler(err, req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  // ============================================
  // Generic Error handling
  // ============================================

  it('should respond with 500 and INTERNAL_ERROR code for generic Error', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();
    const err = new Error('Unexpected crash');

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: ErrorCodes.INTERNAL_ERROR,
      })
    );
  });

  it('should return generic message in production for unknown errors', () => {
    process.env.NODE_ENV = 'production';
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();
    const err = new Error('Sensitive internal details');

    errorHandler(err, req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Erro interno do servidor',
      })
    );
    // Should NOT leak actual error message
    const jsonArg = (res.json as any).mock.calls[0][0];
    expect(jsonArg.message).not.toContain('Sensitive internal details');
  });

  it('should return actual error message in development for unknown errors', () => {
    process.env.NODE_ENV = 'development';
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();
    const err = new Error('Debug info for developer');

    errorHandler(err, req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Debug info for developer',
      })
    );
  });

  it('should call logUnexpectedError for generic errors', () => {
    const req = createMockReq({ path: '/api/monitors', method: 'DELETE' });
    const res = createMockRes();
    const next = createMockNext();
    const err = new Error('Unexpected crash');
    err.stack = 'Error: Unexpected crash\n    at Object.<anonymous>';

    errorHandler(err, req, res, next);

    expect(mockLogUnexpectedError).toHaveBeenCalledWith({
      error: 'Unexpected crash',
      stack: err.stack,
      path: '/api/monitors',
      method: 'DELETE',
    });
  });

  it('should NOT call logAppError for generic errors', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();
    const err = new Error('Generic error');

    errorHandler(err, req, res, next);

    expect(mockLogAppError).not.toHaveBeenCalled();
  });

  it('should NOT call next for generic errors', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();
    const err = new Error('Generic error');

    errorHandler(err, req, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  // ============================================
  // Edge cases
  // ============================================

  it('should handle AppError with string errorCode (not from ErrorCodes enum)', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();
    const err = new AppError(422, 'CUSTOM_ERROR_CODE', 'Custom validation failed');

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'CUSTOM_ERROR_CODE',
        message: 'Custom validation failed',
      })
    );
  });

  it('should handle TRIAL_EXPIRED AppError', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();
    const err = AppError.trialExpired();

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: ErrorCodes.TRIAL_EXPIRED,
      })
    );
  });

  it('should handle SUBSCRIPTION_REQUIRED AppError', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();
    const err = AppError.subscriptionRequired();

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: ErrorCodes.SUBSCRIPTION_REQUIRED,
      })
    );
  });

  it('should work when req.userId is undefined (unauthenticated request)', () => {
    const req = createMockReq();
    // No userId set on req
    const res = createMockRes();
    const next = createMockNext();
    const err = AppError.invalidToken();

    errorHandler(err, req, res, next);

    expect(mockLogAppError).toHaveBeenCalledWith(
      expect.objectContaining({ userId: undefined })
    );
  });
});
