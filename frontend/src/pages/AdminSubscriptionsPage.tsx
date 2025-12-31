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
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  FormControl,
  FormLabel,
  Input,
  IconButton,
} from '@chakra-ui/react';
import { EditIcon } from '@chakra-ui/icons';
import { AdminLayout } from '../components/AdminLayout';
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

  // Modal de edição
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null);
  const [editForm, setEditForm] = useState({
    status: '',
    validUntil: '',
  });
  const [editLoading, setEditLoading] = useState(false);

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

      const response = await api.get<SubscriptionsResponse>(
        `/api/admin/subscriptions?${params.toString()}`
      );
      setSubscriptions(response.subscriptions);
      setPagination(response.pagination);
    } catch (err: any) {
      console.error('Erro ao carregar subscriptions:', err);
      const errorMessage = err.response?.data?.error || 'Erro ao carregar assinaturas';
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
    setFilters({ status: '' });
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const hasActiveFilters = filters.status;

  const handleOpenEditModal = (subscription: Subscription) => {
    setEditingSubscription(subscription);
    // Converter data para formato input (YYYY-MM-DD)
    const validUntilDate = new Date(subscription.validUntil);
    const formattedDate = validUntilDate.toISOString().split('T')[0];
    setEditForm({
      status: subscription.status,
      validUntil: formattedDate,
    });
    onOpen();
  };

  const handleSaveEdit = async () => {
    if (!editingSubscription) return;

    try {
      setEditLoading(true);

      // Preparar dados para envio
      const updateData: { status?: string; validUntil?: string } = {};

      if (editForm.status !== editingSubscription.status) {
        updateData.status = editForm.status;
      }

      // Converter data para ISO string
      const newValidUntil = new Date(editForm.validUntil).toISOString();
      if (newValidUntil !== editingSubscription.validUntil) {
        updateData.validUntil = newValidUntil;
      }

      if (Object.keys(updateData).length === 0) {
        toast({
          title: 'Nenhuma alteração',
          description: 'Nenhum campo foi modificado',
          status: 'info',
          duration: 3000,
          isClosable: true,
        });
        return;
      }

      await api.patch(`/api/admin/subscriptions/${editingSubscription.id}`, updateData);

      toast({
        title: 'Sucesso',
        description: 'Assinatura atualizada com sucesso',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      // Atualizar subscription localmente
      setSubscriptions((prev) =>
        prev.map((s) =>
          s.id === editingSubscription.id
            ? { ...s, ...updateData, validUntil: updateData.validUntil || s.validUntil }
            : s
        )
      );

      onClose();
    } catch (err: any) {
      console.error('Erro ao atualizar subscription:', err);
      toast({
        title: 'Erro',
        description: err.response?.data?.error || 'Erro ao atualizar assinatura',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setEditLoading(false);
    }
  };

  return (
    <AdminLayout>
      <VStack spacing={6} align="stretch">
        <HStack justify="space-between" align="center">
          <Heading size="lg" color="gray.800">
            Assinaturas
          </Heading>
          <Badge colorScheme="blue" fontSize="md" px={3} py={1}>
            {pagination.total} assinaturas
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
              <Alert status="error" borderRadius="md">
                <AlertIcon />
                <Box>
                  <AlertTitle>Erro</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Box>
              </Alert>
            )}

            {!loading && !error && subscriptions.length === 0 && (
              <Alert status="info" borderRadius="md">
                <AlertIcon />
                <AlertTitle>Nenhuma assinatura encontrada</AlertTitle>
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
                      <Th>Ações</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {subscriptions.map((subscription) => {
                      const expiringSoon = isExpiringSoon(subscription.validUntil);
                      return (
                        <Tr key={subscription.id}>
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
                            <Badge colorScheme={getStatusBadgeColor(subscription.status)}>
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
                          <Td>
                            <IconButton
                              aria-label="Editar assinatura"
                              icon={<EditIcon />}
                              size="sm"
                              colorScheme="blue"
                              variant="ghost"
                              onClick={() => handleOpenEditModal(subscription)}
                            />
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

      {/* Modal de Edição */}
      <Modal isOpen={isOpen} onClose={onClose} isCentered size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Editar Assinatura</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              {editingSubscription && (
                <Box p={4} bg="gray.50" borderRadius="md">
                  <Text fontWeight="bold">{editingSubscription.user.name}</Text>
                  <Text fontSize="sm" color="gray.600">
                    {editingSubscription.user.email}
                  </Text>
                  <Text fontSize="sm" color="gray.600">
                    Plano: {editingSubscription.plan.name}
                  </Text>
                </Box>
              )}

              <FormControl>
                <FormLabel>Status</FormLabel>
                <Select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                >
                  <option value="ACTIVE">Ativo</option>
                  <option value="TRIAL">Trial</option>
                  <option value="CANCELLED">Cancelado</option>
                  <option value="PAST_DUE">Atrasado</option>
                  <option value="EXPIRED">Expirado</option>
                  <option value="SUSPENDED">Suspenso</option>
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel>Válido até</FormLabel>
                <Input
                  type="date"
                  value={editForm.validUntil}
                  onChange={(e) => setEditForm({ ...editForm, validUntil: e.target.value })}
                />
              </FormControl>

              <Alert status="info" borderRadius="md">
                <AlertIcon />
                <Box fontSize="sm">
                  <Text fontWeight="semibold">Atenção</Text>
                  <Text>
                    Alterações manuais devem ser feitas com cuidado. Certifique-se de que os
                    valores estão corretos.
                  </Text>
                </Box>
              </Alert>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onClose} isDisabled={editLoading}>
              Cancelar
            </Button>
            <Button colorScheme="blue" onClick={handleSaveEdit} isLoading={editLoading}>
              Salvar Alterações
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </AdminLayout>
  );
};
