import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Heading,
  SimpleGrid,
  Card,
  CardBody,
  CardHeader,
  Badge,
  Spinner,
  Center,
  Alert,
  AlertIcon,
  VStack,
  HStack,
  Text,
  Progress,
  Stat,
  StatLabel,
  StatNumber,
  Tooltip,
} from '@chakra-ui/react';
import { AdminLayout } from '../components/AdminLayout';
import { api } from '../services/api';

interface SiteHealth {
  site: string;
  siteName: string;
  totalRunsLast24h: number;
  successRate: number;
  lastRunAt: string | null;
  lastPageType: string | null;
  lastAdsFound: number;
  consecutiveFailures: number;
  avgDurationMs: number;
  activeMonitorsCount: number;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'NO_DATA';
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  HEALTHY: { color: 'green', label: 'Saudavel' },
  WARNING: { color: 'yellow', label: 'Atencao' },
  CRITICAL: { color: 'red', label: 'Critico' },
  NO_DATA: { color: 'gray', label: 'Sem Dados' },
};

const STATUS_ORDER: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  HEALTHY: 2,
  NO_DATA: 3,
};

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Nunca';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Agora';
  if (mins < 60) return `${mins}min atras`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atras`;
  const days = Math.floor(hours / 24);
  return `${days}d atras`;
}

function formatDuration(ms: number): string {
  if (ms === 0) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function AdminSiteHealthPage() {
  const [sites, setSites] = useState<SiteHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    try {
      const data = await api.request('/api/admin/site-health', {
        skipAutoLogout: true,
      });
      const sorted = [...data].sort(
        (a: SiteHealth, b: SiteHealth) =>
          (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
      );
      setSites(sorted);
      setError(null);
      setLastRefresh(new Date());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message || 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <AdminLayout>
      <VStack align="stretch" spacing={6}>
        <HStack justify="space-between" wrap="wrap">
          <Heading size="lg">Saude dos Sites</Heading>
          <HStack spacing={3}>
            <Text fontSize="xs" color="gray.500">
              Atualizado: {lastRefresh.toLocaleTimeString('pt-BR')}
            </Text>
            <Badge colorScheme="blue" variant="subtle" fontSize="xs">
              Auto-refresh 60s
            </Badge>
          </HStack>
        </HStack>

        {error && (
          <Alert status="error" borderRadius="md">
            <AlertIcon />
            {error}
          </Alert>
        )}

        {loading ? (
          <Center py={20}>
            <Spinner size="xl" color="blue.500" thickness="4px" />
          </Center>
        ) : (
          <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={5}>
            {sites.map((site) => {
              const cfg = STATUS_CONFIG[site.status] || STATUS_CONFIG.NO_DATA;
              return (
                <Card
                  key={site.site}
                  variant="outline"
                  borderLeft="4px solid"
                  borderLeftColor={`${cfg.color}.400`}
                >
                  <CardHeader pb={2}>
                    <HStack justify="space-between">
                      <Text fontWeight="bold" fontSize="md">
                        {site.siteName}
                      </Text>
                      <Badge colorScheme={cfg.color} fontSize="xs">
                        {cfg.label}
                      </Badge>
                    </HStack>
                  </CardHeader>
                  <CardBody pt={0}>
                    <VStack align="stretch" spacing={3}>
                      {/* Taxa de Sucesso */}
                      <Box>
                        <HStack justify="space-between" mb={1}>
                          <Text fontSize="xs" color="gray.500">
                            Taxa de Sucesso
                          </Text>
                          <Text fontSize="xs" fontWeight="bold">
                            {site.totalRunsLast24h > 0
                              ? `${site.successRate}%`
                              : '-'}
                          </Text>
                        </HStack>
                        <Progress
                          value={site.successRate}
                          size="sm"
                          colorScheme={
                            site.successRate >= 85
                              ? 'green'
                              : site.successRate >= 60
                                ? 'yellow'
                                : 'red'
                          }
                          borderRadius="full"
                          bg="gray.100"
                        />
                      </Box>

                      {/* Stats Grid */}
                      <SimpleGrid columns={2} spacing={2}>
                        <Stat size="sm">
                          <StatLabel fontSize="xs">Execucoes 24h</StatLabel>
                          <StatNumber fontSize="md">
                            {site.totalRunsLast24h}
                          </StatNumber>
                        </Stat>
                        <Stat size="sm">
                          <StatLabel fontSize="xs">Monitores Ativos</StatLabel>
                          <StatNumber fontSize="md">
                            {site.activeMonitorsCount}
                          </StatNumber>
                        </Stat>
                        <Stat size="sm">
                          <StatLabel fontSize="xs">Tempo Medio</StatLabel>
                          <StatNumber fontSize="md">
                            {formatDuration(site.avgDurationMs)}
                          </StatNumber>
                        </Stat>
                        <Stat size="sm">
                          <StatLabel fontSize="xs">Falhas Consecutivas</StatLabel>
                          <StatNumber
                            fontSize="md"
                            color={
                              site.consecutiveFailures >= 5
                                ? 'red.500'
                                : site.consecutiveFailures >= 3
                                  ? 'orange.500'
                                  : 'inherit'
                            }
                          >
                            {site.consecutiveFailures}
                          </StatNumber>
                        </Stat>
                      </SimpleGrid>

                      {/* Ultima execucao */}
                      <HStack
                        justify="space-between"
                        pt={2}
                        borderTop="1px"
                        borderColor="gray.100"
                      >
                        <Tooltip
                          label={
                            site.lastRunAt
                              ? new Date(site.lastRunAt).toLocaleString('pt-BR')
                              : 'Sem execucoes'
                          }
                        >
                          <Text fontSize="xs" color="gray.500">
                            Ultima: {formatTimeAgo(site.lastRunAt)}
                          </Text>
                        </Tooltip>
                        {site.lastPageType && (
                          <Badge
                            size="sm"
                            variant="subtle"
                            colorScheme={
                              site.lastPageType === 'CONTENT'
                                ? 'green'
                                : site.lastPageType === 'ERROR'
                                  ? 'red'
                                  : 'gray'
                            }
                            fontSize="2xs"
                          >
                            {site.lastPageType}
                          </Badge>
                        )}
                        {site.lastAdsFound > 0 && (
                          <Text fontSize="xs" color="gray.500">
                            {site.lastAdsFound} ads
                          </Text>
                        )}
                      </HStack>
                    </VStack>
                  </CardBody>
                </Card>
              );
            })}
          </SimpleGrid>
        )}
      </VStack>
    </AdminLayout>
  );
}
