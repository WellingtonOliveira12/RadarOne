import React, { useEffect, useState, useCallback, memo } from 'react';
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
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Code,
  useDisclosure,
} from '@chakra-ui/react';
import { AdminLayout } from '../components/AdminLayout';
import { ExportButton } from '../components/ExportButton';
import { api } from '../services/api';

interface AuditLog {
  id: string;
  adminId: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface AuditLogsResponse {
  logs: AuditLog[];
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
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getActionLabel = (action: string): string => {
  const labels: Record<string, string> = {
    USER_BLOCKED: 'Usuário Bloqueado',
    USER_UNBLOCKED: 'Usuário Desbloqueado',
    USER_UPDATED: 'Usuário Atualizado',
    USER_DELETED: 'Usuário Deletado',
    USER_ROLE_CHANGED: 'Role Alterada',
    SUBSCRIPTION_CREATED: 'Assinatura Criada',
    SUBSCRIPTION_UPDATED: 'Assinatura Atualizada',
    SUBSCRIPTION_CANCELLED: 'Assinatura Cancelada',
    SUBSCRIPTION_EXTENDED: 'Assinatura Estendida',
    SUBSCRIPTION_TRIAL_RESET: 'Trial Resetado',
    COUPON_CREATED: 'Cupom Criado',
    COUPON_UPDATED: 'Cupom Atualizado',
    COUPON_DELETED: 'Cupom Deletado',
    COUPON_ACTIVATED: 'Cupom Ativado',
    COUPON_DEACTIVATED: 'Cupom Desativado',
    MONITOR_DEACTIVATED: 'Monitor Desativado',
    MONITOR_DELETED: 'Monitor Deletado',
    SYSTEM_SETTING_UPDATED: 'Configuração Alterada',
    SYSTEM_MAINTENANCE_ENABLED: 'Manutenção Ativada',
    SYSTEM_MAINTENANCE_DISABLED: 'Manutenção Desativada',
  };
  return labels[action] || action;
};

const getActionBadgeColor = (action: string): string => {
  if (action.includes('DELETED') || action.includes('BLOCKED') || action.includes('CANCELLED')) {
    return 'red';
  }
  if (action.includes('CREATED') || action.includes('ACTIVATED') || action.includes('UNBLOCKED')) {
    return 'green';
  }
  if (action.includes('UPDATED') || action.includes('EXTENDED')) {
    return 'blue';
  }
  return 'gray';
};

const getTargetTypeBadgeColor = (targetType: string): string => {
  const colors: Record<string, string> = {
    USER: 'purple',
    SUBSCRIPTION: 'blue',
    COUPON: 'orange',
    MONITOR: 'teal',
    SYSTEM: 'red',
  };
  return colors[targetType] || 'gray';
};

interface AuditLogRowProps {
  log: AuditLog;
  onViewDetails: (log: AuditLog) => void;
}

const AuditLogRow = memo(({ log, onViewDetails }: AuditLogRowProps) => {
  const actionColor = getActionBadgeColor(log.action);
  const targetTypeColor = getTargetTypeBadgeColor(log.targetType);
  return (
    <Tr>
      <Td fontSize="sm">
        {formatDate(log.createdAt)}
      </Td>
      <Td fontSize="sm">
        <Text fontWeight="medium">{log.adminEmail}</Text>
      </Td>
      <Td>
        <Badge colorScheme={actionColor}>
          {getActionLabel(log.action)}
        </Badge>
      </Td>
      <Td>
        <Badge colorScheme={targetTypeColor}>
          {log.targetType}
        </Badge>
      </Td>
      <Td fontSize="sm" maxW="150px" isTruncated>
        {log.targetId || '-'}
      </Td>
      <Td fontSize="sm">
        {log.ipAddress || '-'}
      </Td>
      <Td>
        <Button
          size="sm"
          colorScheme="blue"
          variant="outline"
          onClick={() => onViewDetails(log)}
        >
          Detalhes
        </Button>
      </Td>
    </Tr>
  );
});

AuditLogRow.displayName = 'AuditLogRow';

export const AdminAuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();

  // Filtros
  const [filters, setFilters] = useState({
    action: '',
    targetType: '',
    startDate: '',
    endDate: '',
  });

  const fetchLogs = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: page.toString(),
        limit: pagination.limit.toString(),
      });

      if (filters.action) params.append('action', filters.action);
      if (filters.targetType) params.append('targetType', filters.targetType);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const response = await api.request<AuditLogsResponse>(`/api/admin/audit-logs?${params}`, { method: 'GET', skipAutoLogout: true });
      setLogs(response.logs);
      setPagination(response.pagination);
    } catch (err: unknown) {
      console.error('Erro ao buscar audit logs:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar audit logs');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.limit]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleFilterChange = (field: string, value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleApplyFilters = () => {
    fetchLogs(1);
  };

  const handleClearFilters = () => {
    setFilters({
      action: '',
      targetType: '',
      startDate: '',
      endDate: '',
    });
    setTimeout(() => fetchLogs(1), 0);
  };

  const handlePageChange = (newPage: number) => {
    fetchLogs(newPage);
  };

  const handleViewDetails = useCallback((log: AuditLog) => {
    setSelectedLog(log);
    onOpen();
  }, [onOpen]);

  if (loading && logs.length === 0) {
    return (
      <AdminLayout>
        <Center h="400px">
          <Spinner size="xl" color="blue.500" />
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
            <AlertTitle>Erro ao carregar audit logs</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Box>
          <Button size="sm" colorScheme="red" variant="outline" onClick={() => fetchLogs()} ml={4}>
            Tentar Novamente
          </Button>
        </Alert>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <VStack spacing={6} align="stretch">
        <HStack justify="space-between" align="start">
          <Box>
            <Heading size="lg" mb={2}>
              Audit Logs
            </Heading>
            <Text color="gray.600">
              Histórico completo de ações administrativas no sistema
            </Text>
          </Box>
          <ExportButton
            endpoint="/api/admin/audit-logs/export"
            queryParams={filters}
            label="Exportar Logs"
          />
        </HStack>

        {/* Filtros */}
        <Card>
          <CardBody>
            <VStack spacing={4} align="stretch">
              <HStack spacing={4} wrap="wrap">
                <Box flex="1" minW="200px">
                  <Text fontSize="sm" fontWeight="medium" mb={2}>
                    Ação
                  </Text>
                  <Select
                    placeholder="Todas as ações"
                    value={filters.action}
                    onChange={(e) => handleFilterChange('action', e.target.value)}
                  >
                    <option value="USER_BLOCKED">Usuário Bloqueado</option>
                    <option value="USER_UNBLOCKED">Usuário Desbloqueado</option>
                    <option value="SUBSCRIPTION_UPDATED">Assinatura Atualizada</option>
                    <option value="COUPON_CREATED">Cupom Criado</option>
                    <option value="COUPON_UPDATED">Cupom Atualizado</option>
                  </Select>
                </Box>

                <Box flex="1" minW="200px">
                  <Text fontSize="sm" fontWeight="medium" mb={2}>
                    Tipo de Entidade
                  </Text>
                  <Select
                    placeholder="Todas as entidades"
                    value={filters.targetType}
                    onChange={(e) => handleFilterChange('targetType', e.target.value)}
                  >
                    <option value="USER">Usuário</option>
                    <option value="SUBSCRIPTION">Assinatura</option>
                    <option value="COUPON">Cupom</option>
                    <option value="MONITOR">Monitor</option>
                    <option value="SYSTEM">Sistema</option>
                  </Select>
                </Box>

                <Box flex="1" minW="200px">
                  <Text fontSize="sm" fontWeight="medium" mb={2}>
                    Data Início
                  </Text>
                  <Input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => handleFilterChange('startDate', e.target.value)}
                  />
                </Box>

                <Box flex="1" minW="200px">
                  <Text fontSize="sm" fontWeight="medium" mb={2}>
                    Data Fim
                  </Text>
                  <Input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => handleFilterChange('endDate', e.target.value)}
                  />
                </Box>
              </HStack>

              <HStack>
                <Button colorScheme="blue" onClick={handleApplyFilters}>
                  Aplicar Filtros
                </Button>
                <Button variant="outline" onClick={handleClearFilters}>
                  Limpar
                </Button>
              </HStack>
            </VStack>
          </CardBody>
        </Card>

        {/* Estatísticas */}
        <HStack spacing={4}>
          <Card flex="1">
            <CardBody>
              <Text fontSize="sm" color="gray.600">
                Total de Registros
              </Text>
              <Text fontSize="2xl" fontWeight="bold">
                {pagination.total}
              </Text>
            </CardBody>
          </Card>
        </HStack>

        {/* Tabela */}
        <Card>
          <CardBody overflowX="auto">
            <Table variant="simple">
              <Thead>
                <Tr>
                  <Th>Data/Hora</Th>
                  <Th>Admin</Th>
                  <Th>Ação</Th>
                  <Th>Entidade</Th>
                  <Th>Target ID</Th>
                  <Th>IP</Th>
                  <Th>Ações</Th>
                </Tr>
              </Thead>
              <Tbody>
                {logs.length === 0 ? (
                  <Tr>
                    <Td colSpan={7} textAlign="center" py={10}>
                      <VStack spacing={2}>
                        <Text color="gray.600" fontWeight="medium">
                          Nenhum audit log encontrado
                        </Text>
                        <Text color="gray.400" fontSize="sm">
                          {filters.action || filters.targetType || filters.startDate || filters.endDate
                            ? 'Tente ajustar ou limpar os filtros para ver mais resultados.'
                            : 'As ações administrativas realizadas no sistema aparecerão aqui.'}
                        </Text>
                      </VStack>
                    </Td>
                  </Tr>
                ) : (
                  logs.map((log) => (
                    <AuditLogRow
                      key={log.id}
                      log={log}
                      onViewDetails={handleViewDetails}
                    />
                  ))
                )}
              </Tbody>
            </Table>
          </CardBody>
        </Card>

        {/* Paginação */}
        {pagination.totalPages > 1 && (
          <HStack justify="center" spacing={2}>
            <Button
              onClick={() => handlePageChange(pagination.page - 1)}
              isDisabled={pagination.page === 1}
              size="sm"
            >
              Anterior
            </Button>
            <Text fontSize="sm">
              Página {pagination.page} de {pagination.totalPages}
            </Text>
            <Button
              onClick={() => handlePageChange(pagination.page + 1)}
              isDisabled={pagination.page === pagination.totalPages}
              size="sm"
            >
              Próxima
            </Button>
          </HStack>
        )}
      </VStack>

      {/* Modal de Detalhes */}
      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Detalhes do Audit Log</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            {selectedLog && (
              <VStack spacing={4} align="stretch">
                <Box>
                  <Text fontWeight="bold" fontSize="sm" mb={1}>
                    ID
                  </Text>
                  <Code fontSize="xs" p={2} w="100%" wordBreak="break-all">
                    {selectedLog.id}
                  </Code>
                </Box>

                <Box>
                  <Text fontWeight="bold" fontSize="sm" mb={1}>
                    Admin
                  </Text>
                  <Text>{selectedLog.adminEmail}</Text>
                </Box>

                <Box>
                  <Text fontWeight="bold" fontSize="sm" mb={1}>
                    Ação
                  </Text>
                  <Badge colorScheme={getActionBadgeColor(selectedLog.action)}>
                    {getActionLabel(selectedLog.action)}
                  </Badge>
                </Box>

                <Box>
                  <Text fontWeight="bold" fontSize="sm" mb={1}>
                    Data/Hora
                  </Text>
                  <Text>{formatDate(selectedLog.createdAt)}</Text>
                </Box>

                <Box>
                  <Text fontWeight="bold" fontSize="sm" mb={1}>
                    IP / User Agent
                  </Text>
                  <Text fontSize="sm">{selectedLog.ipAddress || '-'}</Text>
                  <Text fontSize="xs" color="gray.600" mt={1}>
                    {selectedLog.userAgent || '-'}
                  </Text>
                </Box>

                {selectedLog.beforeData && (
                  <Box>
                    <Text fontWeight="bold" fontSize="sm" mb={1}>
                      Dados Anteriores
                    </Text>
                    <Code
                      fontSize="xs"
                      p={3}
                      w="100%"
                      display="block"
                      whiteSpace="pre-wrap"
                      wordBreak="break-word"
                    >
                      {JSON.stringify(selectedLog.beforeData, null, 2)}
                    </Code>
                  </Box>
                )}

                {selectedLog.afterData && (
                  <Box>
                    <Text fontWeight="bold" fontSize="sm" mb={1}>
                      Dados Posteriores
                    </Text>
                    <Code
                      fontSize="xs"
                      p={3}
                      w="100%"
                      display="block"
                      whiteSpace="pre-wrap"
                      wordBreak="break-word"
                    >
                      {JSON.stringify(selectedLog.afterData, null, 2)}
                    </Code>
                  </Box>
                )}
              </VStack>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </AdminLayout>
  );
};
