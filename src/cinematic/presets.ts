import { mapConfig } from '../config/mapConfig';
import type { BuildingGeometry, CampusGeometry, Vec3 } from '../domain/geometry/types';
import { campusCenter } from '../components/3d/CameraController';
import { makeKeyframeId, type CameraPath, type EasingId, type Keyframe } from './pathMath';

export type PresetId =
  | 'flyover'
  | 'orbit'
  | 'dollyIn'
  | 'dollyOut'
  | 'tracking'
  | 'reveal'
  | 'topDown'
  | 'freeFlight';

export type PresetInfo = {
  id: PresetId;
  label: string;
  description: string;
  /** Preset needs a building to work around. */
  needsBuilding: boolean;
};

export const PRESETS: PresetInfo[] = [
  { id: 'flyover', label: 'Flyover', description: 'Smooth aerial flight over the whole campus', needsBuilding: false },
  { id: 'orbit', label: 'Orbit', description: 'Circle around the selected building', needsBuilding: true },
  { id: 'dollyIn', label: 'Dolly In', description: 'Gradual approach toward the building', needsBuilding: true },
  { id: 'dollyOut', label: 'Dolly Out', description: 'Gradual retreat from the building', needsBuilding: true },
  { id: 'tracking', label: 'Tracking', description: 'Slide alongside the building while keeping it in frame', needsBuilding: true },
  { id: 'reveal', label: 'Reveal', description: 'Start behind the building and reveal the campus', needsBuilding: true },
  { id: 'topDown', label: 'Top Down', description: 'Bird’s-eye view tilting into an angled perspective', needsBuilding: false },
  { id: 'freeFlight', label: 'Free Flight', description: 'Fly manually: WASD + drag, Q/E down/up, Shift = fast', needsBuilding: false },
];

export type PresetResult = Pick<CameraPath, 'keyframes' | 'easing' | 'smoothness' | 'lockTarget' | 'loop'> & {
  fov?: number;
};

const kf = (position: Vec3, target: Vec3, duration: number, roll = 0): Keyframe => ({
  id: makeKeyframeId(),
  position,
  target,
  roll,
  duration,
});

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];

export const CAMPUS_LOCK = 'campus';

/** World point the camera looks at for a given lock id, or null when unlocked / unknown. */
export function resolveLockPoint(geometry: CampusGeometry, lock: string | null): Vec3 | null {
  if (!lock) return null;
  if (lock === CAMPUS_LOCK) return campusCenter(geometry);
  const b = geometry.buildings[lock];
  return b ? buildingFocus(b) : null;
}

export function buildingFocus(b: BuildingGeometry): Vec3 {
  return [b.center[0], b.height * 0.45, b.center[2]];
}

function pickBuilding(geometry: CampusGeometry, buildingId?: string): BuildingGeometry | undefined {
  if (buildingId && geometry.buildings[buildingId]) return geometry.buildings[buildingId];
  return Object.values(geometry.buildings)[0];
}

/** Builds keyframes for a preset. `freeFlight` returns null (handled by the controller). */
export function buildPreset(
  id: PresetId,
  geometry: CampusGeometry,
  buildingId?: string,
): PresetResult | null {
  if (id === 'freeFlight') return null;
  const c = campusCenter(geometry);
  const { min, max } = geometry.bounds;
  const R = Math.max(max[0] - min[0], max[1] - min[1]) / 2 || 100;
  const b = pickBuilding(geometry, buildingId);
  const base = { smoothness: 0.5, loop: false, lockTarget: null as string | null };

  switch (id) {
    case 'flyover': {
      const pts: Vec3[] = [
        [c[0] - 1.15 * R, 85, c[2] + 0.95 * R],
        [c[0] - 0.45 * R, 60, c[2] + 0.4 * R],
        [c[0] + 0.05 * R, 48, c[2] - 0.05 * R],
        [c[0] + 0.6 * R, 58, c[2] - 0.5 * R],
        [c[0] + 1.15 * R, 82, c[2] - 0.95 * R],
      ];
      const keyframes = pts.map((p, i) => {
        const next = pts[Math.min(i + 1, pts.length - 1)];
        const prev = pts[Math.max(i - 1, 0)];
        const dir: Vec3 = [next[0] - prev[0], 0, next[2] - prev[2]];
        const look: Vec3 =
          i < pts.length - 1 ? [next[0], 6, next[2]] : add([p[0], 6, p[2]], scale(dir, 0.5));
        return kf(p, look, i === 0 ? 0 : 5.5);
      });
      return { ...base, keyframes, easing: 'easeInOut' as EasingId, fov: 50 };
    }
    case 'orbit': {
      if (!b) return null;
      const focus = buildingFocus(b);
      const radius = Math.max(b.radius * 2.2, 55);
      const height = b.height + radius * 0.4;
      const keyframes = Array.from({ length: 9 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return kf(
          [b.center[0] + Math.cos(a) * radius, height, b.center[2] + Math.sin(a) * radius],
          focus,
          i === 0 ? 0 : 3,
        );
      });
      return { ...base, keyframes, easing: 'linear' as EasingId, fov: 45 };
    }
    case 'dollyIn':
    case 'dollyOut': {
      if (!b) return null;
      const focus = buildingFocus(b);
      const dir: Vec3 = [0.5, 0.32, 0.8];
      const len = Math.hypot(...dir);
      const unit = scale(dir, 1 / len);
      const far = b.radius * 4 + 70;
      const near = b.radius * 1.5 + 24;
      const at = (d: number) => add(focus, scale(unit, d));
      const dists = id === 'dollyIn' ? [far, (far + near) / 2, near] : [near, (far + near) / 2, far];
      const keyframes = dists.map((d, i) => kf(at(d), focus, i === 0 ? 0 : 4));
      return { ...base, keyframes, easing: 'easeInOut' as EasingId, fov: 42 };
    }
    case 'tracking': {
      if (!b) return null;
      const side = b.radius * 1.15 + 38;
      const half = b.radius * 1.7;
      const keyframes = Array.from({ length: 5 }, (_, i) => {
        const x = -half + (2 * half * i) / 4;
        return kf([b.center[0] + x, 7 + Math.sin((i / 4) * Math.PI) * 4, b.center[2] + side], buildingFocus(b), i === 0 ? 0 : 3);
      });
      return { ...base, keyframes, easing: 'easeInOut' as EasingId, lockTarget: b.buildingId, fov: 42 };
    }
    case 'reveal': {
      if (!b) return null;
      const away: Vec3 = [b.center[0] - c[0], 0, b.center[2] - c[2]];
      const alen = Math.hypot(away[0], away[2]);
      const u: Vec3 = alen > 1 ? [away[0] / alen, 0, away[2] / alen] : [0, 0, 1];
      const behind = b.radius * 1.05 + 10;
      const cam = mapConfig.camera.campusPosition;
      const start: Vec3 = [b.center[0] + u[0] * behind, 3, b.center[2] + u[2] * behind];
      const keyframes = [
        kf(start, [b.center[0], b.height * 0.6, b.center[2]], 0),
        kf([b.center[0] + u[0] * (behind * 0.5), b.height + 18, b.center[2] + u[2] * (behind * 0.5)], [c[0], 5, c[2]], 4.5),
        kf([b.center[0] - u[0] * b.radius * 0.5, b.height + 55, b.center[2] - u[2] * b.radius * 0.5], [c[0], 0, c[2]], 4.5),
        kf([c[0] + cam[0], cam[1], c[2] + cam[2]], c, 5),
      ];
      return { ...base, keyframes, easing: 'easeInOut' as EasingId, fov: 50 };
    }
    case 'topDown': {
      const high = Math.max(240, R * 2.2);
      const keyframes = [
        kf([c[0] + 1, high, c[2] + 6], c, 0),
        kf([c[0] + R * 0.25, high * 0.72, c[2] + R * 0.7], c, 5),
        kf([c[0] + R * 0.6, 95, c[2] + R * 1.15], [c[0], 5, c[2]], 5),
      ];
      return { ...base, keyframes, easing: 'easeInOut' as EasingId, fov: 45 };
    }
  }
}
