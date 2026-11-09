import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import { mapConfig } from '../../config/mapConfig';

export type LobbyInteriorProps = {
  position: [number, number, number];
  size: [number, number, number];
  selected?: boolean;
  label?: string;
};

/**
 * Open, spacious 3D architectural lobby / foyer (B-Lobby, E-Lobby).
 * Completely free of student classroom booths, desks, chalkboards, and lecterns.
 * Open central double-height space that complements BlockCorridor3D's structural
 * columns, pedestals, and dual staircases.
 */
export function LobbyInterior3D({ position, size, selected }: LobbyInteriorProps) {
  const [w, h, d] = size;

  const materials = useMemo(() => {
    return {
      floor: new THREE.MeshStandardMaterial({
        color: '#f8fafc',
        roughness: 0.18,
        metalness: 0.05,
      }),
      soffit: new THREE.MeshStandardMaterial({
        color: '#e2e8f0',
        roughness: 0.4,
      }),
    };
  }, []);

  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);

  return (
    <group position={position}>
      {/* Invisible clickable raycast volume so entire lobby volume is selectable */}
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      {/* Clean polished lobby floor plate (subtle elevation just above corridor slab) */}
      <mesh position={[0, 0.015, 0]} receiveShadow>
        <boxGeometry args={[Math.max(0.1, w - 0.04), 0.03, Math.max(0.1, d - 0.04)]} />
        <primitive object={materials.floor} attach="material" />
      </mesh>

      {/* Subtle modern perimeter ceiling soffit at top edge */}
      <mesh position={[0, h - 0.04, 0]}>
        <boxGeometry args={[w, 0.08, d]} />
        <primitive object={materials.soffit} attach="material" />
      </mesh>

      {/* Selection highlight wireframe when active */}
      {selected && (
        <mesh position={[0, h / 2, 0]}>
          <boxGeometry args={[w, h, d]} />
          <meshBasicMaterial visible={false} />
          <Edges color={mapConfig.colors.roomSelected} lineWidth={3} />
        </mesh>
      )}
    </group>
  );
}
