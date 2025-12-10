import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Landing Page - Página inicial pública do RadarOne
 */

export const LandingPage: React.FC = () => {
  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <h1 style={styles.logo}>RadarOne</h1>
          <nav style={styles.nav}>
            <Link to="/plans" style={styles.navLink}>
              Planos
            </Link>
            <Link to="/login" style={styles.navLink}>
              Entrar
            </Link>
            <Link to="/register" style={styles.navLinkButton}>
              Criar conta
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section style={styles.hero}>
        <h1 style={styles.heroTitle}>
          Monitore anúncios automaticamente
        </h1>
        <p style={styles.heroSubtitle}>
          Receba alertas em tempo real quando novos anúncios aparecerem em OLX,
          Mercado Livre, Facebook Marketplace e muito mais.
        </p>
        <div style={styles.heroButtons}>
          <Link to="/register" style={styles.primaryButton}>
            Começar agora - 7 dias de garantia
          </Link>
          <Link to="/plans" style={styles.secondaryButton}>
            Ver planos
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section style={styles.features}>
        <h2 style={styles.sectionTitle}>Como funciona</h2>
        <div style={styles.featuresGrid}>
          <div style={styles.featureCard}>
            <div style={styles.featureIcon}>🔍</div>
            <h3 style={styles.featureTitle}>1. Configure monitores</h3>
            <p style={styles.featureText}>
              Defina o que você quer monitorar: URL específica ou filtros
              personalizados (palavra-chave, cidade, faixa de preço, etc.)
            </p>
          </div>

          <div style={styles.featureCard}>
            <div style={styles.featureIcon}>⚡</div>
            <h3 style={styles.featureTitle}>2. Receba alertas</h3>
            <p style={styles.featureText}>
              Assim que um novo anúncio aparecer, você recebe notificação
              instantânea via Telegram ou e-mail.
            </p>
          </div>

          <div style={styles.featureCard}>
            <div style={styles.featureIcon}>🎯</div>
            <h3 style={styles.featureTitle}>3. Seja o primeiro</h3>
            <p style={styles.featureText}>
              Saia na frente da concorrência e garanta as melhores
              oportunidades antes de todo mundo.
            </p>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section style={styles.benefits}>
        <h2 style={styles.sectionTitle}>Por que escolher o RadarOne?</h2>
        <div style={styles.benefitsList}>
          <div style={styles.benefitItem}>
            <span style={styles.benefitIcon}>✅</span>
            <span>Notificações em tempo real via Telegram ou e-mail</span>
          </div>
          <div style={styles.benefitItem}>
            <span style={styles.benefitIcon}>✅</span>
            <span>Suporte para OLX, Mercado Livre, Facebook e outros sites</span>
          </div>
          <div style={styles.benefitItem}>
            <span style={styles.benefitIcon}>✅</span>
            <span>Monitore múltiplos sites e buscas simultaneamente</span>
          </div>
          <div style={styles.benefitItem}>
            <span style={styles.benefitIcon}>✅</span>
            <span>Filtros avançados: cidade, preço, ano, palavra-chave</span>
          </div>
          <div style={styles.benefitItem}>
            <span style={styles.benefitIcon}>✅</span>
            <span>7 dias de garantia em todos os planos pagos</span>
          </div>
          <div style={styles.benefitItem}>
            <span style={styles.benefitIcon}>✅</span>
            <span>Cancele quando quiser, sem burocracia</span>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section style={styles.cta}>
        <h2 style={styles.ctaTitle}>Pronto para começar?</h2>
        <p style={styles.ctaSubtitle}>
          Experimente sem risco com 7 dias de garantia. Cancele e receba reembolso total se não gostar.
        </p>
        <Link to="/register" style={styles.ctaButton}>
          Começar agora
        </Link>
      </section>

      {/* Footer */}
      <footer style={styles.footer}>
        <p style={styles.footerText}>
          © 2024 RadarOne. Todos os direitos reservados.
        </p>
      </footer>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
  },
  header: {
    backgroundColor: 'white',
    borderBottom: '1px solid #e5e7eb',
    padding: '16px 0',
  },
  headerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logo: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#1f2937',
    margin: 0,
  },
  nav: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
  },
  navLink: {
    color: '#4b5563',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '500',
  },
  navLinkButton: {
    color: '#fff',
    backgroundColor: '#3b82f6',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '500',
    padding: '8px 16px',
    borderRadius: '6px',
  },
  hero: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '80px 20px',
    textAlign: 'center' as const,
  },
  heroTitle: {
    fontSize: '48px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '16px',
    lineHeight: '1.2',
  },
  heroSubtitle: {
    fontSize: '20px',
    color: '#6b7280',
    marginBottom: '32px',
    lineHeight: '1.6',
  },
  heroButtons: {
    display: 'flex',
    gap: '16px',
    justifyContent: 'center',
    flexWrap: 'wrap' as const,
  },
  primaryButton: {
    backgroundColor: '#3b82f6',
    color: 'white',
    padding: '14px 28px',
    borderRadius: '8px',
    textDecoration: 'none',
    fontSize: '16px',
    fontWeight: '600',
    display: 'inline-block',
  },
  secondaryButton: {
    backgroundColor: 'white',
    color: '#3b82f6',
    padding: '14px 28px',
    borderRadius: '8px',
    textDecoration: 'none',
    fontSize: '16px',
    fontWeight: '600',
    display: 'inline-block',
    border: '2px solid #3b82f6',
  },
  features: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '60px 20px',
  },
  sectionTitle: {
    fontSize: '36px',
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center' as const,
    marginBottom: '48px',
  },
  featuresGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '32px',
  },
  featureCard: {
    backgroundColor: 'white',
    padding: '32px',
    borderRadius: '12px',
    textAlign: 'center' as const,
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  featureIcon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  featureTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: '12px',
  },
  featureText: {
    fontSize: '14px',
    color: '#6b7280',
    lineHeight: '1.6',
  },
  benefits: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '60px 20px',
  },
  benefitsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  benefitItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '16px',
    color: '#374151',
  },
  benefitIcon: {
    fontSize: '20px',
  },
  cta: {
    backgroundColor: '#3b82f6',
    padding: '80px 20px',
    textAlign: 'center' as const,
  },
  ctaTitle: {
    fontSize: '36px',
    fontWeight: 'bold',
    color: 'white',
    marginBottom: '16px',
  },
  ctaSubtitle: {
    fontSize: '18px',
    color: 'rgba(255,255,255,0.9)',
    marginBottom: '32px',
  },
  ctaButton: {
    backgroundColor: 'white',
    color: '#3b82f6',
    padding: '16px 32px',
    borderRadius: '8px',
    textDecoration: 'none',
    fontSize: '18px',
    fontWeight: '600',
    display: 'inline-block',
  },
  footer: {
    backgroundColor: '#1f2937',
    padding: '32px 20px',
    textAlign: 'center' as const,
  },
  footerText: {
    color: '#9ca3af',
    fontSize: '14px',
    margin: 0,
  },
};
