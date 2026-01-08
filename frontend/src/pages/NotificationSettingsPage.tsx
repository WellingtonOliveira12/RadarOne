import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Container } from '@chakra-ui/react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { AppLayout } from '../components/AppLayout';
import { TELEGRAM_BOT_USERNAME, TELEGRAM_BOT_LINK } from '../constants/app';
import * as responsive from '../styles/responsive';

/**
 * Configurações de Notificações
 */

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
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [telegramUsername, setTelegramUsername] = useState('');
  const [showLinkCodeModal, setShowLinkCodeModal] = useState(false);
  const [linkCodeData, setLinkCodeData] = useState<LinkCodeData | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await api.get('/api/notifications/settings');
      setSettings(data);
      setTelegramUsername(data.telegramUsername || '');
    } catch (err: any) {
      const isDev = import.meta.env.DEV;
      if (isDev) {
        console.error('NotificationSettings: Erro ao carregar', {
          endpoint: '/api/notifications/settings',
          status: err.status,
          message: err.message
        });
        setError(`Erro ao carregar configurações (${err.status || 'Network'}). Ver console.`);
      } else {
        setError('Erro ao carregar configurações. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await api.put('/api/notifications/settings', {
        telegramUsername: telegramUsername.trim() || null
      });

      setSuccess('Configurações salvas com sucesso!');
      loadSettings();
    } catch (err: any) {
      const isDev = import.meta.env.DEV;
      if (isDev) {
        console.error('NotificationSettings: Erro ao salvar', {
          endpoint: '/api/notifications/settings',
          status: err.status,
          message: err.message
        });
      }
      setError(err.message || 'Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateLinkCode = async () => {
    setGeneratingCode(true);
    setError('');

    try {
      const data = await api.post('/api/notifications/telegram/link-code', {});
      setLinkCodeData(data);
      setShowLinkCodeModal(true);
    } catch (err: any) {
      setError(err.message || 'Erro ao gerar código de vínculo');
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
      setSuccess('Mensagem de teste enviada para o Telegram!');
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar mensagem de teste');
    } finally {
      setTestingTelegram(false);
    }
  };

  const copyCode = () => {
    if (linkCodeData) {
      navigator.clipboard.writeText(linkCodeData.code);
      setSuccess('Código copiado!');
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <p>Carregando...</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Container maxW="container.xl" py={{ base: 6, md: 10 }}>
      <div style={styles.breadcrumb}>
        <Link to="/dashboard" style={styles.breadcrumbLink}>
          Dashboard
        </Link>
        <span style={styles.breadcrumbSeparator}>/</span>
        <span style={styles.breadcrumbCurrent}>Configurações de Notificações</span>
      </div>

      <h1 style={styles.title}>Configurações de Notificações</h1>
      <p style={styles.subtitle}>
        Configure como você quer receber os alertas de novos anúncios
      </p>

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
            Tentar novamente
          </button>
        </div>
      )}
      {success && <div style={styles.success}>{success}</div>}

      {settings && (
        <div style={styles.card}>
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Canal de notificação</h2>

            {/* Email - Sempre ativo */}
            <div style={styles.infoRow}>
              <div>
                <div style={styles.channelTitle}>E-mail</div>
                <div style={styles.channelSubtitle}>{user?.email}</div>
              </div>
              <span style={styles.badgeActive}>Sempre ativo</span>
            </div>

            {/* Telegram - Opcional */}
            <div style={styles.infoRow}>
              <div style={{ flex: 1 }}>
                <div style={styles.channelTitle}>Telegram (opcional)</div>
                {settings.telegramEnabled && settings.telegramUsername ? (
                  <div style={styles.channelSubtitle}>
                    Configurado: {settings.telegramUsername}
                    {settings.telegramChatId && (
                      <span style={styles.badgeConnected}> Vinculado</span>
                    )}
                  </div>
                ) : (
                  <div style={styles.channelSubtitle}>Não configurado</div>
                )}
              </div>
            </div>
          </div>

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Configurar Telegram</h2>

            <div style={styles.infoBox}>
              <p style={styles.infoTitle}>Como conectar o Telegram</p>
              <ol style={styles.stepsList}>
                <li>Digite seu @username do Telegram abaixo</li>
                <li>
                  Abra o Telegram e fale com{' '}
                  <a
                    href={TELEGRAM_BOT_LINK}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.link}
                  >
                    @{TELEGRAM_BOT_USERNAME}
                  </a>
                </li>
                <li>Digite /start para vincular sua conta</li>
                <li>Pronto! Você receberá alertas por e-mail E Telegram</li>
              </ol>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>
                Seu @username do Telegram
              </label>
              <input
                type="text"
                value={telegramUsername}
                onChange={(e) => setTelegramUsername(e.target.value)}
                style={styles.input}
                placeholder="@seunome"
              />
              <p style={styles.hint}>
                Deixe vazio para desabilitar notificações por Telegram
              </p>
            </div>

            <div style={styles.buttons}>
              <button onClick={handleSave} disabled={saving} style={styles.saveButton}>
                {saving ? 'Salvando...' : 'Salvar configurações'}
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
                  {generatingCode ? 'Gerando código...' : 'Vincular Telegram'}
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
                  {testingTelegram ? 'Enviando...' : 'Testar Telegram'}
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
            <h2 style={styles.modalTitle}>Vincular Telegram</h2>

            <div style={styles.codeBox}>
              <div style={styles.codeLabel}>Seu código:</div>
              <div style={styles.codeValue}>{linkCodeData.code}</div>
              <button onClick={copyCode} style={styles.copyButton}>
                Copiar código
              </button>
            </div>

            <div style={styles.instructionsBox}>
              <p style={styles.instructionsTitle}>Como vincular:</p>
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
              Fechar
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
  badgeActive: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
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
