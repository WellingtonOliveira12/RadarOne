/**
 * FIPE Intelligence Layer — Vehicle Dictionary
 *
 * Patterns for detecting vehicle types and normalizing brand/model from ad titles.
 * Sorted by frequency in Brazilian marketplaces.
 */

import type { VehicleType } from './fipe-types';

// ─── Vehicle Type Detection ─────────────────────────────────────────────────

interface TypePattern {
  type: VehicleType;
  patterns: RegExp[];
}

/**
 * Order matters: more specific patterns first.
 * Each regex is tested against lowercased title.
 */
export const VEHICLE_TYPE_PATTERNS: TypePattern[] = [
  {
    type: 'TRACTOR',
    patterns: [
      /\b(trator|trat[oó]r|colheitadeira|retroescavadeira|p[aá] carregadeira)\b/,
      /\b(massey\s*ferguson|john\s*deere|new\s*holland|valtra|case\s*ih)\b/,
      /\b(caterpillar\s*d|komatsu)\b/,
    ],
  },
  {
    type: 'TRUCK',
    patterns: [
      /\b(caminh[aã]o|cavalo\s*mec[aâ]nico|carreta|bi-?truck|truck)\b/,
      /\b(scania|volvo\s*f[hm]|daf|man\s*tg[xsa]|iveco\s*(stralis|tector|daily))\b/,
      /\b(mercedes[- ]?benz\s*(atego|axor|actros|accelo))\b/,
      /\b(vw\s*(constellation|delivery|worker)|ford\s*cargo)\b/,
    ],
  },
  {
    type: 'MOTORCYCLE',
    patterns: [
      /\b(moto|motocicleta|scooter|triciclo)\b/,
      /\b(cg\s*\d{2,3}|biz\s*\d{2,3}|fan\s*\d{2,3}|pop\s*\d{2,3}|bros\s*\d{2,3})\b/,
      /\b(cb\s*\d{2,3}|cbr\s*\d{2,3}|hornet|xre\s*\d{2,3}|pcx|sahara)\b/,
      /\b(factor|fazer\s*\d{2,3}|ybr|xtz|mt[- ]?\d{2}|r[13]\s*\d{2,3})\b/,
      /\b(ninja\s*\d{2,3}|z\d{3,4}|versys|vulcan)\b/,
      /\b(bmw\s*(gs|r\s*\d{3,4}|s\s*\d{3,4}))\b/,
      /\b(duke\s*\d{2,3}|royal\s*enfield|harley|triumph)\b/,
    ],
  },
  {
    type: 'CAR',
    patterns: [
      // Common car models (Brazilian market)
      /\b(sedan|hatch|suv|picape|pickup|minivan|perua|station\s*wagon|coup[eé]|conversivel)\b/,
      /\b(corolla|civic|gol|onix|hb20|creta|tracker|t-?cross|nivus|polo)\b/,
      /\b(kicks|renegade|compass|hilux|s10|ranger|toro|saveiro|strada)\b/,
      /\b(yaris|etios|ka|kwid|mobi|argo|cronos|virtus|jetta)\b/,
      /\b(tucson|sportage|outlander|rav4|cr[- ]?v|hr[- ]?v|wrv|zr[- ]?v)\b/,
      /\b(camaro|mustang|bmw\s*[1-8]|audi\s*(a[1-8]|q[2-8]|rs)|mercedes\s*(a|c|e|s|g)\s*\d{2,3})\b/,
      /\b(golf|tiguan|taos|amarok|land\s*rover|jeep|toyota|hyundai|honda|volkswagen|vw|chevrolet|fiat|ford|renault|nissan|peugeot|citro[eë]n)\b/,
    ],
  },
];

// ─── Brand Normalization ────────────────────────────────────────────────────

interface BrandPattern {
  canonical: string;
  patterns: RegExp[];
}

export const BRAND_PATTERNS: BrandPattern[] = [
  { canonical: 'Toyota', patterns: [/\btoyota\b/] },
  { canonical: 'Honda', patterns: [/\bhonda\b/] },
  { canonical: 'Hyundai', patterns: [/\bhyundai\b/] },
  { canonical: 'Volkswagen', patterns: [/\b(volkswagen|vw)\b/] },
  { canonical: 'Chevrolet', patterns: [/\b(chevrolet|gm)\b/] },
  { canonical: 'Fiat', patterns: [/\bfiat\b/] },
  { canonical: 'Ford', patterns: [/\bford\b/] },
  { canonical: 'Renault', patterns: [/\brenault\b/] },
  { canonical: 'Nissan', patterns: [/\bnissan\b/] },
  { canonical: 'Jeep', patterns: [/\bjeep\b/] },
  { canonical: 'Mitsubishi', patterns: [/\bmitsubishi\b/] },
  { canonical: 'Peugeot', patterns: [/\bpeugeot\b/] },
  { canonical: 'Citroën', patterns: [/\b(citro[eë]n|citroen)\b/] },
  { canonical: 'BMW', patterns: [/\bbmw\b/] },
  { canonical: 'Mercedes-Benz', patterns: [/\b(mercedes[- ]?benz|mercedes)\b/] },
  { canonical: 'Audi', patterns: [/\baudi\b/] },
  { canonical: 'Kia', patterns: [/\bkia\b/] },
  { canonical: 'Volvo', patterns: [/\bvolvo\b/] },
  { canonical: 'Land Rover', patterns: [/\bland\s*rover\b/] },
  { canonical: 'Suzuki', patterns: [/\bsuzuki\b/] },
  { canonical: 'Subaru', patterns: [/\bsubaru\b/] },
  { canonical: 'Yamaha', patterns: [/\byamaha\b/] },
  { canonical: 'Kawasaki', patterns: [/\bkawasaki\b/] },
  { canonical: 'Scania', patterns: [/\bscania\b/] },
  { canonical: 'DAF', patterns: [/\bdaf\b/] },
  { canonical: 'MAN', patterns: [/\bman\b/] },
  { canonical: 'Iveco', patterns: [/\biveco\b/] },
  { canonical: 'Massey Ferguson', patterns: [/\bmassey\s*ferguson\b/] },
  { canonical: 'John Deere', patterns: [/\bjohn\s*deere\b/] },
  { canonical: 'New Holland', patterns: [/\bnew\s*holland\b/] },
  { canonical: 'Caoa Chery', patterns: [/\b(caoa\s*chery|chery)\b/] },
  { canonical: 'BYD', patterns: [/\bbyd\b/] },
  { canonical: 'GWM', patterns: [/\bgwm\b/] },
  { canonical: 'RAM', patterns: [/\bram\b/] },
  { canonical: 'Dodge', patterns: [/\bdodge\b/] },
];

// ─── Model Normalization ────────────────────────────────────────────────────

interface ModelPattern {
  brand: string;
  canonical: string; // Canonical model name as FIPE expects
  patterns: RegExp[];
}

/**
 * Models mapped to their FIPE-expected canonical names.
 * Only top sellers per brand — covers ~80% of Brazilian market.
 */
export const MODEL_PATTERNS: ModelPattern[] = [
  // Toyota
  { brand: 'Toyota', canonical: 'Corolla', patterns: [/\bcorolla\b/] },
  { brand: 'Toyota', canonical: 'Corolla Cross', patterns: [/\bcorolla\s*cross\b/] },
  { brand: 'Toyota', canonical: 'Hilux', patterns: [/\bhilux\b/] },
  { brand: 'Toyota', canonical: 'SW4', patterns: [/\bsw4\b/] },
  { brand: 'Toyota', canonical: 'Yaris', patterns: [/\byaris\b/] },
  { brand: 'Toyota', canonical: 'RAV4', patterns: [/\brav\s*4\b/] },
  { brand: 'Toyota', canonical: 'Etios', patterns: [/\betios\b/] },

  // Honda
  { brand: 'Honda', canonical: 'Civic', patterns: [/\bcivic\b/] },
  { brand: 'Honda', canonical: 'City', patterns: [/\bcity\b/] },
  { brand: 'Honda', canonical: 'HR-V', patterns: [/\bhr[- ]?v\b/] },
  { brand: 'Honda', canonical: 'CR-V', patterns: [/\bcr[- ]?v\b/] },
  { brand: 'Honda', canonical: 'WR-V', patterns: [/\bwr[- ]?v\b/] },
  { brand: 'Honda', canonical: 'ZR-V', patterns: [/\bzr[- ]?v\b/] },
  { brand: 'Honda', canonical: 'Fit', patterns: [/\bfit\b/] },

  // Hyundai
  { brand: 'Hyundai', canonical: 'HB20', patterns: [/\bhb\s*20\b/] },
  { brand: 'Hyundai', canonical: 'Creta', patterns: [/\bcreta\b/] },
  { brand: 'Hyundai', canonical: 'Tucson', patterns: [/\btucson\b/] },
  { brand: 'Hyundai', canonical: 'Santa Fe', patterns: [/\bsanta\s*fe\b/] },
  { brand: 'Hyundai', canonical: 'HB20S', patterns: [/\bhb\s*20\s*s\b/] },

  // VW
  { brand: 'Volkswagen', canonical: 'Gol', patterns: [/\bgol\b/] },
  { brand: 'Volkswagen', canonical: 'Polo', patterns: [/\bpolo\b/] },
  { brand: 'Volkswagen', canonical: 'T-Cross', patterns: [/\bt[- ]?cross\b/] },
  { brand: 'Volkswagen', canonical: 'Nivus', patterns: [/\bnivus\b/] },
  { brand: 'Volkswagen', canonical: 'Virtus', patterns: [/\bvirtus\b/] },
  { brand: 'Volkswagen', canonical: 'Taos', patterns: [/\btaos\b/] },
  { brand: 'Volkswagen', canonical: 'Tiguan', patterns: [/\btiguan\b/] },
  { brand: 'Volkswagen', canonical: 'Saveiro', patterns: [/\bsaveiro\b/] },
  { brand: 'Volkswagen', canonical: 'Amarok', patterns: [/\bamarok\b/] },
  { brand: 'Volkswagen', canonical: 'Voyage', patterns: [/\bvoyage\b/] },
  { brand: 'Volkswagen', canonical: 'Fox', patterns: [/\bfox\b/] },
  { brand: 'Volkswagen', canonical: 'Jetta', patterns: [/\bjetta\b/] },
  { brand: 'Volkswagen', canonical: 'Golf', patterns: [/\bgolf\b/] },

  // Chevrolet
  { brand: 'Chevrolet', canonical: 'Onix', patterns: [/\bonix\b/] },
  { brand: 'Chevrolet', canonical: 'Onix Plus', patterns: [/\bonix\s*plus\b/] },
  { brand: 'Chevrolet', canonical: 'Tracker', patterns: [/\btracker\b/] },
  { brand: 'Chevrolet', canonical: 'S10', patterns: [/\bs[- ]?10\b/] },
  { brand: 'Chevrolet', canonical: 'Spin', patterns: [/\bspin\b/] },
  { brand: 'Chevrolet', canonical: 'Montana', patterns: [/\bmontana\b/] },
  { brand: 'Chevrolet', canonical: 'Equinox', patterns: [/\bequinox\b/] },
  { brand: 'Chevrolet', canonical: 'Cruze', patterns: [/\bcruze\b/] },
  { brand: 'Chevrolet', canonical: 'Prisma', patterns: [/\bprisma\b/] },
  { brand: 'Chevrolet', canonical: 'Celta', patterns: [/\bcelta\b/] },
  { brand: 'Chevrolet', canonical: 'Camaro', patterns: [/\bcamaro\b/] },

  // Fiat
  { brand: 'Fiat', canonical: 'Strada', patterns: [/\bstrada\b/] },
  { brand: 'Fiat', canonical: 'Argo', patterns: [/\bargo\b/] },
  { brand: 'Fiat', canonical: 'Mobi', patterns: [/\bmobi\b/] },
  { brand: 'Fiat', canonical: 'Toro', patterns: [/\btoro\b/] },
  { brand: 'Fiat', canonical: 'Pulse', patterns: [/\bpulse\b/] },
  { brand: 'Fiat', canonical: 'Fastback', patterns: [/\bfastback\b/] },
  { brand: 'Fiat', canonical: 'Cronos', patterns: [/\bcronos\b/] },
  { brand: 'Fiat', canonical: 'Uno', patterns: [/\buno\b/] },
  { brand: 'Fiat', canonical: 'Palio', patterns: [/\bpalio\b/] },
  { brand: 'Fiat', canonical: 'Siena', patterns: [/\bsiena\b/] },
  { brand: 'Fiat', canonical: 'Ducato', patterns: [/\bducato\b/] },

  // Ford
  { brand: 'Ford', canonical: 'Ranger', patterns: [/\branger\b/] },
  { brand: 'Ford', canonical: 'Territory', patterns: [/\bterritory\b/] },
  { brand: 'Ford', canonical: 'Bronco', patterns: [/\bbronco\b/] },
  { brand: 'Ford', canonical: 'Maverick', patterns: [/\bmaverick\b/] },
  { brand: 'Ford', canonical: 'Ka', patterns: [/\bka\b/] },
  { brand: 'Ford', canonical: 'EcoSport', patterns: [/\becosport\b/] },
  { brand: 'Ford', canonical: 'Mustang', patterns: [/\bmustang\b/] },

  // Renault
  { brand: 'Renault', canonical: 'Kwid', patterns: [/\bkwid\b/] },
  { brand: 'Renault', canonical: 'Duster', patterns: [/\bduster\b/] },
  { brand: 'Renault', canonical: 'Sandero', patterns: [/\bsandero\b/] },
  { brand: 'Renault', canonical: 'Oroch', patterns: [/\boroch\b/] },
  { brand: 'Renault', canonical: 'Captur', patterns: [/\bcaptur\b/] },
  { brand: 'Renault', canonical: 'Logan', patterns: [/\blogan\b/] },

  // Nissan
  { brand: 'Nissan', canonical: 'Kicks', patterns: [/\bkicks\b/] },
  { brand: 'Nissan', canonical: 'Frontier', patterns: [/\bfrontier\b/] },
  { brand: 'Nissan', canonical: 'Versa', patterns: [/\bversa\b/] },
  { brand: 'Nissan', canonical: 'Sentra', patterns: [/\bsentra\b/] },

  // Jeep
  { brand: 'Jeep', canonical: 'Renegade', patterns: [/\brenegade\b/] },
  { brand: 'Jeep', canonical: 'Compass', patterns: [/\bcompass\b/] },
  { brand: 'Jeep', canonical: 'Commander', patterns: [/\bcommander\b/] },

  // Motorcycles (Honda)
  { brand: 'Honda', canonical: 'CG 160', patterns: [/\bcg\s*160\b/] },
  { brand: 'Honda', canonical: 'CG 150', patterns: [/\bcg\s*150\b/] },
  { brand: 'Honda', canonical: 'Biz 125', patterns: [/\bbiz\s*125\b/] },
  { brand: 'Honda', canonical: 'Biz 110', patterns: [/\bbiz\s*110\b/] },
  { brand: 'Honda', canonical: 'Bros 160', patterns: [/\bbros\s*160\b/] },
  { brand: 'Honda', canonical: 'CB 500', patterns: [/\bcb\s*500\b/] },
  { brand: 'Honda', canonical: 'CB 300', patterns: [/\bcb\s*300\b/] },
  { brand: 'Honda', canonical: 'CBR 650', patterns: [/\bcbr\s*650\b/] },
  { brand: 'Honda', canonical: 'XRE 300', patterns: [/\bxre\s*300\b/] },
  { brand: 'Honda', canonical: 'XRE 190', patterns: [/\bxre\s*190\b/] },
  { brand: 'Honda', canonical: 'PCX', patterns: [/\bpcx\b/] },
  { brand: 'Honda', canonical: 'Pop 110', patterns: [/\bpop\s*110\b/] },

  // Motorcycles (Yamaha)
  { brand: 'Yamaha', canonical: 'Fazer 250', patterns: [/\bfazer\s*250\b/] },
  { brand: 'Yamaha', canonical: 'Factor 150', patterns: [/\bfactor\s*150\b/] },
  { brand: 'Yamaha', canonical: 'MT-03', patterns: [/\bmt[- ]?03\b/] },
  { brand: 'Yamaha', canonical: 'MT-07', patterns: [/\bmt[- ]?07\b/] },
  { brand: 'Yamaha', canonical: 'MT-09', patterns: [/\bmt[- ]?09\b/] },
  { brand: 'Yamaha', canonical: 'XTZ 250', patterns: [/\bxtz\s*250\b/] },
  { brand: 'Yamaha', canonical: 'Crosser 150', patterns: [/\bcrosser\s*150\b/] },
  { brand: 'Yamaha', canonical: 'R3', patterns: [/\br3\b/] },

  // BYD / Chinese brands
  { brand: 'BYD', canonical: 'Dolphin', patterns: [/\bdolphin\b/] },
  { brand: 'BYD', canonical: 'Song Plus', patterns: [/\bsong\s*plus\b/] },
  { brand: 'BYD', canonical: 'Yuan Plus', patterns: [/\byuan\s*plus\b/] },
  { brand: 'GWM', canonical: 'Haval H6', patterns: [/\bhaval\s*h6\b/] },
  { brand: 'Caoa Chery', canonical: 'Tiggo 5x', patterns: [/\btiggo\s*5\s*x?\b/] },
  { brand: 'Caoa Chery', canonical: 'Tiggo 7', patterns: [/\btiggo\s*7\b/] },
  { brand: 'Caoa Chery', canonical: 'Tiggo 8', patterns: [/\btiggo\s*8\b/] },
];

// ─── Version Extraction Patterns ────────────────────────────────────────────

/**
 * Common version/trim suffixes found in Brazilian ads.
 * Extracted AFTER brand+model to refine FIPE match.
 */
export const VERSION_PATTERNS: RegExp[] = [
  // Engine displacement
  /\b(\d\.\d)\s*(?:t(?:urbo)?|flex|tsi|tdi|hdi|tfsi)?\b/,
  // Trim levels
  /\b(lx|ex|exl|xls|xlt|xle|xei|xre|xrs|gli|gls|sr|se|sel|limited|sport|adventure|endurance|freedom|ranch|volcano|ultra|premiere|prime|lt|ls|ltz|activ)\b/i,
  // Specific patterns
  /\b(automático|automatico|manual|cvt|at|mt)\b/i,
];

/**
 * Year extraction pattern.
 * Matches: 2020, 2024/2025, 20/21, etc.
 */
export const YEAR_PATTERN = /\b(20[0-2]\d)(?:\s*[/\\]\s*(?:20)?[0-2]\d)?\b/;
