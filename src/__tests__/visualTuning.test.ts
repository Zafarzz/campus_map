import { AdaptiveDpr, BakeShadows, Sky, SoftShadows, Stats } from '@react-three/drei';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TUNING_VALUES,
  isDevOrDebugMode,
} from '../components/3d/tuning/useVisualTuning';
import {
  ACADEMIC_CLASSIC,
  ACADEMIC_MODERN,
  getBuildingAppearance,
} from '../domain/appearance';

describe('Visual Tuning & Drei Integration', () => {
  it('DEFAULT_TUNING_VALUES contains complete visual parameter configuration', () => {
    expect(DEFAULT_TUNING_VALUES.sunIntensity).toBeGreaterThan(0);
    expect(DEFAULT_TUNING_VALUES.sunColor).toBe('#fffbf0');
    expect(DEFAULT_TUNING_VALUES.sunPosition).toHaveLength(3);
    expect(DEFAULT_TUNING_VALUES.ambientIntensity).toBeGreaterThan(0);
    expect(DEFAULT_TUNING_VALUES.shadowsEnabled).toBe(true);
    expect(DEFAULT_TUNING_VALUES.softShadowSize).toBeGreaterThan(0);
    expect(DEFAULT_TUNING_VALUES.fogEnabled).toBe(true);
    expect(DEFAULT_TUNING_VALUES.backgroundColor).toBe('#dbeafe');
    expect(DEFAULT_TUNING_VALUES.groundColor).toBe('#cbd5e1');
    expect(DEFAULT_TUNING_VALUES.classicWallColor).toBe('#fdfbf7');
    expect(DEFAULT_TUNING_VALUES.classicRoofColor).toBe('#b91c1c');
    expect(DEFAULT_TUNING_VALUES.modernWallColor).toBe('#f8fafc');
    expect(DEFAULT_TUNING_VALUES.curtainGlassColor).toBe('#0284c7');
  });

  it('Drei visual and performance helpers are available and exported', () => {
    expect(SoftShadows).toBeDefined();
    expect(Sky).toBeDefined();
    expect(AdaptiveDpr).toBeDefined();
    expect(BakeShadows).toBeDefined();
    expect(Stats).toBeDefined();
  });

  it('isDevOrDebugMode returns boolean without throwing', () => {
    const result = isDevOrDebugMode();
    expect(typeof result).toBe('boolean');
  });

  it('getBuildingAppearance applies live Leva tuning overrides without mutating presets', () => {
    const originalClassicWall = ACADEMIC_CLASSIC.wallColor;
    const originalClassicRoof = ACADEMIC_CLASSIC.roofColor;

    // Apply custom tuning overrides
    const appearance = getBuildingAppearance('bld-a', {
      classicWallColor: '#123456',
      classicRoofColor: '#654321',
      windowGlassColor: '#abcdef',
    });

    expect(appearance.wallColor).toBe('#123456');
    expect(appearance.roofColor).toBe('#654321');
    expect(appearance.windowColor).toBe('#abcdef');

    // Baseline preset must remain unmodified
    expect(ACADEMIC_CLASSIC.wallColor).toBe(originalClassicWall);
    expect(ACADEMIC_CLASSIC.roofColor).toBe(originalClassicRoof);
  });

  it('getBuildingAppearance applies live modern glass overrides for modern buildings', () => {
    const appearance = getBuildingAppearance('bld-e', {
      modernWallColor: '#112233',
      modernRoofColor: '#445566',
      curtainGlassColor: '#00ffff',
    });

    expect(appearance.wallColor).toBe('#112233');
    expect(appearance.roofColor).toBe('#445566');
    expect(appearance.glassColor).toBe('#00ffff');
    expect(ACADEMIC_MODERN.wallColor).toBe('#f8fafc');
  });
});
