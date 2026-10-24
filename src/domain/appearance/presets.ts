import type { BuildingAppearance } from './types';

export const DEFAULT_APPEARANCE: BuildingAppearance = {
  preset: 'default',
  wallColor: '#f1f5f9',
  wallRoughness: 0.85,
  wallMetalness: 0.05,
  roofType: 'flat',
  roofColor: '#64748b',
  roofRoughness: 0.8,
  roofHeight: 1.0,
  roofOverhang: 0.6,
  hasCornice: true,
  corniceColor: '#e2e8f0',
  hasPlinth: true,
  plinthColor: '#334155',
  plinthHeight: 0.6,
  hasWindows: true,
  windowColor: '#1e293b',
  windowFrameColor: '#94a3b8',
  windowWidth: 1.2,
  windowHeight: 1.8,
  glassAccent: false,
  accentStripe: false,
  hasPortico: false,
};

export const ACADEMIC_CLASSIC: BuildingAppearance = {
  ...DEFAULT_APPEARANCE,
  preset: 'academic-classic',
  wallColor: '#fdfbf7',
  wallRoughness: 0.9,
  wallMetalness: 0.0,
  roofType: 'hip',
  roofColor: '#b91c1c',
  roofRoughness: 0.75,
  roofHeight: 4.0,
  roofOverhang: 1.2,
  hasCornice: false,
  hasPlinth: true,
  plinthColor: '#334155',
  plinthHeight: 0.8,
  hasWindows: true,
  hasPortico: true,
  porticoColor: '#ffffff',
};

export const ACADEMIC_MODERN: BuildingAppearance = {
  ...DEFAULT_APPEARANCE,
  preset: 'academic-modern',
  wallColor: '#f8fafc',
  wallRoughness: 0.75,
  wallMetalness: 0.1,
  roofType: 'flat',
  roofColor: '#475569',
  roofRoughness: 0.8,
  roofHeight: 1.0,
  hasCornice: true,
  corniceColor: '#e2e8f0',
  hasPlinth: true,
  plinthColor: '#1e293b',
  hasWindows: true,
  glassAccent: true,
  glassColor: '#0284c7',
};

export const DORMITORY: BuildingAppearance = {
  ...DEFAULT_APPEARANCE,
  preset: 'dormitory',
  wallColor: '#f8fafc',
  wallRoughness: 0.8,
  roofType: 'hip',
  roofColor: '#8a99a8', // Silver-grey standing seam metal roof matching CAD reference
  roofHeight: 3.2,
  roofOverhang: 0.8,
  hasCornice: true,
  corniceColor: '#e2e8f0',
  hasPlinth: true,
  plinthColor: '#475569',
  hasWindows: true,
  accentStripe: false,
};

export const ADMINISTRATION: BuildingAppearance = {
  ...DEFAULT_APPEARANCE,
  preset: 'administration',
  wallColor: '#f8fafc',
  wallRoughness: 0.85,
  roofType: 'hip',
  roofColor: '#475569',
  roofHeight: 3.8,
  hasCornice: false,
  hasPlinth: true,
  plinthColor: '#1e293b',
  hasWindows: true,
  hasPortico: true,
  porticoColor: '#f1f5f9',
};

export const SPORTS_COMPLEX: BuildingAppearance = {
  ...DEFAULT_APPEARANCE,
  preset: 'sports-complex',
  wallColor: '#f1f5f9',
  wallRoughness: 0.7,
  wallMetalness: 0.15,
  roofType: 'barrel',
  roofColor: '#334155',
  roofHeight: 4.5,
  hasCornice: true,
  corniceColor: '#cbd5e1',
  hasPlinth: true,
  plinthColor: '#0f172a',
  glassAccent: true,
  glassColor: '#0369a1',
};

export const UTILITY: BuildingAppearance = {
  ...DEFAULT_APPEARANCE,
  preset: 'utility',
  wallColor: '#e2e8f0',
  wallRoughness: 0.95,
  roofType: 'flat',
  roofColor: '#94a3b8',
  hasCornice: true,
  corniceColor: '#cbd5e1',
  hasPlinth: true,
  plinthColor: '#475569',
  hasWindows: true,
};

export const BLOCK_C_FRONT: BuildingAppearance = {
  ...DEFAULT_APPEARANCE,
  preset: 'block-c-front',
  wallColor: '#e2c391',
  wallRoughness: 0.82,
  wallMetalness: 0.04,
  roofType: 'flat',
  roofColor: '#475569',
  roofRoughness: 0.85,
  hasCornice: true,
  corniceColor: '#f1e6cf',
  hasPlinth: true,
  plinthColor: '#7b4a3a',
  plinthHeight: 1.1,
  hasWindows: true,
  windowColor: '#4a5561',
  customFacade: 'block-c',
};

export const BLOCK_B_FRONT: BuildingAppearance = {
  ...DEFAULT_APPEARANCE,
  preset: 'block-b-front',
  wallColor: '#ebdcc5', // Warm travertine / cream beige
  wallRoughness: 0.8,
  wallMetalness: 0.05,
  roofType: 'hip',
  roofColor: '#991b1b', // Classic red metal tile roof
  roofRoughness: 0.7,
  roofHeight: 3.6,
  roofOverhang: 1.0,
  hasCornice: true,
  corniceColor: '#f1e6cf',
  hasPlinth: true,
  plinthColor: '#5c2d22', // Dark granite / terracotta plinth
  plinthHeight: 1.0,
  hasWindows: true,
  windowColor: '#4a5561',
  customFacade: 'block-b',
};

export const APPEARANCE_PRESETS: Record<string, BuildingAppearance> = {
  'academic-classic': ACADEMIC_CLASSIC,
  'academic-modern': ACADEMIC_MODERN,
  'dormitory': DORMITORY,
  'administration': ADMINISTRATION,
  'sports-complex': SPORTS_COMPLEX,
  'utility': UTILITY,
  'block-c-front': BLOCK_C_FRONT,
  'block-b-front': BLOCK_B_FRONT,
  'default': DEFAULT_APPEARANCE,
};

export const BUILDING_APPEARANCE_REGISTRY: Record<string, BuildingAppearance> = {
  'bld-a': ACADEMIC_CLASSIC,
  'bld-h': ACADEMIC_CLASSIC, // Building A (Main block)
  'bld-c': ACADEMIC_CLASSIC, // Building D (2-storey block with red roof)
  'bld-g': BLOCK_B_FRONT,    // Building B (4-storey block facing Block C, calibrated to CAD)
  'bld-e': SPORTS_COMPLEX,   // Sports / C-complex
  'bld-b': UTILITY,          // Utility
  'bld-d': UTILITY,          // Building F
  'bld-f': ACADEMIC_CLASSIC, // Cluster red
  'bld-i': BLOCK_C_FRONT,    // Block C Front Facade (next to Block A and B)
  'bld-j': DORMITORY,        // Block J (Dormitory Quadrangle)
};

export type TuningMaterialOverrides = {
  classicWallColor?: string;
  classicRoofColor?: string;
  modernWallColor?: string;
  modernRoofColor?: string;
  curtainGlassColor?: string;
  windowGlassColor?: string;
  dormitoryStripeColor?: string;
  dormitoryRoofColor?: string;
  utilityWallColor?: string;
};

/**
 * Resolves visual appearance for a building safely.
 * Precedence:
 * 1. building.appearance overrides
 * 2. building.appearancePreset lookup
 * 3. BUILDING_APPEARANCE_REGISTRY lookup by building.id
 * 4. DEFAULT_APPEARANCE fallback
 * Optionally connects live tuning overrides from Leva without mutating source data.
 */
export function getBuildingAppearance(
  building: { id: string; appearancePreset?: string; appearance?: Partial<BuildingAppearance> } | string,
  tuning?: TuningMaterialOverrides,
): BuildingAppearance {
  const bldObj = typeof building === 'string' ? { id: building } : building;
  let base =
    (bldObj.appearancePreset && APPEARANCE_PRESETS[bldObj.appearancePreset]) ||
    BUILDING_APPEARANCE_REGISTRY[bldObj.id] ||
    DEFAULT_APPEARANCE;

  if (tuning) {
    if (base.preset === 'academic-classic') {
      base = {
        ...base,
        wallColor: tuning.classicWallColor ?? base.wallColor,
        roofColor: tuning.classicRoofColor ?? base.roofColor,
      };
    } else if (base.preset === 'academic-modern' || base.preset === 'sports-complex') {
      base = {
        ...base,
        wallColor: tuning.modernWallColor ?? base.wallColor,
        roofColor: tuning.modernRoofColor ?? base.roofColor,
        glassColor: tuning.curtainGlassColor ?? base.glassColor,
      };
    } else if (base.preset === 'dormitory') {
      base = {
        ...base,
        wallColor: tuning.modernWallColor ?? base.wallColor,
        roofColor: tuning.dormitoryRoofColor ?? base.roofColor,
        accentStripeColor: tuning.dormitoryStripeColor ?? base.accentStripeColor,
      };
    } else if (base.preset === 'utility') {
      base = {
        ...base,
        wallColor: tuning.utilityWallColor ?? base.wallColor,
      };
    } else if (base.preset === 'block-c-front' || base.preset === 'block-b-front') {
      base = {
        ...base,
        wallColor: tuning.classicWallColor ?? base.wallColor,
        roofColor: tuning.classicRoofColor ?? base.roofColor,
      };
    }
    if (tuning.windowGlassColor) {
      base = {
        ...base,
        windowColor: tuning.windowGlassColor,
      };
    }
  }

  if (bldObj.appearance && Object.keys(bldObj.appearance).length > 0) {
    return { ...base, ...bldObj.appearance };
  }

  return base;
}
