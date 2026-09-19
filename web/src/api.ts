const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`HTTP ${status}`);
    this.name = 'ApiError';
  }
}

export const apiFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
};

export type Health = {
  ok: boolean;
  db: boolean;
  migrations: string[];
  uptimeSeconds: number;
};

export const getHealth = () => apiFetch<Health>('/health');
export const API_BASE = BASE;
