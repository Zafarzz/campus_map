import * as THREE from 'three';
import type { Vec3 } from '../domain/geometry/types';

export interface FountainLightingConfig {
  enabled: boolean;
  color: string;
  intensity: number;
}

export interface DynamicAtmosphere {
  timeHours: number; // 0.0 - 24.0
  period: 'night' | 'morning' | 'day' | 'sunset';
  sunPosition: Vec3;
  sunColor: string;
  sunIntensity: number;
  ambientColor: string;
  ambientIntensity: number;
  hemisphereSkyColor: string;
  hemisphereGroundColor: string;
  hemisphereIntensity: number;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  backgroundColor: string;
  exposure: number;
  skyTurbidity: number;
  skyRayleigh: number;
  isNight: boolean;
  streetLampsActive: boolean;
  windowNightLightFactor: number; // 0.0 to 1.0 (emissive intensity for lighted windows)
}

/**
 * Calculates continuous celestial sun trajectory and atmospheric parameters
 * based on a 24-hour cycle (hours in 0..24).
 */
export function calculateAtmosphereForHour(hours: number): DynamicAtmosphere {
  // Normalize hours to [0, 24)
  const h = ((hours % 24) + 24) % 24;

  let period: 'night' | 'morning' | 'day' | 'sunset';
  if (h >= 6 && h < 11) {
    period = 'morning';
  } else if (h >= 11 && h < 17) {
    period = 'day';
  } else if (h >= 17 && h < 20) {
    period = 'sunset';
  } else {
    period = 'night';
  }

  // Calculate sun elevation angle: sunrise at ~06:00, peak at 13:00, sunset at ~19:30
  // Sun elevation in radians: positive above horizon, negative below
  const solarAngle = ((h - 6) / 13.5) * Math.PI; // 0 at 06:00, pi at 19:30
  const elevation = Math.sin(solarAngle);
  const azimuth = ((h - 6) / 12) * Math.PI - Math.PI / 2;

  const sunDist = 300;
  const sunX = Math.cos(azimuth) * sunDist;
  const sunY = Math.max(-50, elevation * 190);
  const sunZ = Math.sin(azimuth) * sunDist * 0.75 + 30;
  const sunPosition: Vec3 = [sunX, sunY, sunZ];

  const isNight = h < 5.5 || h > 20.2;
  const streetLampsActive = h < 6.2 || h > 19.5;

  // Window light factor: peaks at evening/night (18:30 to 23:00)
  let windowNightLightFactor = 0;
  if (h >= 18 || h < 6) {
    if (h >= 18 && h <= 23) {
      windowNightLightFactor = Math.min(1.0, (h - 18) / 1.5);
    } else if (h > 23 || h < 5) {
      windowNightLightFactor = 0.85;
    } else if (h >= 5 && h < 6) {
      windowNightLightFactor = Math.max(0, 1.0 - (h - 5));
    }
  }

  // Smooth color and intensity interpolation
  let sunColor = '#fffbeb';
  let sunIntensity = 1.8;
  let ambientColor = '#ffffff';
  let ambientIntensity = 0.52;
  let hemisphereSkyColor = '#bae6fd';
  let hemisphereGroundColor = '#cbd5e1';
  let hemisphereIntensity = 0.48;
  let fogColor = '#e2e8f0';
  let fogNear = 380;
  let fogFar = 1650;
  let backgroundColor = '#dbeafe';
  let exposure = 1.05;
  let skyTurbidity = 2.4;
  let skyRayleigh = 1.2;

  if (period === 'morning') {
    // 6:00 to 11:00
    const t = (h - 6) / 5;
    sunColor = lerpColor('#fde68a', '#fffbeb', t);
    sunIntensity = THREE.MathUtils.lerp(1.2, 1.85, t);
    ambientColor = lerpColor('#fef3c7', '#ffffff', t);
    ambientIntensity = THREE.MathUtils.lerp(0.38, 0.52, t);
    hemisphereSkyColor = lerpColor('#93c5fd', '#bae6fd', t);
    hemisphereGroundColor = lerpColor('#64748b', '#cbd5e1', t);
    hemisphereIntensity = THREE.MathUtils.lerp(0.38, 0.48, t);
    fogColor = lerpColor('#e0f2fe', '#e2e8f0', t);
    fogNear = THREE.MathUtils.lerp(260, 380, t);
    fogFar = THREE.MathUtils.lerp(1200, 1650, t);
    backgroundColor = lerpColor('#e0f2fe', '#dbeafe', t);
    exposure = THREE.MathUtils.lerp(0.98, 1.05, t);
    skyTurbidity = THREE.MathUtils.lerp(3.5, 2.2, t);
    skyRayleigh = THREE.MathUtils.lerp(1.8, 1.15, t);
  } else if (period === 'day') {
    // 11:00 to 17:00
    sunColor = '#fffbeb';
    sunIntensity = 1.9;
    ambientColor = '#ffffff';
    ambientIntensity = 0.55;
    hemisphereSkyColor = '#bae6fd';
    hemisphereGroundColor = '#cbd5e1';
    hemisphereIntensity = 0.5;
    fogColor = '#e2e8f0';
    fogNear = 380;
    fogFar = 1650;
    backgroundColor = '#dbeafe';
    exposure = 1.05;
    skyTurbidity = 2.2;
    skyRayleigh = 1.15;
  } else if (period === 'sunset') {
    // 17:00 to 20:00
    const t = (h - 17) / 3;
    sunColor = lerpColor('#fb923c', '#ea580c', t);
    sunIntensity = THREE.MathUtils.lerp(1.7, 0.8, t);
    ambientColor = lerpColor('#ffedd5', '#fed7aa', t);
    ambientIntensity = THREE.MathUtils.lerp(0.48, 0.32, t);
    hemisphereSkyColor = lerpColor('#fb923c', '#7c3aed', t);
    hemisphereGroundColor = lerpColor('#475569', '#1e293b', t);
    hemisphereIntensity = THREE.MathUtils.lerp(0.46, 0.35, t);
    fogColor = lerpColor('#fdba74', '#475569', t);
    fogNear = THREE.MathUtils.lerp(320, 200, t);
    fogFar = THREE.MathUtils.lerp(1400, 950, t);
    backgroundColor = lerpColor('#fed7aa', '#1e1b4b', t);
    exposure = THREE.MathUtils.lerp(1.02, 0.94, t);
    skyTurbidity = THREE.MathUtils.lerp(6.0, 9.5, t);
    skyRayleigh = THREE.MathUtils.lerp(2.5, 3.5, t);
  } else {
    // Night: 20:00 to 6:00
    sunColor = '#60a5fa';
    sunIntensity = 0.28;
    ambientColor = '#93c5fd';
    ambientIntensity = 0.22;
    hemisphereSkyColor = '#1e3a8a';
    hemisphereGroundColor = '#0f172a';
    hemisphereIntensity = 0.26;
    fogColor = '#0f172a';
    fogNear = 160;
    fogFar = 850;
    backgroundColor = '#0b0f19';
    exposure = 0.88;
    skyTurbidity = 10.0;
    skyRayleigh = 0.35;
  }

  return {
    timeHours: h,
    period,
    sunPosition,
    sunColor,
    sunIntensity,
    ambientColor,
    ambientIntensity,
    hemisphereSkyColor,
    hemisphereGroundColor,
    hemisphereIntensity,
    fogColor,
    fogNear,
    fogFar,
    backgroundColor,
    exposure,
    skyTurbidity,
    skyRayleigh,
    isNight,
    streetLampsActive,
    windowNightLightFactor,
  };
}

function lerpColor(c1: string, c2: string, alpha: number): string {
  const col1 = new THREE.Color(c1);
  const col2 = new THREE.Color(c2);
  col1.lerp(col2, THREE.MathUtils.clamp(alpha, 0, 1));
  return '#' + col1.getHexString();
}
