import { beforeEach, describe, expect, it } from 'vitest';
import { demoCampus } from '../data/demo-campus';
import { geometryProvider } from '../services/geometry';
import {
  __resetCinematicForTests,
  cinematic,
  runtime,
} from '../cinematic/cinematicStore';
import {
  defaultPath,
  ease,
  keyframeTimes,
  makeKeyframeId,
  sanitizePath,
  samplePathAtTime,
  samplePolyline,
  totalDuration,
  type CameraPath,
  type Keyframe,
} from '../cinematic/pathMath';
import { PRESETS, buildPreset } from '../cinematic/presets';

const kf = (x: number, dur: number): Keyframe => ({
  id: makeKeyframeId(),
  position: [x, 10, 0],
  target: [x, 0, -10],
  roll: 0,
  duration: dur,
});

const path = (over: Partial<CameraPath> = {}): CameraPath => ({
  ...defaultPath(),
  keyframes: [kf(0, 0), kf(100, 4), kf(300, 6)],
  easing: 'linear',
  ...over,
});

describe('cinematic path math', () => {
  it('easing functions are monotonic with fixed endpoints', () => {
    for (const id of ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const) {
      expect(ease(id, 0)).toBe(0);
      expect(ease(id, 1)).toBeCloseTo(1, 10);
      let prev = -1;
      for (let i = 0; i <= 20; i++) {
        const v = ease(id, i / 20);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    }
    expect(ease('easeIn', 0.5)).toBeLessThan(0.5);
    expect(ease('easeOut', 0.5)).toBeGreaterThan(0.5);
  });

  it('computes cumulative times and total duration', () => {
    const p = path();
    expect(keyframeTimes(p.keyframes)).toEqual([0, 4, 10]);
    expect(totalDuration(p.keyframes)).toBe(10);
  });

  it('passes exactly through keyframes at their times', () => {
    const p = path();
    expect(samplePathAtTime(p, 0)!.position[0]).toBeCloseTo(0);
    expect(samplePathAtTime(p, 4)!.position[0]).toBeCloseTo(100);
    expect(samplePathAtTime(p, 10)!.position[0]).toBeCloseTo(300);
  });

  it('smoothness 0.5 is continuous (no jumps between samples)', () => {
    const p = path();
    let prev = samplePathAtTime(p, 0)!.position[0];
    for (let t = 0.05; t <= 10; t += 0.05) {
      const x = samplePathAtTime(p, t)!.position[0];
      expect(Math.abs(x - prev)).toBeLessThan(15);
      prev = x;
    }
  });

  it('applies shot easing: ease-in is slower at the start', () => {
    const lin = samplePathAtTime(path(), 2)!.position[0];
    const eased = samplePathAtTime(path({ easing: 'easeIn' }), 2)!.position[0];
    expect(eased).toBeLessThan(lin);
  });

  it('handles empty and single-keyframe paths', () => {
    expect(samplePathAtTime(defaultPath(), 1)).toBeNull();
    expect(samplePathAtTime({ ...defaultPath(), keyframes: [kf(5, 0)] }, 3)!.position[0]).toBe(5);
    expect(samplePolyline([], 0.5)).toEqual([]);
  });

  it('polyline starts and ends at the first / last keyframe', () => {
    const p = path();
    const pts = samplePolyline(p.keyframes, 0.5, 10);
    expect(pts[0][0]).toBeCloseTo(0);
    expect(pts[pts.length - 1][0]).toBeCloseTo(300);
  });

  it('sanitizePath round-trips JSON and rejects garbage', () => {
    const p = path({ name: 'x', lockTarget: 'b1', loop: true });
    const back = sanitizePath(JSON.parse(JSON.stringify(p)));
    expect(back).toEqual(p);
    expect(sanitizePath({ keyframes: [{ position: [1, 2] }] })).toBeNull();
    expect(sanitizePath(null)).toBeNull();
    expect(sanitizePath('nope')).toBeNull();
  });
});

describe('cinematic presets', () => {
  const geometry = geometryProvider.build(demoCampus);

  it('every non-free preset builds a valid >=2 keyframe shot with finite numbers', () => {
    for (const info of PRESETS.filter((p) => p.id !== 'freeFlight')) {
      const res = buildPreset(info.id, geometry);
      expect(res, info.id).not.toBeNull();
      expect(res!.keyframes.length, info.id).toBeGreaterThanOrEqual(2);
      expect(res!.keyframes[0].duration).toBe(0);
      for (const k of res!.keyframes) {
        expect([...k.position, ...k.target].every(Number.isFinite), info.id).toBe(true);
        expect(k.position[1]).toBeGreaterThan(0);
      }
    }
  });

  it('orbit returns to its starting point', () => {
    const res = buildPreset('orbit', geometry)!;
    const a = res.keyframes[0].position;
    const b = res.keyframes[res.keyframes.length - 1].position;
    expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeLessThan(1e-6);
  });

  it('dolly in and dolly out are reversed approaches', () => {
    const dIn = buildPreset('dollyIn', geometry)!.keyframes;
    const dOut = buildPreset('dollyOut', geometry)!.keyframes;
    expect(dIn[0].position).toEqual(dOut[dOut.length - 1].position);
    expect(dIn[dIn.length - 1].position).toEqual(dOut[0].position);
  });
});

describe('cinematic store', () => {
  beforeEach(() => __resetCinematicForTests());

  it('manages keyframes: add, duplicate, reorder, delete', () => {
    runtime.api = {
      getPose: () => ({ position: [1, 2, 3], target: [0, 0, 0], fov: 40 }),
      flyTo: () => {},
      defaultFov: () => 40,
    };
    cinematic.open();
    cinematic.addKeyframeFromCamera();
    cinematic.addKeyframeFromCamera();
    let kfs = cinematic.getState().path.keyframes;
    expect(kfs).toHaveLength(2);
    expect(kfs[0].duration).toBe(0);
    expect(kfs[1].duration).toBeGreaterThan(0);

    cinematic.duplicateKeyframe(kfs[0].id);
    kfs = cinematic.getState().path.keyframes;
    expect(kfs).toHaveLength(3);

    const ids = kfs.map((k) => k.id);
    cinematic.moveKeyframe(ids[0], 1);
    expect(cinematic.getState().path.keyframes[1].id).toBe(ids[0]);
    expect(cinematic.getState().path.keyframes[0].duration).toBe(0);

    cinematic.deleteKeyframe(ids[0]);
    expect(cinematic.getState().path.keyframes).toHaveLength(2);
  });

  it('applies presets and handles play / pause / stop / seek', () => {
    const geometry = geometryProvider.build(demoCampus);
    cinematic.open();
    cinematic.play(); // no keyframes → refuses
    expect(cinematic.getState().status).toBe('idle');

    cinematic.applyPreset('flyover', geometry);
    expect(cinematic.getState().path.keyframes.length).toBeGreaterThan(1);
    cinematic.play();
    expect(cinematic.getState().status).toBe('playing');
    cinematic.togglePlay();
    expect(cinematic.getState().status).toBe('paused');
    cinematic.seek(5);
    expect(runtime.time).toBe(5);
    cinematic.seek(1e9);
    expect(runtime.time).toBe(totalDuration(cinematic.getState().path.keyframes));
    cinematic.stop();
    expect(runtime.time).toBe(0);
    expect(cinematic.getState().status).toBe('idle');
  });

  it('exports and imports a path', () => {
    const geometry = geometryProvider.build(demoCampus);
    cinematic.open();
    cinematic.applyPreset('orbit', geometry);
    const json = cinematic.exportPathJson();
    cinematic.clearKeyframes();
    expect(cinematic.getState().path.keyframes).toHaveLength(0);
    cinematic.importPathJson(json);
    expect(cinematic.getState().path.keyframes).toHaveLength(9);
  });
});
