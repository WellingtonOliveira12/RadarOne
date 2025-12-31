/**
 * FASE 4.1 - Sistema de Alertas Administrativos
 * Tipos, enums e interfaces para o sistema de alertas
 */

import { AlertSeverity } from '@prisma/client';

/**
 * Tipos de alertas que podem ser gerados automaticamente
 */
export const AlertType = {
  // Jobs e Sistema
  JOB_FAILURE: 'JOB_FAILURE',
  JOB_DELAYED: 'JOB_DELAYED',
  JOB_TIMEOUT: 'JOB_TIMEOUT',

  // Webhooks
  WEBHOOK_ERROR: 'WEBHOOK_ERROR',
  WEBHOOK_TIMEOUT: 'WEBHOOK_TIMEOUT',
  WEBHOOK_INVALID_PAYLOAD: 'WEBHOOK_INVALID_PAYLOAD',

  // Picos Anormais
  SPIKE_USERS: 'SPIKE_USERS',
  SPIKE_MONITORS: 'SPIKE_MONITORS',
  SPIKE_SUBSCRIPTIONS: 'SPIKE_SUBSCRIPTIONS',

  // Expirações em Massa
  MASS_EXPIRATION: 'MASS_EXPIRATION',
  MASS_TRIAL_ENDING: 'MASS_TRIAL_ENDING',

  // Sistema
  SYSTEM_ERROR: 'SYSTEM_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  HIGH_ERROR_RATE: 'HIGH_ERROR_RATE',

  // Segurança
  SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
} as const;

export type AlertTypeValue = typeof AlertType[keyof typeof AlertType];

/**
 * Interface para criar um alerta
 */
export interface CreateAlertParams {
  type: AlertTypeValue;
  severity: AlertSeverity;
  title: string;
  message: string;
  source?: string;
  metadata?: Record<string, any>;
}

/**
 * Helper para determinar severidade baseada no tipo de alerta
 */
export function getDefaultSeverity(type: AlertTypeValue): AlertSeverity {
  const severityMap: Record<AlertTypeValue, AlertSeverity> = {
    // Critical
    [AlertType.SYSTEM_ERROR]: 'CRITICAL',
    [AlertType.DATABASE_ERROR]: 'CRITICAL',
    [AlertType.JOB_TIMEOUT]: 'CRITICAL',

    // Error
    [AlertType.JOB_FAILURE]: 'ERROR',
    [AlertType.WEBHOOK_ERROR]: 'ERROR',
    [AlertType.HIGH_ERROR_RATE]: 'ERROR',
    [AlertType.WEBHOOK_TIMEOUT]: 'ERROR',

    // Warning
    [AlertType.JOB_DELAYED]: 'WARNING',
    [AlertType.SPIKE_USERS]: 'WARNING',
    [AlertType.SPIKE_MONITORS]: 'WARNING',
    [AlertType.SPIKE_SUBSCRIPTIONS]: 'WARNING',
    [AlertType.MASS_EXPIRATION]: 'WARNING',
    [AlertType.MASS_TRIAL_ENDING]: 'WARNING',
    [AlertType.WEBHOOK_INVALID_PAYLOAD]: 'WARNING',
    [AlertType.RATE_LIMIT_EXCEEDED]: 'WARNING',

    // Info
    [AlertType.SUSPICIOUS_ACTIVITY]: 'INFO',
  };

  return severityMap[type] || 'INFO';
}

/**
 * Helper para gerar mensagens amigáveis baseadas no tipo
 */
export function getAlertMessage(type: AlertTypeValue, metadata?: Record<string, any>): { title: string; message: string } {
  const messages: Record<AlertTypeValue, { title: string; message: string }> = {
    [AlertType.JOB_FAILURE]: {
      title: 'Job Falhou',
      message: `O job ${metadata?.jobName || 'desconhecido'} falhou durante a execução.`,
    },
    [AlertType.JOB_DELAYED]: {
      title: 'Job Atrasado',
      message: `O job ${metadata?.jobName || 'desconhecido'} está atrasado há ${metadata?.delayMinutes || 'N/A'} minutos.`,
    },
    [AlertType.JOB_TIMEOUT]: {
      title: 'Job Timeout',
      message: `O job ${metadata?.jobName || 'desconhecido'} excedeu o tempo limite de execução.`,
    },
    [AlertType.WEBHOOK_ERROR]: {
      title: 'Erro no Webhook',
      message: `Webhook falhou ao processar evento ${metadata?.event || 'desconhecido'}.`,
    },
    [AlertType.WEBHOOK_TIMEOUT]: {
      title: 'Timeout no Webhook',
      message: `Webhook ${metadata?.event || 'desconhecido'} excedeu tempo limite.`,
    },
    [AlertType.WEBHOOK_INVALID_PAYLOAD]: {
      title: 'Payload Inválido',
      message: `Webhook recebeu payload inválido no evento ${metadata?.event || 'desconhecido'}.`,
    },
    [AlertType.SPIKE_USERS]: {
      title: 'Pico de Novos Usuários',
      message: `Detectado pico anormal de ${metadata?.count || 'N/A'} novos usuários nas últimas ${metadata?.hours || 24} horas.`,
    },
    [AlertType.SPIKE_MONITORS]: {
      title: 'Pico de Novos Monitores',
      message: `Detectado pico anormal de ${metadata?.count || 'N/A'} novos monitores nas últimas ${metadata?.hours || 24} horas.`,
    },
    [AlertType.SPIKE_SUBSCRIPTIONS]: {
      title: 'Pico de Novas Assinaturas',
      message: `Detectado pico anormal de ${metadata?.count || 'N/A'} novas assinaturas nas últimas ${metadata?.hours || 24} horas.`,
    },
    [AlertType.MASS_EXPIRATION]: {
      title: 'Expirações em Massa',
      message: `${metadata?.count || 'N/A'} assinaturas expirarão nos próximos ${metadata?.days || 7} dias.`,
    },
    [AlertType.MASS_TRIAL_ENDING]: {
      title: 'Trials Encerrando',
      message: `${metadata?.count || 'N/A'} trials terminarão nos próximos ${metadata?.days || 3} dias.`,
    },
    [AlertType.SYSTEM_ERROR]: {
      title: 'Erro Crítico do Sistema',
      message: `Erro crítico detectado: ${metadata?.error || 'Erro desconhecido'}.`,
    },
    [AlertType.DATABASE_ERROR]: {
      title: 'Erro de Banco de Dados',
      message: `Erro ao acessar banco de dados: ${metadata?.error || 'Erro desconhecido'}.`,
    },
    [AlertType.HIGH_ERROR_RATE]: {
      title: 'Alta Taxa de Erros',
      message: `Taxa de erros está acima do normal: ${metadata?.errorRate || 'N/A'}% nas últimas ${metadata?.hours || 1} horas.`,
    },
    [AlertType.SUSPICIOUS_ACTIVITY]: {
      title: 'Atividade Suspeita',
      message: `Atividade suspeita detectada: ${metadata?.description || 'Verifique logs'}.`,
    },
    [AlertType.RATE_LIMIT_EXCEEDED]: {
      title: 'Rate Limit Excedido',
      message: `Usuário ${metadata?.userId || 'desconhecido'} excedeu limite de requisições.`,
    },
  };

  return messages[type] || { title: 'Alerta', message: 'Alerta do sistema' };
}
