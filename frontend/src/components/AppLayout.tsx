import React, { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { APP_VERSION } from '../constants/app';
import { trackHelpMenuClick } from '../lib/analytics';

interface AppLayoutProps {
  children: React.ReactNode;
}

/**
 * Layout reutilizável para páginas internas
 * Responsivo e centralizado com header e footer consistentes
 */
export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { logout } = useAuth();
  const [helpMenuOpen, setHelpMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleHelpMenu = () => {
    const newState = !helpMenuOpen;
    setHelpMenuOpen(newState);
    // Track quando abre o menu (não quando fecha)
    if (newState) {
      trackHelpMenuClick('open');
    }
  };
  const toggleMobileMenu = () => setMobileMenuOpen(!mobileMenuOpen);

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <Link to="/dashboard" style={styles.logoLink}>
            <div style={styles.logoContainer}>
              <img
                src="/brand/radarone-logo.png"
                alt="RadarOne Logo"
                style={styles.logoImage}
              />
              <h1 style={styles.logo}>RadarOne</h1>
            </div>
          </Link>

          {/* Mobile Menu Button */}
          <button
            onClick={toggleMobileMenu}
            style={styles.mobileMenuButton}
            aria-label="Menu"
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>

          {/* Desktop Navigation */}
          <nav style={{
            ...styles.nav,
            ...(mobileMenuOpen ? styles.navMobile : {}),
          }}>
            <NavLink
              to="/dashboard"
              style={({ isActive }) => ({
                ...styles.navLink,
                ...(isActive ? styles.navLinkActive : {})
              })}
              onClick={() => setMobileMenuOpen(false)}
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/monitors"
              style={({ isActive }) => ({
                ...styles.navLink,
                ...(isActive ? styles.navLinkActive : {})
              })}
              onClick={() => setMobileMenuOpen(false)}
            >
              Monitores
            </NavLink>
            <NavLink
              to="/telegram/connect"
              style={({ isActive }) => ({
                ...styles.navLink,
                ...(isActive ? styles.navLinkActive : {})
              })}
              onClick={() => setMobileMenuOpen(false)}
            >
              Telegram
            </NavLink>
            <NavLink
              to="/settings/notifications"
              style={({ isActive }) => ({
                ...styles.navLink,
                ...(isActive ? styles.navLinkActive : {})
              })}
              onClick={() => setMobileMenuOpen(false)}
            >
              Configurações
            </NavLink>

            {/* Help Dropdown */}
            <div style={styles.dropdown}>
              <button onClick={toggleHelpMenu} style={styles.dropdownButton}>
                Ajuda ▾
              </button>
              {helpMenuOpen && (
                <div style={styles.dropdownMenu}>
                  <Link
                    to="/manual"
                    style={styles.dropdownItem}
                    onClick={() => {
                      trackHelpMenuClick('manual');
                      setHelpMenuOpen(false);
                      setMobileMenuOpen(false);
                    }}
                  >
                    📖 Manual
                  </Link>
                  <Link
                    to="/faq"
                    style={styles.dropdownItem}
                    onClick={() => {
                      trackHelpMenuClick('faq');
                      setHelpMenuOpen(false);
                      setMobileMenuOpen(false);
                    }}
                  >
                    ❓ FAQ
                  </Link>
                  <Link
                    to="/contact"
                    style={styles.dropdownItem}
                    onClick={() => {
                      trackHelpMenuClick('contact');
                      setHelpMenuOpen(false);
                      setMobileMenuOpen(false);
                    }}
                  >
                    💬 Fale Conosco
                  </Link>
                </div>
              )}
            </div>

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

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={styles.footerContent}>
          <div style={styles.footerLinks}>
            <Link to="/manual" style={styles.footerLink}>Manual</Link>
            <span style={styles.footerSeparator}>•</span>
            <Link to="/faq" style={styles.footerLink}>FAQ</Link>
            <span style={styles.footerSeparator}>•</span>
            <Link to="/contact" style={styles.footerLink}>Contato</Link>
          </div>
          <div style={styles.footerCopy}>
            © 2025 RadarOne. Todos os direitos reservados. • v{APP_VERSION}
          </div>
        </div>
      </footer>
    </div>
  );
};

const styles = {
  wrapper: {
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
    width: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  header: {
    backgroundColor: 'white',
    borderBottom: '1px solid #e5e7eb',
    padding: '16px 0',
    position: 'sticky' as const,
    top: 0,
    zIndex: 100,
  },
  headerContent: {
    maxWidth: '1200px',
    width: '100%',
    margin: '0 auto',
    padding: '0 clamp(16px, 4vw, 24px)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    boxSizing: 'border-box' as const,
    position: 'relative' as const,
  },
  logoLink: {
    textDecoration: 'none',
  },
  logoContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 'clamp(8px, 2vw, 12px)',
  },
  logoImage: {
    height: 'clamp(32px, 5vw, 40px)',
    width: 'auto',
    objectFit: 'contain' as const,
  },
  logo: {
    fontSize: 'clamp(18px, 4vw, 22px)',
    fontWeight: 'bold' as const,
    color: '#1f2937',
    margin: 0,
  },
  mobileMenuButton: {
    display: 'none',
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    padding: '4px 8px',
    color: '#1f2937',
    '@media (max-width: 768px)': {
      display: 'block',
    },
  } as any,
  nav: {
    display: 'flex',
    gap: 'clamp(8px, 2vw, 16px)',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  },
  navMobile: {
    position: 'absolute' as const,
    top: '60px',
    right: '16px',
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '16px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    flexDirection: 'column' as const,
    alignItems: 'flex-start',
    width: '200px',
    zIndex: 1000,
  },
  navLink: {
    color: '#4b5563',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '500',
    padding: '8px 0',
  },
  navLinkActive: {
    color: '#2563eb',
    fontWeight: '600',
  },
  dropdown: {
    position: 'relative' as const,
  },
  dropdownButton: {
    backgroundColor: 'transparent',
    color: '#4b5563',
    border: 'none',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    padding: '8px 12px',
  },
  dropdownMenu: {
    position: 'absolute' as const,
    top: '100%',
    right: 0,
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    minWidth: '160px',
    marginTop: '4px',
    zIndex: 1000,
  },
  dropdownItem: {
    display: 'block',
    padding: '12px 16px',
    color: '#1f2937',
    textDecoration: 'none',
    fontSize: '14px',
    borderBottom: '1px solid #f3f4f6',
  } as any,
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
    flex: 1,
  },
  container: {
    maxWidth: '1200px',
    width: '100%',
    margin: '0 auto',
    padding: 'clamp(24px, 5vw, 40px) clamp(16px, 4vw, 24px)',
    boxSizing: 'border-box' as const,
  },
  footer: {
    backgroundColor: 'white',
    borderTop: '1px solid #e5e7eb',
    padding: '24px 0',
    marginTop: 'auto',
  },
  footerContent: {
    maxWidth: '1200px',
    width: '100%',
    margin: '0 auto',
    padding: '0 clamp(16px, 4vw, 24px)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '12px',
    boxSizing: 'border-box' as const,
  },
  footerLinks: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    justifyContent: 'center',
  },
  footerLink: {
    color: '#6b7280',
    textDecoration: 'none',
    fontSize: '14px',
  },
  footerSeparator: {
    color: '#d1d5db',
  },
  footerCopy: {
    color: '#9ca3af',
    fontSize: '12px',
    textAlign: 'center' as const,
  },
};

// Media query handling via inline styles (limitação do React inline styles)
// Para produção, considere usar CSS Modules ou styled-components
if (window.matchMedia('(max-width: 768px)').matches) {
  (styles.mobileMenuButton as any).display = 'block';
}
