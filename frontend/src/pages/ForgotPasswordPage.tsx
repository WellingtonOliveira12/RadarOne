import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
    } catch (err: unknown) {
      const validationErrors: Record<string, string> = {};
      if (err instanceof Error && 'errors' in err) {
        (err as { errors: { path: string[]; message: string }[] }).errors?.forEach((error) => {
          validationErrors[error.path[0]] = error.message;
        });
      }
      setErrors(validationErrors);
      setLoading(false);
      return;
    }

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(t('auth.forgotTimeout'))), 30000)
      );

      await Promise.race([forgotPassword(email), timeoutPromise]);

      setSuccess(true);
      showSuccess(t('auth.forgotSuccess'));
      trackEvent('forgot_password_requested', { email: maskEmail(email) });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { errorCode?: string } }; message?: string };
      const isEmailNotFound = axiosErr.response?.status === 404 && axiosErr.response?.data?.errorCode === 'EMAIL_NOT_FOUND';

      let errorMessage: string;
      if (isEmailNotFound) {
        errorMessage = t('auth.forgotEmailNotFound');
      } else {
        errorMessage = axiosErr.message || t('auth.forgotGenericError');
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
      <PublicLayout maxWidth="container.xl">
        <VStack spacing={6} align="stretch">
          <Heading size="lg" textAlign="center">
            {t('auth.forgotSuccessTitle')}
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
              {t('auth.forgotSuccessAlert')}
            </AlertTitle>
            <AlertDescription maxWidth="sm">
              {t('auth.forgotSuccessMessage')} <strong>{email}</strong>.
              {' '}{t('auth.forgotSuccessHint')}
            </AlertDescription>
          </Alert>

          <Text fontSize="sm" color="gray.600" textAlign="center">
            {t('auth.forgotCheckSpam')}
          </Text>

          <Button colorScheme="blue" onClick={() => navigate('/login')}>
            {t('auth.forgotBackToLogin')}
          </Button>
        </VStack>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout maxWidth="md">
      <VStack spacing={6} align="stretch">
        <Heading size="lg" textAlign="center">
          {t('auth.forgotTitle')}
        </Heading>

        <Text fontSize="sm" color="gray.600" textAlign="center">
          {t('auth.forgotSubtitle')}
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
              <FormLabel>{t('auth.email')}</FormLabel>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder')}
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
              loadingText={t('auth.forgotSubmitting')}
            >
              {t('auth.forgotSubmit')}
            </Button>
          </VStack>
        </Box>

        <Text fontSize="sm" textAlign="center">
          <ChakraLink color="blue.500" href="/login">
            ← {t('auth.forgotBackToLogin')}
          </ChakraLink>
        </Text>
      </VStack>
    </PublicLayout>
  );
}
