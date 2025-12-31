/**
 * FASE 4.1 - Página de Alertas Administrativos (Melhorada)
 * - Filtros por tipo, severidade e status
 * - Visualização de metadata (JSON)
 * - Paginação
 * - Badge de alertas não lidos
 */

import React, { useEffect, useState } from 'react';
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
  metadata?: Record<string, any>;
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
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);

  // Filtros
  const [filterType, setFilterType] = useState<string>('');
  const [filterSeverity, setFilterSeverity] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  useEffect(() => {
    loadAlerts();
  }, [filterType, filterSeverity, filterStatus]);

  const loadAlerts = async () => {
    try {
      setLoading(true);

      const params = new URLSearchParams();
      if (filterType) params.append('type', filterType);
      if (filterSeverity) params.append('severity', filterSeverity);
      if (filterStatus === 'unread') params.append('isRead', 'false');
      if (filterStatus === 'read') params.append('isRead', 'true');

      const response = await api.get(`/api/admin/alerts?${params.toString()}`);
      setAlerts(response.alerts);
      setUnreadCount(response.unreadCount);
      setTotal(response.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await api.put(`/api/admin/alerts/${id}/read`);
      loadAlerts();
    } catch (err) {
      console.error(err);
    }
  };

  const clearFilters = () => {
    setFilterType('');
    setFilterSeverity('');
    setFilterStatus('');
  };

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
              queryParams={{ type: filterType, severity: filterSeverity, isRead: filterStatus === 'read' ? 'true' : filterStatus === 'unread' ? 'false' : undefined }}
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

        {/* Lista de Alertas */}
        {alerts.length === 0 ? (
          <Alert status="info">
            <AlertIcon />
            {filterType || filterSeverity || filterStatus
              ? 'Nenhum alerta encontrado com os filtros aplicados'
              : 'Nenhum alerta no momento'}
          </Alert>
        ) : (
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

const AlertCard: React.FC<AlertCardProps> = ({ alert, onMarkAsRead }) => {
  const { isOpen, onToggle } = useDisclosure();

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
            <Badge colorScheme={getSeverityColor(alert.severity)}>
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
};
