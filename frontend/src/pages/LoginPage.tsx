import { useState, type FormEvent } from 'react';
import {
  Box,
  Button,
  Container,
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
import { login } from '../services/auth';
import { saveToken } from '../services/tokenStorage';
import { showSuccess, showError } from '../lib/toast';

export function LoginPage() {
  const [email, setEmail] = useState('well+radarone@test.com');
  const [password, setPassword] = useState('senha123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userName, setUserName] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setUserName('');

    try {
      const data = await login(email, password);
      saveToken(data.token);
      setUserName(data.user.name);
      showSuccess(`Bem-vindo, ${data.user.name}!`);
    } catch (err: any) {
      const errorMessage = err.message || 'Erro ao fazer login';
      setError(errorMessage);
      showError(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Container maxW="md" py={12}>
      <VStack spacing={6} align="stretch">
        <Heading size="lg" textAlign="center">
          Login RadarOne
        </Heading>

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
              Entrar
            </Button>

            <Text fontSize="sm" textAlign="center">
              <ChakraLink color="blue.500" href="/forgot-password">
                Esqueceu a senha?
              </ChakraLink>
            </Text>
          </VStack>
        </Box>

        {userName && (
          <Alert status="success" borderRadius="md">
            <AlertIcon />
            <AlertDescription>Logado como: {userName}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert status="error" borderRadius="md">
            <AlertIcon />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </VStack>
    </Container>
  );
}
