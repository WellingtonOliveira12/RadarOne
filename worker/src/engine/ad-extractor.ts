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

  // Determine filter strategy for Facebook STRUCTURED_FILTERS
  const isFbStructured =
    config.site === 'FACEBOOK_MARKETPLACE' && monitor.mode === 'STRUCTURED_FILTERS';

  // For FB STRUCTURED_FILTERS: use soft state-level filter instead of full location match.
  // Reason: FB uses span[dir="auto"] for ALL text, so the generic location selector returns
  // the title (not the location). However, the reverse-scan heuristic does extract "Cidade, UF"
  // in many cases — we can use the UF (state code) for a soft filter.
  // Policy: accept if (a) no location extracted, (b) state matches, (c) state not determinable.
  //         reject only if state is clearly different from monitor's stateRegion.
  const fbTargetState = isFbStructured ? (monitor.stateRegion?.trim().toUpperCase() || '') : '';
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

    // Location filter — strategy depends on site + mode
    if (isFbStructured) {
      // Facebook STRUCTURED_FILTERS: soft state-level filter.
      // Only reject ads where the extracted location clearly shows a different state.
      // Location format from FB heuristic: "Cidade, UF" (e.g., "Uberlândia, MG")
      if (fbTargetState && raw.location) {
        const extractedState = extractBrazilianStateCode(raw.location);
        if (extractedState && extractedState !== fbTargetState) {
          skip('fb_state_mismatch');
          continue;
        }
        // extractedState === null means we couldn't parse → accept (don't block)
        // extractedState === fbTargetState → accept
      }
      // No location or no target state → accept
    } else if (monitor.country) {
      // Non-Facebook sites: full location match (city/state/country)
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

    ads.push({
      externalId,
      title: raw.title,
      price,
      url,
      imageUrl: raw.imageUrl || undefined,
      location: raw.location || undefined,
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
