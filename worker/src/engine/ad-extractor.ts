import { Page } from 'playwright';
import { ScrapedAd, SiteConfig, MonitorWithFilters } from './types';
import { findSelector } from './container-waiter';
import { matchLocation } from './location-matcher';

/**
 * Extracts ads from the page using the site config selectors.
 * Returns raw ads and skip reasons for metrics.
 */
export async function extractAds(
  page: Page,
  containerSelector: string,
  config: SiteConfig,
  monitor: MonitorWithFilters
): Promise<{
  ads: ScrapedAd[];
  adsRaw: number;
  skippedReasons: Record<string, number>;
}> {
  // Find best selectors for each field
  const titleResult = await findSelector(page, config.selectors.title);
  const priceResult = await findSelector(page, config.selectors.price);
  const linkResult = await findSelector(page, config.selectors.link);

  // Extract raw data from containers
  const rawAds = await page.$$eval(
    containerSelector,
    (elements, params) => {
      const { titleSel, priceSel, linkSel, locationSels, imageSels } = params;

      return elements.map((el) => {
        try {
          // Title
          let title = '';
          if (titleSel) {
            const titleEl = el.querySelector(titleSel);
            title = titleEl?.textContent?.trim() || '';
          }
          if (!title) {
            const h2 = el.querySelector('h2, h3');
            title = h2?.textContent?.trim() || '';
          }
          // Fallback for <a> containers (e.g. Facebook): grab first meaningful span
          if (!title && el.tagName === 'A') {
            const spans = Array.from(el.querySelectorAll('span'));
            for (let si = 0; si < spans.length; si++) {
              const t = spans[si].textContent?.trim() || '';
              if (t.length > 3 && t.length < 200 && !/^\d/.test(t) && !t.includes('R$')) {
                title = t;
                break;
              }
            }
          }

          // Price text (raw)
          let priceText = '';
          if (priceSel) {
            const priceEl = el.querySelector(priceSel);
            priceText = priceEl?.textContent?.trim() || '';
          }

          // URL — handle case where container element IS the <a> tag
          let url = '';
          if (el.tagName === 'A') {
            url = el.getAttribute('href') || '';
          } else {
            if (linkSel) {
              const linkEl = el.querySelector(linkSel);
              url = linkEl?.getAttribute('href') || '';
            }
            if (!url) {
              const firstLink = el.querySelector('a');
              url = firstLink?.getAttribute('href') || '';
            }
          }

          // Image
          let imageUrl = '';
          for (const imgSel of imageSels) {
            const imgEl = el.querySelector(imgSel);
            if (imgEl) {
              imageUrl =
                imgEl.getAttribute('src') ||
                imgEl.getAttribute('data-src') ||
                imgEl.getAttribute('data-lazy') ||
                '';
              if (imageUrl) break;
            }
          }

          // Location
          let location = '';
          // First try specific location selectors
          let foundViaSelector = false;
          for (const locSel of locationSels) {
            // Skip the generic span[dir="auto"] when container is <a> — it returns
            // the title, not location. Facebook uses this selector for ALL text.
            if (el.tagName === 'A' && locSel === 'span[dir="auto"]') continue;
            const locEl = el.querySelector(locSel);
            if (locEl?.textContent) {
              location = locEl.textContent.trim();
              foundViaSelector = true;
              break;
            }
          }
          // Fallback for <a> containers with no specific selector match (e.g., Facebook):
          // Scan spans backwards to find a short text that looks like a location.
          if (!foundViaSelector && el.tagName === 'A') {
            const allSpans = Array.from(el.querySelectorAll('span'));
            for (let si = allSpans.length - 1; si >= 0; si--) {
              const t = allSpans[si].textContent?.trim() || '';
              if (t.length >= 3 && t.length <= 40 && !t.includes('R$') && !/^\d/.test(t) && /[a-zA-ZÀ-ú]/.test(t)) {
                location = t;
                break;
              }
            }
          }

          return { title, priceText, url, imageUrl, location };
        } catch {
          return null;
        }
      }).filter((ad): ad is NonNullable<typeof ad> => ad !== null);
    },
    {
      titleSel: titleResult.selector,
      priceSel: priceResult.selector,
      linkSel: linkResult.selector,
      locationSels: config.selectors.location,
      imageSels: config.selectors.image,
    }
  );

  // Log raw extraction results for OLX diagnostic
  if (config.site === 'OLX') {
    console.log(
      `OLX_RAW_EXTRACTION: containerSelector="${containerSelector}" ` +
      `rawCount=${rawAds.length} ` +
      `titleSelector=${titleResult.selector || 'NONE'} ` +
      `priceSelector=${priceResult.selector || 'NONE'} ` +
      `linkSelector=${linkResult.selector || 'NONE'}`
    );
    // Log first 3 raw ads for inspection
    for (let i = 0; i < Math.min(3, rawAds.length); i++) {
      const ad = rawAds[i];
      console.log(
        `OLX_RAW_AD[${i}]: title="${ad.title?.substring(0, 60)}" ` +
        `price="${ad.priceText}" url="${ad.url?.substring(0, 80)}" ` +
        `location="${ad.location}"`
      );
    }
  }

  // Process, validate and filter
  const ads: ScrapedAd[] = [];
  const skippedReasons: Record<string, number> = {};

  const skip = (reason: string) => {
    skippedReasons[reason] = (skippedReasons[reason] || 0) + 1;
  };

  // Location filter strategies per site:
  // - Facebook STRUCTURED_FILTERS: SOFT state filter (FB location is heuristic/unreliable)
  // - OLX: STRICT filter (location is reliably extracted as "Cidade - UF")
  // - Other sites: full location match via location-matcher
  const isFbStructured =
    config.site === 'FACEBOOK_MARKETPLACE' && monitor.mode === 'STRUCTURED_FILTERS';
  const isOlxSite = config.site === 'OLX';

  const fbTargetState = isFbStructured ? (monitor.stateRegion?.trim().toUpperCase() || '') : '';
  const olxTargetState = isOlxSite ? (monitor.stateRegion?.trim().toUpperCase() || '') : '';
  const olxTargetCity = isOlxSite && monitor.city ? normalizeForComparison(monitor.city) : '';
  const olxRequiresLocation = isOlxSite && (!!olxTargetState || !!olxTargetCity);

  if (isOlxSite && rawAds.length > 0) {
    console.log(
      `OLX_LOCATION_RULE: mode=STRICT scope=${olxTargetCity ? 'city' : olxTargetState ? 'state' : 'country'} ` +
      `targetState=${olxTargetState || 'NONE'} targetCity=${olxTargetCity || 'NONE'} ` +
      `requiresLocation=${olxRequiresLocation}`
    );
  }
  if (isFbStructured && rawAds.length > 0) {
    console.log(
      `FB_LOCATION_SOFT_FILTER: site=${config.site} mode=${monitor.mode} ` +
      `rawAds=${rawAds.length} targetState=${fbTargetState || 'NONE'} ` +
      `policy=accept_same_state_or_unknown`
    );
  }

  for (const raw of rawAds) {
    // Normalize URL
    const url = config.urlNormalizer(raw.url);
    if (!url) {
      skip('no_url');
      continue;
    }

    // Extract external ID
    const externalId = config.externalIdExtractor(url);
    if (!externalId) {
      skip('no_external_id');
      continue;
    }

    // Title
    if (!raw.title) {
      skip('no_title');
      continue;
    }

    // Parse price
    const price = config.priceParser(raw.priceText);

    // Apply price filters
    if (monitor.priceMin && price > 0 && price < monitor.priceMin) {
      skip('price_below_min');
      continue;
    }
    if (monitor.priceMax && price > 0 && price > monitor.priceMax) {
      skip('price_above_max');
      continue;
    }

    // Location filter — strategy depends on site
    if (isOlxSite) {
      // OLX STRICT location filter.
      // OLX search via UI is national, so post-extraction filtering is the only way
      // to enforce location. If user configured state/city, ads MUST match.
      if (olxRequiresLocation) {
        const parsed = parseOlxLocation(raw.location);
        if (!parsed.state) {
          // Location unknown/absent — reject when state/city is required
          skip('olx_location_unknown');
          continue;
        }
        if (olxTargetState && parsed.state !== olxTargetState) {
          skip('olx_state_mismatch');
          continue;
        }
        if (olxTargetCity && parsed.city) {
          const normalizedParsedCity = normalizeForComparison(parsed.city);
          if (normalizedParsedCity !== olxTargetCity) {
            skip('olx_city_mismatch');
            continue;
          }
        } else if (olxTargetCity && !parsed.city) {
          // City required but not extractable — reject
          skip('olx_city_unknown');
          continue;
        }
      }
      // No state/city configured → accept all (Brasil inteiro)
    } else if (isFbStructured) {
      // Facebook STRUCTURED_FILTERS: SOFT state-level filter.
      // FB location extraction is heuristic — accept if unknown/matching.
      if (fbTargetState && raw.location) {
        const extractedState = extractBrazilianStateCode(raw.location);
        if (extractedState && extractedState !== fbTargetState) {
          skip('fb_state_mismatch');
          continue;
        }
      }
    } else if (monitor.country) {
      // Other sites: full location match (city/state/country)
      const locResult = matchLocation(raw.location, {
        country: monitor.country,
        stateRegion: monitor.stateRegion,
        city: monitor.city,
      });
      if (!locResult.match) {
        skip((locResult as { match: false; reason: string }).reason);
        continue;
      }
    }

    // Clean OLX location: strip concatenated date text and reconstruct clean "Cidade - UF"
    let cleanLocation = raw.location || undefined;
    let publishedAtHint: Date | undefined;
    if (isOlxSite && raw.location) {
      const parsed = parseOlxLocation(raw.location);
      if (parsed.city && parsed.state) {
        cleanLocation = `${parsed.city} - ${parsed.state}`;
        if (parsed.dateText) {
          publishedAtHint = parseOlxDateText(parsed.dateText);
        }
      }
    }

    ads.push({
      externalId,
      title: raw.title,
      price,
      url,
      imageUrl: raw.imageUrl || undefined,
      location: cleanLocation,
      publishedAt: publishedAtHint,
    });
  }

  return {
    ads,
    adsRaw: rawAds.length,
    skippedReasons,
  };
}

// Brazilian state codes (UF) — used for soft state-level filtering on Facebook
const BRAZILIAN_STATES = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
]);

/**
 * Extracts a Brazilian state code (UF) from a location string.
 *
 * Handles common formats from Facebook Marketplace:
 *   - "Uberlândia, MG"     → "MG"
 *   - "Goiânia, GO"        → "GO"
 *   - "Taguatinga, DF"     → "DF"
 *   - "São Paulo - SP"     → "SP"
 *   - "Rio de Janeiro"     → null (no state code)
 *   - ""                   → null
 *
 * Returns null if no valid state code can be extracted.
 */
function extractBrazilianStateCode(location: string): string | null {
  if (!location) return null;

  const trimmed = location.trim();

  // Pattern 1: "Cidade, UF" or "Cidade - UF" (most common from Facebook)
  const match = trimmed.match(/[,\-–]\s*([A-Z]{2})\s*$/);
  if (match && BRAZILIAN_STATES.has(match[1])) {
    return match[1];
  }

  // Pattern 2: Standalone "UF" (rare but possible)
  if (trimmed.length === 2 && BRAZILIAN_STATES.has(trimmed.toUpperCase())) {
    return trimmed.toUpperCase();
  }

  return null;
}

/**
 * Parses OLX location string into city, state, and optional date components.
 *
 * OLX format (from production logs):
 *   "São Paulo -  SP"                          → { city: "São Paulo", state: "SP", dateText: null }
 *   "São José dos Pinhais -  PRHoje, 12:12"    → { city: "São José dos Pinhais", state: "PR", dateText: "Hoje, 12:12" }
 *   "Curitiba -  PRHoje, 12:10"                → { city: "Curitiba", state: "PR", dateText: "Hoje, 12:10" }
 *   "Rio de Janeiro -  RJOntem, 19:09"         → { city: "Rio de Janeiro", state: "RJ", dateText: "Ontem, 19:09" }
 *   "Macapá -  AP23 de mar, 22:32"             → { city: "Macapá", state: "AP", dateText: "23 de mar, 22:32" }
 *   ""                                         → { city: null, state: null, dateText: null }
 */
function parseOlxLocation(location: string): { city: string | null; state: string | null; dateText: string | null } {
  if (!location || !location.trim()) return { city: null, state: null, dateText: null };

  const text = location.trim();

  // OLX pattern: "Cidade -  UF" or "Cidade - UFDateText..."
  // The UF is always 2 uppercase letters after " - " or " -  "
  // Date text (if any) is concatenated immediately after the UF code
  const match = text.match(/^(.+?)\s*-\s+([A-Z]{2})(.*)?$/);
  if (match && BRAZILIAN_STATES.has(match[2])) {
    const dateText = match[3]?.trim() || null;
    return {
      city: match[1].trim(),
      state: match[2],
      dateText,
    };
  }

  // Fallback: try to find UF anywhere followed by non-letter
  const ufMatch = text.match(/[,\-–]\s*([A-Z]{2})(?:[^A-Za-z]|$)/);
  if (ufMatch && BRAZILIAN_STATES.has(ufMatch[1])) {
    const cityPart = text.substring(0, text.indexOf(ufMatch[0])).trim();
    return {
      city: cityPart || null,
      state: ufMatch[1],
      dateText: null,
    };
  }

  return { city: null, state: null, dateText: null };
}

/**
 * Normalizes a city name for comparison (case-insensitive, accent-insensitive).
 *   "Goiânia" → "goiania"
 *   "São Paulo" → "sao paulo"
 */
function normalizeForComparison(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Parses OLX date text (extracted from location) into a Date.
 *
 * Handles:
 *   "Hoje, 19:26"          → today at 19:26
 *   "Ontem, 08:51"         → yesterday at 08:51
 *   "23 de mar, 22:32"     → March 23 at 22:32
 *   "5 de jan, 10:00"      → January 5 at 10:00
 *
 * Returns undefined if parsing fails.
 */
const OLX_MONTHS: Record<string, number> = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};

function parseOlxDateText(dateText: string): Date | undefined {
  if (!dateText) return undefined;

  const text = dateText.trim();
  const now = new Date();

  // "Hoje, HH:MM"
  const hojeMatch = text.match(/^Hoje,?\s*(\d{1,2}):(\d{2})$/i);
  if (hojeMatch) {
    const d = new Date(now);
    d.setHours(parseInt(hojeMatch[1], 10), parseInt(hojeMatch[2], 10), 0, 0);
    return d;
  }

  // "Ontem, HH:MM"
  const ontemMatch = text.match(/^Ontem,?\s*(\d{1,2}):(\d{2})$/i);
  if (ontemMatch) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    d.setHours(parseInt(ontemMatch[1], 10), parseInt(ontemMatch[2], 10), 0, 0);
    return d;
  }

  // "DD de MMM, HH:MM"
  const dateMatch = text.match(/^(\d{1,2})\s+de\s+(\w{3}),?\s*(\d{1,2}):(\d{2})$/i);
  if (dateMatch) {
    const month = OLX_MONTHS[dateMatch[2].toLowerCase()];
    if (month !== undefined) {
      const d = new Date(now.getFullYear(), month, parseInt(dateMatch[1], 10),
        parseInt(dateMatch[3], 10), parseInt(dateMatch[4], 10), 0, 0);
      // If date is in the future, it's from last year
      if (d > now) d.setFullYear(d.getFullYear() - 1);
      return d;
    }
  }

  return undefined;
}
