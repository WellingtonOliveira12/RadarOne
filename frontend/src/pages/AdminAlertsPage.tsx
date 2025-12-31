import React, { useEffect, useState } from 'react';
import { Heading, Card, CardBody, VStack, Text, Badge, Spinner, Center, Alert, AlertIcon, Button, HStack } from '@chakra-ui/react';
import { AdminLayout } from '../components/AdminLayout';
import { api } from '../services/api';

interface AdminAlert { id: string; type: string; severity: string; title: string; message: string; isRead: boolean; createdAt: string; }

const getSeverityColor = (severity: string) => {
  const colors: Record<string, string> = { INFO: 'blue', WARNING: 'orange', ERROR: 'red', CRITICAL: 'purple' };
  return colors[severity] || 'gray';
};

export const AdminAlertsPage: React.FC = () => {
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => { loadAlerts(); }, []);

  const loadAlerts = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/admin/alerts');
      setAlerts(response.alerts);
      setUnreadCount(response.unreadCount);
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

  if (loading) return <AdminLayout><Center h="400px"><Spinner size="xl" /></Center></AdminLayout>;

  return (
    <AdminLayout>
      <VStack spacing={6} align="stretch">
        <HStack justify="space-between">
          <Heading size="lg">Alertas Administrativos</Heading>
          <Badge colorScheme="red" fontSize="md" px={3} py={1}>{unreadCount} não lidos</Badge>
        </HStack>
        {alerts.length === 0 ? (
          <Alert status="info"><AlertIcon />Nenhum alerta no momento</Alert>
        ) : (
          <VStack spacing={3} align="stretch">
            {alerts.map(alert => (
              <Card key={alert.id} bg={alert.isRead ? 'white' : 'blue.50'} borderWidth={alert.isRead ? 1 : 2} borderColor={alert.isRead ? 'gray.200' : 'blue.300'}>
                <CardBody>
                  <HStack justify="space-between" mb={2}>
                    <Badge colorScheme={getSeverityColor(alert.severity)}>{alert.severity}</Badge>
                    <Text fontSize="xs" color="gray.500">{new Date(alert.createdAt).toLocaleString('pt-BR')}</Text>
                  </HStack>
                  <Text fontWeight="bold" mb={1}>{alert.title}</Text>
                  <Text fontSize="sm" color="gray.600" mb={2}>{alert.message}</Text>
                  {!alert.isRead && (
                    <Button size="xs" colorScheme="blue" onClick={() => markAsRead(alert.id)}>Marcar como lido</Button>
                  )}
                </CardBody>
              </Card>
            ))}
          </VStack>
        )}
      </VStack>
    </AdminLayout>
  );
};
