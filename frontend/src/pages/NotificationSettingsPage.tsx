import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Container } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { AppLayout } from '../components/AppLayout';
import { TELEGRAM_BOT_USERNAME, TELEGRAM_BOT_LINK } from '../constants/app';
import * as responsive from '../styles/responsive';

interface NotificationSettings {
  emailEnabled: boolean;
  telegramEnabled: boolean;
  telegramUsername: string | null;
  telegramChatId: string | null;
  updatedAt: string;
}

interface LinkCodeData {
  code: string;
  expiresAt: string;
  botUsername: string;
  instructions: string[];
}

export const NotificationSettingsPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [emailEnabled, setEmailEnabled] = useState(true);
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramUsername, setTelegramUsername] = useState('');
  const [showLinkCodeModal, setShowLinkCodeModal] = useState(false);
  const [linkCodeData, setLinkCodeData] = useState<LinkCodeData | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const data = await api.request<NotificationSettings>('/api/notifications/settings', {
        method: 'GET',
        skipAutoLogout: true,
      });
      setSettings(data);
      setEmailEnabled(data.emailEnabled !== false);
      setTelegramEnabled(data.telegramEnabled === true);
      setTelegramUsername(data.telegramUsername || '');
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string };
      const isDev = import.meta.env.DEV;
      if (isDev) {
        console.error('NotificationSettings: Erro ao carregar', {
          endpoint: '/api/notifications/settings',
          status: apiErr.status,
          message: apiErr.message
        });
        setError(`${t('notification.errorLoad')} (${apiErr.status || 'Network'})`);
      } else {
        setError(t('notification.errorLoad'));
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    // Validação client-side: pelo menos 1 canal deve estar ativo
    if (!emailEnabled && !telegramEnabled) {
      setError(t('notification.validationAtLeastOne'));
      setSaving(false);
      return;
    }

    try {
      await api.put('/api/notifications/settings', {
        telegramUsername: telegramUsername.trim() || null,
        emailEnabled,
        telegramEnabled,
      });

      setSuccess(t('notification.saved'));
      loadSettings();
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string };
      const isDev = import.meta.env.DEV;
      if (isDev) {
        console.error('NotificationSettings: Erro ao salvar', {
          endpoint: '/api/notifications/settings',
          status: apiErr.status,
          message: apiErr.message
        });
      }
      setError(apiErr.message || t('notification.errorSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateLinkCode = async () => {
    setGeneratingCode(true);
    setError('');

    try {
      const data = await api.post<LinkCodeData>('/api/notifications/telegram/link-code', {});
      setLinkCodeData(data);
      setShowLinkCodeModal(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message || t('notification.errorLinkCode'));
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    setError('');
    setSuccess('');

    try {
      await api.post('/api/notifications/test-telegram', {});
      setSuccess(t('notification.testSent'));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message || t('notification.errorTestTelegram'));
    } finally {
      setTestingTelegram(false);
    }
  };

  const copyCode = () => {
    if (linkCodeData) {
      navigator.clipboard.writeText(linkCodeData.code);
      setSuccess(t('notification.codeCopied'));
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <p>{t('notification.loading')}</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Container maxW="container.xl" py={{ base: 6, md: 10 }}>
      <div style={styles.breadcrumb}>
        <Link to="/dashboard" style={styles.breadcrumbLink}>
          {t('common.dashboard')}
        </Link>
        <span style={styles.breadcrumbSeparator}>/</span>
        <span style={styles.breadcrumbCurrent}>{t('notification.breadcrumb')}</span>
      </div>

      <h1 style={styles.title}>{t('notification.title')}</h1>
      <p style={styles.subtitle}>{t('notification.subtitle')}</p>

      {error && (
        <div style={styles.error}>
          {error}
          <button
            onClick={() => {
              setError('');
              loadSettings();
            }}
            style={styles.retryButton}
          >
            {t('notification.tryAgain')}
          </button>
        </div>
      )}
      {success && <div style={styles.success}>{success}</div>}

      {settings && (
        <div style={styles.card}>
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>{t('notification.channelTitle')}</h2>

            {/* Email - Toggle */}
            <div style={styles.infoRow}>
              <div>
                <div style={styles.channelTitle}>{t('notification.email')}</div>
                <div style={styles.channelSubtitle}>{user?.email}</div>
              </div>
              <label style={styles.toggleLabel}>
                <input
                  type="checkbox"
                  checked={emailEnabled}
                  onChange={(e) => setEmailEnabled(e.target.checked)}
                  style={styles.toggleCheckbox}
                />
                <span style={emailEnabled ? styles.badgeActive : styles.badgeInactive}>
                  {emailEnabled ? t('notification.active') : t('notification.disabled')}
                </span>
              </label>
            </div>

            {/* Telegram - Toggle */}
            <div style={styles.infoRow}>
              <div style={{ flex: 1 }}>
                <div style={styles.channelTitle}>{t('notification.telegram')}</div>
                {settings.telegramUsername ? (
                  <div style={styles.channelSubtitle}>
                    {t('notification.configured')}: {settings.telegramUsername}
                    {settings.telegramChatId && (
                      <span style={styles.badgeConnected}> {t('notification.linked')}</span>
                    )}
                  </div>
                ) : (
                  <div style={styles.channelSubtitle}>{t('notification.notConfigured')}</div>
                )}
                {/* Aviso: ativado mas sem vínculo */}
                {telegramEnabled && !settings.telegramChatId && (
                  <div style={styles.warningText}>
                    {t('notification.warningLinkTelegram')}
                  </div>
                )}
              </div>
              <label style={styles.toggleLabel}>
                <input
                  type="checkbox"
                  checked={telegramEnabled}
                  onChange={(e) => setTelegramEnabled(e.target.checked)}
                  style={styles.toggleCheckbox}
                />
                <span style={telegramEnabled ? styles.badgeActive : styles.badgeInactive}>
                  {telegramEnabled ? t('notification.active') : t('notification.disabled')}
                </span>
              </label>
            </div>
          </div>

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>{t('notification.setupTelegram')}</h2>

            <div style={styles.infoBox}>
              <p style={styles.infoTitle}>{t('notification.howToConnect')}</p>
              <ol style={styles.stepsList}>
                <li>{t('notification.step1')}</li>
                <li>
                  {t('notification.step2')}{' '}
                  <a
                    href={TELEGRAM_BOT_LINK}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.link}
                  >
                    @{TELEGRAM_BOT_USERNAME}
                  </a>
                </li>
                <li>{t('notification.step3')}</li>
                <li>{t('notification.step4')}</li>
              </ol>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>
                {t('notification.usernameLabel')}
              </label>
              <input
                type="text"
                value={telegramUsername}
                onChange={(e) => setTelegramUsername(e.target.value)}
                style={styles.input}
                placeholder={t('notification.usernamePlaceholder')}
              />
              <p style={styles.hint}>
                {t('notification.usernameHint')}
              </p>
            </div>

            <div style={styles.buttons}>
              <button onClick={handleSave} disabled={saving} style={styles.saveButton}>
                {saving ? t('notification.saving') : t('notification.save')}
              </button>
            </div>

            {/* Botão de vincular Telegram */}
            {settings.telegramEnabled && !settings.telegramChatId && (
              <div style={{ marginTop: '16px' }}>
                <button
                  onClick={handleGenerateLinkCode}
                  disabled={generatingCode}
                  style={styles.linkButton}
                >
                  {generatingCode ? t('notification.generatingCode') : t('notification.linkTelegram')}
                </button>
              </div>
            )}

            {/* Botão de testar Telegram */}
            {settings.telegramEnabled && settings.telegramChatId && (
              <div style={{ marginTop: '16px' }}>
                <button
                  onClick={handleTestTelegram}
                  disabled={testingTelegram}
                  style={styles.testButton}
                >
                  {testingTelegram ? t('notification.sending') : t('notification.testTelegram')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal do Link Code */}
      {showLinkCodeModal && linkCodeData && (
        <div style={styles.modalOverlay} onClick={() => setShowLinkCodeModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>{t('notification.linkTitle')}</h2>

            <div style={styles.codeBox}>
              <div style={styles.codeLabel}>{t('notification.yourCode')}</div>
              <div style={styles.codeValue}>{linkCodeData.code}</div>
              <button onClick={copyCode} style={styles.copyButton}>
                {t('notification.copyCode')}
              </button>
            </div>

            <div style={styles.instructionsBox}>
              <p style={styles.instructionsTitle}>{t('notification.howToLink')}</p>
              <ol style={styles.instructionsList}>
                {linkCodeData.instructions.map((instruction, index) => (
                  <li key={index}>{instruction}</li>
                ))}
              </ol>
            </div>

            <button
              onClick={() => setShowLinkCodeModal(false)}
              style={styles.closeButton}
            >
              {t('notification.close')}
            </button>
          </div>
        </div>
      )}
      </Container>
    </AppLayout>
  );
};

const styles = {
  breadcrumb: {
    marginBottom: responsive.spacing.md,
    fontSize: 'clamp(13px, 2vw, 14px)',
  },
  breadcrumbLink: {
    color: '#3b82f6',
    textDecoration: 'none',
  },
  breadcrumbSeparator: {
    margin: `0 ${responsive.spacing.xs}`,
    color: '#9ca3af',
  },
  breadcrumbCurrent: {
    color: '#6b7280',
  },
  title: {
    ...responsive.typography.h1,
    marginBottom: responsive.spacing.xs,
  },
  subtitle: {
    ...responsive.typography.body,
    marginBottom: responsive.spacing.lg,
  },
  error: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: responsive.spacing.sm,
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
  success: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
    padding: responsive.spacing.sm,
    borderRadius: '8px',
    marginBottom: responsive.spacing.md,
  },
  card: {
    ...responsive.card,
  },
  section: {
    marginBottom: responsive.spacing.lg,
  },
  sectionTitle: {
    ...responsive.typography.h2,
    marginBottom: responsive.spacing.md,
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `${responsive.spacing.md} 0`,
    borderBottom: '1px solid #e5e7eb',
    gap: responsive.spacing.sm,
    flexWrap: 'wrap' as const,
  },
  channelTitle: {
    ...responsive.typography.body,
    fontWeight: '600' as const,
    marginBottom: responsive.spacing.xs,
  },
  channelSubtitle: {
    ...responsive.typography.small,
  },
  warningText: {
    ...responsive.typography.small,
    color: '#d97706',
    marginTop: responsive.spacing.xs,
    fontStyle: 'italic' as const,
  },
  toggleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: responsive.spacing.xs,
    cursor: 'pointer',
  },
  toggleCheckbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
    accentColor: '#10b981',
  },
  badgeActive: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
    padding: `${responsive.spacing.xs} ${responsive.spacing.sm}`,
    borderRadius: '6px',
    fontSize: 'clamp(12px, 2vw, 13px)',
    fontWeight: '600' as const,
    whiteSpace: 'nowrap' as const,
  },
  badgeInactive: {
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
    padding: `${responsive.spacing.xs} ${responsive.spacing.sm}`,
    borderRadius: '6px',
    fontSize: 'clamp(12px, 2vw, 13px)',
    fontWeight: '600' as const,
    whiteSpace: 'nowrap' as const,
  },
  badgeConnected: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    padding: `2px ${responsive.spacing.xs}`,
    borderRadius: '4px',
    fontSize: 'clamp(11px, 1.5vw, 11px)',
    fontWeight: '600' as const,
    marginLeft: responsive.spacing.xs,
  },
  field: {
    ...responsive.formGroup,
  },
  label: {
    ...responsive.label,
    display: 'block',
  },
  hint: {
    ...responsive.typography.small,
    marginTop: responsive.spacing.xs,
    margin: `${responsive.spacing.xs} 0 0 0`,
  },
  infoBox: {
    backgroundColor: '#e0f2fe',
    border: '1px solid #7dd3fc',
    borderRadius: '8px',
    padding: responsive.spacing.md,
    marginBottom: responsive.spacing.md,
  },
  infoTitle: {
    ...responsive.typography.small,
    fontWeight: '600' as const,
    color: '#0369a1',
    margin: `0 0 ${responsive.spacing.sm} 0`,
  },
  stepsList: {
    ...responsive.typography.small,
    color: '#475569',
    paddingLeft: '20px',
    margin: '0',
  },
  link: {
    color: '#3b82f6',
    textDecoration: 'none',
    fontWeight: '500' as const,
  },
  input: {
    ...responsive.input,
  },
  buttons: {
    display: 'flex',
    gap: responsive.spacing.sm,
    marginTop: '0',
    flexWrap: 'wrap' as const,
  },
  saveButton: {
    ...responsive.buttonPrimary,
  },
  linkButton: {
    ...responsive.button,
    backgroundColor: '#10b981',
    color: 'white',
  },
  testButton: {
    ...responsive.button,
    backgroundColor: '#8b5cf6',
    color: 'white',
  },
  modalOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: responsive.spacing.md,
  },
  modalContent: {
    backgroundColor: 'white',
    padding: responsive.spacing.lg,
    borderRadius: '12px',
    maxWidth: '500px',
    width: '100%',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    maxHeight: '90vh',
    overflow: 'auto',
  },
  modalTitle: {
    ...responsive.typography.h2,
    marginTop: 0,
    marginBottom: responsive.spacing.md,
  },
  codeBox: {
    backgroundColor: '#f3f4f6',
    padding: responsive.spacing.md,
    borderRadius: '8px',
    textAlign: 'center' as const,
    marginBottom: responsive.spacing.md,
  },
  codeLabel: {
    ...responsive.typography.small,
    marginBottom: responsive.spacing.xs,
  },
  codeValue: {
    fontSize: 'clamp(24px, 6vw, 32px)',
    fontWeight: 'bold' as const,
    color: '#1f2937',
    letterSpacing: '2px',
    marginBottom: responsive.spacing.md,
    fontFamily: 'monospace',
  },
  copyButton: {
    ...responsive.buttonPrimary,
  },
  instructionsBox: {
    marginBottom: responsive.spacing.md,
  },
  instructionsTitle: {
    ...responsive.typography.body,
    fontWeight: '600' as const,
    marginBottom: responsive.spacing.sm,
  },
  instructionsList: {
    ...responsive.typography.small,
    lineHeight: 1.6,
    paddingLeft: '20px',
    margin: 0,
  },
  closeButton: {
    ...responsive.buttonSecondary,
    width: '100%',
  },
};
