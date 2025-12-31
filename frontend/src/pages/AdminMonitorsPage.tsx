import React, { useEffect, useState } from 'react';
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
  Input,
} from '@chakra-ui/react';
import { AdminLayout } from '../components/AdminLayout';
import { api } from '../services/api';

interface Monitor {
  id: string;
  site: string;
  name: string;
  active: boolean;
  lastCheckedAt: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

interface MonitorsResponse {
  monitors: Monitor[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

const formatDate = (dateString: string | null): string => {
  if (!dateString) return 'Nunca';
  return new Date(dateString).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const AdminMonitorsPage: React.FC = () => {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
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
    active: '',
    site: '',
  });

  const toast = useToast();

  useEffect(() => {
    loadMonitors();
  }, [pagination.page, filters]);

  const loadMonitors = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });

      if (filters.active) params.append('active', filters.active);
      if (filters.site) params.append('site', filters.site);

      const response = await api.get<MonitorsResponse>(`/api/admin/monitors?${params.toString()}`);
      setMonitors(response.monitors);
      setPagination(response.pagination);
    } catch (err: any) {
      console.error('Erro ao carregar monitores:', err);
      const errorMessage = err.response?.data?.error || 'Erro ao carregar monitores';
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

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const clearFilters = () => {
    setFilters({ active: '', site: '' });
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const hasActiveFilters = filters.active || filters.site;

  return (
    <AdminLayout>
      <VStack spacing={6} align="stretch">
        <HStack justify="space-between" align="center">
          <Heading size="lg" color="gray.800">
            Monitores
          </Heading>
          <Badge colorScheme="blue" fontSize="md" px={3} py={1}>
            {pagination.total} monitores
          </Badge>
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
                    value={filters.active}
                    onChange={(e) => handleFilterChange('active', e.target.value)}
                    size="sm"
                  >
                    <option value="true">Ativos</option>
                    <option value="false">Inativos</option>
                  </Select>
                </Box>

                <Box flex={1} minW="250px">
                  <Text fontSize="sm" mb={1} color="gray.600">
                    Site
                  </Text>
                  <Input
                    placeholder="Buscar por site..."
                    value={filters.site}
                    onChange={(e) => handleFilterChange('site', e.target.value)}
                    size="sm"
                  />
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

        {/* Tabela de Monitores */}
        <Card>
          <CardBody>
            {loading && (
              <Center py={10}>
                <VStack spacing={4}>
                  <Spinner size="xl" color="blue.500" thickness="4px" />
                  <Text color="gray.600">Carregando monitores...</Text>
                </VStack>
              </Center>
            )}

            {error && !loading && (
              <Alert status="error" borderRadius="md">
                <AlertIcon />
                <Box>
                  <AlertTitle>Erro</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Box>
              </Alert>
            )}

            {!loading && !error && monitors.length === 0 && (
              <Alert status="info" borderRadius="md">
                <AlertIcon />
                <AlertTitle>Nenhum monitor encontrado</AlertTitle>
              </Alert>
            )}

            {!loading && !error && monitors.length > 0 && (
              <Box overflowX="auto">
                <Table variant="simple" size="sm">
                  <Thead>
                    <Tr>
                      <Th>Usuário</Th>
                      <Th>Site</Th>
                      <Th>Nome</Th>
                      <Th>Status</Th>
                      <Th>Última Verificação</Th>
                      <Th>Criado em</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {monitors.map((monitor) => (
                      <Tr key={monitor.id}>
                        <Td>
                          <VStack align="start" spacing={0}>
                            <Text fontWeight="medium" fontSize="sm">
                              {monitor.user.name}
                            </Text>
                            <Text fontSize="xs" color="gray.500">
                              {monitor.user.email}
                            </Text>
                          </VStack>
                        </Td>
                        <Td>
                          <Text fontSize="sm" fontWeight="medium">
                            {monitor.site}
                          </Text>
                        </Td>
                        <Td>
                          <Text fontSize="sm">{monitor.name}</Text>
                        </Td>
                        <Td>
                          <Badge colorScheme={monitor.active ? 'green' : 'gray'}>
                            {monitor.active ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </Td>
                        <Td>
                          <Text fontSize="sm" color="gray.600">
                            {formatDate(monitor.lastCheckedAt)}
                          </Text>
                        </Td>
                        <Td>
                          <Text fontSize="sm" color="gray.600">
                            {formatDate(monitor.createdAt)}
                          </Text>
                        </Td>
                      </Tr>
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
              Página {pagination.page} de {pagination.totalPages} • Total: {pagination.total} monitores
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
