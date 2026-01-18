import React from 'react';
import { Link } from 'react-router-dom';
import { PublicLayout } from '../components/PublicLayout';
import { TELEGRAM_BOT_USERNAME } from '../constants/app';
import { usePageMeta } from '../hooks/usePageMeta';

export const ManualPage: React.FC = () => {
  // SEO meta
  usePageMeta({
    title: 'Manual | RadarOne',
    description: 'Aprenda a usar o RadarOne com o guia passo a passo completo.',
  });

  return (
    <PublicLayout maxWidth="container.xl">
      <div style={styles.container}>
        <h1 style={styles.title}>Manual do RadarOne</h1>
        <p style={styles.subtitle}>
          Guia completo para usar o RadarOne e receber alertas de anúncios
        </p>

        {/* Primeiros Passos */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>1. Primeiros Passos</h2>
          <p>
            O RadarOne monitora sites de anúncios e envia alertas quando novos
            anúncios correspondentes aos seus critérios são publicados.
          </p>
          <ol style={styles.list}>
            <li>Faça login ou crie sua conta</li>
            <li>Escolha um plano (ou teste grátis)</li>
            <li>Configure seu Telegram para receber alertas</li>
            <li>Crie seus primeiros monitores</li>
          </ol>
        </section>

        {/* Conectar Telegram */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>2. Conectar Telegram</h2>

          <div style={styles.warningBox}>
            <strong>⚠️ IMPORTANTE:</strong> Nunca pesquise "RadarOne" no Telegram!
            Use apenas o link oficial para evitar bots errados.
          </div>

          <h3 style={styles.subsectionTitle}>Passo a passo:</h3>
          <ol style={styles.list}>
            <li>
              Acesse{' '}
              <Link to="/telegram/connect" style={styles.link}>
                Configurações &gt; Conectar Telegram
              </Link>
            </li>
            <li>Clique em "Gerar link de conexão"</li>
            <li>Clique em "Abrir bot oficial no Telegram"</li>
            <li>Confirme que o username é @{TELEGRAM_BOT_USERNAME}</li>
            <li>
              Aguarde a mensagem "✅ Telegram conectado ao RadarOne com
              sucesso!"
            </li>
          </ol>

          <h3 style={styles.subsectionTitle}>Validação visual:</h3>
          <ul style={styles.list}>
            <li>✅ Username correto: @{TELEGRAM_BOT_USERNAME}</li>
            <li>✅ Mensagem de boas-vindas menciona RadarOne e monitores</li>
            <li>
              ❌ Se aparecer bot em outro idioma/nome estranho, é o bot errado
            </li>
          </ul>
        </section>

        {/* Conectar Conta (Sessões) */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>3. Conectar Conta (sites com login)</h2>
          <p>
            Alguns sites, como o <strong>Mercado Livre</strong>, exigem login para
            mostrar certos anúncios. Para monitorá-los, você precisa "conectar" sua conta.
          </p>

          <div style={styles.infoBox}>
            <strong>🔒 Segurança:</strong> Nunca pedimos sua senha. A conexão usa
            apenas os cookies do navegador (sessão), que são criptografados com AES-256.
          </div>

          <h3 style={styles.subsectionTitle}>Passo a passo:</h3>
          <ol style={styles.list}>
            <li>
              Acesse{' '}
              <Link to="/connections" style={styles.link}>
                Conexões
              </Link>
            </li>
            <li>Escolha o site que deseja conectar (ex: Mercado Livre)</li>
            <li>Faça login normalmente no site em uma nova aba</li>
            <li>
              Exporte os cookies usando uma extensão (veja abaixo) ou o Playwright CLI
            </li>
            <li>Faça upload do arquivo .json no RadarOne</li>
            <li>Pronto! O RadarOne usará essa sessão nos monitores</li>
          </ol>

          <h3 style={styles.subsectionTitle}>Como exportar os cookies (mais fácil):</h3>
          <ul style={styles.list}>
            <li>
              Instale a extensão{' '}
              <a href="https://chrome.google.com/webstore/detail/export-cookies/njklnbpdibmhcpfggcfhgcakklcjigfa" target="_blank" rel="noopener noreferrer" style={styles.link}>
                Export Cookies
              </a>
              {' '}no Chrome
            </li>
            <li>Faça login no site (ex: Mercado Livre)</li>
            <li>Clique na extensão e exporte como JSON</li>
            <li>Faça upload do arquivo no RadarOne</li>
          </ul>

          <h3 style={styles.subsectionTitle}>Quando reconectar?</h3>
          <ul style={styles.list}>
            <li>Se o RadarOne avisar que a sessão expirou ou precisa reautenticação</li>
            <li>Se você trocar a senha do site</li>
            <li>Normalmente a cada 7-30 dias (depende do site)</li>
          </ul>
        </section>

        {/* Criar Monitor */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>4. Criar Monitor</h2>
          <p>
            Monitores são as buscas que o RadarOne faz automaticamente nos sites
            de anúncios.
          </p>

          <h3 style={styles.subsectionTitle}>URL Específica:</h3>
          <ol style={styles.list}>
            <li>
              Acesse{' '}
              <Link to="/monitors" style={styles.link}>
                Monitores
              </Link>
            </li>
            <li>Clique em "Criar Monitor"</li>
            <li>Escolha o site (Mercado Livre, OLX, etc.)</li>
            <li>Cole a URL da busca que você quer monitorar</li>
            <li>Configure filtros de preço (opcional)</li>
            <li>Clique em "Salvar"</li>
          </ol>

          <h3 style={styles.subsectionTitle}>Como obter a URL:</h3>
          <ul style={styles.list}>
            <li>Faça uma busca manual no site (ex: Mercado Livre)</li>
            <li>Aplique todos os filtros desejados (categoria, localização, etc.)</li>
            <li>Copie a URL completa da barra de endereço</li>
            <li>Cole no RadarOne</li>
          </ul>
        </section>

        {/* Como Chegam os Alertas */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>5. Como Chegam os Alertas</h2>
          <p>Quando um novo anúncio é detectado, você recebe:</p>
          <ul style={styles.list}>
            <li>
              <strong>E-mail:</strong> Sempre ativo (enviado para {'{seu_email}'}
              )
            </li>
            <li>
              <strong>Telegram:</strong> Se você configurou (notificação
              instantânea)
            </li>
          </ul>

          <p>
            O alerta contém: título do anúncio, preço, link direto e nome do
            monitor.
          </p>
        </section>

        {/* Problemas Comuns */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>6. Problemas Comuns</h2>

          <h3 style={styles.subsectionTitle}>Bot errado / não recebe alertas:</h3>
          <ol style={styles.list}>
            <li>Verifique se está em @{TELEGRAM_BOT_USERNAME} (username oficial)</li>
            <li>
              Se estiver em outro bot, volte ao painel e gere novo link
            </li>
            <li>Clique em "Abrir bot oficial" (não pesquise manualmente)</li>
            <li>Aguarde confirmação "✅ Conectado"</li>
          </ol>

          <h3 style={styles.subsectionTitle}>URL inválida:</h3>
          <ul style={styles.list}>
            <li>Certifique-se de copiar a URL completa (incluindo filtros)</li>
            <li>Use URLs de busca, não de anúncios individuais</li>
            <li>Não edite a URL manualmente</li>
          </ul>

          <h3 style={styles.subsectionTitle}>Não recebo e-mails:</h3>
          <ul style={styles.list}>
            <li>Verifique sua caixa de spam</li>
            <li>Adicione noreply@radarone.com.br aos contatos</li>
            <li>Confira se o e-mail está correto no perfil</li>
          </ul>
        </section>

        {/* Boas Práticas */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>7. Boas Práticas</h2>
          <ul style={styles.list}>
            <li>Use filtros de preço para reduzir alertas irrelevantes</li>
            <li>Crie monitores específicos (não genéricos demais)</li>
            <li>Pause monitores que não estão mais relevantes</li>
            <li>Verifique regularmente seus monitores ativos</li>
            <li>
              Sempre use o link oficial para conectar o Telegram (nunca
              pesquise)
            </li>
          </ul>
        </section>

        {/* Links Úteis */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Links Úteis</h2>
          <ul style={styles.linkList}>
            <li>
              <Link to="/connections" style={styles.link}>
                Conectar Conta (Mercado Livre, etc.)
              </Link>
            </li>
            <li>
              <Link to="/telegram/connect" style={styles.link}>
                Conectar Telegram
              </Link>
            </li>
            <li>
              <Link to="/monitors" style={styles.link}>
                Gerenciar Monitores
              </Link>
            </li>
            <li>
              <Link to="/faq" style={styles.link}>
                Perguntas Frequentes (FAQ)
              </Link>
            </li>
            <li>
              <Link to="/contact" style={styles.link}>
                Fale Conosco
              </Link>
            </li>
          </ul>
        </section>
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
  section: {
    backgroundColor: 'white',
    padding: '32px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '24px',
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 0,
    marginBottom: '16px',
  },
  subsectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#374151',
    marginTop: '20px',
    marginBottom: '12px',
  },
  list: {
    paddingLeft: '24px',
    lineHeight: '1.8',
    color: '#4b5563',
  },
  linkList: {
    listStyle: 'none',
    padding: 0,
    lineHeight: '2',
  },
  link: {
    color: '#3b82f6',
    textDecoration: 'none',
    fontWeight: '500',
  },
  warningBox: {
    backgroundColor: '#fef3c7',
    border: '2px solid #f59e0b',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
    color: '#92400e',
  },
  infoBox: {
    backgroundColor: '#e0f2fe',
    border: '2px solid #0ea5e9',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
    color: '#0369a1',
  },
};
