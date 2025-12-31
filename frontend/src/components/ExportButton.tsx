/**
 * FASE 4.3 - Componente de Exportação CSV
 * Botão reutilizável para exportar dados em CSV
 */

import React, { useState } from 'react';
import { Button, useToast } from '@chakra-ui/react';
import { DownloadIcon } from '@chakra-ui/icons';

interface ExportButtonProps {
  endpoint: string;
  queryParams?: Record<string, string | number | boolean | undefined>;
  label?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  variant?: string;
  colorScheme?: string;
}

/**
 * Componente de botão para exportar dados em CSV
 *
 * @param endpoint - URL do endpoint de exportação (ex: '/api/admin/users/export')
 * @param queryParams - Query parameters para filtrar exportação
 * @param label - Texto do botão (padrão: 'Exportar CSV')
 */
export const ExportButton: React.FC<ExportButtonProps> = ({
  endpoint,
  queryParams = {},
  label = 'Exportar CSV',
  size = 'sm',
  variant = 'outline',
  colorScheme = 'blue',
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const toast = useToast();

  const handleExport = async () => {
    try {
      setIsExporting(true);

      // Construir query string
      const params = new URLSearchParams();
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          params.append(key, String(value));
        }
      });

      const queryString = params.toString();
      const url = queryString ? `${endpoint}?${queryString}` : endpoint;

      // Fazer request
      const token = localStorage.getItem('token');
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao exportar dados');
      }

      // Obter nome do arquivo do header Content-Disposition
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="?(.+)"?/);
      const filename = filenameMatch ? filenameMatch[1] : 'export.csv';

      // Criar blob e download
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      toast({
        title: 'Exportação concluída',
        description: `Arquivo ${filename} foi baixado com sucesso`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error: any) {
      console.error('Erro ao exportar:', error);
      toast({
        title: 'Erro ao exportar',
        description: error.message || 'Não foi possível exportar os dados',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      leftIcon={<DownloadIcon />}
      onClick={handleExport}
      isLoading={isExporting}
      loadingText="Exportando..."
      size={size}
      variant={variant}
      colorScheme={colorScheme}
    >
      {label}
    </Button>
  );
};
