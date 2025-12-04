import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { ProtectedRoute } from './components/ProtectedRoute';

/**
 * App Principal
 * Configura rotas e providers
 */

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Rotas públicas */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Rotas protegidas */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          {/* TODO: Adicionar outras rotas */}
          {/* <Route path="/monitors" element={<ProtectedRoute><Monitors /></ProtectedRoute>} /> */}
          {/* <Route path="/plans" element={<ProtectedRoute><Plans /></ProtectedRoute>} /> */}
          {/* <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} /> */}

          {/* Redirect padrão */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
