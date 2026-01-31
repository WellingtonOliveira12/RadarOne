import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import ConnectionsPage from '../ConnectionsPage';

// Mock api module
vi.mock('../../services/api', () => ({
  api: {
    requestWithRetry: vi.fn(),
    request: vi.fn(),
  },
}));
vi.mock('../../lib/analytics');

import { api } from '../../services/api';

const renderPage = () =>
  render(
    <BrowserRouter>
      <ChakraProvider>
        <ConnectionsPage />
      </ChakraProvider>
    </BrowserRouter>
  );

describe('ConnectionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza título e card do Mercado Livre quando API retorna dados', async () => {
    (api.requestWithRetry as any).mockResolvedValue({
      success: true,
      sessions: [],
      supportedSites: [
        { id: 'MERCADO_LIVRE', name: 'Mercado Livre', domains: ['mercadolivre.com.br'] },
      ],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Conexões')).toBeInTheDocument();
    });
    expect(screen.getByText('Mercado Livre')).toBeInTheDocument();
    expect(screen.getByText('Conectar conta')).toBeInTheDocument();
  });

  it('renderiza card do Mercado Livre via fallback quando API falha', async () => {
    (api.requestWithRetry as any).mockRejectedValue(new Error('Network error'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Conexões')).toBeInTheDocument();
    });
    // Fallback garante que o card aparece mesmo com erro
    expect(screen.getByText('Mercado Livre')).toBeInTheDocument();
    expect(screen.getByText('Conectar conta')).toBeInTheDocument();
    // Erro persistente visível na página
    expect(screen.getByText('Erro ao carregar conexões')).toBeInTheDocument();
    expect(screen.getByText('Tentar novamente')).toBeInTheDocument();
  });

  it('mostra spinner durante loading', () => {
    (api.requestWithRetry as any).mockReturnValue(new Promise(() => {})); // never resolves

    renderPage();

    // Spinner is rendered while loading (Chakra Spinner has role="status")
    expect(document.querySelector('.chakra-spinner')).toBeTruthy();
    // Page content not yet visible
    expect(screen.queryByText('Conexões')).not.toBeInTheDocument();
  });
});
