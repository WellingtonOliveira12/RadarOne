import React, { useEffect, useState } from 'react';
import { Heading, Card, CardBody, Table, Thead, Tbody, Tr, Th, Td, Badge, Spinner, Center, VStack, Text, Button, HStack } from '@chakra-ui/react';
import { AdminLayout } from '../components/AdminLayout';
import { api } from '../services/api';

interface WebhookLog { id: string; event: string; processed: boolean; error: string | null; createdAt: string; }

export const AdminWebhooksPage: React.FC = () => {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });

  useEffect(() => { loadLogs(); }, [pagination.page]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/admin/webhooks?page=${pagination.page}&limit=20`);
      setLogs(response.logs);
      setPagination(response.pagination);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <AdminLayout><Center h="400px"><Spinner size="xl" /></Center></AdminLayout>;

  return (
    <AdminLayout>
      <VStack spacing={6} align="stretch">
        <Heading size="lg">Webhooks</Heading>
        <Card>
          <CardBody>
            <Table variant="simple" size="sm">
              <Thead><Tr><Th>Evento</Th><Th>Status</Th><Th>Erro</Th><Th>Data</Th></Tr></Thead>
              <Tbody>
                {logs.map(log => (
                  <Tr key={log.id}>
                    <Td>{log.event}</Td>
                    <Td><Badge colorScheme={log.processed ? 'green' : log.error ? 'red' : 'yellow'}>{log.processed ? 'Processado' : log.error ? 'Erro' : 'Pendente'}</Badge></Td>
                    <Td><Text fontSize="xs" noOfLines={1}>{log.error || '-'}</Text></Td>
                    <Td fontSize="sm">{new Date(log.createdAt).toLocaleString('pt-BR')}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </CardBody>
        </Card>
        {pagination.totalPages > 1 && (
          <HStack justify="center">
            <Button size="sm" onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))} isDisabled={pagination.page === 1}>Anterior</Button>
            <Text fontSize="sm">Página {pagination.page} de {pagination.totalPages}</Text>
            <Button size="sm" onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))} isDisabled={pagination.page === pagination.totalPages}>Próxima</Button>
          </HStack>
        )}
      </VStack>
    </AdminLayout>
  );
};
