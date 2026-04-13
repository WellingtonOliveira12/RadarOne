/**
 * OLX Profile Parser — pure text-to-signals extraction.
 *
 * The OLX ad detail page exposes a small set of STABLE, human-readable
 * signals about the seller. These come from rendered text (not from
 * fragile CSS classes), which makes them resilient to CSS/class changes.
 *
 * Signals actually observed in production (2026-04, authenticated session):
 *
 *   • "Na OLX desde abril de 2026"              → year + month joined
 *   • "Último acesso há 39 min"                 → last-seen freshness
 *   • "Informações verificadas" followed by
 *     any of: E-mail | Telefone | Facebook |    → list of verified channels
 *     Identidade
 *   • "N avaliações"                            → ratings count (if exposed)
 *
 * What we deliberately DO NOT parse:
 *   • Seller name — regex extraction is fragile and the DOM position
 *     varies; not worth the risk.
 *   • Type (particular/profissional) — the "Plano Profissional" string
 *     shows up in the logged-in header even when the seller is NOT pro,
 *     so it is a known false positive and we skip it.
 *
 * Pure module: no Playwright, no I/O, trivial to unit-test.
 */

export interface OlxVerifications {
  email: boolean;
  phone: boolean;
  facebook: boolean;
  identity: boolean;
}

export interface OlxProfileSignals {
  /** Year the seller joined OLX, or null if not present. */
  yearJoined: number | null;
  /** Month name in Portuguese (lowercased), or null. */
  monthJoined: string | null;
  /** Last-seen text as shown ("39 min", "2 dias", "1 hora"). */
  lastSeenRaw: string | null;
  /** Verified communication channels exposed by the seller. */
  verifications: OlxVerifications;
  /** The "Informações verificadas" section is present on the page. */
  hasVerificationsSection: boolean;
  /** The seller has at least one rating on the platform. */
  hasRatings: boolean;
}

const VERIFICATIONS_SECTION_LABEL = 'Informações verificadas';
const VERIFICATIONS_BLOCK_CHARS = 400;

function emptyVerifications(): OlxVerifications {
  return { email: false, phone: false, facebook: false, identity: false };
}

export function emptyProfileSignals(): OlxProfileSignals {
  return {
    yearJoined: null,
    monthJoined: null,
    lastSeenRaw: null,
    verifications: emptyVerifications(),
    hasVerificationsSection: false,
    hasRatings: false,
  };
}

/**
 * Parses the OLX ad detail page `innerText` and returns structured signals.
 * Never throws. Missing fields come back as null/false.
 */
export function parseOlxProfileText(bodyText: string | null | undefined): OlxProfileSignals {
  const out = emptyProfileSignals();
  if (!bodyText) return out;

  const text = bodyText;

  // "Na OLX desde [mês] de [YYYY]" — e.g. "Na OLX desde abril de 2026"
  const since = text.match(/Na\s+OLX\s+desde\s+(?:([a-zç]+)\s+de\s+)?(\d{4})/i);
  if (since) {
    out.yearJoined = parseInt(since[2], 10);
    out.monthJoined = since[1] ? since[1].toLowerCase() : null;
  }

  // "Último acesso há <value>" — e.g. "39 min", "2 dias"
  const lastSeen = text.match(/[ÚU]ltimo\s+acesso\s+(?:h[áa])\s+([^\n|]+?)(?:\n|\||$)/i);
  if (lastSeen) {
    out.lastSeenRaw = lastSeen[1].trim();
  }

  // "Informações verificadas" block — inspect the next ~400 chars for labels.
  // The block is rendered as a flat list: "E-mail | Telefone | Facebook".
  const idx = text.indexOf(VERIFICATIONS_SECTION_LABEL);
  if (idx >= 0) {
    out.hasVerificationsSection = true;
    const block = text.substring(idx, idx + VERIFICATIONS_BLOCK_CHARS);
    out.verifications = {
      email: /\bE[-\s]?mail\b/i.test(block),
      phone: /\bTelefone\b/i.test(block),
      facebook: /\bFacebook\b/i.test(block),
      identity: /\bIdentidade\b/i.test(block),
    };
  }

  // Ratings: "N avaliação", "N avaliações", or "avaliaç" anywhere.
  // The "Este anunciante ainda não possui avaliações" copy also hits here,
  // which is why we look for a positive digit count first.
  const ratingsPositive = text.match(/(\d+)\s+avaliaç(?:ão|ões)/i);
  if (ratingsPositive && parseInt(ratingsPositive[1], 10) > 0) {
    out.hasRatings = true;
  } else if (/\bavaliaç(?:ão|ões)\b/i.test(text) && !/ainda\s+n[ãa]o\s+possui\s+avaliaç/i.test(text)) {
    out.hasRatings = true;
  }

  return out;
}

/** Count the number of verified channels exposed by the seller. */
export function countVerifications(v: OlxVerifications): number {
  return (v.email ? 1 : 0) + (v.phone ? 1 : 0) + (v.facebook ? 1 : 0) + (v.identity ? 1 : 0);
}

/**
 * How long the seller has been on the platform, in whole years.
 * Returns null when the signal is unavailable.
 */
export function yearsOnPlatform(signals: OlxProfileSignals, now: Date = new Date()): number | null {
  if (signals.yearJoined === null) return null;
  const diff = now.getUTCFullYear() - signals.yearJoined;
  return diff >= 0 ? diff : 0;
}
