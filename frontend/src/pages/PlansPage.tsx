import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  trackViewPlans,
  trackSelectPlan,
  trackTrialExpiredToastShown,
  trackCouponValidated,
  trackCouponValidationFailed,
  trackCouponAppliedToCheckout,
  trackTrialUpgradeApplied,
} from '../lib/analytics';
import { showInfo } from '../lib/toast';
import { getABMessage, trackABVariantShown } from '../lib/abtest';
import { getToken } from '../lib/auth';
import { getSubscriptionMessage } from '../utils/subscriptionHelpers';
import { normalizeCouponCode } from '../utils/couponHelpers';
import { PublicLayout } from '../components/PublicLayout';
import { usePageMeta } from '../hooks/usePageMeta';
import { API_BASE_URL } from '../constants/app';
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
  const { user, refetchUser } = useAuth();
  const navigate = useNavigate();

  // Estado de seleção de plano (para aplicar cupom)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

  // Estado do cupom de trial upgrade
  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [couponSuccess, setCouponSuccess] = useState<{
    planName: string;
    endsAt: Date;
    daysGranted: number;
  } | null>(null);

  // Estado do cupom de desconto (DISCOUNT)
  const [discountCouponCode, setDiscountCouponCode] = useState('');
  const [discountCouponLoading, setDiscountCouponLoading] = useState(false);
  const [discountCouponError, setDiscountCouponError] = useState('');
  const [discountCouponData, setDiscountCouponData] = useState<{
    code: string;
    description: string | null;
    discountType: string;
    discountValue: number;
    appliesToPlan: string;
  } | null>(null);

  // SEO meta
  usePageMeta({
    title: 'Planos | RadarOne',
    description: 'Conheça os planos do RadarOne e escolha a opção ideal para monitorar sites e produtos.',
  });

  useEffect(() => {
    loadPlans();

    // Track A/B variant shown para cupons (uma vez por sessão)
    if (!sessionStorage.getItem('coupon_ab_tracked')) {
      trackABVariantShown('couponUpgradeTitle', 'plans_page');
      trackABVariantShown('couponDiscountTitle', 'plans_page');
      sessionStorage.setItem('coupon_ab_tracked', 'true');
    }
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
      const response = await fetch(`${API_BASE_URL}/api/plans`);
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

  const handleApplyCoupon = async () => {
    if (!user) {
      setCouponError('Você precisa estar logado para usar um cupom.');
      return;
    }

    if (!couponCode.trim()) {
      setCouponError('Digite o código do cupom');
      return;
    }

    if (!selectedPlan) {
      setCouponError('Selecione um plano antes de aplicar o cupom. Clique no card do plano desejado.');
      return;
    }

    setCouponLoading(true);
    setCouponError('');
    setCouponSuccess(null);

    try {
      const token = getToken();
      const normalizedCode = normalizeCouponCode(couponCode);
      const response = await fetch(`${API_BASE_URL}/api/coupons/redeem-trial-upgrade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ code: normalizedCode, planId: selectedPlan.id })
      });

      const data = await response.json();

      if (!response.ok) {
        // Melhorar mensagem se cupom for DISCOUNT
        if (data.error && data.error.includes('não é um cupom de upgrade de teste')) {
          throw new Error('Este cupom é de desconto financeiro. Use-o na seção "Cupom de Desconto" abaixo para aplicá-lo no checkout.');
        }
        throw new Error(data.error || 'Erro ao aplicar cupom');
      }

      // Sucesso!
      setCouponSuccess({
        planName: data.subscription.planName,
        endsAt: new Date(data.subscription.endsAt),
        daysGranted: data.subscription.daysGranted
      });

      // Analytics: rastrear trial upgrade aplicado
      trackTrialUpgradeApplied({
        couponCode: couponCode.toUpperCase(),
        planName: data.subscription.planName,
        durationDays: data.subscription.daysGranted
      });

      showInfo(`Cupom aplicado! ${data.message}`);

      // CRÍTICO: Atualizar estado do usuário no AuthContext
      // para que RequireSubscriptionRoute reconheça a nova subscription
      await refetchUser();

    } catch (err: any) {
      const errorMessage = err.message || 'Erro ao aplicar cupom';
      setCouponError(errorMessage);

      // Analytics: rastrear falha na validação
      trackCouponValidationFailed({
        couponCode: couponCode.toUpperCase(),
        errorReason: errorMessage,
        location: 'plans_page'
      });
    } finally {
      setCouponLoading(false);
    }
  };

  const handleValidateDiscountCoupon = async () => {
    if (!discountCouponCode.trim()) {
      setDiscountCouponError('Digite o código do cupom');
      return;
    }

    if (!selectedPlan) {
      setDiscountCouponError('Selecione um plano antes de validar o cupom. Clique no card do plano desejado.');
      return;
    }

    setDiscountCouponLoading(true);
    setDiscountCouponError('');
    setDiscountCouponData(null);

    try {
      const normalizedCode = normalizeCouponCode(discountCouponCode);
      const response = await fetch(`${API_BASE_URL}/api/coupons/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: normalizedCode, planId: selectedPlan.id })
      });

      const data = await response.json();

      if (!response.ok || !data.valid) {
        throw new Error(data.error || 'Cupom inválido');
      }

      // Verificar se não é cupom de TRIAL_UPGRADE
      if (data.coupon.purpose === 'TRIAL_UPGRADE') {
        throw new Error('Este cupom é de upgrade temporário. Use-o na seção "Tem um cupom de upgrade?" acima.');
      }

      setDiscountCouponData({
        code: data.coupon.code,
        description: data.coupon.description,
        discountType: data.coupon.discountType,
        discountValue: data.coupon.discountValue,
        appliesToPlan: data.coupon.appliesToPlan
      });

      // Analytics: rastrear validação de cupom de desconto
      trackCouponValidated({
        couponCode: data.coupon.code,
        couponType: 'DISCOUNT',
        discountValue: data.coupon.discountValue,
        discountType: data.coupon.discountType,
        location: 'plans_page'
      });

      showInfo('Cupom de desconto validado! Escolha um plano abaixo para prosseguir.');

    } catch (err: any) {
      const errorMessage = err.message || 'Erro ao validar cupom';
      setDiscountCouponError(errorMessage);

      // Analytics: rastrear falha na validação
      trackCouponValidationFailed({
        couponCode: discountCouponCode.toUpperCase(),
        errorReason: errorMessage,
        location: 'plans_page'
      });
    } finally {
      setDiscountCouponLoading(false);
    }
  };

  const handleChoosePlan = async (planSlug: string, couponCode?: string) => {
    // Encontra o plano selecionado para tracking
    const selectedPlan = plans.find(p => p.slug === planSlug);
    if (selectedPlan) {
      trackSelectPlan(selectedPlan.name, selectedPlan.priceCents / 100);
    }

    // Analytics: rastrear se cupom foi aplicado ao checkout
    if (couponCode && discountCouponData && selectedPlan) {
      trackCouponAppliedToCheckout({
        couponCode: couponCode,
        planName: selectedPlan.name,
        discountValue: discountCouponData.discountValue,
        discountType: discountCouponData.discountType
      });
    }

    // Se o plano tem checkoutUrl, redireciona para checkout externo (Kiwify)
    if (selectedPlan?.checkoutUrl) {
      // Adicionar cupom à URL se fornecido
      let checkoutUrl = selectedPlan.checkoutUrl;
      if (couponCode) {
        const separator = checkoutUrl.includes('?') ? '&' : '?';
        checkoutUrl = `${checkoutUrl}${separator}coupon=${encodeURIComponent(couponCode)}&discount_code=${encodeURIComponent(couponCode)}`;
      }
      // Redirecionar para checkout Kiwify
      window.location.href = checkoutUrl;
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
      const response = await fetch(`${API_BASE_URL}/api/subscriptions/start-trial`, {
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

        {/* Mensagem orientativa sobre seleção */}
        {!selectedPlan && (
          <div style={styles.selectionHint}>
            💡 <strong>Dica:</strong> Clique no card de um plano para selecioná-lo antes de aplicar cupom
          </div>
        )}

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

        {/* Sucesso do cupom de Trial Upgrade - Mostrar no topo se aplicado */}
        {couponSuccess && (
          <div style={styles.couponSuccessBox}>
            <h3 style={styles.couponSuccessTitle}>
              ✅ Cupom aplicado com sucesso!
            </h3>
            <p style={styles.couponSuccessText}>
              Você ganhou acesso ao plano <strong>{couponSuccess.planName}</strong> por{' '}
              <strong>{couponSuccess.daysGranted} dias</strong>!
            </p>
            <p style={styles.couponSuccessText}>
              Válido até: <strong>{couponSuccess.endsAt.toLocaleDateString('pt-BR')}</strong>
            </p>
            <button
              onClick={() => navigate('/dashboard')}
              style={styles.couponSuccessButton}
            >
              Ir para o Dashboard
            </button>
          </div>
        )}

        {/* Cupom de Desconto Validado - Mostrar no topo se validado */}
        {discountCouponData && (
          <div style={styles.discountCouponSuccessBox}>
            <h3 style={styles.discountCouponSuccessTitle}>
              ✅ Cupom de desconto validado!
            </h3>
            <p style={styles.discountCouponSuccessText}>
              <strong>{discountCouponData.code}</strong>
              {discountCouponData.description && `: ${discountCouponData.description}`}
            </p>
            <p style={styles.discountCouponSuccessText}>
              Desconto: <strong>
                {discountCouponData.discountType === 'PERCENTAGE'
                  ? `${discountCouponData.discountValue}%`
                  : `R$ ${(discountCouponData.discountValue / 100).toFixed(2)}`}
              </strong>
            </p>
            <p style={styles.discountCouponSuccessText}>
              Válido para: <strong>{discountCouponData.appliesToPlan}</strong>
            </p>
            <p style={styles.discountCouponInfo}>
              👇 Escolha um plano abaixo para prosseguir com o desconto aplicado
            </p>
            <button
              onClick={() => {
                setDiscountCouponData(null);
                setDiscountCouponCode('');
              }}
              style={styles.discountCouponClearButton}
            >
              Limpar cupom
            </button>
          </div>
        )}

        <div style={styles.plansGrid}>
          {plans.map((plan) => (
            <div
              key={plan.id}
              onClick={() => setSelectedPlan(plan)}
              style={{
                ...styles.planCard,
                ...(plan.isRecommended ? styles.planCardRecommended : {}),
                ...(selectedPlan?.id === plan.id ? styles.planCardSelected : {}),
                cursor: 'pointer',
              }}
            >
              {plan.isRecommended && (
                <div style={styles.recommendedBadge}>⭐ Recomendado</div>
              )}
              {selectedPlan?.id === plan.id && (
                <div style={styles.selectedBadge}>✓ Selecionado</div>
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
                onClick={() => handleChoosePlan(plan.slug, discountCouponData?.code)}
                style={{
                  ...styles.planButton,
                  ...(plan.isRecommended ? styles.planButtonRecommended : {}),
                }}
              >
                {plan.priceCents === 0
                  ? 'Usar grátis por 7 dias'
                  : discountCouponData
                  ? `Assinar com ${discountCouponData.discountType === 'PERCENTAGE' ? discountCouponData.discountValue + '% OFF' : 'desconto'}`
                  : 'Assinar agora'}
              </button>
            </div>
          ))}
        </div>

        {/* SEÇÕES DE CUPOM - Agora abaixo dos planos */}
        <div style={styles.couponsContainer}>
          {/* Seção de Cupom de Trial Upgrade (só aparece se usuário logado e não aplicado) */}
          {user && !couponSuccess && (
            <div style={styles.couponSection}>
              <h3 style={styles.couponTitle}>{getABMessage('couponUpgradeTitle')}</h3>
              <p style={styles.couponSubtitle}>
                {getABMessage('couponUpgradeSubtitle')}
              </p>
              <div style={styles.couponInputGroup}>
                <input
                  type="text"
                  placeholder="Digite o código do cupom"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  style={styles.couponInput}
                  disabled={couponLoading}
                />
                <button
                  onClick={handleApplyCoupon}
                  disabled={couponLoading || !couponCode.trim()}
                  style={{
                    ...styles.couponButton,
                    ...(couponLoading || !couponCode.trim() ? styles.couponButtonDisabled : {})
                  }}
                >
                  {couponLoading ? 'Aplicando...' : 'Aplicar cupom'}
                </button>
              </div>
              {couponError && (
                <div style={styles.couponError}>
                  ❌ {couponError}
                </div>
              )}
            </div>
          )}

          {/* Seção de Cupom de Desconto (DISCOUNT) - sempre visível se não validado */}
          {!discountCouponData && (
            <div style={styles.discountCouponSection}>
              <h3 style={styles.discountCouponTitle}>{getABMessage('couponDiscountTitle')}</h3>
              <p style={styles.discountCouponSubtitle}>
                {getABMessage('couponDiscountSubtitle')}
              </p>
              <div style={styles.couponInputGroup}>
                <input
                  type="text"
                  placeholder="Digite o código do cupom"
                  value={discountCouponCode}
                  onChange={(e) => setDiscountCouponCode(e.target.value.toUpperCase())}
                  style={styles.couponInput}
                  disabled={discountCouponLoading}
                />
                <button
                  onClick={handleValidateDiscountCoupon}
                  disabled={discountCouponLoading || !discountCouponCode.trim()}
                  style={{
                    ...styles.discountCouponButton,
                    ...(discountCouponLoading || !discountCouponCode.trim() ? styles.couponButtonDisabled : {})
                  }}
                >
                  {discountCouponLoading ? 'Validando...' : 'Validar cupom'}
                </button>
              </div>
              {discountCouponError && (
                <div style={styles.couponError}>
                  ❌ {discountCouponError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Informações sobre planos */}
        <div style={styles.planInfoText}>
          <p style={{margin: 0, marginBottom: '4px'}}>
            Todos os planos podem ser cancelados a qualquer momento.
          </p>
          <p style={{margin: 0}}>
            Planos pagos contam com 7 dias de garantia.
          </p>
        </div>
      </section>
    </PublicLayout>
  );
};

const styles = {
  plansSection: {
    // Container e padding já são controlados pelo PublicLayout
    // Apenas adiciona padding vertical para espaçamento interno
    paddingTop: responsive.spacing.lg,
    paddingBottom: responsive.spacing.lg,
    position: 'relative' as const,
    zIndex: 1,
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
  selectionHint: {
    backgroundColor: '#dbeafe',
    border: '1px solid #3b82f6',
    borderRadius: '8px',
    padding: responsive.spacing.md,
    marginBottom: responsive.spacing.lg,
    textAlign: 'center' as const,
    color: '#1e40af',
    fontSize: responsive.typography.small.fontSize,
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
    display: 'grid',
    gap: 'clamp(16px, 3vw, 24px)',
    // Grid responsivo: 1 coluna no mobile, 2-3 colunas no desktop (baseado na largura mínima de 320px)
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))',
    marginBottom: responsive.spacing.xl,
  },
  planCard: {
    ...responsive.card,
    position: 'relative' as const,
    border: '2px solid transparent',
    zIndex: 5,
    pointerEvents: 'auto' as const,
  },
  planCardRecommended: {
    border: '2px solid #3b82f6',
    boxShadow: '0 4px 16px rgba(59,130,246,0.2)',
  },
  planCardSelected: {
    border: '3px solid #10b981',
    boxShadow: '0 4px 20px rgba(16,185,129,0.4)',
    backgroundColor: '#f0fdf4',
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
  selectedBadge: {
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
    position: 'relative' as const,
    zIndex: 10,
    pointerEvents: 'auto' as const,
  },
  planButtonRecommended: {
    backgroundColor: '#3b82f6',
  },
  // Container para seções de cupom (abaixo dos planos)
  couponsContainer: {
    marginTop: responsive.spacing.xxl,
    marginBottom: responsive.spacing.xl,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: responsive.spacing.lg,
  },
  // Texto informativo sobre planos (footer do layout cuida dos links)
  planInfoText: {
    textAlign: 'center' as const,
    color: '#6b7280',
    fontSize: responsive.typography.small.fontSize,
    marginTop: responsive.spacing.xl,
    paddingTop: responsive.spacing.lg,
    borderTop: '1px solid #e5e7eb',
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
  // Estilos do cupom de trial upgrade
  couponSection: {
    backgroundColor: '#f0f9ff',
    border: '2px solid #3b82f6',
    borderRadius: '12px',
    padding: responsive.spacing.lg,
    marginBottom: responsive.spacing.xl,
    textAlign: 'center' as const,
  },
  couponTitle: {
    fontSize: 'clamp(18px, 4vw, 22px)',
    fontWeight: '700' as const,
    color: '#1e40af',
    marginBottom: responsive.spacing.xs,
  },
  couponSubtitle: {
    fontSize: responsive.typography.small.fontSize,
    color: '#6b7280',
    marginBottom: responsive.spacing.md,
  },
  couponInputGroup: {
    display: 'flex',
    gap: responsive.spacing.sm,
    maxWidth: '500px',
    margin: '0 auto',
    flexWrap: 'wrap' as const,
  },
  couponInput: {
    flex: '1 1 200px',
    padding: responsive.spacing.sm,
    fontSize: responsive.typography.body.fontSize,
    border: '2px solid #cbd5e1',
    borderRadius: '8px',
    textTransform: 'uppercase' as const,
    fontWeight: '600' as const,
  },
  couponButton: {
    ...responsive.button,
    backgroundColor: '#3b82f6',
    color: 'white',
    fontWeight: '600' as const,
    minWidth: '140px',
  },
  couponButtonDisabled: {
    backgroundColor: '#cbd5e1',
    cursor: 'not-allowed',
    opacity: 0.6,
  },
  couponError: {
    marginTop: responsive.spacing.sm,
    padding: responsive.spacing.sm,
    backgroundColor: '#fee2e2',
    borderRadius: '8px',
    color: '#991b1b',
    fontSize: responsive.typography.small.fontSize,
  },
  couponSuccessBox: {
    backgroundColor: '#d1fae5',
    border: '2px solid #10b981',
    borderRadius: '12px',
    padding: responsive.spacing.xl,
    marginBottom: responsive.spacing.xl,
    textAlign: 'center' as const,
  },
  couponSuccessTitle: {
    fontSize: 'clamp(20px, 4vw, 26px)',
    fontWeight: '700' as const,
    color: '#065f46',
    marginBottom: responsive.spacing.md,
  },
  couponSuccessText: {
    fontSize: responsive.typography.body.fontSize,
    color: '#047857',
    marginBottom: responsive.spacing.sm,
  },
  couponSuccessButton: {
    ...responsive.button,
    backgroundColor: '#10b981',
    color: 'white',
    fontWeight: '600' as const,
    marginTop: responsive.spacing.md,
    minWidth: '200px',
  },
  // Estilos do cupom de desconto (DISCOUNT)
  discountCouponSection: {
    backgroundColor: '#fef3c7',
    border: '2px solid #f59e0b',
    borderRadius: '12px',
    padding: responsive.spacing.lg,
    marginBottom: responsive.spacing.xl,
    textAlign: 'center' as const,
  },
  discountCouponTitle: {
    fontSize: 'clamp(18px, 4vw, 22px)',
    fontWeight: '700' as const,
    color: '#92400e',
    marginBottom: responsive.spacing.xs,
  },
  discountCouponSubtitle: {
    fontSize: responsive.typography.small.fontSize,
    color: '#6b7280',
    marginBottom: responsive.spacing.md,
  },
  discountCouponButton: {
    ...responsive.button,
    backgroundColor: '#f59e0b',
    color: 'white',
    fontWeight: '600' as const,
    minWidth: '140px',
  },
  discountCouponSuccessBox: {
    backgroundColor: '#fef3c7',
    border: '2px solid #f59e0b',
    borderRadius: '12px',
    padding: responsive.spacing.xl,
    marginBottom: responsive.spacing.xl,
    textAlign: 'center' as const,
  },
  discountCouponSuccessTitle: {
    fontSize: 'clamp(20px, 4vw, 26px)',
    fontWeight: '700' as const,
    color: '#92400e',
    marginBottom: responsive.spacing.md,
  },
  discountCouponSuccessText: {
    fontSize: responsive.typography.body.fontSize,
    color: '#78350f',
    marginBottom: responsive.spacing.sm,
  },
  discountCouponInfo: {
    fontSize: responsive.typography.body.fontSize,
    color: '#92400e',
    marginTop: responsive.spacing.md,
    marginBottom: responsive.spacing.sm,
    fontWeight: '600' as const,
  },
  discountCouponClearButton: {
    ...responsive.button,
    backgroundColor: '#6b7280',
    color: 'white',
    fontWeight: '600' as const,
    marginTop: responsive.spacing.sm,
    minWidth: '140px',
  },
};
