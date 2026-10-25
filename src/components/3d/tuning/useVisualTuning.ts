import { folder, useControls } from 'leva';
import { useMemo } from 'react';

/**
 * Checks whether the current environment allows developer visual tuning.
 * Enabled in Vite development mode (`import.meta.env.DEV`), or when explicit
 * query flag `?debug=true` / `?tuning=true` or `#debug` is present in the URL.
 */
export function isDevOrDebugMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (import.meta.env.DEV) return true;
  try {
    const url = new URL(window.location.href);
    return (
      url.searchParams.get('debug') === 'true' ||
      url.searchParams.get('debug') === '1' ||
      url.searchParams.get('tuning') === 'true' ||
      url.searchParams.get('tuning') === '1' ||
      window.location.hash.includes('debug')
    );
  } catch {
    return false;
  }
}

export type VisualTuningParams = {
  // Lighting
  sunIntensity: number;
  sunColor: string;
  sunPosition: [number, number, number];
  ambientIntensity: number;
  ambientColor: string;
  hemisphereIntensity: number;
  hemisphereSkyColor: string;
  hemisphereGroundColor: string;
  fillLightIntensity: number;

  // Shadows
  shadowsEnabled: boolean;
  softShadowSize: number;
  softShadowSamples: number;
  shadowBias: number;
  shadowNormalBias: number;
  shadowMapSize: number;
  bakeShadows: boolean;

  // Environment & Atmosphere
  backgroundColor: string;
  fogEnabled: boolean;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  skyTurbidity: number;
  skyRayleigh: number;
  skyMieCoefficient: number;
  skyMieDirectionalG: number;

  // Terrain & Context
  groundColor: string;
  lawnColor: string;
  roadColor: string;
  trackColor: string;
  pitchColor: string;
  courtColor: string;

  // Materials & Architecture
  classicWallColor: string;
  classicRoofColor: string;
  modernWallColor: string;
  modernRoofColor: string;
  curtainGlassColor: string;
  windowGlassColor: string;
  dormitoryStripeColor: string;
  dormitoryRoofColor: string;
  utilityWallColor: string;

  // Immersion, Wind & Environmental Life
  toneMappingExposure?: number;
  contactShadowsEnabled?: boolean;
  contactShadowOpacity?: number;
  pbrTexturesEnabled?: boolean;
  windEnabled?: boolean;
  windSpeed?: number;
  windStrength?: number;
  campusPropsEnabled?: boolean;
  skyLifeEnabled?: boolean;

  // Audio
  audioEnabled?: boolean;
  audioVolume?: number;

  // Performance (Drei)
  adaptiveDpr: boolean;
  showStats: boolean;
};

export const DEFAULT_TUNING_VALUES: VisualTuningParams = {
  // Lighting
  sunIntensity: 1.8,
  sunColor: '#fffbf0',
  sunPosition: [160, 220, 110],
  ambientIntensity: 0.65,
  ambientColor: '#f0f9ff',
  hemisphereIntensity: 0.5,
  hemisphereSkyColor: '#ffffff',
  hemisphereGroundColor: '#94a3b8',
  fillLightIntensity: 0.35,

  // Shadows
  shadowsEnabled: true,
  softShadowSize: 22,
  softShadowSamples: 16,
  shadowBias: -0.00015,
  shadowNormalBias: 0.02,
  shadowMapSize: 2048,
  bakeShadows: false,

  // Environment
  backgroundColor: '#dbeafe',
  fogEnabled: true,
  fogColor: '#dbeafe',
  fogNear: 550,
  fogFar: 2400,
  skyTurbidity: 0.2,
  skyRayleigh: 0.45,
  skyMieCoefficient: 0.005,
  skyMieDirectionalG: 0.8,

  // Terrain
  groundColor: '#d8d4cc',
  lawnColor: '#6d964b',
  roadColor: '#3b4654',
  trackColor: '#c24136',
  pitchColor: '#3d8c45',
  courtColor: '#2c6fa8',

  // Materials
  classicWallColor: '#fdfbf7',
  classicRoofColor: '#a83228',
  modernWallColor: '#f8fafc',
  modernRoofColor: '#475569',
  curtainGlassColor: '#3876a8',
  windowGlassColor: '#4b779e',
  dormitoryStripeColor: '#991b1b',
  dormitoryRoofColor: '#8a99a8',
  utilityWallColor: '#e2e8f0',

  // Immersion, Wind & Environmental Life
  toneMappingExposure: 1.05,
  contactShadowsEnabled: true,
  contactShadowOpacity: 0.36,
  pbrTexturesEnabled: true,
  windEnabled: true,
  windSpeed: 1.25,
  windStrength: 0.22,
  campusPropsEnabled: true,
  skyLifeEnabled: true,

  // Audio
  audioEnabled: true,
  audioVolume: 0.65,

  // Performance (Drei)
  adaptiveDpr: false,
  showStats: false,
};

/**
 * Hook providing live reactive tuning controls via Leva.
 * When developer mode is inactive, returns defaults without mounting Leva listeners.
 */
export function useVisualTuning(): VisualTuningParams {
  const isEnabled = useMemo(() => isDevOrDebugMode(), []);

  const controls = useControls(
    'Campus 3D Visual Tuning',
    {
      Lighting: folder({
        sunIntensity: { value: 1.8, min: 0, max: 4, step: 0.1, label: 'Sun Intensity' },
        sunColor: { value: '#fffbf0', label: 'Sun Color' },
        sunPosition: { value: [160, 220, 110], step: 10, label: 'Sun Position' },
        ambientIntensity: { value: 0.65, min: 0, max: 2, step: 0.05, label: 'Ambient Light' },
        ambientColor: { value: '#f0f9ff', label: 'Ambient Color' },
        hemisphereIntensity: { value: 0.5, min: 0, max: 2, step: 0.05, label: 'Hemi Light' },
        hemisphereSkyColor: { value: '#ffffff', label: 'Hemi Sky' },
        hemisphereGroundColor: { value: '#94a3b8', label: 'Hemi Ground' },
        fillLightIntensity: { value: 0.35, min: 0, max: 1.5, step: 0.05, label: 'Fill Light' },
        toneMappingExposure: { value: 1.05, min: 0.4, max: 2.0, step: 0.05, label: 'Exposure' },
      }),
      Shadows: folder({
        shadowsEnabled: { value: true, label: 'Enable Shadows' },
        softShadowSize: { value: 22, min: 1, max: 40, step: 1, label: 'Soft Radius' },
        softShadowSamples: { value: 16, min: 4, max: 32, step: 1, label: 'Samples' },
        shadowBias: { value: -0.00015, min: -0.001, max: 0.001, step: 0.00005, label: 'Bias' },
        shadowNormalBias: { value: 0.02, min: 0, max: 0.1, step: 0.005, label: 'Normal Bias' },
        shadowMapSize: { value: 2048, options: [1024, 2048, 4096], label: 'Resolution' },
        contactShadowsEnabled: { value: true, label: 'Contact AO Shadows' },
        contactShadowOpacity: { value: 0.36, min: 0, max: 0.85, step: 0.04, label: 'Contact Opacity' },
        bakeShadows: { value: false, label: 'Bake Shadows (Drei)' },
      }),
      Environment: folder({
        backgroundColor: { value: '#dbeafe', label: 'Background' },
        fogEnabled: { value: true, label: 'Fog Enabled' },
        fogColor: { value: '#dbeafe', label: 'Fog Color' },
        fogNear: { value: 550, min: 100, max: 1500, step: 50, label: 'Fog Near (m)' },
        fogFar: { value: 2400, min: 1000, max: 4000, step: 100, label: 'Fog Far (m)' },
        skyTurbidity: { value: 0.2, min: 0, max: 10, step: 0.1, label: 'Sky Turbidity' },
        skyRayleigh: { value: 0.45, min: 0, max: 4, step: 0.05, label: 'Sky Rayleigh' },
        skyMieCoefficient: { value: 0.005, min: 0, max: 0.05, step: 0.001, label: 'Mie Coeff' },
        skyMieDirectionalG: { value: 0.8, min: 0, max: 1, step: 0.05, label: 'Mie Directional G' },
      }),
      Terrain: folder({
        pbrTexturesEnabled: { value: true, label: 'PBR Surface Textures' },
        groundColor: { value: '#d8d4cc', label: 'Ground Base' },
        lawnColor: { value: '#6d964b', label: 'Lawn Grass' },
        roadColor: { value: '#3b4654', label: 'Asphalt Road' },
        trackColor: { value: '#c24136', label: 'Athletics Track' },
        pitchColor: { value: '#3d8c45', label: 'Football Turf' },
        courtColor: { value: '#2c6fa8', label: 'Court Blue' },
      }),
      Materials: folder({
        classicWallColor: { value: '#fdfbf7', label: 'Classic Wall' },
        classicRoofColor: { value: '#a83228', label: 'Classic Red Roof' },
        modernWallColor: { value: '#f8fafc', label: 'Modern Wall' },
        modernRoofColor: { value: '#475569', label: 'Modern Roof' },
        curtainGlassColor: { value: '#3876a8', label: 'Curtain Glass' },
        windowGlassColor: { value: '#4b779e', label: 'Window Glass' },
        dormitoryStripeColor: { value: '#991b1b', label: 'Dorm Brick Band' },
        dormitoryRoofColor: { value: '#8a99a8', label: 'Dorm Metal Roof' },
        utilityWallColor: { value: '#e2e8f0', label: 'Utility Wall' },
      }),
      LifeAndWind: folder({
        windEnabled: { value: true, label: 'Foliage Wind Sway' },
        windSpeed: { value: 1.25, min: 0, max: 4, step: 0.1, label: 'Wind Speed' },
        windStrength: { value: 0.22, min: 0, max: 0.8, step: 0.02, label: 'Wind Strength' },
        campusPropsEnabled: { value: true, label: 'Benches, Lamps & Curbs' },
        skyLifeEnabled: { value: true, label: 'Clouds, Birds & Horizon' },
      }),
      Audio: folder({
        audioEnabled: { value: true, label: 'Enable Campus Audio' },
        audioVolume: { value: 0.65, min: 0, max: 1, step: 0.05, label: 'Master Volume' },
      }),
      Performance: folder({
        adaptiveDpr: { value: false, label: 'Adaptive DPR (Drei)' },
        showStats: { value: false, label: 'Show FPS Stats (Drei)' },
      }),
    },
    { collapsed: true },
  );

  if (!isEnabled) {
    return DEFAULT_TUNING_VALUES;
  }

  return controls as VisualTuningParams;
}
