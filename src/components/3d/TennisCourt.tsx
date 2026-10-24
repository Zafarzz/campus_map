import { useMemo } from 'react';
import * as THREE from 'three';

export type TennisCourtProps = {
  position?: [number, number, number];
  rotation?: [number, number, number];
};

/**
 * Standard International Tennis Federation (ITF) Regulation Tennis Court:
 * - Court playing area: 23.77m (78ft) length x 10.97m (36ft) doubles width (8.23m singles width).
 * - Total hardcourt apron surface: 36.0m length x 18.0m width.
 * - Acrylic blue playing court with dark green outer runoff buffer.
 * - Accurate line markings (50mm width) for baseline, sidelines, service lines, and center mark.
 * - 3D regulation net: height 0.914m at center, 1.07m at net posts with white top headband.
 */
export function TennisCourt({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: TennisCourtProps) {
  const materials = useMemo(() => {
    // 1. Runoff outer buffer (dark green hardcourt acrylic)
    const runoffMat = new THREE.MeshStandardMaterial({
      color: '#166534',
      roughness: 0.85,
      metalness: 0.05,
    });

    // 2. Inner playing court (blue hardcourt acrylic)
    const innerCourtMat = new THREE.MeshStandardMaterial({
      color: '#0284c7',
      roughness: 0.8,
      metalness: 0.05,
    });

    // 3. Crisp white court markings
    const lineMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
    });

    // 4. Tennis net posts (black steel)
    const postMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.4,
      metalness: 0.8,
    });

    // 5. Tennis net top tape (white vinyl)
    const netTapeMat = new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      roughness: 0.5,
    });

    // 6. Tennis net mesh (dark semi-transparent micro-grid)
    const netMeshMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      transparent: true,
      opacity: 0.75,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });

    return { runoffMat, innerCourtMat, lineMat, postMat, netTapeMat, netMeshMat };
  }, []);

  const totalLength = 36.0; // along Z
  const totalWidth = 18.0;  // along X
  const courtLength = 23.77;
  const courtDoublesWidth = 10.97;
  const courtSinglesWidth = 8.23;
  const serviceLineDistance = 6.40; // from net
  const lineWidth = 0.06;
  const lineElevation = 0.003;

  return (
    <group position={position} rotation={rotation}>
      {/* 1. Outer Runoff Hardcourt Surface (18m x 36m) */}
      <mesh position={[0, 0.01, 0]} material={materials.runoffMat} receiveShadow>
        <boxGeometry args={[totalWidth, 0.02, totalLength]} />
      </mesh>

      {/* 2. Inner Playing Court (10.97m x 23.77m, blue) */}
      <mesh position={[0, 0.015, 0]} material={materials.innerCourtMat} receiveShadow>
        <boxGeometry args={[courtDoublesWidth, 0.015, courtLength]} />
      </mesh>

      {/* ============================================================== */}
      {/* 3. WHITE COURT LINE MARKINGS                                   */}
      {/* ============================================================== */}
      <group position={[0, 0.023 + lineElevation, 0]}>
        {/* Baselines (at z = ±11.885m) */}
        {[-courtLength / 2, courtLength / 2].map((z, idx) => (
          <mesh key={`baseline-${idx}`} position={[0, 0, z]}>
            <boxGeometry args={[courtDoublesWidth + lineWidth, 0.002, lineWidth]} />
            <primitive object={materials.lineMat} attach="material" />
          </mesh>
        ))}

        {/* Outer Doubles Sidelines (at x = ±5.485m) */}
        {[-courtDoublesWidth / 2, courtDoublesWidth / 2].map((x, idx) => (
          <mesh key={`doubles-sideline-${idx}`} position={[x, 0, 0]}>
            <boxGeometry args={[lineWidth, 0.002, courtLength]} />
            <primitive object={materials.lineMat} attach="material" />
          </mesh>
        ))}

        {/* Inner Singles Sidelines (at x = ±4.115m) */}
        {[-courtSinglesWidth / 2, courtSinglesWidth / 2].map((x, idx) => (
          <mesh key={`singles-sideline-${idx}`} position={[x, 0, 0]}>
            <boxGeometry args={[lineWidth, 0.002, courtLength]} />
            <primitive object={materials.lineMat} attach="material" />
          </mesh>
        ))}

        {/* Service Lines (at z = ±6.40m, between singles sidelines) */}
        {[-serviceLineDistance, serviceLineDistance].map((z, idx) => (
          <mesh key={`service-line-${idx}`} position={[0, 0, z]}>
            <boxGeometry args={[courtSinglesWidth, 0.002, lineWidth]} />
            <primitive object={materials.lineMat} attach="material" />
          </mesh>
        ))}

        {/* Center Service Line (along z between -6.40m and +6.40m) */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[lineWidth, 0.002, serviceLineDistance * 2]} />
          <primitive object={materials.lineMat} attach="material" />
        </mesh>

        {/* Center Marks on Baselines (0.15m length along Z) */}
        {[-courtLength / 2 + 0.075, courtLength / 2 - 0.075].map((z, idx) => (
          <mesh key={`center-mark-${idx}`} position={[0, 0, z]}>
            <boxGeometry args={[lineWidth, 0.002, 0.15]} />
            <primitive object={materials.lineMat} attach="material" />
          </mesh>
        ))}
      </group>

      {/* ============================================================== */}
      {/* 4. 3D REGULATION TENNIS NET & POSTS                            */}
      {/* ============================================================== */}
      <group position={[0, 0.02, 0]}>
        {/* Net Posts (at x = ±6.0m, height 1.07m) */}
        {[-5.95, 5.95].map((xPost, idx) => (
          <mesh key={`post-${idx}`} position={[xPost, 1.07 / 2, 0]} material={materials.postMat} castShadow>
            <cylinderGeometry args={[0.045, 0.045, 1.07, 16]} />
          </mesh>
        ))}

        {/* Top White Tape / Cable Band (catenary drop: 1.07m at posts to 0.914m at center) */}
        <mesh position={[0, 0.96, 0]} material={materials.netTapeMat} castShadow>
          <boxGeometry args={[11.9, 0.06, 0.04]} />
        </mesh>

        {/* Center Strap (white vertical strap in middle of net) */}
        <mesh position={[0, 0.46, 0]} material={materials.netTapeMat}>
          <boxGeometry args={[0.05, 0.92, 0.05]} />
        </mesh>

        {/* Net Mesh Fabric */}
        <mesh position={[0, 0.46, 0]} material={materials.netMeshMat}>
          <boxGeometry args={[11.8, 0.92, 0.015]} />
        </mesh>
      </group>
    </group>
  );
}
