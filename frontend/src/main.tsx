import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ChakraProvider } from '@chakra-ui/react'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initSentry } from './lib/sentry'

// Configuração do Google Analytics 4
// IMPORTANTE: Carrega ANTES do Sentry e React para garantir rastreamento
const ANALYTICS_ID = import.meta.env.VITE_ANALYTICS_ID;
const IS_DEV = import.meta.env.DEV;

if (ANALYTICS_ID && !window.gtag) {
  // Carrega o script do Google Analytics
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${ANALYTICS_ID}`;
  document.head.appendChild(script);

  // Inicializa dataLayer e gtag
  window.dataLayer = window.dataLayer || [];
  window.gtag = function() {
    window.dataLayer?.push(arguments);
  };

  window.gtag('js', new Date());
  window.gtag('config', ANALYTICS_ID, {
    anonymize_ip: true,
    send_page_view: true
  });

  if (IS_DEV) {
    console.log('[GA4] ✅ Script carregado via main.tsx:', ANALYTICS_ID);
    console.log('[GA4] 📊 Analytics inicializado com anonymize_ip=true');
  }
} else if (!ANALYTICS_ID && IS_DEV) {
  console.log('[GA4] ⚠️ VITE_ANALYTICS_ID não configurado - Analytics desabilitado');
} else if (window.gtag && IS_DEV) {
  console.log('[GA4] ✅ Analytics já carregado anteriormente');
}

// Inicializa Sentry antes de renderizar
initSentry();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ChakraProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
      <Toaster position="top-right" />
    </ChakraProvider>
  </StrictMode>,
)
