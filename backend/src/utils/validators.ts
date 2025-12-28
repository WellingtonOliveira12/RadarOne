/**
 * Utilitários de Validação
 * Funções reutilizáveis para validar dados de entrada
 */

/**
 * Resultado de validação
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  value?: any;
}

/**
 * Valida e normaliza email
 * - Remove espaços em branco
 * - Converte para lowercase
 * - Valida formato básico (regex)
 *
 * @param email Email para validar
 * @returns ValidationResult com email normalizado ou erro
 */
export function validateEmail(email: string): ValidationResult {
  // Trim e lowercase
  const normalized = email?.trim().toLowerCase();

  // Verificar se está vazio
  if (!normalized) {
    return {
      valid: false,
      error: 'Email é obrigatório'
    };
  }

  // Regex básico para email (RFC 5322 simplificado)
  // Aceita: local@domain.com, local.name+tag@sub.domain.co.uk, etc
  const emailRegex = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

  if (!emailRegex.test(normalized)) {
    return {
      valid: false,
      error: 'Formato de email inválido'
    };
  }

  // Validação adicional: verificar comprimento
  if (normalized.length > 254) {
    return {
      valid: false,
      error: 'Email muito longo (máximo 254 caracteres)'
    };
  }

  return {
    valid: true,
    value: normalized
  };
}

/**
 * Valida força da senha
 * Regras:
 * - Mínimo 8 caracteres
 * - Pelo menos 1 letra
 * - Pelo menos 1 número
 *
 * @param password Senha para validar
 * @returns ValidationResult com erro se inválida
 */
export function validatePassword(password: string): ValidationResult {
  // Verificar se está vazio
  if (!password) {
    return {
      valid: false,
      error: 'Senha é obrigatória'
    };
  }

  // Mínimo 8 caracteres
  if (password.length < 8) {
    return {
      valid: false,
      error: 'Senha deve ter no mínimo 8 caracteres'
    };
  }

  // Máximo razoável (prevenir ataques DoS)
  if (password.length > 128) {
    return {
      valid: false,
      error: 'Senha muito longa (máximo 128 caracteres)'
    };
  }

  // Pelo menos 1 letra
  if (!/[a-zA-Z]/.test(password)) {
    return {
      valid: false,
      error: 'Senha deve conter pelo menos 1 letra'
    };
  }

  // Pelo menos 1 número
  if (!/[0-9]/.test(password)) {
    return {
      valid: false,
      error: 'Senha deve conter pelo menos 1 número'
    };
  }

  return {
    valid: true,
    value: password
  };
}

/**
 * Valida URL
 * - Aceita apenas http:// ou https://
 * - Verifica formato básico
 * - Rejeita URLs com espaços, malformadas, etc
 *
 * @param url URL para validar
 * @returns ValidationResult com URL normalizada ou erro
 */
export function validateUrl(url: string): ValidationResult {
  // Trim
  const trimmed = url?.trim();

  // Verificar se está vazio
  if (!trimmed) {
    return {
      valid: false,
      error: 'URL é obrigatória'
    };
  }

  // Verificar se começa com http:// ou https://
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return {
      valid: false,
      error: 'URL deve começar com http:// ou https://'
    };
  }

  // Verificar se tem espaços (URLs válidas não têm espaços)
  if (/\s/.test(trimmed)) {
    return {
      valid: false,
      error: 'URL não pode conter espaços'
    };
  }

  // Tentar construir URL para validar formato
  try {
    const urlObj = new URL(trimmed);

    // Verificar se tem hostname
    if (!urlObj.hostname) {
      return {
        valid: false,
        error: 'URL inválida: domínio não encontrado'
      };
    }

    // Validação adicional: verificar comprimento razoável
    if (trimmed.length > 2048) {
      return {
        valid: false,
        error: 'URL muito longa (máximo 2048 caracteres)'
      };
    }

    return {
      valid: true,
      value: trimmed
    };
  } catch (error) {
    return {
      valid: false,
      error: 'Formato de URL inválido'
    };
  }
}

/**
 * Valida string não vazia
 * Utility genérico para campos de texto
 *
 * @param value Valor para validar
 * @param fieldName Nome do campo (para mensagem de erro)
 * @param minLength Tamanho mínimo (opcional)
 * @param maxLength Tamanho máximo (opcional)
 * @returns ValidationResult
 */
export function validateString(
  value: string,
  fieldName: string,
  minLength?: number,
  maxLength?: number
): ValidationResult {
  const trimmed = value?.trim();

  if (!trimmed) {
    return {
      valid: false,
      error: `${fieldName} é obrigatório`
    };
  }

  if (minLength && trimmed.length < minLength) {
    return {
      valid: false,
      error: `${fieldName} deve ter no mínimo ${minLength} caracteres`
    };
  }

  if (maxLength && trimmed.length > maxLength) {
    return {
      valid: false,
      error: `${fieldName} deve ter no máximo ${maxLength} caracteres`
    };
  }

  return {
    valid: true,
    value: trimmed
  };
}
