import { useEffect, useRef } from 'react';

/**
 * Hook para timeout de sessão por inatividade
 *
 * Detecta eventos de atividade do usuário e, após X minutos sem atividade,
 * executa callback (geralmente logout)
 *
 * Eventos detectados:
 * - mousemove
 * - keydown
 * - scroll
 * - click
 * - visibilitychange (quando usuário volta para aba)
 *
 * @param onTimeout - Callback executado quando timeout ocorre
 * @param timeoutMinutes - Minutos de inatividade antes do timeout (padrão: 30)
 */
export function useSessionTimeout(
  onTimeout: () => void,
  timeoutMinutes: number = 30
) {
  const timeoutIdRef = useRef<number | null>(null);
  const timeoutMs = timeoutMinutes * 60 * 1000; // Converter minutos para ms

  // Resetar timer de inatividade
  const resetTimer = () => {
    // Limpar timer anterior
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
    }

    // Criar novo timer
    timeoutIdRef.current = setTimeout(() => {
      onTimeout();
    }, timeoutMs);
  };

  useEffect(() => {
    // Lista de eventos que indicam atividade do usuário
    const events = ['mousemove', 'keydown', 'scroll', 'click'];

    // Handler para visibilitychange (quando usuário volta para aba)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        resetTimer();
      }
    };

    // Iniciar timer na montagem
    resetTimer();

    // Adicionar listeners de evento
    events.forEach((event) => {
      window.addEventListener(event, resetTimer);
    });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup: remover listeners e timer na desmontagem
    return () => {
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
      }

      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [timeoutMs, onTimeout]);
}
