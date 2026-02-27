/**
 * Sistema de layout responsivo
 * Breakpoints: mobile (≤480px), tablet (481-768px), desktop (769-1280px), large (>1280px)
 */

// Breakpoints
export const breakpoints = {
  mobile: 480,
  tablet: 768,
  desktop: 1280,
};

// Container com max-width responsivo
export const container = {
  maxWidth: '1200px',
  width: '100%',
  margin: '0 auto',
  padding: 'clamp(16px, 4vw, 24px)',
  boxSizing: 'border-box' as const,
};

// Containers específicos
export const narrowContainer = {
  ...container,
  maxWidth: '800px',
};

export const wideContainer = {
  ...container,
  maxWidth: '1400px',
};

// Spacing responsivo
export const spacing = {
  xs: 'clamp(4px, 1vw, 8px)',
  sm: 'clamp(8px, 2vw, 12px)',
  md: 'clamp(16px, 3vw, 24px)',
  lg: 'clamp(24px, 4vw, 32px)',
  xl: 'clamp(32px, 5vw, 48px)',
  xxl: 'clamp(48px, 6vw, 64px)',
};

// Grid responsivo
export const grid = {
  display: 'grid',
  gap: 'clamp(16px, 3vw, 24px)',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))',
};

export const grid2Cols = {
  ...grid,
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))',
};

export const grid3Cols = {
  ...grid,
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))',
};

export const grid4Cols = {
  ...grid,
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))',
};

// Flex responsivo
export const flexRow = {
  display: 'flex',
  flexDirection: 'row' as const,
  flexWrap: 'wrap' as const,
  gap: 'clamp(12px, 2vw, 16px)',
};

export const flexColumn = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 'clamp(12px, 2vw, 16px)',
};

// Card responsivo
export const card = {
  backgroundColor: 'white',
  padding: 'clamp(16px, 4vw, 32px)',
  borderRadius: '12px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  width: '100%',
  boxSizing: 'border-box' as const,
};

// Typography responsivo
export const typography = {
  h1: {
    fontSize: 'clamp(24px, 5vw, 32px)',
    fontWeight: 'bold' as const,
    color: '#1f2937',
    lineHeight: 1.2,
  },
  h2: {
    fontSize: 'clamp(20px, 4vw, 24px)',
    fontWeight: '600' as const,
    color: '#1f2937',
    lineHeight: 1.3,
  },
  h3: {
    fontSize: 'clamp(18px, 3vw, 20px)',
    fontWeight: '600' as const,
    color: '#1f2937',
    lineHeight: 1.4,
  },
  body: {
    fontSize: 'clamp(14px, 2vw, 16px)',
    color: '#4b5563',
    lineHeight: 1.6,
  },
  small: {
    fontSize: 'clamp(12px, 1.5vw, 14px)',
    color: '#6b7280',
    lineHeight: 1.5,
  },
};

// Button responsivo
export const button = {
  padding: 'clamp(8px, 2vw, 12px) clamp(16px, 4vw, 24px)',
  fontSize: 'clamp(14px, 2vw, 16px)',
  fontWeight: '500' as const,
  borderRadius: '6px',
  border: 'none',
  cursor: 'pointer',
  transition: 'all 0.2s',
  boxSizing: 'border-box' as const,
};

export const buttonPrimary = {
  ...button,
  backgroundColor: '#3b82f6',
  color: 'white',
};

export const buttonSecondary = {
  ...button,
  backgroundColor: '#f3f4f6',
  color: '#1f2937',
};

export const buttonDanger = {
  ...button,
  backgroundColor: '#ef4444',
  color: 'white',
};

// Input responsivo
export const input = {
  width: '100%',
  padding: 'clamp(10px, 2vw, 12px) clamp(12px, 3vw, 16px)',
  fontSize: 'clamp(14px, 2vw, 16px)',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  boxSizing: 'border-box' as const,
  outline: 'none',
};

// Form responsivo
export const formGroup = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 'clamp(6px, 1.5vw, 8px)',
  marginBottom: 'clamp(16px, 3vw, 20px)',
};

export const label = {
  fontSize: 'clamp(13px, 2vw, 14px)',
  fontWeight: '500' as const,
  color: '#374151',
};

// Utility: Esconder em mobile
export const hideOnMobile = {
  '@media (max-width: 480px)': {
    display: 'none',
  },
} as Record<string, unknown>;

// Utility: Esconder em desktop
export const hideOnDesktop = {
  '@media (min-width: 769px)': {
    display: 'none',
  },
} as Record<string, unknown>;

// Utility: Stack em mobile, row em desktop
export const stackMobile = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 'clamp(12px, 2vw, 16px)',
  '@media (min-width: 769px)': {
    flexDirection: 'row',
  },
} as Record<string, unknown>;
