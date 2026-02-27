import React, { useEffect, useState, useCallback, useMemo, memo } from 'react';
import {
  Box,
  Heading,
  Card,
  CardBody,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Spinner,
  Center,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  VStack,
  HStack,
  Text,
  Select,
  Button,
  useToast,
} from '@chakra-ui/react';
import { AdminLayout } from '../components/AdminLayout';
import { ExportButton } from '../components/ExportButton';
import { api } from '../services/api';

interface Subscription {
  id: string;
  status: string;
  createdAt: string;
  validUntil: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  plan: {
    id: string;
    name: string;
    priceCents: number;
    maxMonitors: number;
  };
}

interface SubscriptionsResponse {
  subscriptions: Subscription[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

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
    PENDING: 'yellow',
  };
  return colors[status] || 'gray';
};

const isExpiringSoon = (validUntil: string): boolean => {
  const daysUntilExpiry = Math.ceil(
    (new Date(validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  return daysUntilExpiry <= 7 && daysUntilExpiry > 0;
};

interface SubscriptionRowProps {
  subscription: Subscription;
}

const SubscriptionRow = memo(({ subscription }: SubscriptionRowProps) => {
  const expiringSoon = useMemo(
    () => isExpiringSoon(subscription.validUntil),
    [subscription.validUntil]
  );
  const statusColor = getStatusBadgeColor(subscription.status);

  return (
    <Tr>
      <Td>
        <VStack align="start" spacing={0}>
          <Text fontWeight="medium" fontSize="sm">
            {subscription.user.name}
          </Text>
          <Text fontSize="xs" color="gray.500">
            {subscription.user.email}
          </Text>
        </VStack>
      </Td>
      <Td>
        <VStack align="start" spacing={0}>
          <Text fontWeight="medium" fontSize="sm">
            {subscription.plan.name}
          </Text>
          <Text fontSize="xs" color="gray.500">
            Até {subscription.plan.maxMonitors} monitores
          </Text>
        </VStack>
      </Td>
      <Td>
        <Badge colorScheme={statusColor}>
          {subscription.status}
        </Badge>
      </Td>
      <Td isNumeric>
        <Text fontWeight="semibold" color="green.600" fontSize="sm">
          {formatCurrency(subscription.plan.priceCents)}
        </Text>
      </Td>
      <Td>
        <Text fontSize="sm" color="gray.600">
          {formatDate(subscription.createdAt)}
        </Text>
      </Td>
      <Td>
        <VStack align="start" spacing={0}>
          <Text
            fontSize="sm"
            color={expiringSoon ? 'orange.600' : 'gray.600'}
            fontWeight={expiringSoon ? 'semibold' : 'normal'}
          >
            {formatDate(subscription.validUntil)}
          </Text>
          {expiringSoon && (
            <Badge colorScheme="orange" fontSize="xs">
              Expira em breve
            </Badge>
          )}
        </VStack>
      </Td>
    </Tr>
  );
});

SubscriptionRow.displayName = 'SubscriptionRow';

export const AdminSubscriptionsPage: React.FC = () => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [filters, setFilters] = useState({
    status: '',
  });

  const toast = useToast();

  useEffect(() => {
    loadSubscriptions();
  }, [pagination.page, filters]);

  const loadSubscriptions = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });

      if (filters.status) params.append('status', filters.status);

      const response = await api.request<SubscriptionsResponse>(
        `/api/admin/subscriptions?${params.toString()}`,
        { method: 'GET', skipAutoLogout: true }
      );
      setSubscriptions(response.subscriptions);
      setPagination(response.pagination);
    } catch (err: unknown) {
      console.error('Erro ao carregar subscriptions:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar assinaturas';
      setError(errorMessage);
      toast({
        title: 'Erro',
        description: errorMessage,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPagination((prev) => ({ ...prev, page: 1 })); // Reset para página 1
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({ status: '' });
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  const hasActiveFilters = useMemo(() => Boolean(filters.status), [filters.status]);

  return (
    <AdminLayout>
      <VStack spacing={6} align="stretch">
        <HStack justify="space-between" align="center">
          <Heading size="lg" color="gray.800">
            Assinaturas
          </Heading>
          <HStack>
            <Badge colorScheme="blue" fontSize="md" px={3} py={1}>
              {pagination.total} assinaturas
            </Badge>
            <ExportButton
              endpoint="/api/admin/subscriptions/export"
              queryParams={filters}
              label="Exportar Assinaturas"
            />
          </HStack>
        </HStack>

        {/* Filtros */}
        <Card>
          <CardBody>
            <VStack spacing={4} align="stretch">
              <Heading size="sm" color="gray.700">
                Filtros
              </Heading>
              <HStack spacing={4} flexWrap="wrap">
                <Box minW="200px">
                  <Text fontSize="sm" mb={1} color="gray.600">
                    Status
                  </Text>
                  <Select
                    placeholder="Todos"
                    value={filters.status}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                    size="sm"
                  >
                    <option value="ACTIVE">Ativo</option>
                    <option value="TRIAL">Trial</option>
                    <option value="CANCELLED">Cancelado</option>
                    <option value="PAST_DUE">Atrasado</option>
                    <option value="EXPIRED">Expirado</option>
                    <option value="PENDING">Pendente</option>
                  </Select>
                </Box>

                {hasActiveFilters && (
                  <Box pt={5}>
                    <Button size="sm" variant="ghost" onClick={clearFilters}>
                      Limpar filtros
                    </Button>
                  </Box>
                )}
              </HStack>
            </VStack>
          </CardBody>
        </Card>

        {/* Tabela de Subscriptions */}
        <Card>
          <CardBody>
            {loading && (
              <Center py={10}>
                <VStack spacing={4}>
                  <Spinner size="xl" color="blue.500" thickness="4px" />
                  <Text color="gray.600">Carregando assinaturas...</Text>
                </VStack>
              </Center>
            )}

            {error && !loading && (
              <Alert status="error" borderRadius="md" mb={4}>
                <AlertIcon />
                <Box flex={1}>
                  <AlertTitle>Erro ao carregar dados</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Box>
                <Button size="sm" colorScheme="red" variant="outline" onClick={loadSubscriptions} ml={4}>
                  Tentar Novamente
                </Button>
              </Alert>
            )}

            {!loading && !error && subscriptions.length === 0 && (
              <Alert status="info" borderRadius="md">
                <AlertIcon />
                <Box>
                  <AlertTitle>Nenhuma assinatura encontrada</AlertTitle>
                  <AlertDescription>
                    {hasActiveFilters
                      ? 'Nenhuma assinatura corresponde aos filtros selecionados. Tente ajustar ou limpar os filtros.'
                      : 'Ainda não há assinaturas registradas no sistema.'}
                  </AlertDescription>
                </Box>
              </Alert>
            )}

            {!loading && !error && subscriptions.length > 0 && (
              <Box overflowX="auto">
                <Table variant="simple" size="sm">
                  <Thead>
                    <Tr>
                      <Th>Usuário</Th>
                      <Th>Plano</Th>
                      <Th>Status</Th>
                      <Th isNumeric>Valor</Th>
                      <Th>Criado em</Th>
                      <Th>Válido até</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {subscriptions.map((subscription) => (
                      <SubscriptionRow
                        key={subscription.id}
                        subscription={subscription}
                      />
                    ))}
                  </Tbody>
                </Table>
              </Box>
            )}
          </CardBody>
        </Card>

        {/* Paginação */}
        {!loading && pagination.totalPages > 1 && (
          <HStack justify="space-between" align="center">
            <Text fontSize="sm" color="gray.600">
              Página {pagination.page} de {pagination.totalPages} • Total: {pagination.total}{' '}
              assinaturas
            </Text>
            <HStack>
              <Button
                size="sm"
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                isDisabled={pagination.page === 1}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                isDisabled={pagination.page === pagination.totalPages}
              >
                Próxima
              </Button>
            </HStack>
          </HStack>
        )}
      </VStack>
    </AdminLayout>
  );
};
