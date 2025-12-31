import React, { useEffect, useState } from 'react';
import {
  Box,
  Heading,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
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

export const AdminStatsPage: React.FC = () => {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/api/admin/stats');
      setStats(response.data);
    } catch (err: any) {
      console.error('Erro ao carregar estatísticas:', err);
      setError(err.response?.data?.error || 'Erro ao carregar estatísticas do sistema');
    } finally {
      setLoading(false);
    }
  };

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
          <Box>
            <AlertTitle>Erro ao carregar estatísticas</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Box>
        </Alert>
      </AdminLayout>
    );
  }

  if (!stats) {
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
        <Heading size="lg" color="gray.800">
          Dashboard Administrativo
        </Heading>

        {/* Estatísticas Principais */}
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
