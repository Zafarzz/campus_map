import { useEffect, useRef, useState } from 'react';
import {
  apiGet,
  fetchBuildVersion,
  isBackendEnabled,
  pingBackend,
  type BuildVersionInfo,
} from '../services/api/apiClient';

export type BusynessPlace = {
  place_id: string;
  name: string;
  kind: string;
  building_id: string | null;
  capacity: number | null;
  level: string;
  percentage_of_capacity: number | null;
  headcount_likely: number | null;
  provenance: string;
  confidence: number | null;
};

export type BackendLive = {
  /** false when the integration is switched off in config */
  enabled: boolean;
  /** `connecting` until the first probe finishes */
  status: 'connecting' | 'online' | 'offline';
  version?: string;
  deployedCommit?: string;
  updatingToCommit?: string;
  reloadPendingCommit?: string;
  latencyMs?: number;
  places: BusynessPlace[];
  /** wall-clock time of the last successful refresh */
  updatedAt?: Date;
};

export type VersionTransition =
  | { action: 'init'; current: BuildVersionInfo }
  | { action: 'none'; current: BuildVersionInfo }
  | { action: 'backend-updated'; current: BuildVersionInfo }
  | { action: 'frontend-updated'; current: BuildVersionInfo };

export function reconcileBuildVersion(
  initial: BuildVersionInfo | null,
  incoming: BuildVersionInfo | null,
): VersionTransition | null {
  if (!incoming) return null;
  if (!initial) return { action: 'init', current: incoming };
  if (incoming.buildId !== initial.buildId) {
    return { action: 'frontend-updated', current: incoming };
  }
  if (incoming.commit !== initial.commit) {
    return { action: 'backend-updated', current: incoming };
  }
  return { action: 'none', current: incoming };
}

const REFRESH_MS = 10_000;
const AUTO_RELOAD_DELAY_MS = 1_200;
const RELOAD_GUARD_KEY = 'campus_autoreload_build';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Campus-local offset-aware instant (`Asia/Tashkent`, permanent UTC+05:00),
 * e.g. `2026-10-30T10:30:00+05:00`. The backend rejects naive `at` parameters (`naive_at`).
 */
export function toCampusIsoMinute(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00+05:00`;
}

function shouldDeferAutoReload(nextBuildId: string): boolean {
  if (typeof window === 'undefined') return true;
  const { pathname, hash } = window.location;
  if (
    pathname === '/editor' ||
    pathname.startsWith('/editor/') ||
    hash.startsWith('#/editor') ||
    pathname === '/game' ||
    pathname.startsWith('/game/') ||
    hash.startsWith('#/game')
  ) {
    return true;
  }
  try {
    return window.sessionStorage.getItem(RELOAD_GUARD_KEY) === nextBuildId;
  } catch {
    return false;
  }
}

function markAutoReloaded(nextBuildId: string): void {
  try {
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, nextBuildId);
  } catch {
    // Ignore storage quota / private mode restrictions
  }
}

/**
 * Polls backend health, `/version.json` deploy metadata, and the crowd/busyness feed.
 * `at` follows the Live/Simulate clock so the panel agrees with the map.
 * Never throws: an unreachable backend just reports `offline`.
 */
export function useBackendLive(at: Date): BackendLive {
  const [state, setState] = useState<BackendLive>({
    enabled: isBackendEnabled,
    status: 'connecting',
    places: [],
  });
  const initialVersionRef = useRef<BuildVersionInfo | null>(null);
  const reloadTimerRef = useRef<number | undefined>(undefined);
  const atKey = toCampusIsoMinute(at);

  useEffect(() => {
    return () => {
      if (reloadTimerRef.current !== undefined) {
        window.clearTimeout(reloadTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isBackendEnabled) return;
    let alive = true;
    const controller = new AbortController();

    const refresh = async () => {
      const [ping, buildInfo] = await Promise.all([
        pingBackend(controller.signal),
        fetchBuildVersion(controller.signal),
      ]);
      if (!alive) return;
      if (!ping.ok) {
        setState((s) => ({ ...s, status: 'offline', latencyMs: ping.latencyMs }));
        return;
      }

      let deployedCommit = initialVersionRef.current?.commit;
      let updatingToCommit: string | undefined;
      let reloadPendingCommit: string | undefined;

      const transition = reconcileBuildVersion(initialVersionRef.current, buildInfo);
      if (transition) {
        deployedCommit = transition.current.commit;
        if (transition.action === 'init') {
          initialVersionRef.current = transition.current;
        } else if (transition.action === 'backend-updated') {
          initialVersionRef.current = transition.current;
          window.dispatchEvent(new CustomEvent('campus:backend-updated'));
        } else if (transition.action === 'frontend-updated') {
          if (shouldDeferAutoReload(transition.current.buildId)) {
            reloadPendingCommit = transition.current.commit;
          } else {
            updatingToCommit = transition.current.commit;
            if (reloadTimerRef.current === undefined) {
              markAutoReloaded(transition.current.buildId);
              reloadTimerRef.current = window.setTimeout(() => {
                window.location.reload();
              }, AUTO_RELOAD_DELAY_MS);
            }
          }
        }
      }

      try {
        const res = await apiGet<{ places: BusynessPlace[] }>('/busyness', { at: atKey }, controller.signal);
        if (!alive) return;
        setState({
          enabled: true,
          status: 'online',
          version: ping.version,
          deployedCommit,
          updatingToCommit,
          reloadPendingCommit,
          latencyMs: ping.latencyMs,
          places: res.places ?? [],
          updatedAt: new Date(),
        });
      } catch {
        if (alive) {
          setState((s) => ({
            ...s,
            status: 'online',
            version: ping.version,
            deployedCommit: deployedCommit ?? s.deployedCommit,
            updatingToCommit,
            reloadPendingCommit,
            latencyMs: ping.latencyMs,
          }));
        }
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      alive = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [atKey]);

  return state;
}
