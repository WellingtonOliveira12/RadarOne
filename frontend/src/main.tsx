import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ChakraProvider } from '@chakra-ui/react'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initSentry } from './lib/sentry'

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
