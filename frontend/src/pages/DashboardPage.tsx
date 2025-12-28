import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { AppLayout } from '../components/AppLayout';
import * as responsive from '../styles/responsive';

/**
 * Dashboard - Página principal após login
 */

interface Subscription {
  id: string;
  status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED' | 'SUSPENDED';
  isTrial: boolean;
  trialEndsAt: string | null;
  validUntil: string | null;
  plan: {
    name: string;
    slug: string;
    maxMonitors: number;
    maxSites: number;
    maxAlertsPerDay: number;
  };
}

interface UserStats {
  monitorsCount: number;
  sitesCount: number;
}

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [stats, setStats] = useState<UserStats>({ monitorsCount: 0, sitesCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Usar client API que lida com token automaticamente
      const subData = await api.get('/api/subscriptions/my');

      setSubscription({
        id: subData.subscription.id,
        status: subData.subscription.status,
        isTrial: subData.subscription.isTrial,
        trialEndsAt: subData.subscription.trialEndsAt,
        validUntil: subData.subscription.validUntil,
        plan: subData.subscription.plan
      });

      // Usar os dados de usage retornados pela API
      setStats({
        monitorsCount: subData.usage.monitorsCreated,
        sitesCount: 0 // API não retorna sitesCount ainda
      });
    } catch (err: any) {
      // Diagnóstico melhorado em DEV
      const isDev = import.meta.env.DEV;
      if (isDev) {
        console.error('Dashboard: Erro ao carregar dados', {
          endpoint: '/api/subscriptions/my',
          status: err.status,
          errorCode: err.errorCode,
          message: err.message,
          data: err.data
        });
        setError(`Erro ao carregar dados (${err.status || 'Network'} - ${err.errorCode || 'UNKNOWN'}). Ver console.`);
      } else {
        setError('Erro ao carregar dados. Tente novamente mais tarde.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getDaysUntilExpiry = () => {
    if (!subscription?.validUntil) return 0;
    const now = new Date();
    const expiry = new Date(subscription.validUntil);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getStatusBadge = () => {
    if (!subscription) return null;

    const statusColors: Record<string, { bg: string; text: string; label: string }> = {
      TRIAL: { bg: '#dbeafe', text: '#1e40af', label: '🎁 Período de teste' },
      ACTIVE: { bg: '#d1fae5', text: '#065f46', label: '✅ Ativo' },
      PAST_DUE: { bg: '#fed7aa', text: '#92400e', label: '⚠️ Pagamento pendente' },
      CANCELLED: { bg: '#f3f4f6', text: '#4b5563', label: '❌ Cancelado' },
      EXPIRED: { bg: '#fee2e2', text: '#991b1b', label: '❌ Expirado' },
      SUSPENDED: { bg: '#fee2e2', text: '#991b1b', label: '🚫 Suspenso' },
    };

    const statusStyle = statusColors[subscription.status] || statusColors.ACTIVE;

    return (
      <span
        style={{
          backgroundColor: statusStyle.bg,
          color: statusStyle.text,
          padding: '4px 12px',
          borderRadius: '6px',
          fontSize: '13px',
          fontWeight: '600',
        }}
      >
        {statusStyle.label}
      </span>
    );
  };

  if (loading) {
    return (
      <AppLayout>
        <p>Carregando...</p>
      </AppLayout>
    );
  }

  const daysLeft = getDaysUntilExpiry();
  const showExpiryWarning = daysLeft <= 5 && daysLeft > 0;

  return (
    <AppLayout>
        {/* Welcome Section */}
        <section style={styles.welcomeSection}>
          <h1 style={styles.welcomeTitle}>Olá, {user?.name || 'Usuário'}! 👋</h1>
          <p style={styles.welcomeSubtitle}>
            Bem-vindo ao seu painel de controle do RadarOne
          </p>
        </section>

        {error && (
          <div style={styles.error}>
            {error}
            <button
              onClick={() => {
                setError('');
                loadDashboardData();
              }}
              style={styles.retryButton}
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* Subscription Card */}
        {subscription && (
          <section style={styles.subscriptionCard}>
            <div style={styles.cardHeader}>
              <div>
                <h2 style={styles.cardTitle}>Seu Plano</h2>
                <p style={styles.planName}>{subscription.plan.name}</p>
              </div>
              <div>{getStatusBadge()}</div>
            </div>

            {subscription.isTrial && (
              <div style={styles.trialInfo}>
                <p style={styles.trialText}>
                  ⏰ Seu período de teste termina em <strong>{daysLeft} dias</strong>
                </p>
              </div>
            )}

            {showExpiryWarning && (
              <div style={styles.warningBox}>
                <p style={styles.warningText}>
                  ⚠️ Seu plano está para expirar! Clique aqui para renovar ou fazer
                  upgrade.
                </p>
                <Link to="/settings/subscription" style={styles.warningButton}>
                  Gerenciar assinatura
                </Link>
              </div>
            )}

            <div style={styles.limitsGrid}>
              <div style={styles.limitCard}>
                <div style={styles.limitValue}>
                  {stats.monitorsCount} / {subscription.plan.maxMonitors}
                </div>
                <div style={styles.limitLabel}>Monitores</div>
                <div style={styles.progressBar}>
                  <div
                    style={{
                      ...styles.progressFill,
                      width: `${(stats.monitorsCount / subscription.plan.maxMonitors) * 100}%`,
                    }}
                  />
                </div>
              </div>

              <div style={styles.limitCard}>
                <div style={styles.limitValue}>
                  {stats.sitesCount} / {subscription.plan.maxSites}
                </div>
                <div style={styles.limitLabel}>Sites diferentes</div>
                <div style={styles.progressBar}>
                  <div
                    style={{
                      ...styles.progressFill,
                      width: `${(stats.sitesCount / subscription.plan.maxSites) * 100}%`,
                    }}
                  />
                </div>
              </div>

              <div style={styles.limitCard}>
                <div style={styles.limitValue}>{subscription.plan.maxAlertsPerDay}</div>
                <div style={styles.limitLabel}>Alertas/dia</div>
              </div>
            </div>
          </section>
        )}

        {/* Actions Grid */}
        <section style={styles.actionsGrid}>
          <Link to="/monitors" style={styles.actionCard}>
            <div style={styles.actionIcon}>🔍</div>
            <h3 style={styles.actionTitle}>Gerenciar Monitores</h3>
            <p style={styles.actionDescription}>
              Criar, editar ou excluir seus monitores de anúncios
            </p>
          </Link>

          <Link to="/settings/notifications" style={styles.actionCard}>
            <div style={styles.actionIcon}>🔔</div>
            <h3 style={styles.actionTitle}>Configurar Notificações</h3>
            <p style={styles.actionDescription}>
              Escolha entre Telegram ou e-mail para receber alertas
            </p>
          </Link>

          <Link to="/settings/subscription" style={styles.actionCard}>
            <div style={styles.actionIcon}>💳</div>
            <h3 style={styles.actionTitle}>Gerenciar Assinatura</h3>
            <p style={styles.actionDescription}>
              Ver plano atual, fazer upgrade ou cancelar
            </p>
          </Link>

          <Link to="/manual" style={styles.actionCard}>
            <div style={styles.actionIcon}>📖</div>
            <h3 style={styles.actionTitle}>Ajuda e Suporte</h3>
            <p style={styles.actionDescription}>
              Manual, FAQ e contato para tirar suas dúvidas
            </p>
          </Link>
        </section>

        {/* Usage Warning */}
        {subscription &&
          stats.monitorsCount >= subscription.plan.maxMonitors * 0.8 && (
            <div style={styles.usageWarning}>
              <p style={styles.usageWarningText}>
                📊 Você está usando{' '}
                {Math.round(
                  (stats.monitorsCount / subscription.plan.maxMonitors) * 100
                )}
                % dos seus monitores. Considere fazer upgrade para adicionar mais.
              </p>
              <Link to="/plans" style={styles.usageWarningButton}>
                Ver planos
              </Link>
            </div>
          )}
    </AppLayout>
  );
};

const styles = {
  welcomeSection: {
    marginBottom: responsive.spacing.lg,
  },
  welcomeTitle: {
    ...responsive.typography.h1,
    marginBottom: responsive.spacing.xs,
  },
  welcomeSubtitle: {
    ...responsive.typography.body,
  },
  error: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: responsive.spacing.md,
    borderRadius: '8px',
    marginBottom: responsive.spacing.md,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: responsive.spacing.sm,
    flexWrap: 'wrap' as const,
  },
  retryButton: {
    ...responsive.buttonDanger,
    whiteSpace: 'nowrap' as const,
  },
  subscriptionCard: {
    ...responsive.card,
    marginBottom: responsive.spacing.lg,
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: responsive.spacing.md,
    gap: responsive.spacing.sm,
    flexWrap: 'wrap' as const,
  },
  cardTitle: {
    ...responsive.typography.h3,
    color: '#6b7280',
    marginBottom: responsive.spacing.xs,
  },
  planName: {
    fontSize: 'clamp(24px, 5vw, 28px)',
    fontWeight: 'bold' as const,
    color: '#1f2937',
    margin: 0,
  },
  trialInfo: {
    backgroundColor: '#dbeafe',
    padding: responsive.spacing.sm,
    borderRadius: '8px',
    marginBottom: responsive.spacing.md,
  },
  trialText: {
    ...responsive.typography.small,
    color: '#1e40af',
    margin: 0,
  },
  warningBox: {
    backgroundColor: '#fed7aa',
    padding: responsive.spacing.md,
    borderRadius: '8px',
    marginBottom: responsive.spacing.md,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: responsive.spacing.md,
    flexWrap: 'wrap' as const,
  },
  warningText: {
    ...responsive.typography.small,
    color: '#92400e',
    margin: 0,
    flex: 1,
  },
  warningButton: {
    ...responsive.button,
    backgroundColor: '#ea580c',
    color: 'white',
    textDecoration: 'none',
  },
  limitsGrid: {
    ...responsive.grid,
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))',
  },
  limitCard: {
    textAlign: 'center' as const,
  },
  limitValue: {
    fontSize: 'clamp(28px, 6vw, 32px)',
    fontWeight: 'bold' as const,
    color: '#1f2937',
    marginBottom: responsive.spacing.xs,
  },
  limitLabel: {
    ...responsive.typography.small,
    marginBottom: responsive.spacing.sm,
  },
  progressBar: {
    width: '100%',
    height: '8px',
    backgroundColor: '#e5e7eb',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    transition: 'width 0.3s ease',
  },
  actionsGrid: {
    ...responsive.grid,
    marginBottom: responsive.spacing.lg,
  },
  actionCard: {
    ...responsive.card,
    textDecoration: 'none',
    display: 'block',
    transition: 'transform 0.2s, box-shadow 0.2s',
    cursor: 'pointer',
  },
  actionIcon: {
    fontSize: 'clamp(36px, 8vw, 40px)',
    marginBottom: responsive.spacing.md,
  },
  actionTitle: {
    ...responsive.typography.h3,
    marginBottom: responsive.spacing.xs,
  },
  actionDescription: {
    ...responsive.typography.small,
    margin: 0,
  },
  usageWarning: {
    backgroundColor: '#fef3c7',
    padding: responsive.spacing.md,
    borderRadius: '8px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: responsive.spacing.md,
    flexWrap: 'wrap' as const,
  },
  usageWarningText: {
    ...responsive.typography.small,
    color: '#92400e',
    margin: 0,
    flex: 1,
  },
  usageWarningButton: {
    ...responsive.button,
    backgroundColor: '#f59e0b',
    color: 'white',
    textDecoration: 'none',
  },
};
