import { useState } from 'react';
import { api } from '../services/api';

export function HealthCheckPage() {
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCheck() {
    try {
      setLoading(true);
      setError('');
      setStatus('');
      const data = await api.get<{ status: string; service: string }>('/health');
      setStatus(`${data.status} - ${data.service}`);
    } catch (err: any) {
      setError(err.message || 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Teste de conexão com o backend</h1>
      <button onClick={handleCheck} disabled={loading}>
        {loading ? 'Testando...' : 'Testar /health'}
      </button>

      {status && <p>✅ Resposta: {status}</p>}
      {error && <p style={{ color: 'red' }}>❌ {error}</p>}
    </div>
  );
}
