/**
 * FIPE Intelligence Layer — Main Engine
 *
 * Enriches vehicle ads with FIPE (Tabela FIPE) price data.
 * Uses parallelum.com.br free API for FIPE lookups.
 *
 * Pipeline:
 *   detectVehicleType() → extractVehicleSpecs() → resolveFipe() → buildEnrichment()
 *
 * Design principles:
 *   - NEVER blocks ad delivery: if FIPE fails, ad continues without enrichment
 *   - 3 confidence levels: HIGH (exact), MEDIUM (estimated), LOW (discarded)
 *   - Cache with 24h TTL to avoid API spam
 *   - Isolated module: does NOT touch scraping, scheduling, or anti-bot logic
 */

import { logger } from '../../utils/logger';
import type {
  VehicleType,
  VehicleSpecs,
  FipeResult,
  FipeEnrichment,
  FipeConfidence,
  FipeApiBrand,
  FipeApiModel,
  FipeApiYear,
  FipeApiPrice,
} from './fipe-types';
import { FIPE_TYPE_CODE } from './fipe-types';
import {
  VEHICLE_TYPE_PATTERNS,
  BRAND_PATTERNS,
  MODEL_PATTERNS,
  VERSION_PATTERNS,
  YEAR_PATTERN,
} from './fipe-dictionary';

// ─── Constants ──────────────────────────────────────────────────────────────

const FIPE_API_BASE = 'https://parallelum.com.br/fipe/api/v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const API_TIMEOUT_MS = 8000; // 8s timeout per API call
const MAX_ENRICHMENT_TIME_MS = 15000; // 15s total budget per ad

// ─── Cache ──────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const priceCache = new Map<string, CacheEntry<FipeResult | null>>();
const brandCache = new Map<string, CacheEntry<FipeApiBrand[]>>();
const modelCache = new Map<string, CacheEntry<FipeApiModel[]>>();

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.data;
}

function setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Periodic cache cleanup to prevent memory leak (runs every 6h) */
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function ensureCacheCleanup(): void {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const cache of [priceCache, brandCache, modelCache]) {
      for (const [key, entry] of cache) {
        if (now > entry.expiresAt) cache.delete(key);
      }
    }
  }, 6 * 60 * 60 * 1000);
  // Allow process to exit even if interval is active
  if (cleanupInterval.unref) cleanupInterval.unref();
}

// ─── API Helpers ────────────────────────────────────────────────────────────

async function fipeFetch<T>(path: string): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    const response = await fetch(`${FIPE_API_BASE}${path}`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      logger.warn({ path, status: response.status }, 'FIPE_API_ERROR');
      return null;
    }

    return await response.json() as T;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      logger.warn({ path }, 'FIPE_API_TIMEOUT');
    } else {
      logger.warn({ path, error: error.message }, 'FIPE_API_FETCH_ERROR');
    }
    return null;
  }
}

// ─── Step 1: Detect Vehicle Type ────────────────────────────────────────────

export function detectVehicleType(title: string): VehicleType | null {
  const lower = title.toLowerCase();

  for (const { type, patterns } of VEHICLE_TYPE_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(lower)) return type;
    }
  }

  return null;
}

// ─── Step 2: Extract Vehicle Specs ──────────────────────────────────────────

export function extractVehicleSpecs(title: string, type: VehicleType): VehicleSpecs | null {
  const lower = title.toLowerCase();

  // Extract year (required — abort if missing)
  const yearMatch = title.match(YEAR_PATTERN);
  if (!yearMatch) return null;
  const year = parseInt(yearMatch[1], 10);

  // Sanity: reject years too old or in the future
  const currentYear = new Date().getFullYear();
  if (year < 1990 || year > currentYear + 2) return null;

  // Extract brand
  let brand: string | null = null;
  for (const bp of BRAND_PATTERNS) {
    for (const pattern of bp.patterns) {
      if (pattern.test(lower)) {
        brand = bp.canonical;
        break;
      }
    }
    if (brand) break;
  }

  if (!brand) return null;

  // Extract model (prefer longer/more specific matches first)
  // Filter MODEL_PATTERNS by brand, then try each
  let model: string | null = null;
  const brandModels = MODEL_PATTERNS.filter((mp) => mp.brand === brand);

  // Sort by canonical length descending (longer = more specific, e.g., "Corolla Cross" before "Corolla")
  brandModels.sort((a, b) => b.canonical.length - a.canonical.length);

  for (const mp of brandModels) {
    for (const pattern of mp.patterns) {
      if (pattern.test(lower)) {
        model = mp.canonical;
        break;
      }
    }
    if (model) break;
  }

  if (!model) return null;

  // Extract version (optional — enriches confidence but not required)
  let version: string | undefined;
  for (const vp of VERSION_PATTERNS) {
    const match = lower.match(vp);
    if (match) {
      version = match[1];
      break;
    }
  }

  return { brand, model, version, year, type };
}

// ─── Step 3: Resolve FIPE Price ─────────────────────────────────────────────

/**
 * Fuzzy string similarity for matching FIPE API results.
 * Returns 0-1 score.
 */
function similarity(a: string, b: string): number {
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (la === lb) return 1;
  if (la.includes(lb) || lb.includes(la)) return 0.8;

  // Word overlap
  const wordsA = new Set(la.split(/\s+/));
  const wordsB = new Set(lb.split(/\s+/));
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  const total = Math.max(wordsA.size, wordsB.size);
  return total > 0 ? overlap / total : 0;
}

/**
 * Parse FIPE price string "R$ 135.000,00" → 135000
 */
function parseFipePrice(value: string): number {
  const cleaned = value
    .replace(/R\$\s*/i, '')
    .replace(/\./g, '')
    .replace(',', '.');
  return parseFloat(cleaned) || 0;
}

export async function resolveFipe(specs: VehicleSpecs): Promise<FipeResult | null> {
  const cacheKey = `${specs.brand}|${specs.model}|${specs.version || ''}|${specs.year}`;
  const cached = getCached(priceCache, cacheKey);
  if (cached !== undefined) return cached;

  ensureCacheCleanup();

  const typeCode = FIPE_TYPE_CODE[specs.type];

  try {
    // Step 3.1: Get brands
    const brandsKey = typeCode;
    let brands = getCached(brandCache, brandsKey);
    if (!brands) {
      const fetched = await fipeFetch<FipeApiBrand[]>(`/${typeCode}/marcas`);
      if (!fetched) {
        setCache(priceCache, cacheKey, null);
        return null;
      }
      brands = fetched;
      setCache(brandCache, brandsKey, brands);
    }

    // Find matching brand (fuzzy)
    const brandMatch = brands
      .map((b) => ({ ...b, score: similarity(b.nome, specs.brand) }))
      .filter((b) => b.score > 0.5)
      .sort((a, b) => b.score - a.score)[0];

    if (!brandMatch) {
      logger.debug({ brand: specs.brand }, 'FIPE_BRAND_NOT_FOUND');
      setCache(priceCache, cacheKey, null);
      return null;
    }

    // Step 3.2: Get models for brand
    const modelsKey = `${typeCode}|${brandMatch.codigo}`;
    let models = getCached(modelCache, modelsKey);
    if (!models) {
      const modelResponse = await fipeFetch<{ modelos: FipeApiModel[] }>(
        `/${typeCode}/marcas/${brandMatch.codigo}/modelos`
      );
      if (!modelResponse?.modelos) {
        setCache(priceCache, cacheKey, null);
        return null;
      }
      models = modelResponse.modelos;
      setCache(modelCache, modelsKey, models);
    }

    // Find matching model (fuzzy)
    // Build search string: model + version for better matching
    const searchStr = specs.version
      ? `${specs.model} ${specs.version}`
      : specs.model;

    const modelMatches = models
      .map((m) => ({ ...m, score: similarity(m.nome, searchStr) }))
      .filter((m) => m.score > 0.3)
      .sort((a, b) => b.score - a.score);

    if (modelMatches.length === 0) {
      logger.debug({ model: specs.model, brand: specs.brand }, 'FIPE_MODEL_NOT_FOUND');
      setCache(priceCache, cacheKey, null);
      return null;
    }

    // Determine confidence based on match quality
    const bestModel = modelMatches[0];
    const hasVersion = !!specs.version;
    let confidence: FipeConfidence;

    if (hasVersion && bestModel.score >= 0.7) {
      confidence = 'HIGH';
    } else if (bestModel.score >= 0.5) {
      confidence = 'MEDIUM';
    } else {
      confidence = 'LOW';
    }

    // LOW confidence = not reliable enough, abort
    if (confidence === 'LOW') {
      logger.debug({
        model: specs.model,
        bestMatch: bestModel.nome,
        score: bestModel.score,
      }, 'FIPE_LOW_CONFIDENCE_SKIP');
      setCache(priceCache, cacheKey, null);
      return null;
    }

    // Step 3.3: Get years for model
    const years = await fipeFetch<FipeApiYear[]>(
      `/${typeCode}/marcas/${brandMatch.codigo}/modelos/${bestModel.codigo}/anos`
    );

    if (!years || years.length === 0) {
      setCache(priceCache, cacheKey, null);
      return null;
    }

    // Find matching year
    // FIPE year codes look like "2022-1" (gasoline), "2022-2" (ethanol), "2022-3" (diesel)
    const yearStr = String(specs.year);
    const yearMatch = years.find((y) => y.codigo.startsWith(yearStr));

    if (!yearMatch) {
      logger.debug({ year: specs.year, available: years.map((y) => y.codigo) }, 'FIPE_YEAR_NOT_FOUND');
      setCache(priceCache, cacheKey, null);
      return null;
    }

    // Step 3.4: Get price
    const priceData = await fipeFetch<FipeApiPrice>(
      `/${typeCode}/marcas/${brandMatch.codigo}/modelos/${bestModel.codigo}/anos/${yearMatch.codigo}`
    );

    if (!priceData?.Valor) {
      setCache(priceCache, cacheKey, null);
      return null;
    }

    const fipePrice = parseFipePrice(priceData.Valor);
    if (fipePrice <= 0) {
      setCache(priceCache, cacheKey, null);
      return null;
    }

    const result: FipeResult = {
      price: fipePrice,
      confidence,
      label: `${priceData.Marca} ${priceData.Modelo} ${priceData.AnoModelo}`,
    };

    setCache(priceCache, cacheKey, result);

    logger.info({
      specs: `${specs.brand} ${specs.model} ${specs.version || ''} ${specs.year}`,
      fipePrice,
      confidence,
      fipeLabel: result.label,
    }, 'FIPE_RESOLVED');

    return result;
  } catch (error: any) {
    logger.warn({ error: error.message, specs: cacheKey }, 'FIPE_RESOLVE_ERROR');
    setCache(priceCache, cacheKey, null);
    return null;
  }
}

// ─── Step 4: Build Enrichment ───────────────────────────────────────────────

function buildEnrichment(adPrice: number, fipe: FipeResult): FipeEnrichment {
  const delta = adPrice - fipe.price;
  const ratio = fipe.price > 0 ? adPrice / fipe.price : 1;

  let classification: string;
  if (ratio < 0.9) {
    classification = 'BELOW_FIPE';
  } else if (ratio <= 1.1) {
    classification = 'FAIR_PRICE';
  } else {
    classification = 'ABOVE_FIPE';
  }

  return {
    price: fipe.price,
    confidence: fipe.confidence,
    label: fipe.label,
    delta,
    ratio,
    classification,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Main entry point: enriches a single ad with FIPE data.
 *
 * @returns FipeEnrichment or null (if not a vehicle, specs can't be extracted, or FIPE fails)
 *
 * FAILSAFE: This function NEVER throws. If anything fails, returns null.
 */
export async function enrichAdWithFipe(ad: {
  title: string;
  price?: number;
}): Promise<FipeEnrichment | null> {
  try {
    // Must have a price to compare
    if (!ad.price || ad.price <= 0) return null;

    // Step 1: Detect vehicle type
    const vehicleType = detectVehicleType(ad.title);
    if (!vehicleType) return null;

    // Step 2: Extract specs
    const specs = extractVehicleSpecs(ad.title, vehicleType);
    if (!specs) return null;

    // Step 3: Resolve FIPE (with timeout)
    const fipePromise = resolveFipe(specs);
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), MAX_ENRICHMENT_TIME_MS)
    );

    const fipe = await Promise.race([fipePromise, timeoutPromise]);
    if (!fipe) return null;

    // Step 4: Build enrichment
    return buildEnrichment(ad.price, fipe);
  } catch (error: any) {
    // FAILSAFE: never let FIPE break the pipeline
    logger.warn({ title: ad.title, error: error.message }, 'FIPE_ENRICHMENT_FAILED');
    return null;
  }
}

/**
 * Batch enrichment for multiple ads.
 * Processes sequentially to respect API rate limits.
 */
export async function enrichAdsWithFipe(
  ads: Array<{ title: string; price?: number }>
): Promise<Array<FipeEnrichment | null>> {
  const results: Array<FipeEnrichment | null> = [];

  for (const ad of ads) {
    const enrichment = await enrichAdWithFipe(ad);
    results.push(enrichment);
  }

  return results;
}

// ─── Formatting Helpers ─────────────────────────────────────────────────────

/**
 * Format FIPE enrichment for Telegram notification (HTML).
 */
export function formatFipeTelegram(fipe: FipeEnrichment): string {
  const fipeFormatted = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(fipe.price);

  const pctDiff = Math.round((fipe.ratio - 1) * 100);
  const pctSign = pctDiff >= 0 ? '+' : '';
  const pctStr = `${pctSign}${pctDiff}%`;

  let emoji: string;
  let classLabel: string;
  switch (fipe.classification) {
    case 'BELOW_FIPE':
      emoji = '\uD83D\uDD25'; // 🔥
      classLabel = 'abaixo da FIPE';
      break;
    case 'FAIR_PRICE':
      emoji = '\u2696\uFE0F'; // ⚖️
      classLabel = 'na média FIPE';
      break;
    case 'ABOVE_FIPE':
      emoji = '\uD83D\uDEA8'; // 🚨
      classLabel = 'acima da FIPE';
      break;
    default:
      emoji = '\uD83D\uDCCA'; // 📊
      classLabel = '';
  }

  const confidenceNote = fipe.confidence === 'MEDIUM' ? ' (estimado)' : '';

  return (
    `\n\uD83D\uDCCA <b>FIPE${confidenceNote}:</b> ${fipeFormatted}\n` +
    `${emoji} ${pctStr} ${classLabel}`
  );
}

/**
 * Format FIPE enrichment for Email notification (HTML).
 */
export function formatFipeEmail(fipe: FipeEnrichment): string {
  const fipeFormatted = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(fipe.price);

  const pctDiff = Math.round((fipe.ratio - 1) * 100);
  const pctSign = pctDiff >= 0 ? '+' : '';
  const pctStr = `${pctSign}${pctDiff}%`;

  let badgeColor: string;
  let classLabel: string;
  switch (fipe.classification) {
    case 'BELOW_FIPE':
      badgeColor = '#27ae60'; // green
      classLabel = 'Abaixo da FIPE';
      break;
    case 'FAIR_PRICE':
      badgeColor = '#f39c12'; // orange
      classLabel = 'Na Média FIPE';
      break;
    case 'ABOVE_FIPE':
      badgeColor = '#e74c3c'; // red
      classLabel = 'Acima da FIPE';
      break;
    default:
      badgeColor = '#95a5a6';
      classLabel = '';
  }

  const confidenceNote = fipe.confidence === 'MEDIUM' ? ' (estimado)' : '';

  return `
    <div style="background-color: #f0f7f0; border-left: 4px solid ${badgeColor}; padding: 12px; margin-top: 10px;">
      <p style="margin: 0; color: #666666; font-size: 12px; font-weight: 600;">TABELA FIPE${confidenceNote.toUpperCase()}</p>
      <p style="margin: 4px 0 0 0; color: #333333; font-size: 18px; font-weight: bold;">${fipeFormatted}</p>
      <p style="margin: 4px 0 0 0;">
        <span style="display: inline-block; background-color: ${badgeColor}; color: white; padding: 2px 8px; border-radius: 3px; font-size: 12px; font-weight: bold;">
          ${pctStr} ${classLabel}
        </span>
      </p>
    </div>
  `;
}

/**
 * Format FIPE enrichment for plain text (email fallback).
 */
export function formatFipeText(fipe: FipeEnrichment): string {
  const fipeFormatted = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(fipe.price);

  const pctDiff = Math.round((fipe.ratio - 1) * 100);
  const pctSign = pctDiff >= 0 ? '+' : '';
  const pctStr = `${pctSign}${pctDiff}%`;

  const confidenceNote = fipe.confidence === 'MEDIUM' ? ' (estimado)' : '';

  let classLabel: string;
  switch (fipe.classification) {
    case 'BELOW_FIPE': classLabel = 'ABAIXO DA FIPE'; break;
    case 'FAIR_PRICE': classLabel = 'NA MÉDIA FIPE'; break;
    case 'ABOVE_FIPE': classLabel = 'ACIMA DA FIPE'; break;
    default: classLabel = '';
  }

  return `📊 FIPE${confidenceNote}: ${fipeFormatted} (${pctStr} ${classLabel})`;
}
