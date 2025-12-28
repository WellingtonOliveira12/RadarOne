import React, { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { trackSignUp } from '../lib/analytics';
import { TELEGRAM_BOT_USERNAME, TELEGRAM_BOT_LINK } from '../constants/app';

/**
 * Página de Cadastro com CPF e preferências de notificação
 */

export const RegisterPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const selectedPlanFromUrl = searchParams.get('plan') || '';

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    cpf: '',
    phone: '',
    password: '',
    confirmPassword: '',
    notifyEmail: true,  // Email sempre ativo
    notifyTelegram: false,  // Telegram opcional
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
      setError('Email inválido');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }

    if (formData.password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres');
      return;
    }

    // Validação de força da senha (opcional mas recomendado)
    const hasLetter = /[a-zA-Z]/.test(formData.password);
    const hasNumber = /[0-9]/.test(formData.password);
    if (!hasLetter || !hasNumber) {
      setError('A senha deve conter letras e números');
      return;
    }

    const cleanCpf = formData.cpf.replace(/\D/g, '');
    if (cleanCpf.length !== 11) {
      setError('CPF inválido');
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

      // Track sign up
      trackSignUp('email');

      // Se veio de uma escolha de plano, redirecionar para planos
      // Caso contrário, ir direto para dashboard
      if (selectedPlanFromUrl) {
        navigate(`/plans?selected=${selectedPlanFromUrl}`);
      } else {
        navigate('/plans');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Erro ao criar conta. Tente novamente.';
      const errorCode = err.response?.data?.errorCode;

      // Se é erro de usuário já existente, mostrar mensagem especial
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
    <>
      {/* Header com Logo Clicável */}
      <div style={styles.header}>
        <div style={styles.headerContent}>
          <Link to="/" style={styles.logo}>
            RadarOne
          </Link>
        </div>
      </div>

      {/* Container do Formulário */}
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Criar Conta</h1>
          <p style={styles.subtitle}>Planos com 7 dias de garantia</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          {/* Nome */}
          <div style={styles.field}>
            <label style={styles.label}>Nome completo</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              style={styles.input}
              placeholder="Seu nome"
            />
          </div>

          {/* Email */}
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              style={styles.input}
              placeholder="seu@email.com"
            />
          </div>

          {/* CPF */}
          <div style={styles.field}>
            <label style={styles.label}>CPF</label>
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
            <label style={styles.label}>Telefone</label>
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
            <label style={styles.label}>Senha</label>
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
            <label style={styles.label}>Confirmar senha</label>
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
              Como você quer receber as notificações?
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
                  <strong>E-mail</strong> (sempre ativo)
                </span>
              </label>
              <p style={styles.infoTextSmall}>
                Você sempre receberá alertas por e-mail.
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
                  <strong>Receber também no Telegram</strong> (recomendado)
                </span>
              </label>
            </div>

            {/* Instruções para Telegram */}
            {formData.notifyTelegram && (
              <div style={styles.infoBox}>
                <p style={styles.infoTitle}>✨ Ótima escolha!</p>
                <p style={styles.infoText}>
                  Você receberá alertas em tempo real no Telegram + E-mail.
                </p>
                <ol style={styles.stepsList}>
                  <li>Instale o Telegram (se ainda não tiver)</li>
                  <li>
                    Fale com o{' '}
                    <a
                      href={TELEGRAM_BOT_LINK}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={styles.link}
                    >
                      @{TELEGRAM_BOT_USERNAME}
                    </a>{' '}
                    e clique em /start
                  </li>
                  <li>Vamos conectar automaticamente depois</li>
                </ol>
                <div style={styles.field}>
                  <label style={styles.labelSmall}>
                    Seu @username do Telegram (opcional)
                  </label>
                  <input
                    type="text"
                    name="telegramUsername"
                    value={formData.telegramUsername}
                    onChange={handleChange}
                    style={styles.input}
                    placeholder="@seunome"
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
                    Você já tem cadastro. Faça login para entrar.
                  </p>
                  <Link to="/login" style={styles.errorLink}>
                    Ir para login →
                  </Link>
                </>
              ) : (
                error
              )}
            </div>
          )}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Criando conta...' : 'Criar conta e usar 7 dias grátis'}
          </button>
        </form>

          <p style={styles.footer}>
            Já tem conta? <Link to="/login">Entre aqui</Link>
          </p>
        </div>
      </div>
    </>
  );
};

const styles = {
  header: {
    backgroundColor: 'white',
    borderBottom: '1px solid #e5e7eb',
    padding: '16px 0',
  },
  headerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 20px',
  },
  logo: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
    textDecoration: 'none',
  },
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 'calc(100vh - 60px)',
    backgroundColor: '#f5f5f5',
    padding: '40px 20px',
  },
  card: {
    backgroundColor: 'white',
    padding: '40px',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    width: '100%',
    maxWidth: '500px',
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '8px',
    textAlign: 'center' as const,
  },
  subtitle: {
    fontSize: '16px',
    color: '#666',
    marginBottom: '32px',
    textAlign: 'center' as const,
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#333',
  },
  labelSmall: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#555',
  },
  input: {
    padding: '12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
  },
  checkboxContainer: {
    marginTop: '8px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
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
    padding: '16px',
    marginTop: '8px',
  },
  infoBoxEmail: {
    backgroundColor: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    padding: '16px',
    marginTop: '8px',
  },
  infoTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#0369a1',
    margin: '0 0 8px 0',
  },
  infoText: {
    fontSize: '13px',
    color: '#475569',
    margin: '0 0 12px 0',
  },
  infoTextSmall: {
    fontSize: '12px',
    color: '#64748b',
    margin: '4px 0 0 0',
  },
  stepsList: {
    fontSize: '13px',
    color: '#475569',
    paddingLeft: '20px',
    margin: '0 0 12px 0',
  },
  link: {
    color: '#3b82f6',
    textDecoration: 'none',
    fontWeight: '500',
  },
  button: {
    padding: '12px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
    marginTop: '8px',
  },
  error: {
    padding: '12px',
    backgroundColor: '#fee',
    color: '#c33',
    borderRadius: '4px',
    fontSize: '14px',
  },
  errorLink: {
    display: 'inline-block',
    color: '#c33',
    fontWeight: '600',
    textDecoration: 'underline',
  },
  footer: {
    marginTop: '24px',
    textAlign: 'center' as const,
    fontSize: '14px',
    color: '#666',
  },
};
