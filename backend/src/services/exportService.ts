/**
 * FASE 4.3 - Export Service
 * Serviço para exportação de dados em CSV
 *
 * Responsabilidades:
 * - Gerar CSV de qualquer array de dados
 * - Formatação de datas, moedas e tipos especiais
 * - Headers amigáveis em português
 * - Escape de caracteres especiais
 */

/**
 * Converte um array de objetos em CSV
 *
 * @param data - Array de objetos para exportar
 * @param headers - Mapa de campo -> label (ex: { id: 'ID', name: 'Nome' })
 * @param filename - Nome do arquivo (sem extensão)
 * @returns String CSV formatada
 */
export function generateCSV<T>(
  data: T[],
  headers: Record<string, string>,
  filename: string = 'export'
): { csv: string; filename: string } {
  if (data.length === 0) {
    return {
      csv: Object.values(headers).join(','),
      filename: `${filename}.csv`,
    };
  }

  const fields = Object.keys(headers);
  const headerRow = Object.values(headers).join(',');

  const rows = data.map((item) => {
    return fields
      .map((field) => {
        const value = (item as any)[field];
        return formatCSVValue(value);
      })
      .join(',');
  });

  const csv = [headerRow, ...rows].join('\n');

  return {
    csv,
    filename: `${filename}.csv`,
  };
}

/**
 * Formata um valor para CSV
 * - Escapa aspas duplas
 * - Adiciona aspas se necessário
 * - Formata datas
 * - Converte booleans
 * - Trata nulls
 */
function formatCSVValue(value: any): string {
  // Null/undefined
  if (value === null || value === undefined) {
    return '';
  }

  // Boolean
  if (typeof value === 'boolean') {
    return value ? 'Sim' : 'Não';
  }

  // Date
  if (value instanceof Date) {
    return formatDateBR(value);
  }

  // String de data ISO
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return formatDateBR(new Date(value));
  }

  // Array
  if (Array.isArray(value)) {
    return `"${value.join('; ')}"`;
  }

  // Object
  if (typeof value === 'object') {
    return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
  }

  // String com caracteres especiais
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Formata data para padrão brasileiro
 */
function formatDateBR(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Formata moeda em centavos para Real
 */
export function formatCurrency(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

/**
 * Gera timestamp para nome de arquivo
 */
export function getTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  return `${year}${month}${day}_${hours}${minutes}`;
}
