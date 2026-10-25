import { useMemo } from 'react';
import * as THREE from 'three';
import { mapConfig } from '../../config/mapConfig';
import type { CampusGeometry, ContextFeatureKind, Footprint } from '../../domain/geometry/types';
import { ExtrudedFootprint } from './ExtrudedFootprint';
import { getFenceTexture } from './facades/facadeTextures';
import { MainEntranceGate, MAIN_ENTRANCE_WIDTH } from './MainEntranceGate';
import { CampusFountain, FOUNTAIN_DIMENSIONS } from './CampusFountain';
import { AjouArtObject } from './AjouArtObject';
import { TennisCourt } from './TennisCourt';
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
  lawn: 0.055,
  track: 0.07,
  pitch: 0.08,
  court: 0.08,
  structure: 0,
};

const contextColors: Record<ContextFeatureKind, string> = {
  lawn: '#6ee7b7', // Vibrant natural grass
  road: '#334155', // Clean asphalt
  track: '#ef4444', // Running track terracotta
  pitch: '#22c55e', // Sports field turf
  court: '#0284c7', // Multi-sport court blue
  structure: '#94a3b8',
};

function FenceSegment({
  length,
  axis,
  position,
  rotationY = 0,
  plinthHeight,
  metalHeight,
  plinthMaterial,
  fenceTexture,
}: {
  length: number;
  axis?: 'x' | 'z';
  position: [number, number, number];
  rotationY?: number;
  plinthHeight: number;
  metalHeight: number;
  plinthMaterial: THREE.Material;
  fenceTexture: THREE.CanvasTexture | null;
}) {
  const repeatCount = Math.max(1, length / 3.0);

  const metalMat = useMemo(() => {
    if (!fenceTexture) {
      return new THREE.MeshStandardMaterial({
        color: '#475569',
        roughness: 0.6,
      });
    }
    const cloned = fenceTexture.clone();
    cloned.wrapS = THREE.RepeatWrapping;
    cloned.wrapT = THREE.ClampToEdgeWrapping;
    cloned.repeat.set(repeatCount, 1);
    cloned.generateMipmaps = true;
    cloned.minFilter = THREE.LinearMipmapLinearFilter;
    cloned.magFilter = THREE.LinearFilter;
    cloned.needsUpdate = true;
    return new THREE.MeshStandardMaterial({
      map: cloned,
      transparent: true,
      alphaTest: 0.35,
      roughness: 0.5,
      metalness: 0.4,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
  }, [fenceTexture, repeatCount]);

  const plinthW = axis === 'z' ? 0.35 : length;
  const plinthD = axis === 'z' ? length : 0.35;

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Concrete plinth base (0.35m height) */}
      <mesh position={[0, plinthHeight / 2, 0]} material={plinthMaterial} receiveShadow castShadow>
        <boxGeometry args={[plinthW, plinthHeight, plinthD]} />
      </mesh>
      {/* See-through Metal Grille with Pickets, Diamonds & Spear tips (single plane to eliminate moire) */}
      <mesh
        position={[0, plinthHeight + metalHeight / 2, 0]}
        rotation={axis === 'z' ? [0, Math.PI / 2, 0] : [0, 0, 0]}
        material={metalMat}
        castShadow
      >
        <planeGeometry args={[length, metalHeight]} />
      </mesh>
    </group>
  );
}

function DirectedFence({
  from,
  to,
  plinthHeight,
  metalHeight,
  plinthMaterial,
  fenceTexture,
}: {
  from: [number, number];
  to: [number, number];
  plinthHeight: number;
  metalHeight: number;
  plinthMaterial: THREE.Material;
  fenceTexture: THREE.CanvasTexture | null;
}) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const angle = Math.atan2(dx, dz);
  const cx = (from[0] + to[0]) / 2;
  const cz = (from[1] + to[1]) / 2;

  return (
    <FenceSegment
      length={len}
      position={[cx, 0, cz]}
      rotationY={angle - Math.PI / 2}
      plinthHeight={plinthHeight}
      metalHeight={metalHeight}
      plinthMaterial={plinthMaterial}
      fenceTexture={fenceTexture}
    />
  );
}

function PerimeterFenceAndGate({ geometry }: { geometry: CampusGeometry }) {
  const { min, max } = geometry.bounds;

  // Gate positioning on the East side (aligning with kpp-e checkpoint)
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

  // Requirement D:
  // - Concrete base: 20 centimeters high (0.20m)
  // - Above-ground fence height: 2.0 meters (0.20m plinth + 1.80m metal grille = 2.0m total)
  const plinthHeight = 0.20;
  const metalHeight = 1.80;

  const fenceTexture = useMemo(() => getFenceTexture(), []);
  const plinthMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#8C8982',
        roughness: 0.9,
      }),
    [],
  );

  // Perimeter boundary lines:
  const left = min[0] - 22;
  const top = min[1] - 22;
  const bottom = max[1] + 22;

  // Requirement C:
  // - Distance from Block B (bld-g East wall at X = +96.45m) to perimeter fence: exactly 5.0 meters -> X = 101.45m
  // - Distance from Block C (bld-i East wall at X = +84.15m) to perimeter fence: exactly 20.0 meters -> X = 104.15m
  // - Main Gate at East fence: right = 104.0m
  const rightGate = 104.0;
  const rightBlockB = 101.45;
  const rightBlockC = 104.15;

  const bldBZStart = 50.0;
  const bldBZEnd = 74.0;

  // "I ♥ AJOU" installation (Requirements E & F)
  // Installed flush against (впритык) the green lawn edge at X=78.15m
  const artZ = gateZ; // z ≈ -23.1m
  const artX = 78.5;

  return (
    <group>
      {/* North fence: from left to rightGate */}
      <FenceSegment
        axis="x"
        length={rightGate - left}
        position={[(left + rightGate) / 2, 0, top]}
        plinthHeight={plinthHeight}
        metalHeight={metalHeight}
        plinthMaterial={plinthMaterial}
        fenceTexture={fenceTexture}
      />

      {/* West fence: from top down to Z=160.0m (start of southwest diagonal boundary) */}
      <DirectedFence
        from={[left, top]}
        to={[left, 160.0]}
        plinthHeight={plinthHeight}
        metalHeight={metalHeight}
        plinthMaterial={plinthMaterial}
        fenceTexture={fenceTexture}
      />

      {/* South-West Diagonal Fence Segment 1: from [left, 160.0] to Dormitory Gate West post [-32.0, 180.0] */}
      <DirectedFence
        from={[left, 160.0]}
        to={[-32.0, 180.0]}
        plinthHeight={plinthHeight}
        metalHeight={metalHeight}
        plinthMaterial={plinthMaterial}
        fenceTexture={fenceTexture}
      />

      {/* South-West Diagonal Fence Segment 2: from Dormitory Gate East post [-25.0, 181.8] to [15.0, 190.0] */}
      <DirectedFence
        from={[-25.0, 181.8]}
        to={[15.0, 190.0]}
        plinthHeight={plinthHeight}
        metalHeight={metalHeight}
        plinthMaterial={plinthMaterial}
        fenceTexture={fenceTexture}
      />

      {/* South fence: from [15.0, 190.0] to [rightBlockC, 190.0] */}
      <DirectedFence
        from={[15.0, 190.0]}
        to={[rightBlockC, 190.0]}
        plinthHeight={plinthHeight}
        metalHeight={metalHeight}
        plinthMaterial={plinthMaterial}
        fenceTexture={fenceTexture}
      />

      {/* Dormitory Dividing Fence (between parking lot and central campus avenue): from [-17.5, 133.5] to [-17.5, 183.0] */}
      <DirectedFence
        from={[-17.5, 133.5]}
        to={[-17.5, 183.0]}
        plinthHeight={plinthHeight}
        metalHeight={metalHeight}
        plinthMaterial={plinthMaterial}
        fenceTexture={fenceTexture}
      />

      {/* South-West 2-Lane Diagonal Road (outside diagonal fence, clear of parking lot & garages) */}
      <group position={[-45.0, 0.02, 184.0]} rotation={[0, -0.25, 0]}>
        {/* Asphalt road strip */}
        <mesh receiveShadow>
          <boxGeometry args={[165.0, 0.02, 9.0]} />
          <meshStandardMaterial color="#1e293b" roughness={0.9} />
        </mesh>
        {/* Outer Sidewalk / Verge alongside fence */}
        <mesh position={[0, 0.02, -5.7]} receiveShadow>
          <boxGeometry args={[165.0, 0.025, 2.4]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.9} />
        </mesh>
        {/* Concrete Road Curb */}
        <mesh position={[0, 0.035, -4.55]} receiveShadow>
          <boxGeometry args={[165.0, 0.05, 0.2]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.85} />
        </mesh>
        {/* Dashed white center line */}
        {Array.from({ length: 24 }).map((_, rIdx) => {
          const rx = -78.0 + rIdx * 6.8;
          return (
            <mesh key={`rd-stripe-${rIdx}`} position={[rx, 0.012, 0]}>
              <boxGeometry args={[3.4, 0.002, 0.15]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          );
        })}
        {/* Pedestrian Zebra Crosswalk at bottom-west road */}
        <group position={[-42.0, 0.015, 0]}>
          {Array.from({ length: 9 }).map((_, zIdx) => (
            <mesh key={`rd-zebra-${zIdx}`} position={[-3.6 + zIdx * 0.9, 0, 0]}>
              <boxGeometry args={[0.5, 0.003, 8.0]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          ))}
        </group>
      </group>

      {/* South-West Gate Checkpoint (КПП Парковки общежития и автоматический шлагбаум) */}
      <group position={[-25.0, 0, 181.8]} rotation={[0, -0.25, 0]}>
        {/* Guard booth */}
        <mesh position={[2.0, 1.4, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.4, 2.8, 2.4]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.8} />
        </mesh>
        <mesh position={[2.0, 2.9, 0]} castShadow>
          <boxGeometry args={[2.8, 0.25, 2.8]} />
          <meshStandardMaterial color="#78350f" roughness={0.6} />
        </mesh>
        {/* Automatic barrier pedestal & boom arm spanning the gate */}
        <mesh position={[-0.8, 0.5, 0]}>
          <cylinderGeometry args={[0.08, 0.1, 0.9, 8]} />
          <meshStandardMaterial color="#ea580c" />
        </mesh>
        <mesh position={[-3.7, 0.85, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.04, 0.04, 5.8, 8]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      </group>

      {/* East fence segment 1 (North of gate): from top to gate entrance */}
      <FenceSegment
        axis="z"
        length={Math.max(1, gateZ - gateWidth / 2 - top)}
        position={[rightGate, 0, (top + gateZ - gateWidth / 2) / 2]}
        plinthHeight={plinthHeight}
        metalHeight={metalHeight}
        plinthMaterial={plinthMaterial}
        fenceTexture={fenceTexture}
      />

      {/* East fence segment 2 (South of gate to Block B start): from gate to Z=50.0m */}
      <FenceSegment
        axis="z"
        length={Math.max(1, bldBZStart - (gateZ + gateWidth / 2))}
        position={[rightGate, 0, (bldBZStart + gateZ + gateWidth / 2) / 2]}
        plinthHeight={plinthHeight}
        metalHeight={metalHeight}
        plinthMaterial={plinthMaterial}
        fenceTexture={fenceTexture}
      />

      {/* Fence jog transition into Block B setback at Z=50.0m (from X=104.0 to X=101.45) */}
      <FenceSegment
        axis="x"
        length={Math.abs(rightGate - rightBlockB)}
        position={[(rightGate + rightBlockB) / 2, 0, bldBZStart]}
        plinthHeight={plinthHeight}
        metalHeight={metalHeight}
        plinthMaterial={plinthMaterial}
        fenceTexture={fenceTexture}
      />

      {/* East fence segment 3 (Opposite Block B): exactly 5.0m from Block B east wall (X=101.45m) */}
      <FenceSegment
        axis="z"
        length={bldBZEnd - bldBZStart}
        position={[rightBlockB, 0, (bldBZStart + bldBZEnd) / 2]}
        plinthHeight={plinthHeight}
        metalHeight={metalHeight}
        plinthMaterial={plinthMaterial}
        fenceTexture={fenceTexture}
      />

      {/* Fence jog transition from Block B to Block C at Z=74.0m (from X=101.45 to X=104.15) */}
      <FenceSegment
        axis="x"
        length={Math.abs(rightBlockC - rightBlockB)}
        position={[(rightBlockC + rightBlockB) / 2, 0, bldBZEnd]}
        plinthHeight={plinthHeight}
        metalHeight={metalHeight}
        plinthMaterial={plinthMaterial}
        fenceTexture={fenceTexture}
      />

      {/* East fence segment 4 (Opposite Block C): exactly 20.0m from Block C east wall (X=104.15m) */}
      <FenceSegment
        axis="z"
        length={Math.max(1, bottom - bldBZEnd)}
        position={[rightBlockC, 0, (bottom + bldBZEnd) / 2]}
        plinthHeight={plinthHeight}
        metalHeight={metalHeight}
        plinthMaterial={plinthMaterial}
        fenceTexture={fenceTexture}
      />

      {/* Main Campus Entrance & Checkpoint Ensemble (КПП AUT, Стела, Павильон, Баннер) */}
      <MainEntranceGate
        position={[rightGate, 0, gateZ]}
        rotation={[0, Math.PI / 2, 0]}
      />

      {/* Main Entrance Driveway Threshold at Perimeter Gate */}
      <mesh position={[101.5, 0.03, gateZ]} receiveShadow>
        <boxGeometry args={[5.0, 0.02, 12.0]} />
        <meshStandardMaterial color="#334155" roughness={0.85} />
      </mesh>

      {/* Landmark Art-Object "I ♥ AJOU" on entrance plaza lawn (Requirements E & F) */}
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

function SecurityCheckpointBooth({ footprint }: { footprint: Footprint }) {
  const { center, size } =
    footprint.type === 'rect'
      ? footprint
      : { center: [0, 0] as [number, number], size: [6, 4] as [number, number] };
  const w = size[0];
  const d = size[1];
  return (
    <group position={[center[0], 0, center[1]]}>
      {/* Concrete foundation plinth */}
      <mesh position={[0, 0.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.3, d]} />
        <meshStandardMaterial color="#475569" roughness={0.9} />
      </mesh>
      {/* Booth Wall Body */}
      <mesh position={[0, 1.65, 0]} castShadow receiveShadow>
        <boxGeometry args={[w - 0.4, 2.7, d - 0.4]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.8} />
      </mesh>
      {/* Inspection Ribbon Windows */}
      <mesh position={[0, 1.8, 0]} castShadow>
        <boxGeometry args={[w - 0.3, 1.1, d - 0.3]} />
        <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.1} />
      </mesh>
      {/* Overhanging Canopy Roof with Fascia */}
      <mesh position={[0, 3.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[w + 1.0, 0.35, d + 1.0]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.6} metalness={0.2} />
      </mesh>
      {/* Security Barrier Boom Arm */}
      <mesh position={[w / 2 + 0.3, 0.5, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.08, 0.1, 1.0, 8]} />
        <meshStandardMaterial color="#ea580c" roughness={0.4} />
      </mesh>
      <mesh position={[w / 2 + 0.3 + 1.8, 0.9, 0]}>
        <boxGeometry args={[3.6, 0.08, 0.08]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>
    </group>
  );
}

/**
 * Ground terrain base, perimeter enclosures, and landscape surfaces (roads, turf, courts, paths).
 */
export function ContextLayer({ geometry, tuning }: { geometry: CampusGeometry; tuning?: ContextTuning }) {
  const { min, max } = geometry.bounds;
  const margin = 120;
  const width = max[0] - min[0] + margin * 2;
  const depth = max[1] - min[1] + margin * 2;
  const usePbr = tuning?.pbrTexturesEnabled !== false;

  const pavingPbr = useMemo(() => (usePbr ? getPromenadePavingTextures() : null), [usePbr]);
  const asphaltPbr = useMemo(() => (usePbr ? getAsphaltRoadTextures() : null), [usePbr]);
  const grassPbr = useMemo(() => (usePbr ? getLushGrassTextures() : null), [usePbr]);

  const groundCenter: [number, number, number] = [
    (min[0] + max[0]) / 2,
    -0.05,
    (min[1] + max[1]) / 2,
  ];

  const getColor = (kind: ContextFeatureKind) => {
    if (tuning) {
      if (kind === 'lawn' && tuning.lawnColor) return tuning.lawnColor;
      if (kind === 'road' && tuning.roadColor) return tuning.roadColor;
      if (kind === 'track' && tuning.trackColor) return tuning.trackColor;
      if (kind === 'pitch' && tuning.pitchColor) return tuning.pitchColor;
      if (kind === 'court' && tuning.courtColor) return tuning.courtColor;
    }
    return contextColors[kind] ?? mapConfig.colors.context[kind];
  };

  return (
    <group>
      {/* Base ground terrain (warm light pavement / soil with PBR detail) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={groundCenter}
        receiveShadow
        raycast={() => null}
      >
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial
          color={tuning?.groundColor ?? '#d8d4cc'}
          map={pavingPbr?.map ?? null}
          normalMap={pavingPbr?.normalMap ?? null}
          normalScale={[0.08, 0.08]}
          roughnessMap={pavingPbr?.roughnessMap ?? null}
          roughness={0.88}
          metalness={0.02}
          polygonOffset={true}
          polygonOffsetFactor={3}
          polygonOffsetUnits={3}
        />
      </mesh>

      {/* Perimeter fence, Main Entrance checkpoint, 20m internal road, Art-object, and Fountain */}
      <PerimeterFenceAndGate geometry={geometry} />

      {/* Photovoltaic Solar Canopies & Dormitory Parking Ensemble */}
      <SolarCanopies />

      {/* Pedestrian Walkways, Stone Plazas, Curbs, and Zebra Crossings */}
      <CampusWalkways />

      {/* Real-World Sports Facilities (Soccer pitch lines/goals, basketball court lines/hoops, tennis court, stadium bleachers) */}
      <SportsFacilities />

      {/* Grand Campus Fountain: calibrated to blue box markup (X in [-23, +34], Z = -23.1) */}
      <CampusFountain
        scale={1.0}
        position={[5.5, 0, -23.1]}
      />

      {/* Campus Outdoor Infrastructure & Site Furniture (LED Street lights, floodlights, benches, bins, bike racks, totem) */}
      <SiteFurniture />

      {/* Context landscape layers (roads, lawns, sports tracks, pitches) */}
      {geometry.context.map((f) => {
        if (f.id === 'kpp-e' || f.id === 'kpp-sw') return null;
        if (f.id === 'court' || f.id === 'court-tennis' || f.id === 'pitch' || f.id === 'track' || f.id === 'lawn-n') return null; // Rendered via dedicated SportsFacilities & TennisCourt
        if (f.id.startsWith('solar-canopy-') || f.id === 'solar-canopy-1' || f.id === 'solar-canopy-2') return null; // Rendered via dedicated 3D SolarCanopies
        if (f.id.startsWith('dorm-garage-') || f.id.startsWith('dorm-shed-') || f.id.startsWith('dorm-booth-')) return null; // Rendered via dedicated 3D SolarCanopies
        if (f.id === 'road-entrance-main') return null; // Rendered via dedicated 20m entrance road in PerimeterFenceAndGate
        if (f.id === 'out-plaza-mvijfubr') return null; // Rendered as full 3D architectural AmphitheaterHall in Campus.tsx
        if (f.id.startsWith('kpp-')) {
          return <SecurityCheckpointBooth key={f.id} footprint={f.footprint} />;
        }
        if (f.kind === 'structure') {
          return (
            <ExtrudedFootprint
              key={f.id}
              footprint={f.footprint}
              bottom={0}
              height={f.height ?? mapConfig.building.unknownStructureHeight}
              color="#94a3b8"
              opacity={1}
              interactive={false}
              castShadow
              receiveShadow
            />
          );
        }

        const isLawn = f.kind === 'lawn';
        const isRoad = f.kind === 'road';
        const pbrSet = isLawn ? grassPbr : isRoad ? asphaltPbr : null;

        return (
          <ExtrudedFootprint
            key={f.id}
            footprint={f.footprint}
            bottom={flatLayerElevation[f.kind] ?? 0.02}
            height={isLawn ? 0.03 : isRoad ? 0.025 : 0.02}
            color={getColor(f.kind)}
            map={pbrSet?.map ?? null}
            normalMap={pbrSet?.normalMap ?? null}
            normalScale={isLawn ? [0.12, 0.12] : [0.15, 0.15]}
            roughnessMap={pbrSet?.roughnessMap ?? null}
            roughness={isLawn ? 0.9 : isRoad ? 0.84 : 0.78}
            metalness={isRoad ? 0.06 : 0.02}
            interactive={false}
            receiveShadow
          />
        );
      })}
    </group>
  );
}
