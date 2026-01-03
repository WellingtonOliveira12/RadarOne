/**
 * Normaliza código de cupom para evitar problemas com acentos
 * - Remove espaços em branco
 * - Converte para uppercase
 * - Remove acentos/diacríticos
 *
 * Exemplo: "VITALÍCIO" → "VITALICIO"
 */
export function normalizeCouponCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
