import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for emailService — email sending via Resend API
 *
 * Cases tested:
 * - sendEmail: calls Resend API with correct params, handles missing API key
 * - sendTrialEndingEmail: stub returns success
 * - sendTrialExpiredEmail: stub returns success
 * - sendSubscriptionExpiredEmail: stub returns success
 * - sendWelcomeEmail: renders template and sends
 * - sendAlertEmail: constructs HTML and sends
 * - sendNotificationEmail: throws on failure
 */

// Hoist all mocks AND set env vars so they run before any module evaluation.
// vi.hoisted runs first, then vi.mock factories, then imports.
const {
  mockResendSend,
  MockResend,
  mockRenderTestEmailTemplate,
  mockRenderNewAdEmailTemplate,
} = vi.hoisted(() => {
  // Set env vars here so they're available when emailService module evaluates
  process.env.RESEND_API_KEY = 'test-resend-key';
  process.env.EMAIL_FROM = 'test@radarone.com';

  const mockResendSend = vi.fn();
  const MockResend = vi.fn(() => ({
    emails: {
      send: mockResendSend,
    },
  }));
  return {
    mockResendSend,
    MockResend,
    mockRenderTestEmailTemplate: vi.fn(() => '<html>Welcome</html>'),
    mockRenderNewAdEmailTemplate: vi.fn(() => '<html>New Ad</html>'),
  };
});

vi.mock('resend', () => ({
  Resend: MockResend,
}));

vi.mock('../../src/templates/email/baseTemplate', () => ({
  renderTestEmailTemplate: mockRenderTestEmailTemplate,
  renderNewAdEmailTemplate: mockRenderNewAdEmailTemplate,
}));

vi.mock('../../src/utils/abtest', () => ({
  getEmailSubject: vi.fn(() => ({ subject: 'Test Subject', variant: 'A' })),
  getSubjectTestKey: vi.fn(() => 'firstReminderStandard'),
}));

vi.mock('../../src/utils/loggerHelpers', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarning: vi.fn(),
  logSimpleInfo: vi.fn(),
}));

import {
  sendEmail,
  sendNotificationEmail,
  sendAlertEmail,
  sendWelcomeEmail,
  sendTrialEndingEmail,
  sendTrialExpiredEmail,
  sendSubscriptionExpiredEmail,
  sendNewListingEmail,
} from '../../src/services/emailService';

// ============================================
// sendEmail (core function)
// ============================================

describe('sendEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls Resend API with correct params', async () => {
    mockResendSend.mockResolvedValue({ data: { id: 'msg-123' } });

    const result = await sendEmail({
      to: 'user@example.com',
      subject: 'Test Email',
      html: '<p>Hello</p>',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg-123');
    expect(mockResendSend).toHaveBeenCalledWith({
      from: 'test@radarone.com',
      to: 'user@example.com',
      subject: 'Test Email',
      html: '<p>Hello</p>',
    });
  });

  it('uses custom from address when provided', async () => {
    mockResendSend.mockResolvedValue({ data: { id: 'msg-456' } });

    await sendEmail({
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Hi</p>',
      from: 'custom@radarone.com',
    });

    expect(mockResendSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'custom@radarone.com' })
    );
  });

  it('returns error when Resend API fails', async () => {
    mockResendSend.mockRejectedValue(new Error('API rate limit exceeded'));

    const result = await sendEmail({
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Hi</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('API rate limit exceeded');
  });
});

// ============================================
// sendNotificationEmail
// ============================================

describe('sendNotificationEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends notification email successfully', async () => {
    mockResendSend.mockResolvedValue({ data: { id: 'msg-789' } });

    await expect(
      sendNotificationEmail('user@example.com', 'Notification', '<p>Content</p>')
    ).resolves.toBeUndefined();
  });

  it('throws when email sending fails', async () => {
    mockResendSend.mockRejectedValue(new Error('Send failed'));

    await expect(
      sendNotificationEmail('user@example.com', 'Notification', '<p>Content</p>')
    ).rejects.toThrow('Send failed');
  });
});

// ============================================
// sendAlertEmail
// ============================================

describe('sendAlertEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends alert email with ad details', async () => {
    mockResendSend.mockResolvedValue({ data: { id: 'msg-alert' } });

    const result = await sendAlertEmail(
      'user@example.com',
      'iPhone 15 Pro',
      'https://example.com/ad/123',
      'My Monitor'
    );

    expect(result.success).toBe(true);
    expect(mockResendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: expect.stringContaining('iPhone 15 Pro'),
        html: expect.stringContaining('My Monitor'),
      })
    );
  });
});

// ============================================
// sendWelcomeEmail
// ============================================

describe('sendWelcomeEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders template and sends welcome email', async () => {
    mockResendSend.mockResolvedValue({ data: { id: 'msg-welcome' } });

    const result = await sendWelcomeEmail('user@example.com', 'Wellington');

    expect(result.success).toBe(true);
    expect(mockRenderTestEmailTemplate).toHaveBeenCalledWith('Wellington');
    expect(mockResendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Bem-vindo ao RadarOne!',
        html: '<html>Welcome</html>',
      })
    );
  });
});

// ============================================
// sendTrialEndingEmail (stub)
// ============================================

describe('sendTrialEndingEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success (stub implementation)', async () => {
    const result = await sendTrialEndingEmail('user@example.com', 'Test User', 3, 'Pro');

    expect(result.success).toBe(true);
  });

  it('accepts different daysRemaining values', async () => {
    const result1 = await sendTrialEndingEmail('user@example.com', 'User', 1, 'Starter');
    const result7 = await sendTrialEndingEmail('user@example.com', 'User', 7, 'Premium');

    expect(result1.success).toBe(true);
    expect(result7.success).toBe(true);
  });
});

// ============================================
// sendTrialExpiredEmail (stub)
// ============================================

describe('sendTrialExpiredEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success (stub implementation)', async () => {
    const result = await sendTrialExpiredEmail('user@example.com', 'Test User', 'Pro');

    expect(result.success).toBe(true);
  });

  it('works with different plan names', async () => {
    const resultStarter = await sendTrialExpiredEmail('user@example.com', 'User', 'Starter');
    const resultPremium = await sendTrialExpiredEmail('user@example.com', 'User', 'Premium');

    expect(resultStarter.success).toBe(true);
    expect(resultPremium.success).toBe(true);
  });
});

// ============================================
// sendSubscriptionExpiredEmail (stub)
// ============================================

describe('sendSubscriptionExpiredEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success (stub implementation)', async () => {
    const result = await sendSubscriptionExpiredEmail('user@example.com', 'Test User', 'Pro');

    expect(result.success).toBe(true);
  });

  it('works with different plan names', async () => {
    const resultStarter = await sendSubscriptionExpiredEmail('user@example.com', 'User', 'Starter');
    const resultUltra = await sendSubscriptionExpiredEmail('user@example.com', 'User', 'Ultra');

    expect(resultStarter.success).toBe(true);
    expect(resultUltra.success).toBe(true);
  });
});

// ============================================
// sendNewListingEmail
// ============================================

describe('sendNewListingEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders new ad template and sends email', async () => {
    mockResendSend.mockResolvedValue({ data: { id: 'msg-listing' } });

    const result = await sendNewListingEmail(
      'user@example.com',
      'MacBook Pro M4',
      'https://example.com/ad/macbook'
    );

    expect(result.success).toBe(true);
    expect(mockRenderNewAdEmailTemplate).toHaveBeenCalledWith({
      userName: 'Usuário',
      monitorName: 'Monitor',
      adTitle: 'MacBook Pro M4',
      adUrl: 'https://example.com/ad/macbook',
    });
    expect(mockResendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: expect.stringContaining('MacBook Pro M4'),
      })
    );
  });
});
