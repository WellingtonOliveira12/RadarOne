import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for auditLog utility — logAdminAction, getClientIp
 *
 * Cases tested:
 * - logAdminAction creates audit record via prisma
 * - logAdminAction passes correct data shape
 * - logAdminAction handles optional fields (targetId, beforeData, afterData)
 * - logAdminAction calls logInfo on success
 * - logAdminAction calls logError and re-throws on prisma failure
 * - getClientIp extracts from x-forwarded-for (first entry)
 * - getClientIp extracts from x-real-ip
 * - getClientIp falls back to req.ip
 * - getClientIp falls back to req.connection.remoteAddress
 * - getClientIp returns undefined when no IP available
 */

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('../../src/utils/loggerHelpers', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarning: vi.fn(),
  logSimpleInfo: vi.fn(),
}));

import { logAdminAction, getClientIp, AuditAction, AuditTargetType } from '../../src/utils/auditLog';
import { logInfo, logError } from '../../src/utils/loggerHelpers';

describe('logAdminAction', () => {
  const baseParams = {
    adminId: 'admin-123',
    adminEmail: 'admin@radarone.com',
    action: AuditAction.USER_BLOCKED,
    targetType: 'USER' as const,
    targetId: 'user-456',
    beforeData: { blocked: false },
    afterData: { blocked: true },
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates audit log record with correct data', async () => {
    const mockRecord = { id: 'audit-1', ...baseParams };
    mockPrisma.auditLog.create.mockResolvedValue(mockRecord);

    const result = await logAdminAction(baseParams);

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        adminId: 'admin-123',
        adminEmail: 'admin@radarone.com',
        action: 'USER_BLOCKED',
        targetType: 'USER',
        targetId: 'user-456',
        beforeData: { blocked: false },
        afterData: { blocked: true },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      },
    });
    expect(result).toBe(mockRecord);
  });

  it('handles null/undefined optional fields', async () => {
    const params = {
      adminId: 'admin-123',
      adminEmail: 'admin@radarone.com',
      action: AuditAction.SYSTEM_SETTING_UPDATED,
      targetType: 'SYSTEM' as const,
    };

    const mockRecord = { id: 'audit-2', ...params };
    mockPrisma.auditLog.create.mockResolvedValue(mockRecord);

    await logAdminAction(params);

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminId: 'admin-123',
        targetId: null,
        ipAddress: null,
        userAgent: null,
      }),
    });
  });

  it('calls logInfo after successful creation', async () => {
    const mockRecord = { id: 'audit-3', ...baseParams };
    mockPrisma.auditLog.create.mockResolvedValue(mockRecord);

    await logAdminAction(baseParams);

    expect(logInfo).toHaveBeenCalledWith(
      expect.stringContaining('[AUDIT LOG]'),
      expect.objectContaining({
        auditLogId: 'audit-3',
        adminId: 'admin-123',
        action: 'USER_BLOCKED',
      }),
    );
  });

  it('calls logError and re-throws on prisma failure', async () => {
    const dbError = new Error('Connection lost');
    mockPrisma.auditLog.create.mockRejectedValue(dbError);

    await expect(logAdminAction(baseParams)).rejects.toThrow('Connection lost');

    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('[AUDIT LOG ERROR]'),
      expect.objectContaining({
        error: 'Connection lost',
        adminId: 'admin-123',
        action: 'USER_BLOCKED',
      }),
    );
  });

  it('returns the created audit log record', async () => {
    const mockRecord = {
      id: 'audit-99',
      adminId: 'admin-123',
      adminEmail: 'admin@radarone.com',
      action: 'USER_UPDATED',
      targetType: 'USER',
      createdAt: new Date(),
    };
    mockPrisma.auditLog.create.mockResolvedValue(mockRecord);

    const result = await logAdminAction({
      ...baseParams,
      action: AuditAction.USER_UPDATED,
    });

    expect(result.id).toBe('audit-99');
  });
});

describe('getClientIp', () => {
  it('extracts IP from x-forwarded-for header (first entry)', () => {
    const req = {
      headers: { 'x-forwarded-for': '203.0.113.50, 70.41.3.18, 150.172.238.178' },
      ip: '127.0.0.1',
    };

    expect(getClientIp(req)).toBe('203.0.113.50');
  });

  it('extracts IP from x-real-ip header', () => {
    const req = {
      headers: { 'x-real-ip': '10.0.0.5' },
      ip: '127.0.0.1',
    };

    expect(getClientIp(req)).toBe('10.0.0.5');
  });

  it('falls back to req.ip', () => {
    const req = {
      headers: {},
      ip: '192.168.0.1',
    };

    expect(getClientIp(req)).toBe('192.168.0.1');
  });

  it('falls back to req.connection.remoteAddress', () => {
    const req = {
      headers: {},
      ip: undefined,
      connection: { remoteAddress: '10.10.10.10' },
    };

    expect(getClientIp(req)).toBe('10.10.10.10');
  });

  it('returns undefined when no IP is available', () => {
    const req = {
      headers: {},
      ip: undefined,
      connection: {},
    };

    expect(getClientIp(req)).toBeUndefined();
  });

  it('prefers x-forwarded-for over x-real-ip and req.ip', () => {
    const req = {
      headers: {
        'x-forwarded-for': '1.1.1.1',
        'x-real-ip': '2.2.2.2',
      },
      ip: '3.3.3.3',
    };

    expect(getClientIp(req)).toBe('1.1.1.1');
  });

  it('prefers x-real-ip over req.ip when x-forwarded-for is absent', () => {
    const req = {
      headers: { 'x-real-ip': '2.2.2.2' },
      ip: '3.3.3.3',
    };

    expect(getClientIp(req)).toBe('2.2.2.2');
  });
});

describe('AuditAction constants', () => {
  it('contains expected action types', () => {
    expect(AuditAction.USER_BLOCKED).toBe('USER_BLOCKED');
    expect(AuditAction.SUBSCRIPTION_CREATED).toBe('SUBSCRIPTION_CREATED');
    expect(AuditAction.COUPON_CREATED).toBe('COUPON_CREATED');
    expect(AuditAction.MONITOR_DEACTIVATED).toBe('MONITOR_DEACTIVATED');
    expect(AuditAction.SYSTEM_SETTING_UPDATED).toBe('SYSTEM_SETTING_UPDATED');
  });
});

describe('AuditTargetType constants', () => {
  it('contains expected target types', () => {
    expect(AuditTargetType.USER).toBe('USER');
    expect(AuditTargetType.SUBSCRIPTION).toBe('SUBSCRIPTION');
    expect(AuditTargetType.COUPON).toBe('COUPON');
    expect(AuditTargetType.MONITOR).toBe('MONITOR');
    expect(AuditTargetType.SYSTEM).toBe('SYSTEM');
  });
});
