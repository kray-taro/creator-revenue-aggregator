import type { ApiError } from '@/types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api';

class HttpError extends Error {
  constructor(
    public status: number,
    public apiError: ApiError
  ) {
    super(apiError.message);
    this.name = 'HttpError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { params?: Record<string, string | number | undefined> } = {}
): Promise<T> {
  const { params, ...fetchOptions } = options;

  let url = `${BASE_URL}${path}`;
  if (typeof window === 'undefined' && url.startsWith('/')) {
    // Avoid relative URL fetches during Next.js SSR / static generation
    // if there is no absolute API URL provided, to prevent hanging builds.
    throw new Error(`Cannot fetch relative URL ${url} on the server. Please set NEXT_PUBLIC_API_URL.`);
  }
  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    ).toString();
    if (qs) url = `${url}?${qs}`;
  }

  const res = await fetch(url, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    },
    credentials: 'include', // send cookies for NextAuth session
  });

  if (!res.ok) {
    let apiError: ApiError;
    try {
      apiError = await res.json();
    } catch {
      apiError = { code: 'UNKNOWN', message: `HTTP ${res.status}: ${res.statusText}` };
    }
    throw new HttpError(res.status, apiError);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as T;
}

export const apiClient = {
  get: <T>(path: string, params?: Record<string, string | number | undefined>) =>
    request<T>(path, { method: 'GET', params }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  HttpError,
};
