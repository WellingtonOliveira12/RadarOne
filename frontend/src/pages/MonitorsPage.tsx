import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../services/api';
import { getToken } from '../services/tokenStorage';

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

interface Monitor {
  id: string;
  name: string;
  site: MonitorSite;
  searchUrl: string;
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
  // Lista
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loadingLista, setLoadingLista] = useState(false);
  const [error, setError] = useState('');

  // Formulário
  const [name, setName] = useState('');
  const [site, setSite] = useState<MonitorSite>('MERCADO_LIVRE');
  const [searchUrl, setSearchUrl] = useState('');
  const [active, setActive] = useState(true);
  const [idSelecionado, setIdSelecionado] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
    } catch (err: any) {
      setError(err.message || 'Erro ao buscar monitores');
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

      const body = {
        name,
        site,
        searchUrl, // 👈 campo correto para o backend
        active,
      };

      if (idSelecionado) {
        await api.post(`/api/monitors/${idSelecionado}`, body, token);
      } else {
        await api.post('/api/monitors', body, token);
      }

      // reset
      setName('');
      setSite('MERCADO_LIVRE');
      setSearchUrl('');
      setActive(true);
      setIdSelecionado(null);

      await fetchMonitors();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar monitor');
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(monitor: Monitor) {
    setName(monitor.name);
    setSite(monitor.site);
    setSearchUrl(monitor.searchUrl);
    setActive(monitor.active);
    setIdSelecionado(monitor.id);
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
    setSearchUrl('');
    setActive(true);
    setIdSelecionado(null);
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h1>Monitores</h1>

      {error && <p style={{ color: 'red', marginBottom: 16 }}>{error}</p>}

      {/* FORMULÁRIO */}
      <form
        onSubmit={handleSubmit}
        style={{
          border: '1px solid #ccc',
          padding: 16,
          marginBottom: 24,
          borderRadius: 4,
        }}
      >
        <h2 style={{ marginTop: 0 }}>
          {idSelecionado ? 'Editar Monitor' : 'Novo Monitor'}
        </h2>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4 }}>Nome</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={{ width: '100%', padding: 8 }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4 }}>Site</label>
          <select
            value={site}
            onChange={(e) => setSite(e.target.value as MonitorSite)}
            required
            style={{ width: '100%', padding: 8 }}
          >
            {SITE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4 }}>URL de busca</label>
          <input
            type="url"
            value={searchUrl}
            onChange={(e) => setSearchUrl(e.target.value)}
            required
            style={{ width: '100%', padding: 8 }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Ativo
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={saving} style={{ padding: '8px 16px' }}>
            {saving ? 'Salvando...' : idSelecionado ? 'Atualizar' : 'Salvar monitor'}
          </button>

          {idSelecionado && (
            <button
              type="button"
              onClick={handleCancelEdit}
              style={{ padding: '8px 16px' }}
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      {/* LISTA */}
      <h2>Lista de Monitores</h2>

      {loadingLista && <p>Carregando monitores...</p>}

      {!loadingLista && !error && monitors.length === 0 && (
        <p>Nenhum monitor cadastrado ainda.</p>
      )}

      {!loadingLista && monitors.length > 0 && (
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            border: '1px solid #ccc',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              <th style={{ padding: 8, border: '1px solid #ccc', textAlign: 'left' }}>
                Nome
              </th>
              <th style={{ padding: 8, border: '1px solid #ccc', textAlign: 'left' }}>
                Site
              </th>
              <th style={{ padding: 8, border: '1px solid #ccc', textAlign: 'left' }}>
                URL
              </th>
              <th style={{ padding: 8, border: '1px solid #ccc', textAlign: 'center' }}>
                Status
              </th>
              <th style={{ padding: 8, border: '1px solid #ccc', textAlign: 'center' }}>
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {monitors.map((monitor) => (
              <tr key={monitor.id}>
                <td style={{ padding: 8, border: '1px solid #ccc' }}>{monitor.name}</td>
                <td style={{ padding: 8, border: '1px solid #ccc' }}>
                  {getSiteLabel(monitor.site)}
                </td>
                <td
                  style={{
                    padding: 8,
                    border: '1px solid #ccc',
                    maxWidth: 300,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <a
                    href={monitor.searchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {monitor.searchUrl}
                  </a>
                </td>
                <td
                  style={{
                    padding: 8,
                    border: '1px solid #ccc',
                    textAlign: 'center',
                  }}
                >
                  {monitor.active ? '✅ Ativo' : '❌ Inativo'}
                </td>
                <td
                  style={{
                    padding: 8,
                    border: '1px solid #ccc',
                    textAlign: 'center',
                  }}
                >
                  <button
                    onClick={() => handleEdit(monitor)}
                    style={{ marginRight: 8, padding: '4px 8px' }}
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(monitor.id)}
                    style={{ padding: '4px 8px', color: 'red' }}
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
