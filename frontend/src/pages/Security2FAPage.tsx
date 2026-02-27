/**
 * FASE 4.4 - Página de Configuração de 2FA (Two-Factor Authentication)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Heading,
  Card,
  CardBody,
  VStack,
  HStack,
  Text,
  Button,
  Badge,
  Input,
  Image,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  useToast,
  Code,
  SimpleGrid,
  Divider,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
} from '@chakra-ui/react';
import { AdminLayout } from '../components/AdminLayout';
import { api } from '../services/api';

interface TwoFactorStatus {
  enabled: boolean;
  backupCodesRemaining: number;
}

interface TwoFactorSetup {
  secret: string;
  qrCode: string;
  backupCodes: string[];
  message: string;
}

export const Security2FAPage: React.FC = () => {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupData, setSetupData] = useState<TwoFactorSetup | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [backupPassword, setBackupPassword] = useState('');
  const [newBackupCodes, setNewBackupCodes] = useState<string[]>([]);

  const { isOpen: isDisableOpen, onOpen: onDisableOpen, onClose: onDisableClose } = useDisclosure();
  const { isOpen: isBackupOpen, onOpen: onBackupOpen, onClose: onBackupClose } = useDisclosure();

  const toast = useToast();

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.request<TwoFactorStatus>('/api/auth/2fa/status', {
        method: 'GET',
        skipAutoLogout: true,
      });
      setStatus(response);
    } catch (error: unknown) {
      console.error('Erro ao carregar status de 2FA:', error);
      const apiErr = error as { response?: { data?: { error?: string } } };
      toast({
        title: 'Erro',
        description: apiErr.response?.data?.error || 'Erro ao carregar status de 2FA',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleSetup2FA = async () => {
    try {
      const response = await api.request<TwoFactorSetup>('/api/auth/2fa/setup', {
        method: 'GET',
        skipAutoLogout: true,
      });
      setSetupData(response);
      toast({
        title: 'QR Code gerado',
        description: 'Escaneie o QR Code com seu aplicativo autenticador',
        status: 'info',
        duration: 3000,
        isClosable: true,
      });
    } catch (error: unknown) {
      const apiErr = error as { response?: { data?: { error?: string } } };
      toast({
        title: 'Erro',
        description: apiErr.response?.data?.error || 'Erro ao configurar 2FA',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const handleEnable2FA = async () => {
    if (!setupData || !verificationCode) {
      toast({
        title: 'Erro',
        description: 'Digite o código do aplicativo autenticador',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    try {
      await api.post('/api/auth/2fa/enable', {
        code: verificationCode,
        secret: setupData.secret,
        backupCodes: setupData.backupCodes,
      });

      toast({
        title: '2FA Ativado',
        description: '2FA habilitado com sucesso!',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      setSetupData(null);
      setVerificationCode('');
      await loadStatus();
    } catch (error: unknown) {
      const apiErr = error as { response?: { data?: { error?: string } } };
      toast({
        title: 'Erro',
        description: apiErr.response?.data?.error || 'Código inválido',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const handleDisable2FA = async () => {
    try {
      // Usar skipAutoLogout para evitar logout automático em caso de senha incorreta (401)
      await api.request('/api/auth/2fa/disable', {
        method: 'POST',
        body: { password: disablePassword },
        skipAutoLogout: true, // CRÍTICO: não fazer logout se senha estiver errada
      });

      toast({
        title: '2FA Desativado',
        description: '2FA foi desabilitado',
        status: 'info',
        duration: 3000,
        isClosable: true,
      });

      setDisablePassword('');
      onDisableClose();
      await loadStatus();
    } catch (error: unknown) {
      // Mostrar erro específico sem fazer logout
      const apiErr = error as { response?: { data?: { error?: string } }; data?: { error?: string }; message?: string };
      const errorMessage = apiErr.response?.data?.error ||
        apiErr.data?.error ||
        apiErr.message ||
        'Senha incorreta';

      toast({
        title: 'Erro',
        description: errorMessage,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const handleRegenerateBackupCodes = async () => {
    try {
      // Usar skipAutoLogout para evitar logout automático em caso de senha incorreta (401)
      const response = await api.request<{ backupCodes: string[] }>('/api/auth/2fa/backup-codes', {
        method: 'POST',
        body: { password: backupPassword },
        skipAutoLogout: true, // CRÍTICO: não fazer logout se senha estiver errada
      });

      setNewBackupCodes(response.backupCodes);
      setBackupPassword('');

      toast({
        title: 'Códigos Regenerados',
        description: 'Novos códigos de backup foram gerados. Salve-os em local seguro!',
        status: 'success',
        duration: 5000,
        isClosable: true,
      });

      await loadStatus();
    } catch (error: unknown) {
      // Mostrar erro específico sem fazer logout
      const apiErr = error as { response?: { data?: { error?: string } }; data?: { error?: string }; message?: string };
      const errorMessage = apiErr.response?.data?.error ||
        apiErr.data?.error ||
        apiErr.message ||
        'Senha incorreta';

      toast({
        title: 'Erro',
        description: errorMessage,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <Text>Carregando...</Text>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <VStack spacing={6} align="stretch">
        <Box>
          <Heading size="lg" mb={2}>
            Autenticação de Dois Fatores (2FA)
          </Heading>
          <Text color="gray.600">
            Adicione uma camada extra de segurança à sua conta
          </Text>
        </Box>

        {/* Status Card */}
        <Card>
          <CardBody>
            <HStack justify="space-between">
              <VStack align="start" spacing={2}>
                <Text fontWeight="bold">Status do 2FA</Text>
                <HStack>
                  <Badge colorScheme={status?.enabled ? 'green' : 'gray'} fontSize="md">
                    {status?.enabled ? 'Ativado' : 'Desativado'}
                  </Badge>
                  {status?.enabled && status.backupCodesRemaining > 0 && (
                    <Text fontSize="sm" color="gray.600">
                      {status.backupCodesRemaining} código(s) de backup restante(s)
                    </Text>
                  )}
                </HStack>
              </VStack>
              <HStack>
                {!status?.enabled ? (
                  <Button colorScheme="blue" onClick={handleSetup2FA}>
                    Ativar 2FA
                  </Button>
                ) : (
                  <>
                    <Button size="sm" onClick={onBackupOpen}>
                      Novos Códigos de Backup
                    </Button>
                    <Button size="sm" colorScheme="red" variant="outline" onClick={onDisableOpen}>
                      Desativar 2FA
                    </Button>
                  </>
                )}
              </HStack>
            </HStack>
          </CardBody>
        </Card>

        {/* Setup 2FA */}
        {setupData && (
          <Card>
            <CardBody>
              <VStack spacing={4} align="stretch">
                <Heading size="md">Configurar 2FA</Heading>

                <Alert status="info">
                  <AlertIcon />
                  <Box>
                    <AlertTitle>Passo 1: Escaneie o QR Code</AlertTitle>
                    <AlertDescription>
                      Use Google Authenticator, Authy ou outro aplicativo compatível
                    </AlertDescription>
                  </Box>
                </Alert>

                <Box textAlign="center">
                  <Image src={setupData.qrCode} alt="QR Code" mx="auto" maxW="300px" />
                </Box>

                <Divider />

                <Alert status="warning">
                  <AlertIcon />
                  <Box>
                    <AlertTitle>Códigos de Backup</AlertTitle>
                    <AlertDescription>
                      Salve estes códigos em local seguro. Você pode usá-los para fazer login se perder acesso ao aplicativo autenticador.
                    </AlertDescription>
                  </Box>
                </Alert>

                <SimpleGrid columns={{ base: 2, md: 3 }} spacing={2}>
                  {setupData.backupCodes.map((code, idx) => (
                    <Code key={idx} p={2} textAlign="center" fontWeight="bold">
                      {code}
                    </Code>
                  ))}
                </SimpleGrid>

                <Divider />

                <Alert status="info">
                  <AlertIcon />
                  <Box>
                    <AlertTitle>Passo 2: Digite o Código</AlertTitle>
                    <AlertDescription>
                      Digite o código de 6 dígitos do seu aplicativo autenticador
                    </AlertDescription>
                  </Box>
                </Alert>

                <Input
                  placeholder="000000"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  maxLength={6}
                  size="lg"
                  textAlign="center"
                  fontSize="2xl"
                />

                <HStack>
                  <Button colorScheme="green" onClick={handleEnable2FA} isDisabled={!verificationCode}>
                    Confirmar e Ativar 2FA
                  </Button>
                  <Button variant="ghost" onClick={() => setSetupData(null)}>
                    Cancelar
                  </Button>
                </HStack>
              </VStack>
            </CardBody>
          </Card>
        )}

        {/* Info */}
        {!setupData && (
          <Card>
            <CardBody>
              <VStack align="start" spacing={3}>
                <Heading size="sm">O que é 2FA?</Heading>
                <Text fontSize="sm" color="gray.600">
                  A Autenticação de Dois Fatores (2FA) adiciona uma camada extra de segurança à sua conta.
                  Além da senha, você precisará de um código temporário gerado por um aplicativo autenticador.
                </Text>
                <Text fontSize="sm" color="gray.600">
                  Recomendamos aplicativos como: Google Authenticator, Authy, Microsoft Authenticator
                </Text>
              </VStack>
            </CardBody>
          </Card>
        )}
      </VStack>

      {/* Modal Desativar 2FA */}
      <Modal isOpen={isDisableOpen} onClose={onDisableClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Desativar 2FA</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <Alert status="warning">
                <AlertIcon />
                <Text fontSize="sm">Digite sua senha para desativar o 2FA</Text>
              </Alert>
              <Input
                type="password"
                placeholder="Sua senha"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
              />
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onDisableClose}>
              Cancelar
            </Button>
            <Button colorScheme="red" onClick={handleDisable2FA} isDisabled={!disablePassword}>
              Desativar 2FA
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal Regenerar Backup Codes */}
      <Modal isOpen={isBackupOpen} onClose={() => { onBackupClose(); setNewBackupCodes([]); }}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Gerar Novos Códigos de Backup</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              {newBackupCodes.length === 0 ? (
                <>
                  <Alert status="info">
                    <AlertIcon />
                    <Text fontSize="sm">Digite sua senha para gerar novos códigos de backup</Text>
                  </Alert>
                  <Input
                    type="password"
                    placeholder="Sua senha"
                    value={backupPassword}
                    onChange={(e) => setBackupPassword(e.target.value)}
                  />
                </>
              ) : (
                <>
                  <Alert status="success">
                    <AlertIcon />
                    <Box>
                      <AlertTitle>Códigos Gerados!</AlertTitle>
                      <AlertDescription>Salve estes códigos em local seguro</AlertDescription>
                    </Box>
                  </Alert>
                  <SimpleGrid columns={2} spacing={2}>
                    {newBackupCodes.map((code, idx) => (
                      <Code key={idx} p={2} textAlign="center" fontWeight="bold">
                        {code}
                      </Code>
                    ))}
                  </SimpleGrid>
                </>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            {newBackupCodes.length === 0 ? (
              <>
                <Button variant="ghost" mr={3} onClick={onBackupClose}>
                  Cancelar
                </Button>
                <Button colorScheme="blue" onClick={handleRegenerateBackupCodes} isDisabled={!backupPassword}>
                  Gerar Códigos
                </Button>
              </>
            ) : (
              <Button colorScheme="green" onClick={() => { onBackupClose(); setNewBackupCodes([]); }}>
                Fechar
              </Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </AdminLayout>
  );
};
