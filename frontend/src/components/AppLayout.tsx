import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface AppLayoutProps {
  children: React.ReactNode;
}

/**
 * Layout reutilizável para páginas internas
 * Responsivo e centralizado com header consistente
 */
export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { logout } = useAuth();

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <h1 style={styles.logo}>RadarOne</h1>
          <nav style={styles.nav}>
            <NavLink
              to="/dashboard"
              style={({ isActive }) => ({
                ...styles.navLink,
                ...(isActive ? styles.navLinkActive : {})
              })}
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/monitors"
              style={({ isActive }) => ({
                ...styles.navLink,
                ...(isActive ? styles.navLinkActive : {})
              })}
            >
              Monitores
            </NavLink>
            <button onClick={logout} style={styles.logoutButton}>
              Sair
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main style={styles.main}>
        <div style={styles.container}>
          {children}
        </div>
      </main>
    </div>
  );
};

const styles = {
  wrapper: {
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
    width: '100%',
  },
  header: {
    backgroundColor: 'white',
    borderBottom: '1px solid #e5e7eb',
    padding: '16px 0',
    position: 'sticky' as const,
    top: 0,
    zIndex: 10,
  },
  headerContent: {
    maxWidth: '1200px',
    width: '100%',
    margin: '0 auto',
    padding: '0 clamp(16px, 4vw, 24px)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: '12px',
    boxSizing: 'border-box' as const,
  },
  logo: {
    fontSize: 'clamp(20px, 5vw, 24px)',
    fontWeight: 'bold' as const,
    color: '#1f2937',
    margin: 0,
  },
  nav: {
    display: 'flex',
    gap: 'clamp(8px, 2vw, 16px)',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  },
  navLink: {
    color: '#4b5563',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '500',
  },
  navLinkActive: {
    color: '#2563eb',
    fontWeight: '600',
  },
  logoutButton: {
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500' as const,
    cursor: 'pointer',
  },
  main: {
    width: '100%',
  },
  container: {
    maxWidth: '1200px',
    width: '100%',
    margin: '0 auto',
    padding: 'clamp(24px, 5vw, 40px) clamp(16px, 4vw, 24px)',
    boxSizing: 'border-box' as const,
  },
};
