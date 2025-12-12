import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

/**
 * AdminJobsPage - Dashboard de monitoramento de execuções de jobs
 * Acessível apenas para usuários com role ADMIN
 */

interface JobRun {
  id: string;
  event: string;
  createdAt: string;
  status: string;
  updatedCount?: number;
  executedAt?: string;
  error?: string | null;
  processed: boolean;
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface JobsResponse {
  data: JobRun[];
  pagination: PaginationInfo;
}

export const AdminJobsPage: React.FC = () => {
  const { logout } = useAuth();

  const [jobs, setJobs] = useState<JobRun[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filtros
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  useEffect(() => {
    loadJobs();
  }, [pagination.page, selectedEvent, selectedStatus]);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const queryParams = new URLSearchParams({
        page: pagination.page.toString(),
        pageSize: pagination.pageSize.toString(),
      });

      if (selectedEvent) {
        queryParams.append('event', selectedEvent);
      }

      if (selectedStatus) {
        queryParams.append('status', selectedStatus);
      }

      const response = await api.get<JobsResponse>(
        `/api/admin/jobs?${queryParams.toString()}`,
        token
      );

      setJobs(response.data);
      setPagination(response.pagination);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar execuções de jobs');
      console.error('Erro ao carregar jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  };

  const getStatusBadge = (status: string) => {
    const statusStyles: Record<string, { bg: string; text: string }> = {
      SUCCESS: { bg: '#d1fae5', text: '#065f46' },
      ERROR: { bg: '#fee2e2', text: '#991b1b' },
    };

    const style = statusStyles[status] || statusStyles.SUCCESS;

    return (
      <span
        style={{
          backgroundColor: style.bg,
          color: style.text,
          padding: '4px 12px',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: '600',
        }}
      >
        {status}
      </span>
    );
  };

  const getEventLabel = (event: string) => {
    const labels: Record<string, string> = {
      MONTHLY_QUERIES_RESET: '🔄 Reset Mensal',
      TRIAL_CHECK: '🎁 Verificação de Trial',
      SUBSCRIPTION_CHECK: '💳 Verificação de Assinatura',
    };
    return labels[event] || event;
  };

  const handlePreviousPage = () => {
    if (pagination.page > 1) {
      setPagination((prev) => ({ ...prev, page: prev.page - 1 }));
    }
  };

  const handleNextPage = () => {
    if (pagination.page < pagination.totalPages) {
      setPagination((prev) => ({ ...prev, page: prev.page + 1 }));
    }
  };

  const handleEventFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedEvent(e.target.value);
    setPagination((prev) => ({ ...prev, page: 1 })); // Reset para página 1
  };

  const handleStatusFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedStatus(e.target.value);
    setPagination((prev) => ({ ...prev, page: 1 })); // Reset para página 1
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <h1 style={styles.logo}>RadarOne Admin</h1>
          <nav style={styles.nav}>
            <Link to="/dashboard" style={styles.navLink}>
              Dashboard
            </Link>
            <Link to="/admin/jobs" style={styles.navLink}>
              Jobs
            </Link>
            <button onClick={logout} style={styles.logoutButton}>
              Sair
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <div style={styles.content}>
        {/* Page Title */}
        <section style={styles.welcomeSection}>
          <h1 style={styles.welcomeTitle}>Jobs & Monitoramento</h1>
          <p style={styles.welcomeSubtitle}>
            Visualize e monitore execuções de jobs automatizados
          </p>
        </section>

        {error && <div style={styles.error}>{error}</div>}

        {/* Filters */}
        <section style={styles.filtersSection}>
          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>Job / Evento:</label>
            <select
              value={selectedEvent}
              onChange={handleEventFilterChange}
              style={styles.filterSelect}
            >
              <option value="">Todos</option>
              <option value="MONTHLY_QUERIES_RESET">Reset Mensal</option>
              <option value="TRIAL_CHECK">Verificação de Trial</option>
              <option value="SUBSCRIPTION_CHECK">Verificação de Assinatura</option>
            </select>
          </div>

          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>Status:</label>
            <select
              value={selectedStatus}
              onChange={handleStatusFilterChange}
              style={styles.filterSelect}
            >
              <option value="">Todos</option>
              <option value="SUCCESS">Sucesso</option>
              <option value="ERROR">Erro</option>
            </select>
          </div>
        </section>

        {/* Jobs Table */}
        <section style={styles.tableSection}>
          {loading ? (
            <div style={styles.loadingContainer}>
              <p>Carregando...</p>
            </div>
          ) : (
            <>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeaderRow}>
                    <th style={styles.tableHeader}>Job / Evento</th>
                    <th style={styles.tableHeader}>Status</th>
                    <th style={styles.tableHeader}>Executado em</th>
                    <th style={styles.tableHeader}>Registros Atualizados</th>
                    <th style={styles.tableHeader}>Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={styles.emptyCell}>
                        Nenhuma execução de job encontrada
                      </td>
                    </tr>
                  ) : (
                    jobs.map((job) => (
                      <tr key={job.id} style={styles.tableRow}>
                        <td style={styles.tableCell}>
                          {getEventLabel(job.event)}
                        </td>
                        <td style={styles.tableCell}>
                          {getStatusBadge(job.status)}
                        </td>
                        <td style={styles.tableCell}>
                          {formatDate(job.createdAt)}
                        </td>
                        <td style={styles.tableCell}>
                          {job.updatedCount !== undefined
                            ? job.updatedCount
                            : '-'}
                        </td>
                        <td style={styles.tableCell}>
                          {job.error ? (
                            <span
                              style={styles.errorText}
                              title={job.error}
                            >
                              {job.error.substring(0, 50)}
                              {job.error.length > 50 ? '...' : ''}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div style={styles.pagination}>
                  <button
                    onClick={handlePreviousPage}
                    disabled={pagination.page === 1}
                    style={{
                      ...styles.paginationButton,
                      ...(pagination.page === 1 ? styles.paginationButtonDisabled : {}),
                    }}
                  >
                    ← Anterior
                  </button>

                  <span style={styles.paginationInfo}>
                    Página {pagination.page} de {pagination.totalPages} (Total:{' '}
                    {pagination.total})
                  </span>

                  <button
                    onClick={handleNextPage}
                    disabled={pagination.page === pagination.totalPages}
                    style={{
                      ...styles.paginationButton,
                      ...(pagination.page === pagination.totalPages
                        ? styles.paginationButtonDisabled
                        : {}),
                    }}
                  >
                    Próximo →
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
  },
  header: {
    backgroundColor: 'white',
    borderBottom: '1px solid #e5e7eb',
    padding: '16px 0',
  },
  headerContent: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '0 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logo: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
    margin: 0,
  },
  nav: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
  },
  navLink: {
    color: '#4b5563',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '500',
  },
  logoutButton: {
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  content: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '40px 20px',
  },
  welcomeSection: {
    marginBottom: '32px',
  },
  welcomeTitle: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '8px',
  },
  welcomeSubtitle: {
    fontSize: '16px',
    color: '#6b7280',
  },
  error: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '16px',
    borderRadius: '8px',
    marginBottom: '24px',
  },
  filtersSection: {
    backgroundColor: 'white',
    padding: '24px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    marginBottom: '24px',
    display: 'flex',
    gap: '24px',
    flexWrap: 'wrap' as const,
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  filterLabel: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
  },
  filterSelect: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    fontSize: '14px',
    backgroundColor: 'white',
    cursor: 'pointer',
    minWidth: '200px',
  },
  tableSection: {
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    overflow: 'hidden',
  },
  loadingContainer: {
    padding: '40px',
    textAlign: 'center' as const,
    color: '#6b7280',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
  },
  tableHeaderRow: {
    backgroundColor: '#f9fafb',
    borderBottom: '2px solid #e5e7eb',
  },
  tableHeader: {
    padding: '16px',
    textAlign: 'left' as const,
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
  },
  tableRow: {
    borderBottom: '1px solid #e5e7eb',
  },
  tableCell: {
    padding: '16px',
    fontSize: '14px',
    color: '#1f2937',
  },
  emptyCell: {
    padding: '40px',
    textAlign: 'center' as const,
    color: '#6b7280',
    fontSize: '14px',
  },
  errorText: {
    color: '#dc2626',
    fontSize: '13px',
    cursor: 'help',
  },
  pagination: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderTop: '1px solid #e5e7eb',
  },
  paginationButton: {
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  paginationButtonDisabled: {
    backgroundColor: '#d1d5db',
    cursor: 'not-allowed',
  },
  paginationInfo: {
    fontSize: '14px',
    color: '#6b7280',
  },
};
