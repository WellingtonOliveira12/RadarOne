import { useEffect } from 'react';

interface PageMetaOptions {
  title: string;
  description?: string;
}

/**
 * Hook para definir metadados SEO da página
 *
 * Define:
 * - document.title
 * - meta description (cria ou atualiza)
 *
 * @example
 * ```tsx
 * usePageMeta({
 *   title: 'Planos | RadarOne',
 *   description: 'Conheça os planos do RadarOne'
 * });
 * ```
 */
export function usePageMeta({ title, description }: PageMetaOptions) {
  useEffect(() => {
    // Definir título
    document.title = title;

    // Definir meta description
    if (description) {
      let metaDescription = document.querySelector('meta[name="description"]');

      if (!metaDescription) {
        // Criar meta tag se não existir
        metaDescription = document.createElement('meta');
        metaDescription.setAttribute('name', 'description');
        document.head.appendChild(metaDescription);
      }

      metaDescription.setAttribute('content', description);
    }
  }, [title, description]);
}
