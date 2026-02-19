import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
import { formatPlanPrice, formatDiscountValue, getPeriodSuffix } from '../utils/currency';
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
  const { t, i18n } = useTranslation();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trialLoading, setTrialLoading] = useState(false);
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
    title: `${t('public.plans')} | RadarOne`,
    description: t('plans.subtitle'),
  });

  useEffect(() => {
    loadPlans();

    if (!sessionStorage.getItem('coupon_ab_tracked')) {
      trackABVariantShown('couponUpgradeTitle', 'plans_page');
      trackABVariantShown('couponDiscountTitle', 'plans_page');
      sessionStorage.setItem('coupon_ab_tracked', 'true');
    }
  }, []);

  useEffect(() => {
    if (reason === 'trial_expired') {
      const toastShown = sessionStorage.getItem('trial_expired_toast_shown');
      if (!toastShown) {
        const message = getABMessage('trialExpiredToast');
        showInfo(message);
        sessionStorage.setItem('trial_expired_toast_shown', 'true');
        trackTrialExpiredToastShown();
        trackABVariantShown('trialExpiredToast', 'plans_page_toast');
      }
    }
  }, [reason]);

  const loadPlans = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/plans`);
      if (!response.ok) {
        throw new Error(t('plans.loadError'));
      }
      const data = await response.json();
      setPlans(data);
      trackViewPlans();
    } catch (err: any) {
      setError(t('plans.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleApplyCoupon = async () => {
    if (!user) {
      setCouponError(t('plans.couponUpgradeNeedLogin'));
      return;
    }

    if (!couponCode.trim()) {
      setCouponError(t('plans.couponEnterCode'));
      return;
    }

    if (!selectedPlan) {
      setCouponError(t('plans.couponSelectPlan'));
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
        if (data.error && data.error.includes('não é um cupom de upgrade de teste')) {
          throw new Error(t('plans.isDiscountCoupon'));
        }
        throw new Error(data.error || t('plans.loadError'));
      }

      setCouponSuccess({
        planName: data.subscription.planName,
        endsAt: new Date(data.subscription.endsAt),
        daysGranted: data.subscription.daysGranted
      });

      trackTrialUpgradeApplied({
        couponCode: couponCode.toUpperCase(),
        planName: data.subscription.planName,
        durationDays: data.subscription.daysGranted
      });

      showInfo(`${t('plans.couponSuccessTitle')} ${data.message}`);
      await refetchUser();

    } catch (err: any) {
      const errorMessage = err.message || t('plans.loadError');
      setCouponError(errorMessage);

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
      setDiscountCouponError(t('plans.couponEnterCode'));
      return;
    }

    if (!selectedPlan) {
      setDiscountCouponError(t('plans.couponSelectPlan'));
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
        throw new Error(data.error || t('plans.loadError'));
      }

      if (data.coupon.purpose === 'TRIAL_UPGRADE') {
        throw new Error(t('plans.isUpgradeCoupon'));
      }

      setDiscountCouponData({
        code: data.coupon.code,
        description: data.coupon.description,
        discountType: data.coupon.discountType,
        discountValue: data.coupon.discountValue,
        appliesToPlan: data.coupon.appliesToPlan
      });

      trackCouponValidated({
        couponCode: data.coupon.code,
        couponType: 'DISCOUNT',
        discountValue: data.coupon.discountValue,
        discountType: data.coupon.discountType,
        location: 'plans_page'
      });

      showInfo(t('plans.discountValidatedTitle'));

    } catch (err: any) {
      const errorMessage = err.message || t('plans.loadError');
      setDiscountCouponError(errorMessage);

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
    const selectedPlan = plans.find(p => p.slug === planSlug);
    if (selectedPlan) {
      trackSelectPlan(selectedPlan.name, selectedPlan.priceCents / 100);
    }

    if (couponCode && discountCouponData && selectedPlan) {
      trackCouponAppliedToCheckout({
        couponCode: couponCode,
        planName: selectedPlan.name,
        discountValue: discountCouponData.discountValue,
        discountType: discountCouponData.discountType
      });
    }

    if (selectedPlan?.checkoutUrl) {
      let checkoutUrl = selectedPlan.checkoutUrl;
      if (couponCode) {
        const separator = checkoutUrl.includes('?') ? '&' : '?';
        checkoutUrl = `${checkoutUrl}${separator}coupon=${encodeURIComponent(couponCode)}&discount_code=${encodeURIComponent(couponCode)}`;
      }
      window.location.href = checkoutUrl;
      return;
    }

    if (!user) {
      navigate(`/register?plan=${planSlug}`);
      return;
    }

    if (trialLoading) return;
    setTrialLoading(true);
    setError('');

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

      const data = await response.json();

      if (data.errorCode === 'TRIAL_ALREADY_ACTIVE') {
        await refetchUser();
        navigate('/dashboard');
        return;
      }

      if (!response.ok) {
        if (data.errorCode === 'SUBSCRIPTION_ALREADY_ACTIVE') {
          await refetchUser();
          navigate('/dashboard');
          return;
        }
        throw new Error(data.error || t('plans.loadError'));
      }

      await refetchUser();
      navigate('/dashboard');
    } catch (err: any) {
      setError(t('plans.trialError') + err.message);
    } finally {
      setTrialLoading(false);
    }
  };

  // Helper: format plan features
  const formatMonitors = (count: number) =>
    count === 999 ? t('plans.unlimitedMonitors') : `${count} ${count === 1 ? t('plans.monitors', { count }) : t('plans.monitors_plural', { count })}`;

  const formatSites = (count: number) =>
    count === 999 ? t('plans.unlimitedSites') : `${count} ${count === 1 ? t('plans.sites', { count }) : t('plans.sites_plural', { count })}`;

  const formatAlerts = (count: number) =>
    count === 999 ? t('plans.unlimitedAlerts') : t('plans.alerts', { count });

  if (loading) {
    return (
      <PublicLayout maxWidth="container.xl">
        <p>{t('plans.loading')}</p>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout maxWidth="container.xl" showNav={!user}>
      {/* Plans Section */}
      <section style={styles.plansSection}>
        <h1 style={styles.title}>{t('plans.title')}</h1>
        <p style={styles.subtitle}>{t('plans.subtitle')}</p>

        {!selectedPlan && (
          <div style={styles.selectionHint}>
            💡 <strong>{t('plans.selectionHintPrefix')}</strong> {t('plans.selectionHint')}
          </div>
        )}

        {reason === 'trial_expired' ? (
          <div style={styles.trialExpiredBanner}>
            <p style={styles.trialExpiredText}>
              ⏰ {getABMessage('trialExpiredBanner')}
            </p>
          </div>
        ) : reason ? (
          <div style={styles.reasonBannerFixed}>
            <p style={styles.reasonBannerText}>
              ⚠️ {getSubscriptionMessage(reason)}
            </p>
          </div>
        ) : null}

        {error && <div style={styles.error}>{error}</div>}

        {/* Sucesso do cupom de Trial Upgrade */}
        {couponSuccess && (
          <div style={styles.couponSuccessBox}>
            <h3 style={styles.couponSuccessTitle}>
              ✅ {t('plans.couponSuccessTitle')}
            </h3>
            <p style={styles.couponSuccessText}>
              {t('plans.couponSuccessMessage')
                .replace('<strong>', '').replace('</strong>', '')
                .replace('{{plan}}', couponSuccess.planName)
                .replace('{{days}}', String(couponSuccess.daysGranted))}
            </p>
            <p style={styles.couponSuccessText}>
              {t('plans.couponValidUntil')
                .replace('<strong>', '').replace('</strong>', '')
                .replace('{{date}}', couponSuccess.endsAt.toLocaleDateString())}
            </p>
            <button
              onClick={() => navigate('/dashboard')}
              style={styles.couponSuccessButton}
            >
              {t('plans.couponGoDashboard')}
            </button>
          </div>
        )}

        {/* Cupom de Desconto Validado */}
        {discountCouponData && (
          <div style={styles.discountCouponSuccessBox}>
            <h3 style={styles.discountCouponSuccessTitle}>
              ✅ {t('plans.discountValidatedTitle')}
            </h3>
            <p style={styles.discountCouponSuccessText}>
              <strong>{discountCouponData.code}</strong>
              {discountCouponData.description && `: ${discountCouponData.description}`}
            </p>
            <p style={styles.discountCouponSuccessText}>
              {t('plans.discountValue')} <strong>
                {discountCouponData.discountType === 'PERCENTAGE'
                  ? `${discountCouponData.discountValue}%`
                  : formatDiscountValue(discountCouponData.discountValue, i18n.language)}
              </strong>
            </p>
            <p style={styles.discountCouponSuccessText}>
              {t('plans.discountValidFor')} <strong>{discountCouponData.appliesToPlan}</strong>
            </p>
            <p style={styles.discountCouponInfo}>
              👇 {t('plans.discountChooseBelow')}
            </p>
            <button
              onClick={() => {
                setDiscountCouponData(null);
                setDiscountCouponCode('');
              }}
              style={styles.discountCouponClearButton}
            >
              {t('plans.discountClear')}
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
                <div style={styles.recommendedBadge}>⭐ {t('plans.recommended')}</div>
              )}
              {selectedPlan?.id === plan.id && (
                <div style={styles.selectedBadge}>✓ {t('plans.selected')}</div>
              )}

              <h2 style={styles.planName}>{plan.name}</h2>
              <p style={styles.planDescription}>{plan.description}</p>

              <div style={styles.planPrice}>
                {plan.priceCents === 0 ? (
                  <span style={styles.priceValue}>{t('plans.free7Days')}</span>
                ) : (() => {
                  const price = formatPlanPrice(plan.priceCents, i18n.language);
                  return (
                    <>
                      <span style={styles.priceSymbol}>{price.currency === 'USD' ? '$' : 'R$'}</span>
                      <span style={styles.priceValue}>
                        {price.currency === 'USD' ? price.value.toFixed(2) : price.value.toFixed(0)}
                      </span>
                      <span style={styles.pricePeriod}>{price.suffix}</span>
                    </>
                  );
                })()}
              </div>

              {plan.trialDays > 0 && plan.priceCents > 0 && (
                <div style={styles.trialBadge}>
                  ✓ {t('plans.trialBadge')}
                </div>
              )}

              <ul style={styles.planFeatures}>
                <li>✅ {formatMonitors(plan.maxMonitors)}</li>
                <li>✅ {formatSites(plan.maxSites)}</li>
                <li>✅ {formatAlerts(plan.maxAlertsPerDay)}</li>
                <li>✅ {t('plans.interval', { minutes: plan.checkInterval })}</li>
                <li>✅ {t('plans.channels')}</li>
              </ul>

              {plan.priceCents === 0 && (
                <div style={styles.warningBox}>
                  <p style={styles.warningText}>
                    ⚠️ {t('plans.freeWarning')}
                  </p>
                </div>
              )}

              <button
                onClick={() => handleChoosePlan(plan.slug, discountCouponData?.code)}
                disabled={trialLoading && plan.priceCents === 0}
                style={{
                  ...styles.planButton,
                  ...(plan.isRecommended ? styles.planButtonRecommended : {}),
                  ...(trialLoading && plan.priceCents === 0 ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
                }}
              >
                {trialLoading && plan.priceCents === 0
                  ? t('plans.startingTrial')
                  : plan.priceCents === 0
                  ? t('plans.startTrial')
                  : discountCouponData
                  ? t('plans.subscribeWithDiscount', {
                      discount: discountCouponData.discountType === 'PERCENTAGE'
                        ? discountCouponData.discountValue + '% OFF'
                        : t('plans.discountValue').replace(':', '').trim()
                    })
                  : t('plans.subscribe')}
              </button>
            </div>
          ))}
        </div>

        {/* SEÇÕES DE CUPOM */}
        <div style={styles.couponsContainer}>
          {!couponSuccess && (
            <div style={styles.couponSection}>
              <h3 style={styles.couponTitle}>{getABMessage('couponUpgradeTitle')}</h3>
              <p style={styles.couponSubtitle}>
                {getABMessage('couponUpgradeSubtitle')}
              </p>
              {!user && (
                <div style={styles.loginWarning}>
                  ℹ️ <strong>{t('plans.couponLoginWarning')}</strong>{' '}
                  <a href="/login" style={styles.loginLink}>{t('public.login')}</a>
                </div>
              )}
              <div style={styles.couponInputGroup}>
                <input
                  type="text"
                  placeholder={t('plans.couponPlaceholder')}
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
                  {couponLoading ? t('plans.couponApplying') : t('plans.couponApply')}
                </button>
              </div>
              {couponError && (
                <div style={styles.couponError}>
                  ❌ {couponError}
                </div>
              )}
            </div>
          )}

          {!discountCouponData && (
            <div style={styles.discountCouponSection}>
              <h3 style={styles.discountCouponTitle}>{getABMessage('couponDiscountTitle')}</h3>
              <p style={styles.discountCouponSubtitle}>
                {getABMessage('couponDiscountSubtitle')}
              </p>
              <div style={styles.couponInputGroup}>
                <input
                  type="text"
                  placeholder={t('plans.couponPlaceholder')}
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
                  {discountCouponLoading ? t('plans.discountValidating') : t('plans.discountValidate')}
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
            {t('plans.cancelAnytime')}
          </p>
          <p style={{margin: 0}}>
            {t('plans.guarantee')}
          </p>
        </div>
      </section>
    </PublicLayout>
  );
};

const styles = {
  plansSection: {
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
  couponsContainer: {
    marginTop: responsive.spacing.xxl,
    marginBottom: responsive.spacing.xl,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: responsive.spacing.lg,
  },
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
  loginWarning: {
    backgroundColor: '#e0f2fe',
    border: '1px solid #7dd3fc',
    borderRadius: '8px',
    padding: responsive.spacing.sm,
    marginBottom: responsive.spacing.md,
    fontSize: responsive.typography.small.fontSize,
    color: '#0369a1',
    textAlign: 'center' as const,
  },
  loginLink: {
    color: '#0369a1',
    fontWeight: '600' as const,
    textDecoration: 'underline',
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
