import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { PublicLayout } from '../components/PublicLayout';
import { TELEGRAM_BOT_USERNAME } from '../constants/app';
import { usePageMeta } from '../hooks/usePageMeta';

interface FAQItem {
  question: string;
  answer: string | React.ReactNode;
  category: string;
}

export const FAQPage: React.FC = () => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // SEO meta
  usePageMeta({
    title: 'Perguntas Frequentes | RadarOne',
    description: 'Tire dúvidas sobre planos, recursos e funcionamento do RadarOne.',
  });

  const toggleFAQ = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const faqs: FAQItem[] = [
    {
      category: 'Telegram',
      question: 'Qual é o bot oficial do Telegram?',
      answer: (
        <>
          O bot oficial é <strong>@{TELEGRAM_BOT_USERNAME}</strong>.{' '}
          <strong>Nunca pesquise "RadarOne" no Telegram!</strong> Use apenas o
          link gerado em{' '}
          <Link to="/telegram/connect" style={styles.link}>
            Conectar Telegram
          </Link>
          .
        </>
      ),
    },
    {
      category: 'Telegram',
      question: 'O Telegram mostrou um bot com outro nome/idioma (ex: russo)',
      answer:
        'Você abriu o bot errado! Esses bots podem ter nomes parecidos mas não são o RadarOne oficial. Volte ao painel, clique em "Gerar link de conexão" e use o link oficial. NÃO pesquise manualmente.',
    },
    {
      category: 'Telegram',
      question: 'Como saber se conectei corretamente?',
      answer:
        `Ao conectar, você deve receber uma mensagem "✅ Telegram conectado ao RadarOne com sucesso!" no chat. O username do bot deve ser @${TELEGRAM_BOT_USERNAME}. Verifique também em Configurações > Telegram se aparece "Telegram conectado".`,
    },
    {
      category: 'Telegram',
      question: 'Não recebo alertas no Telegram',
      answer: (
        <>
          Possíveis causas:
          <ul>
            <li>
              Você está conectado no bot errado (verifique se é
              @{TELEGRAM_BOT_USERNAME})
            </li>
            <li>Você não gerou monitores ou eles estão pausados</li>
            <li>Não há novos anúncios correspondentes aos seus critérios</li>
            <li>
              Verifique em{' '}
              <Link to="/telegram/connect" style={styles.link}>
                Configurações
              </Link>{' '}
              se o Telegram está conectado
            </li>
          </ul>
          Se ainda não funcionar, desconecte e conecte novamente usando o link
          oficial.
        </>
      ),
    },
    {
      category: 'Telegram',
      question: 'Posso conectar mais de um Telegram?',
      answer:
        'No momento, cada conta RadarOne suporta apenas um Telegram conectado. Se você reconectar com outro chat, o anterior será desvinculado.',
    },
    {
      category: 'Conexão de Conta',
      question: 'O que é "Conectar Conta"?',
      answer: (
        <>
          Alguns sites, como o Mercado Livre, exigem que você esteja logado para ver
          certos anúncios. A funcionalidade "Conectar Conta" permite que o RadarOne
          use uma sessão do seu navegador para acessar esses anúncios. Você exporta
          os cookies do seu navegador e faz upload no RadarOne.{' '}
          <Link to="/settings/connections" style={styles.link}>
            Conectar agora
          </Link>
        </>
      ),
    },
    {
      category: 'Conexão de Conta',
      question: 'É seguro conectar minha conta?',
      answer: (
        <>
          Sim! <strong>Nunca pedimos sua senha</strong>. O RadarOne armazena apenas
          os cookies de sessão (como se você estivesse logado no navegador). Esses
          dados são criptografados com <strong>AES-256-GCM</strong> antes de serem
          salvos. Você pode revogar a conexão a qualquer momento em{' '}
          <Link to="/settings/connections" style={styles.link}>
            Conexões
          </Link>
          .
        </>
      ),
    },
    {
      category: 'Conexão de Conta',
      question: 'Como exportar os cookies do navegador?',
      answer: (
        <>
          <strong>Método mais fácil (Chrome):</strong>
          <ol style={{ paddingLeft: '20px', marginTop: '8px' }}>
            <li>
              Instale a extensão{' '}
              <a
                href="https://chrome.google.com/webstore/detail/export-cookies/njklnbpdibmhcpfggcfhgcakklcjigfa"
                target="_blank"
                rel="noopener noreferrer"
                style={styles.link}
              >
                Export Cookies
              </a>
            </li>
            <li>Faça login no site (ex: Mercado Livre)</li>
            <li>Clique na extensão e exporte como JSON</li>
            <li>Faça upload em <Link to="/settings/connections" style={styles.link}>Conexões</Link></li>
          </ol>
        </>
      ),
    },
    {
      category: 'Conexão de Conta',
      question: 'O RadarOne pediu para reconectar. O que fazer?',
      answer:
        'Isso acontece quando o site (ex: Mercado Livre) invalidou sua sessão, ' +
        'geralmente por tempo ou mudança de senha. Basta repetir o processo: ' +
        'faça login novamente no site, exporte os cookies e faça upload no RadarOne.',
    },
    {
      category: 'Conexão de Conta',
      question: 'Preciso conectar para todos os sites?',
      answer:
        'Não. Apenas sites que exigem login precisam de conexão. ' +
        'OLX, WebMotors, iCarros e outros geralmente não precisam. ' +
        'O Mercado Livre é o principal que exige login para ver todos os anúncios.',
    },
    {
      category: 'Monitores',
      question: 'Como criar um monitor?',
      answer: (
        <>
          1) Acesse o site de anúncios (Mercado Livre, OLX, etc.)
          <br />
          2) Faça uma busca manual com todos os filtros desejados
          <br />
          3) Copie a URL completa da busca
          <br />
          4) Em{' '}
          <Link to="/monitors" style={styles.link}>
            Monitores
          </Link>
          , clique em "Criar Monitor"
          <br />
          5) Cole a URL e configure filtros adicionais (preço, etc.)
          <br />
          6) Salve
        </>
      ),
    },
    {
      category: 'Monitores',
      question: 'Como pausar um monitor temporariamente?',
      answer:
        'Acesse Monitores, encontre o monitor desejado e clique no botão de pausar/desativar. Você pode reativá-lo a qualquer momento sem perder as configurações.',
    },
    {
      category: 'Monitores',
      question: 'O que fazer se a URL do site mudar?',
      answer:
        'Se o site redesenhar a estrutura de URLs, você precisará criar um novo monitor com a nova URL. Edite ou exclua o monitor antigo para evitar erros.',
    },
    {
      category: 'Conta e Planos',
      question: 'Posso testar antes de assinar?',
      answer:
        'Sim! Todos os planos têm 7 dias de teste grátis. Você pode cancelar a qualquer momento antes do fim do período de teste.',
    },
    {
      category: 'Conta e Planos',
      question: 'Como cancelar minha assinatura?',
      answer: (
        <>
          Acesse{' '}
          <Link to="/subscription/settings" style={styles.link}>
            Configurações de Assinatura
          </Link>{' '}
          e clique em "Cancelar assinatura". Seus monitores continuarão
          funcionando até o fim do período pago.
        </>
      ),
    },
    {
      category: 'Alertas',
      question: 'Não recebo e-mails de alerta',
      answer: (
        <>
          Verifique:
          <ul>
            <li>
              <strong>Spam:</strong> Adicione noreply@radarone.com.br aos
              contatos
            </li>
            <li>
              <strong>E-mail correto:</strong> Confirme em Configurações de
              Conta
            </li>
            <li>
              <strong>Monitores ativos:</strong> Verifique se há monitores em
              funcionamento
            </li>
          </ul>
          Se nada funcionar, entre em{' '}
          <Link to="/contact" style={styles.link}>
            contato
          </Link>
          .
        </>
      ),
    },
    {
      category: 'Alertas',
      question: 'Por que recebo muitos alertas repetidos?',
      answer:
        'Isso pode acontecer se seus filtros estiverem muito amplos. Tente refinar a busca adicionando filtros de preço, localização ou palavras-chave específicas.',
    },
    {
      category: 'Suporte',
      question: 'Como entro em contato com o suporte?',
      answer: (
        <>
          Use a página{' '}
          <Link to="/contact" style={styles.link}>
            Fale Conosco
          </Link>{' '}
          ou envie e-mail para contato@radarone.com.br. Respondemos em até 24
          horas úteis.
        </>
      ),
    },
  ];

  const categories = Array.from(new Set(faqs.map((faq) => faq.category)));

  return (
    <PublicLayout maxWidth="container.xl">
      <div style={styles.container}>
        <h1 style={styles.title}>Perguntas Frequentes (FAQ)</h1>
        <p style={styles.subtitle}>
          Encontre respostas rápidas para as dúvidas mais comuns
        </p>

        {categories.map((category) => (
          <div key={category} style={styles.categorySection}>
            <h2 style={styles.categoryTitle}>{category}</h2>
            {faqs
              .filter((faq) => faq.category === category)
              .map((faq) => {
                const globalIndex = faqs.indexOf(faq);
                const isExpanded = expandedIndex === globalIndex;

                return (
                  <div key={globalIndex} style={styles.faqItem}>
                    <button
                      onClick={() => toggleFAQ(globalIndex)}
                      style={styles.questionButton}
                    >
                      <span style={styles.questionText}>{faq.question}</span>
                      <span style={styles.icon}>{isExpanded ? '−' : '+'}</span>
                    </button>
                    {isExpanded && (
                      <div style={styles.answer}>{faq.answer}</div>
                    )}
                  </div>
                );
              })}
          </div>
        ))}

        {/* Links Úteis */}
        <div style={styles.helpSection}>
          <h3 style={styles.helpTitle}>Não encontrou sua resposta?</h3>
          <div style={styles.helpLinks}>
            <Link to="/manual" style={styles.helpLink}>
              📖 Ver Manual Completo
            </Link>
            <Link to="/contact" style={styles.helpLink}>
              💬 Fale Conosco
            </Link>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
};

const styles = {
  container: {
    maxWidth: '800px',
    margin: '0 auto',
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '16px',
    color: '#6b7280',
    marginBottom: '32px',
  },
  categorySection: {
    marginBottom: '32px',
  },
  categoryTitle: {
    fontSize: '24px',
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: '16px',
    paddingBottom: '8px',
    borderBottom: '2px solid #e5e7eb',
  },
  faqItem: {
    backgroundColor: 'white',
    borderRadius: '8px',
    marginBottom: '12px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    overflow: 'hidden',
  },
  questionButton: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    backgroundColor: 'white',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontSize: '16px',
    fontWeight: '500',
    color: '#1f2937',
  },
  questionText: {
    flex: 1,
  },
  icon: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#3b82f6',
    marginLeft: '16px',
  },
  answer: {
    padding: '0 20px 20px 20px',
    fontSize: '14px',
    lineHeight: '1.6',
    color: '#4b5563',
    backgroundColor: '#f9fafb',
  },
  link: {
    color: '#3b82f6',
    textDecoration: 'none',
    fontWeight: '500',
  },
  helpSection: {
    backgroundColor: '#e0f2fe',
    border: '1px solid #7dd3fc',
    borderRadius: '12px',
    padding: '24px',
    textAlign: 'center' as const,
    marginTop: '40px',
  },
  helpTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#0369a1',
    marginTop: 0,
    marginBottom: '16px',
  },
  helpLinks: {
    display: 'flex',
    justifyContent: 'center',
    gap: '16px',
    flexWrap: 'wrap' as const,
  },
  helpLink: {
    display: 'inline-block',
    backgroundColor: '#3b82f6',
    color: 'white',
    padding: '12px 24px',
    borderRadius: '6px',
    textDecoration: 'none',
    fontWeight: '600',
  },
};
