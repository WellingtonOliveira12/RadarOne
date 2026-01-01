import React, { useState, useEffect } from 'react';
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
  VStack,
  HStack,
  Select,
  Button,
  Text,
} from '@chakra-ui/react';
import { AdminLayout } from '../components/AdminLayout';
import { api } from '../services/api';
import { getToken } from '../lib/auth';

/**
 * AdminJobsPage - Dashboard de monitoramento de execuções de jobs
 * Acessível apenas para usuários com role ADMIN
 * Migrado para usar AdminLayout consistente
 */

interface JobRun {
  id: string;
  event: string;
  createdAt: string;
  status: string;
  updatedCount?: number;
  executedAt?: string;
  error?: string | null;
  processed: boolean;
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface JobsResponse {
  data: JobRun[];
  pagination: PaginationInfo;
}

export const AdminJobsPage: React.FC = () => {
  const [jobs, setJobs] = useState<JobRun[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filtros
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  useEffect(() => {
    loadJobs();
  }, [pagination.page, selectedEvent, selectedStatus]);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const token = getToken();

      const queryParams = new URLSearchParams({
        page: pagination.page.toString(),
        pageSize: pagination.pageSize.toString(),
      });

      if (selectedEvent) {
        queryParams.append('event', selectedEvent);
      }

      if (selectedStatus) {
        queryParams.append('status', selectedStatus);
      }

      const response = await api.get<JobsResponse>(
        `/api/admin/jobs?${queryParams.toString()}`,
        token
      );

      setJobs(response.data);
      setPagination(response.pagination);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar execuções de jobs');
      console.error('Erro ao carregar jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  };

  const getEventLabel = (event: string) => {
    const labels: Record<string, string> = {
      MONTHLY_QUERIES_RESET: '🔄 Reset Mensal',
      TRIAL_CHECK: '🎁 Verificação de Trial',
      SUBSCRIPTION_CHECK: '💳 Verificação de Assinatura',
    };
    return labels[event] || event;
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

  const handleEventFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedEvent(e.target.value);
    setPagination((prev) => ({ ...prev, page: 1 })); // Reset para página 1
  };

  const handleStatusFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedStatus(e.target.value);
    setPagination((prev) => ({ ...prev, page: 1 })); // Reset para página 1
  };

  return (
    <AdminLayout>
      <VStack spacing={6} align="stretch">
        {/* Page Title */}
        <Box>
          <Heading size="lg" mb={2}>
            Jobs & Monitoramento
          </Heading>
          <Text color="gray.600">
            Visualize e monitore execuções de jobs automatizados
          </Text>
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
            <HStack spacing={4} flexWrap="wrap">
              <Box>
                <Text fontSize="sm" fontWeight="semibold" mb={2}>
                  Job / Evento:
                </Text>
                <Select
                  value={selectedEvent}
                  onChange={handleEventFilterChange}
                  size="sm"
                  minW="200px"
                >
                  <option value="">Todos</option>
                  <option value="MONTHLY_QUERIES_RESET">Reset Mensal</option>
                  <option value="TRIAL_CHECK">Verificação de Trial</option>
                  <option value="SUBSCRIPTION_CHECK">Verificação de Assinatura</option>
                </Select>
              </Box>

              <Box>
                <Text fontSize="sm" fontWeight="semibold" mb={2}>
                  Status:
                </Text>
                <Select
                  value={selectedStatus}
                  onChange={handleStatusFilterChange}
                  size="sm"
                  minW="150px"
                >
                  <option value="">Todos</option>
                  <option value="SUCCESS">Sucesso</option>
                  <option value="ERROR">Erro</option>
                </Select>
              </Box>
            </HStack>
          </CardBody>
        </Card>

        {/* Jobs Table */}
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
                      <Th>Job / Evento</Th>
                      <Th>Status</Th>
                      <Th>Executado em</Th>
                      <Th>Registros Atualizados</Th>
                      <Th>Erro</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {jobs.length === 0 ? (
                      <Tr>
                        <Td colSpan={5} textAlign="center" py={8} color="gray.500">
                          Nenhuma execução de job encontrada
                        </Td>
                      </Tr>
                    ) : (
                      jobs.map((job) => (
                        <Tr key={job.id}>
                          <Td>{getEventLabel(job.event)}</Td>
                          <Td>
                            <Badge
                              colorScheme={job.status === 'SUCCESS' ? 'green' : 'red'}
                              fontSize="xs"
                              px={2}
                              py={1}
                              borderRadius="md"
                            >
                              {job.status}
                            </Badge>
                          </Td>
                          <Td fontSize="sm">{formatDate(job.createdAt)}</Td>
                          <Td>{job.updatedCount !== undefined ? job.updatedCount : '-'}</Td>
                          <Td>
                            {job.error ? (
                              <Text
                                fontSize="xs"
                                color="red.600"
                                title={job.error}
                                noOfLines={1}
                                maxW="200px"
                              >
                                {job.error}
                              </Text>
                            ) : (
                              '-'
                            )}
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
                      Página {pagination.page} de {pagination.totalPages} (Total:{' '}
                      {pagination.total})
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
    </AdminLayout>
  );
};
