import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Loader2, TrendingUp, CheckCircle2, XCircle, Clock, Activity } from 'lucide-react';
import { apiClient } from '../lib/api';

/**
 * Admin Worker Metrics Page
 *
 * Dashboard de métricas do worker de scraping
 * - Visão geral de performance
 * - Taxa de sucesso por fonte
 * - Timeline de execuções
 * - Erros mais comuns
 */

interface MetricsOverview {
  monitors: {
    total: number;
    active: number;
    inactive: number;
  };
  users: {
    total: number;
    withActiveSubscription: number;
  };
  performance: {
    successRate: number;
    totalChecks: number;
    successfulChecks: number;
    failedChecks: number;
  };
  adsBySource: Array<{
    source: string;
    count: number;
  }>;
}

interface PerformanceMetric {
  source: string;
  totalChecks: number;
  successRate: number;
  avgAdsPerCheck: number;
  avgNewAdsPerCheck: number;
  avgExecutionTime: number;
  failedChecks: number;
}

interface ErrorMetric {
  error: string;
  count: number;
  sources: string[];
  lastOccurrence: string;
}

export function AdminWorkerMetricsPage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<MetricsOverview | null>(null);
  const [performance, setPerformance] = useState<PerformanceMetric[]>([]);
  const [errors, setErrors] = useState<ErrorMetric[]>([]);

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    setLoading(true);

    try {
      const [overviewRes, performanceRes, errorsRes] = await Promise.all([
        apiClient.get('/metrics/overview'),
        apiClient.get('/metrics/performance?days=30'),
        apiClient.get('/metrics/errors?days=7&limit=5'),
      ]);

      setOverview(overviewRes.data);
      setPerformance(performanceRes.data);
      setErrors(errorsRes.data);
    } catch (error) {
      console.error('Erro ao carregar métricas:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Métricas do Worker</h1>
          <p className="text-gray-600 mt-1">Dashboard de performance e monitoramento</p>
        </div>
        <button
          onClick={loadMetrics}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2"
        >
          <Activity className="w-4 h-4" />
          Atualizar
        </button>
      </div>

      {/* Overview Cards */}
      {overview && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Taxa de Sucesso
              </CardTitle>
              <TrendingUp className="w-4 h-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {overview.performance.successRate.toFixed(1)}%
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {overview.performance.successfulChecks} de {overview.performance.totalChecks} checks
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Monitores Ativos
              </CardTitle>
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {overview.monitors.active}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                de {overview.monitors.total} monitores totais
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Checks com Sucesso
              </CardTitle>
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {overview.performance.successfulChecks}
              </div>
              <p className="text-xs text-gray-500 mt-1">Últimos 30 dias</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Checks com Erro
              </CardTitle>
              <XCircle className="w-4 h-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {overview.performance.failedChecks}
              </div>
              <p className="text-xs text-gray-500 mt-1">Últimos 30 dias</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Performance por Fonte */}
      <Card>
        <CardHeader>
          <CardTitle>Performance por Fonte</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fonte</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Checks</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Sucesso</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Anúncios/Check</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Novos/Check</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Tempo Médio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {performance.map((metric) => (
                  <tr key={metric.source} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{metric.source}</td>
                    <td className="px-4 py-3 text-sm text-center text-gray-600">{metric.totalChecks}</td>
                    <td className="px-4 py-3 text-sm text-center">
                      <span className={`font-medium ${metric.successRate >= 80 ? 'text-green-600' : metric.successRate >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {metric.successRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-gray-600">
                      {metric.avgAdsPerCheck.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-gray-600">
                      {metric.avgNewAdsPerCheck.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-gray-600 flex items-center justify-center gap-1">
                      <Clock className="w-3 h-3" />
                      {(metric.avgExecutionTime / 1000).toFixed(1)}s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Top Erros */}
      <Card>
        <CardHeader>
          <CardTitle>Erros Mais Comuns (Últimos 7 dias)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {errors.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Nenhum erro registrado 🎉</p>
            ) : (
              errors.map((error, index) => (
                <div key={index} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        <p className="text-sm font-medium text-gray-900">{error.error}</p>
                      </div>
                      <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                        <span>{error.count} ocorrências</span>
                        <span>•</span>
                        <span>Fontes: {error.sources.join(', ')}</span>
                        <span>•</span>
                        <span>Última: {new Date(error.lastOccurrence).toLocaleDateString('pt-BR')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
