/**
 * Thin HTTP client for the campus backend (`backend/`, FastAPI).
 *
 * The backend is OPTIONAL: every caller must fall back to the static demo data
 * when it is unreachable, so the map keeps working with no backend running.
 *
 * Configuration (Vite env):
 *  - `VITE_USE_BACKEND=false`  force-disable (always static data).
 *  - `VITE_API_BASE_URL`       absolute API origin, e.g. `https://api.example.com`.
 *                              Leave empty to use same-origin `/api/...`, which Vite's dev
 *                              server (`vite.config.ts`) and production Nginx (`Dockerfile`)
 *                              proxy to the backend, avoiding mixed-content and CORS issues.
 *
 * Enabled by default in both dev and production builds unless `VITE_USE_BACKEND=false`.
 * NOTE: Access `import.meta.env.VITE_*` via direct member expressions (never through an
 * intermediate `const env = import.meta.env` alias), because Vite 8 / Rolldown only
 * statically substitutes `VITE_*` variables on direct property reads.
 */

const rawApiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
const explicitBase = typeof rawApiBase === 'string' ? rawApiBase.replace(/\/+$/, '') : '';

const rawUseBackend = import.meta.env.VITE_USE_BACKEND as string | boolean | undefined;
export const isBackendEnabled: boolean = rawUseBackend !== 'false' && rawUseBackend !== false;

export const API_PREFIX = '/api/v1';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Attempt to silently refresh an expired access token using `/api/v1/auth/refresh`. */
async function tryRefreshAccessToken(expiredToken?: string | null): Promise<string | null> {
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (expiredToken) {
      headers.Authorization = `Bearer ${expiredToken}`;
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      const rawUser = window.localStorage.getItem('campus_auth_user');
      if (rawUser) {
        const parsed = JSON.parse(rawUser) as { user_id?: string; student_id?: string | null };
        if (parsed.user_id) headers['X-Session-User-Id'] = parsed.user_id;
        if (parsed.student_id) headers['X-Session-Student-Id'] = parsed.student_id;
      }
    }
    const res = await fetch(`${explicitBase}${API_PREFIX}/auth/refresh`, {
      method: 'POST',
      headers,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    if (data?.access_token) {
      try {
        if (typeof window !== 'undefined') {
          window.localStorage?.setItem('campus_auth_token', data.access_token);
          window.dispatchEvent(
            new CustomEvent('campus:token-refreshed', { detail: data.access_token }),
          );
        }
      } catch {
        // ignore storage errors
      }
      return data.access_token;
    }
  } catch {
    // ignore refresh failures
  }
  return null;
}

type ApiErrorPayload = {
  error?: {
    message?: string;
    details?: {
      errors?: Array<{ msg?: string; message?: string }>;
      violations?: Array<{ message?: string; rule?: string }>;
    };
  };
  detail?: string | Array<{ msg?: string }>;
};

async function parseApiErrorMessage(res: Response, path: string): Promise<string> {
  const fallback = `HTTP ${res.status} for ${path}`;
  try {
    const errJson = (await res.json()) as ApiErrorPayload;
    const pydanticMsg =
      errJson?.error?.details?.errors?.[0]?.msg || errJson?.error?.details?.errors?.[0]?.message;
    const policyMsg = errJson?.error?.details?.violations?.[0]?.message;
    if (pydanticMsg) return pydanticMsg;
    if (policyMsg) return policyMsg;
    if (errJson?.error?.message) return errJson.error.message;
    if (typeof errJson?.detail === 'string') return errJson.detail;
    if (Array.isArray(errJson?.detail) && errJson.detail[0]?.msg) return errJson.detail[0].msg;
  } catch {
    // keep fallback message when response body is not JSON
  }
  return fallback;
}

function resolveEffectiveToken(token?: string | null): string | null {
  if (token) return token;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      return window.localStorage.getItem('campus_auth_token');
    } catch {
      return null;
    }
  }
  return null;
}

async function request<T>(
  method: 'GET' | 'PATCH' | 'POST',
  path: string,
  options: {
    params?: Record<string, string | number | undefined>;
    body?: unknown;
    signal?: AbortSignal;
    token?: string | null;
    parseDetailedError?: boolean;
  } = {},
): Promise<T> {
  if (!isBackendEnabled) throw new ApiError('Backend integration is disabled');

  const query = options.params
    ? Object.entries(options.params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  const url = `${explicitBase}${API_PREFIX}${path}${query ? `?${query}` : ''}`;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
  }

  const effectiveToken = resolveEffectiveToken(options.token);
  if (effectiveToken) {
    headers.Authorization = `Bearer ${effectiveToken}`;
  }

  const serializedBody =
    method !== 'GET' && options.body !== undefined ? JSON.stringify(options.body) : undefined;

  let res: Response;
  try {
    res = await fetch(url, {
      method: method === 'GET' ? undefined : method,
      headers,
      body: serializedBody,
      signal: options.signal,
      cache: 'no-store',
    });
    if (res.status === 401 && path !== '/auth/login' && path !== '/auth/refresh') {
      const refreshed = await tryRefreshAccessToken(effectiveToken);
      if (refreshed) {
        headers.Authorization = `Bearer ${refreshed}`;
        res = await fetch(url, {
          method: method === 'GET' ? undefined : method,
          headers,
          body: serializedBody,
          signal: options.signal,
          cache: 'no-store',
        });
      }
    }
  } catch (err) {
    throw new ApiError(err instanceof Error ? err.message : 'Network error');
  }

  if (!res.ok) {
    const errorMsg = options.parseDetailedError
      ? await parseApiErrorMessage(res, path)
      : `HTTP ${res.status} for ${path}`;
    throw new ApiError(errorMsg, res.status);
  }

  return (await res.json()) as T;
}

/** GET `${base}/api/v1${path}` and parse JSON. Throws `ApiError` on network or HTTP failure. */
export async function apiGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
  signal?: AbortSignal,
  token?: string | null,
): Promise<T> {
  return request<T>('GET', path, { params, signal, token, parseDetailedError: false });
}

/** PATCH `${base}/api/v1${path}` with JSON payload. Throws `ApiError` with backend message on failure. */
export async function apiPatch<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  token?: string | null,
): Promise<T> {
  return request<T>('PATCH', path, { body, signal, token, parseDetailedError: true });
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  token?: string | null,
): Promise<T> {
  return request<T>('POST', path, { body, signal, token, parseDetailedError: true });
}

/** Liveness probe (`/healthz` lives at the root, not under the API prefix). */
export async function pingBackend(
  signal?: AbortSignal,
): Promise<{ ok: boolean; version?: string; latencyMs: number }> {
  const started = performance.now();
  try {
    const res = await fetch(`${explicitBase}/healthz`, { signal });
    const latencyMs = Math.round(performance.now() - started);
    if (!res.ok) return { ok: false, latencyMs };
    const body = (await res.json()) as { version?: string };
    return { ok: true, version: body.version, latencyMs };
  } catch {
    return { ok: false, latencyMs: Math.round(performance.now() - started) };
  }
}

export type BuildVersionInfo = {
  commit: string;
  buildId: string;
  builtAt?: string;
};

/**
 * Fetches `/version.json` stamped into the production frontend image during build.
 * Returns `null` in local Vite dev mode or when unavailable.
 */
export async function fetchBuildVersion(signal?: AbortSignal): Promise<BuildVersionInfo | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<BuildVersionInfo>;
    if (typeof body.commit !== 'string' || typeof body.buildId !== 'string') return null;
    return { commit: body.commit, buildId: body.buildId, builtAt: body.builtAt };
  } catch {
    return null;
  }
}
