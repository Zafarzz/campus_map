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

/** GET `${base}/api/v1${path}` and parse JSON. Throws `ApiError` on network or HTTP failure. */
export async function apiGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
  signal?: AbortSignal,
): Promise<T> {
  if (!isBackendEnabled) throw new ApiError('Backend integration is disabled');
  const query = params
    ? Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  const url = `${explicitBase}${API_PREFIX}${path}${query ? `?${query}` : ''}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  } catch (err) {
    throw new ApiError(err instanceof Error ? err.message : 'Network error');
  }
  if (!res.ok) throw new ApiError(`HTTP ${res.status} for ${path}`, res.status);
  return (await res.json()) as T;
}

/** Liveness probe (`/healthz` lives at the root, not under the API prefix). */
export async function pingBackend(signal?: AbortSignal): Promise<{ ok: boolean; version?: string; latencyMs: number }> {
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
