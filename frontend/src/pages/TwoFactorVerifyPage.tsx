/**
 * Página de Verificação 2FA
 * Exibida após login bem-sucedido quando 2FA está habilitado
 */

import { useState, type FormEvent, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Text,
  VStack,
  Alert,
  AlertIcon,
  AlertDescription,
  PinInput,
  PinInputField,
  HStack,
  Link as ChakraLink,
} from '@chakra-ui/react';
import { PublicLayout } from '../components/PublicLayout';
import { showSuccess, showError } from '../lib/toast';
import { api } from '../services/api';
import { setToken, clearAuth } from '../lib/auth';
import { useAuth } from '../context/AuthContext';

interface TwoFactorVerifyState {
  tempToken: string;
  userId: string;
}

interface VerifyResponse {
  authStep: string;
  message: string;
  token: string;
  user: { role?: string };
  warningBackupCode?: boolean;
}

export function TwoFactorVerifyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refetchUser } = useAuth();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);

  // Dados vindos da página de login
  const state = location.state as TwoFactorVerifyState | null;

  useEffect(() => {
    // Se não tiver os dados necessários, voltar para login
    if (!state?.tempToken || !state?.userId) {
      navigate('/login', { replace: true });
    }
  }, [state, navigate]);

  async function handleSubmit(e?: FormEvent, codeOverride?: string) {
    e?.preventDefault();

    const submitCode = codeOverride || code;
    if (!submitCode || submitCode.length < 6) {
      setError('Digite o código de 6 dígitos');
      return;
    }

    if (!state?.userId) {
      setError('Sessão inválida. Faça login novamente.');
      navigate('/login', { replace: true });
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Verificar código 2FA (com retry para cold start + skipAutoLogout para não deslogar em erro)
      const response = await api.requestWithRetry<VerifyResponse>(
        '/api/auth/2fa/verify',
        {
          method: 'POST',
          body: { userId: state.userId, code: submitCode },
          token: state.tempToken,
          skipAutoLogout: true,
        }
      );

      // Salvar token final
      setToken(response.token);

      // Atualizar contexto de autenticação
      await refetchUser();

      if (response.warningBackupCode) {
        showSuccess('Login realizado! Atenção: você usou um código de backup. Gere novos códigos em breve.');
      } else {
        showSuccess('Verificação concluída!');
      }

      // Redirecionar para returnUrl ou admin/dashboard
      const returnUrl = sessionStorage.getItem('returnUrl');
      if (returnUrl) {
        sessionStorage.removeItem('returnUrl');
        navigate(returnUrl, { replace: true });
      } else {
        // Verificar se é admin
        const isAdmin = response.user?.role?.startsWith('ADMIN');
        navigate(isAdmin ? '/admin/stats' : '/dashboard', { replace: true });
      }
    } catch (err: unknown) {
      // Diferenciar erro de rede vs erro de validação
      const apiErr = err as { isNetworkError?: boolean; errorCode?: string; message?: string };
      const isNetworkError = apiErr.isNetworkError || apiErr.errorCode === 'NETWORK_ERROR' || apiErr.errorCode === 'NETWORK_TIMEOUT';
      const errorMessage = isNetworkError
        ? 'Servidor indisponível. Tente novamente em instantes.'
        : (apiErr.message || 'Código inválido');
      setError(errorMessage);
      showError(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  function handleCodeComplete(value: string) {
    setCode(value);
    // Auto-submit quando completar 6 dígitos — passa valor direto para evitar stale closure
    if (value.length === 6) {
      setTimeout(() => {
        handleSubmit(undefined, value);
      }, 100);
    }
  }

  function handleCancel() {
    clearAuth();
    navigate('/login', { replace: true });
  }

  if (!state?.tempToken || !state?.userId) {
    return null; // Será redirecionado pelo useEffect
  }

  return (
    <PublicLayout maxWidth="container.sm">
      <VStack spacing={6} align="stretch">
        <Heading size="lg" textAlign="center">
          Verificação em Duas Etapas
        </Heading>

        <Text textAlign="center" color="gray.600">
          Digite o código de 6 dígitos do seu aplicativo autenticador
        </Text>

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
          <VStack spacing={6}>
            {!useBackupCode ? (
              <>
                <FormControl>
                  <FormLabel textAlign="center">Código do Autenticador</FormLabel>
                  <HStack justify="center">
                    <PinInput
                      size="lg"
                      value={code}
                      onChange={setCode}
                      onComplete={handleCodeComplete}
                      type="number"
                      otp
                      autoFocus
                    >
                      <PinInputField />
                      <PinInputField />
                      <PinInputField />
                      <PinInputField />
                      <PinInputField />
                      <PinInputField />
                    </PinInput>
                  </HStack>
                </FormControl>

                <Text fontSize="sm" color="gray.500" textAlign="center">
                  Não tem acesso ao aplicativo?{' '}
                  <ChakraLink
                    color="blue.500"
                    onClick={() => {
                      setUseBackupCode(true);
                      setCode('');
                    }}
                    cursor="pointer"
                  >
                    Usar código de backup
                  </ChakraLink>
                </Text>
              </>
            ) : (
              <>
                <FormControl>
                  <FormLabel>Código de Backup</FormLabel>
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="XXXXXXXX"
                    size="lg"
                    textAlign="center"
                    fontSize="xl"
                    maxLength={8}
                    autoFocus
                  />
                </FormControl>

                <Text fontSize="sm" color="gray.500" textAlign="center">
                  <ChakraLink
                    color="blue.500"
                    onClick={() => {
                      setUseBackupCode(false);
                      setCode('');
                    }}
                    cursor="pointer"
                  >
                    Voltar para código do aplicativo
                  </ChakraLink>
                </Text>
              </>
            )}

            {error && (
              <Alert status="error" borderRadius="md">
                <AlertIcon />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              colorScheme="blue"
              size="lg"
              width="full"
              isLoading={loading}
              loadingText="Verificando..."
              isDisabled={code.length < 6}
            >
              Verificar
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              color="gray.500"
            >
              Cancelar e voltar ao login
            </Button>
          </VStack>
        </Box>

        <Alert status="info" borderRadius="md">
          <AlertIcon />
          <AlertDescription fontSize="sm">
            O código muda a cada 30 segundos. Se estiver com problemas,
            verifique se o horário do seu dispositivo está correto.
          </AlertDescription>
        </Alert>
      </VStack>
    </PublicLayout>
  );
}
