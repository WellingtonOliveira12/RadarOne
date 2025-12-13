import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Gerenciamento de Assinatura
 */

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  maxMonitors: number;
  maxSites: number;
  maxAlertsPerDay: number;
  checkInterval: number;
  isRecommended: boolean;
}

interface Subscription {
  id: string;
  status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED' | 'SUSPENDED';
  isTrial: boolean;
  trialEndsAt: string | null;
  validUntil: string | null;
  plan: Plan;
}

export const SubscriptionSettingsPage: React.FC = () => {
  const { logout } = useAuth();

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [allPlans, setAllPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

      // Carregar subscription atual
      const subResponse = await fetch(`${API_URL}/api/subscriptions/my`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (subResponse.ok) {
        const subData = await subResponse.json();
        setSubscription({
          id: subData.subscription.id,
          status: subData.subscription.status,
          isTrial: subData.subscription.isTrial,
          trialEndsAt: subData.subscription.trialEndsAt,
          validUntil: subData.subscription.validUntil,
          plan: subData.subscription.plan
        });
      }

      // Carregar todos os planos
      const plansResponse = await fetch(`${API_URL}/api/plans`);
      if (plansResponse.ok) {
        const plansData = await plansResponse.json();
        setAllPlans(plansData);
      }
    } catch (err: any) {
      setError('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePlan = async (planSlug: string) => {
    // Em desenvolvimento: apenas chamar backend para trocar plano
    // Em produção futura: redirecionar para URL de checkout externa
    try {
      const token = localStorage.getItem('token');
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const response = await fetch(`${API_URL}/api/subscriptions/change-plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ planSlug })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao alterar plano');
      }

      alert('Plano alterado com sucesso!');
      loadData();
    } catch (err: any) {
      alert('Erro ao alterar plano: ' + err.message);
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
          padding: '6px 14px',
          borderRadius: '6px',
          fontSize: '14px',
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

      {/* Content */}
      <div style={styles.content}>
        <div style={styles.breadcrumb}>
          <Link to="/dashboard" style={styles.breadcrumbLink}>
            Dashboard
          </Link>
          <span style={styles.breadcrumbSeparator}>/</span>
          <span style={styles.breadcrumbCurrent}>Gerenciar Assinatura</span>
        </div>

        <h1 style={styles.title}>Gerenciar Assinatura</h1>
        <p style={styles.subtitle}>
          Veja seu plano atual e faça upgrade ou downgrade quando quiser
        </p>

        {error && <div style={styles.error}>{error}</div>}

        {/* Current Subscription */}
        {subscription && (
          <div style={styles.currentPlanCard}>
            <div style={styles.currentPlanHeader}>
              <div>
                <h2 style={styles.currentPlanLabel}>Plano atual</h2>
                <h3 style={styles.currentPlanName}>{subscription.plan.name}</h3>
              </div>
              <div>{getStatusBadge()}</div>
            </div>

            {subscription.isTrial && (
              <div style={styles.trialWarning}>
                <p style={styles.trialWarningText}>
                  ⏰ Seu período de teste termina em <strong>{daysLeft} dias</strong>
                </p>
              </div>
            )}

            {showExpiryWarning && (
              <div style={styles.expiryWarning}>
                <p style={styles.expiryWarningText}>
                  ⚠️ Seu plano está para expirar! Escolha um plano abaixo para continuar.
                </p>
              </div>
            )}

            <div style={styles.currentPlanDetails}>
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>Preço:</span>
                <span style={styles.detailValue}>
                  {subscription.plan.priceCents === 0
                    ? 'Grátis'
                    : `R$ ${(subscription.plan.priceCents / 100).toFixed(2)}/mês`}
                </span>
              </div>
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>Monitores:</span>
                <span style={styles.detailValue}>{subscription.plan.maxMonitors}</span>
              </div>
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>Sites diferentes:</span>
                <span style={styles.detailValue}>{subscription.plan.maxSites}</span>
              </div>
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>Alertas por dia:</span>
                <span style={styles.detailValue}>{subscription.plan.maxAlertsPerDay}</span>
              </div>
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>Intervalo de verificação:</span>
                <span style={styles.detailValue}>{subscription.plan.checkInterval} minutos</span>
              </div>
            </div>
          </div>
        )}

        {/* All Plans */}
        <h2 style={styles.sectionTitle}>Todos os planos disponíveis</h2>
        <p style={styles.sectionSubtitle}>
          Faça upgrade para ter mais monitores e recursos
        </p>

        <div style={styles.plansGrid}>
          {allPlans.map((plan) => {
            const isCurrentPlan = subscription?.plan.slug === plan.slug;

            return (
              <div
                key={plan.id}
                style={{
                  ...styles.planCard,
                  ...(plan.isRecommended ? styles.planCardRecommended : {}),
                  ...(isCurrentPlan ? styles.planCardCurrent : {}),
                }}
              >
                {plan.isRecommended && (
                  <div style={styles.recommendedBadge}>⭐ Recomendado</div>
                )}
                {isCurrentPlan && <div style={styles.currentBadge}>✓ Plano atual</div>}

                <h3 style={styles.planName}>{plan.name}</h3>
                <p style={styles.planDescription}>{plan.description}</p>

                <div style={styles.planPrice}>
                  {plan.priceCents === 0 ? (
                    <span style={styles.priceValue}>Grátis</span>
                  ) : (
                    <>
                      <span style={styles.priceSymbol}>R$</span>
                      <span style={styles.priceValue}>
                        {(plan.priceCents / 100).toFixed(0)}
                      </span>
                      <span style={styles.pricePeriod}>/mês</span>
                    </>
                  )}
                </div>

                <ul style={styles.planFeatures}>
                  <li>✅ {plan.maxMonitors} monitores</li>
                  <li>✅ {plan.maxSites} sites</li>
                  <li>✅ {plan.maxAlertsPerDay} alertas/dia</li>
                  <li>✅ Verificação a cada {plan.checkInterval}min</li>
                </ul>

                <button
                  onClick={() => handleChangePlan(plan.slug)}
                  disabled={isCurrentPlan}
                  style={{
                    ...styles.planButton,
                    ...(plan.isRecommended ? styles.planButtonRecommended : {}),
                    ...(isCurrentPlan ? styles.planButtonDisabled : {}),
                  }}
                >
                  {isCurrentPlan ? 'Plano atual' : 'Escolher este plano'}
                </button>
              </div>
            );
          })}
        </div>

        <div style={styles.footer}>
          <p style={styles.footerText}>
            💡 <strong>Nota:</strong> Você pode trocar de plano a qualquer momento. Em
            desenvolvimento, a troca é instantânea. Em produção, você será redirecionado
            para o checkout seguro.
          </p>
        </div>
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
  breadcrumb: {
    marginBottom: '24px',
    fontSize: '14px',
  },
  breadcrumbLink: {
    color: '#3b82f6',
    textDecoration: 'none',
  },
  breadcrumbSeparator: {
    margin: '0 8px',
    color: '#9ca3af',
  },
  breadcrumbCurrent: {
    color: '#6b7280',
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '16px',
    color: '#6b7280',
    marginBottom: '32px',
  },
  error: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  currentPlanCard: {
    backgroundColor: 'white',
    padding: '32px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    marginBottom: '48px',
  },
  currentPlanHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
  },
  currentPlanLabel: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '4px',
  },
  currentPlanName: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#1f2937',
    margin: 0,
  },
  trialWarning: {
    backgroundColor: '#dbeafe',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '24px',
  },
  trialWarningText: {
    fontSize: '14px',
    color: '#1e40af',
    margin: 0,
  },
  expiryWarning: {
    backgroundColor: '#fed7aa',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '24px',
  },
  expiryWarningText: {
    fontSize: '14px',
    color: '#92400e',
    margin: 0,
  },
  currentPlanDetails: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
  },
  detailItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    backgroundColor: '#f9fafb',
    borderRadius: '6px',
  },
  detailLabel: {
    fontSize: '13px',
    color: '#6b7280',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: '14px',
    color: '#1f2937',
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '8px',
  },
  sectionSubtitle: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '24px',
  },
  plansGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '24px',
    marginBottom: '48px',
  },
  planCard: {
    backgroundColor: 'white',
    padding: '28px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    position: 'relative' as const,
    border: '2px solid transparent',
  },
  planCardRecommended: {
    border: '2px solid #3b82f6',
    boxShadow: '0 4px 16px rgba(59,130,246,0.2)',
  },
  planCardCurrent: {
    border: '2px solid #10b981',
  },
  recommendedBadge: {
    position: 'absolute' as const,
    top: '-12px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#3b82f6',
    color: 'white',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600',
  },
  currentBadge: {
    position: 'absolute' as const,
    top: '-12px',
    right: '16px',
    backgroundColor: '#10b981',
    color: 'white',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600',
  },
  planName: {
    fontSize: '22px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '6px',
  },
  planDescription: {
    fontSize: '13px',
    color: '#6b7280',
    marginBottom: '20px',
  },
  planPrice: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
    marginBottom: '20px',
  },
  priceSymbol: {
    fontSize: '18px',
    color: '#6b7280',
  },
  priceValue: {
    fontSize: '36px',
    fontWeight: 'bold',
    color: '#1f2937',
  },
  pricePeriod: {
    fontSize: '14px',
    color: '#6b7280',
  },
  planFeatures: {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 20px 0',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
    fontSize: '13px',
  },
  planButton: {
    width: '100%',
    padding: '10px',
    backgroundColor: '#374151',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  planButtonRecommended: {
    backgroundColor: '#3b82f6',
  },
  planButtonDisabled: {
    backgroundColor: '#d1d5db',
    cursor: 'not-allowed',
  },
  footer: {
    backgroundColor: '#fffbeb',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid #fde68a',
  },
  footerText: {
    fontSize: '14px',
    color: '#78350f',
    margin: 0,
    lineHeight: '1.6',
  },
};
