import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Container } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { getToken } from '../lib/auth';
import { useAuth } from '../context/AuthContext';
import { trackMonitorCreated } from '../lib/analytics';
import { TrialBanner } from '../components/TrialBanner';
import { AppLayout } from '../components/AppLayout';
import { getCountryList } from '../utils/countries';
import { getSiteDefaultUrl, isDefaultUrl } from '../constants/siteDefaults';
import * as responsive from '../styles/responsive';

type MonitorSite =
  | 'MERCADO_LIVRE'
  | 'OLX'
  | 'FACEBOOK_MARKETPLACE'
  | 'WEBMOTORS'
  | 'ICARROS'
  | 'ZAP_IMOVEIS'
  | 'VIVA_REAL'
  | 'IMOVELWEB'
  | 'LEILAO';

type MonitorMode = 'URL_ONLY' | 'STRUCTURED_FILTERS';

interface StructuredFilters {
  keywords?: string;
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
  country?: string | null;
  stateRegion?: string;
  city?: string;
}

interface MonitorsResponse {
  success: boolean;
  data: Monitor[];
  count: number;
}

const SITE_OPTIONS: { value: MonitorSite; label: string; requiresLogin: boolean }[] = [
  { value: 'MERCADO_LIVRE', label: 'Mercado Livre', requiresLogin: true },
  { value: 'OLX', label: 'OLX', requiresLogin: false },
  { value: 'FACEBOOK_MARKETPLACE', label: 'Facebook Marketplace', requiresLogin: true },
  { value: 'WEBMOTORS', label: 'Webmotors', requiresLogin: false },
  { value: 'ICARROS', label: 'iCarros', requiresLogin: false },
  { value: 'ZAP_IMOVEIS', label: 'ZAP Imóveis', requiresLogin: false },
  { value: 'VIVA_REAL', label: 'VivaReal', requiresLogin: false },
  { value: 'IMOVELWEB', label: 'ImovelWeb', requiresLogin: false },
  { value: 'LEILAO', label: 'Leilão', requiresLogin: false },
];

// Sites que requerem login
const SITES_REQUIRING_LOGIN = SITE_OPTIONS.filter(s => s.requiresLogin).map(s => s.value);

function getSiteLabel(site: MonitorSite): string {
  return SITE_OPTIONS.find((opt) => opt.value === site)?.label ?? site;
}

const URL_PLACEHOLDERS: Record<MonitorSite, string> = {
  MERCADO_LIVRE: 'https://lista.mercadolivre.com.br/iphone-13',
  OLX: 'https://www.olx.com.br/eletronicos-e-celulares',
  FACEBOOK_MARKETPLACE: 'https://www.facebook.com/marketplace/category/...',
  WEBMOTORS: 'https://www.webmotors.com.br/carros/estoque?...',
  ICARROS: 'https://www.icarros.com.br/comprar/...',
  ZAP_IMOVEIS: 'https://www.zapimoveis.com.br/venda/apartamentos/...',
  VIVA_REAL: 'https://www.vivareal.com.br/venda/...',
  IMOVELWEB: 'https://www.imovelweb.com.br/apartamentos-venda-...',
  LEILAO: 'https://www.leilao.com.br/...',
};

const DEFAULT_FILTERS: StructuredFilters = {
  keywords: '',
  minPrice: undefined,
  maxPrice: undefined,
  minYear: undefined,
  maxYear: undefined,
  category: '',
};

export function MonitorsPage() {
  useAuth(); // Required for protected route
  const { t, i18n } = useTranslation();

  // Lista
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loadingLista, setLoadingLista] = useState(false);
  const [error, setError] = useState('');
  const [hasSubscription, setHasSubscription] = useState(true);
  const [sessionStatus, setSessionStatus] = useState<Record<string, { connected: boolean; status?: string }>>({});

  // Formulário
  const [name, setName] = useState('');
  const [site, setSite] = useState<MonitorSite>('MERCADO_LIVRE');
  const [mode, setMode] = useState<MonitorMode>('URL_ONLY');
  const [searchUrl, setSearchUrl] = useState('');
  const [active, setActive] = useState(true);
  const [idSelecionado, setIdSelecionado] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Localização (global)
  const [country, setCountry] = useState('BR');
  const [stateRegion, setStateRegion] = useState('');
  const [city, setCity] = useState('');

  // Filtros estruturados (sem city/state — ficam só em Localização)
  const [filters, setFilters] = useState<StructuredFilters>({ ...DEFAULT_FILTERS });

  // Dirty flag: true se o usuário editou manualmente a URL base
  const [urlBaseManuallyEdited, setUrlBaseManuallyEdited] = useState(false);

  // Lista de países (reativa ao idioma)
  const countryList = getCountryList(i18n.language);

  useEffect(() => {
    fetchMonitors();
    fetchSessionStatus();
  }, []);

  // Busca status das sessões para sites que requerem login
  async function fetchSessionStatus() {
    try {
      const token = getToken();
      if (!token) return;

      const data = await api.request<{ sessions: Array<{ site: string; status: string }> }>('/api/sessions', {
        method: 'GET',
        token,
        skipAutoLogout: true,
      });
      const statusMap: Record<string, { connected: boolean; status?: string }> = {};

      SITES_REQUIRING_LOGIN.forEach(siteId => {
        statusMap[siteId] = { connected: false };
      });

      data.sessions?.forEach((session) => {
        statusMap[session.site] = {
          connected: session.status === 'ACTIVE',
          status: session.status,
        };
      });

      setSessionStatus(statusMap);
    } catch (err) {
      console.error('Erro ao buscar status de sessões:', err);
    }
  }

  async function fetchMonitors() {
    try {
      setLoadingLista(true);
      setError('');

      const token = getToken();
      if (!token) {
        setError(t('monitors.errorLogin'));
        return;
      }

      const data = await api.request<MonitorsResponse>('/api/monitors', {
        method: 'GET',
        token,
        skipAutoLogout: true,
      });
      setMonitors(data.data);
      setHasSubscription(true);
    } catch (err: any) {
      const errorCode = err.errorCode || err.response?.data?.errorCode;
      if (errorCode === 'NO_SUBSCRIPTION' || err.message?.includes('precisa assinar')) {
        setHasSubscription(false);
        setError(t('monitors.subscriptionRequired'));
        return;
      }

      if (err.response?.status === 403 || err.message?.includes('limite')) {
        setError(
          err.response?.data?.error || t('monitors.errorLimitReached')
        );
      } else {
        setError(err.message || t('monitors.errorFetch'));
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
        setError(t('monitors.errorLoginFirst'));
        return;
      }

      // Validação de URL
      if (mode === 'URL_ONLY' && searchUrl) {
        try {
          new URL(searchUrl);
        } catch {
          setError(t('monitors.errorInvalidUrl'));
          setSaving(false);
          return;
        }
      }

      const body: any = {
        name,
        site,
        mode,
        active,
        country: country || null, // '' -> null (sem filtro)
        stateRegion: stateRegion.trim() || null,
        city: city.trim() || null,
      };

      if (mode === 'URL_ONLY') {
        body.searchUrl = searchUrl;
      } else {
        body.filtersJson = filters;
        // Extrair preços para top-level (worker usa monitor.priceMin/priceMax)
        if (filters.minPrice != null) body.priceMin = filters.minPrice;
        if (filters.maxPrice != null) body.priceMax = filters.maxPrice;
        if (searchUrl) {
          body.searchUrl = searchUrl;
        }
      }

      if (idSelecionado) {
        await api.put(`/api/monitors/${idSelecionado}`, body, token);
      } else {
        await api.post('/api/monitors', body, token);
        trackMonitorCreated(site, mode);
      }

      // reset
      resetForm();
      await fetchMonitors();
    } catch (err: any) {
      if (err.response?.status === 403 || err.message?.includes('limite')) {
        setError(
          err.response?.data?.error || t('monitors.errorLimitReached')
        );
      } else {
        setError(err.message || t('monitors.errorSave'));
      }
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setName('');
    setSite('MERCADO_LIVRE');
    setMode('URL_ONLY');
    setSearchUrl('');
    setActive(true);
    setIdSelecionado(null);
    setCountry('BR');
    setStateRegion('');
    setCity('');
    setFilters({ ...DEFAULT_FILTERS });
    setUrlBaseManuallyEdited(false);
  }

  function handleEdit(monitor: Monitor) {
    setName(monitor.name);
    setSite(monitor.site);
    setMode(monitor.mode || 'URL_ONLY');
    setSearchUrl(monitor.searchUrl || '');
    setActive(monitor.active);
    setIdSelecionado(monitor.id);
    setCountry(monitor.country || '');
    setStateRegion(monitor.stateRegion || '');
    setCity(monitor.city || '');

    if (monitor.mode === 'STRUCTURED_FILTERS' && monitor.filtersJson) {
      setFilters(monitor.filtersJson);
    } else {
      setFilters({ ...DEFAULT_FILTERS });
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm(t('monitors.confirmDelete'));
    if (!confirmed) return;

    try {
      setError('');
      const token = getToken();
      if (!token) {
        setError(t('monitors.errorLoginFirst'));
        return;
      }

      await api.delete(`/api/monitors/${id}`, token);
      await fetchMonitors();
    } catch (err: any) {
      const errorMessage = err.data?.message || err.message || t('monitors.errorDelete');
      setError(errorMessage);
    }
  }

  return (
    <AppLayout>
      <Container maxW="container.xl" py={{ base: 6, md: 10 }}>
        <div style={styles.breadcrumb}>
          <Link to="/dashboard" style={styles.breadcrumbLink}>
            {t('common.dashboard')}
          </Link>
          <span style={styles.breadcrumbSeparator}>/</span>
          <span style={styles.breadcrumbCurrent}>{t('monitors.breadcrumb')}</span>
        </div>

        <h1 style={styles.title}>{t('monitors.title')}</h1>
        <p style={styles.subtitle}>{t('monitors.subtitle')}</p>

        {/* Banner de trial expirando */}
        <TrialBanner />

        {/* Banner de bloqueio sem assinatura */}
        {!hasSubscription && (
          <div style={styles.subscriptionWarning}>
            <div style={styles.warningIcon}>⚠️</div>
            <div style={styles.warningContent}>
              <strong>{t('monitors.subscriptionRequired')}</strong>
              <p style={styles.warningText}>{t('monitors.subscriptionRequiredDesc')}</p>
            </div>
            <Link to="/settings/subscription" style={styles.upgradeButton}>
              {t('monitors.viewPlans')}
            </Link>
          </div>
        )}

        {error && hasSubscription && (
          <div style={styles.error}>
            {error}
            {error.includes('limite') && (
              <div style={styles.upgradeLink}>
                <Link to="/plans" style={styles.link}>
                  {t('monitors.viewPlans')}
                </Link>
              </div>
            )}
          </div>
        )}

        {/* FORMULÁRIO */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <h2 style={styles.formTitle}>
            {idSelecionado ? t('monitors.editMonitor') : t('monitors.newMonitor')}
          </h2>

          <fieldset disabled={!hasSubscription} style={styles.fieldset}>

          <div style={styles.field}>
            <label style={styles.label}>{t('monitors.monitorName')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={styles.input}
              placeholder={t('monitors.monitorNamePlaceholder')}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>{t('monitors.site')}</label>
            <select
              value={site}
              onChange={(e) => {
                const newSite = e.target.value as MonitorSite;
                setSite(newSite);
                // Auto-preencher URL base em modo filtros, se não editado manualmente
                if (mode === 'STRUCTURED_FILTERS' && !urlBaseManuallyEdited) {
                  setSearchUrl(getSiteDefaultUrl(newSite));
                } else if (mode === 'STRUCTURED_FILTERS' && urlBaseManuallyEdited && isDefaultUrl(searchUrl)) {
                  // Se o valor atual ainda é um default de outro site, auto-preencher
                  setSearchUrl(getSiteDefaultUrl(newSite));
                  setUrlBaseManuallyEdited(false);
                }
              }}
              required
              style={styles.input}
            >
              {SITE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}{opt.requiresLogin ? ' 🔒' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Aviso de sessão necessária */}
          {SITES_REQUIRING_LOGIN.includes(site) && (
            <div style={sessionStatus[site]?.connected ? styles.sessionConnected : styles.sessionWarning}>
              {sessionStatus[site]?.connected ? (
                <>
                  <span style={styles.sessionIcon}>✅</span>
                  <div style={styles.sessionContent}>
                    <strong>{t('monitors.session.connected')}</strong>
                    <p style={styles.sessionText}>
                      {t('monitors.session.connectedDesc', { site: getSiteLabel(site) })}
                    </p>
                  </div>
                </>
              ) : sessionStatus[site]?.status === 'NEEDS_REAUTH' ? (
                <>
                  <span style={styles.sessionIcon}>⚠️</span>
                  <div style={styles.sessionContent}>
                    <strong>{t('monitors.session.needsReauth')}</strong>
                    <p style={styles.sessionText}>
                      {t('monitors.session.needsReauthDesc', { site: getSiteLabel(site) })}
                    </p>
                  </div>
                  <Link to="/settings/connections" style={styles.sessionButton}>
                    {t('monitors.session.reconnect')}
                  </Link>
                </>
              ) : (
                <>
                  <span style={styles.sessionIcon}>🔒</span>
                  <div style={styles.sessionContent}>
                    <strong>{t('monitors.session.loginRequired')}</strong>
                    <p style={styles.sessionText}>
                      {t('monitors.session.loginRequiredDesc', { site: getSiteLabel(site) })}
                    </p>
                  </div>
                  <Link to="/settings/connections" style={styles.sessionButton}>
                    {t('monitors.session.connect')}
                  </Link>
                </>
              )}
            </div>
          )}

          <div style={styles.field}>
            <label style={styles.label}>{t('monitors.monitoringMode')}</label>
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
                  <strong>{t('monitors.urlOnly')}</strong> - {t('monitors.urlOnlyDesc')}
                </span>
              </label>
              <label style={styles.radioLabel}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'STRUCTURED_FILTERS'}
                  onChange={() => {
                    setMode('STRUCTURED_FILTERS');
                    // Auto-preencher URL base se não editado manualmente
                    if (!urlBaseManuallyEdited && (!searchUrl || isDefaultUrl(searchUrl))) {
                      setSearchUrl(getSiteDefaultUrl(site));
                    }
                  }}
                  style={styles.radio}
                />
                <span>
                  <strong>{t('monitors.structuredFilters')}</strong> - {t('monitors.structuredFiltersDesc')}
                </span>
              </label>
            </div>
          </div>

          {/* Localização (disponível em ambos os modos) */}
          <div style={styles.locationBox}>
            <h3 style={styles.locationTitle}>{t('monitors.location.title')}</h3>
            <div style={styles.locationGrid}>
              <div style={styles.field}>
                <label style={styles.labelSmall}>{t('monitors.location.country')}</label>
                <select
                  value={country}
                  onChange={(e) => {
                    setCountry(e.target.value);
                    if (e.target.value === '') {
                      setStateRegion('');
                      setCity('');
                    }
                  }}
                  style={styles.input}
                >
                  {/* BR sempre primeiro (já vem em countryList[0]) */}
                  {countryList.length > 0 && (
                    <option key={countryList[0].code} value={countryList[0].code}>{countryList[0].label}</option>
                  )}
                  <option value="">{t('monitors.location.worldwide')}</option>
                  {countryList.slice(1).map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div style={styles.field}>
                <label style={styles.labelSmall}>{t('monitors.location.stateRegion')}</label>
                <input
                  type="text"
                  value={stateRegion}
                  onChange={(e) => setStateRegion(e.target.value)}
                  disabled={country === ''}
                  style={styles.input}
                  placeholder={t('monitors.location.stateRegionPlaceholder')}
                />
              </div>
              <div style={styles.field}>
                <label style={styles.labelSmall}>{t('monitors.location.city')}</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={country === ''}
                  style={styles.input}
                  placeholder={t('monitors.location.cityPlaceholder')}
                />
              </div>
            </div>
            <p style={styles.helpText}>{t('monitors.location.helpText')}</p>
          </div>

          {mode === 'URL_ONLY' && (
            <div style={styles.field}>
              <label style={styles.label}>{t('monitors.searchUrl')}</label>
              <input
                type="url"
                value={searchUrl}
                onChange={(e) => setSearchUrl(e.target.value)}
                required
                style={styles.input}
                placeholder={URL_PLACEHOLDERS[site] || 'https://...'}
              />
              <p style={styles.helpText}>{t('monitors.searchUrlHint')}</p>
            </div>
          )}

          {mode === 'STRUCTURED_FILTERS' && (
            <div style={styles.filtersBox}>
              <h3 style={styles.filtersTitle}>{t('monitors.customFilters.title')}</h3>

              <div style={styles.filtersGrid}>
                <div style={styles.field}>
                  <label style={styles.labelSmall}>{t('monitors.customFilters.keywords')}</label>
                  <input
                    type="text"
                    value={filters.keywords || ''}
                    onChange={(e) =>
                      setFilters({ ...filters, keywords: e.target.value })
                    }
                    style={styles.input}
                    placeholder={t('monitors.customFilters.keywordsPlaceholder')}
                  />
                </div>

                <div style={styles.field}>
                  <label style={styles.labelSmall}>{t('monitors.customFilters.category')}</label>
                  <input
                    type="text"
                    value={filters.category || ''}
                    onChange={(e) =>
                      setFilters({ ...filters, category: e.target.value })
                    }
                    style={styles.input}
                    placeholder={t('monitors.customFilters.categoryPlaceholder')}
                  />
                </div>

                <div style={styles.field}>
                  <label style={styles.labelSmall}>{t('monitors.customFilters.minPrice')}</label>
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
                  <label style={styles.labelSmall}>{t('monitors.customFilters.maxPrice')}</label>
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
                  <label style={styles.labelSmall}>{t('monitors.customFilters.minYear')}</label>
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
                  <label style={styles.labelSmall}>{t('monitors.customFilters.maxYear')}</label>
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
                <label style={styles.labelSmall}>{t('monitors.baseUrl')}</label>
                <input
                  type="url"
                  value={searchUrl}
                  onChange={(e) => {
                    setSearchUrl(e.target.value);
                    setUrlBaseManuallyEdited(true);
                  }}
                  style={styles.input}
                  placeholder={getSiteDefaultUrl(site) || 'https://...'}
                />
                <p style={styles.helpText}>{t('monitors.baseUrlHint')}</p>
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
              <span>{t('monitors.monitorActive')}</span>
            </label>
          </div>

          </fieldset>

          <div style={styles.buttons}>
            <button type="submit" disabled={saving || !hasSubscription} style={styles.saveButton}>
              {saving ? t('monitors.saving') : idSelecionado ? t('monitors.update') : t('monitors.create')}
            </button>

            {idSelecionado && (
              <button
                type="button"
                onClick={resetForm}
                style={styles.cancelButton}
              >
                {t('monitors.cancel')}
              </button>
            )}
          </div>
        </form>

        {/* LISTA */}
        <h2 style={styles.sectionTitle}>{t('monitors.yourMonitors')}</h2>

        {loadingLista && <p style={styles.loading}>{t('monitors.loadingMonitors')}</p>}

        {!loadingLista && !error && monitors.length === 0 && (
          <div style={styles.emptyState}>
            <p>{t('monitors.noMonitors')}</p>
            <p>{t('monitors.noMonitorsHint')}</p>
          </div>
        )}

        {!loadingLista && monitors.length > 0 && (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>{t('monitors.name')}</th>
                  <th style={styles.th}>{t('monitors.site')}</th>
                  <th style={styles.th}>{t('monitors.mode')}</th>
                  <th style={styles.th}>{t('monitors.url')}</th>
                  <th style={styles.th}>{t('monitors.status')}</th>
                  <th style={styles.th}>{t('monitors.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {monitors.map((monitor) => (
                  <tr key={monitor.id} style={styles.tr}>
                    <td style={styles.td}>{monitor.name}</td>
                    <td style={styles.td}>{getSiteLabel(monitor.site)}</td>
                    <td style={styles.td}>
                      {monitor.mode === 'STRUCTURED_FILTERS' ? (
                        <span style={styles.badgeFilters}>{t('monitors.filters')}</span>
                      ) : (
                        <span style={styles.badgeUrl}>{t('monitors.urlBadge')}</span>
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
                        <span style={styles.badgeActive}>✅ {t('monitors.active')}</span>
                      ) : (
                        <span style={styles.badgeInactive}>❌ {t('monitors.inactive')}</span>
                      )}
                    </td>
                    <td style={styles.tdCenter}>
                      <button onClick={() => handleEdit(monitor)} style={styles.editBtn}>
                        {t('monitors.edit')}
                      </button>
                      <button
                        onClick={() => handleDelete(monitor.id)}
                        style={styles.deleteBtn}
                      >
                        {t('monitors.delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Container>
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
    ...responsive.typography.h1,
    marginBottom: responsive.spacing.xs,
  },
  subtitle: {
    ...responsive.typography.body,
    color: '#6b7280',
    marginBottom: responsive.spacing.lg,
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
    ...responsive.card,
    marginBottom: responsive.spacing.lg,
  },
  formTitle: {
    ...responsive.typography.h2,
    marginTop: 0,
    marginBottom: responsive.spacing.lg,
  },
  field: {
    marginBottom: '20px',
  },
  label: {
    ...responsive.label,
  },
  labelSmall: {
    ...responsive.label,
    fontSize: responsive.typography.small.fontSize,
  },
  input: {
    ...responsive.input,
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
  locationBox: {
    backgroundColor: '#f0f9ff',
    padding: '20px',
    borderRadius: '8px',
    border: '1px solid #bae6fd',
    marginBottom: '20px',
  },
  locationTitle: {
    fontSize: '16px',
    fontWeight: '600' as const,
    color: '#0369a1',
    marginTop: 0,
    marginBottom: '16px',
  },
  locationGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))',
    gap: '16px',
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
    ...responsive.grid,
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    cursor: 'pointer',
  },
  buttons: {
    ...responsive.flexRow,
    marginTop: responsive.spacing.lg,
  },
  saveButton: {
    ...responsive.buttonPrimary,
  },
  cancelButton: {
    ...responsive.buttonSecondary,
  },
  sectionTitle: {
    ...responsive.typography.h2,
    marginBottom: responsive.spacing.md,
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
    overflow: 'auto',
    maxWidth: '100%',
  },
  table: {
    width: '100%',
    minWidth: '600px',
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
  sessionWarning: {
    backgroundColor: '#fef3c7',
    borderLeft: '4px solid #f59e0b',
    padding: '16px',
    marginBottom: '20px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap' as const,
  },
  sessionConnected: {
    backgroundColor: '#d1fae5',
    borderLeft: '4px solid #10b981',
    padding: '16px',
    marginBottom: '20px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap' as const,
  },
  sessionIcon: {
    fontSize: '24px',
  },
  sessionContent: {
    flex: '1',
    minWidth: '200px',
  },
  sessionText: {
    margin: '4px 0 0 0',
    fontSize: '13px',
    color: '#6b7280',
  },
  sessionButton: {
    backgroundColor: '#3b82f6',
    color: 'white',
    padding: '8px 16px',
    borderRadius: '6px',
    textDecoration: 'none',
    fontSize: '13px',
    fontWeight: '600' as const,
    whiteSpace: 'nowrap' as const,
  },
};
