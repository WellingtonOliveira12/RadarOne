import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { forgotPassword } from '../services/auth';
import { forgotPasswordSchema } from '../validation/authSchemas';
import { showSuccess, showError } from '../lib/toast';
import { trackEvent, maskEmail } from '../lib/analytics';
import { PublicLayout } from '../components/PublicLayout';

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    // Validação com Zod
    try {
      forgotPasswordSchema.parse({ email });
    } catch (err: any) {
      const validationErrors: Record<string, string> = {};
      err.errors?.forEach((error: any) => {
        validationErrors[error.path[0]] = error.message;
      });
      setErrors(validationErrors);
      setLoading(false);
      return;
    }

    try {
      // Adicionar timeout de 30 segundos para evitar loading infinito
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Tempo limite excedido. Tente novamente.')), 30000)
      );

      await Promise.race([forgotPassword(email), timeoutPromise]);

      setSuccess(true);
      showSuccess('Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha.');
      trackEvent('forgot_password_requested', { email: maskEmail(email) });
    } catch (err: any) {
      // Tratar erro específico de email não cadastrado (apenas em DEV)
      const isEmailNotFound = err.response?.status === 404 && err.response?.data?.errorCode === 'EMAIL_NOT_FOUND';

      let errorMessage: string;
      if (isEmailNotFound) {
        errorMessage = 'E-mail não cadastrado. Verifique se digitou corretamente ou crie uma conta.';
      } else {
        errorMessage = err.message || 'Não foi possível enviar o email de redefinição. Tente novamente.';
      }

      showError(errorMessage);
      setErrors({ email: errorMessage });
      trackEvent('forgot_password_failed', { error: errorMessage });
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <PublicLayout maxWidth="md">
        <VStack spacing={6} align="stretch">
          <Heading size="lg" textAlign="center">
            Email Enviado!
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
              E-mail de redefinição enviado!
            </AlertTitle>
            <AlertDescription maxWidth="sm">
              Verifique sua caixa de entrada em <strong>{email}</strong>.
              Você receberá um link para redefinir sua senha.
            </AlertDescription>
          </Alert>

          <Text fontSize="sm" color="gray.600" textAlign="center">
            Não se esqueça de verificar a pasta de spam.
          </Text>

          <Button colorScheme="blue" onClick={() => navigate('/login')}>
            Voltar para Login
          </Button>
        </VStack>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout maxWidth="md">
      <VStack spacing={6} align="stretch">
        <Heading size="lg" textAlign="center">
          Esqueceu a Senha?
        </Heading>

        <Text fontSize="sm" color="gray.600" textAlign="center">
          Informe seu email cadastrado e enviaremos um link para redefinir sua senha.
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
            <FormControl isInvalid={!!errors.email} isRequired>
              <FormLabel>Email</FormLabel>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                size="lg"
              />
              {errors.email && <FormErrorMessage>{errors.email}</FormErrorMessage>}
            </FormControl>

            <Button
              type="submit"
              colorScheme="blue"
              size="lg"
              width="full"
              isLoading={loading}
              loadingText="Enviando..."
            >
              Enviar Link de Redefinição
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
