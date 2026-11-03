import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mapConfig } from '../../config/mapConfig';
import type { CampusGeometry, ContextFeatureKind, Footprint } from '../../domain/geometry/types';
import {
  StaticGeometryBatcher,
  disposeMergedMap,
  NO_RAYCAST,
} from './geometry/staticGeometryMerger';
import { EXTRUDE_ROTATION, footprintOutline, outlineToShape } from './geometryUtils';
import { getFenceTexture } from './facades/facadeTextures';
import { MainEntranceGate, MAIN_ENTRANCE_WIDTH } from './MainEntranceGate';
import { CampusFountain } from './CampusFountain';
import { AjouArtObject } from './AjouArtObject';
import { SolarCanopies } from './SolarCanopies';
import { CampusWalkways } from './CampusWalkways';
import { SportsFacilities } from './SportsFacilities';
import { SiteFurniture } from './SiteFurniture';
import {
  getAsphaltRoadTextures,
  getLushGrassTextures,
  getPromenadePavingTextures,
} from './materials/pbrMaterials';

const flatLayerElevation: Record<ContextFeatureKind, number> = {
  road: 0.015,
  lawn: 0.025,
  track: 0.07,
  pitch: 0.08,
  court: 0.08,
  structure: 0,
};

const contextColors: Record<ContextFeatureKind, string> = {
  lawn: '#6ee7b7',
  road: '#334155',
  track: '#ef4444',
  pitch: '#22c55e',
  court: '#0284c7',
  structure: '#94a3b8',
};

function PerimeterFenceAndGate({ geometry }: { geometry: CampusGeometry }) {
  const { min, max } = geometry.bounds;

  const gateZ = useMemo(() => {
    const kppFeature = geometry.context.find((f) => f.id === 'kpp-e');
    if (kppFeature) {
      if (kppFeature.footprint.type === 'rect') {
        return kppFeature.footprint.center[1];
      }
      if (kppFeature.footprint.type === 'polygon' && kppFeature.footprint.points.length > 0) {
        const sumZ = kppFeature.footprint.points.reduce((acc, p) => acc + p[1], 0);
        return sumZ / kppFeature.footprint.points.length;
      }
    }
    const bldB = geometry.buildings['bld-g'];
    const bldF = geometry.buildings['bld-d'];
    if (bldB && bldF) {
      return (bldB.center[2] + bldF.center[2]) / 2;
    }
    return (min[1] + max[1]) / 2;
  }, [geometry, min, max]);

  const gateWidth = MAIN_ENTRANCE_WIDTH;
  const plinthHeight = 0.2;
  const metalHeight = 1.8;

  const fenceTexture = useMemo(() => {
    const tex = getFenceTexture();
    if (tex) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.repeat.set(1, 1);
    }
    return tex;
  }, []);

  const materials = useMemo(() => {
    const plinthMat = new THREE.MeshStandardMaterial({
      color: '#8C8982',
      roughness: 0.9,
    });
    const fenceMetalMat = new THREE.MeshStandardMaterial({
      color: fenceTexture ? '#ffffff' : '#475569',
      map: fenceTexture ?? null,
      transparent: true,
      alphaTest: 0.35,
      roughness: 0.5,
      metalness: 0.4,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    const asphaltMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.9,
    });
    const sidewalkMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      roughness: 0.9,
    });
    const curbMat = new THREE.MeshStandardMaterial({
      color: '#94a3b8',
      roughness: 0.85,
    });
    const vergeMat = new THREE.MeshStandardMaterial({
      color: '#4a7c3a',
      roughness: 0.9,
    });
    const whiteStripeMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
    });
    const boothWallMat = new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      roughness: 0.8,
    });
    const boothRoofMat = new THREE.MeshStandardMaterial({
      color: '#78350f',
      roughness: 0.6,
    });
    const orangeMat = new THREE.MeshStandardMaterial({
      color: '#ea580c',
    });
    const drivewayMat = new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.85,
    });
    return {
      plinthMat,
      fenceMetalMat,
      asphaltMat,
      sidewalkMat,
      curbMat,
      vergeMat,
      whiteStripeMat,
      boothWallMat,
      boothRoofMat,
      orangeMat,
      drivewayMat,
    };
  }, [fenceTexture]);

  const left = -104.5;
  const top = -152.0;
  const rightGate = 104.0;
  const artZ = gateZ;
  const artX = 78.5;

  const merged = useMemo(() => {
    const b = new StaticGeometryBatcher();

    const addFenceSeg = (
      len: number,
      pos: [number, number, number],
      rotY: number,
      axis?: 'x' | 'z',
    ) => {
      const repeatCount = Math.max(1, len / 3.0);
      const plinthW = axis === 'z' ? 0.35 : len;
      const plinthD = axis === 'z' ? len : 0.35;
      b.addBox('plinth', [plinthW, plinthHeight, plinthD], [pos[0], pos[1] + plinthHeight / 2, pos[2]], [0, rotY, 0]);
      const planeRotY = rotY + (axis === 'z' ? Math.PI / 2 : 0);
      b.addPlane(
        'fenceMetal',
        [len, metalHeight],
        [pos[0], pos[1] + plinthHeight + metalHeight / 2, pos[2]],
        [0, planeRotY, 0],
        [repeatCount, 1],
      );
    };

    const addDirectedFence = (from: [number, number], to: [number, number]) => {
      const dx = to[0] - from[0];
      const dz = to[1] - from[1];
      const len = Math.hypot(dx, dz);
      const angle = Math.atan2(dx, dz);
      const cx = (from[0] + to[0]) / 2;
      const cz = (from[1] + to[1]) / 2;
      addFenceSeg(len, [cx, 0, cz], angle - Math.PI / 2);
    };

    // Fences
    addFenceSeg(rightGate - left, [(left + rightGate) / 2, 0, top], 0, 'x');
    addDirectedFence([left, top], [left, 204.3]);
    addDirectedFence([-53.0, 194.8], [left, 204.3]);
    addDirectedFence([rightGate, 160.0], [-47.0, 193.5]);
    addDirectedFence([-50.0, 153.0], [-50.0, 192.0]);
    addFenceSeg(Math.max(1, gateZ - gateWidth / 2 - top), [rightGate, 0, (top + gateZ - gateWidth / 2) / 2], 0, 'z');
    addFenceSeg(Math.max(1, 160.0 - (gateZ + gateWidth / 2)), [rightGate, 0, (gateZ + gateWidth / 2 + 160.0) / 2], 0, 'z');

    // South-West 2-lane diagonal road (origin [1.5, 0.02, 189.9], rotY = 0.2186)
    const diagAngle = 0.2186;
    const cosD = Math.cos(diagAngle);
    const sinD = Math.sin(diagAngle);
    const toDiagWorld = (lx: number, ly: number, lz: number): [number, number, number] => [
      1.5 + lx * cosD + lz * sinD,
      0.02 + ly,
      189.9 - lx * sinD + lz * cosD,
    ];
    b.addBox('asphalt', [240.0, 0.02, 9.0], toDiagWorld(0, 0, 0), [0, diagAngle, 0]);
    b.addBox('sidewalk', [240.0, 0.025, 2.5], toDiagWorld(0, 0.02, -5.75), [0, diagAngle, 0]);
    b.addBox('curb', [240.0, 0.05, 0.2], toDiagWorld(0, 0.035, -4.45), [0, diagAngle, 0]);
    b.addBox('sidewalk', [240.0, 0.025, 2.2], toDiagWorld(0, 0.02, 5.6), [0, diagAngle, 0]);
    b.addBox('curb', [240.0, 0.05, 0.2], toDiagWorld(0, 0.035, 4.45), [0, diagAngle, 0]);

    for (let rIdx = 0; rIdx < 34; rIdx++) {
      const rx = -112.0 + rIdx * 6.8;
      b.addBox('whiteStripe', [3.4, 0.002, 0.15], toDiagWorld(rx, 0.012, 0), [0, diagAngle, 0]);
    }
    for (const zebraX of [90.0, -50.0]) {
      for (let zIdx = 0; zIdx < 9; zIdx++) {
        b.addBox('whiteStripe', [0.5, 0.003, 8.0], toDiagWorld(zebraX - 3.6 + zIdx * 0.9, 0.015, 0), [0, diagAngle, 0]);
      }
    }

    // South-West Gate Checkpoint (origin [-50.0, 0, 194.2], rotY = 0.2186)
    const toSwWorld = (lx: number, ly: number, lz: number): [number, number, number] => [
      -50.0 + lx * cosD + lz * sinD,
      ly,
      194.2 - lx * sinD + lz * cosD,
    ];
    for (const bx of [3.2, -3.2]) {
      b.addBox('boothWall', [2.5, 2.8, 2.5], toSwWorld(bx, 1.4, -1.2), [0, diagAngle, 0]);
      b.addBox('boothRoof', [2.9, 0.25, 2.9], toSwWorld(bx, 2.9, -1.2), [0, diagAngle, 0]);
    }
    b.addCylinder('orange', [0.08, 0.1, 0.9, 8], toSwWorld(1.6, 0.5, -0.6), [0, diagAngle, 0]);
    b.addBox('whiteStripe', [4.6, 0.08, 0.08], toSwWorld(-0.8, 0.85, -0.6), [0, diagAngle, 0]);

    // Main Entrance driveway threshold
    b.addBox('driveway', [5.0, 0.02, 12.0], [101.5, 0.03, gateZ]);

    // East 4-Lane Major Avenue
    const roadZCenter = (top + 160.0) / 2;
    const roadLength = 160.0 - top + 4.0;
    const asphaltWidth = 18.0;
    const asphaltX = 115.7;
    const stripeCount = Math.floor(roadLength / 6.8);

    b.addBox('asphalt', [asphaltWidth, 0.02, roadLength], [asphaltX, 0.02, roadZCenter]);
    b.addBox('sidewalk', [2.4, 0.025, roadLength], [105.3, 0.02, roadZCenter]);
    b.addBox('curb', [0.2, 0.05, roadLength], [106.6, 0.035, roadZCenter]);
    b.addBox('sidewalk', [3.0, 0.025, roadLength], [126.4, 0.02, roadZCenter]);
    b.addBox('curb', [0.2, 0.05, roadLength], [124.8, 0.035, roadZCenter]);
    b.addBox('verge', [3.2, 0.022, roadLength], [129.5, 0.02, roadZCenter]);

    b.addBox('whiteStripe', [0.12, 0.002, roadLength], [asphaltX - 0.12, 0.032, roadZCenter]);
    b.addBox('whiteStripe', [0.12, 0.002, roadLength], [asphaltX + 0.12, 0.032, roadZCenter]);

    for (let rIdx = 0; rIdx < stripeCount; rIdx++) {
      const rz = top + 2.0 + rIdx * 6.8;
      b.addBox('whiteStripe', [0.15, 0.002, 3.4], [asphaltX - 4.5, 0.032, rz]);
      b.addBox('whiteStripe', [0.15, 0.002, 3.4], [asphaltX + 4.5, 0.032, rz]);
    }

    b.addBox('whiteStripe', [0.15, 0.002, roadLength], [asphaltX - 8.65, 0.032, roadZCenter]);
    b.addBox('whiteStripe', [0.15, 0.002, roadLength], [asphaltX + 8.65, 0.032, roadZCenter]);

    for (const zebraZ of [gateZ, -135.0, 154.0]) {
      for (let zIdx = 0; zIdx < 9; zIdx++) {
        b.addBox('whiteStripe', [17.2, 0.003, 0.5], [asphaltX, 0.035, zebraZ - 3.6 + zIdx * 0.9]);
      }
    }

    return b.buildAll();
  }, [gateZ, gateWidth, left, top, rightGate, plinthHeight, metalHeight]);

  useEffect(() => () => disposeMergedMap(merged), [merged]);

  return (
    <group>
      {merged.plinth && <mesh geometry={merged.plinth} material={materials.plinthMat} castShadow receiveShadow raycast={NO_RAYCAST} />}
      {merged.fenceMetal && <mesh geometry={merged.fenceMetal} material={materials.fenceMetalMat} castShadow raycast={NO_RAYCAST} />}
      {merged.asphalt && <mesh geometry={merged.asphalt} material={materials.asphaltMat} receiveShadow raycast={NO_RAYCAST} />}
      {merged.sidewalk && <mesh geometry={merged.sidewalk} material={materials.sidewalkMat} receiveShadow raycast={NO_RAYCAST} />}
      {merged.curb && <mesh geometry={merged.curb} material={materials.curbMat} receiveShadow raycast={NO_RAYCAST} />}
      {merged.verge && <mesh geometry={merged.verge} material={materials.vergeMat} receiveShadow raycast={NO_RAYCAST} />}
      {merged.whiteStripe && <mesh geometry={merged.whiteStripe} material={materials.whiteStripeMat} raycast={NO_RAYCAST} />}
      {merged.boothWall && <mesh geometry={merged.boothWall} material={materials.boothWallMat} castShadow receiveShadow raycast={NO_RAYCAST} />}
      {merged.boothRoof && <mesh geometry={merged.boothRoof} material={materials.boothRoofMat} castShadow raycast={NO_RAYCAST} />}
      {merged.orange && <mesh geometry={merged.orange} material={materials.orangeMat} raycast={NO_RAYCAST} />}
      {merged.driveway && <mesh geometry={merged.driveway} material={materials.drivewayMat} receiveShadow raycast={NO_RAYCAST} />}

      {/* Main Campus Entrance & Checkpoint Ensemble */}
      <MainEntranceGate
        position={[rightGate, 0, gateZ]}
        rotation={[0, Math.PI / 2, 0]}
      />

      {/* Landmark Art-Object "I ♥ AJOU" */}
      <AjouArtObject
        position={[artX, 0, artZ]}
        rotation={[0, Math.PI / 2, 0]}
      />
    </group>
  );
}

type ContextTuning = {
  groundColor?: string;
  lawnColor?: string;
  roadColor?: string;
  trackColor?: string;
  pitchColor?: string;
  courtColor?: string;
  pbrTexturesEnabled?: boolean;
};

/**
 * Ground terrain base, perimeter enclosures, and landscape surfaces (roads, turf, courts, paths).
 */
export function ContextLayer({ geometry, tuning }: { geometry: CampusGeometry; tuning?: ContextTuning }) {
  const { min, max } = geometry.bounds;
  const minX = Math.min(-105.0, min[0]);
  const maxX = Math.max(120.0, max[0]);
  const minZ = Math.min(-153.5, min[1]);
  const maxZ = Math.max(208.0, max[1]);
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const usePbr = tuning?.pbrTexturesEnabled !== false;

  const pavingPbr = useMemo(() => (usePbr ? getPromenadePavingTextures() : null), [usePbr]);
  const asphaltPbr = useMemo(() => (usePbr ? getAsphaltRoadTextures() : null), [usePbr]);
  const grassPbr = useMemo(() => (usePbr ? getLushGrassTextures() : null), [usePbr]);

  const groundCenter: [number, number, number] = [
    (minX + maxX) / 2,
    -0.05,
    (minZ + maxZ) / 2,
  ];

  const lawnColor = tuning?.lawnColor ?? contextColors.lawn ?? mapConfig.colors.context.lawn;
  const roadColor = tuning?.roadColor ?? contextColors.road ?? mapConfig.colors.context.road;

  const contextMaterials = useMemo(() => {
    const groundMat = new THREE.MeshStandardMaterial({
      color: tuning?.groundColor ?? '#d8d4cc',
      map: pavingPbr?.map ?? null,
      normalMap: pavingPbr?.normalMap ?? null,
      normalScale: new THREE.Vector2(0.08, 0.08),
      roughnessMap: pavingPbr?.roughnessMap ?? null,
      roughness: 0.88,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: 3,
      polygonOffsetUnits: 3,
    });
    const lawnMat = new THREE.MeshStandardMaterial({
      color: lawnColor,
      map: grassPbr?.map ?? null,
      normalMap: grassPbr?.normalMap ?? null,
      normalScale: new THREE.Vector2(0.12, 0.12),
      roughnessMap: grassPbr?.roughnessMap ?? null,
      roughness: 0.9,
      metalness: 0.02,
    });
    const roadMat = new THREE.MeshStandardMaterial({
      color: roadColor,
      map: asphaltPbr?.map ?? null,
      normalMap: asphaltPbr?.normalMap ?? null,
      normalScale: new THREE.Vector2(0.15, 0.15),
      roughnessMap: asphaltPbr?.roughnessMap ?? null,
      roughness: 0.84,
      metalness: 0.06,
    });
    const plazaMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      map: pavingPbr?.map ?? null,
      normalMap: pavingPbr?.normalMap ?? null,
      normalScale: new THREE.Vector2(0.12, 0.12),
      roughnessMap: pavingPbr?.roughnessMap ?? null,
      roughness: 0.82,
      metalness: 0.05,
    });
    const structureMat = new THREE.MeshStandardMaterial({
      color: '#94a3b8',
      roughness: 0.85,
      metalness: 0.04,
    });
    return { groundMat, lawnMat, roadMat, plazaMat, structureMat };
  }, [tuning?.groundColor, lawnColor, roadColor, pavingPbr, grassPbr, asphaltPbr]);

  const mergedContext = useMemo(() => {
    const b = new StaticGeometryBatcher();

    const addFootprint = (bucket: string, fp: Footprint, bottom: number, height: number) => {
      const outline = footprintOutline(fp);
      if (outline.length < 3) return;
      const geom = new THREE.ExtrudeGeometry(outlineToShape(outline), { depth: height, bevelEnabled: false });
      b.addGeometry(bucket, geom, [0, bottom, 0], EXTRUDE_ROTATION);
      geom.dispose();
    };

    // South Park Diagonal Lawn
    addFootprint(
      'lawn',
      {
        type: 'polygon',
        points: [
          [-48.0, 147.0],
          [-48.0, 192.9],
          [54.0, 170.3],
          [54.0, 147.0],
        ],
      },
      0.025,
      0.02,
    );

    // South-East Pedestrian Plaza
    addFootprint(
      'plaza',
      {
        type: 'polygon',
        points: [
          [54.0, 145.5],
          [54.0, 170.2],
          [103.5, 159.5],
          [103.5, 145.5],
        ],
      },
      0.035,
      0.016,
    );

    for (const f of geometry.context) {
      if (f.id === 'kpp-e' || f.id === 'kpp-sw') continue;
      if (f.id === 'court' || f.id === 'court-tennis' || f.id === 'pitch' || f.id === 'track' || f.id === 'lawn-n') continue;
      if (f.id.startsWith('solar-canopy-') || f.id === 'solar-canopy-1' || f.id === 'solar-canopy-2') continue;
      if (f.id.startsWith('dorm-garage-') || f.id.startsWith('dorm-shed-') || f.id.startsWith('dorm-booth-')) continue;
      if (f.id === 'road-east' || f.id === 'road-entrance-main') continue;
      if (f.id === 'out-plaza-mvijfubr') continue;
      if (f.id.startsWith('kpp-')) continue;

      if (f.kind === 'structure') {
        addFootprint('structure', f.footprint, 0, f.height ?? mapConfig.building.unknownStructureHeight);
        continue;
      }

      const isLawn = f.kind === 'lawn';
      const isRoad = f.kind === 'road';
      const bucket = isLawn ? 'lawn' : isRoad ? 'road' : 'plaza';
      addFootprint(
        bucket,
        f.footprint,
        flatLayerElevation[f.kind] ?? 0.02,
        isLawn ? 0.02 : isRoad ? 0.025 : 0.02,
      );
    }

    return b.buildAll();
  }, [geometry.context]);

  useEffect(() => () => disposeMergedMap(mergedContext), [mergedContext]);

  return (
    <group>
      {/* Base ground terrain */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={groundCenter}
        material={contextMaterials.groundMat}
        receiveShadow
        raycast={NO_RAYCAST}
      >
        <planeGeometry args={[width, depth]} />
      </mesh>

      {/* Perimeter fence, Main Entrance checkpoint, internal road, Art-object */}
      <PerimeterFenceAndGate geometry={geometry} />

      {/* Photovoltaic Solar Canopies & Dormitory Parking Ensemble */}
      <SolarCanopies />

      {/* Pedestrian Walkways, Stone Plazas, Curbs, and Zebra Crossings */}
      <CampusWalkways />

      {/* Real-World Sports Facilities */}
      <SportsFacilities />

      {/* Grand Campus Fountain */}
      <CampusFountain scale={1.0} position={[5.5, 0, -23.1]} />

      {/* Campus Outdoor Infrastructure & Site Furniture */}
      <SiteFurniture />

      {/* Batched context landscape layers (lawns, roads, plazas, structures) */}
      {mergedContext.lawn && (
        <mesh geometry={mergedContext.lawn} material={contextMaterials.lawnMat} receiveShadow raycast={NO_RAYCAST} />
      )}
      {mergedContext.road && (
        <mesh geometry={mergedContext.road} material={contextMaterials.roadMat} receiveShadow raycast={NO_RAYCAST} />
      )}
      {mergedContext.plaza && (
        <mesh geometry={mergedContext.plaza} material={contextMaterials.plazaMat} receiveShadow raycast={NO_RAYCAST} />
      )}
      {mergedContext.structure && (
        <mesh geometry={mergedContext.structure} material={contextMaterials.structureMat} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
    </group>
  );
}
