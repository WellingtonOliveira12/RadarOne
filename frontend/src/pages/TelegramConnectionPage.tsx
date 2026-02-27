import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import { Container } from '@chakra-ui/react';
import { api } from '../services/api';
import { AppLayout } from '../components/AppLayout';
import { QRCodeSVG } from 'qrcode.react';
import { TELEGRAM_BOT_USERNAME } from '../constants/app';
import * as responsive from '../styles/responsive';

interface TelegramStatus {
  connected: boolean;
  chatId?: string;
  username?: string;
  connectedAt?: string;
}

interface ConnectTokenData {
  connectUrl: string;
  token: string;
  expiresAt: string;
  botUsername: string;
}

export const TelegramConnectionPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tokenData, setTokenData] = useState<ConnectTokenData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showWrongBotModal, setShowWrongBotModal] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const data = await api.request('/api/telegram/status', {
        method: 'GET',
        skipAutoLogout: true,
      });
      setStatus(data);
    } catch (err: any) {
      setError(err.message || t('telegramConnect.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateToken = async () => {
    setGenerating(true);
    setError('');
    setSuccess('');

    try {
      const data = await api.post('/api/telegram/connect-token', {});
      setTokenData(data);
    } catch (err: any) {
      setError(err.message || t('telegramConnect.generateError'));
    } finally {
      setGenerating(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm(t('telegramConnect.disconnectConfirm'))) {
      return;
    }

    try {
      await api.post('/api/telegram/disconnect', {});
      setSuccess(t('telegramConnect.disconnected'));
      setTokenData(null);
      loadStatus();
    } catch (err: any) {
      setError(err.message || t('telegramConnect.disconnectError'));
    }
  };

  const copyLink = () => {
    if (tokenData) {
      navigator.clipboard.writeText(tokenData.connectUrl);
      setSuccess(t('telegramConnect.linkCopied'));
      setTimeout(() => setSuccess(''), 2000);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <p>{t('common.loading')}</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Container maxW="container.xl" py={{ base: 6, md: 10 }}>
      <div style={styles.breadcrumb}>
        <Link to="/dashboard" style={styles.breadcrumbLink}>
          {t('telegramConnect.breadcrumbDashboard')}
        </Link>
        <span style={styles.breadcrumbSeparator}>/</span>
        <span style={styles.breadcrumbCurrent}>{t('telegramConnect.breadcrumbCurrent')}</span>
      </div>

      <h1 style={styles.title}>{t('telegramConnect.title')}</h1>
      <p style={styles.subtitle}>
        {t('telegramConnect.subtitle')}
      </p>

      {error && <div style={styles.error}>{error}</div>}
      {success && <div style={styles.success}>{success}</div>}

      {/* Status da Conexão */}
      {status && status.connected ? (
        <div style={styles.card}>
          <div style={styles.connectedHeader}>
            <div>
              <div style={styles.connectedTitle}>{t('telegramConnect.connected')}</div>
              {status.username && (
                <div style={styles.connectedSubtitle}>
                  {t('telegramConnect.account', { username: status.username })}
                </div>
              )}
              {status.connectedAt && (
                <div style={styles.connectedSubtitle}>
                  {t('telegramConnect.connectedAt', { date: new Date(status.connectedAt).toLocaleString(i18n.language) })}
                </div>
              )}
            </div>
            <div style={styles.buttons}>
              <button
                onClick={handleDisconnect}
                style={styles.disconnectButton}
              >
                {t('telegramConnect.disconnect')}
              </button>
              <button
                onClick={() => setShowWrongBotModal(true)}
                style={styles.helpButton}
              >
                {t('telegramConnect.noAlerts')}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Aviso Importante */}
          <div style={styles.warningBox}>
            <div style={styles.warningIcon}>⚠️</div>
            <div>
              <div style={styles.warningTitle}>
                {t('telegramConnect.warningTitle')}
              </div>
              <div style={styles.warningText}>
                {t('telegramConnect.warningText')}
              </div>
            </div>
          </div>

          {/* Instruções e Botões */}
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>{t('telegramConnect.howToConnect')}</h2>

            <div style={styles.checklist}>
              <div style={styles.checkItem}>
                <span style={styles.checkIcon}>✅</span>
                <span>{t('telegramConnect.step1')}</span>
              </div>
              <div style={styles.checkItem}>
                <span style={styles.checkIcon}>✅</span>
                <span>
                  <Trans i18nKey="telegramConnect.step2" values={{ bot: TELEGRAM_BOT_USERNAME }} components={{ strong: <strong /> }} />
                </span>
              </div>
              <div style={styles.checkItem}>
                <span style={styles.checkIcon}>✅</span>
                <span>{t('telegramConnect.step3')}</span>
              </div>
              <div style={styles.checkItem}>
                <span style={styles.checkIcon}>❌</span>
                <span>{t('telegramConnect.step4Wrong')}</span>
              </div>
            </div>

            <div style={styles.buttonGroup}>
              <button
                onClick={handleGenerateToken}
                disabled={generating}
                style={styles.primaryButton}
              >
                {generating
                  ? t('telegramConnect.generating')
                  : t('telegramConnect.generateLink')}
              </button>

              <button
                onClick={() => setShowWrongBotModal(true)}
                style={styles.secondaryButton}
              >
                {t('telegramConnect.wrongBot')}
              </button>
            </div>
          </div>

          {/* QR Code e Link */}
          {tokenData && (
            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>
                {t('telegramConnect.linkGenerated')}
              </h2>

              <div style={styles.qrSection}>
                <div style={styles.qrBox}>
                  <QRCodeSVG
                    value={tokenData.connectUrl}
                    size={200}
                    level="M"
                  />
                  <p style={styles.qrLabel}>
                    {t('telegramConnect.scanQr')}
                  </p>
                </div>

                <div style={styles.linkSection}>
                  <div style={styles.linkBox}>
                    <div style={styles.linkLabel}>
                      {t('telegramConnect.clickLink')}
                    </div>
                    <a
                      href={tokenData.connectUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={styles.linkButton}
                    >
                      {t('telegramConnect.openBot')}
                    </a>
                  </div>

                  <div style={styles.linkBox}>
                    <div style={styles.linkLabel}>{t('telegramConnect.copyLink')}</div>
                    <div style={styles.copyBox}>
                      <input
                        type="text"
                        value={tokenData.connectUrl}
                        readOnly
                        style={styles.input}
                      />
                      <button onClick={copyLink} style={styles.copyButton}>
                        {t('telegramConnect.copy')}
                      </button>
                    </div>
                  </div>

                  <div style={styles.expiresBox}>
                    {t('telegramConnect.linkExpires', { time: new Date(tokenData.expiresAt).toLocaleTimeString(i18n.language) })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal de Correção Bot Errado */}
      {showWrongBotModal && (
        <div
          style={styles.modalOverlay}
          onClick={() => setShowWrongBotModal(false)}
        >
          <div
            style={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={styles.modalTitle}>
              {t('telegramConnect.wrongBotModalTitle')}
            </h2>

            <div style={styles.modalBody}>
              <p>{t('telegramConnect.wrongBotModalIntro')}</p>

              <ol style={styles.stepsList}>
                <li>{t('telegramConnect.modalStep1')}</li>
                <li>{t('telegramConnect.modalStep2')}</li>
                <li>{t('telegramConnect.modalStep3')}</li>
                <li>
                  <Trans i18nKey="telegramConnect.modalStep4" values={{ bot: TELEGRAM_BOT_USERNAME }} components={{ strong: <strong /> }} />
                </li>
                <li>{t('telegramConnect.modalStep5')}</li>
              </ol>

              <div style={styles.modalTip}>
                <Trans i18nKey="telegramConnect.modalTip" components={{ strong: <strong /> }} />
              </div>
            </div>

            <button
              onClick={() => setShowWrongBotModal(false)}
              style={styles.closeButton}
            >
              {t('telegramConnect.understood')}
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
  },
  success: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
    padding: responsive.spacing.sm,
    borderRadius: '8px',
    marginBottom: responsive.spacing.md,
  },
  warningBox: {
    backgroundColor: '#fef3c7',
    border: '2px solid #f59e0b',
    borderRadius: '12px',
    padding: responsive.spacing.md,
    marginBottom: responsive.spacing.md,
    display: 'flex',
    gap: responsive.spacing.md,
    flexWrap: 'wrap' as const,
  },
  warningIcon: {
    fontSize: 'clamp(28px, 6vw, 32px)',
  },
  warningTitle: {
    ...responsive.typography.h3,
    color: '#92400e',
    marginBottom: responsive.spacing.xs,
  },
  warningText: {
    ...responsive.typography.small,
    color: '#78350f',
    lineHeight: 1.6,
  },
  card: {
    ...responsive.card,
    marginBottom: responsive.spacing.md,
  },
  connectedHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: responsive.spacing.md,
  },
  connectedTitle: {
    ...responsive.typography.h2,
    color: '#065f46',
    marginBottom: responsive.spacing.xs,
  },
  connectedSubtitle: {
    ...responsive.typography.small,
    marginBottom: responsive.spacing.xs,
  },
  buttons: {
    display: 'flex',
    gap: responsive.spacing.sm,
    flexWrap: 'wrap' as const,
  },
  disconnectButton: {
    ...responsive.buttonDanger,
  },
  helpButton: {
    ...responsive.buttonSecondary,
    border: '1px solid #d1d5db',
  },
  sectionTitle: {
    ...responsive.typography.h2,
    marginBottom: responsive.spacing.md,
  },
  checklist: {
    marginBottom: responsive.spacing.md,
  },
  checkItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: responsive.spacing.sm,
    marginBottom: responsive.spacing.sm,
    ...responsive.typography.small,
  },
  checkIcon: {
    fontSize: 'clamp(16px, 3vw, 18px)',
    flexShrink: 0,
  },
  buttonGroup: {
    display: 'flex',
    gap: responsive.spacing.sm,
    flexWrap: 'wrap' as const,
  },
  primaryButton: {
    ...responsive.buttonPrimary,
    padding: `${responsive.spacing.sm} ${responsive.spacing.md}`,
  },
  secondaryButton: {
    ...responsive.buttonSecondary,
    border: '1px solid #d1d5db',
    padding: `${responsive.spacing.sm} ${responsive.spacing.md}`,
  },
  qrSection: {
    ...responsive.grid,
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))',
  },
  qrBox: {
    textAlign: 'center' as const,
  },
  qrLabel: {
    ...responsive.typography.small,
    marginTop: responsive.spacing.sm,
  },
  linkSection: {
    ...responsive.flexColumn,
    gap: responsive.spacing.md,
  },
  linkBox: {
    marginBottom: responsive.spacing.xs,
  },
  linkLabel: {
    ...responsive.label,
    marginBottom: responsive.spacing.xs,
  },
  linkButton: {
    display: 'inline-block',
    ...responsive.button,
    backgroundColor: '#10b981',
    color: 'white',
    textDecoration: 'none',
  },
  copyBox: {
    display: 'flex',
    gap: responsive.spacing.xs,
    flexWrap: 'wrap' as const,
  },
  input: {
    ...responsive.input,
    flex: 1,
    minWidth: '200px',
    fontFamily: 'monospace',
  },
  copyButton: {
    ...responsive.buttonPrimary,
    whiteSpace: 'nowrap' as const,
  },
  expiresBox: {
    ...responsive.typography.small,
    color: '#f59e0b',
    backgroundColor: '#fef3c7',
    padding: responsive.spacing.xs,
    borderRadius: '6px',
    display: 'inline-block',
  },
  stepsList: {
    ...responsive.typography.small,
    paddingLeft: '20px',
    lineHeight: 1.8,
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
    maxWidth: '600px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  },
  modalTitle: {
    ...responsive.typography.h2,
    marginTop: 0,
    marginBottom: responsive.spacing.md,
  },
  modalBody: {
    marginBottom: responsive.spacing.md,
    lineHeight: 1.6,
  },
  modalTip: {
    backgroundColor: '#e0f2fe',
    border: '1px solid #7dd3fc',
    padding: responsive.spacing.sm,
    borderRadius: '6px',
    ...responsive.typography.small,
    color: '#0369a1',
    marginTop: responsive.spacing.md,
  },
  closeButton: {
    ...responsive.buttonPrimary,
    width: '100%',
  },
};
