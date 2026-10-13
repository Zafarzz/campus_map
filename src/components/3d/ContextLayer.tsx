import { useMemo } from 'react';
import * as THREE from 'three';
import { mapConfig } from '../../config/mapConfig';
import type { CampusGeometry, ContextFeatureKind } from '../../domain/geometry/types';
import { ExtrudedFootprint } from './ExtrudedFootprint';

const flatLayerElevation: Record<ContextFeatureKind, number> = {
  road: 0.03,
  lawn: 0.05,
  track: 0.07,
  pitch: 0.09,
  court: 0.09,
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

function PerimeterFenceAndGate({ geometry }: { geometry: CampusGeometry }) {
  const { min, max } = geometry.bounds;

  // Gate positioning on the East side, safely centered between available buildings or mid-bound
  const gateZ = useMemo(() => {
    const bldB = geometry.buildings['bld-g'];
    const bldF = geometry.buildings['bld-d'];
    if (bldB && bldF) {
      return (bldB.center[2] + bldF.center[2]) / 2;
    }
    return (min[1] + max[1]) / 2;
  }, [geometry, min, max]);

  const gateWidth = 16;
  const fenceHeight = 1.6;
  const fenceThickness = 0.4;
  const fenceColor = '#475569';

  // Perimeter bounds
  const left = min[0] - 22;
  const right = max[0] + 12;
  const top = min[1] - 22;
  const bottom = max[1] + 22;

  return (
    <group>
      {/* North fence */}
      <mesh position={[(left + right) / 2, fenceHeight / 2, top]} castShadow receiveShadow>
        <boxGeometry args={[right - left, fenceHeight, fenceThickness]} />
        <meshStandardMaterial color={fenceColor} roughness={0.8} />
      </mesh>

      {/* South fence */}
      <mesh position={[(left + right) / 2, fenceHeight / 2, bottom]} castShadow receiveShadow>
        <boxGeometry args={[right - left, fenceHeight, fenceThickness]} />
        <meshStandardMaterial color={fenceColor} roughness={0.8} />
      </mesh>

      {/* West fence */}
      <mesh position={[left, fenceHeight / 2, (top + bottom) / 2]} castShadow receiveShadow>
        <boxGeometry args={[fenceThickness, fenceHeight, bottom - top]} />
        <meshStandardMaterial color={fenceColor} roughness={0.8} />
      </mesh>

      {/* East fence (top segment before gate) */}
      <mesh position={[right, fenceHeight / 2, (top + gateZ - gateWidth / 2) / 2]} castShadow receiveShadow>
        <boxGeometry args={[fenceThickness, fenceHeight, Math.max(1, gateZ - gateWidth / 2 - top)]} />
        <meshStandardMaterial color={fenceColor} roughness={0.8} />
      </mesh>

      {/* East fence (bottom segment after gate) */}
      <mesh position={[right, fenceHeight / 2, (bottom + gateZ + gateWidth / 2) / 2]} castShadow receiveShadow>
        <boxGeometry args={[fenceThickness, fenceHeight, Math.max(1, bottom - (gateZ + gateWidth / 2))]} />
        <meshStandardMaterial color={fenceColor} roughness={0.8} />
      </mesh>

      {/* Main Campus Entrance Gate */}
      <group position={[right, 0, gateZ]}>
        {/* Gate Pillars (stone/concrete) */}
        <mesh position={[0, 2.2, -gateWidth / 2]} castShadow receiveShadow>
          <boxGeometry args={[2.2, 4.4, 2.2]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.7} />
        </mesh>
        <mesh position={[0, 2.2, gateWidth / 2]} castShadow receiveShadow>
          <boxGeometry args={[2.2, 4.4, 2.2]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.7} />
        </mesh>

        {/* Gate Beam Overhead */}
        <mesh position={[0, 4.4, 0]} castShadow receiveShadow>
          <boxGeometry args={[3.2, 0.6, gateWidth + 2.5]} />
          <meshStandardMaterial color="#1e293b" roughness={0.6} />
        </mesh>

        {/* Sloped Canopy */}
        <mesh position={[0, 4.9, 0]} castShadow receiveShadow rotation={[0, 0, Math.PI / 10]}>
          <boxGeometry args={[3.4, 0.25, gateWidth + 2.8]} />
          <meshStandardMaterial color="#0284c7" metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh position={[0, 4.9, 0]} castShadow receiveShadow rotation={[0, 0, -Math.PI / 10]}>
          <boxGeometry args={[3.4, 0.25, gateWidth + 2.8]} />
          <meshStandardMaterial color="#0284c7" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
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
};

/**
 * Ground terrain base, perimeter enclosures, and landscape surfaces (roads, turf, courts, paths).
 */
export function ContextLayer({ geometry, tuning }: { geometry: CampusGeometry; tuning?: ContextTuning }) {
  const { min, max } = geometry.bounds;
  const margin = 120;
  const width = max[0] - min[0] + margin * 2;
  const depth = max[1] - min[1] + margin * 2;

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
      {/* Base ground terrain (warm light pavement / soil) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={groundCenter}
        receiveShadow
        raycast={() => null}
      >
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={tuning?.groundColor ?? '#cbd5e1'} roughness={0.95} />
      </mesh>

      {/* Perimeter fence and gate */}
      <PerimeterFenceAndGate geometry={geometry} />

      {/* Context landscape layers (roads, lawns, sports tracks, pitches) */}
      {geometry.context.map((f) =>
        f.kind === 'structure' ? (
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
        ) : (
          <ExtrudedFootprint
            key={f.id}
            footprint={f.footprint}
            bottom={flatLayerElevation[f.kind] ?? 0.02}
            height={0.025}
            color={getColor(f.kind)}
            interactive={false}
            receiveShadow
          />
        ),
      )}
    </group>
  );
}
