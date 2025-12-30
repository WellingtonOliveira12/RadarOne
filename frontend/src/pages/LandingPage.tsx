import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Container,
  Flex,
  Heading,
  Text,
  Button,
  Image,
  SimpleGrid,
  VStack,
  HStack,
  Link,
  Icon,
  List,
  ListItem,
  ListIcon,
} from '@chakra-ui/react';
import { CheckCircleIcon } from '@chakra-ui/icons';

/**
 * Landing Page - Página inicial pública do RadarOne
 * Redesenhada com Chakra UI para consistência visual
 */

export const LandingPage: React.FC = () => {
  return (
    <Box minH="100vh" bg="gray.50">
      {/* Header */}
      <Box
        as="header"
        bg="white"
        borderBottom="1px"
        borderColor="gray.200"
        position="sticky"
        top={0}
        zIndex={100}
      >
        <Container maxW="container.xl" py={4} px={{ base: 4, md: 6 }}>
          <Flex justify="space-between" align="center" flexWrap="wrap" gap={3}>
            {/* Logo */}
            <Link as={RouterLink} to="/" _hover={{ textDecoration: 'none' }}>
              <HStack spacing={{ base: 2, md: 3 }}>
                <Image
                  src="/brand/radarone-logo.png"
                  alt="RadarOne Logo"
                  h={{ base: '32px', md: '40px' }}
                  objectFit="contain"
                  fallbackSrc="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%233b82f6'/%3E%3C/svg%3E"
                />
                <Heading as="h1" size={{ base: 'sm', md: 'md' }} color="gray.800" m={0}>
                  RadarOne
                </Heading>
              </HStack>
            </Link>

            {/* Navigation */}
            <HStack spacing={{ base: 2, md: 4 }} flexWrap="wrap">
              <Link
                as={RouterLink}
                to="/plans"
                fontSize="sm"
                fontWeight="medium"
                color="gray.600"
                _hover={{ color: 'blue.600' }}
              >
                Planos
              </Link>
              <Link
                as={RouterLink}
                to="/login"
                fontSize="sm"
                fontWeight="medium"
                color="gray.600"
                _hover={{ color: 'blue.600' }}
              >
                Entrar
              </Link>
              <Button
                as={RouterLink}
                to="/register"
                colorScheme="blue"
                size="sm"
              >
                Criar conta
              </Button>
            </HStack>
          </Flex>
        </Container>
      </Box>

      {/* Hero Section */}
      <Box as="section" py={{ base: 12, md: 20 }} px={{ base: 4, md: 6 }}>
        <Container maxW="container.md" textAlign="center">
          {/* Logo Hero */}
          <Flex justify="center" mb={{ base: 6, md: 8 }}>
            <Image
              src="/brand/radarone-logo.png"
              alt="RadarOne"
              h={{ base: '80px', md: '120px' }}
              objectFit="contain"
              fallbackSrc="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Crect width='120' height='120' fill='%233b82f6'/%3E%3C/svg%3E"
            />
          </Flex>

          {/* Headline */}
          <Heading
            as="h1"
            size={{ base: 'xl', md: '2xl' }}
            color="gray.800"
            mb={4}
            lineHeight="shorter"
          >
            Encontre as melhores oportunidades antes da concorrência
          </Heading>

          {/* Subheadline */}
          <Text
            fontSize={{ base: 'md', md: 'lg' }}
            color="gray.600"
            mb={8}
            lineHeight="tall"
          >
            Monitore anúncios de <strong>iPhone, carros, imóveis e muito mais</strong> no OLX,
            Mercado Livre e Facebook. Receba alertas em tempo real e seja o primeiro a fechar negócio.
          </Text>

          {/* CTAs */}
          <HStack spacing={4} justify="center" flexWrap="wrap">
            <Button
              as={RouterLink}
              to="/register"
              colorScheme="blue"
              size="lg"
              px={8}
            >
              Começar agora - 7 dias grátis
            </Button>
            <Button
              as={RouterLink}
              to="/plans"
              variant="outline"
              colorScheme="blue"
              size="lg"
              px={8}
            >
              Ver planos
            </Button>
          </HStack>
        </Container>
      </Box>

      {/* Features Section */}
      <Box as="section" bg="white" py={{ base: 12, md: 16 }} px={{ base: 4, md: 6 }}>
        <Container maxW="container.xl">
          <VStack spacing={2} mb={12} textAlign="center">
            <Heading as="h2" size={{ base: 'lg', md: 'xl' }} color="gray.800">
              Ideal para vendedores e revendedores
            </Heading>
          </VStack>

          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={8}>
            {/* Feature 1 */}
            <Box
              bg="white"
              p={8}
              borderRadius="xl"
              boxShadow="md"
              textAlign="center"
              _hover={{ boxShadow: 'lg', transform: 'translateY(-4px)' }}
              transition="all 0.3s"
            >
              <Text fontSize="5xl" mb={4}>📱</Text>
              <Heading as="h3" size="md" mb={3} color="gray.800">
                Revenda de iPhone
              </Heading>
              <Text fontSize="sm" color="gray.600" lineHeight="tall">
                Monitore anúncios de iPhone usados, pegue os melhores preços antes
                da concorrência e revenda com lucro.
              </Text>
            </Box>

            {/* Feature 2 */}
            <Box
              bg="white"
              p={8}
              borderRadius="xl"
              boxShadow="md"
              textAlign="center"
              _hover={{ boxShadow: 'lg', transform: 'translateY(-4px)' }}
              transition="all 0.3s"
            >
              <Text fontSize="5xl" mb={4}>🚗</Text>
              <Heading as="h3" size="md" mb={3} color="gray.800">
                Carros e Motos
              </Heading>
              <Text fontSize="sm" color="gray.600" lineHeight="tall">
                Acompanhe anúncios de veículos na sua região. Receba alerta
                instantâneo quando aparecer um bom negócio.
              </Text>
            </Box>

            {/* Feature 3 */}
            <Box
              bg="white"
              p={8}
              borderRadius="xl"
              boxShadow="md"
              textAlign="center"
              _hover={{ boxShadow: 'lg', transform: 'translateY(-4px)' }}
              transition="all 0.3s"
            >
              <Text fontSize="5xl" mb={4}>🏠</Text>
              <Heading as="h3" size="md" mb={3} color="gray.800">
                Imóveis e Terrenos
              </Heading>
              <Text fontSize="sm" color="gray.600" lineHeight="tall">
                Encontre imóveis abaixo do preço de mercado. Seja o primeiro
                a entrar em contato com o vendedor.
              </Text>
            </Box>
          </SimpleGrid>
        </Container>
      </Box>

      {/* Benefits Section */}
      <Box as="section" py={{ base: 12, md: 16 }} px={{ base: 4, md: 6 }}>
        <Container maxW="container.md">
          <VStack spacing={2} mb={10} textAlign="center">
            <Heading as="h2" size={{ base: 'lg', md: 'xl' }} color="gray.800">
              Por que vendedores escolhem o RadarOne?
            </Heading>
          </VStack>

          <List spacing={4}>
            <ListItem display="flex" alignItems="flex-start" gap={3}>
              <Text fontSize="2xl">⚡</Text>
              <Text fontSize="md" color="gray.700">
                <strong>Alertas em segundos</strong> - Receba notificação via Telegram assim que o anúncio for publicado
              </Text>
            </ListItem>

            <ListItem display="flex" alignItems="flex-start" gap={3}>
              <Text fontSize="2xl">📱</Text>
              <Text fontSize="md" color="gray.700">
                <strong>Todos os marketplaces</strong> - OLX, Mercado Livre, Facebook Marketplace, Webmotors e mais
              </Text>
            </ListItem>

            <ListItem display="flex" alignItems="flex-start" gap={3}>
              <Text fontSize="2xl">🎯</Text>
              <Text fontSize="md" color="gray.700">
                <strong>Filtros inteligentes</strong> - Monitore por cidade, faixa de preço, palavra-chave e muito mais
              </Text>
            </ListItem>

            <ListItem display="flex" alignItems="flex-start" gap={3}>
              <Text fontSize="2xl">💰</Text>
              <Text fontSize="md" color="gray.700">
                <strong>Aumente seu lucro</strong> - Chegue primeiro nos melhores negócios e negocie melhor
              </Text>
            </ListItem>

            <ListItem display="flex" alignItems="flex-start" gap={3}>
              <Text fontSize="2xl">✅</Text>
              <Text fontSize="md" color="gray.700">
                <strong>7 dias grátis</strong> - Teste sem compromisso. Cancele quando quiser
              </Text>
            </ListItem>

            <ListItem display="flex" alignItems="flex-start" gap={3}>
              <Text fontSize="2xl">🔒</Text>
              <Text fontSize="md" color="gray.700">
                <strong>Sem pegadinhas</strong> - Cancele pelo app, sem ligar pra ninguém
              </Text>
            </ListItem>
          </List>
        </Container>
      </Box>

      {/* CTA Section */}
      <Box
        as="section"
        bg="blue.500"
        py={{ base: 12, md: 16 }}
        px={{ base: 4, md: 6 }}
        textAlign="center"
      >
        <Container maxW="container.md">
          <Heading as="h2" size={{ base: 'lg', md: 'xl' }} color="white" mb={4}>
            Comece a vender mais hoje mesmo
          </Heading>
          <Text fontSize={{ base: 'md', md: 'lg' }} color="whiteAlpha.900" mb={8} lineHeight="tall">
            Junte-se a centenas de vendedores que já usam o RadarOne para encontrar as melhores
            oportunidades. <strong>7 dias grátis</strong>, sem pedir cartão de crédito.
          </Text>
          <Button
            as={RouterLink}
            to="/register"
            size="lg"
            colorScheme="whiteAlpha"
            bg="white"
            color="blue.600"
            _hover={{ bg: 'gray.50' }}
            px={10}
          >
            Criar conta grátis
          </Button>
        </Container>
      </Box>

      {/* Footer */}
      <Box as="footer" bg="gray.900" py={8} px={{ base: 4, md: 6 }}>
        <Container maxW="container.xl">
          <Text fontSize="sm" color="gray.400" textAlign="center">
            © 2025 RadarOne. Todos os direitos reservados.
          </Text>
        </Container>
      </Box>
    </Box>
  );
};
