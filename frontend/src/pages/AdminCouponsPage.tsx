import React, { useState, useEffect } from 'react';
import {
  Box,
  Heading,
  VStack,
  HStack,
  Card,
  CardBody,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Button,
  IconButton,
  Text,
  Input,
  Select,
  Spinner,
  Center,
  Alert,
  AlertIcon,
  useToast,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  FormControl,
  FormLabel,
  FormErrorMessage,
  NumberInput,
  NumberInputField,
  Tooltip,
  Checkbox,
} from '@chakra-ui/react';
import { AdminLayout } from '../components/AdminLayout';
import { api } from '../services/api';
import { getToken } from '../lib/auth';

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  plan: { id: string; name: string; slug: string } | null;
  _count: { usageLogs: number };
}

interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Plan {
  id: string;
  name: string;
  slug: string;
}

export const AdminCouponsPage: React.FC = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
  });
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filtros
  const [filterCode, setFilterCode] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');

  // Bulk Operations
  const [selectedCouponIds, setSelectedCouponIds] = useState<Set<string>>(new Set());

  // Modals
  const { isOpen: isCreateOpen, onOpen: onCreateOpen, onClose: onCreateClose } = useDisclosure();
  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure();

  // Form State
  const [formData, setFormData] = useState({
    code: '',
    description: '',
    discountType: 'PERCENTAGE',
    discountValue: 0,
    maxUses: null as number | null,
    expiresAt: '',
    appliesToPlanId: null as string | null,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const toast = useToast();

  useEffect(() => {
    loadCoupons();
    loadPlans();
  }, [pagination.page, filterCode, filterStatus, filterType]);

  const loadPlans = async () => {
    try {
      const token = getToken();
      const response = await api.get<{ plans: Plan[] }>('/api/plans', token);
      setPlans(response.plans || []);
    } catch (err: any) {
      console.error('Erro ao carregar planos:', err);
    }
  };

  const loadCoupons = async () => {
    try {
      setLoading(true);
      const token = getToken();

      const queryParams = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });

      if (filterCode) queryParams.append('code', filterCode);
      if (filterStatus) queryParams.append('status', filterStatus);
      if (filterType) queryParams.append('type', filterType);

      const response = await api.get<{ coupons: Coupon[]; pagination: PaginationInfo }>(
        `/api/admin/coupons?${queryParams.toString()}`,
        token
      );

      setCoupons(response.coupons);
      setPagination(response.pagination);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar cupons');
      console.error('Erro ao carregar cupons:', err);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!formData.code.trim()) {
      errors.code = 'Código é obrigatório';
    } else if (formData.code.trim().length < 3) {
      errors.code = 'Código deve ter pelo menos 3 caracteres';
    }

    if (formData.discountValue <= 0) {
      errors.discountValue = 'Valor deve ser maior que 0';
    }

    if (formData.discountType === 'PERCENTAGE' && formData.discountValue > 100) {
      errors.discountValue = 'Desconto percentual não pode ser maior que 100%';
    }

    if (formData.expiresAt && new Date(formData.expiresAt) <= new Date()) {
      errors.expiresAt = 'Data de expiração deve ser futura';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateCoupon = async () => {
    if (!validateForm()) return;

    try {
      setSubmitting(true);
      const token = getToken();

      await api.post(
        '/api/admin/coupons',
        {
          code: formData.code.trim().toUpperCase(),
          description: formData.description.trim() || null,
          discountType: formData.discountType,
          discountValue: formData.discountValue,
          maxUses: formData.maxUses || null,
          expiresAt: formData.expiresAt || null,
          appliesToPlanId: formData.appliesToPlanId || null,
        },
        token
      );

      toast({
        title: 'Cupom criado com sucesso!',
        status: 'success',
        duration: 3000,
      });

      onCreateClose();
      resetForm();
      loadCoupons();
    } catch (err: any) {
      toast({
        title: 'Erro ao criar cupom',
        description: err.message,
        status: 'error',
        duration: 5000,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditCoupon = async () => {
    if (!editingCoupon || !validateForm()) return;

    try {
      setSubmitting(true);
      const token = getToken();

      await api.put(
        `/api/admin/coupons/${editingCoupon.id}`,
        {
          description: formData.description.trim() || null,
          discountType: formData.discountType,
          discountValue: formData.discountValue,
          maxUses: formData.maxUses || null,
          expiresAt: formData.expiresAt || null,
          appliesToPlanId: formData.appliesToPlanId || null,
        },
        token
      );

      toast({
        title: 'Cupom atualizado com sucesso!',
        status: 'success',
        duration: 3000,
      });

      onEditClose();
      setEditingCoupon(null);
      resetForm();
      loadCoupons();
    } catch (err: any) {
      toast({
        title: 'Erro ao atualizar cupom',
        description: err.message,
        status: 'error',
        duration: 5000,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleCoupon = async (coupon: Coupon) => {
    try {
      const token = getToken();
      await api.patch(`/api/admin/coupons/${coupon.id}/toggle`, {}, token);

      toast({
        title: `Cupom ${coupon.isActive ? 'desativado' : 'ativado'} com sucesso!`,
        status: 'success',
        duration: 3000,
      });

      loadCoupons();
    } catch (err: any) {
      toast({
        title: 'Erro ao alterar status',
        description: err.message,
        status: 'error',
        duration: 5000,
      });
    }
  };

  const handleDeleteCoupon = async (coupon: Coupon) => {
    if (!confirm(`Tem certeza que deseja deletar o cupom "${coupon.code}"?`)) return;

    try {
      const token = getToken();
      const response = await api.delete(`/api/admin/coupons/${coupon.id}`, token);

      toast({
        title: response.message || 'Cupom deletado',
        status: 'success',
        duration: 3000,
      });

      loadCoupons();
    } catch (err: any) {
      toast({
        title: 'Erro ao deletar cupom',
        description: err.message,
        status: 'error',
        duration: 5000,
      });
    }
  };

  const handleExportCoupons = async () => {
    try {
      const token = getToken();

      const queryParams = new URLSearchParams();
      if (filterCode) queryParams.append('code', filterCode);
      if (filterStatus) queryParams.append('status', filterStatus);
      if (filterType) queryParams.append('type', filterType);

      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || 'https://radarone.onrender.com'}/api/admin/coupons/export?${queryParams.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Erro ao exportar cupons');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cupons_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Cupons exportados com sucesso!',
        status: 'success',
        duration: 3000,
      });
    } catch (err: any) {
      toast({
        title: 'Erro ao exportar cupons',
        description: err.message,
        status: 'error',
        duration: 5000,
      });
    }
  };

  const openEditModal = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setFormData({
      code: coupon.code,
      description: coupon.description || '',
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      maxUses: coupon.maxUses,
      expiresAt: coupon.expiresAt ? coupon.expiresAt.substring(0, 16) : '',
      appliesToPlanId: coupon.plan?.id || null,
    });
    onEditOpen();
  };

  const resetForm = () => {
    setFormData({
      code: '',
      description: '',
      discountType: 'PERCENTAGE',
      discountValue: 0,
      maxUses: null,
      expiresAt: '',
      appliesToPlanId: null,
    });
    setFormErrors({});
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const formatDiscount = (type: string, value: number) => {
    if (type === 'PERCENTAGE') {
      return `${value}%`;
    }
    return `R$ ${(value / 100).toFixed(2)}`;
  };

  const handlePreviousPage = () => {
    if (pagination.page > 1) {
      setPagination((prev) => ({ ...prev, page: prev.page - 1 }));
    }
  };

  const handleNextPage = () => {
    if (pagination.page < pagination.totalPages) {
      setPagination((prev) => ({ ...prev, page: prev.page + 1 }));
    }
  };

  // Bulk Operations Handlers
  const handleSelectAll = () => {
    if (selectedCouponIds.size === coupons.length) {
      // Deselect all
      setSelectedCouponIds(new Set());
    } else {
      // Select all on current page
      setSelectedCouponIds(new Set(coupons.map((c) => c.id)));
    }
  };

  const handleSelectCoupon = (couponId: string) => {
    const newSelected = new Set(selectedCouponIds);
    if (newSelected.has(couponId)) {
      newSelected.delete(couponId);
    } else {
      newSelected.add(couponId);
    }
    setSelectedCouponIds(newSelected);
  };

  const handleBulkActivate = async () => {
    if (selectedCouponIds.size === 0) return;

    try {
      const token = getToken();
      const couponIds = Array.from(selectedCouponIds);

      await api.patch(
        '/api/admin/coupons/bulk/toggle',
        { couponIds, isActive: true },
        token
      );

      toast({
        title: `${selectedCouponIds.size} cupom(ns) ativado(s) com sucesso!`,
        status: 'success',
        duration: 3000,
      });

      setSelectedCouponIds(new Set());
      loadCoupons();
    } catch (err: any) {
      toast({
        title: 'Erro ao ativar cupons',
        description: err.message,
        status: 'error',
        duration: 5000,
      });
    }
  };

  const handleBulkDeactivate = async () => {
    if (selectedCouponIds.size === 0) return;

    try {
      const token = getToken();
      const couponIds = Array.from(selectedCouponIds);

      await api.patch(
        '/api/admin/coupons/bulk/toggle',
        { couponIds, isActive: false },
        token
      );

      toast({
        title: `${selectedCouponIds.size} cupom(ns) desativado(s) com sucesso!`,
        status: 'success',
        duration: 3000,
      });

      setSelectedCouponIds(new Set());
      loadCoupons();
    } catch (err: any) {
      toast({
        title: 'Erro ao desativar cupons',
        description: err.message,
        status: 'error',
        duration: 5000,
      });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedCouponIds.size === 0) return;

    if (
      !confirm(
        `Tem certeza que deseja deletar ${selectedCouponIds.size} cupom(ns)?\n\nCupons com histórico de uso serão apenas desativados.`
      )
    ) {
      return;
    }

    try {
      const token = getToken();
      const couponIds = Array.from(selectedCouponIds);

      // Note: DELETE with body requires custom implementation
      // Using fetch directly for DELETE with body
      const result = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || 'https://radarone.onrender.com'}/api/admin/coupons/bulk`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ couponIds }),
        }
      );

      if (!result.ok) {
        throw new Error('Erro ao deletar cupons');
      }

      const data = await result.json();

      toast({
        title: 'Operação concluída',
        description: data.message || `${data.deleted} deletado(s), ${data.deactivated} desativado(s)`,
        status: 'success',
        duration: 5000,
      });

      setSelectedCouponIds(new Set());
      loadCoupons();
    } catch (err: any) {
      toast({
        title: 'Erro ao deletar cupons',
        description: err.message,
        status: 'error',
        duration: 5000,
      });
    }
  };

  return (
    <AdminLayout>
      <VStack spacing={6} align="stretch">
        {/* Header */}
        <Box>
          <Heading size="lg" mb={2}>
            Cupons de Desconto
          </Heading>
          <Text color="gray.600">Gerenciar cupons promocionais e descontos</Text>
        </Box>

        {error && (
          <Alert status="error">
            <AlertIcon />
            {error}
          </Alert>
        )}

        {/* Filters */}
        <Card>
          <CardBody>
            <HStack spacing={4} flexWrap="wrap" justify="space-between">
              <HStack spacing={4} flexWrap="wrap">
                <Box>
                  <Text fontSize="sm" fontWeight="semibold" mb={2}>
                    Código:
                  </Text>
                  <Input
                    value={filterCode}
                    onChange={(e) => {
                      setFilterCode(e.target.value);
                      setPagination((prev) => ({ ...prev, page: 1 }));
                    }}
                    placeholder="Buscar por código"
                    size="sm"
                    minW="200px"
                  />
                </Box>

                <Box>
                  <Text fontSize="sm" fontWeight="semibold" mb={2}>
                    Status:
                  </Text>
                  <Select
                    value={filterStatus}
                    onChange={(e) => {
                      setFilterStatus(e.target.value);
                      setPagination((prev) => ({ ...prev, page: 1 }));
                    }}
                    size="sm"
                    minW="150px"
                  >
                    <option value="">Todos</option>
                    <option value="active">Ativos</option>
                    <option value="inactive">Inativos</option>
                  </Select>
                </Box>

                <Box>
                  <Text fontSize="sm" fontWeight="semibold" mb={2}>
                    Tipo:
                  </Text>
                  <Select
                    value={filterType}
                    onChange={(e) => {
                      setFilterType(e.target.value);
                      setPagination((prev) => ({ ...prev, page: 1 }));
                    }}
                    size="sm"
                    minW="150px"
                  >
                    <option value="">Todos</option>
                    <option value="PERCENTAGE">Percentual</option>
                    <option value="FIXED">Fixo</option>
                  </Select>
                </Box>
              </HStack>

              <HStack spacing={2}>
                <Button
                  colorScheme="green"
                  variant="outline"
                  onClick={handleExportCoupons}
                  size="sm"
                >
                  📥 Exportar CSV
                </Button>
                <Button colorScheme="blue" onClick={onCreateOpen} size="sm">
                  + Novo Cupom
                </Button>
              </HStack>
            </HStack>
          </CardBody>
        </Card>

        {/* Bulk Actions Bar (appears when items are selected) */}
        {selectedCouponIds.size > 0 && (
          <Card bg="blue.50" borderColor="blue.300" borderWidth="2px">
            <CardBody>
              <HStack justify="space-between" flexWrap="wrap">
                <Text fontWeight="bold" color="blue.800">
                  {selectedCouponIds.size} cupom(ns) selecionado(s)
                </Text>
                <HStack spacing={2}>
                  <Button
                    size="sm"
                    colorScheme="green"
                    onClick={handleBulkActivate}
                  >
                    ✅ Ativar Selecionados
                  </Button>
                  <Button
                    size="sm"
                    colorScheme="gray"
                    onClick={handleBulkDeactivate}
                  >
                    ⏸️ Desativar Selecionados
                  </Button>
                  <Button
                    size="sm"
                    colorScheme="red"
                    onClick={handleBulkDelete}
                  >
                    🗑️ Deletar Selecionados
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedCouponIds(new Set())}
                  >
                    Limpar Seleção
                  </Button>
                </HStack>
              </HStack>
            </CardBody>
          </Card>
        )}

        {/* Coupons Table */}
        <Card>
          <CardBody>
            {loading ? (
              <Center py={10}>
                <Spinner size="xl" color="blue.500" />
              </Center>
            ) : (
              <>
                <Table variant="simple" size="sm">
                  <Thead>
                    <Tr>
                      <Th>
                        <Checkbox
                          isChecked={coupons.length > 0 && selectedCouponIds.size === coupons.length}
                          isIndeterminate={selectedCouponIds.size > 0 && selectedCouponIds.size < coupons.length}
                          onChange={handleSelectAll}
                        />
                      </Th>
                      <Th>Código</Th>
                      <Th>Descrição</Th>
                      <Th>Tipo</Th>
                      <Th>Desconto</Th>
                      <Th>Plano</Th>
                      <Th>Usos</Th>
                      <Th>Expira em</Th>
                      <Th>Status</Th>
                      <Th>Ações</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {coupons.length === 0 ? (
                      <Tr>
                        <Td colSpan={10} textAlign="center" py={8} color="gray.500">
                          Nenhum cupom encontrado
                        </Td>
                      </Tr>
                    ) : (
                      coupons.map((coupon) => (
                        <Tr key={coupon.id}>
                          <Td>
                            <Checkbox
                              isChecked={selectedCouponIds.has(coupon.id)}
                              onChange={() => handleSelectCoupon(coupon.id)}
                            />
                          </Td>
                          <Td fontWeight="bold">{coupon.code}</Td>
                          <Td maxW="200px" isTruncated>
                            {coupon.description || '-'}
                          </Td>
                          <Td>
                            <Badge colorScheme={coupon.discountType === 'PERCENTAGE' ? 'purple' : 'orange'}>
                              {coupon.discountType === 'PERCENTAGE' ? 'Percentual' : 'Fixo'}
                            </Badge>
                          </Td>
                          <Td>{formatDiscount(coupon.discountType, coupon.discountValue)}</Td>
                          <Td fontSize="sm">{coupon.plan?.name || 'Todos'}</Td>
                          <Td>
                            {coupon._count.usageLogs}
                            {coupon.maxUses ? ` / ${coupon.maxUses}` : ' / ∞'}
                          </Td>
                          <Td fontSize="sm">{formatDate(coupon.expiresAt)}</Td>
                          <Td>
                            <Badge colorScheme={coupon.isActive ? 'green' : 'red'}>
                              {coupon.isActive ? 'Ativo' : 'Inativo'}
                            </Badge>
                          </Td>
                          <Td>
                            <HStack spacing={1}>
                              <Tooltip label={coupon.isActive ? 'Desativar' : 'Ativar'}>
                                <IconButton
                                  aria-label="Toggle status"
                                  icon={<Text>{coupon.isActive ? '⏸️' : '▶️'}</Text>}
                                  size="xs"
                                  variant="ghost"
                                  onClick={() => handleToggleCoupon(coupon)}
                                />
                              </Tooltip>
                              <Tooltip label="Editar">
                                <IconButton
                                  aria-label="Editar"
                                  icon={<Text>✏️</Text>}
                                  size="xs"
                                  variant="ghost"
                                  onClick={() => openEditModal(coupon)}
                                />
                              </Tooltip>
                              <Tooltip label="Deletar">
                                <IconButton
                                  aria-label="Deletar"
                                  icon={<Text>🗑️</Text>}
                                  size="xs"
                                  variant="ghost"
                                  colorScheme="red"
                                  onClick={() => handleDeleteCoupon(coupon)}
                                />
                              </Tooltip>
                            </HStack>
                          </Td>
                        </Tr>
                      ))
                    )}
                  </Tbody>
                </Table>

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                  <HStack justify="space-between" mt={6}>
                    <Button
                      onClick={handlePreviousPage}
                      isDisabled={pagination.page === 1}
                      size="sm"
                      colorScheme="blue"
                      variant="outline"
                    >
                      ← Anterior
                    </Button>

                    <Text fontSize="sm" color="gray.600">
                      Página {pagination.page} de {pagination.totalPages} (Total: {pagination.total})
                    </Text>

                    <Button
                      onClick={handleNextPage}
                      isDisabled={pagination.page === pagination.totalPages}
                      size="sm"
                      colorScheme="blue"
                      variant="outline"
                    >
                      Próximo →
                    </Button>
                  </HStack>
                )}
              </>
            )}
          </CardBody>
        </Card>
      </VStack>

      {/* Create Coupon Modal */}
      <Modal isOpen={isCreateOpen} onClose={onCreateClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Criar Novo Cupom</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <FormControl isInvalid={!!formErrors.code}>
                <FormLabel>Código do Cupom *</FormLabel>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="Ex: PROMO10"
                  maxLength={20}
                />
                <FormErrorMessage>{formErrors.code}</FormErrorMessage>
              </FormControl>

              <FormControl>
                <FormLabel>Descrição</FormLabel>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descrição do cupom"
                />
              </FormControl>

              <FormControl isInvalid={!!formErrors.discountType}>
                <FormLabel>Tipo de Desconto *</FormLabel>
                <Select
                  value={formData.discountType}
                  onChange={(e) => setFormData({ ...formData, discountType: e.target.value })}
                >
                  <option value="PERCENTAGE">Percentual (%)</option>
                  <option value="FIXED">Fixo (R$)</option>
                </Select>
              </FormControl>

              <FormControl isInvalid={!!formErrors.discountValue}>
                <FormLabel>
                  Valor do Desconto * {formData.discountType === 'PERCENTAGE' ? '(%)' : '(R$)'}
                </FormLabel>
                <NumberInput
                  value={formData.discountValue}
                  onChange={(_, val) => setFormData({ ...formData, discountValue: val })}
                  min={0}
                  max={formData.discountType === 'PERCENTAGE' ? 100 : undefined}
                  precision={formData.discountType === 'FIXED' ? 2 : 0}
                >
                  <NumberInputField />
                </NumberInput>
                <FormErrorMessage>{formErrors.discountValue}</FormErrorMessage>
              </FormControl>

              <FormControl>
                <FormLabel>Plano Aplicável</FormLabel>
                <Select
                  value={formData.appliesToPlanId || ''}
                  onChange={(e) => setFormData({ ...formData, appliesToPlanId: e.target.value || null })}
                >
                  <option value="">Todos os planos</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel>Máximo de Usos</FormLabel>
                <NumberInput
                  value={formData.maxUses || ''}
                  onChange={(_, val) => setFormData({ ...formData, maxUses: val || null })}
                  min={0}
                >
                  <NumberInputField placeholder="Ilimitado" />
                </NumberInput>
              </FormControl>

              <FormControl isInvalid={!!formErrors.expiresAt}>
                <FormLabel>Data de Expiração</FormLabel>
                <Input
                  type="datetime-local"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                />
                <FormErrorMessage>{formErrors.expiresAt}</FormErrorMessage>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onCreateClose}>
              Cancelar
            </Button>
            <Button colorScheme="blue" onClick={handleCreateCoupon} isLoading={submitting}>
              Criar Cupom
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Edit Coupon Modal */}
      <Modal isOpen={isEditOpen} onClose={onEditClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Editar Cupom: {editingCoupon?.code}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <FormControl>
                <FormLabel>Código do Cupom</FormLabel>
                <Input value={formData.code} isReadOnly bg="gray.100" />
              </FormControl>

              <FormControl>
                <FormLabel>Descrição</FormLabel>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descrição do cupom"
                />
              </FormControl>

              <FormControl isInvalid={!!formErrors.discountType}>
                <FormLabel>Tipo de Desconto *</FormLabel>
                <Select
                  value={formData.discountType}
                  onChange={(e) => setFormData({ ...formData, discountType: e.target.value })}
                >
                  <option value="PERCENTAGE">Percentual (%)</option>
                  <option value="FIXED">Fixo (R$)</option>
                </Select>
              </FormControl>

              <FormControl isInvalid={!!formErrors.discountValue}>
                <FormLabel>
                  Valor do Desconto * {formData.discountType === 'PERCENTAGE' ? '(%)' : '(R$)'}
                </FormLabel>
                <NumberInput
                  value={formData.discountValue}
                  onChange={(_, val) => setFormData({ ...formData, discountValue: val })}
                  min={0}
                  max={formData.discountType === 'PERCENTAGE' ? 100 : undefined}
                  precision={formData.discountType === 'FIXED' ? 2 : 0}
                >
                  <NumberInputField />
                </NumberInput>
                <FormErrorMessage>{formErrors.discountValue}</FormErrorMessage>
              </FormControl>

              <FormControl>
                <FormLabel>Plano Aplicável</FormLabel>
                <Select
                  value={formData.appliesToPlanId || ''}
                  onChange={(e) => setFormData({ ...formData, appliesToPlanId: e.target.value || null })}
                >
                  <option value="">Todos os planos</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel>Máximo de Usos</FormLabel>
                <NumberInput
                  value={formData.maxUses || ''}
                  onChange={(_, val) => setFormData({ ...formData, maxUses: val || null })}
                  min={0}
                >
                  <NumberInputField placeholder="Ilimitado" />
                </NumberInput>
              </FormControl>

              <FormControl isInvalid={!!formErrors.expiresAt}>
                <FormLabel>Data de Expiração</FormLabel>
                <Input
                  type="datetime-local"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                />
                <FormErrorMessage>{formErrors.expiresAt}</FormErrorMessage>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onEditClose}>
              Cancelar
            </Button>
            <Button colorScheme="blue" onClick={handleEditCoupon} isLoading={submitting}>
              Salvar Alterações
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </AdminLayout>
  );
};
