import React, { useState, useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Flex,
  Button,
  Link,
  Image,
  Heading,
  IconButton,
  useDisclosure,
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  VStack,
  HStack,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Text,
  Container,
  Alert,
  AlertIcon,
  AlertDescription,
  CloseButton,
} from '@chakra-ui/react';
import { HamburgerIcon, ChevronDownIcon } from '@chakra-ui/icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { APP_VERSION } from '../constants/app';
import { getSubscriptionStatus } from '../utils/subscriptionHelpers';
import { LanguageSwitcher } from './LanguageSwitcher';
import { api } from '../services/api';

interface AppLayoutProps {
  children: React.ReactNode;
}

/**
 * Layout reutilizável para páginas internas
 * Responsivo e centralizado com header e footer consistentes
 * Refatorado com Chakra UI para responsividade nativa
 */
export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [degradedSites, setDegradedSites] = useState<string[]>([]);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Check session health on mount
  useEffect(() => {
    let cancelled = false;

    async function checkSessions() {
      try {
        const data = await api.request<{
          sessions: Array<{ site: string; status: string }>;
        }>('/api/sessions', { method: 'GET', skipAutoLogout: true });

        if (cancelled) return;

        const needsAction = data.sessions
          .filter((s) => ['NEEDS_REAUTH', 'EXPIRED', 'INVALID'].includes(s.status))
          .map((s) => s.site);

        setDegradedSites(needsAction);
      } catch {
        // Silent — banner is best-effort
      }
    }

    checkSessions();
    // Re-check every 5 minutes
    const interval = setInterval(checkSessions, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const siteNameMap: Record<string, string> = {
    MERCADO_LIVRE: 'Mercado Livre',
    FACEBOOK_MARKETPLACE: 'Facebook Marketplace',
    OLX: 'OLX',
  };

  const showSessionBanner = degradedSites.length > 0 && !bannerDismissed;

  // Verificar se user tem subscription válida (para mostrar/esconder links internos)
  const subscriptionStatus = getSubscriptionStatus(user);
  const hasValidSubscription = subscriptionStatus.hasValidSubscription;

  return (
    <Flex direction="column" minH="100vh" bg="gray.50">
      {/* Header */}
      <Box
        as="header"
        bg="white"
        borderBottom="1px"
        borderColor="gray.200"
        position="sticky"
        top={0}
        zIndex={100}
        px={{ base: 4, md: 6 }}
        py={4}
      >
        <Container maxW="container.xl">
          <Flex justify="space-between" align="center">
            {/* Logo */}
            <Link as={RouterLink} to="/dashboard" _hover={{ textDecoration: 'none' }}>
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

            {/* Desktop Navigation */}
            <HStack spacing={4} display={{ base: 'none', md: 'flex' }}>
              {/* Links internos (só aparecem com subscription válida) */}
              {hasValidSubscription && (
                <>
                  <Link as={RouterLink} to="/dashboard" fontWeight="medium" color="gray.600" _hover={{ color: 'blue.600' }}>
                    {t('nav.dashboard')}
                  </Link>
                  <Link as={RouterLink} to="/monitors" fontWeight="medium" color="gray.600" _hover={{ color: 'blue.600' }}>
                    {t('nav.monitors')}
                  </Link>
                  <Link as={RouterLink} to="/telegram/connect" fontWeight="medium" color="gray.600" _hover={{ color: 'blue.600' }}>
                    {t('nav.telegram')}
                  </Link>
                  <Link as={RouterLink} to="/settings/notifications" fontWeight="medium" color="gray.600" _hover={{ color: 'blue.600' }}>
                    {t('nav.settings')}
                  </Link>
                </>
              )}

              {/* Link para Planos (aparece se subscription inválida) */}
              {!hasValidSubscription && (
                <Link as={RouterLink} to="/plans" fontWeight="medium" color="blue.600" _hover={{ color: 'blue.700' }}>
                  {t('nav.plans')}
                </Link>
              )}

              {/* Help Menu (sempre visível) */}
              <Menu>
                <MenuButton
                  as={Button}
                  variant="ghost"
                  rightIcon={<ChevronDownIcon />}
                  fontWeight="medium"
                  color="gray.600"
                  _hover={{ color: 'blue.600', bg: 'gray.50' }}
                >
                  {t('nav.help')}
                </MenuButton>
                <MenuList>
                  <MenuItem as={RouterLink} to="/manual">
                    📖 {t('nav.manual')}
                  </MenuItem>
                  <MenuItem as={RouterLink} to="/faq">
                    ❓ {t('nav.faq')}
                  </MenuItem>
                  <MenuItem as={RouterLink} to="/contact">
                    💬 {t('nav.contact')}
                  </MenuItem>
                </MenuList>
              </Menu>

              <LanguageSwitcher />

              <Button onClick={logout} colorScheme="red" size="sm">
                {t('nav.logout')}
              </Button>
            </HStack>

            {/* Mobile Menu Button */}
            <IconButton
              aria-label="Abrir menu"
              icon={<HamburgerIcon />}
              display={{ base: 'flex', md: 'none' }}
              onClick={onOpen}
              variant="ghost"
            />
          </Flex>
        </Container>
      </Box>

      {/* Mobile Drawer */}
      <Drawer isOpen={isOpen} placement="right" onClose={onClose}>
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader>{t('nav.menu')}</DrawerHeader>
          <DrawerBody>
            <VStack align="stretch" spacing={4}>
              <LanguageSwitcher />

              {/* Links internos (só aparecem com subscription válida) */}
              {hasValidSubscription && (
                <>
                  <Link as={RouterLink} to="/dashboard" onClick={onClose} fontWeight="medium">
                    {t('nav.dashboard')}
                  </Link>
                  <Link as={RouterLink} to="/monitors" onClick={onClose} fontWeight="medium">
                    {t('nav.monitors')}
                  </Link>
                  <Link as={RouterLink} to="/telegram/connect" onClick={onClose} fontWeight="medium">
                    {t('nav.telegram')}
                  </Link>
                  <Link as={RouterLink} to="/settings/notifications" onClick={onClose} fontWeight="medium">
                    {t('nav.settings')}
                  </Link>
                </>
              )}

              {/* Link para Planos (aparece se subscription inválida) */}
              {!hasValidSubscription && (
                <Link as={RouterLink} to="/plans" onClick={onClose} fontWeight="medium" color="blue.600">
                  {t('nav.plans')}
                </Link>
              )}

              {/* Links de ajuda (sempre visíveis) */}
              <Link as={RouterLink} to="/manual" onClick={onClose} fontWeight="medium">
                📖 {t('nav.manual')}
              </Link>
              <Link as={RouterLink} to="/faq" onClick={onClose} fontWeight="medium">
                ❓ {t('nav.faq')}
              </Link>
              <Link as={RouterLink} to="/contact" onClick={onClose} fontWeight="medium">
                💬 {t('nav.contact')}
              </Link>

              <Button onClick={() => { logout(); onClose(); }} colorScheme="red" mt={4}>
                {t('nav.logout')}
              </Button>
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* Session Degraded Banner */}
      {showSessionBanner && (
        <Box bg="orange.50" borderBottom="1px" borderColor="orange.200">
          <Container maxW="container.xl" py={3} px={{ base: 4, md: 6 }}>
            <Alert status="warning" variant="subtle" borderRadius="md" bg="transparent" p={0}>
              <AlertIcon color="orange.500" />
              <AlertDescription flex={1} fontSize="sm">
                {t('sessionBanner.message', {
                  defaultValue: 'Seus monitores de {{sites}} estão pausados — sessão expirada.',
                  sites: degradedSites.map((s) => siteNameMap[s] || s).join(', '),
                })}
                {' '}
                <Link
                  as={RouterLink}
                  to="/settings/connections"
                  color="orange.700"
                  fontWeight="bold"
                  textDecoration="underline"
                >
                  {t('sessionBanner.reconnect', { defaultValue: 'Reconectar agora' })}
                </Link>
              </AlertDescription>
              <CloseButton size="sm" onClick={() => setBannerDismissed(true)} />
            </Alert>
          </Container>
        </Box>
      )}

      {/* Main Content */}
      <Box as="main" flex={1} w="100%">
        <Container maxW="container.xl" py={{ base: 6, md: 10 }} px={{ base: 4, md: 6 }}>
          {children}
        </Container>
      </Box>

      {/* Footer */}
      <Box
        as="footer"
        bg="white"
        borderTop="1px"
        borderColor="gray.200"
        py={6}
        px={{ base: 4, md: 6 }}
      >
        <Container maxW="container.xl">
          <VStack spacing={3}>
            <HStack spacing={3} flexWrap="wrap" justify="center">
              <Link as={RouterLink} to="/manual" fontSize="sm" color="gray.600">
                {t('footer.manual')}
              </Link>
              <Text color="gray.300">•</Text>
              <Link as={RouterLink} to="/faq" fontSize="sm" color="gray.600">
                {t('footer.faq')}
              </Link>
              <Text color="gray.300">•</Text>
              <Link as={RouterLink} to="/contact" fontSize="sm" color="gray.600">
                {t('footer.contact')}
              </Link>
            </HStack>
            <Text fontSize="xs" color="gray.400" textAlign="center">
              {t('footer.rights')} • v{APP_VERSION}
            </Text>
          </VStack>
        </Container>
      </Box>
    </Flex>
  );
};

