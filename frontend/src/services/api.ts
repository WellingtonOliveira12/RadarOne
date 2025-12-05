const BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'https://radarone.onrender.com';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  body?: any;
  token?: string | null;
}

async function apiRequest<T = any>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let data: any;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      `Erro na requisição (${res.status})`;
    throw new Error(msg);
  }

  return data as T;
}

export const api = {
  get: <T = any>(path: string, token?: string | null) =>
    apiRequest<T>(path, { method: 'GET', token }),
  post: <T = any>(path: string, body?: any, token?: string | null) =>
    apiRequest<T>(path, { method: 'POST', body, token }),
};

export { BASE_URL };
