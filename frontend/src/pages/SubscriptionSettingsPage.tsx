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
  HStack,
  Badge,
  Alert,
  AlertIcon,
  AlertDescription,
  List,
  ListItem,
  ListIcon,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  Spinner,
  useToast,
  Flex,
} from '@chakra-ui/react';
import { ChevronRightIcon, CheckCircleIcon } from '@chakra-ui/icons';
import { useAuth } from '../context/AuthContext';
import { AppLayout } from '../components/AppLayout';
import { getToken } from '../lib/auth';

/**
 * Gerenciamento de Assinatura
 * Refatorada com Chakra UI para consistência visual
 */

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  maxMonitors: number;
  maxSites: number;
  maxAlertsPerDay: number;
  checkInterval: number;
  isRecommended: boolean;
}

interface Subscription {
  id: string;
  status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED' | 'SUSPENDED';
  isTrial: boolean;
  trialEndsAt: string | null;
  validUntil: string | null;
  plan: Plan;
}

export const SubscriptionSettingsPage: React.FC = () => {
  useAuth();
  const toast = useToast();

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [allPlans, setAllPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const token = getToken();
      const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

      const subResponse = await fetch(`${API_URL}/api/subscriptions/my`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (subResponse.ok) {
        const subData = await subResponse.json();
        setSubscription({
          id: subData.subscription.id,
          status: subData.subscription.status,
          isTrial: subData.subscription.isTrial,
          trialEndsAt: subData.subscription.trialEndsAt,
          validUntil: subData.subscription.validUntil,
          plan: subData.subscription.plan
        });
      }

      const plansResponse = await fetch(`${API_URL}/api/plans`);
      if (plansResponse.ok) {
        const plansData = await plansResponse.json();
        setAllPlans(plansData);
      }
    } catch (err: any) {
      setError('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePlan = async (planSlug: string) => {
    try {
      const token = getToken();
      const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${API_URL}/api/subscriptions/change-plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ planSlug })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao alterar plano');
      }

      toast({
        title: 'Plano alterado com sucesso!',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      loadData();
    } catch (err: any) {
      toast({
        title: 'Erro ao alterar plano',
        description: err.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
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
        <VStack align="stretch" spacing={6}>
          {/* Breadcrumb */}
          <Breadcrumb spacing={2} separator={<ChevronRightIcon color="gray.400" />} fontSize="sm">
            <BreadcrumbItem>
              <BreadcrumbLink as={RouterLink} to="/dashboard" color="blue.600">
                Dashboard
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbItem isCurrentPage>
              <BreadcrumbLink color="gray.600">Gerenciar Assinatura</BreadcrumbLink>
            </BreadcrumbItem>
          </Breadcrumb>

          {/* Header */}
          <Box>
            <Heading as="h1" size={{ base: 'lg', md: 'xl' }} color="gray.800" mb={2}>
              Gerenciar Assinatura
            </Heading>
            <Text fontSize={{ base: 'sm', md: 'md' }} color="gray.600">
              Veja seu plano atual e faça upgrade ou downgrade quando quiser
            </Text>
          </Box>

          {/* Error Alert */}
          {error && (
            <Alert status="error" borderRadius="lg">
              <AlertIcon />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Current Subscription */}
          {subscription && (
            <Box bg="white" p={{ base: 6, md: 8 }} borderRadius="xl" boxShadow="lg">
              <Flex justify="space-between" align="flex-start" mb={6} flexWrap="wrap" gap={3}>
                <Box>
                  <Text fontSize="sm" color="gray.600" mb={1}>
                    Plano atual
                  </Text>
                  <Heading as="h2" size="lg" color="gray.800">
                    {subscription.plan.name}
                  </Heading>
                </Box>
                {getStatusBadge()}
              </Flex>

              {/* Trial Warning */}
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
                  <AlertDescription>
                    ⚠️ Seu plano está para expirar! Escolha um plano abaixo para continuar.
                  </AlertDescription>
                </Alert>
              )}

              {/* Plan Details */}
              <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                <Box bg="gray.50" p={4} borderRadius="md">
                  <Text fontSize="sm" color="gray.600" mb={1}>Preço</Text>
                  <Text fontSize="lg" fontWeight="bold" color="gray.800">
                    {subscription.plan.priceCents === 0
                      ? 'Grátis'
                      : `R$ ${(subscription.plan.priceCents / 100).toFixed(2)}/mês`}
                  </Text>
                </Box>

                <Box bg="gray.50" p={4} borderRadius="md">
                  <Text fontSize="sm" color="gray.600" mb={1}>Monitores</Text>
                  <Text fontSize="lg" fontWeight="bold" color="gray.800">
                    {subscription.plan.maxMonitors === 999 ? 'Ilimitado' : subscription.plan.maxMonitors}
                  </Text>
                </Box>

                <Box bg="gray.50" p={4} borderRadius="md">
                  <Text fontSize="sm" color="gray.600" mb={1}>Sites diferentes</Text>
                  <Text fontSize="lg" fontWeight="bold" color="gray.800">
                    {subscription.plan.maxSites === 999 ? 'Ilimitado' : subscription.plan.maxSites}
                  </Text>
                </Box>

                <Box bg="gray.50" p={4} borderRadius="md">
                  <Text fontSize="sm" color="gray.600" mb={1}>Alertas por dia</Text>
                  <Text fontSize="lg" fontWeight="bold" color="gray.800">
                    {subscription.plan.maxAlertsPerDay === 999 ? 'Ilimitado' : subscription.plan.maxAlertsPerDay}
                  </Text>
                </Box>

                <Box bg="gray.50" p={4} borderRadius="md">
                  <Text fontSize="sm" color="gray.600" mb={1}>Intervalo de verificação</Text>
                  <Text fontSize="lg" fontWeight="bold" color="gray.800">
                    {subscription.plan.checkInterval} minutos
                  </Text>
                </Box>
              </SimpleGrid>
            </Box>
          )}

          {/* All Plans */}
          <Box>
            <Heading as="h2" size="md" color="gray.800" mb={2}>
              Todos os planos disponíveis
            </Heading>
            <Text fontSize="sm" color="gray.600" mb={6}>
              Faça upgrade para ter mais monitores e recursos
            </Text>

            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={6}>
              {allPlans.map((plan) => {
                const isCurrentPlan = subscription?.plan.slug === plan.slug;

                return (
                  <Box
                    key={plan.id}
                    bg="white"
                    p={6}
                    borderRadius="xl"
                    boxShadow={plan.isRecommended ? 'xl' : 'md'}
                    border="2px"
                    borderColor={
                      isCurrentPlan ? 'green.400' :
                      plan.isRecommended ? 'blue.400' :
                      'transparent'
                    }
                    position="relative"
                    transition="all 0.2s"
                    _hover={{ transform: 'translateY(-4px)', boxShadow: 'xl' }}
                  >
                    {plan.isRecommended && (
                      <Badge
                        position="absolute"
                        top={-3}
                        left="50%"
                        transform="translateX(-50%)"
                        colorScheme="blue"
                        fontSize="xs"
                        px={3}
                        py={1}
                        borderRadius="full"
                      >
                        ⭐ Recomendado
                      </Badge>
                    )}

                    {isCurrentPlan && (
                      <Badge
                        position="absolute"
                        top={-3}
                        right={4}
                        colorScheme="green"
                        fontSize="xs"
                        px={3}
                        py={1}
                        borderRadius="full"
                      >
                        ✓ Plano atual
                      </Badge>
                    )}

                    <VStack align="stretch" spacing={4}>
                      <Box>
                        <Heading as="h3" size="md" color="gray.800" mb={1}>
                          {plan.name}
                        </Heading>
                        <Text fontSize="sm" color="gray.600">
                          {plan.description}
                        </Text>
                      </Box>

                      <HStack align="baseline">
                        {plan.priceCents === 0 ? (
                          <Text fontSize="3xl" fontWeight="bold" color="gray.800">
                            Grátis
                          </Text>
                        ) : (
                          <>
                            <Text fontSize="lg" color="gray.600">R$</Text>
                            <Text fontSize="3xl" fontWeight="bold" color="gray.800">
                              {(plan.priceCents / 100).toFixed(0)}
                            </Text>
                            <Text fontSize="sm" color="gray.600">/mês</Text>
                          </>
                        )}
                      </HStack>

                      <List spacing={3}>
                        <ListItem display="flex" alignItems="center">
                          <ListIcon as={CheckCircleIcon} color="green.500" />
                          <Text fontSize="sm">
                            {plan.maxMonitors === 999 ? 'Monitores ilimitados' : `${plan.maxMonitors} ${plan.maxMonitors === 1 ? 'monitor' : 'monitores'}`}
                          </Text>
                        </ListItem>

                        <ListItem display="flex" alignItems="center">
                          <ListIcon as={CheckCircleIcon} color="green.500" />
                          <Text fontSize="sm">
                            {plan.maxSites === 999 ? 'Sites ilimitados' : `${plan.maxSites} ${plan.maxSites === 1 ? 'site' : 'sites'}`}
                          </Text>
                        </ListItem>

                        <ListItem display="flex" alignItems="center">
                          <ListIcon as={CheckCircleIcon} color="green.500" />
                          <Text fontSize="sm">
                            {plan.maxAlertsPerDay === 999 ? 'Alertas ilimitados' : `Até ${plan.maxAlertsPerDay} alertas/dia`}
                          </Text>
                        </ListItem>

                        <ListItem display="flex" alignItems="center">
                          <ListIcon as={CheckCircleIcon} color="green.500" />
                          <Text fontSize="sm">
                            Verificação a cada {plan.checkInterval}min
                          </Text>
                        </ListItem>
                      </List>

                      <Button
                        onClick={() => handleChangePlan(plan.slug)}
                        isDisabled={isCurrentPlan}
                        colorScheme={plan.isRecommended ? 'blue' : 'gray'}
                        size="md"
                        w="full"
                      >
                        {isCurrentPlan ? 'Plano atual' : 'Escolher este plano'}
                      </Button>
                    </VStack>
                  </Box>
                );
              })}
            </SimpleGrid>
          </Box>

          {/* Info Footer */}
          <Alert status="info" borderRadius="lg">
            <AlertIcon />
            <Box>
              <Text fontSize="sm">
                <strong>💡 Nota:</strong> Você pode trocar de plano a qualquer momento. Em
                desenvolvimento, a troca é instantânea. Em produção, você será redirecionado
                para o checkout seguro.
              </Text>
            </Box>
          </Alert>
        </VStack>
      </Container>
    </AppLayout>
  );
};
