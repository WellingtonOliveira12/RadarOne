import React from 'react';
import { Heading, VStack, Alert, AlertIcon, AlertTitle, AlertDescription, Box, Text, Card, CardBody } from '@chakra-ui/react';
import { AdminLayout } from '../components/AdminLayout';

export const AdminCouponsPage: React.FC = () => {
  return (
    <AdminLayout>
      <VStack spacing={6} align="stretch">
        <Box>
          <Heading size="lg" mb={2}>Cupons de Desconto</Heading>
          <Text color="gray.600">Gerenciar cupons promocionais e descontos</Text>
        </Box>

        <Card>
          <CardBody>
            <Alert status="info" variant="subtle" borderRadius="md">
              <AlertIcon />
              <Box>
                <AlertTitle mb={1}>Interface de Gestão em Desenvolvimento</AlertTitle>
                <AlertDescription fontSize="sm">
                  A interface para criar e gerenciar cupons através do painel admin está em desenvolvimento.
                  <br /><br />
                  <strong>Enquanto isso:</strong>
                  <br />
                  • Cupons podem ser criados diretamente no banco de dados (tabela <code>coupons</code>)
                  <br />
                  • Para criar cupons programaticamente, utilize os serviços do backend
                  <br />
                  • Esta funcionalidade será priorizada na próxima sprint
                </AlertDescription>
              </Box>
            </Alert>
          </CardBody>
        </Card>
      </VStack>
    </AdminLayout>
  );
};
