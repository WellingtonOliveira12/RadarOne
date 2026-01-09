import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Text,
  VStack,
  Link as ChakraLink,
  Alert,
  AlertIcon,
  AlertDescription,
} from '@chakra-ui/react';
import { useAuth } from '../context/AuthContext';
import { showSuccess, showError } from '../lib/toast';
import { trackLogin } from '../lib/analytics';
import { getSubscriptionMessage } from '../utils/subscriptionHelpers';
import { PublicLayout } from '../components/PublicLayout';
import { AUTH_LABELS } from '../constants/app';

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reason = searchParams.get('reason');

  const { login: loginAuth } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validações básicas
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Email inválido');
      showError('Email inválido');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres');
      showError('A senha deve ter no mínimo 6 caracteres');
      setLoading(false);
      return;
    }

    try {
      await loginAuth(email, password);
      showSuccess('Login realizado com sucesso!');
      trackLogin('email');

      // Redirecionar para returnUrl (se salvo) ou /dashboard
      const returnUrl = sessionStorage.getItem('returnUrl');
      if (returnUrl) {
        sessionStorage.removeItem('returnUrl');
        navigate(returnUrl, { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Erro ao fazer login';
      setError(errorMessage);
      showError(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <PublicLayout maxWidth="container.xl">
      <VStack spacing={6} align="stretch">
        <Heading size="lg" textAlign="center">
          {AUTH_LABELS.LOGIN_PAGE_TITLE}
        </Heading>

        {/* Banner informando motivo do redirect (se houver) */}
        {reason && (
          <Alert status="warning" borderRadius="md">
            <AlertIcon />
            <AlertDescription>
              {getSubscriptionMessage(reason)}
            </AlertDescription>
          </Alert>
        )}

        <Box
          as="form"
          onSubmit={handleSubmit}
          bg="white"
          p={8}
          borderRadius="md"
          boxShadow="sm"
          border="1px"
          borderColor="gray.200"
        >
          <VStack spacing={4}>
            <FormControl isRequired>
              <FormLabel>Email</FormLabel>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                size="lg"
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Senha</FormLabel>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Sua senha"
                size="lg"
              />
            </FormControl>

            <Button
              type="submit"
              colorScheme="blue"
              size="lg"
              width="full"
              isLoading={loading}
              loadingText="Entrando..."
            >
              {AUTH_LABELS.LOGIN_CTA}
            </Button>

            <Text fontSize="sm" textAlign="center">
              <ChakraLink color="blue.500" href="/forgot-password">
                Esqueceu a senha?
              </ChakraLink>
            </Text>

            <Text fontSize="sm" textAlign="center" color="gray.600">
              Não tem uma conta?{' '}
              <ChakraLink as={RouterLink} to="/register" color="blue.500">
                Criar conta
              </ChakraLink>
            </Text>
          </VStack>
        </Box>

        {error && (
          <Alert status="error" borderRadius="md">
            <AlertIcon />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </VStack>
    </PublicLayout>
  );
}
