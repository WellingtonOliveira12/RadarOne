import { useState, useEffect, type FormEvent } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  FormErrorMessage,
  Heading,
  Input,
  Text,
  VStack,
  Link as ChakraLink,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
} from '@chakra-ui/react';
import { resetPassword } from '../services/auth';
import { resetPasswordSchema } from '../validation/authSchemas';
import { showSuccess, showError } from '../lib/toast';
import { trackEvent } from '../lib/analytics';
import { PublicLayout } from '../components/PublicLayout';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  // Redirecionar automaticamente após sucesso
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        navigate('/login');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    // Validação com Zod
    try {
      resetPasswordSchema.parse({ password, confirmPassword });
    } catch (err: any) {
      const validationErrors: Record<string, string> = {};
      err.errors?.forEach((error: any) => {
        validationErrors[error.path[0]] = error.message;
      });
      setErrors(validationErrors);
      setLoading(false);
      showError(Object.values(validationErrors)[0]);
      return;
    }

    if (!token) {
      showError('Token de redefinição inválido ou ausente');
      setLoading(false);
      return;
    }

    try {
      await resetPassword({ token, password });
      setSuccess(true);
      showSuccess('Senha redefinida com sucesso. Você já pode fazer login.');
      trackEvent('password_reset_success', { method: 'email_link' });
    } catch (err: any) {
      const errorMessage =
        err.message || 'Não foi possível redefinir a senha. Tente novamente mais tarde ou solicite um novo link.';
      showError(errorMessage);
      trackEvent('password_reset_failed', {
        reason: err.message?.includes('inválido') || err.message?.includes('expirado')
          ? 'invalid_or_expired_token'
          : 'unknown_error',
      });
    } finally {
      setLoading(false);
    }
  }

  // Se não houver token, mostrar erro
  if (!token) {
    return (
      <PublicLayout maxWidth="md">
        <VStack spacing={6} align="stretch">
          <Heading size="lg" textAlign="center">
            Redefinir Senha
          </Heading>

          <Alert status="error" borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle>Link inválido ou expirado</AlertTitle>
              <AlertDescription>
                O link de redefinição de senha não é válido ou já foi usado. Por favor, solicite um novo link de
                redefinição.
              </AlertDescription>
            </Box>
          </Alert>

          <Button colorScheme="blue" onClick={() => navigate('/login')}>
            Voltar para o Login
          </Button>
        </VStack>
      </PublicLayout>
    );
  }

  // Se já redefiniu com sucesso
  if (success) {
    return (
      <PublicLayout maxWidth="md">
        <VStack spacing={6} align="stretch">
          <Heading size="lg" textAlign="center">
            Senha Redefinida!
          </Heading>

          <Alert
            status="success"
            variant="subtle"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            textAlign="center"
            borderRadius="md"
          >
            <AlertIcon boxSize="40px" mr={0} />
            <AlertTitle mt={4} mb={1} fontSize="lg">
              Senha redefinida com sucesso!
            </AlertTitle>
            <AlertDescription maxWidth="sm">
              Agora você já pode fazer login com a nova senha. Você será redirecionado automaticamente em alguns
              segundos...
            </AlertDescription>
          </Alert>

          <Button colorScheme="blue" onClick={() => navigate('/login')}>
            Ir para Login
          </Button>
        </VStack>
      </PublicLayout>
    );
  }

  // Formulário de redefinição
  return (
    <PublicLayout maxWidth="md">
      <VStack spacing={6} align="stretch">
        <Heading size="lg" textAlign="center">
          Redefinir Senha
        </Heading>

        <Text fontSize="sm" color="gray.600" textAlign="center">
          Defina abaixo uma nova senha para sua conta.
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
          <VStack spacing={4}>
            <FormControl isInvalid={!!errors.password} isRequired>
              <FormLabel>Nova Senha</FormLabel>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                size="lg"
              />
              {errors.password && <FormErrorMessage>{errors.password}</FormErrorMessage>}
            </FormControl>

            <FormControl isInvalid={!!errors.confirmPassword} isRequired>
              <FormLabel>Confirmar Senha</FormLabel>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Digite a senha novamente"
                size="lg"
              />
              {errors.confirmPassword && <FormErrorMessage>{errors.confirmPassword}</FormErrorMessage>}
            </FormControl>

            <Button
              type="submit"
              colorScheme="blue"
              size="lg"
              width="full"
              isLoading={loading}
              loadingText="Redefinindo..."
            >
              Redefinir Senha
            </Button>
          </VStack>
        </Box>

        <Text fontSize="sm" textAlign="center">
          <ChakraLink color="blue.500" href="/login">
            ← Voltar para o Login
          </ChakraLink>
        </Text>
      </VStack>
    </PublicLayout>
  );
}
