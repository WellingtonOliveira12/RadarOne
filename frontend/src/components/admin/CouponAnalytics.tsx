import React, { useEffect, useState, useMemo, memo } from 'react';
import { getToken } from '../../lib/auth';
import { API_BASE_URL } from '../../constants/app';

interface CouponAnalytics {
  summary: {
    totalActiveCoupons: number;
    validationsLast7Days: number;
    conversionRate: number;
    abandonedCoupons: number;
    couponsByPurpose: Array<{
      purpose: string;
      count: number;
    }>;
  };
  topCoupons: Array<{
    code: string;
    validations: number;
    purpose: string;
  }>;
  validationsByDay: Array<{
    date: string;
    count: number;
    converted: number;
  }>;
}

interface ChartBarProps {
  day: {
    date: string;
    count: number;
    converted: number;
  };
  maxCount: number;
}

const ChartBar: React.FC<ChartBarProps> = memo(({ day, maxCount }) => {
  const dateStr = useMemo(() => {
    const date = new Date(day.date);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }, [day.date]);

  const barWidth = useMemo(() => {
    return maxCount > 0 ? `${Math.min(100, (day.count / maxCount) * 100)}%` : '0%';
  }, [day.count, maxCount]);

  const percentage = useMemo(() => {
    return day.count > 0 ? (day.converted / day.count) * 100 : 0;
  }, [day.count, day.converted]);

  return (
    <div style={styles.chartBar}>
      <div style={styles.chartLabel}>{dateStr}</div>
      <div style={styles.chartBarContainer}>
        <div
          style={{
            ...styles.chartBarFill,
            width: barWidth,
          }}
        />
      </div>
      <div style={styles.chartStats}>
        <span>{day.count} validações</span>
        <span style={styles.chartConversion}>{day.converted} convertidas ({percentage.toFixed(0)}%)</span>
      </div>
    </div>
  );
});

export const CouponAnalytics: React.FC = () => {
  const [analytics, setAnalytics] = useState<CouponAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const token = getToken();
      const response = await fetch(`${API_BASE_URL}/api/coupons/analytics`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Erro ao carregar analytics');

      const data = await response.json();
      setAnalytics(data);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();

    // Auto-refresh a cada 30 segundos
    const interval = setInterval(fetchAnalytics, 30000);
    return () => clearInterval(interval);
  }, []);

  const maxCount = useMemo(
    () => analytics
      ? Math.max(...analytics.validationsByDay.map((d) => d.count), 0)
      : 0,
    [analytics]
  );

  if (loading) {
    return (
      <div style={styles.container}>
        <p style={styles.loadingText}>Carregando analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <p style={styles.errorText}>❌ {error}</p>
      </div>
    );
  }

  if (!analytics) return null;

  const { summary, topCoupons, validationsByDay } = analytics;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>📊 Analytics de Cupons em Tempo Real</h2>
        <p style={styles.subtitle}>Atualização automática a cada 30s</p>
      </div>

      {/* Cards de Summary */}
      <div style={styles.cardsGrid}>
        <div style={styles.card}>
          <div style={styles.cardIcon}>🎫</div>
          <div style={styles.cardContent}>
            <p style={styles.cardLabel}>Cupons Ativos</p>
            <p style={styles.cardValue}>{summary.totalActiveCoupons}</p>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardIcon}>✅</div>
          <div style={styles.cardContent}>
            <p style={styles.cardLabel}>Validações (7 dias)</p>
            <p style={styles.cardValue}>{summary.validationsLast7Days}</p>
          </div>
        </div>

        <div style={{...styles.card, ...styles.cardHighlight}}>
          <div style={styles.cardIcon}>📈</div>
          <div style={styles.cardContent}>
            <p style={styles.cardLabel}>Taxa de Conversão</p>
            <p style={styles.cardValue}>{summary.conversionRate.toFixed(1)}%</p>
          </div>
        </div>

        <div style={{...styles.card, ...styles.cardWarning}}>
          <div style={styles.cardIcon}>⚠️</div>
          <div style={styles.cardContent}>
            <p style={styles.cardLabel}>Abandonos (24h)</p>
            <p style={styles.cardValue}>{summary.abandonedCoupons}</p>
          </div>
        </div>
      </div>

      {/* Cupons por Tipo */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Distribuição por Tipo</h3>
        <div style={styles.purposeGrid}>
          {summary.couponsByPurpose.map((item) => (
            <div key={item.purpose} style={styles.purposeCard}>
              <span style={styles.purposeBadge}>
                {item.purpose === 'TRIAL_UPGRADE' ? '🎁 Trial Upgrade' : '💰 Desconto'}
              </span>
              <span style={styles.purposeCount}>{item.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top 5 Cupons */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>🏆 Top 5 Cupons Mais Validados</h3>
        <div style={styles.table}>
          <div style={styles.tableHeader}>
            <span style={styles.tableHeaderCell}>Código</span>
            <span style={styles.tableHeaderCell}>Tipo</span>
            <span style={styles.tableHeaderCell}>Validações</span>
          </div>
          {topCoupons.map((coupon, index) => (
            <div key={index} style={styles.tableRow}>
              <span style={styles.tableCell}><strong>{coupon.code}</strong></span>
              <span style={styles.tableCell}>
                <span style={coupon.purpose === 'TRIAL_UPGRADE' ? styles.badgeUpgrade : styles.badgeDiscount}>
                  {coupon.purpose === 'TRIAL_UPGRADE' ? 'Upgrade' : 'Desconto'}
                </span>
              </span>
              <span style={styles.tableCell}>{coupon.validations}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Validações por Dia */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>📅 Validações Últimos 7 Dias</h3>
        <div style={styles.chartContainer}>
          {validationsByDay.map((day) => (
            <ChartBar key={day.date} day={day} maxCount={maxCount} />
          ))}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: '#f9fafb',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '32px',
    border: '1px solid #e5e7eb',
  },
  header: {
    marginBottom: '24px',
    textAlign: 'center' as const,
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#111827',
    margin: '0 0 8px 0',
  },
  subtitle: {
    fontSize: '14px',
    color: '#6b7280',
    margin: 0,
  },
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '32px',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  cardHighlight: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  cardWarning: {
    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
  },
  cardIcon: {
    fontSize: '32px',
  },
  cardContent: {
    flex: 1,
  },
  cardLabel: {
    fontSize: '12px',
    color: '#6b7280',
    margin: '0 0 4px 0',
    textTransform: 'uppercase' as const,
    fontWeight: '600',
  },
  cardValue: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#111827',
    margin: 0,
  },
  section: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#111827',
    marginTop: 0,
    marginBottom: '16px',
  },
  purposeGrid: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap' as const,
  },
  purposeCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    backgroundColor: '#f3f4f6',
    padding: '12px 16px',
    borderRadius: '6px',
  },
  purposeBadge: {
    fontSize: '14px',
    fontWeight: '500',
  },
  purposeCount: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#667eea',
  },
  table: {
    width: '100%',
  },
  tableHeader: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr',
    gap: '8px',
    padding: '12px',
    backgroundColor: '#f3f4f6',
    borderRadius: '6px',
    marginBottom: '8px',
  },
  tableHeaderCell: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase' as const,
  },
  tableRow: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr',
    gap: '8px',
    padding: '12px',
    borderBottom: '1px solid #e5e7eb',
  },
  tableCell: {
    fontSize: '14px',
    color: '#374151',
  },
  badgeUpgrade: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
  },
  badgeDiscount: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
  },
  chartContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  chartBar: {
    display: 'grid',
    gridTemplateColumns: '60px 1fr auto',
    gap: '12px',
    alignItems: 'center',
  },
  chartLabel: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#6b7280',
  },
  chartBarContainer: {
    height: '24px',
    backgroundColor: '#e5e7eb',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  chartBarFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
    transition: 'width 0.3s ease',
  },
  chartStats: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-end',
    fontSize: '12px',
    color: '#6b7280',
    minWidth: '140px',
  },
  chartConversion: {
    color: '#10b981',
    fontWeight: '500',
  },
  loadingText: {
    textAlign: 'center' as const,
    color: '#6b7280',
    fontSize: '14px',
  },
  errorText: {
    textAlign: 'center' as const,
    color: '#dc2626',
    fontSize: '14px',
  },
};
