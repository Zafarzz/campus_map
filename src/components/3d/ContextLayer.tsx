import { useMemo } from 'react';
import * as THREE from 'three';
import { mapConfig } from '../../config/mapConfig';
import type { CampusGeometry, ContextFeatureKind } from '../../domain/geometry/types';
import { ExtrudedFootprint } from './ExtrudedFootprint';
import { getFenceTexture } from './facades/facadeTextures';
import { MainEntranceGate, MAIN_ENTRANCE_WIDTH } from './MainEntranceGate';
import { CampusFountain, FOUNTAIN_DIMENSIONS } from './CampusFountain';
import { AjouArtObject } from './AjouArtObject';
import {
  getAsphaltRoadTextures,
  getLushGrassTextures,
  getPromenadePavingTextures,
} from './materials/pbrMaterials';

const flatLayerElevation: Record<ContextFeatureKind, number> = {
  road: 0.03,
  lawn: 0.05,
  track: 0.07,
  pitch: 0.09,
  court: 0.09,
  structure: 0,
};

const contextColors: Record<ContextFeatureKind, string> = {
  lawn: '#6d964b', // Natural sunlit botanical grass
  road: '#3b4654', // Weathered asphalt
  track: '#c24136', // Running track terracotta
  pitch: '#3d8c45', // Sports field turf
  court: '#2c6fa8', // Multi-sport acrylic court blue
  structure: '#94a3b8',
};

function FenceSegment({
  length,
  axis,
  position,
  plinthHeight,
  metalHeight,
  plinthMaterial,
  fenceTexture,
}: {
  length: number;
  axis: 'x' | 'z';
  position: [number, number, number];
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

  const plinthW = axis === 'x' ? length : 0.35;
  const plinthD = axis === 'z' ? length : 0.35;
  const metalW = axis === 'x' ? length : 0.05;
  const metalD = axis === 'z' ? length : 0.05;

  return (
    <group position={position}>
      {/* Concrete plinth base (0.35m height) */}
      <mesh position={[0, plinthHeight / 2, 0]} material={plinthMaterial} receiveShadow castShadow>
        <boxGeometry args={[plinthW, plinthHeight, plinthD]} />
      </mesh>
      {/* See-through Metal Grille with Pickets, Diamonds & Spear tips */}
      <mesh position={[0, plinthHeight + metalHeight / 2, 0]} material={metalMat} castShadow>
        <boxGeometry args={[metalW, metalHeight, metalD]} />
      </mesh>
    </group>
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
  const plinthHeight = 0.35; // З-2: Бетонный цоколь ограждения 350 мм
  const metalHeight = 1.85; // З-1: Металлическая решётка + фриз 1850 мм

  const fenceTexture = useMemo(() => getFenceTexture(), []);
  const plinthMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#8C8982',
        roughness: 0.9,
      }),
    [],
  );

  // Perimeter bounds
  const left = min[0] - 22;
  const right = max[0] + 12;
  const top = min[1] - 22;
  const bottom = max[1] + 22;

  return (
    <group>
      {/* North fence: length = right - left */}
      <FenceSegment
        axis="x"
        length={right - left}
        position={[(left + right) / 2, 0, top]}
        plinthHeight={plinthHeight}
        metalHeight={metalHeight}
        plinthMaterial={plinthMaterial}
        fenceTexture={fenceTexture}
      />

      {/* South fence: length = right - left */}
      <FenceSegment
        axis="x"
        length={right - left}
        position={[(left + right) / 2, 0, bottom]}
        plinthHeight={plinthHeight}
        metalHeight={metalHeight}
        plinthMaterial={plinthMaterial}
        fenceTexture={fenceTexture}
      />

      {/* West fence: length = bottom - top */}
      <FenceSegment
        axis="z"
        length={bottom - top}
        position={[left, 0, (top + bottom) / 2]}
        plinthHeight={plinthHeight}
        metalHeight={metalHeight}
        plinthMaterial={plinthMaterial}
        fenceTexture={fenceTexture}
      />

      {/* East fence (top segment before gate) */}
      <FenceSegment
        axis="z"
        length={Math.max(1, gateZ - gateWidth / 2 - top)}
        position={[right, 0, (top + gateZ - gateWidth / 2) / 2]}
        plinthHeight={plinthHeight}
        metalHeight={metalHeight}
        plinthMaterial={plinthMaterial}
        fenceTexture={fenceTexture}
      />

      {/* East fence (bottom segment after gate) */}
      <FenceSegment
        axis="z"
        length={Math.max(1, bottom - (gateZ + gateWidth / 2))}
        position={[right, 0, (bottom + gateZ + gateWidth / 2) / 2]}
        plinthHeight={plinthHeight}
        metalHeight={metalHeight}
        plinthMaterial={plinthMaterial}
        fenceTexture={fenceTexture}
      />

      {/* Main Campus Entrance & Checkpoint Ensemble (КПП AUT, Стела, Павильон, Баннер) */}
      <MainEntranceGate
        position={[right, 0, gateZ]}
        rotation={[0, Math.PI / 2, 0]}
      />

      {/* Landmark Art-Object "I ♥ AJOU" immediately past the entrance roadway (Лист 3, М 1:25) */}
      <AjouArtObject
        position={[106.5, 0, gateZ]}
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
export function ContextLayer({
  geometry,
  tuning,
}: {
  geometry: CampusGeometry;
  tuning?: ContextTuning;
}) {
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
      {/* Base ground terrain (architectural stone promenade paving with normal/roughness detail) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={groundCenter}
        receiveShadow
        raycast={() => null}
      >
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial
          color={tuning?.groundColor ?? '#e2ddd5'}
          map={pavingPbr?.map ?? null}
          normalMap={pavingPbr?.normalMap ?? null}
          normalScale={[0.22, 0.22]}
          roughnessMap={pavingPbr?.roughnessMap ?? null}
          roughness={0.85}
          metalness={0.03}
        />
      </mesh>

      {/* Perimeter fence and gate */}
      <PerimeterFenceAndGate geometry={geometry} />

      {/* Grand Architectural Campus Fountain replacing the green sports pitch (shifted 50m further from East Main Entrance) */}
      <CampusFountain
        scale={FOUNTAIN_DIMENSIONS.defaultScale}
        position={
          (() => {
            const pitchFeature = geometry.context.find((f) => f.id === 'pitch');
            if (pitchFeature && pitchFeature.footprint.type === 'rect') {
              return [pitchFeature.footprint.center[0] - 50.0, 0, pitchFeature.footprint.center[1]];
            }
            return [-2.45, 0, 15.9];
          })()
        }
      />

      {/* Context landscape layers (roads, lawns, sports tracks, pitches) */}
      {geometry.context.map((f) => {
        if (f.id === 'kpp-e') return null;
        if (f.id === 'pitch') return null; // Replaced by CampusFountain
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
            height={isLawn ? 0.065 : isRoad ? 0.035 : 0.025}
            color={getColor(f.kind)}
            map={pbrSet?.map ?? null}
            normalMap={pbrSet?.normalMap ?? null}
            normalScale={isLawn ? [0.5, 0.5] : [0.35, 0.35]}
            roughnessMap={pbrSet?.roughnessMap ?? null}
            roughness={isLawn ? 0.9 : isRoad ? 0.84 : 0.78}
            metalness={isRoad ? 0.06 : 0.02}
            edgeColor={isLawn ? '#94a3b8' : isRoad ? '#cbd5e1' : undefined}
            interactive={false}
            receiveShadow
          />
        );
      })}
    </group>
  );
}
