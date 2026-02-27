import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for SimpleCache utility
 *
 * Cases tested:
 * - get/set basic operations
 * - TTL expiration (returns null after TTL)
 * - Cache miss (returns null for non-existent key)
 * - delete removes specific key
 * - clear removes all entries
 * - cleanup removes only expired entries
 * - size returns correct count
 * - Default TTL is 300 seconds (5 minutes)
 */

// We need to import the cache singleton. Since it sets up a setInterval on module load,
// we use fake timers to control it.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// Import after timer setup — the module-level setInterval will use fake timers.
import { cache } from '../../src/utils/cache';

describe('SimpleCache', () => {
  beforeEach(() => {
    cache.clear();
  });

  // =========================================
  // Basic get/set
  // =========================================

  it('set and get a value', () => {
    cache.set('key1', { name: 'test' }, 60);
    const result = cache.get<{ name: string }>('key1');
    expect(result).toEqual({ name: 'test' });
  });

  it('set overwrites existing key', () => {
    cache.set('key1', 'first', 60);
    cache.set('key1', 'second', 60);
    expect(cache.get('key1')).toBe('second');
  });

  it('stores different data types (string, number, object, array)', () => {
    cache.set('str', 'hello', 60);
    cache.set('num', 42, 60);
    cache.set('obj', { a: 1 }, 60);
    cache.set('arr', [1, 2, 3], 60);

    expect(cache.get('str')).toBe('hello');
    expect(cache.get('num')).toBe(42);
    expect(cache.get('obj')).toEqual({ a: 1 });
    expect(cache.get('arr')).toEqual([1, 2, 3]);
  });

  // =========================================
  // Cache miss
  // =========================================

  it('returns null for non-existent key', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  // =========================================
  // TTL expiration
  // =========================================

  it('returns value before TTL expires', () => {
    cache.set('ttl-key', 'alive', 10); // 10 seconds TTL

    // Advance 9 seconds — still within TTL
    vi.advanceTimersByTime(9_000);
    expect(cache.get('ttl-key')).toBe('alive');
  });

  it('returns null after TTL expires', () => {
    cache.set('ttl-key', 'alive', 10); // 10 seconds TTL

    // Advance 11 seconds — past TTL
    vi.advanceTimersByTime(11_000);
    expect(cache.get('ttl-key')).toBeNull();
  });

  it('removes expired entry from internal map on get', () => {
    cache.set('exp-key', 'data', 5);
    expect(cache.size()).toBe(1);

    vi.advanceTimersByTime(6_000);

    // get triggers deletion of expired entry
    cache.get('exp-key');
    expect(cache.size()).toBe(0);
  });

  it('uses default TTL of 300 seconds when none specified', () => {
    cache.set('default-ttl', 'value');

    // At 299 seconds — still alive
    vi.advanceTimersByTime(299_000);
    expect(cache.get('default-ttl')).toBe('value');

    // At 301 seconds — expired
    vi.advanceTimersByTime(2_000);
    expect(cache.get('default-ttl')).toBeNull();
  });

  // =========================================
  // delete
  // =========================================

  it('delete removes a specific key', () => {
    cache.set('a', 1, 60);
    cache.set('b', 2, 60);

    cache.delete('a');

    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBe(2);
  });

  it('delete on non-existent key does not throw', () => {
    expect(() => cache.delete('nope')).not.toThrow();
  });

  // =========================================
  // clear
  // =========================================

  it('clear removes all entries', () => {
    cache.set('x', 1, 60);
    cache.set('y', 2, 60);
    cache.set('z', 3, 60);

    cache.clear();

    expect(cache.size()).toBe(0);
    expect(cache.get('x')).toBeNull();
    expect(cache.get('y')).toBeNull();
    expect(cache.get('z')).toBeNull();
  });

  // =========================================
  // cleanup
  // =========================================

  it('cleanup removes only expired entries', () => {
    cache.set('short', 'a', 5);  // expires in 5s
    cache.set('long', 'b', 60);  // expires in 60s

    // Advance 10 seconds — 'short' expired, 'long' still valid
    vi.advanceTimersByTime(10_000);

    cache.cleanup();

    expect(cache.get('short')).toBeNull();
    expect(cache.get('long')).toBe('b');
    expect(cache.size()).toBe(1);
  });

  it('cleanup with no expired entries removes nothing', () => {
    cache.set('a', 1, 60);
    cache.set('b', 2, 60);

    cache.cleanup();

    expect(cache.size()).toBe(2);
  });

  // =========================================
  // size
  // =========================================

  it('size returns correct count', () => {
    expect(cache.size()).toBe(0);

    cache.set('a', 1, 60);
    expect(cache.size()).toBe(1);

    cache.set('b', 2, 60);
    expect(cache.size()).toBe(2);

    cache.delete('a');
    expect(cache.size()).toBe(1);
  });

  // =========================================
  // Module-level auto-cleanup interval
  // =========================================

  it('cleanup method correctly removes expired entries when called manually', () => {
    cache.set('auto-clean', 'data', 5); // 5 second TTL

    // Advance past TTL
    vi.advanceTimersByTime(6_000);

    // Entry is expired but still in the map (not yet cleaned)
    expect(cache.size()).toBe(1);

    // Manual cleanup removes expired entries
    cache.cleanup();
    expect(cache.size()).toBe(0);
  });
});
