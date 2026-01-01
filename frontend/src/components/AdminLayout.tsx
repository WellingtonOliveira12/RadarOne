import React, { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
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
  Text,
  Container,
  Badge,
} from '@chakra-ui/react';
import { HamburgerIcon } from '@chakra-ui/icons';
import { useAuth } from '../context/AuthContext';
import { APP_VERSION } from '../constants/app';
import { api } from '../services/api';

interface AdminLayoutProps {
  children: React.ReactNode;
}

/**
 * Layout dedicado para área administrativa
 * - Header com logo e botão de logout
 * - Navegação lateral com seções admin
 * - Responsivo com drawer mobile
 */
export const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const location = useLocation();
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  // Buscar contagem de alertas não lidos (FASE 4.1)
  useEffect(() => {
    const fetchUnreadAlerts = async () => {
      try {
        const response = await api.get('/api/admin/alerts/unread-count');
        setUnreadAlerts(response.count);
      } catch (error) {
        console.error('Erro ao buscar alertas não lidos:', error);
      }
    };

    fetchUnreadAlerts();

    // Atualizar a cada 30 segundos
    const interval = setInterval(fetchUnreadAlerts, 30000);

    return () => clearInterval(interval);
  }, []);

  const adminNavLinks = [
    { to: '/admin/stats', label: 'Dashboard', icon: '📊' },
    { to: '/admin/users', label: 'Usuários', icon: '👥' },
    { to: '/admin/subscriptions', label: 'Assinaturas', icon: '💳' },
    { to: '/admin/jobs', label: 'Jobs', icon: '⚙️' },
    { to: '/admin/audit-logs', label: 'Audit Logs', icon: '📝' },
    { to: '/admin/settings', label: 'Configurações', icon: '⚙️' },
    { to: '/admin/monitors', label: 'Monitores', icon: '📡' },
    { to: '/admin/webhooks', label: 'Webhooks', icon: '🔗' },
    { to: '/admin/coupons', label: 'Cupons', icon: '🎟️' },
    { to: '/admin/alerts', label: 'Alertas', icon: '🔔' },
    { to: '/admin/security', label: 'Segurança (2FA)', icon: '🔐' },
  ];

  const isActiveLink = (path: string) => location.pathname === path;

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
            <Link as={RouterLink} to="/admin/stats" _hover={{ textDecoration: 'none' }}>
              <HStack spacing={{ base: 2, md: 3 }}>
                <Image
                  src="/brand/radarone-logo.png"
                  alt="RadarOne Logo"
                  h={{ base: '32px', md: '40px' }}
                  objectFit="contain"
                  fallbackSrc="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%233b82f6'/%3E%3C/svg%3E"
                />
                <Heading as="h1" size={{ base: 'sm', md: 'md' }} color="gray.800" m={0}>
                  RadarOne Admin
                </Heading>
              </HStack>
            </Link>

            {/* Desktop Actions */}
            <HStack spacing={4} display={{ base: 'none', md: 'flex' }}>
              <Text fontSize="sm" color="gray.600">
                {user?.email}
              </Text>
              <Link as={RouterLink} to="/admin/stats" fontSize="sm" color="blue.600" _hover={{ color: 'blue.700' }}>
                Dashboard Admin
              </Link>
              <Button onClick={logout} colorScheme="red" size="sm">
                Sair
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
          <DrawerHeader>Menu Admin</DrawerHeader>
          <DrawerBody>
            <VStack align="stretch" spacing={4}>
              {adminNavLinks.map((link) => (
                <Link
                  key={link.to}
                  as={RouterLink}
                  to={link.to}
                  onClick={onClose}
                  fontWeight={isActiveLink(link.to) ? 'bold' : 'medium'}
                  color={isActiveLink(link.to) ? 'blue.600' : 'gray.700'}
                  bg={isActiveLink(link.to) ? 'blue.50' : 'transparent'}
                  px={3}
                  py={2}
                  borderRadius="md"
                  _hover={{ bg: 'blue.50', color: 'blue.600' }}
                >
                  <HStack spacing={2} justify="space-between" w="100%">
                    <Text>
                      {link.icon} {link.label}
                    </Text>
                    {link.to === '/admin/alerts' && unreadAlerts > 0 && (
                      <Badge colorScheme="red" borderRadius="full" fontSize="xs">
                        {unreadAlerts}
                      </Badge>
                    )}
                  </HStack>
                </Link>
              ))}
              <Link as={RouterLink} to="/admin/stats" onClick={onClose} fontWeight="medium" color="blue.600" mt={4}>
                ← Dashboard Admin
              </Link>
              <Button onClick={() => { logout(); onClose(); }} colorScheme="red" mt={2}>
                Sair
              </Button>
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* Main Layout with Sidebar */}
      <Flex flex={1}>
        {/* Sidebar Desktop */}
        <Box
          as="aside"
          w="240px"
          bg="white"
          borderRight="1px"
          borderColor="gray.200"
          display={{ base: 'none', md: 'block' }}
          position="sticky"
          top="73px"
          h="calc(100vh - 73px)"
          overflowY="auto"
        >
          <VStack align="stretch" spacing={1} p={4}>
            {adminNavLinks.map((link) => (
              <Link
                key={link.to}
                as={RouterLink}
                to={link.to}
                fontWeight={isActiveLink(link.to) ? 'semibold' : 'medium'}
                fontSize="sm"
                color={isActiveLink(link.to) ? 'blue.600' : 'gray.700'}
                bg={isActiveLink(link.to) ? 'blue.50' : 'transparent'}
                px={3}
                py={2}
                borderRadius="md"
                borderLeft={isActiveLink(link.to) ? '3px solid' : 'none'}
                borderColor="blue.600"
                _hover={{
                  bg: 'blue.50',
                  color: 'blue.600',
                  textDecoration: 'none',
                }}
              >
                <HStack spacing={2} justify="space-between" w="100%">
                  <Text>
                    {link.icon} {link.label}
                  </Text>
                  {link.to === '/admin/alerts' && unreadAlerts > 0 && (
                    <Badge colorScheme="red" borderRadius="full" fontSize="xs">
                      {unreadAlerts}
                    </Badge>
                  )}
                </HStack>
              </Link>
            ))}
          </VStack>
        </Box>

        {/* Main Content */}
        <Box as="main" flex={1} w="100%">
          <Container maxW="container.xl" py={{ base: 6, md: 10 }} px={{ base: 4, md: 6 }}>
            {children}
          </Container>
        </Box>
      </Flex>

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
            <Text fontSize="xs" color="gray.400" textAlign="center">
              © 2025 RadarOne Admin. Todos os direitos reservados. • v{APP_VERSION}
            </Text>
          </VStack>
        </Container>
      </Box>
    </Flex>
  );
};
