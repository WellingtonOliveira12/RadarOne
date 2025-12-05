import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { HealthCheckPage } from './pages/HealthCheckPage';
import { LoginPage } from './pages/LoginPage';
import { MonitorsPage } from './pages/MonitorsPage';

export function AppRouter() {
  return (
    <BrowserRouter>
      <div style={{ padding: 16 }}>
        <nav style={{ marginBottom: 16 }}>
          <Link to="/" style={{ marginRight: 8 }}>Health</Link>
          <Link to="/login" style={{ marginRight: 8 }}>Login</Link>
          <Link to="/monitors">Monitores</Link>
        </nav>

        <Routes>
          <Route path="/" element={<HealthCheckPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/monitors" element={<MonitorsPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
