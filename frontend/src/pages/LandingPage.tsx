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
          Encontre as melhores oportunidades antes da concorrência
        </h1>
        <p style={styles.heroSubtitle}>
          Monitore anúncios de <strong>iPhone, carros, imóveis e muito mais</strong> no OLX,
          Mercado Livre e Facebook. Receba alertas em tempo real e seja o primeiro a fechar negócio.
        </p>
        <div style={styles.heroButtons}>
          <Link to="/register" style={styles.primaryButton}>
            Começar agora - 7 dias grátis
          </Link>
          <Link to="/plans" style={styles.secondaryButton}>
            Ver planos
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section style={styles.features}>
        <h2 style={styles.sectionTitle}>Ideal para vendedores e revendedores</h2>
        <div style={styles.featuresGrid}>
          <div style={styles.featureCard}>
            <div style={styles.featureIcon}>📱</div>
            <h3 style={styles.featureTitle}>Revenda de iPhone</h3>
            <p style={styles.featureText}>
              Monitore anúncios de iPhone usados, pegue os melhores preços antes
              da concorrência e revenda com lucro.
            </p>
          </div>

          <div style={styles.featureCard}>
            <div style={styles.featureIcon}>🚗</div>
            <h3 style={styles.featureTitle}>Carros e Motos</h3>
            <p style={styles.featureText}>
              Acompanhe anúncios de veículos na sua região. Receba alerta
              instantâneo quando aparecer um bom negócio.
            </p>
          </div>

          <div style={styles.featureCard}>
            <div style={styles.featureIcon}>🏠</div>
            <h3 style={styles.featureTitle}>Imóveis e Terrenos</h3>
            <p style={styles.featureText}>
              Encontre imóveis abaixo do preço de mercado. Seja o primeiro
              a entrar em contato com o vendedor.
            </p>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section style={styles.benefits}>
        <h2 style={styles.sectionTitle}>Por que vendedores escolhem o RadarOne?</h2>
        <div style={styles.benefitsList}>
          <div style={styles.benefitItem}>
            <span style={styles.benefitIcon}>⚡</span>
            <span><strong>Alertas em segundos</strong> - Receba notificação via Telegram assim que o anúncio for publicado</span>
          </div>
          <div style={styles.benefitItem}>
            <span style={styles.benefitIcon}>📱</span>
            <span><strong>Todos os marketplaces</strong> - OLX, Mercado Livre, Facebook Marketplace, Webmotors e mais</span>
          </div>
          <div style={styles.benefitItem}>
            <span style={styles.benefitIcon}>🎯</span>
            <span><strong>Filtros inteligentes</strong> - Monitore por cidade, faixa de preço, palavra-chave e muito mais</span>
          </div>
          <div style={styles.benefitItem}>
            <span style={styles.benefitIcon}>💰</span>
            <span><strong>Aumente seu lucro</strong> - Chegue primeiro nos melhores negócios e negocie melhor</span>
          </div>
          <div style={styles.benefitItem}>
            <span style={styles.benefitIcon}>✅</span>
            <span><strong>7 dias grátis</strong> - Teste sem compromisso. Cancele quando quiser</span>
          </div>
          <div style={styles.benefitItem}>
            <span style={styles.benefitIcon}>🔒</span>
            <span><strong>Sem pegadinhas</strong> - Cancele pelo app, sem ligar pra ninguém</span>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section style={styles.cta}>
        <h2 style={styles.ctaTitle}>Comece a vender mais hoje mesmo</h2>
        <p style={styles.ctaSubtitle}>
          Junte-se a centenas de vendedores que já usam o RadarOne para encontrar as melhores
          oportunidades. <strong>7 dias grátis</strong>, sem pedir cartão de crédito.
        </p>
        <Link to="/register" style={styles.ctaButton}>
          Criar conta grátis
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
    width: '100%',
  },
  header: {
    backgroundColor: 'white',
    borderBottom: '1px solid #e5e7eb',
    padding: '16px 0',
  },
  headerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 clamp(16px, 4vw, 20px)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: '12px',
  },
  logo: {
    fontSize: '24px',
    fontWeight: 'bold',
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
    padding: 'clamp(40px, 10vw, 80px) clamp(16px, 4vw, 20px)',
    textAlign: 'center' as const,
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  heroTitle: {
    fontSize: 'clamp(28px, 6vw, 48px)', // Responsivo: 28px (mobile) até 48px (desktop)
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '16px',
    lineHeight: '1.2',
  },
  heroSubtitle: {
    fontSize: 'clamp(16px, 3.5vw, 20px)', // Responsivo: 16px (mobile) até 20px (desktop)
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
    padding: 'clamp(40px, 8vw, 60px) clamp(16px, 4vw, 20px)',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  sectionTitle: {
    fontSize: 'clamp(24px, 5vw, 36px)', // Responsivo: 24px (mobile) até 36px (desktop)
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
    padding: 'clamp(40px, 8vw, 60px) clamp(16px, 4vw, 20px)',
    width: '100%',
    boxSizing: 'border-box' as const,
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
    padding: 'clamp(50px, 10vw, 80px) clamp(16px, 4vw, 20px)',
    textAlign: 'center' as const,
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  ctaTitle: {
    fontSize: 'clamp(24px, 5vw, 36px)', // Responsivo
    fontWeight: 'bold',
    color: 'white',
    marginBottom: '16px',
  },
  ctaSubtitle: {
    fontSize: 'clamp(16px, 3vw, 18px)',
    color: 'rgba(255,255,255,0.9)',
    marginBottom: '32px',
    maxWidth: '600px',
    margin: '0 auto 32px auto',
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
