import { describe, expect, it } from 'vitest';
import { demoCampus } from '../data/demo-campus';
import { getBuildingAppearance, BLOCK_C_FRONT } from '../domain/appearance';
import {
  getAjouLogoTexture,
  getAtticBannerTexture,
  getCanopySignTexture,
} from '../components/3d/facades/facadeTextures';

describe('Block C Architectural Facade & Appearance', () => {
  it('resolves BLOCK_C_FRONT preset with customFacade="block-c" for bld-i (adjacent to Block A & B)', () => {
    const appearance = getBuildingAppearance('bld-i');
    expect(appearance.preset).toBe('block-c-front');
    expect(appearance.customFacade).toBe('block-c');
    expect(appearance.plinthHeight).toBe(1.1);
    expect(appearance.hasCornice).toBe(true);
    expect(appearance.hasPlinth).toBe(true);
    expect(appearance.wallColor).toBe('#e2c391');
  });

  it('preserves BLOCK_C_FRONT preset constants and default properties', () => {
    expect(BLOCK_C_FRONT.roofType).toBe('hip');
    expect(BLOCK_C_FRONT.roofColor).toBe('#991b1b');
    expect(BLOCK_C_FRONT.plinthColor).toBe('#7b4a3a');
    expect(BLOCK_C_FRONT.corniceColor).toBe('#f1e6cf');
    expect(BLOCK_C_FRONT.hasWindows).toBe(true);
  });

  it('ensures exactly ONE Block C exists on campus without duplicates', () => {
    const cBuildings = demoCampus.buildings.filter((b) => b.shortName === 'C');
    expect(cBuildings).toHaveLength(1);
    expect(cBuildings[0].id).toBe('bld-i');
    expect(cBuildings[0].name).toBe('Block C');
    expect(cBuildings[0].floors).toHaveLength(2);
  });

  it('supports texture generators gracefully without throwing errors', () => {
    // In headless Node/Vitest, document may or may not be defined; functions must be safe
    const attic = getAtticBannerTexture();
    const canopy = getCanopySignTexture();
    const logo = getAjouLogoTexture();

    if (typeof document !== 'undefined') {
      expect(attic).not.toBeNull();
      expect(canopy).not.toBeNull();
      expect(logo).not.toBeNull();
    } else {
      expect(attic).toBeNull();
      expect(canopy).toBeNull();
      expect(logo).toBeNull();
    }
  });

  it('supports live tuning wall color override for block-c-front without mutation', () => {
    const tuned = getBuildingAppearance('bld-i', { classicWallColor: '#ffffff' });
    expect(tuned.wallColor).toBe('#ffffff');
    expect(tuned.customFacade).toBe('block-c');

    // Original preset remains untouched
    const untuned = getBuildingAppearance('bld-i');
    expect(untuned.wallColor).toBe('#e2c391');
  });

  it('scales Block C footprint depth to 60.6m per user calibration (orange eto c block)', async () => {
    const bldIRects = demoCampus.buildings.find((b) => b.id === 'bld-i');
    expect(bldIRects).toBeDefined();
    const campusGeom = (await import('../services/geometry')).geometryProvider.build(demoCampus);
    const bldGeom = campusGeom.buildings['bld-i'];
    expect(bldGeom).toBeDefined();

    // Primary footprint part depth: 202px * 0.3 = 60.6m
    const part = bldGeom.parts[0];
    expect(part.type).toBe('rect');
    if (part.type === 'rect') {
      const [w, d] = part.size;
      expect(w).toBeCloseTo(24.0, 1);
      expect(d).toBeCloseTo(60.6, 1);
    }
  });
});

