import React from 'react';
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
} from '@chakra-ui/react';
import { HamburgerIcon, ChevronDownIcon } from '@chakra-ui/icons';
import { useAuth } from '../context/AuthContext';
import { APP_VERSION } from '../constants/app';

interface AppLayoutProps {
  children: React.ReactNode;
}

/**
 * Layout reutilizável para páginas internas
 * Responsivo e centralizado com header e footer consistentes
 * Refatorado com Chakra UI para responsividade nativa
 */
export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { logout } = useAuth();
  const { isOpen, onOpen, onClose } = useDisclosure();

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
              <Link as={RouterLink} to="/dashboard" fontWeight="medium" color="gray.600" _hover={{ color: 'blue.600' }}>
                Dashboard
              </Link>
              <Link as={RouterLink} to="/monitors" fontWeight="medium" color="gray.600" _hover={{ color: 'blue.600' }}>
                Monitores
              </Link>
              <Link as={RouterLink} to="/telegram/connect" fontWeight="medium" color="gray.600" _hover={{ color: 'blue.600' }}>
                Telegram
              </Link>
              <Link as={RouterLink} to="/settings/notifications" fontWeight="medium" color="gray.600" _hover={{ color: 'blue.600' }}>
                Configurações
              </Link>

              {/* Help Menu */}
              <Menu>
                <MenuButton
                  as={Button}
                  variant="ghost"
                  rightIcon={<ChevronDownIcon />}
                  fontWeight="medium"
                  color="gray.600"
                  _hover={{ color: 'blue.600', bg: 'gray.50' }}
                >
                  Ajuda
                </MenuButton>
                <MenuList>
                  <MenuItem as={RouterLink} to="/manual">
                    📖 Manual
                  </MenuItem>
                  <MenuItem as={RouterLink} to="/faq">
                    ❓ FAQ
                  </MenuItem>
                  <MenuItem as={RouterLink} to="/contact">
                    💬 Fale Conosco
                  </MenuItem>
                </MenuList>
              </Menu>

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
          <DrawerHeader>Menu</DrawerHeader>
          <DrawerBody>
            <VStack align="stretch" spacing={4}>
              <Link as={RouterLink} to="/dashboard" onClick={onClose} fontWeight="medium">
                Dashboard
              </Link>
              <Link as={RouterLink} to="/monitors" onClick={onClose} fontWeight="medium">
                Monitores
              </Link>
              <Link as={RouterLink} to="/telegram/connect" onClick={onClose} fontWeight="medium">
                Telegram
              </Link>
              <Link as={RouterLink} to="/settings/notifications" onClick={onClose} fontWeight="medium">
                Configurações
              </Link>
              <Link as={RouterLink} to="/manual" onClick={onClose} fontWeight="medium">
                📖 Manual
              </Link>
              <Link as={RouterLink} to="/faq" onClick={onClose} fontWeight="medium">
                ❓ FAQ
              </Link>
              <Link as={RouterLink} to="/contact" onClick={onClose} fontWeight="medium">
                💬 Fale Conosco
              </Link>
              <Button onClick={() => { logout(); onClose(); }} colorScheme="red" mt={4}>
                Sair
              </Button>
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

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
    </Flex>
  );
};

