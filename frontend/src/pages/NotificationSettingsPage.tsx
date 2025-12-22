import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { AppLayout } from '../components/AppLayout';

/**
 * Configurações de Notificações
 */

type NotificationPreference = 'TELEGRAM' | 'EMAIL';

interface NotificationSettings {
  email: string;
  notificationPreference: NotificationPreference;
  telegramConnected: boolean;
  telegramUsername?: string;
  telegramChatId?: string;
}

export const NotificationSettingsPage: React.FC = () => {
  useAuth(); // Required for protected route
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    notificationPreference: 'EMAIL' as NotificationPreference,
    telegramUsername: '',
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // Usar client API que lida com token automaticamente
      const data = await api.get('/api/me');
      const telegramAccount = data.user.telegramAccounts?.[0];

      const loadedSettings: NotificationSettings = {
        email: data.user.email,
        notificationPreference: telegramAccount ? 'TELEGRAM' : 'EMAIL',
        telegramConnected: !!telegramAccount,
        telegramUsername: telegramAccount?.username || '',
        telegramChatId: telegramAccount?.chatId || '',
      };

      setSettings(loadedSettings);
      setFormData({
        notificationPreference: loadedSettings.notificationPreference,
        telegramUsername: loadedSettings.telegramUsername || '',
      });
    } catch (err: any) {
      // Diagnóstico melhorado em DEV
      const isDev = import.meta.env.DEV;
      if (isDev) {
        console.error('NotificationSettings: Erro ao carregar configurações', {
          endpoint: '/api/me',
          status: err.status,
          errorCode: err.errorCode,
          message: err.message,
          data: err.data
        });
        setError(`Erro ao carregar configurações (${err.status || 'Network'} - ${err.errorCode || 'UNKNOWN'}). Ver console.`);
      } else {
        setError('Erro ao carregar configurações. Tente novamente mais tarde.');
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
      // Por enquanto, apenas salvar se tiver telegram username
      // A vinculação real do chatId acontece quando o usuário conecta no bot
      const updateData: any = {};
      if (formData.telegramUsername) {
        updateData.telegramUsername = formData.telegramUsername;
        // Precisaria do chatId, mas isso virá do bot do Telegram
        // updateData.telegramChatId = '...';
      }

      // Usar client API que lida com token automaticamente
      await api.post('/api/me/notifications', updateData);

      setSuccess('Configurações salvas com sucesso!');
      setEditing(false);
      loadSettings();
    } catch (err: any) {
      // Diagnóstico melhorado em DEV
      const isDev = import.meta.env.DEV;
      if (isDev) {
        console.error('NotificationSettings: Erro ao salvar', {
          endpoint: '/api/me/notifications',
          status: err.status,
          errorCode: err.errorCode,
          message: err.message,
          data: err.data
        });
      }
      setError(err.message || 'Erro ao salvar configurações');
    } finally {
      setSaving(false);
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
          Escolha como você quer receber os alertas de novos anúncios
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
            {/* Current Settings */}
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>Configurações atuais</h2>

              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>E-mail:</span>
                <span style={styles.infoValue}>{settings.email}</span>
              </div>

              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>Preferência:</span>
                <span style={styles.infoValue}>
                  {settings.notificationPreference === 'TELEGRAM' ? (
                    <span style={styles.badgeTelegram}>📱 Telegram</span>
                  ) : (
                    <span style={styles.badgeEmail}>📧 E-mail</span>
                  )}
                </span>
              </div>

              {settings.telegramConnected && (
                <div style={styles.infoRow}>
                  <span style={styles.infoLabel}>Telegram:</span>
                  <span style={styles.infoValue}>
                    <span style={styles.badgeConnected}>✅ Conectado</span>
                    {settings.telegramUsername && (
                      <span style={styles.username}>{settings.telegramUsername}</span>
                    )}
                  </span>
                </div>
              )}
            </div>

            {/* Edit Form */}
            {editing ? (
              <div style={styles.section}>
                <h2 style={styles.sectionTitle}>Alterar configurações</h2>

                <div style={styles.field}>
                  <label style={styles.label}>
                    Como você quer receber notificações?
                  </label>
                  <div style={styles.radioGroup}>
                    <label style={styles.radioLabel}>
                      <input
                        type="radio"
                        name="notificationPreference"
                        checked={formData.notificationPreference === 'TELEGRAM'}
                        onChange={() =>
                          setFormData({ ...formData, notificationPreference: 'TELEGRAM' })
                        }
                        style={styles.radio}
                      />
                      <span>
                        <strong>Telegram</strong> (recomendado)
                      </span>
                    </label>
                    <label style={styles.radioLabel}>
                      <input
                        type="radio"
                        name="notificationPreference"
                        checked={formData.notificationPreference === 'EMAIL'}
                        onChange={() =>
                          setFormData({ ...formData, notificationPreference: 'EMAIL' })
                        }
                        style={styles.radio}
                      />
                      <span>E-mail</span>
                    </label>
                  </div>
                </div>

                {formData.notificationPreference === 'TELEGRAM' && (
                  <div style={styles.infoBox}>
                    <p style={styles.infoTitle}>✨ Como conectar o Telegram</p>
                    <ol style={styles.stepsList}>
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
                      <li>Digite /start para conectar sua conta</li>
                      <li>Pronto! Você receberá os alertas em tempo real</li>
                    </ol>

                    <div style={styles.field}>
                      <label style={styles.labelSmall}>
                        Seu @username do Telegram (opcional)
                      </label>
                      <input
                        type="text"
                        value={formData.telegramUsername}
                        onChange={(e) =>
                          setFormData({ ...formData, telegramUsername: e.target.value })
                        }
                        style={styles.input}
                        placeholder="@seunome"
                      />
                    </div>
                  </div>
                )}

                <div style={styles.buttons}>
                  <button onClick={handleSave} disabled={saving} style={styles.saveButton}>
                    {saving ? 'Salvando...' : 'Salvar alterações'}
                  </button>
                  <button
                    onClick={() => {
                      setEditing(false);
                      setFormData({
                        notificationPreference: settings.notificationPreference,
                        telegramUsername: settings.telegramUsername || '',
                      });
                    }}
                    style={styles.cancelButton}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setEditing(true)} style={styles.editButton}>
                Alterar configurações
              </button>
            )}
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
    padding: '12px 0',
    borderBottom: '1px solid #e5e7eb',
  },
  infoLabel: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#6b7280',
  },
  infoValue: {
    fontSize: '14px',
    color: '#1f2937',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  badgeTelegram: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    padding: '4px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '600',
  },
  badgeEmail: {
    backgroundColor: '#f3f4f6',
    color: '#374151',
    padding: '4px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '600',
  },
  badgeConnected: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
    padding: '4px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '600',
  },
  username: {
    color: '#6b7280',
    fontSize: '13px',
  },
  field: {
    marginBottom: '20px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#333',
    display: 'block',
    marginBottom: '8px',
  },
  labelSmall: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#555',
    display: 'block',
    marginBottom: '6px',
  },
  radioGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    cursor: 'pointer',
  },
  radio: {
    cursor: 'pointer',
  },
  infoBox: {
    backgroundColor: '#e0f2fe',
    border: '1px solid #7dd3fc',
    borderRadius: '8px',
    padding: '16px',
    marginTop: '16px',
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
    margin: '0 0 16px 0',
  },
  link: {
    color: '#3b82f6',
    textDecoration: 'none',
    fontWeight: '500',
  },
  input: {
    width: '100%',
    padding: '10px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
  },
  buttons: {
    display: 'flex',
    gap: '12px',
    marginTop: '24px',
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
  cancelButton: {
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  editButton: {
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
};
