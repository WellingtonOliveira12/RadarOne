import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { PublicLayout } from '../components/PublicLayout';
import { usePageMeta } from '../hooks/usePageMeta';

export const ContactPage: React.FC = () => {
  const { user } = useAuth();

  // SEO meta
  usePageMeta({
    title: 'Contato | RadarOne',
    description: 'Fale com o time do RadarOne para suporte e atendimento.',
  });
  const [category, setCategory] = useState('Suporte');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const categories = ['Suporte', 'Sugestão', 'Crítica', 'Financeiro', 'Outro'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !category || !subject || !message) {
      setError('Preencha todos os campos obrigatórios');
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
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar mensagem');
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
            <h1 style={styles.successTitle}>Mensagem enviada com sucesso!</h1>
            <p style={styles.successText}>
              Recebemos sua mensagem e retornaremos em até 24 horas úteis para
              o e-mail <strong>{email}</strong>.
            </p>
            <div style={styles.successButtons}>
              <button
                onClick={() => setSuccess(false)}
                style={styles.primaryButton}
              >
                Enviar outra mensagem
              </button>
              <Link to="/" style={styles.secondaryButton}>
                Voltar à página inicial
              </Link>
            </div>
          </div>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout maxWidth="container.md">
      <div style={styles.container}>
        <h1 style={styles.title}>Fale Conosco</h1>
        <p style={styles.subtitle}>
          Estamos aqui para ajudar! Envie sua mensagem e responderemos em breve.
        </p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          {/* Categoria */}
          <div style={styles.field}>
            <label style={styles.label}>
              Categoria <span style={styles.required}>*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={styles.select}
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Email */}
          <div style={styles.field}>
            <label style={styles.label}>
              Seu E-mail <span style={styles.required}>*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              placeholder="seu@email.com"
              required
            />
            <p style={styles.hint}>
              Usaremos este e-mail para responder sua mensagem
            </p>
          </div>

          {/* Assunto */}
          <div style={styles.field}>
            <label style={styles.label}>
              Assunto <span style={styles.required}>*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={styles.input}
              placeholder="Ex: Não recebo alertas no Telegram"
              required
            />
          </div>

          {/* Mensagem */}
          <div style={styles.field}>
            <label style={styles.label}>
              Mensagem <span style={styles.required}>*</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              style={styles.textarea}
              placeholder="Descreva sua dúvida, problema ou sugestão com o máximo de detalhes possível..."
              rows={6}
              required
            />
            <p style={styles.hint}>
              Quanto mais detalhes, melhor poderemos ajudar
            </p>
          </div>

          {/* Botões */}
          <div style={styles.buttons}>
            <button
              type="submit"
              disabled={submitting}
              style={styles.submitButton}
            >
              {submitting ? 'Enviando...' : 'Enviar Mensagem'}
            </button>
          </div>
        </form>

        {/* Links Úteis */}
        <div style={styles.helpSection}>
          <h3 style={styles.helpTitle}>Antes de enviar, já conferiu?</h3>
          <div style={styles.helpLinks}>
            <Link to="/faq" style={styles.helpLink}>
              📋 Perguntas Frequentes (FAQ)
            </Link>
            <Link to="/manual" style={styles.helpLink}>
              📖 Manual do Usuário
            </Link>
          </div>
        </div>

        {/* Informações de Contato */}
        <div style={styles.infoSection}>
          <h3 style={styles.infoTitle}>Outras formas de contato</h3>
          <p style={styles.infoText}>
            <strong>E-mail direto:</strong>{' '}
            <a href="mailto:contato@radarone.com.br" style={styles.link}>
              contato@radarone.com.br
            </a>
          </p>
          <p style={styles.infoText}>
            <strong>Horário de atendimento:</strong> Segunda a Sexta, 9h às 18h
            (Brasília)
          </p>
          <p style={styles.infoText}>
            <strong>Tempo de resposta:</strong> Até 24 horas úteis
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
