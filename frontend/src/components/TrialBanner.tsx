import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { getToken } from '../services/tokenStorage';

/**
 * Banner para mostrar quando o trial está expirando
 * Aparece quando faltam entre 1 e 7 dias para expirar
 */

interface Subscription {
  status: string;
  trialEndsAt?: string | null;
  isTrial?: boolean;
  plan?: {
    name: string;
  };
}

interface UserData {
  user: {
    id: string;
    email: string;
    name: string;
    subscriptions?: Subscription[];
  };
}

export function TrialBanner() {
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserData();
  }, []);

  async function loadUserData() {
    try {
      const token = getToken();
      if (!token) {
        setLoading(false);
        return;
      }

      const data: UserData = await api.get('/api/auth/me', token);

      if (data.user?.subscriptions && data.user.subscriptions.length > 0) {
        const subscription = data.user.subscriptions[0];

        // Só mostra banner se for TRIAL e tiver trialEndsAt
        if (subscription.status === 'TRIAL' && subscription.trialEndsAt) {
          const endDate = new Date(subscription.trialEndsAt);
          const now = new Date();
          const diffTime = endDate.getTime() - now.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          // Mostra banner apenas se faltar entre 1 e 7 dias
          if (diffDays > 0 && diffDays <= 7) {
            setDaysRemaining(diffDays);
          }
        }
      }
    } catch (error) {
      console.error('Erro ao carregar dados do usuário:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading || daysRemaining === null) {
    return null;
  }

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <div style={styles.icon}>⏰</div>
        <div style={styles.message}>
          <strong>Seu trial expira em {daysRemaining} {daysRemaining === 1 ? 'dia' : 'dias'}.</strong>
          <span style={styles.submessage}>
            Escolha um plano para continuar usando o RadarOne.
          </span>
        </div>
        <Link to="/plans" style={styles.button}>
          Ver planos
        </Link>
      </div>
    </div>
  );
}

const styles = {
  container: {
    backgroundColor: '#fef3c7',
    borderLeft: '4px solid #f59e0b',
    padding: '16px',
    marginBottom: '24px',
    borderRadius: '4px',
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap' as const,
  },
  icon: {
    fontSize: '24px',
  },
  message: {
    flex: '1',
    minWidth: '200px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  submessage: {
    fontSize: '14px',
    color: '#92400e',
  },
  button: {
    backgroundColor: '#f59e0b',
    color: 'white',
    padding: '10px 20px',
    borderRadius: '6px',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '600' as const,
    whiteSpace: 'nowrap' as const,
  },
};
