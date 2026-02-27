import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import ConnectionsPage, { validateAndNormalizeSessionFile, PROVIDER_CONFIGS } from '../ConnectionsPage';

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

const mockSessionsSuccess = () => {
  (api.requestWithRetry as ReturnType<typeof vi.fn>).mockResolvedValue({
    success: true,
    sessions: [],
    supportedSites: [
      { id: 'MERCADO_LIVRE', name: 'Mercado Livre', domains: ['mercadolivre.com.br'] },
      { id: 'FACEBOOK_MARKETPLACE', name: 'Facebook Marketplace', domains: ['facebook.com'] },
    ],
  });
};

describe('ConnectionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza título e card do Mercado Livre quando API retorna dados', async () => {
    mockSessionsSuccess();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Conexões')).toBeInTheDocument();
    });
    expect(screen.getByText('Mercado Livre')).toBeInTheDocument();
    expect(screen.getByText('Facebook Marketplace')).toBeInTheDocument();
  });

  it('renderiza cards via fallback quando API falha', async () => {
    (api.requestWithRetry as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Conexões')).toBeInTheDocument();
    });
    expect(screen.getByText('Mercado Livre')).toBeInTheDocument();
    expect(screen.getByText('Facebook Marketplace')).toBeInTheDocument();
    expect(screen.getByText('Erro ao carregar conexões')).toBeInTheDocument();
    expect(screen.getByText('Tentar novamente')).toBeInTheDocument();
  });

  it('mostra spinner durante loading', () => {
    (api.requestWithRetry as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(document.querySelector('.chakra-spinner')).toBeTruthy();
    expect(screen.queryByText('Conexões')).not.toBeInTheDocument();
  });

  it('abre wizard modal ao clicar "Conectar conta"', async () => {
    mockSessionsSuccess();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Mercado Livre')).toBeInTheDocument();
    });

    // Click first "Conectar conta" (ML)
    const connectButtons = screen.getAllByText('Conectar conta');
    fireEvent.click(connectButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Conectar conta .+ Mercado Livre/)).toBeInTheDocument();
    });
    // Wizard shows tabs
    expect(screen.getByTestId('tab-automatico')).toBeInTheDocument();
    expect(screen.getByTestId('tab-extensao')).toBeInTheDocument();
  });

  it('wizard mostra comando Playwright com botão copiar', async () => {
    mockSessionsSuccess();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Mercado Livre')).toBeInTheDocument();
    });

    const connectButtons = screen.getAllByText('Conectar conta');
    fireEvent.click(connectButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId('playwright-command')).toBeInTheDocument();
    });
    expect(screen.getByTestId('copy-command-btn')).toBeInTheDocument();
    expect(screen.getByText('Copiar')).toBeInTheDocument();
  });

  it('wizard mostra zona de upload', async () => {
    mockSessionsSuccess();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Mercado Livre')).toBeInTheDocument();
    });

    const connectButtons = screen.getAllByText('Conectar conta');
    fireEvent.click(connectButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Enviar Arquivo de Sessão')).toBeInTheDocument();
    });
    expect(screen.getByText(/Arraste o arquivo .json/)).toBeInTheDocument();
  });

  it('wizard mostra aviso de servidor quando fetchError existe', async () => {
    (api.requestWithRetry as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Mercado Livre')).toBeInTheDocument();
    });

    const connectButtons = screen.getAllByText('Conectar conta');
    fireEvent.click(connectButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId('server-warning')).toBeInTheDocument();
    });
    expect(screen.getByText('Servidor iniciando')).toBeInTheDocument();
  });

  it('wizard submit button is disabled without file', async () => {
    mockSessionsSuccess();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Mercado Livre')).toBeInTheDocument();
    });

    const connectButtons = screen.getAllByText('Conectar conta');
    fireEvent.click(connectButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId('submit-upload-btn')).toBeInTheDocument();
    });

    // Button should be disabled without a file
    expect(screen.getByTestId('submit-upload-btn')).toBeDisabled();
  });

  it('mostra alerta de sessão expirada com botão de login quando API retorna 401', async () => {
    const error401 = new Error('Não autenticado') as Error & { status: number; errorCode: string };
    error401.status = 401;
    error401.errorCode = 'INVALID_TOKEN';
    (api.requestWithRetry as ReturnType<typeof vi.fn>).mockRejectedValue(error401);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Sessão expirada')).toBeInTheDocument();
    });
    expect(screen.getByText(/sessão do RadarOne expirou/i)).toBeInTheDocument();
    expect(screen.getByText('Fazer login')).toBeInTheDocument();
  });

  it('não tem link hardcoded para Chrome Web Store', async () => {
    mockSessionsSuccess();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Mercado Livre')).toBeInTheDocument();
    });

    // Open wizard
    const connectButtons = screen.getAllByText('Conectar conta');
    fireEvent.click(connectButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId('tab-extensao')).toBeInTheDocument();
    });

    // No hardcoded extension links anywhere in the document
    const allLinks = document.querySelectorAll('a[href*="chrome.google.com/webstore"]');
    expect(allLinks.length).toBe(0);
  });
});

// ============================================================
// VALIDAÇÃO POR PROVIDER
// ============================================================

describe('validateAndNormalizeSessionFile', () => {
  const ML = PROVIDER_CONFIGS.MERCADO_LIVRE;
  const FB = PROVIDER_CONFIGS.FACEBOOK_MARKETPLACE;

  // ------ Testes genéricos (sem provider = fallback ML) ------

  it('rejeita JSON inválido', () => {
    const result = validateAndNormalizeSessionFile('not json');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('JSON válido');
  });

  it('rejeita array vazio', () => {
    const result = validateAndNormalizeSessionFile('[]');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('vazio');
  });

  it('rejeita storageState com cookies vazio', () => {
    const result = validateAndNormalizeSessionFile(JSON.stringify({ cookies: [], origins: [] }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Nenhum cookie');
  });

  // ------ Mercado Livre ------

  describe('Mercado Livre', () => {
    it('aceita storageState Playwright válido com cookies do ML', () => {
      const storageState = JSON.stringify({
        cookies: [{ domain: '.mercadolivre.com.br', name: 'sid', value: 'abc' }],
        origins: [],
      });
      const result = validateAndNormalizeSessionFile(
        storageState, ML.requiredDomains, ML.displayName, ML.loginUrl,
      );
      expect(result.valid).toBe(true);
      expect(result.cookiesCount).toBe(1);
      expect(result.normalized).toBeTruthy();
    });

    it('aceita cookie dump (array puro) do ML e normaliza', () => {
      const cookies = JSON.stringify([
        { domain: '.mercadolivre.com.br', name: 'sid', value: 'abc' },
      ]);
      const result = validateAndNormalizeSessionFile(
        cookies, ML.requiredDomains, ML.displayName, ML.loginUrl,
      );
      expect(result.valid).toBe(true);
      expect(result.cookiesCount).toBe(1);
      const parsed = JSON.parse(result.normalized!);
      expect(parsed.cookies).toHaveLength(1);
      expect(parsed.origins).toEqual([]);
    });

    it('aceita cookies do mercadolibre.com (variante espanhol)', () => {
      const storageState = JSON.stringify({
        cookies: [{ domain: '.mercadolibre.com', name: 'sid', value: 'abc' }],
        origins: [],
      });
      const result = validateAndNormalizeSessionFile(
        storageState, ML.requiredDomains, ML.displayName, ML.loginUrl,
      );
      expect(result.valid).toBe(true);
    });

    it('rejeita cookies do Facebook no contexto do ML', () => {
      const storageState = JSON.stringify({
        cookies: [{ domain: '.facebook.com', name: 'c_user', value: '123' }],
        origins: [],
      });
      const result = validateAndNormalizeSessionFile(
        storageState, ML.requiredDomains, ML.displayName, ML.loginUrl,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Mercado Livre');
      expect(result.error).toContain('mercadolivre.com.br');
    });

    it('rejeita storageState sem cookies do ML (domain genérico)', () => {
      const storageState = JSON.stringify({
        cookies: [{ domain: '.google.com', name: 'NID', value: 'xyz' }],
        origins: [],
      });
      const result = validateAndNormalizeSessionFile(
        storageState, ML.requiredDomains, ML.displayName, ML.loginUrl,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Mercado Livre');
    });

    it('tolera storageState sem origins (adiciona vazio)', () => {
      const storageState = JSON.stringify({
        cookies: [{ domain: '.mercadolivre.com.br', name: 'sid', value: 'abc' }],
      });
      const result = validateAndNormalizeSessionFile(
        storageState, ML.requiredDomains, ML.displayName, ML.loginUrl,
      );
      expect(result.valid).toBe(true);
      const parsed = JSON.parse(result.normalized!);
      expect(parsed.origins).toEqual([]);
    });
  });

  // ------ Facebook Marketplace ------

  describe('Facebook Marketplace', () => {
    it('aceita storageState com cookies do Facebook', () => {
      const storageState = JSON.stringify({
        cookies: [
          { domain: '.facebook.com', name: 'c_user', value: '100001' },
          { domain: '.facebook.com', name: 'xs', value: 'token123' },
        ],
        origins: [],
      });
      const result = validateAndNormalizeSessionFile(
        storageState, FB.requiredDomains, FB.displayName, FB.loginUrl,
      );
      expect(result.valid).toBe(true);
      expect(result.cookiesCount).toBe(2);
    });

    it('aceita cookie dump (array) do Facebook', () => {
      const cookies = JSON.stringify([
        { domain: '.facebook.com', name: 'c_user', value: '100001' },
      ]);
      const result = validateAndNormalizeSessionFile(
        cookies, FB.requiredDomains, FB.displayName, FB.loginUrl,
      );
      expect(result.valid).toBe(true);
      expect(result.cookiesCount).toBe(1);
      const parsed = JSON.parse(result.normalized!);
      expect(parsed.cookies).toHaveLength(1);
      expect(parsed.origins).toEqual([]);
    });

    it('aceita www.facebook.com como domínio válido', () => {
      const storageState = JSON.stringify({
        cookies: [{ domain: 'www.facebook.com', name: 'c_user', value: '100001' }],
        origins: [],
      });
      const result = validateAndNormalizeSessionFile(
        storageState, FB.requiredDomains, FB.displayName, FB.loginUrl,
      );
      expect(result.valid).toBe(true);
    });

    it('rejeita cookies do ML no contexto do Facebook', () => {
      const storageState = JSON.stringify({
        cookies: [{ domain: '.mercadolivre.com.br', name: 'sid', value: 'abc' }],
        origins: [],
      });
      const result = validateAndNormalizeSessionFile(
        storageState, FB.requiredDomains, FB.displayName, FB.loginUrl,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Facebook Marketplace');
      expect(result.error).toContain('facebook.com');
    });

    it('rejeita cookies genéricos no contexto do Facebook', () => {
      const storageState = JSON.stringify({
        cookies: [{ domain: '.google.com', name: 'NID', value: 'xyz' }],
        origins: [],
      });
      const result = validateAndNormalizeSessionFile(
        storageState, FB.requiredDomains, FB.displayName, FB.loginUrl,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Facebook Marketplace');
    });

    it('rejeita array vazio no contexto do Facebook', () => {
      const result = validateAndNormalizeSessionFile(
        '[]', FB.requiredDomains, FB.displayName, FB.loginUrl,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Facebook Marketplace');
    });
  });

  // ------ Compatibilidade: sem params = fallback ML ------

  describe('Compatibilidade (sem provider params)', () => {
    it('aceita cookies do ML quando chamado sem params (backward compat)', () => {
      const storageState = JSON.stringify({
        cookies: [{ domain: '.mercadolivre.com.br', name: 'sid', value: 'abc' }],
        origins: [],
      });
      const result = validateAndNormalizeSessionFile(storageState);
      expect(result.valid).toBe(true);
    });

    it('rejeita cookies do Facebook quando chamado sem params (default = ML)', () => {
      const storageState = JSON.stringify({
        cookies: [{ domain: '.facebook.com', name: 'c_user', value: '123' }],
        origins: [],
      });
      const result = validateAndNormalizeSessionFile(storageState);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Mercado Livre');
    });
  });
});
