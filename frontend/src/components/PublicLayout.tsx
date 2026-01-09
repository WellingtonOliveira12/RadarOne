import React from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import {
  Box,
  Container,
  Flex,
  HStack,
  VStack,
  Image,
  Heading,
  Link,
  Text,
  Button,
  Skeleton,
} from '@chakra-ui/react';
import { APP_VERSION, AUTH_LABELS } from '../constants/app';
import { useAuth } from '../context/AuthContext';

interface PublicLayoutProps {
  children: React.ReactNode;
  /** Largura máxima do container (padrão: container.xl) */
  maxWidth?: string;
  /** Se true, mostra links de navegação no header */
  showNav?: boolean;
}

/**
 * Layout padrão para páginas públicas (não autenticadas)
 *
 * Inclui:
 * - Header com logo RadarOne
 * - Container centralizado e responsivo
 * - Footer simples
 *
 * Usado em: /login, /register, /forgot-password, /reset-password, /manual, /faq, /contact
 */
export const PublicLayout: React.FC<PublicLayoutProps> = ({
  children,
  maxWidth = 'container.xl',
  showNav = false,
}) => {
  const location = useLocation();
  const currentPath = location.pathname;
  const { user, loading, logout } = useAuth();

  return (
    <Box minH="100vh" bg="gray.50" display="flex" flexDirection="column">
      {/* Header */}
      <Box
        as="header"
        bg="white"
        borderBottom="1px"
        borderColor="gray.200"
        position="sticky"
        top={0}
        zIndex={1000}
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

            {/* Navigation - Adapts based on auth state when showNav is true */}
            {showNav && (
              loading ? (
                // Loading skeleton while checking auth
                <HStack spacing={{ base: 2, md: 4 }}>
                  <Skeleton height="20px" width="60px" />
                  <Skeleton height="20px" width="60px" />
                  <Skeleton height="32px" width="100px" borderRadius="md" />
                </HStack>
              ) : user ? (
                // Logged in: show Dashboard + Logout
                <HStack spacing={{ base: 2, md: 4 }} flexWrap="wrap">
                  <Link
                    as={RouterLink}
                    to="/dashboard"
                    fontSize="sm"
                    fontWeight="medium"
                    color="gray.600"
                    _hover={{ color: 'blue.600' }}
                  >
                    Dashboard
                  </Link>
                  <Button
                    onClick={logout}
                    colorScheme="red"
                    variant="outline"
                    size="sm"
                  >
                    Sair
                  </Button>
                </HStack>
              ) : (
                // Logged out: show default nav
                <HStack spacing={{ base: 2, md: 4 }} flexWrap="wrap">
                  <Link
                    as={RouterLink}
                    to="/plans"
                    fontSize="sm"
                    fontWeight="medium"
                    color={currentPath === '/plans' ? 'blue.600' : 'gray.600'}
                    borderBottom={currentPath === '/plans' ? '2px solid' : 'none'}
                    borderColor="blue.600"
                    pb={currentPath === '/plans' ? 0.5 : 0}
                    _hover={{ color: 'blue.600' }}
                  >
                    Planos
                  </Link>
                  <Link
                    as={RouterLink}
                    to="/login"
                    fontSize="sm"
                    fontWeight="medium"
                    color={currentPath === '/login' ? 'blue.600' : 'gray.600'}
                    borderBottom={currentPath === '/login' ? '2px solid' : 'none'}
                    borderColor="blue.600"
                    pb={currentPath === '/login' ? 0.5 : 0}
                    _hover={{ color: 'blue.600' }}
                  >
                    {AUTH_LABELS.LOGIN_CTA}
                  </Link>
                  <Link
                    as={RouterLink}
                    to="/register"
                    fontSize="sm"
                    fontWeight="medium"
                    color="white"
                    bg={currentPath === '/register' ? 'blue.600' : 'blue.500'}
                    px={3}
                    py={1.5}
                    borderRadius="md"
                    _hover={{ bg: 'blue.600', textDecoration: 'none' }}
                  >
                    Criar conta
                  </Link>
                </HStack>
              )
            )}
          </Flex>
        </Container>
      </Box>

      {/* Main Content */}
      <Box as="main" flex="1" w="100%">
        <Container maxW={maxWidth} py={{ base: 6, md: 10 }} px={{ base: 4, md: 6 }}>
          {children}
        </Container>
      </Box>

      {/* Footer - Centralizado e consistente com AppLayout */}
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
                Manual
              </Link>
              <Text color="gray.300">•</Text>
              <Link as={RouterLink} to="/faq" fontSize="sm" color="gray.600">
                FAQ
              </Link>
              <Text color="gray.300">•</Text>
              <Link as={RouterLink} to="/contact" fontSize="sm" color="gray.600">
                Contato
              </Link>
            </HStack>
            <Text fontSize="xs" color="gray.400" textAlign="center">
              © 2025 RadarOne. Todos os direitos reservados. • v{APP_VERSION}
            </Text>
          </VStack>
        </Container>
      </Box>
    </Box>
  );
};
