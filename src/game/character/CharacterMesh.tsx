import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

export interface CharacterMeshProps {
  shirtColor?: string;
  pantsColor?: string;
  skinColor?: string;
  hairColor?: string;
  hairStyle?: 'short' | 'long' | 'medium';
  isMoving?: boolean;
  speed?: number; // 0.0 to 1.0
  scale?: number;
}

/**
 * Modular low-poly stylized character representation:
 * Torso, head, hair, left/right arms and legs with harmonic walk-cycle animations.
 * Lightweight, zero external binary/CDN dependency.
 */
export function CharacterMesh({
  shirtColor = '#2563eb',
  pantsColor = '#1e293b',
  skinColor = '#fed7aa',
  hairColor = '#451a03',
  hairStyle = 'short',
  isMoving = false,
  speed = 1.0,
  scale = 1.0,
}: CharacterMeshProps) {
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const animTimeRef = useRef(0);

  const materials = useMemo(() => {
    return {
      shirt: new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.7 }),
      pants: new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.8 }),
      skin: new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.5 }),
      hair: new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.85 }),
      shoes: new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.9 }),
    };
  }, [shirtColor, pantsColor, skinColor, hairColor]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    if (isMoving) {
      animTimeRef.current += dt * speed * 7.5;
      const swing = Math.sin(animTimeRef.current);

      if (leftLegRef.current) leftLegRef.current.rotation.x = swing * 0.55;
      if (rightLegRef.current) rightLegRef.current.rotation.x = -swing * 0.55;
      if (leftArmRef.current) leftArmRef.current.rotation.x = -swing * 0.45;
      if (rightArmRef.current) rightArmRef.current.rotation.x = swing * 0.45;
      if (headRef.current) headRef.current.position.y = 1.48 + Math.abs(swing) * 0.02;
    } else {
      // Gentle idle breathing
      animTimeRef.current += dt * 1.5;
      const breath = Math.sin(animTimeRef.current) * 0.015;
      if (leftLegRef.current) leftLegRef.current.rotation.x = 0;
      if (rightLegRef.current) rightLegRef.current.rotation.x = 0;
      if (leftArmRef.current) leftArmRef.current.rotation.x = breath;
      if (rightArmRef.current) rightArmRef.current.rotation.x = -breath;
      if (headRef.current) headRef.current.position.y = 1.48 + breath;
    }
  });

  return (
    <group scale={scale}>
      {/* 1. Torso & Pelvis */}
      <mesh position={[0, 1.08, 0]} material={materials.shirt} castShadow receiveShadow>
        <boxGeometry args={[0.38, 0.52, 0.22]} />
      </mesh>
      <mesh position={[0, 0.8, 0]} material={materials.pants} castShadow>
        <boxGeometry args={[0.36, 0.14, 0.21]} />
      </mesh>

      {/* 2. Head, Face & Hair */}
      <group position={[0, 1.48, 0]} ref={headRef}>
        {/* Head */}
        <mesh material={materials.skin} castShadow>
          <boxGeometry args={[0.22, 0.24, 0.22]} />
        </mesh>
        {/* Hair */}
        <mesh position={[0, 0.11, -0.01]} material={materials.hair}>
          <boxGeometry args={[0.24, hairStyle === 'long' ? 0.22 : 0.12, 0.24]} />
        </mesh>
        {/* Simple stylized eyes */}
        <mesh position={[-0.05, 0.02, 0.115]}>
          <boxGeometry args={[0.03, 0.02, 0.01]} />
          <meshBasicMaterial color="#0f172a" />
        </mesh>
        <mesh position={[0.05, 0.02, 0.115]}>
          <boxGeometry args={[0.03, 0.02, 0.01]} />
          <meshBasicMaterial color="#0f172a" />
        </mesh>
      </group>

      {/* 3. Left Leg (Pivoted at hip: Y = 0.74, X = -0.1) */}
      <group position={[-0.1, 0.74, 0]} ref={leftLegRef}>
        <mesh position={[0, -0.34, 0]} material={materials.pants} castShadow>
          <boxGeometry args={[0.14, 0.68, 0.16]} />
        </mesh>
        <mesh position={[0, -0.7, 0.03]} material={materials.shoes}>
          <boxGeometry args={[0.13, 0.09, 0.22]} />
        </mesh>
      </group>

      {/* 4. Right Leg (Pivoted at hip: Y = 0.74, X = 0.1) */}
      <group position={[0.1, 0.74, 0]} ref={rightLegRef}>
        <mesh position={[0, -0.34, 0]} material={materials.pants} castShadow>
          <boxGeometry args={[0.14, 0.68, 0.16]} />
        </mesh>
        <mesh position={[0, -0.7, 0.03]} material={materials.shoes}>
          <boxGeometry args={[0.13, 0.09, 0.22]} />
        </mesh>
      </group>

      {/* 5. Left Arm (Pivoted at shoulder: Y = 1.3, X = -0.24) */}
      <group position={[-0.24, 1.3, 0]} ref={leftArmRef}>
        <mesh position={[0, -0.26, 0]} material={materials.shirt} castShadow>
          <boxGeometry args={[0.1, 0.52, 0.12]} />
        </mesh>
        <mesh position={[0, -0.55, 0]} material={materials.skin}>
          <boxGeometry args={[0.08, 0.12, 0.09]} />
        </mesh>
      </group>

      {/* 6. Right Arm (Pivoted at shoulder: Y = 1.3, X = 0.24) */}
      <group position={[0.24, 1.3, 0]} ref={rightArmRef}>
        <mesh position={[0, -0.26, 0]} material={materials.shirt} castShadow>
          <boxGeometry args={[0.1, 0.52, 0.12]} />
        </mesh>
        <mesh position={[0, -0.55, 0]} material={materials.skin}>
          <boxGeometry args={[0.08, 0.12, 0.09]} />
        </mesh>
      </group>
    </group>
  );
}
