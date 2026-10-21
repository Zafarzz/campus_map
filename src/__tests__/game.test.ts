import { describe, expect, it } from 'vitest';
import { computeShrubPlacements } from '../components/3d/Vegetation';
import {
  computeCampusBenchesAndBins,
  computeCampusStreetLamps,
  computeCampusTotems,
} from '../components/3d/environment/CampusEnvironmentDetail';
import {
  getArchitecturalWallTextures,
  getAsphaltRoadTextures,
  getLushGrassTextures,
  getPromenadePavingTextures,
} from '../components/3d/materials/pbrMaterials';
import { demoCampus } from '../data/demo-campus';
import {
  CampusAudioEngine,
  detectFootstepSurface,
} from '../game/audio/campusAudioEngine';
import {
  GRAPHICS_QUALITY_PRESETS,
  TELEPORT_LOCATIONS,
  TIME_OF_DAY_PRESETS,
  findNearestBuildingInRange,
  gameConfig,
} from '../game/config/gameConfig';
import { createInitialInputState, resetInputState } from '../game/controls/DesktopControls';
import {
  buildCampusColliderSpecs,
  buildTreeColliderSpecs,
} from '../game/world/CampusColliders';
import { geometryProvider } from '../services/geometry';

describe('First-Person Game Prototype & Immersive 3D Enhancements', () => {
  const geometry = geometryProvider.build(demoCampus);
  const colliders = buildCampusColliderSpecs(geometry);
  const treeColliders = buildTreeColliderSpecs(geometry);

  it('generates ground terrain collider with top surface at Y = 0', () => {
    const ground = colliders.find((c) => c.id === 'ground-terrain');
    expect(ground).toBeDefined();
    if (!ground) return;
    const topY = ground.position[1] + ground.halfExtents[1];
    expect(topY).toBeCloseTo(0, 5);
    expect(ground.halfExtents[0]).toBeGreaterThan(150);
    expect(ground.halfExtents[2]).toBeGreaterThan(150);
  });

  it('generates colliders for all campus buildings, connectors, fences, landmarks, and walkable fountain bridges', () => {
    for (const building of demoCampus.buildings) {
      const hasBuildingCollider = colliders.some((c) => c.id.startsWith(`bld-${building.id}-`));
      expect(hasBuildingCollider).toBe(true);
    }

    expect(colliders.some((c) => c.id === 'conn-conn-bld-g-bld-i')).toBe(true);
    expect(colliders.some((c) => c.id === 'conn-conn-bld-h-bld-i')).toBe(true);
    expect(colliders.some((c) => c.id === 'fence-north')).toBe(true);
    expect(colliders.some((c) => c.id === 'fence-south')).toBe(true);
    expect(colliders.some((c) => c.id === 'fence-west')).toBe(true);
    expect(colliders.some((c) => c.id === 'fence-east-top')).toBe(true);
    expect(colliders.some((c) => c.id === 'fence-east-bottom')).toBe(true);
    expect(colliders.some((c) => c.id === 'ajou-art-object')).toBe(true);

    // Fountain 3 water bays + 2 walkable bridge decks and north/south ramps
    expect(colliders.some((c) => c.id === 'campus-fountain-basin-west')).toBe(true);
    expect(colliders.some((c) => c.id === 'campus-fountain-basin')).toBe(true);
    expect(colliders.some((c) => c.id === 'campus-fountain-basin-east')).toBe(true);
    expect(colliders.some((c) => c.id === 'fountain-bridge-deck-0')).toBe(true);
    expect(colliders.some((c) => c.id === 'fountain-bridge-deck-1')).toBe(true);
    expect(colliders.some((c) => c.id === 'fountain-bridge-ramp-n-0')).toBe(true);
    expect(colliders.some((c) => c.id === 'fountain-bridge-ramp-s-0')).toBe(true);
  });

  it('generates deterministic tree trunk cylinder colliders and lawn shrubs outside building footprints', () => {
    expect(treeColliders.length).toBeGreaterThan(50);
    for (const tree of treeColliders) {
      expect(tree.radius).toBeGreaterThan(0.2);
      expect(tree.halfHeight).toBeGreaterThan(0.8);
    }

    const shrubs = computeShrubPlacements(geometry);
    expect(shrubs.length).toBeGreaterThan(40);
    for (const shrub of shrubs) {
      expect(shrub.scaleXZ).toBeGreaterThan(0.5);
      expect(shrub.scaleY).toBeGreaterThan(0.4);
    }
  });

  it('places spawn and all quick-teleport locations safely outside solid obstacle colliders', () => {
    const radius = gameConfig.player.capsuleRadius;
    const halfH = gameConfig.player.capsuleHalfHeight;

    for (const dest of TELEPORT_LOCATIONS) {
      const [sx, sy, sz] = dest.position;
      expect(sy - (halfH + radius)).toBeGreaterThan(0);

      const activeColliders = buildCampusColliderSpecs(geometry, dest.enterBuildingId);
      const solidObstacles = activeColliders.filter(
        (c) =>
          c.id !== 'ground-terrain' &&
          c.id !== 'lib-floor-slab' &&
          !c.id.startsWith('fountain-bridge-deck-') &&
          !c.id.startsWith('fountain-bridge-ramp-'),
      );

      for (const obs of solidObstacles) {
        const [ox, , oz] = obs.position;
        const [hx, , hz] = obs.halfExtents;
        const overlapsX = sx + radius > ox - hx && sx - radius < ox + hx;
        const overlapsZ = sz + radius > oz - hz && sz - radius < oz + hz;
        expect(
          overlapsX && overlapsZ,
          `Teleport "${dest.id}" overlaps collider "${obs.id}"`,
        ).toBe(false);
      }
    }
  });

  it('removes building exterior solid collider when entering a building and spawns F-101 Library interior colliders for Block F (bld-d)', () => {
    const withBlockCEntered = buildCampusColliderSpecs(geometry, 'bld-i');
    expect(withBlockCEntered.some((c) => c.id.startsWith('bld-bld-i-'))).toBe(false);
    expect(withBlockCEntered.some((c) => c.id.startsWith('bld-bld-g-'))).toBe(true);
    expect(withBlockCEntered.some((c) => c.id.startsWith('lib-'))).toBe(false);

    // Entering Block F (bld-d) replaces exterior shell with walkable F-101 Library interior colliders
    const withBlockFEntered = buildCampusColliderSpecs(geometry, 'bld-d');
    expect(withBlockFEntered.some((c) => c.id.startsWith('bld-bld-d-'))).toBe(false);
    expect(withBlockFEntered.some((c) => c.id === 'lib-floor-slab')).toBe(true);
    expect(withBlockFEntered.some((c) => c.id === 'lib-reception-desk')).toBe(true);
    expect(withBlockFEntered.filter((c) => c.id.startsWith('lib-bookcase-')).length).toBe(10);
    expect(withBlockFEntered.filter((c) => c.id.startsWith('lib-reading-table-')).length).toBe(8);
    expect(withBlockFEntered.some((c) => c.id === 'lib-digital-desk')).toBe(true);

    // Verify F-101 room metadata on Floor 1 of Block F (bld-d)
    const blockF = demoCampus.buildings.find((b) => b.id === 'bld-d');
    const f101 = blockF?.floors[0]?.rooms.find((r) => r.id === 'bld-d-f1-f101');
    expect(f101).toBeDefined();
    expect(f101?.number).toBe('F-101');
    expect(f101?.name?.toLowerCase()).toContain('library');
  });

  it('detects nearest building within proximity range accurately', () => {
    // Teleport point in front of Block C (bld-i is at X: 59.55..83.55, Z: 83.4..123.0)
    const nearBlockC = findNearestBuildingInRange(92.0, 103.2, geometry, 14.0);
    expect(nearBlockC?.buildingId).toBe('bld-i');

    // Far away at main entrance
    const atEntrance = findNearestBuildingInRange(85.0, 15.9, geometry, 14.0);
    expect(atEntrance).toBeNull();
  });

  it('defines valid time-of-day presets, graphics quality presets, and resets player input state cleanly', () => {
    expect(TIME_OF_DAY_PRESETS.morning.enableNightLights).toBe(false);
    expect(TIME_OF_DAY_PRESETS.day.enableNightLights).toBe(false);
    expect(TIME_OF_DAY_PRESETS.sunset.enableNightLights).toBe(true);
    expect(TIME_OF_DAY_PRESETS.night.enableNightLights).toBe(true);

    expect(GRAPHICS_QUALITY_PRESETS.high.enablePbrTextures).toBe(true);
    expect(GRAPHICS_QUALITY_PRESETS.high.enableContactShadows).toBe(true);
    expect(GRAPHICS_QUALITY_PRESETS.original.enablePbrTextures).toBe(false);
    expect(GRAPHICS_QUALITY_PRESETS.original.enableCampusProps).toBe(false);

    const input = createInitialInputState();
    input.moveForward = true;
    input.keySprint = true;
    input.touchForward = 0.85;
    input.lookDeltaX = -0.15;

    resetInputState(input);

    expect(input.moveForward).toBe(false);
    expect(input.keySprint).toBe(false);
    expect(input.touchForward).toBe(0);
    expect(input.lookDeltaX).toBe(0);
  });

  it('places campus street lamps, park benches, and wayfinding totems deterministically outside buildings and water basins', () => {
    const lamps = computeCampusStreetLamps(geometry);
    const benches = computeCampusBenchesAndBins(geometry);
    const totems = computeCampusTotems(geometry);

    expect(lamps.length).toBeGreaterThan(20);
    expect(benches.length).toBeGreaterThan(10);
    expect(totems.length).toBeGreaterThan(3);

    for (const lamp of lamps) {
      const inFountainBasin = lamp.x > -39 && lamp.x < 34 && lamp.z > 6.2 && lamp.z < 25.6;
      expect(inFountainBasin).toBe(false);
    }
  });

  it('detects footstep surfaces accurately across stone pavement, wooden fountain bridge, lawn grass, and indoor floors', () => {
    // Main entrance promenade pavement
    expect(detectFootstepSurface(85.0, 0.05, 15.9, geometry, false)).toBe('pavement');
    // Elevated wooden fountain bridge deck
    expect(detectFootstepSurface(-11.1, 0.65, 15.9, geometry, false)).toBe('wood');
    // Inside Block F Library
    expect(detectFootstepSurface(30.9, 0.15, -36.5, geometry, true)).toBe('indoor');

    // Audio engine mute & volume controls work safely in headless environment
    const audio = new CampusAudioEngine();
    expect(audio.isMuted()).toBe(false);
    audio.setMuted(true);
    expect(audio.isMuted()).toBe(true);
    audio.setVolume(0.4);
    expect(audio.getVolume()).toBeCloseTo(0.4, 5);
    audio.dispose();
  });

  it('generates procedural PBR texture sets safely in browser or headless environments', () => {
    const paving = getPromenadePavingTextures();
    const asphalt = getAsphaltRoadTextures();
    const grass = getLushGrassTextures();
    const wall = getArchitecturalWallTextures();

    // In headless Node/Vitest without canvas 2D context, returns null safely; in browser returns TextureSet
    if (paving) {
      expect(paving.map).toBeDefined();
      expect(paving.normalMap).toBeDefined();
      expect(paving.roughnessMap).toBeDefined();
    }
    expect(asphalt === null || Boolean(asphalt.normalMap)).toBe(true);
    expect(grass === null || Boolean(grass.normalMap)).toBe(true);
    expect(wall === null || Boolean(wall.normalMap)).toBe(true);
  });
});
