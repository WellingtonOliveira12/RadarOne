import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams, Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
import { useAuth, TwoFactorRequiredError } from '../context/AuthContext';
import { showSuccess, showError, showInfo } from '../lib/toast';
import { trackLogin } from '../lib/analytics';
import { getSubscriptionMessage } from '../utils/subscriptionHelpers';
import { PublicLayout } from '../components/PublicLayout';

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reason = searchParams.get('reason');
  const { t } = useTranslation();

  const { login: loginAuth } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadingText, setLoadingText] = useState(t('auth.loggingIn'));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setLoadingText(t('auth.loggingIn'));

    // Validações básicas
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError(t('auth.invalidEmail'));
      showError(t('auth.invalidEmail'));
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError(t('auth.passwordMin6'));
      showError(t('auth.passwordMin6'));
      setLoading(false);
      return;
    }

    // Timer para mostrar mensagem de cold start se demorar mais de 5s
    const coldStartTimer = setTimeout(() => {
      setLoadingText(t('auth.serverStarting'));
    }, 5000);

    try {
      await loginAuth(email, password);
      clearTimeout(coldStartTimer);
      showSuccess(t('auth.loginSuccess'));
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
      clearTimeout(coldStartTimer);

      // Verificar se é erro de 2FA necessário
      if (err instanceof TwoFactorRequiredError) {
        showInfo(t('auth.2faRequired'));
        navigate('/2fa/verify', {
          replace: true,
          state: {
            tempToken: err.tempToken,
            userId: err.userId
          }
        });
        return;
      }

      // Verificar se é erro de cold start para mensagem mais amigável
      const isColdStartError = err.isColdStart || err.errorCode === 'NETWORK_TIMEOUT';
      const errorMessage = isColdStartError
        ? t('auth.coldStartError')
        : (err.message || t('auth.loginError'));

      setError(errorMessage);
      showError(errorMessage);
    } finally {
      setLoading(false);
      setLoadingText(t('auth.loggingIn'));
    }
  }

  return (
    <PublicLayout maxWidth="container.xl">
      <VStack spacing={6} align="stretch">
        <Heading size="lg" textAlign="center">
          {t('auth.loginTitle')}
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
              <FormLabel>{t('auth.email')}</FormLabel>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                size="lg"
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel>{t('auth.password')}</FormLabel>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('auth.passwordPlaceholder')}
                size="lg"
              />
            </FormControl>

            <Button
              type="submit"
              colorScheme="blue"
              size="lg"
              width="full"
              isLoading={loading}
              loadingText={loadingText}
            >
              {t('auth.loginCta')}
            </Button>

            <Text fontSize="sm" textAlign="center">
              <ChakraLink color="blue.500" href="/forgot-password">
                {t('auth.forgotPassword')}
              </ChakraLink>
            </Text>

            <Text fontSize="sm" textAlign="center" color="gray.600">
              {t('auth.noAccount')}{' '}
              <ChakraLink as={RouterLink} to="/register" color="blue.500">
                {t('auth.createAccount')}
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
