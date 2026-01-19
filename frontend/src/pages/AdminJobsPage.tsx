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
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Tooltip,
  Code,
  Collapse,
  useDisclosure,
} from '@chakra-ui/react';
import { AdminLayout } from '../components/AdminLayout';
import { api } from '../services/api';
import { getToken } from '../lib/auth';

/**
 * AdminJobsPage - Dashboard de monitoramento de execuções de jobs
 * ATUALIZADO: Usa a nova tabela JobRun com histórico real de execuções
 */

interface JobRun {
  id: string;
  jobName: string;
  displayName: string;
  status: 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'TIMEOUT';
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  processedCount: number;
  successCount: number;
  errorCount: number;
  summary: string | null;
  errorMessage: string | null;
  triggeredBy: string | null;
  metadata: Record<string, any> | null;
}

interface JobStats {
  last7Days: {
    success: number;
    partial: number;
    failed: number;
    running: number;
  };
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface JobsResponse {
  data: JobRun[];
  stats: JobStats;
  pagination: PaginationInfo;
}

// Lista de jobs conhecidos para o filtro
const JOB_NAMES = [
  { value: 'checkTrialExpiring', label: 'Verificar Trials Expirando' },
  { value: 'checkSubscriptionExpired', label: 'Verificar Assinaturas Expiradas' },
  { value: 'resetMonthlyQueries', label: 'Reset Mensal de Queries' },
  { value: 'checkCouponAlerts', label: 'Verificar Alertas de Cupons' },
  { value: 'checkTrialUpgradeExpiring', label: 'Verificar Trial Upgrades' },
  { value: 'checkAbandonedCoupons', label: 'Verificar Cupons Abandonados' },
  { value: 'checkSessionExpiring', label: 'Verificar Sessões Expirando' },
];

const STATUS_OPTIONS = [
  { value: 'SUCCESS', label: 'Sucesso', color: 'green' },
  { value: 'PARTIAL', label: 'Parcial', color: 'orange' },
  { value: 'FAILED', label: 'Falhou', color: 'red' },
  { value: 'RUNNING', label: 'Executando', color: 'blue' },
  { value: 'TIMEOUT', label: 'Timeout', color: 'purple' },
];

export const AdminJobsPage: React.FC = () => {
  const [jobs, setJobs] = useState<JobRun[]>([]);
  const [stats, setStats] = useState<JobStats | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filtros
  const [selectedJobName, setSelectedJobName] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  useEffect(() => {
    loadJobs();
  }, [pagination.page, selectedJobName, selectedStatus]);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const token = getToken();

      const queryParams = new URLSearchParams({
        page: pagination.page.toString(),
        pageSize: pagination.pageSize.toString(),
      });

      if (selectedJobName) {
        queryParams.append('jobName', selectedJobName);
      }

      if (selectedStatus) {
        queryParams.append('status', selectedStatus);
      }

      const response = await api.get<JobsResponse>(
        `/api/admin/jobs?${queryParams.toString()}`,
        token
      );

      setJobs(response.data);
      setStats(response.stats);
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

  const formatDuration = (ms: number | null) => {
    if (ms === null) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = STATUS_OPTIONS.find((s) => s.value === status) || {
      label: status,
      color: 'gray',
    };
    return (
      <Badge colorScheme={statusConfig.color} fontSize="xs" px={2} py={1} borderRadius="md">
        {statusConfig.label}
      </Badge>
    );
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

  const handleJobNameFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedJobName(e.target.value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleStatusFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedStatus(e.target.value);
    setPagination((prev) => ({ ...prev, page: 1 }));
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

        {/* Stats Cards */}
        {stats && (
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
            <Card>
              <CardBody>
                <Stat>
                  <StatLabel fontSize="sm" color="gray.600">
                    Sucesso (7 dias)
                  </StatLabel>
                  <StatNumber color="green.600">{stats.last7Days.success}</StatNumber>
                  <StatHelpText>Jobs bem-sucedidos</StatHelpText>
                </Stat>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <Stat>
                  <StatLabel fontSize="sm" color="gray.600">
                    Parcial (7 dias)
                  </StatLabel>
                  <StatNumber color="orange.600">{stats.last7Days.partial}</StatNumber>
                  <StatHelpText>Jobs com alguns erros</StatHelpText>
                </Stat>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <Stat>
                  <StatLabel fontSize="sm" color="gray.600">
                    Falhou (7 dias)
                  </StatLabel>
                  <StatNumber color="red.600">{stats.last7Days.failed}</StatNumber>
                  <StatHelpText>Jobs que falharam</StatHelpText>
                </Stat>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <Stat>
                  <StatLabel fontSize="sm" color="gray.600">
                    Em execucao
                  </StatLabel>
                  <StatNumber color="blue.600">{stats.last7Days.running}</StatNumber>
                  <StatHelpText>Jobs executando agora</StatHelpText>
                </Stat>
              </CardBody>
            </Card>
          </SimpleGrid>
        )}

        {/* Filters */}
        <Card>
          <CardBody>
            <HStack spacing={4} flexWrap="wrap">
              <Box>
                <Text fontSize="sm" fontWeight="semibold" mb={2}>
                  Job:
                </Text>
                <Select
                  value={selectedJobName}
                  onChange={handleJobNameFilterChange}
                  size="sm"
                  minW="250px"
                >
                  <option value="">Todos os Jobs</option>
                  {JOB_NAMES.map((job) => (
                    <option key={job.value} value={job.value}>
                      {job.label}
                    </option>
                  ))}
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
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </Select>
              </Box>

              <Box alignSelf="flex-end">
                <Button
                  onClick={() => loadJobs()}
                  size="sm"
                  colorScheme="blue"
                  variant="outline"
                >
                  Atualizar
                </Button>
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
                      <Th>Job</Th>
                      <Th>Status</Th>
                      <Th>Inicio</Th>
                      <Th>Duracao</Th>
                      <Th>Processados</Th>
                      <Th>Sucesso/Erro</Th>
                      <Th>Resumo</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {jobs.length === 0 ? (
                      <Tr>
                        <Td colSpan={7} textAlign="center" py={8} color="gray.500">
                          Nenhuma execucao de job encontrada. Os jobs serao registrados automaticamente a partir de agora.
                        </Td>
                      </Tr>
                    ) : (
                      jobs.map((job) => (
                        <JobRow key={job.id} job={job} formatDate={formatDate} formatDuration={formatDuration} getStatusBadge={getStatusBadge} />
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
                      Anterior
                    </Button>

                    <Text fontSize="sm" color="gray.600">
                      Pagina {pagination.page} de {pagination.totalPages} (Total:{' '}
                      {pagination.total})
                    </Text>

                    <Button
                      onClick={handleNextPage}
                      isDisabled={pagination.page === pagination.totalPages}
                      size="sm"
                      colorScheme="blue"
                      variant="outline"
                    >
                      Proximo
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

// Componente separado para linha da tabela com detalhes expandíveis
interface JobRowProps {
  job: JobRun;
  formatDate: (date: string) => string;
  formatDuration: (ms: number | null) => string;
  getStatusBadge: (status: string) => React.ReactElement;
}

const JobRow: React.FC<JobRowProps> = ({ job, formatDate, formatDuration, getStatusBadge }) => {
  const { isOpen, onToggle } = useDisclosure();

  return (
    <>
      <Tr
        _hover={{ bg: 'gray.50', cursor: 'pointer' }}
        onClick={onToggle}
      >
        <Td>
          <VStack align="start" spacing={0}>
            <Text fontWeight="medium">{job.displayName}</Text>
            <Text fontSize="xs" color="gray.500">
              {job.triggeredBy === 'SCHEDULER' ? 'Automatico' : job.triggeredBy === 'MANUAL' ? 'Manual' : job.triggeredBy || '-'}
            </Text>
          </VStack>
        </Td>
        <Td>{getStatusBadge(job.status)}</Td>
        <Td fontSize="sm">{formatDate(job.startedAt)}</Td>
        <Td fontSize="sm">{formatDuration(job.durationMs)}</Td>
        <Td>{job.processedCount}</Td>
        <Td>
          <HStack spacing={1}>
            <Badge colorScheme="green" fontSize="xs">{job.successCount}</Badge>
            <Text>/</Text>
            <Badge colorScheme="red" fontSize="xs">{job.errorCount}</Badge>
          </HStack>
        </Td>
        <Td>
          <Tooltip label={job.summary || '-'} placement="top" hasArrow>
            <Text fontSize="xs" noOfLines={1} maxW="200px">
              {job.summary || '-'}
            </Text>
          </Tooltip>
        </Td>
      </Tr>
      <Tr>
        <Td colSpan={7} p={0}>
          <Collapse in={isOpen} animateOpacity>
            <Box p={4} bg="gray.50" borderTopWidth="1px">
              <VStack align="stretch" spacing={2}>
                {job.errorMessage && (
                  <Box>
                    <Text fontSize="sm" fontWeight="bold" color="red.600">
                      Erro:
                    </Text>
                    <Code colorScheme="red" p={2} display="block" whiteSpace="pre-wrap" fontSize="xs">
                      {job.errorMessage}
                    </Code>
                  </Box>
                )}
                {job.summary && (
                  <Box>
                    <Text fontSize="sm" fontWeight="bold">
                      Resumo completo:
                    </Text>
                    <Text fontSize="sm" color="gray.700">
                      {job.summary}
                    </Text>
                  </Box>
                )}
                {job.metadata && Object.keys(job.metadata).length > 0 && (
                  <Box>
                    <Text fontSize="sm" fontWeight="bold">
                      Detalhes:
                    </Text>
                    <Code p={2} display="block" whiteSpace="pre" fontSize="xs" bg="white">
                      {JSON.stringify(job.metadata, null, 2)}
                    </Code>
                  </Box>
                )}
              </VStack>
            </Box>
          </Collapse>
        </Td>
      </Tr>
    </>
  );
};
