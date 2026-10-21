/**
 * Same-origin API client. Requests go to `/api/*`, which Next.js proxies to the Express API, so
 * session cookies stay first-party (HttpOnly, SameSite=Strict). State-changing requests echo the
 * CSRF token from the readable `libra_csrf` cookie.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get isAuth() {
    return this.status === 401;
  }
}

let csrfPromise: Promise<string> | null = null;

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

export async function ensureCsrf(force = false): Promise<string> {
  const existing = readCookie('libra_csrf');
  if (existing && !force) return existing;
  csrfPromise ??= fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' })
    .then((r) => r.json())
    .then((b: { csrfToken: string }) => b.csrfToken)
    .finally(() => {
      csrfPromise = null;
    });
  return csrfPromise;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  keepalive?: boolean;
}

export function buildQuery(query?: RequestOptions['query']): string {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF-Token'] = await ensureCsrf();

  const doFetch = () =>
    fetch(`/api${path}${buildQuery(opts.query)}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: opts.signal,
      keepalive: opts.keepalive,
    });

  let res = await doFetch();
  // CSRF cookie may have expired: refresh once and retry.
  if (res.status === 403 && method !== 'GET') {
    const body = await res.clone().json().catch(() => null);
    if (body?.error?.code === 'CSRF_INVALID') {
      headers['X-CSRF-Token'] = await ensureCsrf(true);
      res = await doFetch();
    }
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? `HTTP_${res.status}`, err?.message ?? res.statusText ?? 'Request failed', err?.details);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Downloads a file from an authenticated GET endpoint. */
export async function download(path: string, query?: RequestOptions['query'], fallbackName = 'download') {
  const res = await fetch(`/api${path}${buildQuery(query)}`, { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.error?.code ?? 'DOWNLOAD_FAILED', body?.error?.message ?? 'Download failed');
  }
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof ApiError) {
    if (err.code === 'VALIDATION_FAILED' && Array.isArray(err.details) && err.details.length) {
      const first = err.details[0] as { path?: string; message?: string };
      return first.path ? `${first.path}: ${first.message}` : (first.message ?? err.message);
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
