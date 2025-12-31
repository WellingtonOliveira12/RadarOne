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
  Input,
  Select,
  Button,
  useToast,
} from '@chakra-ui/react';
import { AdminLayout } from '../components/AdminLayout';
import { api } from '../services/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'USER' | 'ADMIN';
  isActive: boolean;
  blocked: boolean;
  createdAt: string;
  cpfLast4?: string;
  subscriptions: Array<{
    id: string;
    status: string;
    validUntil: string;
    plan: {
      name: string;
      priceCents: number;
    };
  }>;
  _count: {
    monitors: number;
  };
}

interface UsersResponse {
  users: User[];
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

const getRoleBadgeColor = (role: string): string => {
  return role === 'ADMIN' ? 'purple' : 'blue';
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

export const AdminUsersPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
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
    role: '',
    email: '',
  });

  const toast = useToast();

  useEffect(() => {
    loadUsers();
  }, [pagination.page, filters]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });

      if (filters.status) params.append('status', filters.status);
      if (filters.role) params.append('role', filters.role);
      if (filters.email) params.append('email', filters.email);

      const response = await api.get<UsersResponse>(`/api/admin/users?${params.toString()}`);
      setUsers(response.users);
      setPagination(response.pagination);
    } catch (err: any) {
      console.error('Erro ao carregar usuários:', err);
      const errorMessage = err.response?.data?.error || 'Erro ao carregar usuários';
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
    setPagination((prev) => ({ ...prev, page: 1 })); // Reset para página 1
  };

  const clearFilters = () => {
    setFilters({ status: '', role: '', email: '' });
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const hasActiveFilters = filters.status || filters.role || filters.email;

  return (
    <AdminLayout>
      <VStack spacing={6} align="stretch">
        <HStack justify="space-between" align="center">
          <Heading size="lg" color="gray.800">
            Usuários
          </Heading>
          <Badge colorScheme="blue" fontSize="md" px={3} py={1}>
            {pagination.total} usuários
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
                    value={filters.status}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                    size="sm"
                  >
                    <option value="active">Ativos</option>
                    <option value="blocked">Bloqueados</option>
                  </Select>
                </Box>

                <Box minW="200px">
                  <Text fontSize="sm" mb={1} color="gray.600">
                    Role
                  </Text>
                  <Select
                    placeholder="Todos"
                    value={filters.role}
                    onChange={(e) => handleFilterChange('role', e.target.value)}
                    size="sm"
                  >
                    <option value="USER">Usuário</option>
                    <option value="ADMIN">Admin</option>
                  </Select>
                </Box>

                <Box flex={1} minW="250px">
                  <Text fontSize="sm" mb={1} color="gray.600">
                    Email
                  </Text>
                  <Input
                    placeholder="Buscar por email..."
                    value={filters.email}
                    onChange={(e) => handleFilterChange('email', e.target.value)}
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

        {/* Tabela de Usuários */}
        <Card>
          <CardBody>
            {loading && (
              <Center py={10}>
                <VStack spacing={4}>
                  <Spinner size="xl" color="blue.500" thickness="4px" />
                  <Text color="gray.600">Carregando usuários...</Text>
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

            {!loading && !error && users.length === 0 && (
              <Alert status="info" borderRadius="md">
                <AlertIcon />
                <AlertTitle>Nenhum usuário encontrado</AlertTitle>
              </Alert>
            )}

            {!loading && !error && users.length > 0 && (
              <Box overflowX="auto">
                <Table variant="simple" size="sm">
                  <Thead>
                    <Tr>
                      <Th>Nome</Th>
                      <Th>Email</Th>
                      <Th>Role</Th>
                      <Th>Status</Th>
                      <Th>Assinatura</Th>
                      <Th isNumeric>Monitores</Th>
                      <Th>Cadastro</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {users.map((user) => {
                      const activeSubscription = user.subscriptions[0];
                      return (
                        <Tr key={user.id}>
                          <Td>
                            <VStack align="start" spacing={0}>
                              <Text fontWeight="medium">{user.name}</Text>
                              {user.cpfLast4 && (
                                <Text fontSize="xs" color="gray.500">
                                  CPF: ***.***.***-{user.cpfLast4}
                                </Text>
                              )}
                            </VStack>
                          </Td>
                          <Td>
                            <Text fontSize="sm">{user.email}</Text>
                          </Td>
                          <Td>
                            <Badge colorScheme={getRoleBadgeColor(user.role)}>
                              {user.role}
                            </Badge>
                          </Td>
                          <Td>
                            {user.blocked ? (
                              <Badge colorScheme="red">Bloqueado</Badge>
                            ) : (
                              <Badge colorScheme="green">Ativo</Badge>
                            )}
                          </Td>
                          <Td>
                            {activeSubscription ? (
                              <VStack align="start" spacing={0}>
                                <Badge colorScheme={getStatusBadgeColor(activeSubscription.status)}>
                                  {activeSubscription.status}
                                </Badge>
                                <Text fontSize="xs" color="gray.500">
                                  {activeSubscription.plan.name}
                                </Text>
                                <Text fontSize="xs" color="gray.500">
                                  Válido até: {formatDate(activeSubscription.validUntil)}
                                </Text>
                              </VStack>
                            ) : (
                              <Badge colorScheme="gray">Sem assinatura</Badge>
                            )}
                          </Td>
                          <Td isNumeric>
                            <Badge colorScheme="purple">{user._count.monitors}</Badge>
                          </Td>
                          <Td>
                            <Text fontSize="sm" color="gray.600">
                              {formatDate(user.createdAt)}
                            </Text>
                          </Td>
                        </Tr>
                      );
                    })}
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
              Página {pagination.page} de {pagination.totalPages} • Total: {pagination.total} usuários
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
