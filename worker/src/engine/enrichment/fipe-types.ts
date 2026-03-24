/**
 * FIPE Intelligence Layer — Type Definitions
 *
 * Types for vehicle detection, normalization, and FIPE price enrichment.
 */

export type VehicleType = 'CAR' | 'MOTORCYCLE' | 'TRUCK' | 'TRACTOR';

/** FIPE API vehicle type codes */
export const FIPE_TYPE_CODE: Record<VehicleType, string> = {
  CAR: 'carros',
  MOTORCYCLE: 'motos',
  TRUCK: 'caminhoes',
  TRACTOR: 'caminhoes', // FIPE groups tractors under trucks
};

export interface VehicleSpecs {
  brand: string;
  model: string;
  version?: string;
  year?: number;
  type: VehicleType;
}

export type FipeConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface FipeResult {
  price: number;
  confidence: FipeConfidence;
  label: string; // FIPE description (e.g., "Toyota Corolla Cross XRE 2.0 16V Flex Aut.")
}

export interface FipeEnrichment {
  price: number;
  confidence: FipeConfidence;
  label: string;
  delta: number;        // ad.price - fipe.price (negative = below FIPE)
  ratio: number;        // ad.price / fipe.price
  classification: string; // BELOW_FIPE | FAIR_PRICE | ABOVE_FIPE
}

/** Raw response from parallelum FIPE API */
export interface FipeApiBrand {
  codigo: string;
  nome: string;
}

export interface FipeApiModel {
  codigo: number;
  nome: string;
}

export interface FipeApiYear {
  codigo: string;
  nome: string;
}

export interface FipeApiPrice {
  Valor: string;           // "R$ 135.000,00"
  Marca: string;           // "Toyota"
  Modelo: string;          // "Corolla Cross XRE 2.0 16V Flex Aut."
  AnoModelo: number;       // 2022
  Combustivel: string;     // "Gasolina"
  CodigoFipe: string;      // "015521-0"
  MesReferencia: string;   // "março de 2026"
  TipoVeiculo: number;     // 1=car, 2=moto, 3=truck
  SiglaCombustivel: string; // "G"
}
