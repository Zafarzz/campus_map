import { mapConfig } from '../../config/mapConfig';
import type { CampusGeometry, ContextFeatureKind } from '../../domain/geometry/types';
import { ExtrudedFootprint } from './ExtrudedFootprint';
import * as THREE from 'three';
import { useMemo } from 'react';

const flatLayer: Record<ContextFeatureKind, number> = {
  road: 0.02,
  lawn: 0.04,
  track: 0.06,
  pitch: 0.08,
  court: 0.08,
  structure: 0,
};

function Fence({ geometry }: { geometry: CampusGeometry }) {
  const { min, max } = geometry.bounds;
  // Create a perimeter fence with a gap for the entrance
  
  // Find B block and F block to calculate the gap
  const bldB = geometry.buildings['bld-g']; // B Block
  const bldF = geometry.buildings['bld-d']; // F Block
  
  let gateZ = (max[1] + min[1]) / 2; // default center
  let gateX = max[0]; // east side
  
  if (bldB && bldF) {
    gateZ = (bldB.center[2] + bldF.center[2]) / 2;
  }
  
  const gateWidth = 15;
  const fenceHeight = 1.5;
  const fenceThickness = 0.5;
  const fenceColor = '#475569';
  
  // Perimeter coordinates
  const left = min[0] - 20;
  const right = max[0] + 10;
  const top = min[1] - 20;
  const bottom = max[1] + 20;
  
  return (
    <group>
      {/* North fence */}
      <mesh position={[(left + right)/2, fenceHeight/2, top]} castShadow receiveShadow>
        <boxGeometry args={[right - left, fenceHeight, fenceThickness]} />
        <meshStandardMaterial color={fenceColor} roughness={0.8} />
      </mesh>
      {/* South fence */}
      <mesh position={[(left + right)/2, fenceHeight/2, bottom]} castShadow receiveShadow>
        <boxGeometry args={[right - left, fenceHeight, fenceThickness]} />
        <meshStandardMaterial color={fenceColor} roughness={0.8} />
      </mesh>
      {/* West fence */}
      <mesh position={[left, fenceHeight/2, (top + bottom)/2]} castShadow receiveShadow>
        <boxGeometry args={[fenceThickness, fenceHeight, bottom - top]} />
        <meshStandardMaterial color={fenceColor} roughness={0.8} />
      </mesh>
      
      {/* East fence (with gate) */}
      <mesh position={[right, fenceHeight/2, (top + gateZ - gateWidth/2)/2]} castShadow receiveShadow>
        <boxGeometry args={[fenceThickness, fenceHeight, gateZ - gateWidth/2 - top]} />
        <meshStandardMaterial color={fenceColor} roughness={0.8} />
      </mesh>
      <mesh position={[right, fenceHeight/2, (bottom + gateZ + gateWidth/2)/2]} castShadow receiveShadow>
        <boxGeometry args={[fenceThickness, fenceHeight, bottom - (gateZ + gateWidth/2)]} />
        <meshStandardMaterial color={fenceColor} roughness={0.8} />
      </mesh>
      
      {/* Entrance Gate */}
      <group position={[right, 0, gateZ]}>
        {/* Gate Pillars */}
        <mesh position={[0, 2, -gateWidth/2]} castShadow receiveShadow>
          <boxGeometry args={[2, 4, 2]} />
          <meshStandardMaterial color="#cbd5e1" />
        </mesh>
        <mesh position={[0, 2, gateWidth/2]} castShadow receiveShadow>
          <boxGeometry args={[2, 4, 2]} />
          <meshStandardMaterial color="#cbd5e1" />
        </mesh>
        {/* Gate Roof */}
        <mesh position={[0, 4.2, 0]} castShadow receiveShadow>
          <boxGeometry args={[3, 0.5, gateWidth + 2]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
        <mesh position={[0, 4.7, 0]} castShadow receiveShadow rotation={[0, 0, Math.PI/8]}>
          <boxGeometry args={[3.2, 0.2, gateWidth + 2.2]} />
          <meshStandardMaterial color="#0ea5e9" metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh position={[0, 4.7, 0]} castShadow receiveShadow rotation={[0, 0, -Math.PI/8]}>
          <boxGeometry args={[3.2, 0.2, gateWidth + 2.2]} />
          <meshStandardMaterial color="#0ea5e9" metalness={0.5} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

/** Ground plane + non-interactive surroundings. */
export function ContextLayer({ geometry }: { geometry: CampusGeometry }) {
  const { min, max } = geometry.bounds;
  const margin = 100;
  const width = max[0] - min[0] + margin * 2;
  const depth = max[1] - min[1] + margin * 2;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(min[0] + max[0]) / 2, -0.1, (min[1] + max[1]) / 2]} receiveShadow raycast={() => null}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#cbd5e1" roughness={1} />
      </mesh>
      
      <Fence geometry={geometry} />

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
            bottom={flatLayer[f.kind]}
            height={0.02}
            color={mapConfig.colors.context[f.kind]}
            interactive={false}
            receiveShadow
          />
        ),
      )}
    </group>
  );
}
