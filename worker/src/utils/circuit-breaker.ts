/**
 * Circuit Breaker - Padrão para proteção contra falhas em cascata
 *
 * Implementa circuit breaker por domínio para evitar sobrecarga
 * quando um site está bloqueando ou instável
 *
 * Estados:
 * - CLOSED: Normal, requisições passam
 * - OPEN: Site bloqueado, requisições são rejeitadas imediatamente
 * - HALF_OPEN: Teste após timeout, permite 1 requisição de teste
 *
 * Features:
 * - Threshold configurável de falhas consecutivas
 * - Timeout de cooldown antes de retentar
 * - Estatísticas por domínio
 *
 * IMPORTANTE: Erros de autenticação NÃO abrem o circuit breaker!
 * - LOGIN_REQUIRED, NEEDS_REAUTH, etc são tratados separadamente
 * - Apenas falhas reais (timeout, crash, blocked) incrementam contador
 */

import { isAuthenticationError } from './retry-helper';

interface CircuitState {
  failures: number; // Contador de falhas consecutivas
  lastFailure: number; // Timestamp da última falha
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'; // Estado do circuito
  totalFailures: number; // Total de falhas (estatística)
  totalSuccesses: number; // Total de sucessos (estatística)
}

interface CircuitBreakerConfig {
  failureThreshold: number; // Falhas consecutivas para abrir (padrão: 5)
  timeout: number; // Tempo de cooldown em ms (padrão: 15min)
  halfOpenMaxAttempts: number; // Tentativas em HALF_OPEN (padrão: 1)
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  timeout: 15 * 60 * 1000, // 15 minutos
  halfOpenMaxAttempts: 1,
};

class CircuitBreaker {
  private circuits = new Map<string, CircuitState>();
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Executa função com proteção de circuit breaker
   *
   * @param domain Domínio/site (ex: MERCADO_LIVRE, OLX)
   * @param fn Função a ser executada
   * @returns Resultado da função
   * @throws Error se circuit estiver OPEN
   */
  async execute<T>(domain: string, fn: () => Promise<T>): Promise<T> {
    const circuit = this.getCircuit(domain);

    // Se OPEN, verifica se já passou o timeout
    if (circuit.state === 'OPEN') {
      const elapsed = Date.now() - circuit.lastFailure;

      if (elapsed < this.config.timeout) {
        const waitTime = Math.ceil((this.config.timeout - elapsed) / 1000);
        throw new Error(
          `Circuit breaker OPEN para ${domain}. Aguarde ${waitTime}s antes de tentar novamente.`
        );
      }

      // Timeout expirado → Transição para HALF_OPEN
      circuit.state = 'HALF_OPEN';
      console.log(`🔄 Circuit breaker ${domain}: OPEN → HALF_OPEN (teste)`);
    }

    try {
      // Executa função
      const result = await fn();

      // Sucesso → Reset failures e fecha circuito
      this.onSuccess(domain);

      return result;
    } catch (error: any) {
      // ═══════════════════════════════════════════════════════════════
      // ERROS DE AUTENTICAÇÃO NÃO INCREMENTAM O CIRCUIT BREAKER
      // ═══════════════════════════════════════════════════════════════
      if (isAuthenticationError(error)) {
        console.log(`🔐 Circuit breaker ${domain}: Ignorando erro de autenticação (não incrementa falhas)`);
        throw error; // Propaga erro mas não conta como falha
      }
      // ═══════════════════════════════════════════════════════════════

      // Falha real → Incrementa contador
      this.onFailure(domain);

      throw error;
    }
  }

  /**
   * Callback de sucesso
   */
  private onSuccess(domain: string) {
    const circuit = this.getCircuit(domain);

    circuit.totalSuccesses++;
    circuit.failures = 0;

    if (circuit.state === 'HALF_OPEN') {
      circuit.state = 'CLOSED';
      console.log(`✅ Circuit breaker ${domain}: HALF_OPEN → CLOSED (recuperado)`);
    }

    if (circuit.state === 'OPEN') {
      // Não deveria acontecer, mas por segurança
      circuit.state = 'CLOSED';
      console.log(`✅ Circuit breaker ${domain}: OPEN → CLOSED (recuperado inesperadamente)`);
    }
  }

  /**
   * Callback de falha
   */
  private onFailure(domain: string) {
    const circuit = this.getCircuit(domain);

    circuit.failures++;
    circuit.totalFailures++;
    circuit.lastFailure = Date.now();

    console.warn(
      `⚠️  Circuit breaker ${domain}: Falha ${circuit.failures}/${this.config.failureThreshold}`
    );

    // Se atingiu threshold e está CLOSED/HALF_OPEN → Abre
    if (
      circuit.failures >= this.config.failureThreshold &&
      (circuit.state === 'CLOSED' || circuit.state === 'HALF_OPEN')
    ) {
      circuit.state = 'OPEN';
      const cooldownMin = Math.ceil(this.config.timeout / 60000);
      console.error(
        `🚨 Circuit breaker OPEN para ${domain} após ${circuit.failures} falhas. ` +
          `Cooldown: ${cooldownMin} minutos.`
      );
    }
  }

  /**
   * Obtém ou cria circuito para um domínio
   */
  private getCircuit(domain: string): CircuitState {
    if (!this.circuits.has(domain)) {
      this.circuits.set(domain, {
        failures: 0,
        lastFailure: 0,
        state: 'CLOSED',
        totalFailures: 0,
        totalSuccesses: 0,
      });
    }

    return this.circuits.get(domain)!;
  }

  /**
   * Obtém estatísticas de um circuito
   */
  getStats(domain: string): CircuitState | null {
    return this.circuits.get(domain) || null;
  }

  /**
   * Obtém estatísticas de todos os circuitos
   */
  getAllStats(): Map<string, CircuitState> {
    return new Map(this.circuits);
  }

  /**
   * Reseta um circuito específico
   */
  reset(domain: string): void {
    this.circuits.delete(domain);
    console.log(`🔄 Circuit breaker resetado: ${domain}`);
  }

  /**
   * Reseta todos os circuitos
   */
  resetAll(): void {
    this.circuits.clear();
    console.log('🔄 Todos os circuit breakers resetados');
  }

  /**
   * Força abertura de um circuito (útil para testes ou manutenção)
   */
  forceOpen(domain: string): void {
    const circuit = this.getCircuit(domain);
    circuit.state = 'OPEN';
    circuit.lastFailure = Date.now();
    console.warn(`⚠️  Circuit breaker forçado para OPEN: ${domain}`);
  }

  /**
   * Força fechamento de um circuito
   */
  forceClose(domain: string): void {
    const circuit = this.getCircuit(domain);
    circuit.state = 'CLOSED';
    circuit.failures = 0;
    console.log(`✅ Circuit breaker forçado para CLOSED: ${domain}`);
  }
}

/**
 * Singleton global
 */
export const circuitBreaker = new CircuitBreaker({
  failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '5'),
  timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '900000'), // 15 min
});

/**
 * Helper para criar circuit breakers customizados
 */
export function createCircuitBreaker(config: Partial<CircuitBreakerConfig>): CircuitBreaker {
  return new CircuitBreaker(config);
}
