/**
 * FASE 4.1 - Página de Alertas Administrativos (Melhorada)
 * - Filtros por tipo, severidade e status
 * - Visualização de metadata (JSON)
 * - Paginação
 * - Badge de alertas não lidos
 */

import React, { useEffect, useState, useCallback, useMemo, memo } from 'react';
import {
  Heading,
  Card,
  CardBody,
  VStack,
  Text,
  Badge,
  Spinner,
  Center,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Button,
  HStack,
  Select,
  Box,
  Code,
  Collapse,
  useDisclosure,
  Divider,
} from '@chakra-ui/react';
import { AdminLayout } from '../components/AdminLayout';
import { ExportButton } from '../components/ExportButton';
import { api } from '../services/api';

interface AdminAlert {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  source?: string;
  metadata?: Record<string, unknown>;
  isRead: boolean;
  readBy?: string;
  readAt?: string;
  createdAt: string;
}

const getSeverityColor = (severity: string) => {
  const colors: Record<string, string> = {
    INFO: 'blue',
    WARNING: 'orange',
    ERROR: 'red',
    CRITICAL: 'purple',
  };
  return colors[severity] || 'gray';
};

export const AdminAlertsPage: React.FC = () => {
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);

  // Filtros
  const [filterType, setFilterType] = useState<string>('');
  const [filterSeverity, setFilterSeverity] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  const loadAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (filterType) params.append('type', filterType);
      if (filterSeverity) params.append('severity', filterSeverity);
      if (filterStatus === 'unread') params.append('isRead', 'false');
      if (filterStatus === 'read') params.append('isRead', 'true');

      const response = await api.request<{ alerts: AdminAlert[]; unreadCount: number; total: number }>(`/api/admin/alerts?${params.toString()}`, { method: 'GET', skipAutoLogout: true });
      setAlerts(response.alerts);
      setUnreadCount(response.unreadCount);
      setTotal(response.total);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar alertas');
    } finally {
      setLoading(false);
    }
  }, [filterType, filterSeverity, filterStatus]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const markAsRead = useCallback(async (id: string) => {
    try {
      await api.put(`/api/admin/alerts/${id}/read`);
      loadAlerts();
    } catch (err) {
      console.error(err);
    }
  }, [loadAlerts]);

  const clearFilters = useCallback(() => {
    setFilterType('');
    setFilterSeverity('');
    setFilterStatus('');
  }, []);

  const exportQueryParams = useMemo(() => ({
    type: filterType,
    severity: filterSeverity,
    isRead: filterStatus === 'read' ? 'true' : filterStatus === 'unread' ? 'false' : undefined,
  }), [filterType, filterSeverity, filterStatus]);

  if (loading) {
    return (
      <AdminLayout>
        <Center h="400px">
          <Spinner size="xl" />
        </Center>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <VStack spacing={6} align="stretch">
        {/* Header */}
        <HStack justify="space-between">
          <Heading size="lg">Alertas Administrativos</Heading>
          <HStack>
            <Badge colorScheme="blue" fontSize="md" px={3} py={1}>
              Total: {total}
            </Badge>
            <Badge colorScheme="red" fontSize="md" px={3} py={1}>
              Não lidos: {unreadCount}
            </Badge>
            <ExportButton
              endpoint="/api/admin/alerts/export"
              queryParams={exportQueryParams}
              label="Exportar Alertas"
            />
          </HStack>
        </HStack>

        {/* Filtros */}
        <Card>
          <CardBody>
            <VStack align="stretch" spacing={4}>
              <Heading size="sm">Filtros</Heading>
              <HStack spacing={4}>
                <Box flex={1}>
                  <Text fontSize="sm" mb={1} fontWeight="medium">
                    Tipo
                  </Text>
                  <Select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    placeholder="Todos os tipos"
                  >
                    <option value="JOB_FAILURE">Job Falhou</option>
                    <option value="JOB_DELAYED">Job Atrasado</option>
                    <option value="WEBHOOK_ERROR">Erro no Webhook</option>
                    <option value="SPIKE_USERS">Pico de Usuários</option>
                    <option value="SPIKE_MONITORS">Pico de Monitores</option>
                    <option value="SYSTEM_ERROR">Erro do Sistema</option>
                  </Select>
                </Box>

                <Box flex={1}>
                  <Text fontSize="sm" mb={1} fontWeight="medium">
                    Severidade
                  </Text>
                  <Select
                    value={filterSeverity}
                    onChange={(e) => setFilterSeverity(e.target.value)}
                    placeholder="Todas as severidades"
                  >
                    <option value="INFO">Info</option>
                    <option value="WARNING">Warning</option>
                    <option value="ERROR">Error</option>
                    <option value="CRITICAL">Critical</option>
                  </Select>
                </Box>

                <Box flex={1}>
                  <Text fontSize="sm" mb={1} fontWeight="medium">
                    Status
                  </Text>
                  <Select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    placeholder="Todos os status"
                  >
                    <option value="unread">Não lidos</option>
                    <option value="read">Lidos</option>
                  </Select>
                </Box>

                <Box alignSelf="flex-end">
                  <Button onClick={clearFilters} variant="ghost" size="sm">
                    Limpar Filtros
                  </Button>
                </Box>
              </HStack>
            </VStack>
          </CardBody>
        </Card>

        {/* Error State */}
        {error && (
          <Alert status="error" borderRadius="md" mb={4}>
            <AlertIcon />
            <Box flex={1}>
              <AlertTitle>Erro ao carregar alertas</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Box>
            <Button size="sm" colorScheme="red" variant="outline" onClick={loadAlerts} ml={4}>
              Tentar Novamente
            </Button>
          </Alert>
        )}

        {/* Lista de Alertas */}
        {!error && alerts.length === 0 ? (
          <Alert status="info" borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle>Nenhum alerta encontrado</AlertTitle>
              <AlertDescription>
                {filterType || filterSeverity || filterStatus
                  ? 'Nenhum alerta corresponde aos filtros aplicados. Tente ajustar ou limpar os filtros.'
                  : 'Não há alertas administrativos no momento.'}
              </AlertDescription>
            </Box>
          </Alert>
        ) : !error && (
          <VStack spacing={3} align="stretch">
            {alerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onMarkAsRead={markAsRead}
              />
            ))}
          </VStack>
        )}
      </VStack>
    </AdminLayout>
  );
};

// Componente separado para o card de alerta
interface AlertCardProps {
  alert: AdminAlert;
  onMarkAsRead: (id: string) => void;
}

const AlertCard: React.FC<AlertCardProps> = memo(({ alert, onMarkAsRead }) => {
  const { isOpen, onToggle } = useDisclosure();
  const severityColor = useMemo(() => getSeverityColor(alert.severity), [alert.severity]);

  return (
    <Card
      bg={alert.isRead ? 'white' : 'blue.50'}
      borderWidth={alert.isRead ? 1 : 2}
      borderColor={alert.isRead ? 'gray.200' : 'blue.300'}
    >
      <CardBody>
        {/* Header */}
        <HStack justify="space-between" mb={2}>
          <HStack spacing={2}>
            <Badge colorScheme={severityColor}>
              {alert.severity}
            </Badge>
            <Badge colorScheme="gray" variant="outline">
              {alert.type}
            </Badge>
            {alert.source && (
              <Badge colorScheme="purple" variant="outline">
                {alert.source}
              </Badge>
            )}
          </HStack>
          <Text fontSize="xs" color="gray.500">
            {new Date(alert.createdAt).toLocaleString('pt-BR')}
          </Text>
        </HStack>

        {/* Conteúdo */}
        <Text fontWeight="bold" mb={1}>
          {alert.title}
        </Text>
        <Text fontSize="sm" color="gray.600" mb={2}>
          {alert.message}
        </Text>

        {/* Metadata (expandível) */}
        {alert.metadata && Object.keys(alert.metadata).length > 0 && (
          <>
            <Button size="xs" variant="ghost" onClick={onToggle} mb={2}>
              {isOpen ? 'Ocultar' : 'Ver'} Detalhes Técnicos
            </Button>
            <Collapse in={isOpen} animateOpacity>
              <Box
                bg="gray.50"
                p={3}
                borderRadius="md"
                border="1px"
                borderColor="gray.200"
                mb={2}
              >
                <Text fontSize="xs" fontWeight="bold" mb={2}>
                  Metadata:
                </Text>
                <Code
                  display="block"
                  whiteSpace="pre"
                  p={3}
                  fontSize="xs"
                  bg="white"
                  borderRadius="md"
                >
                  {JSON.stringify(alert.metadata, null, 2)}
                </Code>
              </Box>
            </Collapse>
          </>
        )}

        <Divider my={2} />

        {/* Ações */}
        <HStack justify="space-between">
          <HStack>
            {alert.isRead && alert.readBy && (
              <Text fontSize="xs" color="gray.500">
                Lido por {alert.readBy} em{' '}
                {alert.readAt
                  ? new Date(alert.readAt).toLocaleString('pt-BR')
                  : 'N/A'}
              </Text>
            )}
          </HStack>
          {!alert.isRead && (
            <Button
              size="xs"
              colorScheme="blue"
              onClick={() => onMarkAsRead(alert.id)}
            >
              Marcar como lido
            </Button>
          )}
        </HStack>
      </CardBody>
    </Card>
  );
});
