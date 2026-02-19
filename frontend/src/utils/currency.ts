/**
 * Utilitário de conversão de moeda para exibição de preços
 *
 * Regras:
 * - PT-BR → BRL (R$)
 * - EN e ES → USD ($)
 * - Taxa fixa: 1 USD = 5 BRL
 * - Apenas exibição (não altera lógica de checkout)
 */

const USD_RATE = 5; // 1 USD = 5 BRL

export type CurrencyCode = 'BRL' | 'USD';

interface PriceDisplay {
  /** Valor formatado (ex: "R$ 29" ou "$ 5.80") */
  formatted: string;
  /** Código da moeda */
  currency: CurrencyCode;
  /** Sufixo de período traduzido (ex: "/mês", "/month", "/mes") */
  suffix: string;
  /** Valor numérico na moeda de exibição */
  value: number;
}

/**
 * Determina a moeda com base no idioma ativo
 */
export function getCurrencyForLang(lang: string): CurrencyCode {
  if (lang.startsWith('pt')) return 'BRL';
  return 'USD';
}

/**
 * Converte valor de BRL para USD (taxa fixa)
 * Sempre retorna com 2 casas decimais
 */
export function convertBRLtoUSD(amountBRL: number): number {
  return Math.round((amountBRL / USD_RATE) * 100) / 100;
}

/**
 * Formata um valor monetário
 */
export function formatMoney(value: number, currency: CurrencyCode): string {
  if (currency === 'BRL') {
    // BRL: sem casas decimais para preços inteiros (R$ 29, R$ 49)
    return `R$ ${value.toFixed(0)}`;
  }
  // USD: sempre 2 casas ($ 5.80, $ 9.80)
  return `$ ${value.toFixed(2)}`;
}

/**
 * Retorna o sufixo de período por idioma
 */
export function getPeriodSuffix(lang: string): string {
  if (lang.startsWith('pt')) return '/mês';
  if (lang.startsWith('es')) return '/mes';
  return '/month';
}

/**
 * Formata o preço de um plano para exibição conforme idioma ativo
 *
 * @param priceCents - Preço em centavos de BRL (fonte de verdade do DB)
 * @param lang - Idioma ativo do i18next (pt-BR, en, es)
 * @returns Objeto com valor formatado, moeda e sufixo
 */
export function formatPlanPrice(priceCents: number, lang: string): PriceDisplay {
  const currency = getCurrencyForLang(lang);
  const brlValue = priceCents / 100;

  if (currency === 'USD') {
    const usdValue = convertBRLtoUSD(brlValue);
    return {
      formatted: formatMoney(usdValue, 'USD'),
      currency: 'USD',
      suffix: getPeriodSuffix(lang),
      value: usdValue,
    };
  }

  return {
    formatted: formatMoney(brlValue, 'BRL'),
    currency: 'BRL',
    suffix: getPeriodSuffix(lang),
    value: brlValue,
  };
}

/**
 * Formata desconto fixo (em centavos BRL) para moeda ativa
 */
export function formatDiscountValue(valueCents: number, lang: string): string {
  const currency = getCurrencyForLang(lang);
  if (currency === 'USD') {
    const usdValue = convertBRLtoUSD(valueCents / 100);
    return `$ ${usdValue.toFixed(2)}`;
  }
  return `R$ ${(valueCents / 100).toFixed(2)}`;
}
