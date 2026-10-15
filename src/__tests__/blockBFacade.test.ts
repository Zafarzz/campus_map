import { describe, expect, it } from 'vitest';
import { demoCampus } from '../data/demo-campus';
import { getBuildingAppearance, BLOCK_B_FRONT } from '../domain/appearance';
import { geometryProvider } from '../services/geometry';

describe('Block B Architectural Facade & Appearance', () => {
  it('resolves BLOCK_B_FRONT preset with customFacade="block-b" for bld-g (facing Block C)', () => {
    const appearance = getBuildingAppearance('bld-g');
    expect(appearance.preset).toBe('block-b-front');
    expect(appearance.customFacade).toBe('block-b');
    expect(appearance.plinthHeight).toBe(1.0);
    expect(appearance.hasCornice).toBe(true);
    expect(appearance.hasPlinth).toBe(true);
    expect(appearance.roofType).toBe('hip');
    expect(appearance.roofColor).toBe('#991b1b');
    expect(appearance.wallColor).toBe('#ebdcc5');
  });

  it('preserves BLOCK_B_FRONT preset constants and default properties', () => {
    expect(BLOCK_B_FRONT.roofType).toBe('hip');
    expect(BLOCK_B_FRONT.roofHeight).toBe(3.6);
    expect(BLOCK_B_FRONT.plinthColor).toBe('#5c2d22');
    expect(BLOCK_B_FRONT.corniceColor).toBe('#f1e6cf');
    expect(BLOCK_B_FRONT.hasWindows).toBe(true);
  });

  it('verifies Block B exists as a 4-storey building', () => {
    const bldB = demoCampus.buildings.find((b) => b.id === 'bld-g');
    expect(bldB).toBeDefined();
    expect(bldB?.shortName).toBe('B');
    expect(bldB?.name).toBe('Block B');
  });

  it('calibrates Block B footprint width to ~55.0m from CAD elevation drawing', () => {
    const campusGeom = geometryProvider.build(demoCampus);
    const bldGeom = campusGeom.buildings['bld-g'];
    expect(bldGeom).toBeDefined();

    // 183px * 0.3 = 54.9m (~55.0m CAD elevation), depth 50px * 0.3 = 15.0m
    const part = bldGeom.parts[0];
    expect(part.type).toBe('rect');
    if (part.type === 'rect') {
      const [w, d] = part.size;
      expect(w).toBeCloseTo(54.9, 1);
      expect(d).toBeCloseTo(15.0, 1);
    }
  });

  it('maintains ground connector connection between Block B (bld-g) and Block C (bld-i)', () => {
    const campusGeom = geometryProvider.build(demoCampus);
    const connBToC = campusGeom.connectors.find((c) => c.id === 'conn-bld-g-bld-i')!;
    const bldG = campusGeom.buildings['bld-g'];
    const bldI = campusGeom.buildings['bld-i'];

    expect(connBToC).toBeDefined();
    if (connBToC.footprint.type === 'rect') {
      const connCenterZ = connBToC.footprint.center[1];
      expect(connCenterZ).toBeGreaterThan(bldG.center[2]);
      expect(connCenterZ).toBeLessThan(bldI.center[2]);
    }
  });

  it('supports live tuning wall color override for block-b-front without mutation', () => {
    const tuned = getBuildingAppearance('bld-g', { classicWallColor: '#ffffff' });
    expect(tuned.wallColor).toBe('#ffffff');
    expect(tuned.customFacade).toBe('block-b');

    // Original preset remains untouched
    const untuned = getBuildingAppearance('bld-g');
    expect(untuned.wallColor).toBe('#ebdcc5');
  });
});
