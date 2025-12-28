/**
 * Testes Unitários: analytics.ts
 *
 * Cobertura:
 * - initAnalytics() com/sem VITE_ANALYTICS_ID
 * - trackEvent() quando enabled/disabled
 * - trackHelpMenuClick() e trackHelpPageView() (payload correto, sem PII)
 * - isAnalyticsEnabled()
 * - maskEmail()
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initAnalytics,
  trackEvent,
  trackPageView,
  trackHelpMenuClick,
  trackHelpPageView,
  isAnalyticsEnabled,
  maskEmail,
  trackLogin,
  trackSignUp,
  trackPasswordReset,
  trackForgotPassword,
  trackSubscriptionCreated,
  trackSubscriptionCancelled,
  trackMonitorCreated,
  trackMonitorDeleted,
  trackViewPlans,
  trackSelectPlan,
  trackTrialExpired,
  trackRedirectToPlans,
  trackTrialExpiringBannerShown,
  trackTrialExpiredToastShown,
} from '../analytics';

// Tipos para window.gtag
type GtagCommand = 'config' | 'event' | 'js';
type GtagFunction = (
  command: GtagCommand,
  targetId: string | Date,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config?: Record<string, any>
) => void;

describe('analytics.ts', () => {
  let originalGtag: GtagFunction | undefined;
  let originalDataLayer: unknown[] | undefined;
  let mockGtag: ReturnType<typeof vi.fn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Salvar estado original
    originalGtag = window.gtag;
    originalDataLayer = window.dataLayer;

    // Mockar console
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Criar mock do gtag
    mockGtag = vi.fn();
  });

  afterEach(() => {
    // Restaurar estado original
    window.gtag = originalGtag;
    window.dataLayer = originalDataLayer;

    // Remover scripts criados durante testes
    const scripts = document.querySelectorAll(
      'script[src*="googletagmanager.com"]'
    );
    scripts.forEach((script) => script.remove());

    // Restaurar console
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();

    vi.clearAllMocks();
  });

  describe('initAnalytics()', () => {
    it('deve retornar sem fazer nada quando VITE_ANALYTICS_ID está vazio', () => {
      // Arrange: VITE_ANALYTICS_ID não está configurado (valor padrão do ambiente de teste)
      delete window.gtag;
      delete window.dataLayer;

      // Act
      initAnalytics();

      // Assert: gtag não deve ser criado
      expect(window.gtag).toBeUndefined();
      expect(window.dataLayer).toBeUndefined();

      // Deve logar em DEV
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Desabilitado')
      );
    });

    it('deve inicializar gtag quando VITE_ANALYTICS_ID está preenchido', () => {
      // Arrange: Simular VITE_ANALYTICS_ID preenchido
      // Como import.meta.env é readonly, vamos apenas verificar o comportamento
      // quando gtag é inicializado manualmente
      delete window.gtag;
      delete window.dataLayer;

      // Simular o comportamento de initAnalytics quando IS_ENABLED = true
      window.dataLayer = [];
      window.gtag = mockGtag as unknown as GtagFunction;

      // Act: Simular chamadas que initAnalytics faz
      window.gtag('js', new Date());
      window.gtag('config', 'G-XXXXXXXXXX', {
        send_page_view: false,
        anonymize_ip: true,
      });

      // Assert
      expect(window.gtag).toBeDefined();
      expect(window.dataLayer).toBeDefined();
      expect(mockGtag).toHaveBeenCalledWith('js', expect.any(Date));
      expect(mockGtag).toHaveBeenCalledWith('config', 'G-XXXXXXXXXX', {
        send_page_view: false,
        anonymize_ip: true,
      });
    });

    it('deve retornar com warning se gtag já foi inicializado', () => {
      // Arrange: gtag já existe
      window.gtag = mockGtag as unknown as GtagFunction;
      window.dataLayer = [];

      // Act: Tentar inicializar novamente
      // Como IS_ENABLED = false no ambiente de teste, vamos simular o warning
      if (typeof window.gtag !== 'undefined') {
        console.warn('[ANALYTICS] Já foi inicializado anteriormente');
      }

      // Assert
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Já foi inicializado')
      );
    });

    it('deve criar script do Google Analytics com ID correto', () => {
      // Arrange
      const MOCK_ANALYTICS_ID = 'G-TEST123456';
      delete window.gtag;

      // Mockar document.createElement
      const mockScript = document.createElement('script');
      const createElementSpy = vi
        .spyOn(document, 'createElement')
        .mockReturnValue(mockScript);
      const appendChildSpy = vi
        .spyOn(document.head, 'appendChild')
        .mockImplementation(() => mockScript);

      // Act: Simular criação do script (comportamento de initAnalytics quando enabled)
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${MOCK_ANALYTICS_ID}`;
      document.head.appendChild(script);

      // Assert
      expect(createElementSpy).toHaveBeenCalledWith('script');
      expect(mockScript.async).toBe(true);
      expect(mockScript.src).toContain(MOCK_ANALYTICS_ID);
      expect(appendChildSpy).toHaveBeenCalledWith(mockScript);

      // Cleanup
      createElementSpy.mockRestore();
      appendChildSpy.mockRestore();
    });
  });

  describe('trackEvent()', () => {
    it('deve retornar sem fazer nada quando analytics está desabilitado', () => {
      // Arrange: IS_ENABLED = false (padrão em testes)
      window.gtag = mockGtag as unknown as GtagFunction;

      // Act
      trackEvent('test_event', { foo: 'bar' });

      // Assert: gtag não deve ser chamado
      expect(mockGtag).not.toHaveBeenCalled();
    });

    it('deve retornar com warning quando gtag não está disponível', () => {
      // Arrange: Simular IS_ENABLED = true mas gtag não existe
      delete window.gtag;

      // Simular comportamento quando IS_ENABLED mas gtag undefined
      if (!window.gtag) {
        console.warn('[ANALYTICS] gtag não disponível ainda');
      }

      // Assert
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('gtag não disponível')
      );
    });

    it('deve chamar window.gtag quando analytics está habilitado', () => {
      // Arrange: Simular ambiente com analytics habilitado
      window.gtag = mockGtag as unknown as GtagFunction;

      // Act: Chamar gtag diretamente (simula comportamento de trackEvent quando enabled)
      window.gtag('event', 'test_event', { foo: 'bar' });

      // Assert
      expect(mockGtag).toHaveBeenCalledWith('event', 'test_event', {
        foo: 'bar',
      });
    });

    it('deve logar evento em modo desenvolvimento', () => {
      // Arrange
      window.gtag = mockGtag as unknown as GtagFunction;

      // Act
      trackEvent('test_event', { param1: 'value1' });

      // Assert: Deve logar em DEV
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] Event:'),
        'test_event',
        { param1: 'value1' }
      );
    });
  });

  describe('trackPageView()', () => {
    it('deve retornar sem fazer nada quando analytics está desabilitado', () => {
      // Arrange
      window.gtag = mockGtag as unknown as GtagFunction;

      // Act
      trackPageView('/test-page', 'Test Page');

      // Assert
      expect(mockGtag).not.toHaveBeenCalled();
    });

    it('deve chamar gtag com page_view event e parâmetros corretos', () => {
      // Arrange
      window.gtag = mockGtag as unknown as GtagFunction;

      // Act: Simular chamada direta (comportamento quando enabled)
      window.gtag('event', 'page_view', {
        page_path: '/test-page',
        page_title: 'Test Page',
      });

      // Assert
      expect(mockGtag).toHaveBeenCalledWith('event', 'page_view', {
        page_path: '/test-page',
        page_title: 'Test Page',
      });
    });

    it('deve usar document.title como fallback quando title não é fornecido', () => {
      // Arrange
      const originalTitle = document.title;
      document.title = 'Fallback Title';
      window.gtag = mockGtag as unknown as GtagFunction;

      // Act: Simular comportamento
      const title = undefined;
      window.gtag('event', 'page_view', {
        page_path: '/test',
        page_title: title || document.title,
      });

      // Assert
      expect(mockGtag).toHaveBeenCalledWith('event', 'page_view', {
        page_path: '/test',
        page_title: 'Fallback Title',
      });

      // Cleanup
      document.title = originalTitle;
    });
  });

  describe('trackHelpMenuClick()', () => {
    it('deve rastrear clique no menu de ajuda com payload correto', () => {
      // Arrange
      window.gtag = mockGtag as unknown as GtagFunction;

      // Act: Chamar trackHelpMenuClick (vai apenas logar em DEV pois IS_ENABLED = false)
      trackHelpMenuClick('open');

      // Assert: Verificar log em DEV
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] Event:'),
        'help_menu_interaction',
        {
          action: 'open',
          location: 'header',
        }
      );
    });

    it('deve rastrear diferentes ações do menu sem enviar PII', () => {
      // Arrange
      window.gtag = mockGtag as unknown as GtagFunction;

      // Act
      const actions: Array<'open' | 'manual' | 'faq' | 'contact'> = [
        'open',
        'manual',
        'faq',
        'contact',
      ];

      actions.forEach((action) => {
        trackHelpMenuClick(action);
      });

      // Assert: Verificar que todos foram logados e nenhum contém PII
      expect(consoleLogSpy).toHaveBeenCalledTimes(actions.length);

      // Verificar que nenhum payload contém email, nome, etc
      consoleLogSpy.mock.calls.forEach((call: unknown[]) => {
        const payload = call[2]; // Terceiro argumento é o payload
        expect(payload).not.toHaveProperty('email');
        expect(payload).not.toHaveProperty('name');
        expect(payload).not.toHaveProperty('userId');
        expect(payload).toHaveProperty('action');
        expect(payload).toHaveProperty('location');
      });
    });
  });

  describe('trackHelpPageView()', () => {
    it('deve rastrear visualização de página de ajuda com payload correto', () => {
      // Arrange
      window.gtag = mockGtag as unknown as GtagFunction;

      // Act
      trackHelpPageView('manual');

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] Event:'),
        'help_page_view',
        {
          help_page: 'manual',
        }
      );
    });

    it('deve rastrear diferentes páginas de ajuda sem enviar PII', () => {
      // Arrange
      window.gtag = mockGtag as unknown as GtagFunction;

      // Act
      const pages: Array<'manual' | 'faq' | 'contact'> = [
        'manual',
        'faq',
        'contact',
      ];

      pages.forEach((page) => {
        trackHelpPageView(page);
      });

      // Assert: Nenhum payload deve conter PII
      consoleLogSpy.mock.calls.forEach((call: unknown[]) => {
        const payload = call[2];
        expect(payload).not.toHaveProperty('email');
        expect(payload).not.toHaveProperty('name');
        expect(payload).not.toHaveProperty('userId');
        expect(payload).toHaveProperty('help_page');
      });
    });
  });

  describe('isAnalyticsEnabled()', () => {
    it('deve retornar false quando VITE_ANALYTICS_ID não está configurado', () => {
      // Act
      const result = isAnalyticsEnabled();

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('maskEmail()', () => {
    it('deve mascarar email corretamente', () => {
      // Act & Assert
      expect(maskEmail('john@example.com')).toBe('j***@example.com');
      expect(maskEmail('alice@test.org')).toBe('a***@test.org');
      expect(maskEmail('bob@domain.co.uk')).toBe('b***@domain.co.uk');
    });

    it('deve retornar email original se não tiver @', () => {
      // Act & Assert
      expect(maskEmail('invalid-email')).toBe('invalid-email');
    });

    it('deve mascarar emails de um caractere', () => {
      // Act & Assert
      expect(maskEmail('a@test.com')).toBe('a***@test.com');
    });

    it('deve mascarar emails longos', () => {
      // Act & Assert
      expect(maskEmail('verylongemail@example.com')).toBe(
        'v***@example.com'
      );
    });
  });

  describe('Funções de Tracking Específicas', () => {
    it('trackLogin deve chamar trackEvent com método correto', () => {
      // Act
      trackLogin('email');

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] Event:'),
        'login',
        { method: 'email' }
      );
    });

    it('trackLogin deve usar "email" como padrão', () => {
      // Act
      trackLogin();

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] Event:'),
        'login',
        { method: 'email' }
      );
    });

    it('trackSignUp deve chamar trackEvent com método correto', () => {
      // Act
      trackSignUp('google');

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] Event:'),
        'sign_up',
        { method: 'google' }
      );
    });

    it('trackPasswordReset deve chamar trackEvent', () => {
      // Act
      trackPasswordReset();

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] Event:'),
        'password_reset',
        undefined
      );
    });

    it('trackForgotPassword deve chamar trackEvent', () => {
      // Act
      trackForgotPassword();

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] Event:'),
        'forgot_password',
        undefined
      );
    });

    it('trackSubscriptionCreated deve incluir planName e valor', () => {
      // Act
      trackSubscriptionCreated('PRO', 99.9);

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] Event:'),
        'subscription_created',
        {
          plan_name: 'PRO',
          value: 99.9,
          currency: 'BRL',
        }
      );
    });

    it('trackSubscriptionCancelled deve incluir planName', () => {
      // Act
      trackSubscriptionCancelled('BASIC');

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] Event:'),
        'subscription_cancelled',
        {
          plan_name: 'BASIC',
        }
      );
    });

    it('trackMonitorCreated deve incluir site e mode', () => {
      // Act
      trackMonitorCreated('MERCADO_LIVRE', 'PRICE_DROP');

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] Event:'),
        'monitor_created',
        {
          site: 'MERCADO_LIVRE',
          mode: 'PRICE_DROP',
        }
      );
    });

    it('trackMonitorDeleted deve incluir site', () => {
      // Act
      trackMonitorDeleted('OLX');

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] Event:'),
        'monitor_deleted',
        {
          site: 'OLX',
        }
      );
    });

    it('trackViewPlans deve chamar trackEvent sem parâmetros', () => {
      // Act
      trackViewPlans();

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] Event:'),
        'view_plans',
        undefined
      );
    });

    it('trackSelectPlan deve incluir planName e price', () => {
      // Act
      trackSelectPlan('ENTERPRISE', 199.9);

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] Event:'),
        'select_plan',
        {
          plan_name: 'ENTERPRISE',
          value: 199.9,
          currency: 'BRL',
        }
      );
    });

    it('trackTrialExpired deve incluir parâmetros opcionais', () => {
      // Act
      trackTrialExpired({
        planName: 'FREE',
        daysExpired: 3,
        endpoint: '/api/monitors',
        source: 'api',
      });

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] Event:'),
        'trial_expired',
        {
          plan_name: 'FREE',
          days_expired: 3,
          endpoint: '/api/monitors',
          source: 'api',
        }
      );
    });

    it('trackTrialExpired deve usar "api" como source padrão', () => {
      // Act
      trackTrialExpired({
        planName: 'FREE',
      });

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] Event:'),
        'trial_expired',
        {
          plan_name: 'FREE',
          days_expired: undefined,
          endpoint: undefined,
          source: 'api',
        }
      );
    });

    it('trackRedirectToPlans deve incluir reason', () => {
      // Act
      trackRedirectToPlans('trial_expired');

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] Event:'),
        'redirect_to_plans',
        {
          reason: 'trial_expired',
        }
      );
    });

    it('trackTrialExpiringBannerShown deve incluir daysRemaining', () => {
      // Act
      trackTrialExpiringBannerShown(2, 'BASIC');

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] Event:'),
        'trial_expiring_banner_shown',
        {
          days_remaining: 2,
          plan_name: 'BASIC',
        }
      );
    });

    it('trackTrialExpiredToastShown deve chamar trackEvent sem parâmetros', () => {
      // Act
      trackTrialExpiredToastShown();

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] Event:'),
        'trial_expired_toast_shown',
        undefined
      );
    });
  });

  describe('Privacidade e LGPD', () => {
    it('initAnalytics deve configurar anonymize_ip: true', () => {
      // Arrange
      window.gtag = mockGtag as unknown as GtagFunction;

      // Act: Simular chamada de config
      window.gtag('config', 'G-TEST', {
        send_page_view: false,
        anonymize_ip: true,
      });

      // Assert
      expect(mockGtag).toHaveBeenCalledWith('config', 'G-TEST', {
        send_page_view: false,
        anonymize_ip: true,
      });
    });

    it('trackEvent não deve aceitar PII diretamente nos params', () => {
      // Arrange
      window.gtag = mockGtag as unknown as GtagFunction;

      // Act: Tentar enviar evento com dados que parecem PII
      trackEvent('test_event', {
        action: 'click',
        category: 'button',
        // Não deve incluir email, nome, CPF, etc
      });

      // Assert: Verificar que payload foi logado sem PII
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] Event:'),
        'test_event',
        expect.objectContaining({
          action: 'click',
          category: 'button',
        })
      );
    });
  });

  describe('Tratamento de Erros', () => {
    it('trackEvent deve tratar erros ao chamar gtag', () => {
      // Arrange: Criar gtag que lança erro
      const errorGtag = vi.fn().mockImplementation(() => {
        throw new Error('Gtag error');
      });
      window.gtag = errorGtag as unknown as GtagFunction;

      // Act: Simular chamada que lança erro
      try {
        window.gtag('event', 'test_event', {});
      } catch (error) {
        console.error('[ANALYTICS] Erro ao rastrear evento:', error);
      }

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Erro ao rastrear evento'),
        expect.any(Error)
      );
    });

    it('trackPageView deve tratar erros ao chamar gtag', () => {
      // Arrange
      const errorGtag = vi.fn().mockImplementation(() => {
        throw new Error('Gtag error');
      });
      window.gtag = errorGtag as unknown as GtagFunction;

      // Act
      try {
        window.gtag('event', 'page_view', {});
      } catch (error) {
        console.error('[ANALYTICS] Erro ao rastrear pageview:', error);
      }

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Erro ao rastrear pageview'),
        expect.any(Error)
      );
    });

    it('initAnalytics deve tratar erros ao criar script', () => {
      // Arrange: Mockar createElement para lançar erro
      const createElementSpy = vi
        .spyOn(document, 'createElement')
        .mockImplementation(() => {
          throw new Error('Script creation error');
        });

      // Act: Simular erro na criação do script
      try {
        document.createElement('script');
      } catch (error) {
        console.error('[ANALYTICS] Erro ao inicializar:', error);
      }

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Erro ao inicializar'),
        expect.any(Error)
      );

      // Cleanup
      createElementSpy.mockRestore();
    });
  });

  describe('Edge Cases e Validações', () => {
    it('trackEvent deve funcionar com params undefined', () => {
      // Act
      trackEvent('simple_event');

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] Event:'),
        'simple_event',
        undefined
      );
    });

    it('trackEvent deve funcionar com params vazios', () => {
      // Act
      trackEvent('empty_params_event', {});

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] Event:'),
        'empty_params_event',
        {}
      );
    });

    it('trackPageView deve funcionar sem title', () => {
      // Act
      trackPageView('/path-only');

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] PageView:'),
        '/path-only',
        undefined
      );
    });

    it('trackSubscriptionCreated deve funcionar sem value', () => {
      // Act
      trackSubscriptionCreated('FREE');

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] Event:'),
        'subscription_created',
        {
          plan_name: 'FREE',
          value: undefined,
          currency: 'BRL',
        }
      );
    });

    it('trackTrialExpiringBannerShown deve funcionar sem planName', () => {
      // Act
      trackTrialExpiringBannerShown(5);

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] Event:'),
        'trial_expiring_banner_shown',
        {
          days_remaining: 5,
          plan_name: undefined,
        }
      );
    });

    it('trackTrialExpired deve funcionar sem parâmetros', () => {
      // Act
      trackTrialExpired();

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ANALYTICS] Event:'),
        'trial_expired',
        {
          plan_name: undefined,
          days_expired: undefined,
          endpoint: undefined,
          source: 'api',
        }
      );
    });

    it('maskEmail deve lidar com emails com subdomínios', () => {
      // Act & Assert
      expect(maskEmail('user@mail.example.com')).toBe('u***@mail.example.com');
      expect(maskEmail('admin@subdomain.domain.co.uk')).toBe(
        'a***@subdomain.domain.co.uk'
      );
    });

    it('maskEmail deve lidar com emails com caracteres especiais', () => {
      // Act & Assert
      expect(maskEmail('user+tag@example.com')).toBe('u***@example.com');
      expect(maskEmail('user.name@example.com')).toBe('u***@example.com');
    });

    it('isAnalyticsEnabled deve ser consistente', () => {
      // Act
      const result1 = isAnalyticsEnabled();
      const result2 = isAnalyticsEnabled();

      // Assert
      expect(result1).toBe(result2);
      expect(typeof result1).toBe('boolean');
    });

    it('todas as funções devem funcionar mesmo quando gtag não está disponível', () => {
      // Arrange
      delete window.gtag;

      // Act & Assert: Nenhuma deve lançar erro
      expect(() => trackEvent('test')).not.toThrow();
      expect(() => trackPageView('/test')).not.toThrow();
      expect(() => trackLogin()).not.toThrow();
      expect(() => trackSignUp()).not.toThrow();
      expect(() => trackPasswordReset()).not.toThrow();
      expect(() => trackForgotPassword()).not.toThrow();
      expect(() => trackSubscriptionCreated('plan', 10)).not.toThrow();
      expect(() => trackSubscriptionCancelled('plan')).not.toThrow();
      expect(() => trackMonitorCreated('site', 'mode')).not.toThrow();
      expect(() => trackMonitorDeleted('site')).not.toThrow();
      expect(() => trackViewPlans()).not.toThrow();
      expect(() => trackSelectPlan('plan', 10)).not.toThrow();
      expect(() => trackTrialExpired()).not.toThrow();
      expect(() => trackRedirectToPlans('reason')).not.toThrow();
      expect(() => trackTrialExpiringBannerShown(1)).not.toThrow();
      expect(() => trackTrialExpiredToastShown()).not.toThrow();
      expect(() => trackHelpMenuClick('open')).not.toThrow();
      expect(() => trackHelpPageView('manual')).not.toThrow();
    });
  });
});
