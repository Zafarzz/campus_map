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
  wallColor: '#fdfbf7',
  wallRoughness: 0.85,
  roofType: 'hip',
  roofColor: '#b91c1c',
  roofHeight: 3.5,
  hasCornice: false,
  hasPlinth: true,
  plinthColor: '#334155',
  hasWindows: true,
  accentStripe: true,
  accentStripeColor: '#991b1b',
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
  roofType: 'flat',
  roofColor: '#334155',
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

export const APPEARANCE_PRESETS: Record<string, BuildingAppearance> = {
  'academic-classic': ACADEMIC_CLASSIC,
  'academic-modern': ACADEMIC_MODERN,
  'dormitory': DORMITORY,
  'administration': ADMINISTRATION,
  'sports-complex': SPORTS_COMPLEX,
  'utility': UTILITY,
  'default': DEFAULT_APPEARANCE,
};

export const BUILDING_APPEARANCE_REGISTRY: Record<string, BuildingAppearance> = {
  'bld-a': ACADEMIC_CLASSIC,
  'bld-h': ACADEMIC_CLASSIC, // Building A (Main block)
  'bld-c': ACADEMIC_CLASSIC, // Building D (2-storey block with red roof)
  'bld-g': DORMITORY,        // Building B
  'bld-e': SPORTS_COMPLEX,   // Sports / C-complex
  'bld-b': UTILITY,          // Utility
  'bld-d': UTILITY,          // Building F
  'bld-f': ACADEMIC_CLASSIC, // Cluster red
  'bld-i': ACADEMIC_CLASSIC, // Cluster red
  'bld-j': ADMINISTRATION,   // Block J
};

export type TuningMaterialOverrides = {
  classicWallColor?: string;
  classicRoofColor?: string;
  modernWallColor?: string;
  modernRoofColor?: string;
  curtainGlassColor?: string;
  windowGlassColor?: string;
  dormitoryStripeColor?: string;
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
        wallColor: tuning.classicWallColor ?? base.wallColor,
        roofColor: tuning.classicRoofColor ?? base.roofColor,
        accentStripeColor: tuning.dormitoryStripeColor ?? base.accentStripeColor,
      };
    } else if (base.preset === 'utility') {
      base = {
        ...base,
        wallColor: tuning.utilityWallColor ?? base.wallColor,
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
