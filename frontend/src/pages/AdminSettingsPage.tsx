import React, { useEffect, useState } from 'react';
import {
  Box,
  Heading,
  Card,
  CardBody,
  VStack,
  Alert,
  AlertIcon,
  Text,
  Spinner,
  Center,
  AlertDescription,
  AlertTitle,
} from '@chakra-ui/react';
import { AdminLayout } from '../components/AdminLayout';
import { api } from '../services/api';

interface SystemSetting {
  id: string;
  key: string;
  value: string;
  type: string;
  description: string | null;
  category: string;
  isPublic: boolean;
  updatedBy: string | null;
  updatedAt: string;
  createdAt: string;
}

interface SettingsResponse {
  settings: SystemSetting[];
}

export const AdminSettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get<SettingsResponse>('/api/admin/settings');
      setSettings(response.settings);
    } catch (err: any) {
      console.error('Erro ao carregar configurações:', err);
      setError(err.response?.data?.error || 'Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <Center h="400px">
          <Spinner size="xl" color="blue.500" />
        </Center>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <Alert status="error">
          <AlertIcon />
          <AlertTitle>Erro!</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <VStack spacing={6} align="stretch">
        <Box>
          <Heading size="lg" mb={2}>
            Configurações do Sistema
          </Heading>
          <Text color="gray.600">
            Gerenciar configurações globais do RadarOne
          </Text>
        </Box>

        {settings.length === 0 ? (
          <Alert status="info">
            <AlertIcon />
            <AlertTitle>Nenhuma configuração cadastrada</AlertTitle>
            <AlertDescription>
              As configurações do sistema serão criadas automaticamente conforme necessário.
            </AlertDescription>
          </Alert>
        ) : (
          <Card>
            <CardBody>
              <VStack spacing={4} align="stretch">
                {settings.map((setting) => (
                  <Box
                    key={setting.id}
                    p={4}
                    borderWidth="1px"
                    borderRadius="md"
                    bg="gray.50"
                  >
                    <Text fontWeight="bold" mb={1}>
                      {setting.key}
                    </Text>
                    <Text fontSize="sm" color="gray.600" mb={2}>
                      {setting.description || 'Sem descrição'}
                    </Text>
                    <Text fontSize="sm">
                      <strong>Valor:</strong> {setting.value}
                    </Text>
                    <Text fontSize="xs" color="gray.500" mt={2}>
                      Categoria: {setting.category} • Atualizado em:{' '}
                      {new Date(setting.updatedAt).toLocaleString('pt-BR')}
                    </Text>
                  </Box>
                ))}
              </VStack>
            </CardBody>
          </Card>
        )}

        <Alert status="warning">
          <AlertIcon />
          <Box>
            <AlertTitle>Funcionalidade em Desenvolvimento</AlertTitle>
            <AlertDescription>
              A edição de configurações via interface será implementada em breve.
              Por enquanto, as configurações são gerenciadas automaticamente pelo sistema.
            </AlertDescription>
          </Box>
        </Alert>
      </VStack>
    </AdminLayout>
  );
};
