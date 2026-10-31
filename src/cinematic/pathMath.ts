import type { Vec3 } from '../domain/geometry/types';

/**
 * Pure math for the cinematic camera: keyframes, easing and cardinal (Catmull-Rom family)
 * spline interpolation. No React / Three.js dependency so it is trivially unit-testable.
 *
 * Coordinates follow docs/GEOMETRY_SPEC.md: meters, X = east, Y = up, Z = south.
 */

export type EasingId = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

export const EASING_LABELS: Record<EasingId, string> = {
  linear: 'Linear',
  easeIn: 'Ease In',
  easeOut: 'Ease Out',
  easeInOut: 'Ease In Out',
};

export const EASINGS: Record<EasingId, (u: number) => number> = {
  linear: (u) => u,
  easeIn: (u) => u * u * u,
  easeOut: (u) => 1 - Math.pow(1 - u, 3),
  easeInOut: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
};

export function ease(id: EasingId, u: number): number {
  const c = u < 0 ? 0 : u > 1 ? 1 : u;
  return (EASINGS[id] ?? EASINGS.linear)(c);
}

export type Keyframe = {
  id: string;
  position: Vec3;
  /** Look-at target. Camera rotation is derived from position → target (+ roll). */
  target: Vec3;
  /** Roll around the view axis, degrees. */
  roll: number;
  /** Seconds taken to travel from the previous keyframe to this one (ignored for the first). */
  duration: number;
};

export type CameraPath = {
  name: string;
  keyframes: Keyframe[];
  /** Easing applied to the progress of the whole shot (soft start / stop). */
  easing: EasingId;
  /** Spline tangent scale. 0 = straight segments, 0.5 = Catmull-Rom, 1 = very loose curves. */
  smoothness: number;
  fov: number;
  /** Building id (or 'campus') the camera always looks at, overriding keyframe targets. */
  lockTarget: string | null;
  loop: boolean;
};

export type Pose = { position: Vec3; target: Vec3; roll: number };

export const MIN_SEGMENT = 0.2;

let idCounter = 0;
export function makeKeyframeId(): string {
  idCounter += 1;
  return `kf_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function defaultPath(fov = 40): CameraPath {
  return {
    name: 'Untitled shot',
    keyframes: [],
    easing: 'easeInOut',
    smoothness: 0.5,
    fov,
    lockTarget: null,
    loop: false,
  };
}

const segDuration = (k: Keyframe) => Math.max(MIN_SEGMENT, Number.isFinite(k.duration) ? k.duration : 1);

/** Cumulative keyframe times in seconds. times[0] === 0. */
export function keyframeTimes(kfs: readonly Keyframe[]): number[] {
  const times: number[] = [];
  let t = 0;
  kfs.forEach((k, i) => {
    if (i > 0) t += segDuration(k);
    times.push(t);
  });
  return times;
}

export function totalDuration(kfs: readonly Keyframe[]): number {
  const times = keyframeTimes(kfs);
  return times.length ? times[times.length - 1] : 0;
}

const pack = (k: Keyframe): number[] => [...k.position, ...k.target, k.roll];

function hermite(p0: number, p1: number, m0: number, m1: number, f: number): number {
  const f2 = f * f;
  const f3 = f2 * f;
  return (
    (2 * f3 - 3 * f2 + 1) * p0 + (f3 - 2 * f2 + f) * m0 + (-2 * f3 + 3 * f2) * p1 + (f3 - f2) * m1
  );
}

/** Evaluates the spline on segment `seg` (between keyframe seg and seg+1) at local fraction f ∈ [0,1]. */
export function evalSegment(
  kfs: readonly Keyframe[],
  smoothness: number,
  seg: number,
  f: number,
): Pose {
  const n = kfs.length;
  const i1 = Math.min(Math.max(seg, 0), n - 1);
  const i2 = Math.min(i1 + 1, n - 1);
  const i0 = Math.max(i1 - 1, 0);
  const i3 = Math.min(i2 + 1, n - 1);
  const a = pack(kfs[i0]);
  const b = pack(kfs[i1]);
  const c = pack(kfs[i2]);
  const d = pack(kfs[i3]);
  const out = new Array<number>(7);
  for (let j = 0; j < 7; j++) {
    const m1 = smoothness * (c[j] - a[j]);
    const m2 = smoothness * (d[j] - b[j]);
    out[j] = hermite(b[j], c[j], m1, m2, f);
  }
  return { position: [out[0], out[1], out[2]], target: [out[3], out[4], out[5]], roll: out[6] };
}

/** Pose at time `t` (seconds, linear clock). The shot-level easing is applied here. */
export function samplePathAtTime(path: CameraPath, t: number): Pose | null {
  const kfs = path.keyframes;
  if (kfs.length === 0) return null;
  if (kfs.length === 1) {
    const k = kfs[0];
    return { position: [...k.position], target: [...k.target], roll: k.roll };
  }
  const times = keyframeTimes(kfs);
  const total = times[times.length - 1];
  const tau = ease(path.easing, total > 0 ? t / total : 0) * total;
  let seg = 0;
  while (seg < kfs.length - 2 && tau >= times[seg + 1]) seg++;
  const span = times[seg + 1] - times[seg];
  const f = span > 0 ? Math.min(Math.max((tau - times[seg]) / span, 0), 1) : 1;
  return evalSegment(kfs, path.smoothness, seg, f);
}

/** Position polyline for drawing the trajectory in the 3D scene. */
export function samplePolyline(
  kfs: readonly Keyframe[],
  smoothness: number,
  perSegment = 20,
): Vec3[] {
  if (kfs.length < 2) return kfs.map((k) => [...k.position] as Vec3);
  const pts: Vec3[] = [];
  for (let s = 0; s < kfs.length - 1; s++) {
    for (let i = 0; i < perSegment; i++) pts.push(evalSegment(kfs, smoothness, s, i / perSegment).position);
  }
  pts.push([...kfs[kfs.length - 1].position]);
  return pts;
}

const isVec3 = (v: unknown): v is Vec3 =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

/** Validates untrusted JSON (localStorage / imported file). Returns null if unusable. */
export function sanitizePath(raw: unknown): CameraPath | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.keyframes)) return null;
  const keyframes: Keyframe[] = [];
  for (const k of r.keyframes) {
    if (!k || typeof k !== 'object') return null;
    const kk = k as Record<string, unknown>;
    if (!isVec3(kk.position) || !isVec3(kk.target)) return null;
    keyframes.push({
      id: typeof kk.id === 'string' ? kk.id : makeKeyframeId(),
      position: kk.position,
      target: kk.target,
      roll: typeof kk.roll === 'number' && Number.isFinite(kk.roll) ? kk.roll : 0,
      duration:
        keyframes.length === 0
          ? 0
          : typeof kk.duration === 'number' && Number.isFinite(kk.duration)
            ? Math.max(MIN_SEGMENT, kk.duration)
            : 3,
    });
  }
  const easing: EasingId =
    typeof r.easing === 'string' && r.easing in EASINGS ? (r.easing as EasingId) : 'easeInOut';
  const num = (v: unknown, d: number, lo: number, hi: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
  return {
    name: typeof r.name === 'string' && r.name ? r.name : 'Imported shot',
    keyframes,
    easing,
    smoothness: num(r.smoothness, 0.5, 0, 1),
    fov: num(r.fov, 40, 10, 120),
    lockTarget: typeof r.lockTarget === 'string' ? r.lockTarget : null,
    loop: r.loop === true,
  };
}
