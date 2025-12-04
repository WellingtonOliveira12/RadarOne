import React from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * Página do Dashboard
 * TODO: Implementar estatísticas, lista de monitores, uso de plano
 */

export const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();

  if (!user) {
    return <div>Carregando...</div>;
  }

  const activeSubscription = user.subscriptions?.[0];

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <h1 style={styles.logo}>RadarOne</h1>
        <div style={styles.userInfo}>
          <span>{user.name}</span>
          <button onClick={logout} style={styles.logoutButton}>
            Sair
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={styles.main}>
        <h2 style={styles.welcome}>Bem-vindo, {user.name}!</h2>

        {/* Subscription Info */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Sua Assinatura</h3>
          {activeSubscription ? (
            <div>
              <p>
                <strong>Plano:</strong> {activeSubscription.plan?.name || 'N/A'}
              </p>
              <p>
                <strong>Status:</strong> {activeSubscription.status}
              </p>
              <p>
                <strong>Consultas usadas:</strong>{' '}
                {activeSubscription.queriesUsed} /{' '}
                {activeSubscription.queriesLimit}
              </p>
              {/* TODO: Barra de progresso de uso */}
            </div>
          ) : (
            <div>
              <p>Você não possui assinatura ativa.</p>
              <button style={styles.button}>Ver Planos</button>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div style={styles.actionsGrid}>
          <div style={styles.actionCard}>
            <h4>Monitores</h4>
            <p>Gerencie seus monitores de anúncios</p>
            <button style={styles.actionButton}>Ver Monitores</button>
          </div>

          <div style={styles.actionCard}>
            <h4>Planos</h4>
            <p>Atualize ou mude seu plano</p>
            <button style={styles.actionButton}>Ver Planos</button>
          </div>

          <div style={styles.actionCard}>
            <h4>Histórico</h4>
            <p>Veja o histórico de consultas</p>
            <button style={styles.actionButton}>Ver Histórico</button>
          </div>
        </div>

        {/* TODO: Lista de monitores ativos */}
        {/* TODO: Gráficos de uso */}
        {/* TODO: Últimos anúncios encontrados */}
      </main>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: 'white',
    padding: '20px 40px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logo: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#007bff',
    margin: 0,
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  logoutButton: {
    padding: '8px 16px',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  main: {
    padding: '40px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  welcome: {
    fontSize: '28px',
    color: '#333',
    marginBottom: '32px',
  },
  card: {
    backgroundColor: 'white',
    padding: '24px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    marginBottom: '32px',
  },
  cardTitle: {
    fontSize: '20px',
    marginBottom: '16px',
    color: '#333',
  },
  button: {
    padding: '12px 24px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    marginTop: '16px',
  },
  actionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
  },
  actionCard: {
    backgroundColor: 'white',
    padding: '24px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  actionButton: {
    padding: '10px 20px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    marginTop: '16px',
    width: '100%',
  },
};
