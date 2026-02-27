import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
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
  List,
  ListItem,
  Skeleton,
} from '@chakra-ui/react';
import { useAuth } from '../context/AuthContext';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

/**
 * Landing Page - Página inicial pública do RadarOne
 * Redesenhada com Chakra UI para consistência visual
 */

export const LandingPage: React.FC = () => {
  const { user, loading, logout } = useAuth();
  const { t } = useTranslation();

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

            {/* Navigation - Adapts based on auth state */}
            <HStack spacing={{ base: 2, md: 4 }} flexWrap="wrap">
              {loading ? (
                <>
                  <Skeleton height="20px" width="60px" />
                  <Skeleton height="20px" width="60px" />
                  <Skeleton height="32px" width="100px" borderRadius="md" />
                </>
              ) : user ? (
                <>
                  <Link
                    as={RouterLink}
                    to="/dashboard"
                    fontSize="sm"
                    fontWeight="medium"
                    color="gray.600"
                    _hover={{ color: 'blue.600' }}
                  >
                    {t('public.dashboard')}
                  </Link>
                  <Button
                    onClick={logout}
                    colorScheme="red"
                    variant="outline"
                    size="sm"
                  >
                    {t('public.logout')}
                  </Button>
                </>
              ) : (
                <>
                  <Link
                    as={RouterLink}
                    to="/plans"
                    fontSize="sm"
                    fontWeight="medium"
                    color="gray.600"
                    _hover={{ color: 'blue.600' }}
                  >
                    {t('public.plans')}
                  </Link>
                  <Link
                    as={RouterLink}
                    to="/login"
                    fontSize="sm"
                    fontWeight="medium"
                    color="gray.600"
                    _hover={{ color: 'blue.600' }}
                  >
                    {t('public.login')}
                  </Link>
                  <Button
                    as={RouterLink}
                    to="/register"
                    colorScheme="blue"
                    size="sm"
                  >
                    {t('public.register')}
                  </Button>
                </>
              )}
              <LanguageSwitcher />
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
            {t('landing.heroTitle')}
          </Heading>

          {/* Subheadline */}
          <Text
            fontSize={{ base: 'md', md: 'lg' }}
            color="gray.600"
            mb={8}
            lineHeight="tall"
          >
            {t('landing.heroSubtitle')}
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
              {t('landing.heroCta')}
            </Button>
            <Button
              as={RouterLink}
              to="/plans"
              variant="outline"
              colorScheme="blue"
              size="lg"
              px={8}
            >
              {t('landing.heroViewPlans')}
            </Button>
          </HStack>
        </Container>
      </Box>

      {/* Features Section */}
      <Box as="section" bg="white" py={{ base: 12, md: 16 }} px={{ base: 4, md: 6 }}>
        <Container maxW="container.xl">
          <VStack spacing={2} mb={12} textAlign="center">
            <Heading as="h2" size={{ base: 'lg', md: 'xl' }} color="gray.800">
              {t('landing.featuresTitle')}
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
                {t('landing.featureIphoneTitle')}
              </Heading>
              <Text fontSize="sm" color="gray.600" lineHeight="tall">
                {t('landing.featureIphoneDesc')}
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
                {t('landing.featureCarsTitle')}
              </Heading>
              <Text fontSize="sm" color="gray.600" lineHeight="tall">
                {t('landing.featureCarsDesc')}
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
                {t('landing.featureRealEstateTitle')}
              </Heading>
              <Text fontSize="sm" color="gray.600" lineHeight="tall">
                {t('landing.featureRealEstateDesc')}
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
              {t('landing.benefitsTitle')}
            </Heading>
          </VStack>

          <List spacing={4}>
            {(['benefitAlerts', 'benefitMarketplaces', 'benefitFilters', 'benefitProfit', 'benefitTrial', 'benefitNoCatch'] as const).map((key, i) => (
              <ListItem key={key} display="flex" alignItems="flex-start" gap={3}>
                <Text fontSize="2xl">{['⚡', '📱', '🎯', '💰', '✅', '🔒'][i]}</Text>
                <Text fontSize="md" color="gray.700">
                  <Trans i18nKey={`landing.${key}`} components={{ strong: <strong /> }} />
                </Text>
              </ListItem>
            ))}
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
            {t('landing.ctaTitle')}
          </Heading>
          <Text
            fontSize={{ base: 'md', md: 'lg' }}
            color="whiteAlpha.900"
            mb={8}
            lineHeight="tall"
          >
            <Trans i18nKey="landing.ctaSubtitle" components={{ strong: <strong /> }} />
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
            {t('landing.ctaButton')}
          </Button>
        </Container>
      </Box>

      {/* Footer */}
      <Box as="footer" bg="gray.900" py={8} px={{ base: 4, md: 6 }}>
        <Container maxW="container.xl">
          <Text fontSize="sm" color="gray.400" textAlign="center">
            {t('landing.footerRights')}
          </Text>
        </Container>
      </Box>
    </Box>
  );
};
