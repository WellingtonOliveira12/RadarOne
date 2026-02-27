import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { PublicLayout } from '../components/PublicLayout';
import { usePageMeta } from '../hooks/usePageMeta';

export const ContactPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();

  // SEO meta
  usePageMeta({
    title: `${t('contact.title')} | RadarOne`,
    description: t('contact.subtitle'),
  });
  const [category, setCategory] = useState('Suporte');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const categories = [
    { value: 'Suporte', label: t('contact.catSupport') },
    { value: 'Sugestão', label: t('contact.catSuggestion') },
    { value: 'Crítica', label: t('contact.catCriticism') },
    { value: 'Financeiro', label: t('contact.catFinancial') },
    { value: 'Outro', label: t('contact.catOther') },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !category || !subject || !message) {
      setError(t('contact.fillAll'));
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await api.post('/api/support/ticket', {
        email,
        category,
        subject,
        message,
      });

      setSuccess(true);
      setSubject('');
      setMessage('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message || t('contact.sendError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <PublicLayout maxWidth="container.md">
        <div style={styles.container}>
          <div style={styles.successCard}>
            <div style={styles.successIcon}>✅</div>
            <h1 style={styles.successTitle}>{t('contact.successTitle')}</h1>
            <p style={styles.successText}>
              {t('contact.successMessage')}{' '}
              <strong>{email}</strong>.
            </p>
            <div style={styles.successButtons}>
              <button
                onClick={() => setSuccess(false)}
                style={styles.primaryButton}
              >
                {t('contact.sendAnother')}
              </button>
              <Link to="/" style={styles.secondaryButton}>
                {t('contact.backHome')}
              </Link>
            </div>
          </div>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout maxWidth="container.xl">
      <div style={styles.container}>
        <h1 style={styles.title}>{t('contact.title')}</h1>
        <p style={styles.subtitle}>{t('contact.subtitle')}</p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          {/* Categoria */}
          <div style={styles.field}>
            <label style={styles.label}>
              {t('contact.category')} <span style={styles.required}>*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={styles.select}
            >
              {categories.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Email */}
          <div style={styles.field}>
            <label style={styles.label}>
              {t('contact.email')} <span style={styles.required}>*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              placeholder={t('auth.emailPlaceholder')}
              required
            />
            <p style={styles.hint}>
              {t('contact.emailHint')}
            </p>
          </div>

          {/* Assunto */}
          <div style={styles.field}>
            <label style={styles.label}>
              {t('contact.subject')} <span style={styles.required}>*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={styles.input}
              placeholder={t('contact.subjectPlaceholder')}
              required
            />
          </div>

          {/* Mensagem */}
          <div style={styles.field}>
            <label style={styles.label}>
              {t('contact.message')} <span style={styles.required}>*</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              style={styles.textarea}
              placeholder={t('contact.messagePlaceholder')}
              rows={6}
              required
            />
            <p style={styles.hint}>
              {t('contact.messageHint')}
            </p>
          </div>

          {/* Botões */}
          <div style={styles.buttons}>
            <button
              type="submit"
              disabled={submitting}
              style={styles.submitButton}
            >
              {submitting ? t('contact.submitting') : t('contact.submit')}
            </button>
          </div>
        </form>

        {/* Links Úteis */}
        <div style={styles.helpSection}>
          <h3 style={styles.helpTitle}>{t('contact.beforeSending')}</h3>
          <div style={styles.helpLinks}>
            <Link to="/faq" style={styles.helpLink}>
              📋 {t('contact.faqLink')}
            </Link>
            <Link to="/manual" style={styles.helpLink}>
              📖 {t('contact.manualLink')}
            </Link>
          </div>
        </div>

        {/* Informações de Contato */}
        <div style={styles.infoSection}>
          <h3 style={styles.infoTitle}>{t('contact.otherContact')}</h3>
          <p style={styles.infoText}>
            <strong>{t('contact.directEmail')}</strong>{' '}
            <a href="mailto:contato@radarone.com.br" style={styles.link}>
              contato@radarone.com.br
            </a>
          </p>
          <p style={styles.infoText}>
            <strong>{t('contact.hours')}</strong> {t('contact.hoursValue')}
          </p>
          <p style={styles.infoText}>
            <strong>{t('contact.responseTime')}</strong> {t('contact.responseTimeValue')}
          </p>
        </div>
      </div>
    </PublicLayout>
  );
};

const styles = {
  container: {
    maxWidth: '700px',
    margin: '0 auto',
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
  form: {
    backgroundColor: 'white',
    padding: '32px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    marginBottom: '24px',
  },
  field: {
    marginBottom: '24px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#1f2937',
    marginBottom: '8px',
  },
  required: {
    color: '#ef4444',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
    backgroundColor: 'white',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
    fontFamily: 'inherit',
    resize: 'vertical' as const,
  },
  hint: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '6px',
    margin: '6px 0 0 0',
  },
  buttons: {
    display: 'flex',
    gap: '12px',
  },
  submitButton: {
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    padding: '12px 32px',
    borderRadius: '6px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  helpSection: {
    backgroundColor: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: '12px',
    padding: '24px',
    textAlign: 'center' as const,
    marginBottom: '24px',
  },
  helpTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 0,
    marginBottom: '16px',
  },
  helpLinks: {
    display: 'flex',
    justifyContent: 'center',
    gap: '16px',
    flexWrap: 'wrap' as const,
  },
  helpLink: {
    display: 'inline-block',
    backgroundColor: 'white',
    color: '#1f2937',
    padding: '10px 20px',
    borderRadius: '6px',
    textDecoration: 'none',
    fontWeight: '500',
    border: '1px solid #d1d5db',
  },
  infoSection: {
    backgroundColor: 'white',
    padding: '24px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  infoTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 0,
    marginBottom: '16px',
  },
  infoText: {
    fontSize: '14px',
    color: '#4b5563',
    marginBottom: '8px',
    lineHeight: '1.6',
  },
  link: {
    color: '#3b82f6',
    textDecoration: 'none',
  },
  successCard: {
    backgroundColor: 'white',
    padding: '48px 32px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    textAlign: 'center' as const,
  },
  successIcon: {
    fontSize: '64px',
    marginBottom: '24px',
  },
  successTitle: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#065f46',
    marginBottom: '16px',
  },
  successText: {
    fontSize: '16px',
    color: '#4b5563',
    lineHeight: '1.6',
    marginBottom: '32px',
  },
  successButtons: {
    display: 'flex',
    justifyContent: 'center',
    gap: '16px',
    flexWrap: 'wrap' as const,
  },
  primaryButton: {
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '6px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    textDecoration: 'none',
  },
  secondaryButton: {
    backgroundColor: 'white',
    color: '#1f2937',
    border: '1px solid #d1d5db',
    padding: '12px 24px',
    borderRadius: '6px',
    fontSize: '16px',
    fontWeight: '600',
    textDecoration: 'none',
    display: 'inline-block',
  },
};
