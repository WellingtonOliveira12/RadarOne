import React, { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { trackSignUp } from '../lib/analytics';
import { TELEGRAM_BOT_USERNAME, TELEGRAM_BOT_LINK } from '../constants/app';
import { PublicLayout } from '../components/PublicLayout';
import * as responsive from '../styles/responsive';

/**
 * Página de Cadastro com CPF e preferências de notificação
 */

export const RegisterPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const selectedPlanFromUrl = searchParams.get('plan') || '';
  const { t } = useTranslation();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    cpf: '',
    phone: '',
    password: '',
    confirmPassword: '',
    notifyEmail: true,
    notifyTelegram: false,
    telegramUsername: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    // Máscara de CPF
    if (name === 'cpf') {
      const cleanValue = value.replace(/\D/g, '');
      let maskedValue = cleanValue;
      if (cleanValue.length <= 11) {
        maskedValue = cleanValue
          .replace(/(\d{3})(\d)/, '$1.$2')
          .replace(/(\d{3})(\d)/, '$1.$2')
          .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
      }
      setFormData({ ...formData, [name]: maskedValue });
      return;
    }

    // Máscara de telefone
    if (name === 'phone') {
      const cleanValue = value.replace(/\D/g, '');
      let maskedValue = cleanValue;
      if (cleanValue.length <= 11) {
        maskedValue = cleanValue
          .replace(/^(\d{2})(\d)/, '($1) $2')
          .replace(/(\d{5})(\d{1,4})$/, '$1-$2');
      }
      setFormData({ ...formData, [name]: maskedValue });
      return;
    }

    setFormData({ ...formData, [name]: value });
  };

  const handleTelegramCheckboxChange = (checked: boolean) => {
    setFormData({ ...formData, notifyTelegram: checked });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validações
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError(t('auth.invalidEmail'));
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    if (formData.password.length < 6) {
      setError(t('auth.passwordMin6'));
      return;
    }

    const hasLetter = /[a-zA-Z]/.test(formData.password);
    const hasNumber = /[0-9]/.test(formData.password);
    if (!hasLetter || !hasNumber) {
      setError(t('auth.passwordLettersNumbers'));
      return;
    }

    const cleanCpf = formData.cpf.replace(/\D/g, '');
    if (cleanCpf.length !== 11) {
      setError(t('auth.invalidCpf'));
      return;
    }

    setLoading(true);

    try {
      await register({
        name: formData.name,
        email: formData.email,
        cpf: cleanCpf,
        phone: formData.phone.replace(/\D/g, '') || undefined,
        password: formData.password,
        notificationPreference: formData.notifyTelegram ? 'TELEGRAM' : 'EMAIL',
        telegramUsername:
          formData.notifyTelegram
            ? formData.telegramUsername
            : undefined,
      });

      trackSignUp('email');

      if (selectedPlanFromUrl) {
        navigate(`/plans?selected=${selectedPlanFromUrl}`);
      } else {
        navigate('/plans');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || t('auth.registerError');
      const errorCode = err.response?.data?.errorCode;

      if (errorCode === 'USER_ALREADY_EXISTS' || err.response?.status === 409) {
        setError('user_exists');
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicLayout maxWidth="container.xl">
      {/* Container do Formulário */}
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>{t('auth.registerTitle')}</h1>
          <p style={styles.subtitle}>{t('auth.registerSubtitle')}</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          {/* Nome */}
          <div style={styles.field}>
            <label style={styles.label}>{t('auth.fullName')}</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              style={styles.input}
              placeholder={t('auth.namePlaceholder')}
            />
          </div>

          {/* Email */}
          <div style={styles.field}>
            <label style={styles.label}>{t('auth.email')}</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              style={styles.input}
              placeholder={t('auth.emailPlaceholder')}
            />
          </div>

          {/* CPF */}
          <div style={styles.field}>
            <label style={styles.label}>{t('auth.cpf')}</label>
            <input
              type="text"
              name="cpf"
              value={formData.cpf}
              onChange={handleChange}
              required
              style={styles.input}
              placeholder="000.000.000-00"
              maxLength={14}
            />
          </div>

          {/* Telefone */}
          <div style={styles.field}>
            <label style={styles.label}>{t('auth.phone')}</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              required
              style={styles.input}
              placeholder="(00) 00000-0000"
              maxLength={15}
            />
          </div>

          {/* Senha */}
          <div style={styles.field}>
            <label style={styles.label}>{t('auth.password')}</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              style={styles.input}
              placeholder="••••••••"
            />
          </div>

          {/* Confirmar senha */}
          <div style={styles.field}>
            <label style={styles.label}>{t('auth.confirmPassword')}</label>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              style={styles.input}
              placeholder="••••••••"
            />
          </div>

          {/* Notificações */}
          <div style={styles.field}>
            <label style={styles.label}>
              {t('auth.notificationQuestion')}
            </label>

            {/* Email sempre ativo */}
            <div style={styles.infoBoxEmail}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={true}
                  disabled={true}
                  style={styles.checkbox}
                />
                <span>
                  <strong>{t('auth.emailAlwaysActive')}</strong>
                </span>
              </label>
              <p style={styles.infoTextSmall}>
                {t('auth.emailAlwaysActiveHint')}
              </p>
            </div>

            {/* Telegram opcional */}
            <div style={styles.checkboxContainer}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={formData.notifyTelegram}
                  onChange={(e) => handleTelegramCheckboxChange(e.target.checked)}
                  style={styles.checkbox}
                />
                <span>
                  <strong>{t('auth.telegramAlso')}</strong>
                </span>
              </label>
            </div>

            {/* Instruções para Telegram */}
            {formData.notifyTelegram && (
              <div style={styles.infoBox}>
                <p style={styles.infoTitle}>✨ {t('auth.telegramGreat')}</p>
                <p style={styles.infoText}>
                  {t('auth.telegramHint')}
                </p>
                <ol style={styles.stepsList}>
                  <li>{t('auth.telegramStep1')}</li>
                  <li>
                    {t('auth.telegramStep2')}{' '}
                    <a
                      href={TELEGRAM_BOT_LINK}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={styles.link}
                    >
                      @{TELEGRAM_BOT_USERNAME}
                    </a>{' '}
                    {t('auth.telegramStep3')}
                  </li>
                  <li>{t('auth.telegramStep4')}</li>
                </ol>
                <div style={styles.field}>
                  <label style={styles.labelSmall}>
                    {t('auth.telegramUsername')}
                  </label>
                  <input
                    type="text"
                    name="telegramUsername"
                    value={formData.telegramUsername}
                    onChange={handleChange}
                    style={styles.input}
                    placeholder={t('auth.telegramUsernamePlaceholder')}
                  />
                </div>
              </div>
            )}
          </div>

          {error && (
            <div style={styles.error}>
              {error === 'user_exists' ? (
                <>
                  <p style={{ margin: '0 0 12px 0' }}>
                    {t('auth.userExists')}
                  </p>
                  <Link to="/login" style={styles.errorLink}>
                    {t('auth.goToLogin')}
                  </Link>
                </>
              ) : (
                error
              )}
            </div>
          )}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? t('auth.registering') : t('auth.registerSubmit')}
          </button>
        </form>

          <p style={styles.footer}>
            {t('auth.alreadyHaveAccount')} <Link to="/login">{t('auth.loginHere')}</Link>
          </p>
        </div>
      </div>
    </PublicLayout>
  );
};

const styles = {
  header: {
    backgroundColor: 'white',
    borderBottom: '1px solid #e5e7eb',
    padding: responsive.spacing.md,
  },
  headerContent: {
    ...responsive.container,
  },
  logo: {
    ...responsive.typography.h2,
    textDecoration: 'none',
  },
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    ...responsive.card,
    maxWidth: '500px',
  },
  title: {
    ...responsive.typography.h1,
    marginBottom: responsive.spacing.xs,
    textAlign: 'center' as const,
  },
  subtitle: {
    ...responsive.typography.body,
    marginBottom: responsive.spacing.lg,
    textAlign: 'center' as const,
  },
  form: {
    ...responsive.flexColumn,
  },
  field: {
    ...responsive.formGroup,
  },
  label: {
    ...responsive.label,
  },
  labelSmall: {
    fontSize: 'clamp(12px, 2vw, 13px)',
    fontWeight: '500' as const,
    color: '#555',
  },
  input: {
    ...responsive.input,
  },
  checkboxContainer: {
    marginTop: responsive.spacing.xs,
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: responsive.spacing.xs,
    ...responsive.typography.small,
    cursor: 'pointer',
  },
  checkbox: {
    cursor: 'pointer',
    width: '18px',
    height: '18px',
  },
  infoBox: {
    backgroundColor: '#e0f2fe',
    border: '1px solid #7dd3fc',
    borderRadius: '6px',
    padding: responsive.spacing.md,
    marginTop: responsive.spacing.xs,
  },
  infoBoxEmail: {
    backgroundColor: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    padding: responsive.spacing.md,
    marginTop: responsive.spacing.xs,
  },
  infoTitle: {
    ...responsive.typography.small,
    fontWeight: '600' as const,
    color: '#0369a1',
    margin: `0 0 ${responsive.spacing.xs} 0`,
  },
  infoText: {
    ...responsive.typography.small,
    color: '#475569',
    margin: `0 0 ${responsive.spacing.sm} 0`,
  },
  infoTextSmall: {
    fontSize: 'clamp(11px, 1.5vw, 12px)',
    color: '#64748b',
    margin: `${responsive.spacing.xs} 0 0 0`,
  },
  stepsList: {
    ...responsive.typography.small,
    color: '#475569',
    paddingLeft: '20px',
    margin: `0 0 ${responsive.spacing.sm} 0`,
  },
  link: {
    color: '#3b82f6',
    textDecoration: 'none',
    fontWeight: '500' as const,
  },
  button: {
    ...responsive.buttonPrimary,
    marginTop: responsive.spacing.xs,
  },
  error: {
    ...responsive.typography.small,
    padding: responsive.spacing.sm,
    backgroundColor: '#fee',
    color: '#c33',
    borderRadius: '4px',
  },
  errorLink: {
    display: 'inline-block',
    color: '#c33',
    fontWeight: '600' as const,
    textDecoration: 'underline',
  },
  footer: {
    marginTop: responsive.spacing.md,
    textAlign: 'center' as const,
    ...responsive.typography.small,
  },
};
