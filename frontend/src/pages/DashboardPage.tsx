import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

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
  const { user, logout } = useAuth();

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [stats, setStats] = useState<UserStats>({ monitorsCount: 0, sitesCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const token = localStorage.getItem('token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

      // Carregar subscription
      const subResponse = await fetch(`${API_URL}/api/subscriptions/my`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!subResponse.ok) {
        throw new Error('Erro ao carregar assinatura');
      }

      const subData = await subResponse.json();
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
      setError('Erro ao carregar dados');
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
      <div style={styles.container}>
        <p>Carregando...</p>
      </div>
    );
  }

  const daysLeft = getDaysUntilExpiry();
  const showExpiryWarning = daysLeft <= 5 && daysLeft > 0;

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <h1 style={styles.logo}>RadarOne</h1>
          <nav style={styles.nav}>
            <Link to="/dashboard" style={styles.navLink}>
              Dashboard
            </Link>
            <Link to="/monitors" style={styles.navLink}>
              Monitores
            </Link>
            <button onClick={logout} style={styles.logoutButton}>
              Sair
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <div style={styles.content}>
        {/* Welcome Section */}
        <section style={styles.welcomeSection}>
          <h1 style={styles.welcomeTitle}>Olá, {user?.name || 'Usuário'}! 👋</h1>
          <p style={styles.welcomeSubtitle}>
            Bem-vindo ao seu painel de controle do RadarOne
          </p>
        </section>

        {error && <div style={styles.error}>{error}</div>}

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
      </div>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
  },
  header: {
    backgroundColor: 'white',
    borderBottom: '1px solid #e5e7eb',
    padding: '16px 0',
  },
  headerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logo: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
    margin: 0,
  },
  nav: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
  },
  navLink: {
    color: '#4b5563',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '500',
  },
  logoutButton: {
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  content: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '40px 20px',
  },
  welcomeSection: {
    marginBottom: '32px',
  },
  welcomeTitle: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '8px',
  },
  welcomeSubtitle: {
    fontSize: '16px',
    color: '#6b7280',
  },
  error: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '16px',
    borderRadius: '8px',
    marginBottom: '24px',
  },
  subscriptionCard: {
    backgroundColor: 'white',
    padding: '32px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    marginBottom: '32px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
  },
  cardTitle: {
    fontSize: '18px',
    color: '#6b7280',
    marginBottom: '4px',
  },
  planName: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#1f2937',
    margin: 0,
  },
  trialInfo: {
    backgroundColor: '#dbeafe',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '24px',
  },
  trialText: {
    fontSize: '14px',
    color: '#1e40af',
    margin: 0,
  },
  warningBox: {
    backgroundColor: '#fed7aa',
    padding: '16px',
    borderRadius: '8px',
    marginBottom: '24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap' as const,
  },
  warningText: {
    fontSize: '14px',
    color: '#92400e',
    margin: 0,
    flex: 1,
  },
  warningButton: {
    backgroundColor: '#ea580c',
    color: 'white',
    padding: '8px 16px',
    borderRadius: '6px',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '600',
  },
  limitsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
  },
  limitCard: {
    textAlign: 'center' as const,
  },
  limitValue: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '8px',
  },
  limitLabel: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '12px',
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
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '24px',
    marginBottom: '32px',
  },
  actionCard: {
    backgroundColor: 'white',
    padding: '24px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    textDecoration: 'none',
    display: 'block',
    transition: 'transform 0.2s, box-shadow 0.2s',
    cursor: 'pointer',
  },
  actionIcon: {
    fontSize: '40px',
    marginBottom: '16px',
  },
  actionTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: '8px',
  },
  actionDescription: {
    fontSize: '14px',
    color: '#6b7280',
    margin: 0,
  },
  usageWarning: {
    backgroundColor: '#fef3c7',
    padding: '16px',
    borderRadius: '8px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap' as const,
  },
  usageWarningText: {
    fontSize: '14px',
    color: '#92400e',
    margin: 0,
    flex: 1,
  },
  usageWarningButton: {
    backgroundColor: '#f59e0b',
    color: 'white',
    padding: '8px 16px',
    borderRadius: '6px',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '600',
  },
};
