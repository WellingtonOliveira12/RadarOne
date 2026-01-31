import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

type NotificationChannel = 'EMAIL' | 'TELEGRAM';
type NotificationStatus = 'SUCCESS' | 'FAILED';

interface NotificationLog {
  id: string;
  channel: NotificationChannel;
  title: string;
  message: string;
  target: string;
  status: NotificationStatus;
  error?: string;
  createdAt: string;
}

interface NotificationHistoryResponse {
  data: NotificationLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export function NotificationHistoryPage() {
  const { logout } = useAuth();
  const [notifications, setNotifications] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchNotifications(page);
  }, [page]);

  async function fetchNotifications(currentPage: number) {
    try {
      setLoading(true);
      setError('');

      const response = await api.request<NotificationHistoryResponse>(
        `/api/notifications/history?page=${currentPage}&limit=20`, {
          method: 'GET',
          skipAutoLogout: true,
        }
      );

      if (!response || !response.data) {
        throw new Error('Erro ao carregar histórico de notificações');
      }

      setNotifications(response.data);
      setTotalPages(response.pagination.totalPages);
      setTotal(response.pagination.total);
    } catch (err: any) {
      console.error('Erro ao buscar notificações:', err);

      // Se for erro 401, fazer logout
      if (err.message?.includes('401') || err.message?.includes('autenticado')) {
        logout();
        return;
      }

      setError('Erro ao carregar histórico de notificações. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  function getChannelLabel(channel: NotificationChannel) {
    return channel === 'EMAIL' ? 'Email' : 'Telegram';
  }

  function getChannelIcon(channel: NotificationChannel) {
    return channel === 'EMAIL' ? '📧' : '💬';
  }

  function getStatusBadge(status: NotificationStatus) {
    if (status === 'SUCCESS') {
      return (
        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
          Enviado
        </span>
      );
    }
    return (
      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
        Falhou
      </span>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="container mx-auto px-4 py-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="text-blue-600 hover:text-blue-700">
              ← Voltar
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Histórico de Notificações</h1>
          </div>
          <button
            onClick={logout}
            className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 transition-colors"
          >
            Sair
          </button>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="container mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Carregando notificações...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600 text-lg">Nenhuma notificação encontrada.</p>
            <p className="text-gray-500 mt-2">
              Quando você receber notificações, elas aparecerão aqui.
            </p>
          </div>
        ) : (
          <>
            {/* Informação de total */}
            <div className="mb-4 text-sm text-gray-600">
              Total: {total} notificação{total !== 1 ? 'ões' : ''} encontrada{total !== 1 ? 's' : ''}
            </div>

            {/* Tabela de notificações */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Data
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Canal
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Título
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Destino
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {notifications.map((notification) => (
                      <tr key={notification.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatDate(notification.createdAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className="flex items-center gap-2">
                            {getChannelIcon(notification.channel)}
                            {getChannelLabel(notification.channel)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 max-w-md">
                          <div className="truncate" title={notification.title}>
                            {notification.title}
                          </div>
                          {notification.error && (
                            <div className="text-xs text-red-600 mt-1 truncate" title={notification.error}>
                              Erro: {notification.error}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {notification.target}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {getStatusBadge(notification.status)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <span className="text-sm text-gray-600">
                  Página {page} de {totalPages}
                </span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page === totalPages}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Próxima
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
