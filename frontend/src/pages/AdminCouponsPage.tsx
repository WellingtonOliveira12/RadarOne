import React from 'react';
import { Heading, VStack, Alert, AlertIcon, AlertTitle, AlertDescription } from '@chakra-ui/react';
import { AdminLayout } from '../components/AdminLayout';

export const AdminCouponsPage: React.FC = () => {
  return (
    <AdminLayout>
      <VStack spacing={6} align="stretch">
        <Heading size="lg">Cupons</Heading>
        <Alert status="info">
          <AlertIcon />
          <AlertTitle>Funcionalidade em Desenvolvimento</AlertTitle>
          <AlertDescription>
            A gestão de cupons será implementada em breve. Por enquanto, cupons são gerenciados diretamente no banco de dados.
          </AlertDescription>
        </Alert>
      </VStack>
    </AdminLayout>
  );
};
