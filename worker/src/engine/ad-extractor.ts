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

  // Process, validate and filter
  const ads: ScrapedAd[] = [];
  const skippedReasons: Record<string, number> = {};

  const skip = (reason: string) => {
    skippedReasons[reason] = (skippedReasons[reason] || 0) + 1;
  };

  // Log FB location filter decision for observability
  const isFbStructured =
    config.site === 'FACEBOOK_MARKETPLACE' && monitor.mode === 'STRUCTURED_FILTERS';
  if (isFbStructured && rawAds.length > 0) {
    console.log(
      `FB_LOCATION_FILTER_SKIPPED: site=${config.site} mode=${monitor.mode} ` +
      `rawAds=${rawAds.length} reason=URL_is_authoritative_filter`
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

    // Location filter (best-effort: depends on site exposing ad.location)
    // For FACEBOOK_MARKETPLACE with STRUCTURED_FILTERS: skip post-process location filter.
    // Reason: FB uses span[dir="auto"] for ALL text (title, price, location), so querySelector
    // returns the title text, not the actual location. The URL (/marketplace/{city-slug}/) is
    // the authoritative location filter for Facebook — the post-filter is redundant and broken.
    if (monitor.country && !isFbStructured) {
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
