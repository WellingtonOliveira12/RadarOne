import { showSuccess, showError } from '../lib/toast';

/**
 * Copia texto para o clipboard e mostra toast de feedback
 *
 * Usa a API moderna navigator.clipboard.writeText() com fallback para
 * document.execCommand('copy') em navegadores antigos
 *
 * @param text - Texto a ser copiado
 * @param successMessage - Mensagem de sucesso (padrão: "Copiado!")
 * @returns Promise<boolean> - true se sucesso, false se erro
 *
 * @example
 * ```tsx
 * <button onClick={() => copyToClipboard('texto aqui')}>
 *   Copiar
 * </button>
 * ```
 */
export async function copyToClipboard(
  text: string,
  successMessage: string = 'Copiado!'
): Promise<boolean> {
  try {
    // Tentar usar API moderna (disponível em HTTPS e localhost)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      showSuccess(successMessage);
      return true;
    }

    // Fallback para navegadores antigos ou HTTP (não-seguro)
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);

    if (successful) {
      showSuccess(successMessage);
      return true;
    } else {
      throw new Error('Fallback copy command falhou');
    }
  } catch (err) {
    console.error('Erro ao copiar para clipboard:', err);
    showError('Falha ao copiar. Tente novamente.');
    return false;
  }
}

/**
 * Cria handler de click para copiar texto (útil para botões)
 *
 * @example
 * ```tsx
 * <button onClick={createCopyHandler('texto aqui')}>
 *   Copiar
 * </button>
 * ```
 */
export function createCopyHandler(text: string, successMessage?: string) {
  return () => copyToClipboard(text, successMessage);
}
