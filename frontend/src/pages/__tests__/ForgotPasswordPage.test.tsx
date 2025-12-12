import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import { ForgotPasswordPage } from '../ForgotPasswordPage';
import * as authService from '../../services/auth';

// Mock do serviço de auth
vi.mock('../../services/auth');
vi.mock('../../lib/toast');
vi.mock('../../lib/analytics');

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <ChakraProvider>{component}</ChakraProvider>
    </BrowserRouter>
  );
};

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve renderizar corretamente', () => {
    renderWithProviders(<ForgotPasswordPage />);

    expect(screen.getByText('Esqueceu a Senha?')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('seu@email.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enviar link/i })).toBeInTheDocument();
  });

  it('deve exibir erro para email inválido', async () => {
    renderWithProviders(<ForgotPasswordPage />);

    const emailInput = screen.getByPlaceholderText('seu@email.com');
    const submitButton = screen.getByRole('button', { name: /enviar link/i });

    fireEvent.change(emailInput, { target: { value: 'email-invalido' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Informe um e-mail válido')).toBeInTheDocument();
    });
  });

  it('deve enviar requisição com email válido', async () => {
    const forgotPasswordMock = vi.spyOn(authService, 'forgotPassword').mockResolvedValue({});

    renderWithProviders(<ForgotPasswordPage />);

    const emailInput = screen.getByPlaceholderText('seu@email.com');
    const submitButton = screen.getByRole('button', { name: /enviar link/i });

    fireEvent.change(emailInput, { target: { value: 'teste@example.com' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(forgotPasswordMock).toHaveBeenCalledWith('teste@example.com');
    });
  });

  it('deve exibir mensagem de sucesso após envio', async () => {
    vi.spyOn(authService, 'forgotPassword').mockResolvedValue({});

    renderWithProviders(<ForgotPasswordPage />);

    const emailInput = screen.getByPlaceholderText('seu@email.com');
    const submitButton = screen.getByRole('button', { name: /enviar link/i });

    fireEvent.change(emailInput, { target: { value: 'teste@example.com' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Email Enviado!')).toBeInTheDocument();
      expect(screen.getByText(/e-mail de redefinição enviado/i)).toBeInTheDocument();
    });
  });

  it('deve mostrar botão de loading durante requisição', async () => {
    vi.spyOn(authService, 'forgotPassword').mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    renderWithProviders(<ForgotPasswordPage />);

    const emailInput = screen.getByPlaceholderText('seu@email.com');
    const submitButton = screen.getByRole('button', { name: /enviar link/i });

    fireEvent.change(emailInput, { target: { value: 'teste@example.com' } });
    fireEvent.click(submitButton);

    expect(screen.getByText('Enviando...')).toBeInTheDocument();
  });
});
