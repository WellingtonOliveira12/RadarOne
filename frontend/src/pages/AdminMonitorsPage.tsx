import React, { useEffect, useState } from 'react';
import { Heading, Card, CardBody, Table, Thead, Tbody, Tr, Th, Td, Badge, Spinner, Center, VStack, Text, Button, HStack, Alert, AlertIcon, AlertTitle, AlertDescription, Box } from '@chakra-ui/react';
import { AdminLayout } from '../components/AdminLayout';
import { ExportButton } from '../components/ExportButton';
import { api } from '../services/api';

interface Monitor { id: string; name: string; site: string; active: boolean; user: { name: string; email: string }; }

export const AdminMonitorsPage: React.FC = () => {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });

  useEffect(() => { loadMonitors(); }, [pagination.page]);

  const loadMonitors = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.request(`/api/admin/monitors?page=${pagination.page}&limit=20`, { method: 'GET', skipAutoLogout: true });
      setMonitors(response.monitors);
      setPagination(response.pagination);
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message || 'Erro ao carregar monitores');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <AdminLayout>
      <Center h="400px">
        <VStack spacing={4}>
          <Spinner size="xl" color="blue.500" />
          <Text color="gray.500">Carregando monitores...</Text>
        </VStack>
      </Center>
    </AdminLayout>
  );

  return (
    <AdminLayout>
      <VStack spacing={6} align="stretch">
        <HStack justify="space-between" align="center">
          <Heading size="lg">Monitores</Heading>
          <ExportButton
            endpoint="/api/admin/monitors/export"
            label="Exportar Monitores"
          />
        </HStack>

        {error && (
          <Alert status="error" borderRadius="md" mb={4}>
            <AlertIcon />
            <Box flex={1}>
              <AlertTitle>Erro ao carregar monitores</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Box>
            <Button size="sm" colorScheme="red" variant="outline" onClick={loadMonitors} ml={4}>
              Tentar Novamente
            </Button>
          </Alert>
        )}

        {!error && !loading && monitors.length === 0 ? (
          <Alert status="info" borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle>Nenhum monitor encontrado</AlertTitle>
              <AlertDescription>Ainda não há monitores cadastrados no sistema.</AlertDescription>
            </Box>
          </Alert>
        ) : (
          <Card>
            <CardBody>
              <Table variant="simple" size="sm">
                <Thead><Tr><Th>Nome</Th><Th>Site</Th><Th>Usuário</Th><Th>Status</Th></Tr></Thead>
                <Tbody>
                  {monitors.map(m => (
                    <Tr key={m.id}>
                      <Td>{m.name}</Td>
                      <Td>{m.site}</Td>
                      <Td>{m.user?.email}</Td>
                      <Td><Badge colorScheme={m.active ? 'green' : 'gray'}>{m.active ? 'Ativo' : 'Inativo'}</Badge></Td>
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
