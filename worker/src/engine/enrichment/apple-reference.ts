/**
 * Apple Price Reference Matcher (V3)
 *
 * Normalizes ad titles and matches against the ApplePriceReference table.
 * If a match is found, returns the reference price for delta comparison.
 *
 * FAILSAFE: Never throws. Returns null on any error.
 */

import { prisma } from '../../lib/prisma';
import { logger } from '../../utils/logger';
import type { AppleReferenceMatch } from './score-types';

// ─── Cache ──────────────────────────────────────────────────────────────────

interface CachedRef {
  model: string;
  storage: string;
  referencePrice: number;
}

let refCache: CachedRef[] = [];
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

async function loadCache(): Promise<CachedRef[]> {
  const now = Date.now();
  if (refCache.length > 0 && (now - cacheLoadedAt) < CACHE_TTL_MS) {
    return refCache;
  }

  try {
    const refs = await prisma.applePriceReference.findMany({
      select: { model: true, storage: true, referencePrice: true },
    });
    refCache = refs;
    cacheLoadedAt = now;
    logger.info({ count: refs.length }, 'APPLE_REF_CACHE_LOADED');
    return refCache;
  } catch (error: any) {
    logger.warn({ error: error.message }, 'APPLE_REF_CACHE_LOAD_FAILED');
    return refCache; // return stale cache if available
  }
}

// ─── Title Normalization ────────────────────────────────────────────────────

/**
 * Extracts Apple product info from ad title.
 *
 * Examples:
 *   "iPhone 13 Pro 128GB IMPECÁVEL!"       → { model: "iphone 13 pro", storage: "128" }
 *   "Apple iPhone 14 Pro Max 256 GB Novo"   → { model: "iphone 14 pro max", storage: "256" }
 *   "iPhone 15 128gb usado"                 → { model: "iphone 15", storage: "128" }
 *   "Samsung Galaxy S23"                    → null (not Apple)
 */
function extractAppleInfo(title: string): { model: string; storage: string } | null {
  const lower = title.toLowerCase();

  // Must contain "iphone"
  if (!lower.includes('iphone')) return null;

  // Extract iPhone model: "iphone XX [pro] [max]"
  const modelMatch = lower.match(/iphone\s*(\d{1,2})\s*(pro\s*max|pro|plus|mini)?/);
  if (!modelMatch) return null;

  const version = modelMatch[1];
  const variant = modelMatch[2]?.trim() || '';
  const modelName = `iPhone ${version}${variant ? ' ' + variant.replace(/\s+/g, ' ').trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : ''}`;

  // Extract storage: "128gb", "256 gb", "512gb", "1 tb", "1tb"
  const storageMatch = lower.match(/(\d+)\s*(gb|tb)/);
  if (!storageMatch) return null;

  let storageVal = storageMatch[1];
  const unit = storageMatch[2].toUpperCase();
  const storage = `${storageVal} ${unit}`;

  return { model: modelName, storage };
}

// ─── Matcher ────────────────────────────────────────────────────────────────

/**
 * Matches an ad title against the Apple price reference table.
 *
 * @param title - Ad title (e.g. "iPhone 13 Pro 128GB usado")
 * @returns AppleReferenceMatch or null if no match
 */
export async function matchAppleReference(title: string): Promise<AppleReferenceMatch | null> {
  try {
    const extracted = extractAppleInfo(title);
    if (!extracted) return null;

    const refs = await loadCache();
    if (refs.length === 0) return null;

    // Normalize for comparison
    const normalizeModel = (m: string) => m.toLowerCase().replace(/\s+/g, ' ').trim();
    const normalizeStorage = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace('gb', '').replace('tb', '000').trim();

    const extractedModelNorm = normalizeModel(extracted.model);
    const extractedStorageNorm = normalizeStorage(extracted.storage);

    // Find exact match
    for (const ref of refs) {
      const refModelNorm = normalizeModel(ref.model);
      const refStorageNorm = normalizeStorage(ref.storage);

      if (refModelNorm === extractedModelNorm && refStorageNorm === extractedStorageNorm) {
        logger.info({
          title: title.substring(0, 60),
          matchedModel: ref.model,
          matchedStorage: ref.storage,
          referencePrice: ref.referencePrice,
        }, 'APPLE_REF_MATCHED');

        return {
          model: ref.model,
          storage: ref.storage,
          referencePrice: ref.referencePrice,
          confidence: 'HIGH',
        };
      }
    }

    // No match found
    logger.info({
      title: title.substring(0, 60),
      extractedModel: extracted.model,
      extractedStorage: extracted.storage,
      reason: 'no_match_in_reference_table',
    }, 'APPLE_REF_NO_MATCH');

    return null;
  } catch (error: any) {
    logger.warn({ error: error.message, title: title.substring(0, 60) }, 'APPLE_REF_MATCH_ERROR');
    return null;
  }
}

/**
 * Invalidates the cache (call after admin uploads new data).
 */
export function invalidateAppleRefCache(): void {
  refCache = [];
  cacheLoadedAt = 0;
}
