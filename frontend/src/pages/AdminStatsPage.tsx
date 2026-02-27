/**
 * FASE 4.2 - Dashboard Administrativo com Análise Temporal
 * - Seletor de período (7, 30, 60, 90 dias)
 * - Métricas de crescimento comparativas
 * - Análise de tendências e performance
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  Box,
  Heading,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  StatArrow,
  Card,
  CardBody,
  Spinner,
  Center,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Text,
  VStack,
  HStack,
  Select,
  Divider,
  Button,
} from '@chakra-ui/react';
import { AdminLayout } from '../components/AdminLayout';
import { api } from '../services/api';

interface SystemStats {
  users: {
    total: number;
    active: number;
    blocked: number;
  };
  subscriptions: {
    byStatus: Record<string, number>;
    monthlyRevenue: number;
  };
  monitors: {
    total: number;
    active: number;
    inactive: number;
  };
  webhooks: {
    last7Days: number;
  };
  topPlans: Array<{
    plan: {
      id: string;
      name: string;
      priceCents: number;
    };
    count: number;
  }>;
  coupons: {
    total: number;
    active: number;
    inactive: number;
    used: number;
    expiringSoon: number;
    topCoupons: Array<{
      code: string;
      description: string | null;
      usedCount: number;
      discountType: string;
      discountValue: number;
    }>;
  };
}

interface TemporalStats {
  period: number;
  periodStart: string;
  periodEnd: string;
  users: {
    current: { total: number; newUsers: number };
    previous: { total: number; newUsers: number };
    growth: { total: number; newUsers: number };
  };
  monitors: {
    current: { active: number; newMonitors: number };
    previous: { active: number; newMonitors: number };
    growth: { active: number; newMonitors: number };
  };
  subscriptions: {
    current: { active: number; new: number; cancelled: number };
    previous: { active: number; new: number; cancelled: number };
    growth: { active: number; new: number };
    churnRate: { current: number; previous: number };
  };
  jobs: {
    current: { total: number; success: number; failure: number; errorRate: number };
    previous: { total: number; success: number; failure: number; errorRate: number };
    growth: { total: number; success: number; failure: number };
  };
}

const formatCurrency = (cents: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
};

const getStatusBadgeColor = (status: string): string => {
  const colors: Record<string, string> = {
    ACTIVE: 'green',
    TRIAL: 'blue',
    CANCELLED: 'red',
    PAST_DUE: 'orange',
    EXPIRED: 'gray',
  };
  return colors[status] || 'gray';
};

const formatGrowth = (value: number): string => {
  return value > 0 ? `+${value.toFixed(1)}%` : `${value.toFixed(1)}%`;
};

const getGrowthColor = (value: number): string => {
  if (value > 0) return 'green.600';
  if (value < 0) return 'red.600';
  return 'gray.600';
};

export const AdminStatsPage: React.FC = () => {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [temporalStats, setTemporalStats] = useState<TemporalStats | null>(null);
  const [period, setPeriod] = useState<number>(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAllStats();
  }, [period]);

  const loadAllStats = async () => {
    try {
      setLoading(true);
      setError(null);

      const [statsResponse, temporalResponse] = await Promise.all([
        api.request('/api/admin/stats', { method: 'GET', skipAutoLogout: true }),
        api.request(`/api/admin/stats/temporal?period=${period}`, { method: 'GET', skipAutoLogout: true }),
      ]);

      setStats(statsResponse.data);
      setTemporalStats(temporalResponse);
    } catch (err: unknown) {
      console.error('Erro ao carregar estatísticas:', err);
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message || 'Erro ao carregar estatísticas do sistema');
    } finally {
      setLoading(false);
    }
  };

  // Memoized coupon percentage calculations — placed before early returns to satisfy Rules of Hooks
  const couponUsagePercent = useMemo(() => {
    if (!stats) return '0%';
    return stats.coupons.total > 0
      ? `${((stats.coupons.used / stats.coupons.total) * 100).toFixed(1)}%`
      : '0%';
  }, [stats?.coupons.used, stats?.coupons.total]);

  const couponActivationPercent = useMemo(() => {
    if (!stats) return '0%';
    return stats.coupons.total > 0
      ? `${((stats.coupons.active / stats.coupons.total) * 100).toFixed(1)}%`
      : '0%';
  }, [stats?.coupons.active, stats?.coupons.total]);

  // Memoized strategic metric calculations
  const blockRatePercent = useMemo(() => {
    if (!stats) return '0%';
    return stats.users.total > 0
      ? `${((stats.users.blocked / stats.users.total) * 100).toFixed(1)}%`
      : '0%';
  }, [stats?.users.blocked, stats?.users.total]);

  const isHighBlockRate = useMemo(() => {
    if (!stats) return false;
    return stats.users.total > 0 && stats.users.blocked / stats.users.total > 0.1;
  }, [stats?.users.blocked, stats?.users.total]);

  const activationPercent = useMemo(() => {
    if (!stats) return '0%';
    return stats.users.total > 0
      ? `${((stats.users.active / stats.users.total) * 100).toFixed(1)}%`
      : '0%';
  }, [stats?.users.active, stats?.users.total]);

  const monitorsPerUser = useMemo(() => {
    if (!stats) return '0';
    return stats.users.active > 0
      ? (stats.monitors.total / stats.users.active).toFixed(1)
      : '0';
  }, [stats?.monitors.total, stats?.users.active]);

  const trialPercent = useMemo(() => {
    if (!stats) return '0% do total';
    const totalSubs = Object.values(stats.subscriptions.byStatus).reduce((a, b) => a + b, 0);
    const trialCount = stats.subscriptions.byStatus['TRIAL'] || 0;
    return totalSubs > 0
      ? `${((trialCount / totalSubs) * 100).toFixed(1)}% do total`
      : '0% do total';
  }, [stats?.subscriptions.byStatus]);

  const churnRateColor = useMemo(() => {
    if (!temporalStats) return 'green.600';
    return temporalStats.subscriptions.churnRate.current > 10 ? 'red.600' : 'green.600';
  }, [temporalStats?.subscriptions.churnRate.current]);

  const jobErrorRateColor = useMemo(() => {
    if (!temporalStats) return 'green.600';
    return temporalStats.jobs.current.errorRate > 5 ? 'red.600' : 'green.600';
  }, [temporalStats?.jobs.current.errorRate]);

  if (loading) {
    return (
      <AdminLayout>
        <Center minH="400px">
          <VStack spacing={4}>
            <Spinner size="xl" color="blue.500" thickness="4px" />
            <Text color="gray.600">Carregando estatísticas...</Text>
          </VStack>
        </Center>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <Alert status="error" borderRadius="md">
          <AlertIcon />
          <Box flex={1}>
            <AlertTitle>Erro ao carregar estatísticas</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Box>
          <Button size="sm" colorScheme="red" variant="outline" onClick={loadAllStats} ml={4}>
            Tentar Novamente
          </Button>
        </Alert>
      </AdminLayout>
    );
  }

  if (!stats || !temporalStats) {
    return (
      <AdminLayout>
        <Alert status="warning" borderRadius="md">
          <AlertIcon />
          <AlertTitle>Nenhuma estatística disponível</AlertTitle>
        </Alert>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <VStack spacing={6} align="stretch">
        {/* Header com seletor de período */}
        <HStack justify="space-between" align="center">
          <Heading size="lg" color="gray.800">
            Dashboard Administrativo
          </Heading>
          <HStack>
            <Text fontSize="sm" color="gray.600" fontWeight="medium">
              Período de Análise:
            </Text>
            <Select
              value={period}
              onChange={(e) => setPeriod(Number(e.target.value))}
              w="150px"
              size="sm"
            >
              <option value={7}>Últimos 7 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={60}>Últimos 60 dias</option>
              <option value={90}>Últimos 90 dias</option>
            </Select>
          </HStack>
        </HStack>

        {/* FASE 4.2: Análise Temporal */}
        <Card bg="purple.50" borderColor="purple.200" borderWidth="1px">
          <CardBody>
            <VStack spacing={4} align="stretch">
              <Heading size="md" color="purple.800">
                📈 Análise Temporal - Últimos {period} dias
              </Heading>
              <Text fontSize="sm" color="gray.600">
                Comparação com período anterior ({period} dias anteriores)
              </Text>

              <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={4}>
                {/* Crescimento de Usuários */}
                <Box p={4} bg="white" borderRadius="md" boxShadow="sm">
                  <Stat>
                    <StatLabel fontSize="sm" color="gray.600">
                      Novos Usuários
                    </StatLabel>
                    <StatNumber fontSize="3xl">
                      {temporalStats.users.current.newUsers}
                    </StatNumber>
                    <StatHelpText fontSize="sm">
                      <StatArrow
                        type={temporalStats.users.growth.newUsers >= 0 ? 'increase' : 'decrease'}
                      />
                      <Text
                        as="span"
                        color={getGrowthColor(temporalStats.users.growth.newUsers)}
                        fontWeight="bold"
                      >
                        {formatGrowth(temporalStats.users.growth.newUsers)}
                      </Text>
                      {' '}vs período anterior
                    </StatHelpText>
                  </Stat>
                </Box>

                {/* Crescimento de Monitores */}
                <Box p={4} bg="white" borderRadius="md" boxShadow="sm">
                  <Stat>
                    <StatLabel fontSize="sm" color="gray.600">
                      Novos Monitores
                    </StatLabel>
                    <StatNumber fontSize="3xl">
                      {temporalStats.monitors.current.newMonitors}
                    </StatNumber>
                    <StatHelpText fontSize="sm">
                      <StatArrow
                        type={temporalStats.monitors.growth.newMonitors >= 0 ? 'increase' : 'decrease'}
                      />
                      <Text
                        as="span"
                        color={getGrowthColor(temporalStats.monitors.growth.newMonitors)}
                        fontWeight="bold"
                      >
                        {formatGrowth(temporalStats.monitors.growth.newMonitors)}
                      </Text>
                      {' '}vs período anterior
                    </StatHelpText>
                  </Stat>
                </Box>

                {/* Novas Assinaturas */}
                <Box p={4} bg="white" borderRadius="md" boxShadow="sm">
                  <Stat>
                    <StatLabel fontSize="sm" color="gray.600">
                      Novas Assinaturas
                    </StatLabel>
                    <StatNumber fontSize="3xl">
                      {temporalStats.subscriptions.current.new}
                    </StatNumber>
                    <StatHelpText fontSize="sm">
                      <StatArrow
                        type={temporalStats.subscriptions.growth.new >= 0 ? 'increase' : 'decrease'}
                      />
                      <Text
                        as="span"
                        color={getGrowthColor(temporalStats.subscriptions.growth.new)}
                        fontWeight="bold"
                      >
                        {formatGrowth(temporalStats.subscriptions.growth.new)}
                      </Text>
                      {' '}vs período anterior
                    </StatHelpText>
                  </Stat>
                </Box>

                {/* Taxa de Churn */}
                <Box p={4} bg="white" borderRadius="md" boxShadow="sm">
                  <Stat>
                    <StatLabel fontSize="sm" color="gray.600">
                      Taxa de Churn
                    </StatLabel>
                    <StatNumber
                      fontSize="3xl"
                      color={churnRateColor}
                    >
                      {temporalStats.subscriptions.churnRate.current.toFixed(1)}%
                    </StatNumber>
                    <StatHelpText fontSize="sm">
                      {temporalStats.subscriptions.current.cancelled} cancelamentos
                    </StatHelpText>
                  </Stat>
                </Box>

                {/* Jobs Executados */}
                <Box p={4} bg="white" borderRadius="md" boxShadow="sm">
                  <Stat>
                    <StatLabel fontSize="sm" color="gray.600">
                      Jobs Executados
                    </StatLabel>
                    <StatNumber fontSize="3xl">
                      {temporalStats.jobs.current.total}
                    </StatNumber>
                    <StatHelpText fontSize="sm">
                      <StatArrow
                        type={temporalStats.jobs.growth.total >= 0 ? 'increase' : 'decrease'}
                      />
                      <Text
                        as="span"
                        color={getGrowthColor(temporalStats.jobs.growth.total)}
                        fontWeight="bold"
                      >
                        {formatGrowth(temporalStats.jobs.growth.total)}
                      </Text>
                      {' '}vs período anterior
                    </StatHelpText>
                  </Stat>
                </Box>

                {/* Taxa de Erro de Jobs */}
                <Box p={4} bg="white" borderRadius="md" boxShadow="sm">
                  <Stat>
                    <StatLabel fontSize="sm" color="gray.600">
                      Taxa de Erro (Jobs)
                    </StatLabel>
                    <StatNumber
                      fontSize="3xl"
                      color={jobErrorRateColor}
                    >
                      {temporalStats.jobs.current.errorRate.toFixed(1)}%
                    </StatNumber>
                    <StatHelpText fontSize="sm">
                      {temporalStats.jobs.current.failure} falhas de{' '}
                      {temporalStats.jobs.current.total}
                    </StatHelpText>
                  </Stat>
                </Box>

                {/* Crescimento Total de Usuários */}
                <Box p={4} bg="white" borderRadius="md" boxShadow="sm">
                  <Stat>
                    <StatLabel fontSize="sm" color="gray.600">
                      Crescimento Total
                    </StatLabel>
                    <StatNumber fontSize="3xl">
                      {temporalStats.users.current.total}
                    </StatNumber>
                    <StatHelpText fontSize="sm">
                      <StatArrow
                        type={temporalStats.users.growth.total >= 0 ? 'increase' : 'decrease'}
                      />
                      <Text
                        as="span"
                        color={getGrowthColor(temporalStats.users.growth.total)}
                        fontWeight="bold"
                      >
                        {formatGrowth(temporalStats.users.growth.total)}
                      </Text>
                      {' '}usuários totais
                    </StatHelpText>
                  </Stat>
                </Box>

                {/* Monitores Ativos */}
                <Box p={4} bg="white" borderRadius="md" boxShadow="sm">
                  <Stat>
                    <StatLabel fontSize="sm" color="gray.600">
                      Monitores Ativos
                    </StatLabel>
                    <StatNumber fontSize="3xl">
                      {temporalStats.monitors.current.active}
                    </StatNumber>
                    <StatHelpText fontSize="sm">
                      <StatArrow
                        type={temporalStats.monitors.growth.active >= 0 ? 'increase' : 'decrease'}
                      />
                      <Text
                        as="span"
                        color={getGrowthColor(temporalStats.monitors.growth.active)}
                        fontWeight="bold"
                      >
                        {formatGrowth(temporalStats.monitors.growth.active)}
                      </Text>
                      {' '}vs período anterior
                    </StatHelpText>
                  </Stat>
                </Box>
              </SimpleGrid>
            </VStack>
          </CardBody>
        </Card>

        <Divider />

        {/* Estatísticas Principais (Mantidas) */}
        <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={6}>
          {/* Usuários */}
          <Card>
            <CardBody>
              <Stat>
                <StatLabel>Total de Usuários</StatLabel>
                <StatNumber>{stats.users.total}</StatNumber>
                <StatHelpText>
                  {stats.users.active} ativos • {stats.users.blocked} bloqueados
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          {/* Receita Mensal */}
          <Card>
            <CardBody>
              <Stat>
                <StatLabel>Receita Mensal</StatLabel>
                <StatNumber color="green.600">
                  {formatCurrency(stats.subscriptions.monthlyRevenue)}
                </StatNumber>
                <StatHelpText>Assinaturas ativas</StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          {/* Monitores */}
          <Card>
            <CardBody>
              <Stat>
                <StatLabel>Total de Monitores</StatLabel>
                <StatNumber>{stats.monitors.total}</StatNumber>
                <StatHelpText>
                  {stats.monitors.active} ativos • {stats.monitors.inactive} inativos
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          {/* Webhooks */}
          <Card>
            <CardBody>
              <Stat>
                <StatLabel>Webhooks (7 dias)</StatLabel>
                <StatNumber>{stats.webhooks.last7Days}</StatNumber>
                <StatHelpText>Recebidos recentemente</StatHelpText>
              </Stat>
            </CardBody>
          </Card>
        </SimpleGrid>

        {/* Card de Cupons */}
        <Card bg="orange.50" borderColor="orange.200" borderWidth="1px">
          <CardBody>
            <VStack spacing={4} align="stretch">
              <Heading size="md" color="orange.800">
                🎟️ Cupons de Desconto
              </Heading>

              <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={4}>
                <Box p={4} bg="white" borderRadius="md" boxShadow="sm">
                  <Stat>
                    <StatLabel fontSize="sm" color="gray.600">
                      Total de Cupons
                    </StatLabel>
                    <StatNumber fontSize="3xl">{stats.coupons.total}</StatNumber>
                    <StatHelpText fontSize="xs">
                      {stats.coupons.active} ativos • {stats.coupons.inactive} inativos
                    </StatHelpText>
                  </Stat>
                </Box>

                <Box p={4} bg="white" borderRadius="md" boxShadow="sm">
                  <Stat>
                    <StatLabel fontSize="sm" color="gray.600">
                      Cupons Utilizados
                    </StatLabel>
                    <StatNumber fontSize="3xl" color="green.600">
                      {stats.coupons.used}
                    </StatNumber>
                    <StatHelpText fontSize="xs">
                      {couponUsagePercent}{' '}
                      de utilização
                    </StatHelpText>
                  </Stat>
                </Box>

                <Box p={4} bg="white" borderRadius="md" boxShadow="sm">
                  <Stat>
                    <StatLabel fontSize="sm" color="gray.600">
                      Expirando em Breve
                    </StatLabel>
                    <StatNumber
                      fontSize="3xl"
                      color={stats.coupons.expiringSoon > 0 ? 'orange.600' : 'gray.600'}
                    >
                      {stats.coupons.expiringSoon}
                    </StatNumber>
                    <StatHelpText fontSize="xs">Próximos 7 dias</StatHelpText>
                  </Stat>
                </Box>

                <Box p={4} bg="white" borderRadius="md" boxShadow="sm">
                  <Stat>
                    <StatLabel fontSize="sm" color="gray.600">
                      Taxa de Ativação
                    </StatLabel>
                    <StatNumber fontSize="3xl" color="blue.600">
                      {couponActivationPercent}
                    </StatNumber>
                    <StatHelpText fontSize="xs">
                      {stats.coupons.active} cupons ativos
                    </StatHelpText>
                  </Stat>
                </Box>
              </SimpleGrid>

              {/* Top Cupons Mais Usados */}
              {stats.coupons.topCoupons.length > 0 && (
                <Box mt={4}>
                  <Heading size="sm" mb={3} color="gray.700">
                    Top 5 Cupons Mais Utilizados
                  </Heading>
                  <Table size="sm" variant="simple">
                    <Thead>
                      <Tr>
                        <Th>Código</Th>
                        <Th>Descrição</Th>
                        <Th>Tipo</Th>
                        <Th isNumeric>Usos</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {stats.coupons.topCoupons.map((coupon) => (
                        <Tr key={coupon.code}>
                          <Td fontWeight="bold">{coupon.code}</Td>
                          <Td maxW="200px" isTruncated>
                            {coupon.description || '-'}
                          </Td>
                          <Td>
                            <Badge
                              colorScheme={coupon.discountType === 'PERCENTAGE' ? 'purple' : 'orange'}
                              fontSize="xs">
                              {coupon.discountType === 'PERCENTAGE'
                                ? `${coupon.discountValue}%`
                                : `R$ ${(coupon.discountValue / 100).toFixed(2)}`}
                            </Badge>
                          </Td>
                          <Td isNumeric fontWeight="semibold">{coupon.usedCount}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </Box>
              )}
            </VStack>
          </CardBody>
        </Card>

        {/* Métricas Estratégicas (FASE 3.4) */}
        <Card bg="blue.50" borderColor="blue.200" borderWidth="1px">
          <CardBody>
            <VStack spacing={4} align="stretch">
              <Heading size="md" color="blue.800">
                📊 Métricas Estratégicas
              </Heading>
              <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={4}>
                {/* Taxa de Bloqueio (Churn) */}
                <Box p={4} bg="white" borderRadius="md" boxShadow="sm">
                  <Stat>
                    <StatLabel fontSize="sm" color="gray.600">
                      Taxa de Bloqueio
                    </StatLabel>
                    <StatNumber
                      fontSize="3xl"
                      color={isHighBlockRate ? 'red.600' : 'green.600'}
                    >
                      {blockRatePercent}
                    </StatNumber>
                    <StatHelpText fontSize="xs">
                      {stats.users.blocked} de {stats.users.total} usuários
                    </StatHelpText>
                  </Stat>
                </Box>

                {/* Taxa de Ativação */}
                <Box p={4} bg="white" borderRadius="md" boxShadow="sm">
                  <Stat>
                    <StatLabel fontSize="sm" color="gray.600">
                      Taxa de Ativação
                    </StatLabel>
                    <StatNumber fontSize="3xl" color="green.600">
                      {activationPercent}
                    </StatNumber>
                    <StatHelpText fontSize="xs">
                      {stats.users.active} usuários ativos
                    </StatHelpText>
                  </Stat>
                </Box>

                {/* Monitores por Usuário */}
                <Box p={4} bg="white" borderRadius="md" boxShadow="sm">
                  <Stat>
                    <StatLabel fontSize="sm" color="gray.600">
                      Monitores/Usuário
                    </StatLabel>
                    <StatNumber fontSize="3xl" color="purple.600">
                      {monitorsPerUser}
                    </StatNumber>
                    <StatHelpText fontSize="xs">Média por usuário ativo</StatHelpText>
                  </Stat>
                </Box>

                {/* Conversão Trial */}
                <Box p={4} bg="white" borderRadius="md" boxShadow="sm">
                  <Stat>
                    <StatLabel fontSize="sm" color="gray.600">
                      Usuários em Trial
                    </StatLabel>
                    <StatNumber fontSize="3xl" color="blue.600">
                      {stats.subscriptions.byStatus['TRIAL'] || 0}
                    </StatNumber>
                    <StatHelpText fontSize="xs">
                      {trialPercent}
                    </StatHelpText>
                  </Stat>
                </Box>
              </SimpleGrid>
            </VStack>
          </CardBody>
        </Card>

        {/* Assinaturas por Status */}
        <Card>
          <CardBody>
            <VStack spacing={4} align="stretch">
              <Heading size="md" color="gray.700">
                Assinaturas por Status
              </Heading>
              <SimpleGrid columns={{ base: 2, md: 3, lg: 5 }} spacing={4}>
                {Object.entries(stats.subscriptions.byStatus).map(([status, count]) => (
                  <Box
                    key={status}
                    p={4}
                    bg="gray.50"
                    borderRadius="md"
                    borderLeft="4px solid"
                    borderColor={`${getStatusBadgeColor(status)}.500`}
                  >
                    <Text fontSize="sm" color="gray.600" fontWeight="medium">
                      {status}
                    </Text>
                    <Text fontSize="2xl" fontWeight="bold" color="gray.800">
                      {count}
                    </Text>
                  </Box>
                ))}
              </SimpleGrid>
            </VStack>
          </CardBody>
        </Card>

        {/* Top 5 Planos Mais Populares */}
        {stats.topPlans.length > 0 && (
          <Card>
            <CardBody>
              <VStack spacing={4} align="stretch">
                <Heading size="md" color="gray.700">
                  Top 5 Planos Mais Populares
                </Heading>
                <Table variant="simple" size="sm">
                  <Thead>
                    <Tr>
                      <Th>Plano</Th>
                      <Th isNumeric>Preço</Th>
                      <Th isNumeric>Assinaturas</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {stats.topPlans.map((item, index) => (
                      <Tr key={item.plan.id}>
                        <Td>
                          <HStack>
                            <Badge colorScheme="blue">{index + 1}</Badge>
                            <Text fontWeight="medium">{item.plan.name}</Text>
                          </HStack>
                        </Td>
                        <Td isNumeric fontWeight="semibold" color="green.600">
                          {formatCurrency(item.plan.priceCents)}
                        </Td>
                        <Td isNumeric>
                          <Badge colorScheme="purple" fontSize="md" px={3} py={1}>
                            {item.count}
                          </Badge>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </VStack>
            </CardBody>
          </Card>
        )}
      </VStack>
    </AdminLayout>
  );
};
