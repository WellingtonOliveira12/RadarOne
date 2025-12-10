/**
 * Kiwify API Types
 * Documentação: https://docs.kiwify.com.br/api-reference/webhooks/create
 *
 * Eventos disponíveis:
 * - compra_aprovada: Compra aprovada e paga
 * - compra_reembolsada: Compra reembolsada
 * - compra_recusada: Compra recusada/negada
 * - chargeback: Chargeback realizado
 * - subscription_canceled: Assinatura cancelada
 * - subscription_late: Assinatura com pagamento atrasado
 * - subscription_renewed: Assinatura renovada
 * - carrinho_abandonado: Carrinho abandonado
 * - boleto_gerado: Boleto gerado
 * - pix_gerado: PIX gerado
 */

export type KiwifyEventType =
  | 'compra_aprovada'
  | 'compra_reembolsada'
  | 'compra_recusada'
  | 'chargeback'
  | 'subscription_canceled'
  | 'subscription_late'
  | 'subscription_renewed'
  | 'carrinho_abandonado'
  | 'boleto_gerado'
  | 'pix_gerado';

export interface KiwifyCustomer {
  email: string;
  name: string;
  cpf?: string;
  phone?: string;
}

export interface KiwifyProduct {
  product_id: string;
  product_name: string;
  product_type: 'subscription' | 'one_time';
}

export interface KiwifyOrder {
  order_id: string;
  order_ref?: string;
  status: 'paid' | 'pending' | 'refunded' | 'canceled' | 'late';
  value: number; // Valor em centavos
  payment_method: 'credit_card' | 'boleto' | 'pix';
  installments?: number;
  created_at: string; // ISO date
  approved_at?: string; // ISO date
}

export interface KiwifySubscription {
  subscription_id: string;
  status: 'active' | 'canceled' | 'late' | 'expired';
  next_charge_date?: string; // ISO date
  started_at: string; // ISO date
  canceled_at?: string; // ISO date
}

/**
 * Payload completo do webhook da Kiwify
 */
export interface KiwifyWebhookPayload {
  event: KiwifyEventType;
  customer: KiwifyCustomer;
  product: KiwifyProduct;
  order: KiwifyOrder;
  subscription?: KiwifySubscription;

  // Metadados adicionais
  metadata?: Record<string, any>;

  // Timestamp do evento
  event_timestamp: string; // ISO date
}

/**
 * Headers do webhook Kiwify
 */
export interface KiwifyWebhookHeaders {
  'x-kiwify-signature'?: string; // HMAC signature para validação
  'x-kiwify-event'?: string; // Tipo do evento
}

/**
 * Mapeamento de status Kiwify → RadarOne
 */
export const KIWIFY_STATUS_MAP = {
  paid: 'ACTIVE' as const,
  pending: 'PAST_DUE' as const,
  refunded: 'CANCELLED' as const,
  canceled: 'CANCELLED' as const,
  late: 'PAST_DUE' as const,
} as const;

/**
 * Mapeamento de status de subscription Kiwify → RadarOne
 */
export const KIWIFY_SUBSCRIPTION_STATUS_MAP = {
  active: 'ACTIVE' as const,
  canceled: 'CANCELLED' as const,
  late: 'PAST_DUE' as const,
  expired: 'EXPIRED' as const,
} as const;
