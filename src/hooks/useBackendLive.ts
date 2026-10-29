import { useEffect, useState } from 'react';
import { apiGet, isBackendEnabled, pingBackend } from '../services/api/apiClient';

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
  latencyMs?: number;
  places: BusynessPlace[];
  /** wall-clock time of the last successful refresh */
  updatedAt?: Date;
};

const REFRESH_MS = 10_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** Campus-local naive instant the backend understands, e.g. `2026-10-27T10:45:00`. */
function toNaiveLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

/**
 * Polls backend health and the crowd/busyness feed. `at` follows the Live/Simulate clock so the
 * panel agrees with the map. Never throws: an unreachable backend just reports `offline`.
 */
export function useBackendLive(at: Date): BackendLive {
  const [state, setState] = useState<BackendLive>({
    enabled: isBackendEnabled,
    status: 'connecting',
    places: [],
  });
  const atKey = toNaiveLocal(at);

  useEffect(() => {
    if (!isBackendEnabled) return;
    let alive = true;
    const controller = new AbortController();

    const refresh = async () => {
      const ping = await pingBackend(controller.signal);
      if (!alive) return;
      if (!ping.ok) {
        setState((s) => ({ ...s, status: 'offline', latencyMs: ping.latencyMs }));
        return;
      }
      try {
        const res = await apiGet<{ places: BusynessPlace[] }>('/busyness', { at: atKey }, controller.signal);
        if (!alive) return;
        setState({
          enabled: true,
          status: 'online',
          version: ping.version,
          latencyMs: ping.latencyMs,
          places: res.places ?? [],
          updatedAt: new Date(),
        });
      } catch {
        if (alive) setState((s) => ({ ...s, status: 'online', version: ping.version, latencyMs: ping.latencyMs }));
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
