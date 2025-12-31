import React, { useEffect, useState } from 'react';
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
  Select,
  Button,
  useToast,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  Code,
  IconButton,
} from '@chakra-ui/react';
import { ViewIcon } from '@chakra-ui/icons';
import { AdminLayout } from '../components/AdminLayout';
import { api } from '../services/api';

interface WebhookLog {
  id: string;
  event: string;
  processed: boolean;
  error: string | null;
  createdAt: string;
  payload: any;
  payloadSummary?: string;
}

interface WebhooksResponse {
  logs: WebhookLog[];
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

export const AdminWebhooksPage: React.FC = () => {
  const [webhooks, setWebhooks] = useState<WebhookLog[]>([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [filters, setFilters] = useState({
    event: '',
    processed: '',
  });

  const toast = useToast();

  // Modal de visualização
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookLog | null>(null);

  useEffect(() => {
    loadWebhooks();
  }, [pagination.page, filters]);

  const loadWebhooks = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });

      if (filters.event) params.append('event', filters.event);
      if (filters.processed) params.append('processed', filters.processed);

      const response = await api.get<WebhooksResponse>(`/api/admin/webhooks?${params.toString()}`);
      setWebhooks(response.logs);
      setPagination(response.pagination);
    } catch (err: any) {
      console.error('Erro ao carregar webhooks:', err);
      const errorMessage = err.response?.data?.error || 'Erro ao carregar webhooks';
      setError(errorMessage);
      toast({
        title: 'Erro',
        description: errorMessage,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const clearFilters = () => {
    setFilters({ event: '', processed: '' });
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const hasActiveFilters = filters.event || filters.processed;

  const handleViewPayload = (webhook: WebhookLog) => {
    setSelectedWebhook(webhook);
    onOpen();
  };

  return (
    <AdminLayout>
      <VStack spacing={6} align="stretch">
        <HStack justify="space-between" align="center">
          <Heading size="lg" color="gray.800">
            Webhooks
          </Heading>
          <Badge colorScheme="blue" fontSize="md" px={3} py={1}>
            {pagination.total} webhooks
          </Badge>
        </HStack>

        {/* Filtros */}
        <Card>
          <CardBody>
            <VStack spacing={4} align="stretch">
              <Heading size="sm" color="gray.700">
                Filtros
              </Heading>
              <HStack spacing={4} flexWrap="wrap">
                <Box minW="200px">
                  <Text fontSize="sm" mb={1} color="gray.600">
                    Evento
                  </Text>
                  <Select
                    placeholder="Todos"
                    value={filters.event}
                    onChange={(e) => handleFilterChange('event', e.target.value)}
                    size="sm"
                  >
                    <option value="MONTHLY_QUERIES_RESET">Monthly Queries Reset</option>
                    <option value="TRIAL_CHECK">Trial Check</option>
                    <option value="SUBSCRIPTION_CHECK">Subscription Check</option>
                    <option value="payment.approved">Payment Approved</option>
                    <option value="subscription.created">Subscription Created</option>
                  </Select>
                </Box>

                <Box minW="200px">
                  <Text fontSize="sm" mb={1} color="gray.600">
                    Status
                  </Text>
                  <Select
                    placeholder="Todos"
                    value={filters.processed}
                    onChange={(e) => handleFilterChange('processed', e.target.value)}
                    size="sm"
                  >
                    <option value="true">Processado</option>
                    <option value="false">Não processado</option>
                  </Select>
                </Box>

                {hasActiveFilters && (
                  <Box pt={5}>
                    <Button size="sm" variant="ghost" onClick={clearFilters}>
                      Limpar filtros
                    </Button>
                  </Box>
                )}
              </HStack>
            </VStack>
          </CardBody>
        </Card>

        {/* Tabela de Webhooks */}
        <Card>
          <CardBody>
            {loading && (
              <Center py={10}>
                <VStack spacing={4}>
                  <Spinner size="xl" color="blue.500" thickness="4px" />
                  <Text color="gray.600">Carregando webhooks...</Text>
                </VStack>
              </Center>
            )}

            {error && !loading && (
              <Alert status="error" borderRadius="md">
                <AlertIcon />
                <Box>
                  <AlertTitle>Erro</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Box>
              </Alert>
            )}

            {!loading && !error && webhooks.length === 0 && (
              <Alert status="info" borderRadius="md">
                <AlertIcon />
                <AlertTitle>Nenhum webhook encontrado</AlertTitle>
              </Alert>
            )}

            {!loading && !error && webhooks.length > 0 && (
              <Box overflowX="auto">
                <Table variant="simple" size="sm">
                  <Thead>
                    <Tr>
                      <Th>Evento</Th>
                      <Th>Status</Th>
                      <Th>Erro</Th>
                      <Th>Data</Th>
                      <Th>Ações</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {webhooks.map((webhook) => (
                      <Tr key={webhook.id}>
                        <Td>
                          <Text fontSize="sm" fontWeight="medium">
                            {webhook.event}
                          </Text>
                        </Td>
                        <Td>
                          <Badge colorScheme={webhook.processed ? 'green' : 'yellow'}>
                            {webhook.processed ? 'Processado' : 'Pendente'}
                          </Badge>
                        </Td>
                        <Td>
                          {webhook.error ? (
                            <Badge colorScheme="red">Com erro</Badge>
                          ) : (
                            <Badge colorScheme="green">OK</Badge>
                          )}
                        </Td>
                        <Td>
                          <Text fontSize="sm" color="gray.600">
                            {formatDate(webhook.createdAt)}
                          </Text>
                        </Td>
                        <Td>
                          <IconButton
                            aria-label="Ver payload"
                            icon={<ViewIcon />}
                            size="sm"
                            colorScheme="blue"
                            variant="ghost"
                            onClick={() => handleViewPayload(webhook)}
                          />
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            )}
          </CardBody>
        </Card>

        {/* Paginação */}
        {!loading && pagination.totalPages > 1 && (
          <HStack justify="space-between" align="center">
            <Text fontSize="sm" color="gray.600">
              Página {pagination.page} de {pagination.totalPages} • Total: {pagination.total} webhooks
            </Text>
            <HStack>
              <Button
                size="sm"
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                isDisabled={pagination.page === 1}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                isDisabled={pagination.page === pagination.totalPages}
              >
                Próxima
              </Button>
            </HStack>
          </HStack>
        )}
      </VStack>

      {/* Modal de Visualização de Payload */}
      <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent maxH="80vh">
          <ModalHeader>Detalhes do Webhook</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selectedWebhook && (
              <VStack spacing={4} align="stretch">
                <Box>
                  <Text fontWeight="bold" mb={1}>
                    Evento:
                  </Text>
                  <Badge colorScheme="blue">{selectedWebhook.event}</Badge>
                </Box>

                <Box>
                  <Text fontWeight="bold" mb={1}>
                    Status:
                  </Text>
                  <Badge colorScheme={selectedWebhook.processed ? 'green' : 'yellow'}>
                    {selectedWebhook.processed ? 'Processado' : 'Pendente'}
                  </Badge>
                </Box>

                <Box>
                  <Text fontWeight="bold" mb={1}>
                    Data:
                  </Text>
                  <Text fontSize="sm">{formatDate(selectedWebhook.createdAt)}</Text>
                </Box>

                {selectedWebhook.error && (
                  <Box>
                    <Text fontWeight="bold" mb={1} color="red.600">
                      Erro:
                    </Text>
                    <Code
                      display="block"
                      whiteSpace="pre-wrap"
                      p={3}
                      borderRadius="md"
                      colorScheme="red"
                    >
                      {selectedWebhook.error}
                    </Code>
                  </Box>
                )}

                <Box>
                  <Text fontWeight="bold" mb={2}>
                    Payload:
                  </Text>
                  <Code
                    display="block"
                    whiteSpace="pre-wrap"
                    p={3}
                    borderRadius="md"
                    fontSize="xs"
                    maxH="400px"
                    overflowY="auto"
                  >
                    {JSON.stringify(selectedWebhook.payload, null, 2)}
                  </Code>
                </Box>
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button onClick={onClose}>Fechar</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </AdminLayout>
  );
};
