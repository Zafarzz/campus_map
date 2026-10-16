import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { PlayerTransformState } from '../config/gameConfig';
import type { WayfindingTarget } from '../ui/Minimap';

type Props = {
  playerTransformRef: MutableRefObject<PlayerTransformState>;
  target: WayfindingTarget | null;
};

const MARKER_RING_COUNT = 16;

/**
 * 3D glowing wayfinding trail and destination beacon.
 * Updates marker positions in useFrame without causing React re-renders.
 */
export function WayfindingPath({ playerTransformRef, target }: Props) {
  const dotsRef = useRef<THREE.InstancedMesh | null>(null);
  const beaconRef = useRef<THREE.Mesh | null>(null);
  const ringRef = useRef<THREE.Mesh | null>(null);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const dotGeo = useMemo(() => new THREE.SphereGeometry(0.28, 10, 10), []);
  const dotMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#38bdf8',
        emissive: '#0284c7',
        emissiveIntensity: 1.4,
        roughness: 0.2,
      }),
    [],
  );

  useFrame((state) => {
    if (!target || !dotsRef.current) return;

    const t = state.clock.getElapsedTime();
    const { x: px, z: pz } = playerTransformRef.current;
    const [tx, ty, tz] = target.position;

    // Animate 16 glowing breadcrumbs along the path from player to target
    for (let i = 0; i < MARKER_RING_COUNT; i++) {
      const frac = ((i / MARKER_RING_COUNT) + (t * 0.35) % (1 / MARKER_RING_COUNT));
      const clampedFrac = Math.min(0.98, Math.max(0.04, frac));
      const x = THREE.MathUtils.lerp(px, tx, clampedFrac);
      const z = THREE.MathUtils.lerp(pz, tz, clampedFrac);
      const y = 0.35 + Math.sin(t * 4 + i * 0.6) * 0.08;
      const scale = 0.8 + Math.sin(t * 5 + i) * 0.2;

      dummy.position.set(x, y, z);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      dotsRef.current.setMatrixAt(i, dummy.matrix);
    }
    dotsRef.current.instanceMatrix.needsUpdate = true;

    if (beaconRef.current) {
      beaconRef.current.position.set(tx, Math.max(2.5, ty + 2.5) + Math.sin(t * 3) * 0.3, tz);
      beaconRef.current.rotation.y = t * 1.5;
    }
    if (ringRef.current) {
      ringRef.current.position.set(tx, 0.15, tz);
      const pulse = 1 + Math.sin(t * 3.5) * 0.15;
      ringRef.current.scale.set(pulse, pulse, 1);
    }
  });

  if (!target) return null;

  return (
    <group>
      <instancedMesh
        ref={dotsRef}
        args={[dotGeo, dotMat, MARKER_RING_COUNT]}
        frustumCulled={false}
      />

      {/* Floating 3D Target Diamond Beacon */}
      <mesh ref={beaconRef} position={target.position}>
        <octahedronGeometry args={[0.85, 0]} />
        <meshStandardMaterial
          color="#38bdf8"
          emissive="#0ea5e9"
          emissiveIntensity={1.6}
          roughness={0.15}
          metalness={0.3}
        />
      </mesh>

      {/* Ground Target Ring */}
      <mesh ref={ringRef} position={[target.position[0], 0.15, target.position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.4, 1.9, 28]} />
        <meshBasicMaterial color="#38bdf8" side={THREE.DoubleSide} transparent opacity={0.8} />
      </mesh>
    </group>
  );
}
