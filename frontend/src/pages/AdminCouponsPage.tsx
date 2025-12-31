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
  Textarea,
  NumberInput,
  NumberInputField,
  Switch,
} from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import { AdminLayout } from '../components/AdminLayout';
import { api } from '../services/api';

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: number;
  appliesToPlanId: string | null;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  plan: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

interface Plan {
  id: string;
  name: string;
  slug: string;
  priceCents: number;
}

interface CouponsResponse {
  coupons: Coupon[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

const formatDate = (dateString: string | null): string => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const formatDiscount = (type: string, value: number): string => {
  if (type === 'PERCENT') {
    return `${value}%`;
  }
  return `R$ ${(value / 100).toFixed(2)}`;
};

export const AdminCouponsPage: React.FC = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
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
    isActive: '',
    code: '',
  });

  const toast = useToast();

  // Modal de criação
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    description: '',
    discountType: 'PERCENT' as 'PERCENT' | 'FIXED',
    discountValue: 0,
    appliesToPlanId: '',
    maxUses: '',
    expiresAt: '',
  });

  useEffect(() => {
    loadCoupons();
    loadPlans();
  }, [pagination.page, filters]);

  const loadCoupons = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });

      if (filters.isActive) params.append('isActive', filters.isActive);
      if (filters.code) params.append('code', filters.code);

      const response = await api.get<CouponsResponse>(`/api/admin/coupons?${params.toString()}`);
      setCoupons(response.coupons);
      setPagination(response.pagination);
    } catch (err: any) {
      console.error('Erro ao carregar cupons:', err);
      const errorMessage = err.response?.data?.error || 'Erro ao carregar cupons';
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

  const loadPlans = async () => {
    try {
      const response = await api.get<Plan[]>('/api/plans');
      setPlans(response);
    } catch (err: any) {
      console.error('Erro ao carregar planos:', err);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const clearFilters = () => {
    setFilters({ isActive: '', code: '' });
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const hasActiveFilters = filters.isActive || filters.code;

  const handleOpenCreateModal = () => {
    setFormData({
      code: '',
      description: '',
      discountType: 'PERCENT',
      discountValue: 0,
      appliesToPlanId: '',
      maxUses: '',
      expiresAt: '',
    });
    onOpen();
  };

  const handleCreateCoupon = async () => {
    try {
      // Validações
      if (!formData.code || !formData.discountType || formData.discountValue === 0) {
        toast({
          title: 'Erro',
          description: 'Preencha os campos obrigatórios: código, tipo e valor do desconto',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
        return;
      }

      setFormLoading(true);

      const payload: any = {
        code: formData.code.toUpperCase(),
        description: formData.description || null,
        discountType: formData.discountType,
        discountValue: formData.discountValue,
        appliesToPlanId: formData.appliesToPlanId || null,
        maxUses: formData.maxUses ? parseInt(formData.maxUses) : null,
        expiresAt: formData.expiresAt || null,
        isActive: true,
      };

      await api.post('/api/admin/coupons', payload);

      toast({
        title: 'Sucesso',
        description: 'Cupom criado com sucesso',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      onClose();
      loadCoupons();
    } catch (err: any) {
      console.error('Erro ao criar cupom:', err);
      toast({
        title: 'Erro',
        description: err.response?.data?.error || 'Erro ao criar cupom',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleActive = async (coupon: Coupon) => {
    try {
      await api.patch(`/api/admin/coupons/${coupon.id}`, {
        isActive: !coupon.isActive,
      });

      toast({
        title: 'Sucesso',
        description: `Cupom ${!coupon.isActive ? 'ativado' : 'desativado'} com sucesso`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      // Atualizar localmente
      setCoupons((prev) =>
        prev.map((c) => (c.id === coupon.id ? { ...c, isActive: !c.isActive } : c))
      );
    } catch (err: any) {
      console.error('Erro ao atualizar cupom:', err);
      toast({
        title: 'Erro',
        description: err.response?.data?.error || 'Erro ao atualizar cupom',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  return (
    <AdminLayout>
      <VStack spacing={6} align="stretch">
        <HStack justify="space-between" align="center">
          <Heading size="lg" color="gray.800">
            Cupons
          </Heading>
          <HStack spacing={3}>
            <Badge colorScheme="blue" fontSize="md" px={3} py={1}>
              {pagination.total} cupons
            </Badge>
            <Button
              leftIcon={<AddIcon />}
              colorScheme="blue"
              onClick={handleOpenCreateModal}
              size="sm"
            >
              Criar Cupom
            </Button>
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
                    value={filters.isActive}
                    onChange={(e) => handleFilterChange('isActive', e.target.value)}
                    size="sm"
                  >
                    <option value="true">Ativos</option>
                    <option value="false">Inativos</option>
                  </Select>
                </Box>

                <Box flex={1} minW="250px">
                  <Text fontSize="sm" mb={1} color="gray.600">
                    Código
                  </Text>
                  <Input
                    placeholder="Buscar por código..."
                    value={filters.code}
                    onChange={(e) => handleFilterChange('code', e.target.value)}
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

        {/* Tabela de Cupons */}
        <Card>
          <CardBody>
            {loading && (
              <Center py={10}>
                <VStack spacing={4}>
                  <Spinner size="xl" color="blue.500" thickness="4px" />
                  <Text color="gray.600">Carregando cupons...</Text>
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

            {!loading && !error && coupons.length === 0 && (
              <Alert status="info" borderRadius="md">
                <AlertIcon />
                <AlertTitle>Nenhum cupom encontrado</AlertTitle>
              </Alert>
            )}

            {!loading && !error && coupons.length > 0 && (
              <Box overflowX="auto">
                <Table variant="simple" size="sm">
                  <Thead>
                    <Tr>
                      <Th>Código</Th>
                      <Th>Desconto</Th>
                      <Th>Plano</Th>
                      <Th>Usos</Th>
                      <Th>Status</Th>
                      <Th>Expira em</Th>
                      <Th>Ações</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {coupons.map((coupon) => {
                      const isExpired =
                        coupon.expiresAt && new Date(coupon.expiresAt) < new Date();
                      const maxUsesReached =
                        coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses;

                      return (
                        <Tr key={coupon.id}>
                          <Td>
                            <VStack align="start" spacing={0}>
                              <Text fontWeight="bold" fontSize="sm">
                                {coupon.code}
                              </Text>
                              {coupon.description && (
                                <Text fontSize="xs" color="gray.500">
                                  {coupon.description}
                                </Text>
                              )}
                            </VStack>
                          </Td>
                          <Td>
                            <Badge
                              colorScheme={coupon.discountType === 'PERCENT' ? 'purple' : 'green'}
                            >
                              {formatDiscount(coupon.discountType, coupon.discountValue)}
                            </Badge>
                          </Td>
                          <Td>
                            <Text fontSize="sm">
                              {coupon.plan ? coupon.plan.name : 'Todos os planos'}
                            </Text>
                          </Td>
                          <Td>
                            <Text fontSize="sm" fontWeight="medium">
                              {coupon.usedCount}
                              {coupon.maxUses !== null && ` / ${coupon.maxUses}`}
                            </Text>
                            {maxUsesReached && (
                              <Badge colorScheme="orange" fontSize="xs">
                                Limite atingido
                              </Badge>
                            )}
                          </Td>
                          <Td>
                            <HStack spacing={2}>
                              <Badge colorScheme={coupon.isActive ? 'green' : 'gray'}>
                                {coupon.isActive ? 'Ativo' : 'Inativo'}
                              </Badge>
                              {isExpired && (
                                <Badge colorScheme="red" fontSize="xs">
                                  Expirado
                                </Badge>
                              )}
                            </HStack>
                          </Td>
                          <Td>
                            <Text fontSize="sm" color="gray.600">
                              {formatDate(coupon.expiresAt)}
                            </Text>
                          </Td>
                          <Td>
                            <Switch
                              isChecked={coupon.isActive}
                              onChange={() => handleToggleActive(coupon)}
                              colorScheme="green"
                              size="sm"
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
              cupons
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

      {/* Modal de Criação */}
      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Criar Novo Cupom</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <FormControl isRequired>
                <FormLabel>Código do Cupom</FormLabel>
                <Input
                  placeholder="Ex: PROMO10"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value.toUpperCase() })
                  }
                  textTransform="uppercase"
                />
              </FormControl>

              <FormControl>
                <FormLabel>Descrição</FormLabel>
                <Textarea
                  placeholder="Descrição opcional do cupom"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                />
              </FormControl>

              <HStack spacing={4} align="start">
                <FormControl isRequired>
                  <FormLabel>Tipo de Desconto</FormLabel>
                  <Select
                    value={formData.discountType}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        discountType: e.target.value as 'PERCENT' | 'FIXED',
                      })
                    }
                  >
                    <option value="PERCENT">Percentual (%)</option>
                    <option value="FIXED">Valor Fixo (R$)</option>
                  </Select>
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>
                    Valor {formData.discountType === 'PERCENT' ? '(%)' : '(R$)'}
                  </FormLabel>
                  <NumberInput
                    min={0}
                    max={formData.discountType === 'PERCENT' ? 100 : undefined}
                    value={formData.discountValue}
                    onChange={(_, value) => setFormData({ ...formData, discountValue: value })}
                  >
                    <NumberInputField />
                  </NumberInput>
                </FormControl>
              </HStack>

              <FormControl>
                <FormLabel>Plano (opcional)</FormLabel>
                <Select
                  placeholder="Todos os planos"
                  value={formData.appliesToPlanId}
                  onChange={(e) => setFormData({ ...formData, appliesToPlanId: e.target.value })}
                >
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </Select>
              </FormControl>

              <HStack spacing={4} align="start">
                <FormControl>
                  <FormLabel>Máximo de Usos (opcional)</FormLabel>
                  <NumberInput
                    min={1}
                    value={formData.maxUses}
                    onChange={(value) => setFormData({ ...formData, maxUses: value })}
                  >
                    <NumberInputField placeholder="Ilimitado" />
                  </NumberInput>
                </FormControl>

                <FormControl>
                  <FormLabel>Data de Expiração (opcional)</FormLabel>
                  <Input
                    type="date"
                    value={formData.expiresAt}
                    onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                  />
                </FormControl>
              </HStack>

              <Alert status="info" borderRadius="md">
                <AlertIcon />
                <Box fontSize="sm">
                  <Text fontWeight="semibold">Atenção</Text>
                  <Text>O cupom será criado como ativo por padrão.</Text>
                </Box>
              </Alert>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onClose} isDisabled={formLoading}>
              Cancelar
            </Button>
            <Button colorScheme="blue" onClick={handleCreateCoupon} isLoading={formLoading}>
              Criar Cupom
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </AdminLayout>
  );
};
