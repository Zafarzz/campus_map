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
  lawn: 0.025,
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

  // Perimeter boundary lines (aligned strictly with campus perimeter):
  const left = -104.5;
  const top = -152.0;

  // East Perimeter Fence & Gate: continuous straight line along X = 104.0m (cherniy / porovnit zabor)
  const rightGate = 104.0;

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

      {/* West fence: from top down to Z=204.3m (meeting the South-West diagonal perimeter fence) */}
      <DirectedFence
        from={[left, top]}
        to={[left, 204.3]}
        plinthHeight={plinthHeight}
        metalHeight={metalHeight}
        plinthMaterial={plinthMaterial}
        fenceTexture={fenceTexture}
      />

      {/* South-West Diagonal Perimeter Fence: from Parking Gate South post [-53.0, 194.8] along diagonal road sidewalk in front of garages to West corner [left, 204.3] */}
      <DirectedFence
        from={[-53.0, 194.8]}
        to={[left, 204.3]}
        plinthHeight={plinthHeight}
        metalHeight={metalHeight}
        plinthMaterial={plinthMaterial}
        fenceTexture={fenceTexture}
      />

      {/* South-East Diagonal Perimeter Fence: from East road corner [rightGate, 160.0] along diagonal road sidewalk to Parking Gate East post [-47.0, 193.5] */}
      <DirectedFence
        from={[rightGate, 160.0]}
        to={[-47.0, 193.5]}
        plinthHeight={plinthHeight}
        metalHeight={metalHeight}
        plinthMaterial={plinthMaterial}
        fenceTexture={fenceTexture}
      />

      {/* Dormitory Dividing Fence (between southern parking lot and central campus avenue): from [-50.0, 153.0] to [-50.0, 192.0] */}
      <DirectedFence
        from={[-50.0, 153.0]}
        to={[-50.0, 192.0]}
        plinthHeight={plinthHeight}
        metalHeight={metalHeight}
        plinthMaterial={plinthMaterial}
        fenceTexture={fenceTexture}
      />

      {/* South-West 2-Lane Diagonal Road (outside diagonal fence, connecting East perimeter road to South-West corner per CAD masterplan) */}
      <group position={[1.5, 0.02, 189.9]} rotation={[0, 0.2186, 0]}>
        {/* Asphalt road strip (240m long, 9m wide) */}
        <mesh receiveShadow>
          <boxGeometry args={[240.0, 0.02, 9.0]} />
          <meshStandardMaterial color="#1e293b" roughness={0.9} />
        </mesh>
        {/* Inner Sidewalk / Verge alongside campus perimeter fence */}
        <mesh position={[0, 0.02, -5.75]} receiveShadow>
          <boxGeometry args={[240.0, 0.025, 2.5]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.9} />
        </mesh>
        {/* Concrete Road Inner Curb */}
        <mesh position={[0, 0.035, -4.45]} receiveShadow>
          <boxGeometry args={[240.0, 0.05, 0.2]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.85} />
        </mesh>
        {/* Outer Sidewalk / Verge */}
        <mesh position={[0, 0.02, 5.6]} receiveShadow>
          <boxGeometry args={[240.0, 0.025, 2.2]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.9} />
        </mesh>
        {/* Concrete Road Outer Curb */}
        <mesh position={[0, 0.035, 4.45]} receiveShadow>
          <boxGeometry args={[240.0, 0.05, 0.2]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.85} />
        </mesh>
        {/* Dashed white center line */}
        {Array.from({ length: 34 }).map((_, rIdx) => {
          const rx = -112.0 + rIdx * 6.8;
          return (
            <mesh key={`rd-stripe-${rIdx}`} position={[rx, 0.012, 0]}>
              <boxGeometry args={[3.4, 0.002, 0.15]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          );
        })}
        {/* Pedestrian Zebra Crosswalk 1 (East intersection near road-east at world X ≈ 90m) */}
        <group position={[90.0, 0.015, 0]}>
          {Array.from({ length: 9 }).map((_, zIdx) => (
            <mesh key={`rd-zebra-e-${zIdx}`} position={[-3.6 + zIdx * 0.9, 0, 0]}>
              <boxGeometry args={[0.5, 0.003, 8.0]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          ))}
        </group>
        {/* Pedestrian Zebra Crosswalk 2 (West, near Dormitory parking entrance at world X ≈ -50m) */}
        <group position={[-50.0, 0.015, 0]}>
          {Array.from({ length: 9 }).map((_, zIdx) => (
            <mesh key={`rd-zebra-w-${zIdx}`} position={[-3.6 + zIdx * 0.9, 0, 0]}>
              <boxGeometry args={[0.5, 0.003, 8.0]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          ))}
        </group>
      </group>

      {/* South-West Gate Checkpoint (КПП Парковки общежития и автоматический шлагбаум per CAD masterplan) */}
      <group position={[-50.0, 0, 194.2]} rotation={[0, 0.2186, 0]}>
        {/* Guard booth 1 (North-East booth, at corner of park) */}
        <group position={[3.2, 0, -1.2]}>
          <mesh position={[0, 1.4, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.5, 2.8, 2.5]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.8} />
          </mesh>
          <mesh position={[0, 2.9, 0]} castShadow>
            <boxGeometry args={[2.9, 0.25, 2.9]} />
            <meshStandardMaterial color="#78350f" roughness={0.6} />
          </mesh>
        </group>
        {/* Guard booth 2 (South-West booth / post, at garage flank) */}
        <group position={[-3.2, 0, -1.2]}>
          <mesh position={[0, 1.4, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.5, 2.8, 2.5]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.8} />
          </mesh>
          <mesh position={[0, 2.9, 0]} castShadow>
            <boxGeometry args={[2.9, 0.25, 2.9]} />
            <meshStandardMaterial color="#78350f" roughness={0.6} />
          </mesh>
        </group>
        {/* Automatic barrier pedestal & boom arm spanning the gate */}
        <mesh position={[1.6, 0.5, -0.6]}>
          <cylinderGeometry args={[0.08, 0.1, 0.9, 8]} />
          <meshStandardMaterial color="#ea580c" />
        </mesh>
        <mesh position={[-0.8, 0.85, -0.6]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.04, 0.04, 4.6, 8]} />
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

      {/* East fence segment 2 (South of gate to diagonal road corner at Z=160.0m per CAD masterplan) */}
      <FenceSegment
        axis="z"
        length={Math.max(1, 160.0 - (gateZ + gateWidth / 2))}
        position={[rightGate, 0, (gateZ + gateWidth / 2 + 160.0) / 2]}
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

      {/* ============================================================== */}
      {/* East 4-Lane Major Avenue in front of Main Entrance (2x wider)  */}
      {/* (Wast perimeter road widened to 18.0m per user instruction)     */}
      {/* ============================================================== */}
      {(() => {
        const roadZCenter = (top + 160.0) / 2; // (-152.0 + 160.0) / 2 = 4.0
        const roadLength = 160.0 - top + 4.0;  // 316.0m
        const asphaltWidth = 18.0;             // 2x wider (doubled from 9.0m to 18.0m)
        const asphaltX = 115.7;                // Center of 18.0m roadway [106.7 to 124.7]
        const innerCurbX = 106.6;              // Inner concrete curb
        const outerCurbX = 124.8;              // Outer concrete curb
        const innerSidewalkX = 105.3;          // Inner sidewalk (between fence & curb)
        const outerSidewalkX = 126.4;          // Outer sidewalk (3.0m wide)
        const outerVergeX = 129.5;             // Outer green verge / buffer (3.2m wide)

        const stripeCount = Math.floor(roadLength / 6.8);

        return (
          <group position={[0, 0, 0]}>
            {/* 1. Asphalt Roadway (18.0m wide, 4-lane boulevard / 2x wider) */}
            <mesh position={[asphaltX, 0.02, roadZCenter]} receiveShadow>
              <boxGeometry args={[asphaltWidth, 0.02, roadLength]} />
              <meshStandardMaterial color="#1e293b" roughness={0.9} />
            </mesh>

            {/* 2. Inner Sidewalk along campus perimeter fence (2.4m wide) */}
            <mesh position={[innerSidewalkX, 0.02, roadZCenter]} receiveShadow>
              <boxGeometry args={[2.4, 0.025, roadLength]} />
              <meshStandardMaterial color="#cbd5e1" roughness={0.9} />
            </mesh>

            {/* 3. Concrete Road Inner Curb */}
            <mesh position={[innerCurbX, 0.035, roadZCenter]} receiveShadow>
              <boxGeometry args={[0.2, 0.05, roadLength]} />
              <meshStandardMaterial color="#94a3b8" roughness={0.85} />
            </mesh>

            {/* 4. Outer Sidewalk (3.0m wide) */}
            <mesh position={[outerSidewalkX, 0.02, roadZCenter]} receiveShadow>
              <boxGeometry args={[3.0, 0.025, roadLength]} />
              <meshStandardMaterial color="#cbd5e1" roughness={0.9} />
            </mesh>

            {/* 5. Concrete Road Outer Curb */}
            <mesh position={[outerCurbX, 0.035, roadZCenter]} receiveShadow>
              <boxGeometry args={[0.2, 0.05, roadLength]} />
              <meshStandardMaterial color="#94a3b8" roughness={0.85} />
            </mesh>

            {/* 6. Outer Green Verge / Grass buffer */}
            <mesh position={[outerVergeX, 0.02, roadZCenter]} receiveShadow>
              <boxGeometry args={[3.2, 0.022, roadLength]} />
              <meshStandardMaterial color="#4a7c3a" roughness={0.9} />
            </mesh>

            {/* 7. Double Solid White Centerline (Traffic Divider) */}
            <mesh position={[asphaltX - 0.12, 0.032, roadZCenter]}>
              <boxGeometry args={[0.12, 0.002, roadLength]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
            <mesh position={[asphaltX + 0.12, 0.032, roadZCenter]}>
              <boxGeometry args={[0.12, 0.002, roadLength]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>

            {/* 8. Dashed White Lane Dividers (4-lane traffic) */}
            {Array.from({ length: stripeCount }).map((_, rIdx) => {
              const rz = top + 2.0 + rIdx * 6.8;
              return (
                <group key={`east-lane-stripes-${rIdx}`}>
                  {/* West inner lane divider */}
                  <mesh position={[asphaltX - 4.5, 0.032, rz]}>
                    <boxGeometry args={[0.15, 0.002, 3.4]} />
                    <meshBasicMaterial color="#ffffff" />
                  </mesh>
                  {/* East inner lane divider */}
                  <mesh position={[asphaltX + 4.5, 0.032, rz]}>
                    <boxGeometry args={[0.15, 0.002, 3.4]} />
                    <meshBasicMaterial color="#ffffff" />
                  </mesh>
                </group>
              );
            })}

            {/* 9. Solid White Outer Edge Lines */}
            <mesh position={[asphaltX - 8.65, 0.032, roadZCenter]}>
              <boxGeometry args={[0.15, 0.002, roadLength]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
            <mesh position={[asphaltX + 8.65, 0.032, roadZCenter]}>
              <boxGeometry args={[0.15, 0.002, roadLength]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>

            {/* 10. Pedestrian Zebra Crosswalk in front of Main Entrance Gate (spanning full 18m roadway) */}
            <group position={[asphaltX, 0.035, gateZ]}>
              {Array.from({ length: 9 }).map((_, zIdx) => (
                <mesh key={`east-zebra-main-${zIdx}`} position={[0, 0, -3.6 + zIdx * 0.9]}>
                  <boxGeometry args={[17.2, 0.003, 0.5]} />
                  <meshBasicMaterial color="#ffffff" />
                </mesh>
              ))}
            </group>

            {/* 11. Pedestrian Zebra Crosswalk at North Gate / Approach */}
            <group position={[asphaltX, 0.035, -135.0]}>
              {Array.from({ length: 9 }).map((_, zIdx) => (
                <mesh key={`east-zebra-north-${zIdx}`} position={[0, 0, -3.6 + zIdx * 0.9]}>
                  <boxGeometry args={[17.2, 0.003, 0.5]} />
                  <meshBasicMaterial color="#ffffff" />
                </mesh>
              ))}
            </group>

            {/* 12. Pedestrian Zebra Crosswalk at South-East intersection */}
            <group position={[asphaltX, 0.035, 154.0]}>
              {Array.from({ length: 9 }).map((_, zIdx) => (
                <mesh key={`east-zebra-se-${zIdx}`} position={[0, 0, -3.6 + zIdx * 0.9]}>
                  <boxGeometry args={[17.2, 0.003, 0.5]} />
                  <meshBasicMaterial color="#ffffff" />
                </mesh>
              ))}
            </group>
          </group>
        );
      })()}
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
  // Confine ground terrain base strictly to the campus perimeter and surrounding roads (zero empty outer margin)
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

  // South Park Diagonal Lawn (conforms strictly inside campus with 0.8m setback from the diagonal fence)
  const southParkLawnFootprint: Footprint = useMemo(
    () => ({
      type: 'polygon',
      points: [
        [-48.0, 147.0],
        [-48.0, 192.9],
        [54.0, 170.3],
        [54.0, 147.0],
      ],
    }),
    [],
  );

  // South-East Pedestrian Plaza south of Block C (connecting Block C south promenade to fence & crosswalk per black markup media_1793554124975.png)
  const southEastPlazaFootprint: Footprint = useMemo(
    () => ({
      type: 'polygon',
      points: [
        [54.0, 145.5],
        [54.0, 170.2],
        [103.5, 159.5],
        [103.5, 145.5],
      ],
    }),
    [],
  );

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

      {/* South Park Diagonal Lawn (conforms strictly inside campus with 0.8m setback from the diagonal fence) */}
      <ExtrudedFootprint
        footprint={southParkLawnFootprint}
        bottom={0.025}
        height={0.02}
        color={getColor('lawn')}
        map={grassPbr?.map ?? null}
        normalMap={grassPbr?.normalMap ?? null}
        normalScale={[0.12, 0.12]}
        roughnessMap={grassPbr?.roughnessMap ?? null}
        roughness={0.9}
        metalness={0.02}
        interactive={false}
        receiveShadow
      />

      {/* South-East Pedestrian Plaza south of Block C (per black markup media_1793554124975.png) */}
      <ExtrudedFootprint
        footprint={southEastPlazaFootprint}
        bottom={0.035}
        height={0.016}
        color="#cbd5e1"
        map={pavingPbr?.map ?? null}
        normalMap={pavingPbr?.normalMap ?? null}
        normalScale={[0.12, 0.12]}
        roughnessMap={pavingPbr?.roughnessMap ?? null}
        roughness={0.82}
        metalness={0.05}
        interactive={false}
        receiveShadow
      />

      {/* Context landscape layers (roads, lawns, sports tracks, pitches) */}
      {geometry.context.map((f) => {
        if (f.id === 'kpp-e' || f.id === 'kpp-sw') return null;
        if (f.id === 'court' || f.id === 'court-tennis' || f.id === 'pitch' || f.id === 'track' || f.id === 'lawn-n') return null; // Rendered via dedicated SportsFacilities & TennisCourt
        if (f.id.startsWith('solar-canopy-') || f.id === 'solar-canopy-1' || f.id === 'solar-canopy-2') return null; // Rendered via dedicated 3D SolarCanopies
        if (f.id.startsWith('dorm-garage-') || f.id.startsWith('dorm-shed-') || f.id.startsWith('dorm-booth-')) return null; // Rendered via dedicated 3D SolarCanopies
        if (f.id === 'road-east' || f.id === 'road-entrance-main') return null; // Rendered via dedicated high-spec 2-lane East Road & entrance plaza
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
            height={isLawn ? 0.02 : isRoad ? 0.025 : 0.02}
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
