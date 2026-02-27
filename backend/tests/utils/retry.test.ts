import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for retry utility — retryAsync, isTransientError, createRetryHelper
 *
 * Cases tested:
 * - Successful on first attempt (no retry)
 * - Successful after transient failures (retry works)
 * - Max retries exceeded — throws last error
 * - Non-transient error — fails immediately without retrying
 * - Non-transient error on retry attempt — fails immediately
 * - Exponential backoff delay increases
 * - onRetry callback is called on each retry
 * - isTransientError detection (network codes, keywords, HTTP status)
 * - createRetryHelper factory with default options
 */

vi.mock('../../src/utils/loggerHelpers', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarning: vi.fn(),
  logSimpleInfo: vi.fn(),
}));

import { retryAsync, isTransientError, createRetryHelper } from '../../src/utils/retry';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('isTransientError', () => {
  it('returns false for null/undefined', () => {
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
  });

  it('detects network error codes', () => {
    const codes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE', 'EAI_AGAIN'];
    for (const code of codes) {
      const err = new Error('fail');
      (err as any).code = code;
      expect(isTransientError(err)).toBe(true);
    }
  });

  it('detects transient keywords in error message', () => {
    const keywords = [
      'timeout occurred',
      'connection terminated unexpectedly',
      'connection refused by server',
      'network error detected',
      'socket hang up',
      'ECONNRESET in message',
      'ETIMEDOUT happened',
      'temporarily unavailable',
      'connection pool timeout',
      'transaction rollback',
    ];
    for (const msg of keywords) {
      expect(isTransientError(new Error(msg))).toBe(true);
    }
  });

  it('detects HTTP 5xx status codes as transient', () => {
    const err500 = new Error('server error');
    (err500 as any).statusCode = 500;
    expect(isTransientError(err500)).toBe(true);

    const err503 = new Error('service unavailable');
    (err503 as any).statusCode = 503;
    expect(isTransientError(err503)).toBe(true);
  });

  it('detects HTTP 429 (rate limit) as transient', () => {
    const err = new Error('too many requests');
    (err as any).statusCode = 429;
    expect(isTransientError(err)).toBe(true);
  });

  it('detects status via .status property as well', () => {
    const err = new Error('bad gateway');
    (err as any).status = 502;
    expect(isTransientError(err)).toBe(true);
  });

  it('returns false for non-transient errors', () => {
    expect(isTransientError(new Error('validation failed'))).toBe(false);
    expect(isTransientError(new Error('not found'))).toBe(false);
    expect(isTransientError(new Error('unauthorized'))).toBe(false);
  });

  it('returns false for HTTP 4xx (except 429)', () => {
    const err400 = new Error('bad request');
    (err400 as any).statusCode = 400;
    expect(isTransientError(err400)).toBe(false);

    const err404 = new Error('not found');
    (err404 as any).statusCode = 404;
    expect(isTransientError(err404)).toBe(false);
  });

  it('handles string errors', () => {
    expect(isTransientError('timeout occurred')).toBe(true);
    expect(isTransientError('some random error')).toBe(false);
  });
});

describe('retryAsync', () => {
  it('returns result on first attempt success (no retry needed)', async () => {
    const operation = vi.fn().mockResolvedValue('success');

    const promise = retryAsync(operation, { retries: 3, delayMs: 100, jobName: 'test' });
    const result = await promise;

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries on transient error and succeeds', async () => {
    const transientError = new Error('connection terminated');
    const operation = vi.fn()
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce('recovered');

    const promise = retryAsync(operation, { retries: 3, delayMs: 100, jobName: 'test' });

    // Advance past the first delay
    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;
    expect(result).toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('throws after max retries exceeded', async () => {
    const transientError = new Error('timeout');
    const operation = vi.fn().mockRejectedValue(transientError);

    const promise = retryAsync(operation, { retries: 2, delayMs: 100, factor: 2, jobName: 'test' });

    // Attach catch handler immediately to avoid unhandled rejection warnings
    const caughtPromise = promise.catch((e) => e);

    // First retry delay: 100ms
    await vi.advanceTimersByTimeAsync(100);
    // Second retry delay: 200ms (100 * 2)
    await vi.advanceTimersByTimeAsync(200);

    const error = await caughtPromise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('timeout');
    // 1 initial + 2 retries = 3 total
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-transient errors — fails immediately', async () => {
    const nonTransientError = new Error('validation failed');
    const operation = vi.fn().mockRejectedValue(nonTransientError);

    await expect(
      retryAsync(operation, { retries: 3, delayMs: 100, jobName: 'test' })
    ).rejects.toThrow('validation failed');

    // Only the initial attempt, no retries
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('aborts immediately if a non-transient error occurs during retry', async () => {
    const transientError = new Error('timeout');
    const nonTransientError = new Error('invalid input');

    const operation = vi.fn()
      .mockRejectedValueOnce(transientError)       // First attempt: transient
      .mockRejectedValueOnce(nonTransientError);    // Retry 1: non-transient

    const promise = retryAsync(operation, { retries: 3, delayMs: 100, jobName: 'test' });

    // Attach catch handler immediately to avoid unhandled rejection warnings
    const caughtPromise = promise.catch((e) => e);

    // Advance past first retry delay
    await vi.advanceTimersByTimeAsync(100);

    const error = await caughtPromise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('invalid input');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('applies exponential backoff with custom factor', async () => {
    const transientError = new Error('ECONNRESET');
    (transientError as any).code = 'ECONNRESET';

    const operation = vi.fn()
      .mockRejectedValueOnce(transientError)
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce('ok');

    const promise = retryAsync(operation, { retries: 3, delayMs: 100, factor: 3, jobName: 'test' });

    // Retry 1: delay = 100ms
    await vi.advanceTimersByTimeAsync(100);
    expect(operation).toHaveBeenCalledTimes(2);

    // Retry 2: delay = 100 * 3 = 300ms
    await vi.advanceTimersByTimeAsync(300);

    const result = await promise;
    expect(result).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('calls onRetry callback on each retry attempt', async () => {
    const transientError = new Error('timeout');
    const operation = vi.fn()
      .mockRejectedValueOnce(transientError)
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce('done');

    const onRetry = vi.fn();

    const promise = retryAsync(operation, {
      retries: 3,
      delayMs: 50,
      factor: 1,
      jobName: 'test',
      onRetry,
    });

    await vi.advanceTimersByTimeAsync(50); // retry 1
    await vi.advanceTimersByTimeAsync(50); // retry 2

    await promise;

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(1, transientError);
    expect(onRetry).toHaveBeenCalledWith(2, transientError);
  });

  it('uses default factor of 2 when not specified', async () => {
    const transientError = new Error('timeout');
    const operation = vi.fn()
      .mockRejectedValueOnce(transientError)
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce('ok');

    const promise = retryAsync(operation, { retries: 3, delayMs: 100, jobName: 'test' });

    // Retry 1: delay = 100ms
    await vi.advanceTimersByTimeAsync(100);
    expect(operation).toHaveBeenCalledTimes(2);

    // Retry 2: delay = 200ms (100 * 2 default factor)
    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;
    expect(result).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(3);
  });
});

describe('createRetryHelper', () => {
  it('creates a pre-configured retry function', async () => {
    const helper = createRetryHelper({ retries: 2, delayMs: 50, jobName: 'myJob' });

    const operation = vi.fn().mockResolvedValue('result');
    const result = await helper(operation);

    expect(result).toBe('result');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('allows overriding default options per call', async () => {
    const helper = createRetryHelper({ retries: 1, delayMs: 50, jobName: 'base' });

    const transientError = new Error('timeout');
    const operation = vi.fn()
      .mockRejectedValueOnce(transientError)
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce('ok');

    // Override retries to 3
    const promise = helper(operation, { retries: 3 });

    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;
    expect(result).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('uses sensible defaults (retries: 3, delayMs: 1000, factor: 2)', async () => {
    const helper = createRetryHelper({});

    const transientError = new Error('timeout');
    const operation = vi.fn().mockRejectedValue(transientError);

    const promise = helper(operation);

    // Attach catch handler immediately to avoid unhandled rejection warnings
    const caughtPromise = promise.catch((e) => e);

    // Exhaust all retries: 1000ms + 2000ms + 4000ms
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);

    const error = await caughtPromise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('timeout');
    // 1 initial + 3 retries = 4 calls
    expect(operation).toHaveBeenCalledTimes(4);
  });
});
