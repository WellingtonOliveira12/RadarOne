import { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Heading,
  Text,
  Button,
  VStack,
  HStack,
  Badge,
  Card,
  CardBody,
  Stat,
  StatLabel,
  StatNumber,
  StatGroup,
  useColorModeValue,
  Icon,
  Spinner,
} from '@chakra-ui/react';
import { CheckCircleIcon, WarningIcon } from '@chakra-ui/icons';
import { api } from '../services/api';
import { APP_VERSION } from '../constants/app';

interface HealthResponse {
  status: string;
  service: string;
  version: string;
  timestamp: string;
  uptime: number;
  env: string;
}

export function HealthCheckPage() {
  const [backendStatus, setBackendStatus] = useState<'online' | 'offline' | 'loading'>('loading');
  const [healthData, setHealthData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState('');
  const [localTime, setLocalTime] = useState(new Date().toLocaleString('pt-BR'));

  const bgColor = useColorModeValue('gray.50', 'gray.900');
  const cardBg = useColorModeValue('white', 'gray.800');

  const checkHealth = async () => {
    try {
      setBackendStatus('loading');
      setError('');
      const data = await api.get<HealthResponse>('/health');
      setHealthData(data);
      setBackendStatus('online');
    } catch (err: any) {
      setError(err.message || 'Erro ao conectar com o backend');
      setBackendStatus('offline');
      setHealthData(null);
    }
  };

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  useEffect(() => {
    void checkHealth();
    const interval = setInterval(() => {
      setLocalTime(new Date().toLocaleString('pt-BR'));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Box minH="100vh" bg={bgColor} py={8}>
      <Container maxW="container.lg">
        <VStack spacing={6} align="stretch">
          {/* Header */}
          <Box textAlign="center">
            <Heading size="xl" mb={2}>
              Status do RadarOne
            </Heading>
            <Text color="gray.600">Monitoramento em tempo real do sistema</Text>
          </Box>

          {/* Status Cards */}
          <StatGroup>
            {/* Backend Status */}
            <Card flex="1" bg={cardBg}>
              <CardBody>
                <Stat>
                  <StatLabel>Backend</StatLabel>
                  <HStack mt={2}>
                    {backendStatus === 'loading' && <Spinner size="sm" />}
                    {backendStatus === 'online' && (
                      <>
                        <Icon as={CheckCircleIcon} color="green.500" boxSize={6} />
                        <Badge colorScheme="green" fontSize="md">
                          Online
                        </Badge>
                      </>
                    )}
                    {backendStatus === 'offline' && (
                      <>
                        <Icon as={WarningIcon} color="red.500" boxSize={6} />
                        <Badge colorScheme="red" fontSize="md">
                          Offline
                        </Badge>
                      </>
                    )}
                  </HStack>
                </Stat>
              </CardBody>
            </Card>

            {/* Frontend Version */}
            <Card flex="1" bg={cardBg}>
              <CardBody>
                <Stat>
                  <StatLabel>Frontend</StatLabel>
                  <StatNumber fontSize="2xl" mt={2}>
                    v{APP_VERSION}
                  </StatNumber>
                </Stat>
              </CardBody>
            </Card>

            {/* Local Time */}
            <Card flex="1" bg={cardBg}>
              <CardBody>
                <Stat>
                  <StatLabel>Horário Local</StatLabel>
                  <StatNumber fontSize="lg" mt={2}>
                    {localTime}
                  </StatNumber>
                </Stat>
              </CardBody>
            </Card>
          </StatGroup>

          {/* Backend Details */}
          {healthData && (
            <Card bg={cardBg}>
              <CardBody>
                <Heading size="md" mb={4}>
                  Detalhes do Backend
                </Heading>
                <VStack align="stretch" spacing={3}>
                  <HStack justify="space-between">
                    <Text fontWeight="semibold">Serviço:</Text>
                    <Text>{healthData.service}</Text>
                  </HStack>
                  <HStack justify="space-between">
                    <Text fontWeight="semibold">Versão:</Text>
                    <Text>{healthData.version}</Text>
                  </HStack>
                  <HStack justify="space-between">
                    <Text fontWeight="semibold">Ambiente:</Text>
                    <Badge colorScheme={healthData.env === 'production' ? 'green' : 'yellow'}>
                      {healthData.env}
                    </Badge>
                  </HStack>
                  <HStack justify="space-between">
                    <Text fontWeight="semibold">Uptime:</Text>
                    <Text>{formatUptime(healthData.uptime)}</Text>
                  </HStack>
                  <HStack justify="space-between">
                    <Text fontWeight="semibold">Timestamp:</Text>
                    <Text fontSize="sm" color="gray.600">
                      {new Date(healthData.timestamp).toLocaleString('pt-BR')}
                    </Text>
                  </HStack>
                </VStack>
              </CardBody>
            </Card>
          )}

          {/* Error Message */}
          {error && (
            <Card bg="red.50" borderColor="red.200" borderWidth={1}>
              <CardBody>
                <HStack>
                  <Icon as={WarningIcon} color="red.500" />
                  <Text color="red.700" fontWeight="semibold">
                    {error}
                  </Text>
                </HStack>
              </CardBody>
            </Card>
          )}

          {/* Actions */}
          <HStack justify="center">
            <Button
              colorScheme="blue"
              onClick={checkHealth}
              isLoading={backendStatus === 'loading'}
              loadingText="Recarregando..."
              size="lg"
            >
              Recarregar
            </Button>
          </HStack>
        </VStack>
      </Container>
    </Box>
  );
}
