import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { getToken } from '../services/tokenStorage';
import { useAuth } from '../context/AuthContext';
import { trackMonitorCreated } from '../lib/analytics';
import { TrialBanner } from '../components/TrialBanner';
import { AppLayout } from '../components/AppLayout';

type MonitorSite =
  | 'MERCADO_LIVRE'
  | 'OLX'
  | 'FACEBOOK_MARKETPLACE'
  | 'WEBMOTORS'
  | 'ICARROS'
  | 'ZAP_IMOVEIS'
  | 'VIVA_REAL'
  | 'IMOVELWEB'
  | 'OUTRO';

type MonitorMode = 'URL_ONLY' | 'STRUCTURED_FILTERS';

interface StructuredFilters {
  keywords?: string;
  city?: string;
  state?: string;
  minPrice?: number;
  maxPrice?: number;
  minYear?: number;
  maxYear?: number;
  category?: string;
}

interface Monitor {
  id: string;
  name: string;
  site: MonitorSite;
  searchUrl: string;
  mode?: MonitorMode;
  filtersJson?: StructuredFilters;
  active: boolean;
}

interface MonitorsResponse {
  success: boolean;
  data: Monitor[];
  count: number;
}

const SITE_OPTIONS: { value: MonitorSite; label: string }[] = [
  { value: 'MERCADO_LIVRE', label: 'Mercado Livre' },
  { value: 'OLX', label: 'OLX' },
  { value: 'FACEBOOK_MARKETPLACE', label: 'Facebook Marketplace' },
  { value: 'WEBMOTORS', label: 'Webmotors' },
  { value: 'ICARROS', label: 'iCarros' },
  { value: 'ZAP_IMOVEIS', label: 'ZAP Imóveis' },
  { value: 'VIVA_REAL', label: 'VivaReal' },
  { value: 'IMOVELWEB', label: 'ImovelWeb' },
  { value: 'OUTRO', label: 'Outro' },
];

function getSiteLabel(site: MonitorSite): string {
  return SITE_OPTIONS.find((opt) => opt.value === site)?.label ?? site;
}

export function MonitorsPage() {
  useAuth(); // Required for protected route

  // Lista
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loadingLista, setLoadingLista] = useState(false);
  const [error, setError] = useState('');
  const [hasSubscription, setHasSubscription] = useState(true);

  // Formulário
  const [name, setName] = useState('');
  const [site, setSite] = useState<MonitorSite>('MERCADO_LIVRE');
  const [mode, setMode] = useState<MonitorMode>('URL_ONLY');
  const [searchUrl, setSearchUrl] = useState('');
  const [active, setActive] = useState(true);
  const [idSelecionado, setIdSelecionado] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Filtros estruturados
  const [filters, setFilters] = useState<StructuredFilters>({
    keywords: '',
    city: '',
    state: '',
    minPrice: undefined,
    maxPrice: undefined,
    minYear: undefined,
    maxYear: undefined,
    category: '',
  });

  useEffect(() => {
    fetchMonitors();
  }, []);

  async function fetchMonitors() {
    try {
      setLoadingLista(true);
      setError('');

      const token = getToken();
      if (!token) {
        setError('Você precisa fazer login para ver os monitores.');
        return;
      }

      const data = await api.get<MonitorsResponse>('/api/monitors', token);
      setMonitors(data.data);
      setHasSubscription(true);
    } catch (err: any) {
      // Tratar erro de sem assinatura
      const errorCode = err.errorCode || err.response?.data?.errorCode;
      if (errorCode === 'NO_SUBSCRIPTION' || err.message?.includes('precisa assinar')) {
        setHasSubscription(false);
        setError('Você precisa assinar um plano para criar monitores.');
        return;
      }

      // Tratar erro de limite excedido
      if (err.response?.status === 403 || err.message?.includes('limite')) {
        setError(
          err.response?.data?.error ||
            'Limite de monitores atingido. Faça upgrade do seu plano.'
        );
      } else {
        setError(err.message || 'Erro ao buscar monitores');
      }
    } finally {
      setLoadingLista(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const token = getToken();
      if (!token) {
        setError('Você precisa fazer login primeiro.');
        return;
      }

      // Validação de URL
      if (mode === 'URL_ONLY' && searchUrl) {
        try {
          new URL(searchUrl);
        } catch {
          setError('URL inválida. Exemplo: https://www.mercadolivre.com.br/...');
          setSaving(false);
          return;
        }
      }

      const body: any = {
        name,
        site,
        mode,
        active,
      };

      if (mode === 'URL_ONLY') {
        body.searchUrl = searchUrl;
      } else {
        // STRUCTURED_FILTERS
        body.filtersJson = filters;
        // Pode incluir searchUrl como URL base (opcional)
        if (searchUrl) {
          body.searchUrl = searchUrl;
        }
      }

      if (idSelecionado) {
        await api.post(`/api/monitors/${idSelecionado}`, body, token);
      } else {
        await api.post('/api/monitors', body, token);
        // Track monitor creation
        trackMonitorCreated(site, mode);
      }

      // reset
      setName('');
      setSite('MERCADO_LIVRE');
      setMode('URL_ONLY');
      setSearchUrl('');
      setActive(true);
      setIdSelecionado(null);
      setFilters({
        keywords: '',
        city: '',
        state: '',
        minPrice: undefined,
        maxPrice: undefined,
        minYear: undefined,
        maxYear: undefined,
        category: '',
      });

      await fetchMonitors();
    } catch (err: any) {
      // Tratar erro de limite excedido
      if (err.response?.status === 403 || err.message?.includes('limite')) {
        setError(
          err.response?.data?.error ||
            'Limite de monitores atingido. Faça upgrade do seu plano para adicionar mais.'
        );
      } else {
        setError(err.message || 'Erro ao salvar monitor');
      }
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(monitor: Monitor) {
    setName(monitor.name);
    setSite(monitor.site);
    setMode(monitor.mode || 'URL_ONLY');
    setSearchUrl(monitor.searchUrl || '');
    setActive(monitor.active);
    setIdSelecionado(monitor.id);

    if (monitor.mode === 'STRUCTURED_FILTERS' && monitor.filtersJson) {
      setFilters(monitor.filtersJson);
    } else {
      setFilters({
        keywords: '',
        city: '',
        state: '',
        minPrice: undefined,
        maxPrice: undefined,
        minYear: undefined,
        maxYear: undefined,
        category: '',
      });
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm('Tem certeza que deseja excluir este monitor?');
    if (!confirmed) return;

    try {
      setError('');
      const token = getToken();
      if (!token) {
        setError('Você precisa fazer login primeiro.');
        return;
      }

      await api.post(`/api/monitors/${id}`, {}, token);
      await fetchMonitors();
    } catch (err: any) {
      setError(err.message || 'Erro ao excluir monitor');
    }
  }

  function handleCancelEdit() {
    setName('');
    setSite('MERCADO_LIVRE');
    setMode('URL_ONLY');
    setSearchUrl('');
    setActive(true);
    setIdSelecionado(null);
    setFilters({
      keywords: '',
      city: '',
      state: '',
      minPrice: undefined,
      maxPrice: undefined,
      minYear: undefined,
      maxYear: undefined,
      category: '',
    });
  }

  return (
    <AppLayout>
        <div style={styles.breadcrumb}>
          <Link to="/dashboard" style={styles.breadcrumbLink}>
            Dashboard
          </Link>
          <span style={styles.breadcrumbSeparator}>/</span>
          <span style={styles.breadcrumbCurrent}>Monitores</span>
        </div>

        <h1 style={styles.title}>Monitores</h1>
        <p style={styles.subtitle}>
          Configure monitores para receber alertas de novos anúncios
        </p>

        {/* Banner de trial expirando */}
        <TrialBanner />

        {/* Banner de bloqueio sem assinatura */}
        {!hasSubscription && (
          <div style={styles.subscriptionWarning}>
            <div style={styles.warningIcon}>⚠️</div>
            <div style={styles.warningContent}>
              <strong>Você precisa assinar um plano para criar monitores.</strong>
              <p style={styles.warningText}>
                Escolha um plano para começar a monitorar anúncios e receber alertas em tempo real.
              </p>
            </div>
            <Link to="/settings/subscription" style={styles.upgradeButton}>
              Ver planos
            </Link>
          </div>
        )}

        {error && hasSubscription && (
          <div style={styles.error}>
            {error}
            {error.includes('limite') && (
              <div style={styles.upgradeLink}>
                <Link to="/plans" style={styles.link}>
                  Ver planos
                </Link>
              </div>
            )}
          </div>
        )}

        {/* FORMULÁRIO */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <h2 style={styles.formTitle}>
            {idSelecionado ? 'Editar Monitor' : 'Novo Monitor'}
          </h2>

          <fieldset disabled={!hasSubscription} style={styles.fieldset}>

          <div style={styles.field}>
            <label style={styles.label}>Nome do monitor</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={styles.input}
              placeholder="Ex: iPhone 13 Pro usado"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Site</label>
            <select
              value={site}
              onChange={(e) => setSite(e.target.value as MonitorSite)}
              required
              style={styles.input}
            >
              {SITE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Modo de monitoramento</label>
            <div style={styles.radioGroup}>
              <label style={styles.radioLabel}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'URL_ONLY'}
                  onChange={() => setMode('URL_ONLY')}
                  style={styles.radio}
                />
                <span>
                  <strong>URL específica</strong> - Monitorar uma URL de busca exata
                </span>
              </label>
              <label style={styles.radioLabel}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'STRUCTURED_FILTERS'}
                  onChange={() => setMode('STRUCTURED_FILTERS')}
                  style={styles.radio}
                />
                <span>
                  <strong>Filtros personalizados</strong> - Usar filtros como
                  palavra-chave, cidade, preço, etc.
                </span>
              </label>
            </div>
          </div>

          {mode === 'URL_ONLY' && (
            <div style={styles.field}>
              <label style={styles.label}>URL de busca</label>
              <input
                type="url"
                value={searchUrl}
                onChange={(e) => setSearchUrl(e.target.value)}
                required
                style={styles.input}
                placeholder="https://www.olx.com.br/..."
              />
              <p style={styles.helpText}>
                Cole aqui a URL completa da busca que você quer monitorar.
              </p>
            </div>
          )}

          {mode === 'STRUCTURED_FILTERS' && (
            <div style={styles.filtersBox}>
              <h3 style={styles.filtersTitle}>Filtros personalizados</h3>

              <div style={styles.filtersGrid}>
                <div style={styles.field}>
                  <label style={styles.labelSmall}>Palavras-chave</label>
                  <input
                    type="text"
                    value={filters.keywords || ''}
                    onChange={(e) =>
                      setFilters({ ...filters, keywords: e.target.value })
                    }
                    style={styles.input}
                    placeholder="iPhone 13 Pro"
                  />
                </div>

                <div style={styles.field}>
                  <label style={styles.labelSmall}>Cidade</label>
                  <input
                    type="text"
                    value={filters.city || ''}
                    onChange={(e) => setFilters({ ...filters, city: e.target.value })}
                    style={styles.input}
                    placeholder="São Paulo"
                  />
                </div>

                <div style={styles.field}>
                  <label style={styles.labelSmall}>Estado</label>
                  <input
                    type="text"
                    value={filters.state || ''}
                    onChange={(e) => setFilters({ ...filters, state: e.target.value })}
                    style={styles.input}
                    placeholder="SP"
                  />
                </div>

                <div style={styles.field}>
                  <label style={styles.labelSmall}>Categoria</label>
                  <input
                    type="text"
                    value={filters.category || ''}
                    onChange={(e) =>
                      setFilters({ ...filters, category: e.target.value })
                    }
                    style={styles.input}
                    placeholder="Eletrônicos"
                  />
                </div>

                <div style={styles.field}>
                  <label style={styles.labelSmall}>Preço mínimo (R$)</label>
                  <input
                    type="number"
                    min="0"
                    max="999999999"
                    value={filters.minPrice || ''}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        minPrice: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    style={styles.input}
                    placeholder="1000"
                  />
                </div>

                <div style={styles.field}>
                  <label style={styles.labelSmall}>Preço máximo (R$)</label>
                  <input
                    type="number"
                    min="0"
                    max="999999999"
                    value={filters.maxPrice || ''}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        maxPrice: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    style={styles.input}
                    placeholder="5000"
                  />
                </div>

                <div style={styles.field}>
                  <label style={styles.labelSmall}>Ano mínimo</label>
                  <input
                    type="number"
                    min="1900"
                    max="2026"
                    value={filters.minYear || ''}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        minYear: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    style={styles.input}
                    placeholder="2020"
                  />
                </div>

                <div style={styles.field}>
                  <label style={styles.labelSmall}>Ano máximo</label>
                  <input
                    type="number"
                    min="1900"
                    max="2026"
                    value={filters.maxYear || ''}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        maxYear: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    style={styles.input}
                    placeholder="2024"
                  />
                </div>
              </div>

              <div style={styles.field}>
                <label style={styles.labelSmall}>URL base (opcional)</label>
                <input
                  type="url"
                  value={searchUrl}
                  onChange={(e) => setSearchUrl(e.target.value)}
                  style={styles.input}
                  placeholder="https://www.olx.com.br/"
                />
                <p style={styles.helpText}>
                  Opcional: URL base do site para facilitar a busca
                </p>
              </div>
            </div>
          )}

          <div style={styles.field}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              <span>Monitor ativo</span>
            </label>
          </div>

          </fieldset>

          <div style={styles.buttons}>
            <button type="submit" disabled={saving || !hasSubscription} style={styles.saveButton}>
              {saving ? 'Salvando...' : idSelecionado ? 'Atualizar' : 'Criar monitor'}
            </button>

            {idSelecionado && (
              <button
                type="button"
                onClick={handleCancelEdit}
                style={styles.cancelButton}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>

        {/* LISTA */}
        <h2 style={styles.sectionTitle}>Seus Monitores</h2>

        {loadingLista && <p style={styles.loading}>Carregando monitores...</p>}

        {!loadingLista && !error && monitors.length === 0 && (
          <div style={styles.emptyState}>
            <p>Nenhum monitor cadastrado ainda.</p>
            <p>Crie seu primeiro monitor acima para começar!</p>
          </div>
        )}

        {!loadingLista && monitors.length > 0 && (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Nome</th>
                  <th style={styles.th}>Site</th>
                  <th style={styles.th}>Modo</th>
                  <th style={styles.th}>URL</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {monitors.map((monitor) => (
                  <tr key={monitor.id} style={styles.tr}>
                    <td style={styles.td}>{monitor.name}</td>
                    <td style={styles.td}>{getSiteLabel(monitor.site)}</td>
                    <td style={styles.td}>
                      {monitor.mode === 'STRUCTURED_FILTERS' ? (
                        <span style={styles.badgeFilters}>Filtros</span>
                      ) : (
                        <span style={styles.badgeUrl}>URL</span>
                      )}
                    </td>
                    <td style={styles.tdUrl}>
                      {monitor.searchUrl ? (
                        <a
                          href={monitor.searchUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={styles.link}
                        >
                          {monitor.searchUrl}
                        </a>
                      ) : (
                        <span style={styles.noUrl}>-</span>
                      )}
                    </td>
                    <td style={styles.tdCenter}>
                      {monitor.active ? (
                        <span style={styles.badgeActive}>✅ Ativo</span>
                      ) : (
                        <span style={styles.badgeInactive}>❌ Inativo</span>
                      )}
                    </td>
                    <td style={styles.tdCenter}>
                      <button onClick={() => handleEdit(monitor)} style={styles.editBtn}>
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(monitor.id)}
                        style={styles.deleteBtn}
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </AppLayout>
  );
}

const styles = {
  breadcrumb: {
    marginBottom: '24px',
    fontSize: '14px',
  },
  breadcrumbLink: {
    color: '#3b82f6',
    textDecoration: 'none',
  },
  breadcrumbSeparator: {
    margin: '0 8px',
    color: '#9ca3af',
  },
  breadcrumbCurrent: {
    color: '#6b7280',
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold' as const,
    color: '#1f2937',
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '16px',
    color: '#6b7280',
    marginBottom: '32px',
  },
  error: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  upgradeLink: {
    marginTop: '8px',
  },
  link: {
    color: '#3b82f6',
    textDecoration: 'underline',
    fontWeight: '600' as const,
  },
  form: {
    backgroundColor: 'white',
    padding: '32px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    marginBottom: '32px',
  },
  formTitle: {
    fontSize: '20px',
    fontWeight: '600' as const,
    color: '#1f2937',
    marginTop: 0,
    marginBottom: '24px',
  },
  field: {
    marginBottom: '20px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '500' as const,
    color: '#374151',
    display: 'block',
    marginBottom: '6px',
  },
  labelSmall: {
    fontSize: '13px',
    fontWeight: '500' as const,
    color: '#374151',
    display: 'block',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
  },
  helpText: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '4px',
    marginBottom: 0,
  },
  radioGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    fontSize: '14px',
    cursor: 'pointer',
  },
  radio: {
    marginTop: '3px',
    cursor: 'pointer',
  },
  filtersBox: {
    backgroundColor: '#f9fafb',
    padding: '20px',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    marginBottom: '20px',
  },
  filtersTitle: {
    fontSize: '16px',
    fontWeight: '600' as const,
    color: '#1f2937',
    marginTop: 0,
    marginBottom: '16px',
  },
  filtersGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    cursor: 'pointer',
  },
  buttons: {
    display: 'flex',
    gap: '12px',
    marginTop: '24px',
  },
  saveButton: {
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600' as const,
    cursor: 'pointer',
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600' as const,
    cursor: 'pointer',
  },
  sectionTitle: {
    fontSize: '24px',
    fontWeight: 'bold' as const,
    color: '#1f2937',
    marginBottom: '20px',
  },
  loading: {
    textAlign: 'center' as const,
    color: '#6b7280',
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '40px',
    backgroundColor: 'white',
    borderRadius: '12px',
    color: '#6b7280',
  },
  tableWrapper: {
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
  },
  th: {
    padding: '12px 16px',
    textAlign: 'left' as const,
    backgroundColor: '#f9fafb',
    borderBottom: '2px solid #e5e7eb',
    fontSize: '13px',
    fontWeight: '600' as const,
    color: '#374151',
  },
  tr: {
    borderBottom: '1px solid #e5e7eb',
  },
  td: {
    padding: '12px 16px',
    fontSize: '14px',
    color: '#1f2937',
  },
  tdUrl: {
    padding: '12px 16px',
    fontSize: '14px',
    color: '#1f2937',
    maxWidth: '300px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  tdCenter: {
    padding: '12px 16px',
    fontSize: '14px',
    color: '#1f2937',
    textAlign: 'center' as const,
  },
  badgeFilters: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    padding: '3px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600' as const,
  },
  badgeUrl: {
    backgroundColor: '#f3f4f6',
    color: '#374151',
    padding: '3px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600' as const,
  },
  badgeActive: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
    padding: '3px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600' as const,
  },
  badgeInactive: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '3px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600' as const,
  },
  noUrl: {
    color: '#9ca3af',
    fontSize: '13px',
  },
  editBtn: {
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '13px',
    fontWeight: '500' as const,
    cursor: 'pointer',
    marginRight: '8px',
  },
  deleteBtn: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '13px',
    fontWeight: '500' as const,
    cursor: 'pointer',
  },
  subscriptionWarning: {
    backgroundColor: '#fef3c7',
    borderLeft: '4px solid #f59e0b',
    padding: '20px',
    marginBottom: '24px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap' as const,
  },
  warningIcon: {
    fontSize: '32px',
  },
  warningContent: {
    flex: '1',
    minWidth: '250px',
  },
  warningText: {
    margin: '8px 0 0 0',
    fontSize: '14px',
    color: '#92400e',
  },
  upgradeButton: {
    backgroundColor: '#f59e0b',
    color: 'white',
    padding: '12px 24px',
    borderRadius: '6px',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '600' as const,
    whiteSpace: 'nowrap' as const,
    display: 'inline-block',
  },
  fieldset: {
    border: 'none',
    padding: 0,
    margin: 0,
  },
};
