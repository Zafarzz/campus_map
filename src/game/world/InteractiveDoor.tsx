import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { registerInteractable, unregisterInteractable } from '../interaction/InteractionRaycaster';

interface InteractiveDoorProps {
  id: string;
  position: [number, number, number];
  rotationY?: number;
  width?: number;
  height?: number;
  thickness?: number;
  openAngle?: number; // radians (default: Math.PI / 2)
  doubleDoor?: boolean;
}

/**
 * Interactive Door with physical hinge rotation, smooth damping, and dynamic Rapier colliders.
 * Automatically registers with InteractionRaycaster so players can toggle via [E].
 */
export function InteractiveDoor({
  id,
  position,
  rotationY = 0,
  width = 1.0,
  height = 2.2,
  thickness = 0.08,
  openAngle = Math.PI * 0.48,
  doubleDoor = false,
}: InteractiveDoorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const currentAngleRef = useRef(0);
  const doorLeafGroupRef = useRef<THREE.Group>(null);
  const secondLeafGroupRef = useRef<THREE.Group>(null);

  const toggle = () => {
    setIsOpen((prev) => !prev);
  };

  useEffect(() => {
    registerInteractable({
      id,
      type: 'door',
      position: [position[0], position[1] + height / 2, position[2]],
      maxDistance: 3.8,
      isOpen,
      prompt: (open) => (open ? 'Нажмите E, чтобы закрыть дверь' : 'Нажмите E, чтобы открыть дверь'),
      onInteract: toggle,
    });
    return () => {
      unregisterInteractable(id);
    };
  }, [id, position, height, isOpen]);

  // Smooth animation of the door leaf swinging around the hinge
  useFrame((_, delta) => {
    const targetAngle = isOpen ? openAngle : 0;
    currentAngleRef.current = THREE.MathUtils.damp(
      currentAngleRef.current,
      targetAngle,
      8,
      Math.min(delta, 0.1),
    );

    if (doorLeafGroupRef.current) {
      doorLeafGroupRef.current.rotation.y = currentAngleRef.current;
    }
    if (secondLeafGroupRef.current) {
      secondLeafGroupRef.current.rotation.y = -currentAngleRef.current;
    }
  });

  const leafWidth = doubleDoor ? width / 2 : width;
  const halfLeafW = leafWidth / 2;

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* 1. Door Frame Header & Jambs */}
      <mesh position={[0, height + 0.05, 0]}>
        <boxGeometry args={[width + 0.14, 0.1, thickness + 0.04]} />
        <meshStandardMaterial color="#334155" roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[-width / 2 - 0.035, height / 2, 0]}>
        <boxGeometry args={[0.07, height, thickness + 0.04]} />
        <meshStandardMaterial color="#334155" roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[width / 2 + 0.035, height / 2, 0]}>
        <boxGeometry args={[0.07, height, thickness + 0.04]} />
        <meshStandardMaterial color="#334155" roughness={0.4} metalness={0.6} />
      </mesh>

      {/* 2. Main Leaf (Hinged at left: X = -width/2) */}
      <group position={[-width / 2, 0, 0]} ref={doorLeafGroupRef}>
        {/* Door Leaf geometry offset so hinge is at local origin */}
        <mesh position={[halfLeafW, height / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[leafWidth, height, thickness]} />
          <meshStandardMaterial color="#78350f" roughness={0.7} metalness={0.1} />
        </mesh>
        {/* Glass Vision Panel */}
        <mesh position={[halfLeafW, height * 0.65, 0]}>
          <boxGeometry args={[leafWidth * 0.5, height * 0.35, thickness + 0.01]} />
          <meshStandardMaterial color="#0284c7" roughness={0.1} metalness={0.2} transparent opacity={0.6} />
        </mesh>
        {/* Door Handle */}
        <mesh position={[leafWidth - 0.1, 1.0, thickness / 2 + 0.04]}>
          <boxGeometry args={[0.04, 0.14, 0.05]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.2} metalness={0.85} />
        </mesh>
      </group>

      {/* 3. Second Leaf (if doubleDoor, Hinged at right: X = width/2) */}
      {doubleDoor && (
        <group position={[width / 2, 0, 0]} ref={secondLeafGroupRef}>
          <mesh position={[-halfLeafW, height / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[leafWidth, height, thickness]} />
            <meshStandardMaterial color="#78350f" roughness={0.7} metalness={0.1} />
          </mesh>
          <mesh position={[-halfLeafW, height * 0.65, 0]}>
            <boxGeometry args={[leafWidth * 0.5, height * 0.35, thickness + 0.01]} />
            <meshStandardMaterial color="#0284c7" roughness={0.1} metalness={0.2} transparent opacity={0.6} />
          </mesh>
          <mesh position={[-leafWidth + 0.1, 1.0, thickness / 2 + 0.04]}>
            <boxGeometry args={[0.04, 0.14, 0.05]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.2} metalness={0.85} />
          </mesh>
        </group>
      )}

      {/* Dynamic Collider: When door is closed, block passageway; when open, allow passage */}
      {!isOpen && (
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider
            position={[0, height / 2, 0]}
            args={[width / 2, height / 2, thickness / 2 + 0.05]}
            friction={0.2}
          />
        </RigidBody>
      )}
    </group>
  );
}
