import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { trackViewPlans, trackSelectPlan, trackTrialExpiredToastShown } from '../lib/analytics';
import { showInfo } from '../lib/toast';
import { getABMessage, trackABVariantShown } from '../lib/abtest';

/**
 * Página de Planos - Mostra os 5 planos comerciais
 */

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  billingPeriod: 'MONTHLY' | 'YEARLY' | 'SEMIANNUAL';
  trialDays: number;
  maxMonitors: number;
  maxSites: number;
  maxAlertsPerDay: number;
  checkInterval: number;
  isRecommended: boolean;
  priority: number;
  checkoutUrl?: string | null;
}

export const PlansPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const reason = searchParams.get('reason');

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    loadPlans();
  }, []);

  // Mostrar toast ao redirecionar por TRIAL_EXPIRED
  useEffect(() => {
    if (reason === 'trial_expired') {
      // Verificar se já mostrou o toast nesta sessão (evitar mostrar múltiplas vezes)
      const toastShown = sessionStorage.getItem('trial_expired_toast_shown');

      if (!toastShown) {
        // Obter mensagem via A/B testing
        const message = getABMessage('trialExpiredToast');
        showInfo(message);
        sessionStorage.setItem('trial_expired_toast_shown', 'true');

        // Track toast shown para analytics + variante
        trackTrialExpiredToastShown();
        trackABVariantShown('trialExpiredToast', 'plans_page_toast');
      }
    }
  }, [reason]);

  const loadPlans = async () => {
    try {
      // Buscar planos da API
      const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${API_URL}/api/plans`);
      if (!response.ok) {
        throw new Error('Erro ao buscar planos');
      }
      const data = await response.json();
      setPlans(data);
      trackViewPlans();
    } catch (err: any) {
      setError('Erro ao carregar planos');
    } finally {
      setLoading(false);
    }
  };

  const handleChoosePlan = async (planSlug: string) => {
    // Encontra o plano selecionado para tracking
    const selectedPlan = plans.find(p => p.slug === planSlug);
    if (selectedPlan) {
      trackSelectPlan(selectedPlan.name, selectedPlan.priceCents / 100);
    }

    // Se o plano tem checkoutUrl, redireciona para checkout externo (Kiwify)
    if (selectedPlan?.checkoutUrl) {
      // Redirecionar para checkout Kiwify
      window.location.href = selectedPlan.checkoutUrl;
      return;
    }

    // Se não está logado, redirecionar para registro com plano selecionado
    if (!user) {
      navigate(`/register?plan=${planSlug}`);
      return;
    }

    // Se está logado E não tem checkoutUrl, iniciar trial interno
    try {
      const token = localStorage.getItem('radarone_token');
      const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${API_URL}/api/subscriptions/start-trial`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ planSlug })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao iniciar trial');
      }

      // Redirecionar para dashboard (usuário verá trial ativo lá)
      navigate('/dashboard');
    } catch (err: any) {
      setError('Erro ao iniciar trial: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <p>Carregando planos...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <Link to="/" style={styles.logo}>
            RadarOne
          </Link>
          {user ? (
            <Link to="/dashboard" style={styles.navLink}>
              Dashboard
            </Link>
          ) : (
            <div style={styles.nav}>
              <Link to="/login" style={styles.navLink}>
                Entrar
              </Link>
              <Link to="/register" style={styles.navLinkButton}>
                Criar conta
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Plans Section */}
      <section style={styles.plansSection}>
        <h1 style={styles.title}>Escolha o plano ideal para você</h1>
        <p style={styles.subtitle}>
          Use o RadarOne gratuitamente por 7 dias ou assine um plano com 7 dias de garantia.
        </p>

        {/* Banner de trial expirado */}
        {reason === 'trial_expired' && (
          <div style={styles.trialExpiredBanner}>
            <p style={styles.trialExpiredText}>
              ⏰ {getABMessage('trialExpiredBanner')}
            </p>
          </div>
        )}

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.plansGrid}>
          {plans.map((plan) => (
            <div
              key={plan.id}
              style={{
                ...styles.planCard,
                ...(plan.isRecommended ? styles.planCardRecommended : {}),
              }}
            >
              {plan.isRecommended && (
                <div style={styles.recommendedBadge}>⭐ Recomendado</div>
              )}

              <h2 style={styles.planName}>{plan.name}</h2>
              <p style={styles.planDescription}>{plan.description}</p>

              <div style={styles.planPrice}>
                {plan.priceCents === 0 ? (
                  <>
                    <span style={styles.priceValue}>Grátis por 7 dias</span>
                  </>
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

              {plan.trialDays > 0 && plan.priceCents > 0 && (
                <div style={styles.trialBadge}>
                  ✓ 7 dias de garantia
                </div>
              )}

              <ul style={styles.planFeatures}>
                <li>✅ {plan.maxMonitors === 999 ? 'Monitores ilimitados' : `${plan.maxMonitors} ${plan.maxMonitors === 1 ? 'monitor' : 'monitores'}`}</li>
                <li>✅ {plan.maxSites === 999 ? 'Sites ilimitados' : `${plan.maxSites} ${plan.maxSites === 1 ? 'site' : 'sites diferentes'}`}</li>
                <li>✅ {plan.maxAlertsPerDay === 999 ? 'Alertas ilimitados' : `Até ${plan.maxAlertsPerDay} alertas/dia`}</li>
                <li>✅ Verificação a cada {plan.checkInterval} minutos</li>
                <li>✅ Telegram + Email</li>
              </ul>

              {plan.priceCents === 0 && (
                <div style={styles.warningBox}>
                  <p style={styles.warningText}>
                    ⚠️ Após 7 dias, é necessário assinar um plano para continuar usando o RadarOne.
                  </p>
                </div>
              )}

              <button
                onClick={() => handleChoosePlan(plan.slug)}
                style={{
                  ...styles.planButton,
                  ...(plan.isRecommended ? styles.planButtonRecommended : {}),
                }}
              >
                {plan.priceCents === 0
                  ? 'Usar grátis por 7 dias'
                  : 'Assinar agora'}
              </button>
            </div>
          ))}
        </div>

        <div style={styles.footer}>
          <p>
            Todos os planos podem ser cancelados a qualquer momento.
          </p>
          <p>
            Planos pagos contam com 7 dias de garantia.
          </p>
        </div>
      </section>
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
    textDecoration: 'none',
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
  navLinkButton: {
    color: '#fff',
    backgroundColor: '#3b82f6',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '500',
    padding: '8px 16px',
    borderRadius: '6px',
  },
  plansSection: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '60px 20px',
  },
  title: {
    fontSize: '42px',
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center' as const,
    marginBottom: '12px',
  },
  subtitle: {
    fontSize: '18px',
    color: '#6b7280',
    textAlign: 'center' as const,
    marginBottom: '48px',
  },
  error: {
    backgroundColor: '#fee',
    color: '#c33',
    padding: '16px',
    borderRadius: '8px',
    marginBottom: '24px',
    textAlign: 'center' as const,
  },
  plansGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '24px',
    marginBottom: '48px',
  },
  planCard: {
    backgroundColor: 'white',
    padding: '32px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    position: 'relative' as const,
    border: '2px solid transparent',
  },
  planCardRecommended: {
    border: '2px solid #3b82f6',
    boxShadow: '0 4px 16px rgba(59,130,246,0.2)',
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
  planName: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '8px',
  },
  planDescription: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '24px',
  },
  planPrice: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
    marginBottom: '12px',
  },
  priceSymbol: {
    fontSize: '20px',
    color: '#6b7280',
  },
  priceValue: {
    fontSize: '42px',
    fontWeight: 'bold',
    color: '#1f2937',
  },
  pricePeriod: {
    fontSize: '16px',
    color: '#6b7280',
  },
  trialBadge: {
    display: 'inline-block',
    backgroundColor: '#d1fae5',
    color: '#065f46',
    padding: '4px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '600',
    marginBottom: '24px',
  },
  planFeatures: {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 24px 0',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  warningBox: {
    backgroundColor: '#fef3c7',
    border: '1px solid #fbbf24',
    borderRadius: '6px',
    padding: '12px',
    marginBottom: '16px',
  },
  warningText: {
    fontSize: '13px',
    color: '#92400e',
    margin: 0,
    lineHeight: '1.5',
  },
  planButton: {
    width: '100%',
    padding: '12px',
    backgroundColor: '#374151',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  planButtonRecommended: {
    backgroundColor: '#3b82f6',
  },
  footer: {
    textAlign: 'center' as const,
    color: '#6b7280',
    fontSize: '14px',
    marginTop: '48px',
  },
  trialExpiredBanner: {
    backgroundColor: '#fef3c7',
    border: '2px solid #fbbf24',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '24px',
    textAlign: 'center' as const,
  },
  trialExpiredText: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#92400e',
    margin: 0,
  },
};
