import React, { useState, useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Container,
  Heading,
  Text,
  Button,
  SimpleGrid,
  VStack,
  Badge,
  Progress,
  Alert,
  AlertIcon,
  AlertDescription,
  Link,
  Spinner,
  Flex,
} from '@chakra-ui/react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { AppLayout } from '../components/AppLayout';

/**
 * Dashboard - Página principal após login
 * Refatorada com Chakra UI para consistência visual
 */

interface Subscription {
  id: string;
  status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED' | 'SUSPENDED';
  isTrial: boolean;
  trialEndsAt: string | null;
  validUntil: string | null;
  plan: {
    name: string;
    slug: string;
    maxMonitors: number;
    maxSites: number;
    maxAlertsPerDay: number;
  };
}

interface UserStats {
  monitorsCount: number;
  sitesCount: number;
}

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [stats, setStats] = useState<UserStats>({ monitorsCount: 0, sitesCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const subData = await api.request('/api/subscriptions/my', {
        method: 'GET',
        skipAutoLogout: true,
      });

      setSubscription({
        id: subData.subscription.id,
        status: subData.subscription.status,
        isTrial: subData.subscription.isTrial,
        trialEndsAt: subData.subscription.trialEndsAt,
        validUntil: subData.subscription.validUntil,
        plan: subData.subscription.plan
      });

      setStats({
        monitorsCount: subData.usage.monitorsCreated,
        sitesCount: 0
      });
    } catch (err: any) {
      const isDev = import.meta.env.DEV;
      if (isDev) {
        console.error('Dashboard: Erro ao carregar dados', {
          endpoint: '/api/subscriptions/my',
          status: err.status,
          errorCode: err.errorCode,
          message: err.message,
          data: err.data
        });
        setError(`Erro ao carregar dados (${err.status || 'Network'} - ${err.errorCode || 'UNKNOWN'}). Ver console.`);
      } else {
        setError('Erro ao carregar dados. Tente novamente mais tarde.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getDaysUntilExpiry = () => {
    if (!subscription?.validUntil) return 0;
    const now = new Date();
    const expiry = new Date(subscription.validUntil);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getStatusBadge = () => {
    if (!subscription) return null;

    const statusConfig: Record<string, { colorScheme: string; label: string }> = {
      TRIAL: { colorScheme: 'blue', label: '🎁 Período de teste' },
      ACTIVE: { colorScheme: 'green', label: '✅ Ativo' },
      PAST_DUE: { colorScheme: 'orange', label: '⚠️ Pagamento pendente' },
      CANCELLED: { colorScheme: 'gray', label: '❌ Cancelado' },
      EXPIRED: { colorScheme: 'red', label: '❌ Expirado' },
      SUSPENDED: { colorScheme: 'red', label: '🚫 Suspenso' },
    };

    const config = statusConfig[subscription.status] || statusConfig.ACTIVE;

    return (
      <Badge colorScheme={config.colorScheme} fontSize="sm" px={3} py={1} borderRadius="md">
        {config.label}
      </Badge>
    );
  };

  if (loading) {
    return (
      <AppLayout>
        <Container maxW="container.xl" centerContent py={20}>
          <Spinner size="xl" color="blue.500" thickness="4px" />
          <Text mt={4} color="gray.600">Carregando...</Text>
        </Container>
      </AppLayout>
    );
  }

  const daysLeft = getDaysUntilExpiry();
  const showExpiryWarning = daysLeft <= 5 && daysLeft > 0;

  return (
    <AppLayout>
      <Container maxW="container.xl" py={{ base: 6, md: 10 }}>
        {/* Welcome Section */}
        <VStack align="stretch" spacing={6}>
          <Box>
            <Heading as="h1" size={{ base: 'lg', md: 'xl' }} color="gray.800" mb={2}>
              Olá, {user?.name || 'Usuário'}! 👋
            </Heading>
            <Text fontSize={{ base: 'sm', md: 'md' }} color="gray.600">
              Bem-vindo ao seu painel de controle do RadarOne
            </Text>
          </Box>

          {/* Error Alert */}
          {error && (
            <Alert status="error" borderRadius="lg">
              <AlertIcon />
              <AlertDescription flex={1}>{error}</AlertDescription>
              <Button size="sm" onClick={() => { setError(''); loadDashboardData(); }}>
                Tentar novamente
              </Button>
            </Alert>
          )}

          {/* Subscription Card */}
          {subscription && (
            <Box
              bg="white"
              p={{ base: 6, md: 8 }}
              borderRadius="xl"
              boxShadow="md"
            >
              <Flex justify="space-between" align="flex-start" mb={6} flexWrap="wrap" gap={3}>
                <Box>
                  <Text fontSize="sm" color="gray.600" mb={1}>
                    Seu Plano
                  </Text>
                  <Heading as="h2" size="lg" color="gray.800">
                    {subscription.plan.name}
                  </Heading>
                </Box>
                {getStatusBadge()}
              </Flex>

              {/* Trial Info */}
              {subscription.isTrial && (
                <Alert status="info" borderRadius="md" mb={4}>
                  <AlertIcon />
                  <AlertDescription>
                    ⏰ Seu período de teste termina em <strong>{daysLeft} dias</strong>
                  </AlertDescription>
                </Alert>
              )}

              {/* Expiry Warning */}
              {showExpiryWarning && (
                <Alert status="warning" borderRadius="md" mb={4}>
                  <AlertIcon />
                  <AlertDescription flex={1}>
                    ⚠️ Seu plano está para expirar! Clique aqui para renovar ou fazer upgrade.
                  </AlertDescription>
                  <Button
                    as={RouterLink}
                    to="/settings/subscription"
                    size="sm"
                    colorScheme="orange"
                    ml={2}
                  >
                    Gerenciar assinatura
                  </Button>
                </Alert>
              )}

              {/* Limits Grid */}
              <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6}>
                {/* Monitores */}
                <Box textAlign="center">
                  <Text fontSize="3xl" fontWeight="bold" color="gray.800" mb={1}>
                    {subscription.plan.maxMonitors === 999
                      ? `${stats.monitorsCount} (Ilimitado)`
                      : `${stats.monitorsCount} / ${subscription.plan.maxMonitors}`}
                  </Text>
                  <Text fontSize="sm" color="gray.600" mb={2}>
                    Monitores
                  </Text>
                  {subscription.plan.maxMonitors !== 999 && (
                    <Progress
                      value={(stats.monitorsCount / subscription.plan.maxMonitors) * 100}
                      colorScheme="blue"
                      size="sm"
                      borderRadius="full"
                    />
                  )}
                </Box>

                {/* Sites */}
                <Box textAlign="center">
                  <Text fontSize="3xl" fontWeight="bold" color="gray.800" mb={1}>
                    {subscription.plan.maxSites === 999
                      ? `${stats.sitesCount} (Ilimitado)`
                      : `${stats.sitesCount} / ${subscription.plan.maxSites}`}
                  </Text>
                  <Text fontSize="sm" color="gray.600" mb={2}>
                    Sites diferentes
                  </Text>
                  {subscription.plan.maxSites !== 999 && (
                    <Progress
                      value={(stats.sitesCount / subscription.plan.maxSites) * 100}
                      colorScheme="blue"
                      size="sm"
                      borderRadius="full"
                    />
                  )}
                </Box>

                {/* Alertas */}
                <Box textAlign="center">
                  <Text fontSize="3xl" fontWeight="bold" color="gray.800" mb={1}>
                    {subscription.plan.maxAlertsPerDay === 999 ? 'Ilimitado' : subscription.plan.maxAlertsPerDay}
                  </Text>
                  <Text fontSize="sm" color="gray.600">
                    Alertas/dia
                  </Text>
                </Box>
              </SimpleGrid>
            </Box>
          )}

          {/* Actions Grid */}
          <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={6}>
            {/* Monitor Action */}
            <Link as={RouterLink} to="/monitors" _hover={{ textDecoration: 'none' }}>
              <Box
                bg="white"
                p={6}
                borderRadius="xl"
                boxShadow="md"
                textAlign="center"
                _hover={{ boxShadow: 'lg', transform: 'translateY(-2px)' }}
                transition="all 0.2s"
                h="full"
              >
                <Text fontSize="4xl" mb={3}>🔍</Text>
                <Heading as="h3" size="sm" mb={2} color="gray.800">
                  Gerenciar Monitores
                </Heading>
                <Text fontSize="sm" color="gray.600">
                  Criar, editar ou excluir seus monitores de anúncios
                </Text>
              </Box>
            </Link>

            {/* Notifications Action */}
            <Link as={RouterLink} to="/settings/notifications" _hover={{ textDecoration: 'none' }}>
              <Box
                bg="white"
                p={6}
                borderRadius="xl"
                boxShadow="md"
                textAlign="center"
                _hover={{ boxShadow: 'lg', transform: 'translateY(-2px)' }}
                transition="all 0.2s"
                h="full"
              >
                <Text fontSize="4xl" mb={3}>🔔</Text>
                <Heading as="h3" size="sm" mb={2} color="gray.800">
                  Configurar Notificações
                </Heading>
                <Text fontSize="sm" color="gray.600">
                  Escolha entre Telegram ou e-mail para receber alertas
                </Text>
              </Box>
            </Link>

            {/* Subscription Action */}
            <Link as={RouterLink} to="/settings/subscription" _hover={{ textDecoration: 'none' }}>
              <Box
                bg="white"
                p={6}
                borderRadius="xl"
                boxShadow="md"
                textAlign="center"
                _hover={{ boxShadow: 'lg', transform: 'translateY(-2px)' }}
                transition="all 0.2s"
                h="full"
              >
                <Text fontSize="4xl" mb={3}>💳</Text>
                <Heading as="h3" size="sm" mb={2} color="gray.800">
                  Gerenciar Assinatura
                </Heading>
                <Text fontSize="sm" color="gray.600">
                  Ver plano atual, fazer upgrade ou cancelar
                </Text>
              </Box>
            </Link>

            {/* Help Action */}
            <Link as={RouterLink} to="/manual" _hover={{ textDecoration: 'none' }}>
              <Box
                bg="white"
                p={6}
                borderRadius="xl"
                boxShadow="md"
                textAlign="center"
                _hover={{ boxShadow: 'lg', transform: 'translateY(-2px)' }}
                transition="all 0.2s"
                h="full"
              >
                <Text fontSize="4xl" mb={3}>📖</Text>
                <Heading as="h3" size="sm" mb={2} color="gray.800">
                  Ajuda e Suporte
                </Heading>
                <Text fontSize="sm" color="gray.600">
                  Manual, FAQ e contato para tirar suas dúvidas
                </Text>
              </Box>
            </Link>
          </SimpleGrid>

          {/* Usage Warning */}
          {subscription &&
            subscription.plan.maxMonitors !== 999 &&
            stats.monitorsCount >= subscription.plan.maxMonitors * 0.8 && (
              <Alert status="warning" borderRadius="lg">
                <AlertIcon />
                <AlertDescription flex={1}>
                  📊 Você está usando{' '}
                  {Math.round((stats.monitorsCount / subscription.plan.maxMonitors) * 100)}
                  % dos seus monitores. Considere fazer upgrade para adicionar mais.
                </AlertDescription>
                <Button
                  as={RouterLink}
                  to="/plans"
                  size="sm"
                  colorScheme="yellow"
                  ml={2}
                >
                  Ver planos
                </Button>
              </Alert>
            )}
        </VStack>
      </Container>
    </AppLayout>
  );
};
