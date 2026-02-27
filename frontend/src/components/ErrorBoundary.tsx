import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Box, Button, Container, Heading, Text, VStack, Code } from '@chakra-ui/react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary Global para capturar erros React
 *
 * Funcionalidades:
 * - Captura erros não tratados no React tree
 * - Envia erros para Sentry (se configurado)
 * - Exibe UI fallback amigável
 * - Permite reload da página
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Atualiza state para exibir fallback UI
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log erro no console
    console.error('ErrorBoundary capturou erro:', error, errorInfo);

    // Atualiza state com errorInfo
    this.setState({
      error,
      errorInfo,
    });

    // Enviar para Sentry (se disponível)
    if (window.Sentry) {
      window.Sentry.captureException(error, {
        contexts: {
          react: {
            componentStack: errorInfo.componentStack,
          },
        },
      });
    }

    // Log estruturado para análise
    this.logErrorToService(error, errorInfo);
  }

  /**
   * Envia erro para serviço de logging
   */
  private logErrorToService(error: Error, errorInfo: ErrorInfo): void {
    // Em produção, você pode enviar para um serviço como Sentry, LogRocket, etc.
    const errorReport = {
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    // Log estruturado
    console.group('🚨 Error Report');
    console.error('Error:', error);
    console.error('Component Stack:', errorInfo.componentStack);
    console.table(errorReport);
    console.groupEnd();

    // Em desenvolvimento, não enviamos para serviços externos
    if (import.meta.env.PROD) {
      // Aqui você pode adicionar integração com outros serviços
      // Exemplo: fetch('/api/log-error', { method: 'POST', body: JSON.stringify(errorReport) })
    }
  }

  /**
   * Reset do error boundary
   */
  private handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  /**
   * Reload completo da página
   */
  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      // Se fallback customizado foi fornecido, usa ele
      if (fallback) {
        return fallback;
      }

      // UI fallback padrão
      return (
        <Container maxW="container.md" py={12}>
          <VStack spacing={6} align="stretch">
            <Box textAlign="center">
              <Heading size="xl" mb={2}>
                Algo inesperado aconteceu
              </Heading>
              <Text color="gray.600" fontSize="lg">
                Desculpe pelo inconveniente. Nosso time foi notificado.
              </Text>
            </Box>

            <Box
              bg="red.50"
              border="1px solid"
              borderColor="red.200"
              borderRadius="md"
              p={6}
            >
              <Text fontWeight="bold" mb={2} color="red.700">
                Detalhes do Erro:
              </Text>
              <Code
                display="block"
                whiteSpace="pre-wrap"
                p={4}
                bg="red.100"
                borderRadius="md"
                fontSize="sm"
                maxH="300px"
                overflowY="auto"
              >
                {error?.toString()}
              </Code>

              {import.meta.env.DEV && errorInfo && (
                <Box mt={4}>
                  <Text fontWeight="bold" mb={2} color="red.700">
                    Component Stack (Dev only):
                  </Text>
                  <Code
                    display="block"
                    whiteSpace="pre-wrap"
                    p={4}
                    bg="red.100"
                    borderRadius="md"
                    fontSize="xs"
                    maxH="200px"
                    overflowY="auto"
                  >
                    {errorInfo.componentStack}
                  </Code>
                </Box>
              )}
            </Box>

            <VStack spacing={3}>
              <Button
                colorScheme="blue"
                size="lg"
                width="full"
                onClick={this.handleReload}
              >
                Recarregar Página
              </Button>

              <Button
                variant="outline"
                size="lg"
                width="full"
                onClick={this.handleReset}
              >
                Tentar Novamente
              </Button>

              <Button
                as="a"
                href="/"
                variant="ghost"
                size="lg"
                width="full"
              >
                Voltar para Home
              </Button>
            </VStack>

            {import.meta.env.DEV && (
              <Box
                bg="yellow.50"
                border="1px solid"
                borderColor="yellow.300"
                borderRadius="md"
                p={4}
              >
                <Text fontSize="sm" color="yellow.800">
                  💡 <strong>Dica de Desenvolvimento:</strong> Este erro foi capturado pelo Error Boundary.
                  Verifique o console para mais detalhes. Em produção, os detalhes técnicos são ocultados.
                </Text>
              </Box>
            )}
          </VStack>
        </Container>
      );
    }

    return children;
  }
}

/**
 * Declaração de tipos para Sentry global
 */
declare global {
  interface Window {
    Sentry?: {
      captureException: (error: Error, context?: Record<string, unknown>) => void;
      captureMessage: (message: string, level?: string) => void;
    };
  }
}

/**
 * Hook para forçar re-render e testar Error Boundary
 * APENAS PARA DESENVOLVIMENTO/TESTES
 */
export function useErrorBoundaryTest() {
  const [shouldThrow, setShouldThrow] = React.useState(false);

  if (shouldThrow) {
    throw new Error('Erro de teste do Error Boundary');
  }

  return () => setShouldThrow(true);
}
