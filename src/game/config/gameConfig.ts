import type { BuildingGeometry, CampusGeometry, Vec3 } from '../../domain/geometry/types';

export type TimeOfDayPresetId = 'day' | 'sunset' | 'night';

export type TimeOfDayPreset = {
  id: TimeOfDayPresetId;
  label: string;
  backgroundColor: string;
  fogColor: string;
  ambientColor: string;
  ambientIntensity: number;
  hemisphereSkyColor: string;
  hemisphereGroundColor: string;
  hemisphereIntensity: number;
  sunPosition: Vec3;
  sunColor: string;
  sunIntensity: number;
  fillLightIntensity: number;
  skyTurbidity: number;
  skyRayleigh: number;
  enableNightLights: boolean;
};

export const TIME_OF_DAY_PRESETS: Record<TimeOfDayPresetId, TimeOfDayPreset> = {
  day: {
    id: 'day',
    label: '☀️ Day',
    backgroundColor: '#dbeafe',
    fogColor: '#e2e8f0',
    ambientColor: '#ffffff',
    ambientIntensity: 0.55,
    hemisphereSkyColor: '#bae6fd',
    hemisphereGroundColor: '#cbd5e1',
    hemisphereIntensity: 0.5,
    sunPosition: [120, 160, 100],
    sunColor: '#fffbeb',
    sunIntensity: 1.65,
    fillLightIntensity: 0.35,
    skyTurbidity: 2.5,
    skyRayleigh: 1.2,
    enableNightLights: false,
  },
  sunset: {
    id: 'sunset',
    label: '🌅 Sunset',
    backgroundColor: '#fed7aa',
    fogColor: '#fdba74',
    ambientColor: '#ffedd5',
    ambientIntensity: 0.42,
    hemisphereSkyColor: '#fb923c',
    hemisphereGroundColor: '#475569',
    hemisphereIntensity: 0.48,
    sunPosition: [-180, 24, 65],
    sunColor: '#f97316',
    sunIntensity: 1.5,
    fillLightIntensity: 0.25,
    skyTurbidity: 9.0,
    skyRayleigh: 3.4,
    enableNightLights: true,
  },
  night: {
    id: 'night',
    label: '🌙 Evening',
    backgroundColor: '#0f172a',
    fogColor: '#0f172a',
    ambientColor: '#93c5fd',
    ambientIntensity: 0.28,
    hemisphereSkyColor: '#1e3a8a',
    hemisphereGroundColor: '#0f172a',
    hemisphereIntensity: 0.35,
    sunPosition: [-80, -25, -120],
    sunColor: '#60a5fa',
    sunIntensity: 0.35,
    fillLightIntensity: 0.22,
    skyTurbidity: 10.0,
    skyRayleigh: 0.4,
    enableNightLights: true,
  },
};

export type TeleportDestination = {
  id: string;
  label: string;
  position: Vec3;
  yaw: number;
  enterBuildingId?: string;
};

export const TELEPORT_LOCATIONS: TeleportDestination[] = [
  {
    id: 'entrance',
    label: '🏛️ Main Entrance & "I ♥ AJOU"',
    position: [85, 2.2, 15.9],
    yaw: Math.PI / 2,
  },
  {
    id: 'f101-library',
    label: '📚 F-101 Campus Library (Block F)',
    position: [89.6, 2.2, -53.1],
    yaw: -Math.PI / 2,
    enterBuildingId: 'bld-d',
  },
  {
    id: 'fountain-bridge',
    label: '⛲ Grand Fountain Bridge',
    position: [10.375, 2.2, 34.5],
    yaw: 0,
  },
  {
    id: 'amph-hall',
    label: '🏛️ Amphitheater Hall & Grand Screen',
    position: [50.5, 2.2, 82.0],
    yaw: 0,
  },
  {
    id: 'bld-i',
    label: '🏢 Block C (Conference & Classrooms)',
    position: [96.0, 2.2, 103.2],
    yaw: Math.PI / 2,
  },
  {
    id: 'bld-g',
    label: '🏢 Block B (Academic Building No. 2)',
    position: [69.0, 2.2, 45.0],
    yaw: Math.PI,
  },
  {
    id: 'bld-h',
    label: '🏢 Block A (Main Academic Building)',
    position: [20.5, 2.2, 74.0],
    yaw: Math.PI,
  },
  {
    id: 'bld-a',
    label: '🏢 North Building (Block N)',
    position: [4.0, 2.2, -90.0],
    yaw: 0,
  },
  {
    id: 'bld-j',
    label: '🏠 Dormitory Courtyard',
    position: [-48.5, 2.2, 106.0],
    yaw: Math.PI,
  },
];

export const gameConfig = {
  player: {
    /**
     * Spawn on the main eastern promenade inside the entrance gate,
     * just west of the "I ♥ AJOU" art object, facing west (-X) toward the fountain and campus center.
     */
    spawnPosition: [85, 2.2, 15.9] as Vec3,
    /** Initial yaw in radians (+PI/2 rotates camera -Z forward to point toward -X). */
    spawnYaw: Math.PI / 2,
    spawnPitch: 0,

    /** Capsule collider dimensions (total height = 2 * capsuleHalfHeight + 2 * capsuleRadius = 1.8m). */
    capsuleHalfHeight: 0.55,
    capsuleRadius: 0.35,
    /** Camera offset above rigid body center (0.9m center + 0.72m = 1.62m eye height). */
    eyeOffset: 0.72,

    walkSpeed: 7.0,
    sprintSpeed: 13.0,
    velocityLerpSpeed: 12.0,
    jumpVelocity: 6.4,
    jumpCooldownMs: 260,

    headBobFrequency: 9.5,
    headBobAmplitude: 0.045,

    /** Distance from a building footprint (in meters) at which the proximity card appears. */
    buildingProximityDistance: 14.0,

    /** Respawn threshold if the player ever falls below the terrain. */
    minYRespawn: -15,
  },

  physics: {
    gravity: [0, -16, 0] as Vec3,
  },

  camera: {
    fov: 65,
    sprintFov: 73,
    fovLerpSpeed: 8.0,
    near: 0.15,
    far: 2000,
    mouseSensitivity: 0.0022,
    touchLookSensitivity: 0.0045,
    maxPitch: Math.PI / 2 - 0.08,
  },

  mobile: {
    joystickRadiusPx: 52,
  },
} as const;

export type PlayerTransformState = {
  x: number;
  y: number;
  z: number;
  yaw: number;
};

/**
 * Computes the shortest horizontal distance (in meters) from (px, pz) to a building's footprints.
 */
export function distanceToBuildingFootprint(
  px: number,
  pz: number,
  bld: BuildingGeometry,
): number {
  let minDist = Infinity;
  for (const part of bld.parts) {
    if (part.type === 'rect') {
      const hw = part.size[0] / 2;
      const hd = part.size[1] / 2;
      const dx = Math.max(0, Math.abs(px - part.center[0]) - hw);
      const dz = Math.max(0, Math.abs(pz - part.center[1]) - hd);
      const d = Math.hypot(dx, dz);
      if (d < minDist) minDist = d;
    } else if (part.points.length > 0) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const [x, z] of part.points) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      const dx = Math.max(0, px < minX ? minX - px : px > maxX ? px - maxX : 0);
      const dz = Math.max(0, pz < minZ ? minZ - pz : pz > maxZ ? pz - maxZ : 0);
      const d = Math.hypot(dx, dz);
      if (d < minDist) minDist = d;
    }
  }
  return minDist;
}

/**
 * Finds the nearest building within `maxDistance` meters of (px, pz), or null if none.
 */
export function findNearestBuildingInRange(
  px: number,
  pz: number,
  geometry: CampusGeometry,
  maxDistance: number = gameConfig.player.buildingProximityDistance,
): { buildingId: string; distance: number } | null {
  let bestId: string | null = null;
  let bestDist = maxDistance;
  for (const bld of Object.values(geometry.buildings)) {
    const d = distanceToBuildingFootprint(px, pz, bld);
    if (d <= bestDist) {
      bestDist = d;
      bestId = bld.buildingId;
    }
  }
  return bestId ? { buildingId: bestId, distance: bestDist } : null;
}

export function isGameRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.pathname === '/game' ||
    window.location.pathname.startsWith('/game/') ||
    window.location.hash === '#/game' ||
    window.location.hash.startsWith('#/game')
  );
}

export function navigateToGame(): void {
  if (typeof window === 'undefined') return;
  window.location.hash = '#/game';
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function navigateToMap(): void {
  if (typeof window === 'undefined') return;
  if (document.pointerLockElement) {
    document.exitPointerLock?.();
  }
  if (window.location.pathname.startsWith('/game')) {
    window.history.pushState({}, '', '/');
  }
  if (window.location.hash) {
    window.location.hash = '';
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
