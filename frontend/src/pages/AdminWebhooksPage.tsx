import React, { useEffect, useState, useCallback } from 'react';
import { Heading, Card, CardBody, Table, Thead, Tbody, Tr, Th, Td, Badge, Spinner, Center, VStack, Text, Button, HStack, Alert, AlertIcon, AlertTitle, AlertDescription, Box } from '@chakra-ui/react';
import { AdminLayout } from '../components/AdminLayout';
import { api } from '../services/api';

interface WebhookLog { id: string; event: string; processed: boolean; error: string | null; createdAt: string; }

export const AdminWebhooksPage: React.FC = () => {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.request<{ logs: WebhookLog[]; pagination: typeof pagination }>(`/api/admin/webhooks?page=${pagination.page}&limit=20`, { method: 'GET', skipAutoLogout: true });
      setLogs(response.logs);
      setPagination(response.pagination);
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message || 'Erro ao carregar logs de webhooks');
    } finally {
      setLoading(false);
    }
  }, [pagination.page]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  if (loading) return <AdminLayout><Center h="400px"><VStack spacing={4}><Spinner size="xl" color="blue.500" thickness="4px" /><Text color="gray.600">Carregando webhooks...</Text></VStack></Center></AdminLayout>;

  return (
    <AdminLayout>
      <VStack spacing={6} align="stretch">
        <Heading size="lg">Webhooks</Heading>

        {error && (
          <Alert status="error" borderRadius="md" mb={4}>
            <AlertIcon />
            <Box flex={1}>
              <AlertTitle>Erro ao carregar dados</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Box>
            <Button size="sm" colorScheme="red" variant="outline" onClick={loadLogs} ml={4}>
              Tentar Novamente
            </Button>
          </Alert>
        )}

        {!error && logs.length === 0 && (
          <Alert status="info" borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle>Nenhum registro encontrado</AlertTitle>
              <AlertDescription>Ainda não há logs de webhooks registrados no sistema.</AlertDescription>
            </Box>
          </Alert>
        )}

        {!error && logs.length > 0 && (
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
        )}
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
