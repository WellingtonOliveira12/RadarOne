import { useState, type FormEvent } from 'react';
import { login } from '../services/auth';
import { saveToken } from '../services/tokenStorage';

export function LoginPage() {
  const [email, setEmail] = useState('well+radarone@test.com');
  const [password, setPassword] = useState('senha123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userName, setUserName] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setUserName('');

    try {
      const data = await login(email, password);
      saveToken(data.token);
      setUserName(data.user.name);
    } catch (err: any) {
      setError(err.message || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 400 }}>
      <h1>Login RadarOne</h1>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block' }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block' }}>Senha</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      {userName && <p>✅ Logado como: {userName}</p>}
      {error && <p style={{ color: 'red' }}>❌ {error}</p>}
    </div>
  );
}
