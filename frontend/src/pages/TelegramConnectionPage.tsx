import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { AppLayout } from '../components/AppLayout';
import { QRCodeSVG } from 'qrcode.react';

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
      const data = await api.get('/api/telegram/status');
      setStatus(data);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar status');
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
      setError(err.message || 'Erro ao gerar link de conexão');
    } finally {
      setGenerating(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Deseja realmente desconectar o Telegram?')) {
      return;
    }

    try {
      await api.post('/api/telegram/disconnect', {});
      setSuccess('Telegram desconectado com sucesso');
      setTokenData(null);
      loadStatus();
    } catch (err: any) {
      setError(err.message || 'Erro ao desconectar');
    }
  };

  const copyLink = () => {
    if (tokenData) {
      navigator.clipboard.writeText(tokenData.connectUrl);
      setSuccess('Link copiado!');
      setTimeout(() => setSuccess(''), 2000);
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
        <span style={styles.breadcrumbCurrent}>Conectar Telegram</span>
      </div>

      <h1 style={styles.title}>Conecte seu Telegram para receber alertas</h1>
      <p style={styles.subtitle}>
        Receba notificações instantâneas de novos anúncios direto no Telegram
      </p>

      {error && <div style={styles.error}>{error}</div>}
      {success && <div style={styles.success}>{success}</div>}

      {/* Status da Conexão */}
      {status && status.connected ? (
        <div style={styles.card}>
          <div style={styles.connectedHeader}>
            <div>
              <div style={styles.connectedTitle}>✅ Telegram conectado</div>
              {status.username && (
                <div style={styles.connectedSubtitle}>
                  Conta: {status.username}
                </div>
              )}
              {status.connectedAt && (
                <div style={styles.connectedSubtitle}>
                  Conectado em:{' '}
                  {new Date(status.connectedAt).toLocaleString('pt-BR')}
                </div>
              )}
            </div>
            <div style={styles.buttons}>
              <button
                onClick={handleDisconnect}
                style={styles.disconnectButton}
              >
                Desconectar
              </button>
              <button
                onClick={() => setShowWrongBotModal(true)}
                style={styles.helpButton}
              >
                Não recebo alertas?
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
                Não pesquise no Telegram
              </div>
              <div style={styles.warningText}>
                Use apenas o link oficial abaixo para evitar conectar bots
                errados. Bots falsos podem ter nomes parecidos em outros
                idiomas.
              </div>
            </div>
          </div>

          {/* Instruções e Botões */}
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Como conectar</h2>

            <div style={styles.checklist}>
              <div style={styles.checkItem}>
                <span style={styles.checkIcon}>✅</span>
                <span>
                  Clique em "Gerar link de conexão" abaixo
                </span>
              </div>
              <div style={styles.checkItem}>
                <span style={styles.checkIcon}>✅</span>
                <span>
                  Abra o bot oficial:{' '}
                  <strong>@RadarOneAlertaBot</strong>
                </span>
              </div>
              <div style={styles.checkItem}>
                <span style={styles.checkIcon}>✅</span>
                <span>Aguarde a mensagem de confirmação</span>
              </div>
              <div style={styles.checkItem}>
                <span style={styles.checkIcon}>❌</span>
                <span>
                  Se aparecer bot com outro nome/idioma, você abriu o bot
                  errado
                </span>
              </div>
            </div>

            <div style={styles.buttonGroup}>
              <button
                onClick={handleGenerateToken}
                disabled={generating}
                style={styles.primaryButton}
              >
                {generating
                  ? 'Gerando...'
                  : 'Gerar link de conexão'}
              </button>

              <button
                onClick={() => setShowWrongBotModal(true)}
                style={styles.secondaryButton}
              >
                Estou no bot errado?
              </button>
            </div>
          </div>

          {/* QR Code e Link */}
          {tokenData && (
            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>
                Link gerado - Use uma das opções abaixo
              </h2>

              <div style={styles.qrSection}>
                <div style={styles.qrBox}>
                  <QRCodeSVG
                    value={tokenData.connectUrl}
                    size={200}
                    level="M"
                  />
                  <p style={styles.qrLabel}>
                    Escaneie com o Telegram (Desktop)
                  </p>
                </div>

                <div style={styles.linkSection}>
                  <div style={styles.linkBox}>
                    <div style={styles.linkLabel}>
                      Ou clique no link:
                    </div>
                    <a
                      href={tokenData.connectUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={styles.linkButton}
                    >
                      Abrir bot oficial no Telegram
                    </a>
                  </div>

                  <div style={styles.linkBox}>
                    <div style={styles.linkLabel}>Ou copie o link:</div>
                    <div style={styles.copyBox}>
                      <input
                        type="text"
                        value={tokenData.connectUrl}
                        readOnly
                        style={styles.input}
                      />
                      <button onClick={copyLink} style={styles.copyButton}>
                        Copiar
                      </button>
                    </div>
                  </div>

                  <div style={styles.expiresBox}>
                    ⏱️ Link expira em{' '}
                    {new Date(tokenData.expiresAt).toLocaleTimeString(
                      'pt-BR'
                    )}
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
              Como corrigir se conectou no bot errado
            </h2>

            <div style={styles.modalBody}>
              <p>
                Se você pesquisou no Telegram e caiu em um bot com nome
                parecido (ex: "Радар ONE Бот" em russo), siga os passos:
              </p>

              <ol style={styles.stepsList}>
                <li>Volte para esta página</li>
                <li>Clique em "Gerar link de conexão" novamente</li>
                <li>
                  Clique em "Abrir bot oficial no Telegram" (não pesquise!)
                </li>
                <li>
                  Confirme que o username é <strong>@RadarOneAlertaBot</strong>
                </li>
                <li>
                  Aguarde a mensagem "✅ Telegram conectado ao RadarOne"
                </li>
              </ol>

              <div style={styles.modalTip}>
                <strong>Dica:</strong> Sempre use o link oficial. Nunca
                pesquise "RadarOne" no Telegram.
              </div>
            </div>

            <button
              onClick={() => setShowWrongBotModal(false)}
              style={styles.closeButton}
            >
              Entendi
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
  },
  success: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  warningBox: {
    backgroundColor: '#fef3c7',
    border: '2px solid #f59e0b',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '24px',
    display: 'flex',
    gap: '16px',
  },
  warningIcon: {
    fontSize: '32px',
  },
  warningTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#92400e',
    marginBottom: '8px',
  },
  warningText: {
    fontSize: '14px',
    color: '#78350f',
    lineHeight: '1.6',
  },
  card: {
    backgroundColor: 'white',
    padding: '32px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    marginBottom: '24px',
  },
  connectedHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: '16px',
  },
  connectedTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#065f46',
    marginBottom: '8px',
  },
  connectedSubtitle: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '4px',
  },
  buttons: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap' as const,
  },
  disconnectButton: {
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  helpButton: {
    backgroundColor: '#f3f4f6',
    color: '#1f2937',
    border: '1px solid #d1d5db',
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: '20px',
  },
  checklist: {
    marginBottom: '24px',
  },
  checkItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    marginBottom: '12px',
    fontSize: '14px',
    color: '#4b5563',
  },
  checkIcon: {
    fontSize: '18px',
    flexShrink: 0,
  },
  buttonGroup: {
    display: 'flex',
    gap: '12px',
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
  },
  secondaryButton: {
    backgroundColor: 'white',
    color: '#1f2937',
    border: '1px solid #d1d5db',
    padding: '12px 24px',
    borderRadius: '6px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  qrSection: {
    display: 'grid',
    gridTemplateColumns: '200px 1fr',
    gap: '32px',
    '@media (max-width: 768px)': {
      gridTemplateColumns: '1fr',
    },
  },
  qrBox: {
    textAlign: 'center' as const,
  },
  qrLabel: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '12px',
  },
  linkSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  linkBox: {
    marginBottom: '8px',
  },
  linkLabel: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: '8px',
  },
  linkButton: {
    display: 'inline-block',
    backgroundColor: '#10b981',
    color: 'white',
    padding: '12px 24px',
    borderRadius: '6px',
    fontSize: '16px',
    fontWeight: '600',
    textDecoration: 'none',
  },
  copyBox: {
    display: 'flex',
    gap: '8px',
  },
  input: {
    flex: 1,
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    fontFamily: 'monospace',
  },
  copyButton: {
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  expiresBox: {
    fontSize: '12px',
    color: '#f59e0b',
    backgroundColor: '#fef3c7',
    padding: '8px 12px',
    borderRadius: '6px',
    display: 'inline-block',
  },
  stepsList: {
    paddingLeft: '20px',
    lineHeight: '1.8',
    color: '#4b5563',
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
    maxWidth: '600px',
    width: '90%',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  },
  modalTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 0,
    marginBottom: '24px',
  },
  modalBody: {
    marginBottom: '24px',
    lineHeight: '1.6',
  },
  modalTip: {
    backgroundColor: '#e0f2fe',
    border: '1px solid #7dd3fc',
    padding: '12px',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#0369a1',
    marginTop: '16px',
  },
  closeButton: {
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    width: '100%',
  },
};
