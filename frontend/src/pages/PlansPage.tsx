import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { trackViewPlans, trackSelectPlan, trackTrialExpiredToastShown } from '../lib/analytics';
import { showInfo } from '../lib/toast';
import { getABMessage, trackABVariantShown } from '../lib/abtest';
import { getToken } from '../services/tokenStorage';
import { getSubscriptionMessage } from '../utils/subscriptionHelpers';
import { PublicLayout } from '../components/PublicLayout';
import { usePageMeta } from '../hooks/usePageMeta';
import * as responsive from '../styles/responsive';

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

  // SEO meta
  usePageMeta({
    title: 'Planos | RadarOne',
    description: 'Conheça os planos do RadarOne e escolha a opção ideal para monitorar sites e produtos.',
  });

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
      const token = getToken();
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
      <PublicLayout maxWidth="container.xl">
        <p>Carregando planos...</p>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout maxWidth="container.xl" showNav={!user}>
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

        {/* Banner fixo informando motivo do bloqueio (se houver) */}
        {reason && (
          <div style={styles.reasonBannerFixed}>
            <p style={styles.reasonBannerText}>
              ⚠️ {getSubscriptionMessage(reason)}
            </p>
          </div>
        )}

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
    </PublicLayout>
  );
};

const styles = {
  plansSection: {
    ...responsive.container,
    padding: `${responsive.spacing.xxl} ${responsive.spacing.md}`,
  },
  title: {
    ...responsive.typography.h1,
    textAlign: 'center' as const,
    marginBottom: responsive.spacing.sm,
  },
  subtitle: {
    fontSize: responsive.typography.body.fontSize,
    color: '#6b7280',
    textAlign: 'center' as const,
    marginBottom: responsive.spacing.xl,
  },
  error: {
    backgroundColor: '#fee',
    color: '#c33',
    padding: responsive.spacing.md,
    borderRadius: '8px',
    marginBottom: responsive.spacing.lg,
    textAlign: 'center' as const,
  },
  plansGrid: {
    ...responsive.grid,
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))',
    marginBottom: responsive.spacing.xl,
  },
  planCard: {
    ...responsive.card,
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
    ...responsive.typography.h2,
    marginBottom: responsive.spacing.xs,
  },
  planDescription: {
    ...responsive.typography.small,
    marginBottom: responsive.spacing.lg,
  },
  planPrice: {
    display: 'flex',
    alignItems: 'baseline',
    gap: responsive.spacing.xs,
    marginBottom: responsive.spacing.sm,
  },
  priceSymbol: {
    fontSize: 'clamp(18px, 3vw, 20px)',
    color: '#6b7280',
  },
  priceValue: {
    fontSize: 'clamp(32px, 6vw, 42px)',
    fontWeight: 'bold' as const,
    color: '#1f2937',
  },
  pricePeriod: {
    fontSize: responsive.typography.body.fontSize,
    color: '#6b7280',
  },
  trialBadge: {
    display: 'inline-block',
    backgroundColor: '#d1fae5',
    color: '#065f46',
    padding: `${responsive.spacing.xs} ${responsive.spacing.sm}`,
    borderRadius: '6px',
    fontSize: responsive.typography.small.fontSize,
    fontWeight: '600' as const,
    marginBottom: responsive.spacing.lg,
  },
  planFeatures: {
    ...responsive.flexColumn,
    listStyle: 'none',
    padding: 0,
    margin: `0 0 ${responsive.spacing.lg} 0`,
  },
  warningBox: {
    backgroundColor: '#fef3c7',
    border: '1px solid #fbbf24',
    borderRadius: '6px',
    padding: responsive.spacing.sm,
    marginBottom: responsive.spacing.md,
  },
  warningText: {
    ...responsive.typography.small,
    color: '#92400e',
    margin: 0,
  },
  planButton: {
    ...responsive.button,
    width: '100%',
    backgroundColor: '#374151',
    color: 'white',
  },
  planButtonRecommended: {
    backgroundColor: '#3b82f6',
  },
  footer: {
    textAlign: 'center' as const,
    color: '#6b7280',
    fontSize: responsive.typography.body.fontSize,
    marginTop: responsive.spacing.xl,
  },
  trialExpiredBanner: {
    backgroundColor: '#fef3c7',
    border: '2px solid #fbbf24',
    borderRadius: '8px',
    padding: responsive.spacing.md,
    marginBottom: responsive.spacing.lg,
    textAlign: 'center' as const,
  },
  trialExpiredText: {
    fontSize: responsive.typography.body.fontSize,
    fontWeight: '600' as const,
    color: '#92400e',
    margin: 0,
  },
  // Banner fixo para mostrar motivo do bloqueio (reason da URL)
  reasonBannerFixed: {
    backgroundColor: '#fef3c7',
    border: '2px solid #f59e0b',
    borderRadius: '8px',
    padding: responsive.spacing.md,
    marginBottom: responsive.spacing.lg,
    textAlign: 'center' as const,
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  reasonBannerText: {
    fontSize: responsive.typography.body.fontSize,
    fontWeight: '600' as const,
    color: '#92400e',
    margin: 0,
  },
};
