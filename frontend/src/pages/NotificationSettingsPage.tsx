import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { AppLayout } from '../components/AppLayout';

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
                    href="https://t.me/RadarOneBot"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.link}
                  >
                    @RadarOneBot
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
    </AppLayout>
  );
};

const styles = {
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
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
  },
  retryButton: {
    backgroundColor: '#991b1b',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  success: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  card: {
    backgroundColor: 'white',
    padding: '32px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  section: {
    marginBottom: '32px',
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: '20px',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 0',
    borderBottom: '1px solid #e5e7eb',
  },
  channelTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: '4px',
  },
  channelSubtitle: {
    fontSize: '14px',
    color: '#6b7280',
  },
  badgeActive: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
    padding: '4px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '600',
  },
  badgeConnected: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '600',
    marginLeft: '8px',
  },
  field: {
    marginBottom: '20px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#1f2937',
    display: 'block',
    marginBottom: '8px',
  },
  hint: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '6px',
    margin: '6px 0 0 0',
  },
  infoBox: {
    backgroundColor: '#e0f2fe',
    border: '1px solid #7dd3fc',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '20px',
  },
  infoTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#0369a1',
    margin: '0 0 12px 0',
  },
  stepsList: {
    fontSize: '13px',
    color: '#475569',
    paddingLeft: '20px',
    margin: '0',
  },
  link: {
    color: '#3b82f6',
    textDecoration: 'none',
    fontWeight: '500',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
  },
  buttons: {
    display: 'flex',
    gap: '12px',
    marginTop: '0',
  },
  saveButton: {
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  linkButton: {
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  testButton: {
    backgroundColor: '#8b5cf6',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
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
  },
  modalContent: {
    backgroundColor: 'white',
    padding: '32px',
    borderRadius: '12px',
    maxWidth: '500px',
    width: '90%',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  },
  modalTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 0,
    marginBottom: '24px',
  },
  codeBox: {
    backgroundColor: '#f3f4f6',
    padding: '20px',
    borderRadius: '8px',
    textAlign: 'center' as const,
    marginBottom: '24px',
  },
  codeLabel: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '8px',
  },
  codeValue: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#1f2937',
    letterSpacing: '2px',
    marginBottom: '16px',
    fontFamily: 'monospace',
  },
  copyButton: {
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  instructionsBox: {
    marginBottom: '24px',
  },
  instructionsTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: '12px',
  },
  instructionsList: {
    fontSize: '14px',
    color: '#4b5563',
    lineHeight: '1.6',
    paddingLeft: '20px',
    margin: 0,
  },
  closeButton: {
    backgroundColor: '#f3f4f6',
    color: '#1f2937',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    width: '100%',
  },
};
