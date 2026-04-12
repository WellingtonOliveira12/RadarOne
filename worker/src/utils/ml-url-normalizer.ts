/**
 * Mercado Livre search URL normalizer.
 *
 * ML historically exposed filter segments that behaved as "today-only" hacks,
 * most notably `_PublishedToday_YES` (and its companion `_NoIndex_True`).
 * As of 2026-04, these segments no longer surface freshly-published ads
 * reliably — the platform started hiding/delaying indexing of new listings
 * behind them. Using them now shrinks the result set without the freshness
 * benefit they used to provide.
 *
 * Strategy: strip these segments from the searchUrl BEFORE navigation. The
 * RadarOne pipeline already treats "new" as "externalId not yet seen by this
 * monitor (or sibling monitors)" via AdsSeen, so we no longer depend on
 * platform-side freshness filtering.
 *
 * Idempotent: safe to apply multiple times. Safe on non-ML URLs (no-op).
 */

const HACK_SEGMENTS = [
  '_PublishedToday_YES',
  '_NoIndex_True',
];

/**
 * Removes ML hack segments from a search URL path.
 * Example:
 *   https://lista.mercadolivre.com.br/iphone-13_PublishedToday_YES_NoIndex_True
 *   → https://lista.mercadolivre.com.br/iphone-13
 *
 * Also strips when the segment appears mid-path before query/hash:
 *   .../iphone-13_PublishedToday_YES_PriceRange_1000-2000
 *   → .../iphone-13_PriceRange_1000-2000
 */
export function stripMlHackSegments(rawUrl: string): string {
  if (!rawUrl) return rawUrl;

  let out = rawUrl;
  for (const seg of HACK_SEGMENTS) {
    // Remove both standalone and embedded occurrences, preserving the rest.
    // The segments are separated by `_` in ML's URL DSL.
    out = out.split(seg).join('');
  }

  // Collapse accidental double underscores introduced by mid-path removal
  // (e.g. `_PriceRange__Foo` → `_PriceRange_Foo`).
  out = out.replace(/_{2,}/g, '_');

  // Trim trailing underscore before query/hash or end-of-string
  out = out.replace(/_+(\?|#|$)/g, '$1');

  return out;
}

/** Returns true when the URL still contains any ML hack segment. */
export function hasMlHackSegments(rawUrl: string): boolean {
  if (!rawUrl) return false;
  return HACK_SEGMENTS.some((seg) => rawUrl.includes(seg));
}
