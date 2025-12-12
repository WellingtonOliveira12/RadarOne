import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import { ResetPasswordPage } from '../ResetPasswordPage';
import * as authService from '../../services/auth';

// Mock dos serviços
vi.mock('../../services/auth');
vi.mock('../../lib/toast');
vi.mock('../../lib/analytics');

const renderWithRouter = (initialRoute: string) => {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <ChakraProvider>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Routes>
      </ChakraProvider>
    </MemoryRouter>
  );
};

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve exibir erro quando não há token na URL', () => {
    renderWithRouter('/reset-password');

    expect(screen.getByText('Link inválido ou expirado')).toBeInTheDocument();
    expect(screen.getByText(/não é válido ou já foi usado/i)).toBeInTheDocument();
  });

  it('deve renderizar formulário com token válido', () => {
    renderWithRouter('/reset-password?token=valid-token-123');

    expect(screen.getByText('Redefinir Senha')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Mínimo 8 caracteres')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Digite a senha novamente')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /redefinir senha/i })).toBeInTheDocument();
  });

  it('deve validar senha mínima de 8 caracteres', async () => {
    renderWithRouter('/reset-password?token=valid-token-123');

    const passwordInput = screen.getByPlaceholderText('Mínimo 8 caracteres');
    const confirmInput = screen.getByPlaceholderText('Digite a senha novamente');
    const submitButton = screen.getByRole('button', { name: /redefinir senha/i });

    fireEvent.change(passwordInput, { target: { value: '1234567' } }); // 7 caracteres
    fireEvent.change(confirmInput, { target: { value: '1234567' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('A senha deve ter pelo menos 8 caracteres')).toBeInTheDocument();
    });
  });

  it('deve validar que as senhas coincidem', async () => {
    renderWithRouter('/reset-password?token=valid-token-123');

    const passwordInput = screen.getByPlaceholderText('Mínimo 8 caracteres');
    const confirmInput = screen.getByPlaceholderText('Digite a senha novamente');
    const submitButton = screen.getByRole('button', { name: /redefinir senha/i });

    fireEvent.change(passwordInput, { target: { value: 'senha12345' } });
    fireEvent.change(confirmInput, { target: { value: 'senha99999' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('As senhas não coincidem')).toBeInTheDocument();
    });
  });

  it('deve enviar requisição com dados válidos', async () => {
    const resetPasswordMock = vi.spyOn(authService, 'resetPassword').mockResolvedValue({});

    renderWithRouter('/reset-password?token=valid-token-123');

    const passwordInput = screen.getByPlaceholderText('Mínimo 8 caracteres');
    const confirmInput = screen.getByPlaceholderText('Digite a senha novamente');
    const submitButton = screen.getByRole('button', { name: /redefinir senha/i });

    fireEvent.change(passwordInput, { target: { value: 'novaSenha123' } });
    fireEvent.change(confirmInput, { target: { value: 'novaSenha123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(resetPasswordMock).toHaveBeenCalledWith({
        token: 'valid-token-123',
        password: 'novaSenha123',
      });
    });
  });

  it('deve exibir mensagem de sucesso após reset', async () => {
    vi.spyOn(authService, 'resetPassword').mockResolvedValue({});

    renderWithRouter('/reset-password?token=valid-token-123');

    const passwordInput = screen.getByPlaceholderText('Mínimo 8 caracteres');
    const confirmInput = screen.getByPlaceholderText('Digite a senha novamente');
    const submitButton = screen.getByRole('button', { name: /redefinir senha/i });

    fireEvent.change(passwordInput, { target: { value: 'novaSenha123' } });
    fireEvent.change(confirmInput, { target: { value: 'novaSenha123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Senha Redefinida!')).toBeInTheDocument();
      expect(screen.getByText(/senha redefinida com sucesso/i)).toBeInTheDocument();
    });
  });

  it('deve mostrar loading durante requisição', async () => {
    vi.spyOn(authService, 'resetPassword').mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    renderWithRouter('/reset-password?token=valid-token-123');

    const passwordInput = screen.getByPlaceholderText('Mínimo 8 caracteres');
    const confirmInput = screen.getByPlaceholderText('Digite a senha novamente');
    const submitButton = screen.getByRole('button', { name: /redefinir senha/i });

    fireEvent.change(passwordInput, { target: { value: 'novaSenha123' } });
    fireEvent.change(confirmInput, { target: { value: 'novaSenha123' } });
    fireEvent.click(submitButton);

    expect(screen.getByText('Redefinindo...')).toBeInTheDocument();
  });
});
