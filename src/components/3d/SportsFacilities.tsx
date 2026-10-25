import { useMemo } from 'react';
import * as THREE from 'three';
import { getSportsMeshTexture } from './facades/facadeTextures';

/**
 * 3D Sports Perimeter Mesh Fence Enclosure (сетчатые стены высотой 5.8м)
 * Real-world sports ball-stop chain-link mesh fencing with steel tubular posts and tension rails.
 */
function SportsMeshEnclosure({
  width,
  depth,
  height = 5.8,
}: {
  width: number;
  depth: number;
  height?: number;
}) {
  const meshTexture = useMemo(() => {
    const tex = getSportsMeshTexture();
    if (tex) {
      const cloned = tex.clone();
      cloned.wrapS = THREE.RepeatWrapping;
      cloned.wrapT = THREE.RepeatWrapping;
      cloned.repeat.set(Math.max(1, width / 1.4), Math.max(1, height / 1.2));
      return cloned;
    }
    return null;
  }, [width, height]);

  const { postMat, wireMeshMat, railMat } = useMemo(() => {
    const postMat = new THREE.MeshStandardMaterial({
      color: '#334155', // RAL 7024 graphite steel
      roughness: 0.4,
      metalness: 0.7,
    });
    const railMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.4,
      metalness: 0.8,
    });
    const wireMeshMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      map: meshTexture ?? undefined,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    return { postMat, wireMeshMat, railMat };
  }, [meshTexture]);

  // Posts along perimeter
  const posts = useMemo(() => {
    const list: [number, number][] = [];
    const step = 3.5;
    const nx = Math.max(2, Math.round(width / step));
    for (let i = 0; i <= nx; i++) {
      const x = -width / 2 + (i * width) / nx;
      list.push([x, -depth / 2]);
      list.push([x, depth / 2]);
    }
    const nz = Math.max(2, Math.round(depth / step));
    for (let j = 1; j < nz; j++) {
      const z = -depth / 2 + (j * depth) / nz;
      list.push([-width / 2, z]);
      list.push([width / 2, z]);
    }
    return list;
  }, [width, depth]);

  const midY = height / 2;

  return (
    <group position={[0, 0, 0]}>
      {/* Vertical tubular posts */}
      {posts.map(([px, pz], idx) => (
        <mesh key={`mesh-post-${idx}`} position={[px, height / 2, pz]} material={postMat} castShadow>
          <cylinderGeometry args={[0.045, 0.045, height, 8]} />
        </mesh>
      ))}

      {/* Top Rail at height (5.8m) */}
      <mesh position={[0, height, -depth / 2]} rotation={[0, 0, Math.PI / 2]} material={railMat}>
        <cylinderGeometry args={[0.035, 0.035, width, 8]} />
      </mesh>
      <mesh position={[0, height, depth / 2]} rotation={[0, 0, Math.PI / 2]} material={railMat}>
        <cylinderGeometry args={[0.035, 0.035, width, 8]} />
      </mesh>
      <mesh position={[-width / 2, height, 0]} rotation={[Math.PI / 2, 0, 0]} material={railMat}>
        <cylinderGeometry args={[0.035, 0.035, depth, 8]} />
      </mesh>
      <mesh position={[width / 2, height, 0]} rotation={[Math.PI / 2, 0, 0]} material={railMat}>
        <cylinderGeometry args={[0.035, 0.035, depth, 8]} />
      </mesh>

      {/* Mid Tension Rail at height / 2 (2.9m) */}
      <mesh position={[0, midY, -depth / 2]} rotation={[0, 0, Math.PI / 2]} material={railMat}>
        <cylinderGeometry args={[0.02, 0.02, width, 8]} />
      </mesh>
      <mesh position={[0, midY, depth / 2]} rotation={[0, 0, Math.PI / 2]} material={railMat}>
        <cylinderGeometry args={[0.02, 0.02, width, 8]} />
      </mesh>
      <mesh position={[-width / 2, midY, 0]} rotation={[Math.PI / 2, 0, 0]} material={railMat}>
        <cylinderGeometry args={[0.02, 0.02, depth, 8]} />
      </mesh>
      <mesh position={[width / 2, midY, 0]} rotation={[Math.PI / 2, 0, 0]} material={railMat}>
        <cylinderGeometry args={[0.02, 0.02, depth, 8]} />
      </mesh>

      {/* Wire mesh wall planes */}
      <mesh position={[0, height / 2, -depth / 2]} material={wireMeshMat}>
        <planeGeometry args={[width, height]} />
      </mesh>
      <mesh position={[0, height / 2, depth / 2]} material={wireMeshMat}>
        <planeGeometry args={[width, height]} />
      </mesh>
      <mesh position={[-width / 2, height / 2, 0]} rotation={[0, Math.PI / 2, 0]} material={wireMeshMat}>
        <planeGeometry args={[depth, height]} />
      </mesh>
      <mesh position={[width / 2, height / 2, 0]} rotation={[0, Math.PI / 2, 0]} material={wireMeshMat}>
        <planeGeometry args={[depth, height]} />
      </mesh>
    </group>
  );
}

/**
 * 3D Soccer Goal with white tubular posts, crossbar, angled rear stays, and net mesh.
 */
function SoccerGoal({
  position,
  rotationY,
  goalWidth = 5.0,
  goalHeight = 2.1,
  goalDepth = 1.6,
}: {
  position: [number, number, number];
  rotationY: number;
  goalWidth?: number;
  goalHeight?: number;
  goalDepth?: number;
}) {
  const postMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.25,
        metalness: 0.8,
      }),
    [],
  );

  const netMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#f8fafc',
        roughness: 0.9,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      }),
    [],
  );

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Left Post */}
      <mesh position={[-goalWidth / 2, goalHeight / 2, 0]} material={postMat} castShadow>
        <cylinderGeometry args={[0.06, 0.06, goalHeight, 12]} />
      </mesh>
      {/* Right Post */}
      <mesh position={[goalWidth / 2, goalHeight / 2, 0]} material={postMat} castShadow>
        <cylinderGeometry args={[0.06, 0.06, goalHeight, 12]} />
      </mesh>
      {/* Crossbar */}
      <mesh
        position={[0, goalHeight, 0]}
        rotation={[0, 0, Math.PI / 2]}
        material={postMat}
        castShadow
      >
        <cylinderGeometry args={[0.06, 0.06, goalWidth + 0.12, 12]} />
      </mesh>

      {/* Rear ground frame */}
      <mesh position={[-goalWidth / 2, 0.03, -goalDepth / 2]} material={postMat}>
        <boxGeometry args={[0.06, 0.06, goalDepth]} />
      </mesh>
      <mesh position={[goalWidth / 2, 0.03, -goalDepth / 2]} material={postMat}>
        <boxGeometry args={[0.06, 0.06, goalDepth]} />
      </mesh>
      <mesh position={[0, 0.03, -goalDepth]} material={postMat}>
        <boxGeometry args={[goalWidth, 0.06, 0.06]} />
      </mesh>

      {/* Rear angled stanchion stays */}
      <mesh
        position={[-goalWidth / 2, goalHeight / 2, -goalDepth / 2]}
        rotation={[Math.atan2(goalDepth, goalHeight), 0, 0]}
        material={postMat}
      >
        <cylinderGeometry
          args={[0.04, 0.04, Math.hypot(goalHeight, goalDepth), 8]}
        />
      </mesh>
      <mesh
        position={[goalWidth / 2, goalHeight / 2, -goalDepth / 2]}
        rotation={[Math.atan2(goalDepth, goalHeight), 0, 0]}
        material={postMat}
      >
        <cylinderGeometry
          args={[0.04, 0.04, Math.hypot(goalHeight, goalDepth), 8]}
        />
      </mesh>

      {/* Net Back Sloped Surface */}
      <mesh
        position={[0, goalHeight / 2, -goalDepth / 2]}
        rotation={[Math.atan2(goalDepth, goalHeight), 0, 0]}
        material={netMat}
      >
        <planeGeometry args={[goalWidth, Math.hypot(goalHeight, goalDepth)]} />
      </mesh>
      {/* Net Sides */}
      <mesh position={[-goalWidth / 2, goalHeight / 2, -goalDepth / 2]} material={netMat}>
        <boxGeometry args={[0.01, goalHeight, goalDepth]} />
      </mesh>
      <mesh position={[goalWidth / 2, goalHeight / 2, -goalDepth / 2]} material={netMat}>
        <boxGeometry args={[0.01, goalHeight, goalDepth]} />
      </mesh>
    </group>
  );
}


/**
 * 3D Regulation Basketball Hoop with steel cantilever post, glass backboard, red rim, and net.
 */
function BasketballHoop({
  position,
  rotationY,
}: {
  position: [number, number, number];
  rotationY: number;
}) {
  const steelMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.4,
        metalness: 0.8,
      }),
    [],
  );

  const backboardMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#e2e8f0',
        roughness: 0.1,
        metalness: 0.9,
        transparent: true,
        opacity: 0.65,
      }),
    [],
  );

  const rimMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ea580c', // International orange
        roughness: 0.3,
        metalness: 0.6,
      }),
    [],
  );

  const netMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.9,
        transparent: true,
        opacity: 0.6,
      }),
    [],
  );

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Heavy Steel Vertical Mast */}
      <mesh position={[0, 1.9, -1.2]} material={steelMat} castShadow>
        <cylinderGeometry args={[0.09, 0.11, 3.8, 12]} />
      </mesh>
      {/* Cantilever Overhang Arm */}
      <mesh
        position={[0, 3.3, -0.6]}
        rotation={[-Math.PI / 4, 0, 0]}
        material={steelMat}
        castShadow
      >
        <boxGeometry args={[0.12, 0.12, 1.4]} />
      </mesh>
      {/* Horizontal backboard mount */}
      <mesh position={[0, 3.35, -0.1]} material={steelMat}>
        <boxGeometry args={[0.8, 0.1, 0.2]} />
      </mesh>

      {/* Glass Backboard (1.8m x 1.05m) */}
      <mesh position={[0, 3.4, 0]} material={backboardMat} castShadow>
        <boxGeometry args={[1.8, 1.05, 0.04]} />
      </mesh>
      {/* White regulation target box on backboard */}
      <mesh position={[0, 3.3, 0.022]}>
        <boxGeometry args={[0.59, 0.45, 0.005]} />
        <meshBasicMaterial color="#ffffff" wireframe />
      </mesh>

      {/* Breakaway Rim at 3.05m height */}
      <mesh position={[0, 3.05, 0.3]} rotation={[Math.PI / 2, 0, 0]} material={rimMat} castShadow>
        <torusGeometry args={[0.225, 0.02, 10, 24]} />
      </mesh>

      {/* White Net Cone */}
      <mesh position={[0, 2.85, 0.3]} material={netMat}>
        <cylinderGeometry args={[0.22, 0.12, 0.45, 12, 1, true]} />
      </mesh>
    </group>
  );
}


/**
 * Complete Real-World Sports Facilities Ensembles:
 * - Football / Soccer Pitch with regulation lines, 3D goals, and corner flags.
 * - Basketball Court with multi-colored acrylic, three-point/key lines, and 3D cantilever hoops.
 * - Athletics Stadium with 6-lane track markings, inner football field, and 3D spectator bleachers.
 */
export function SportsFacilities() {
  const lineMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
      }),
    [],
  );

  const basketballLineMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#f8fafc',
      }),
    [],
  );

  const flagMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#dc2626', // Bright red corner flags
        roughness: 0.7,
      }),
    [],
  );

  const flagPoleMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.3,
      }),
    [],
  );

  // Football Pitch: center X = 22.8, Z = 15.9, width = 22.5 (reduced by 25%), depth = 51.0
  const pitchX = 22.8;
  const pitchZ = 15.9;
  const pitchW = 22.5;
  const pitchD = 51.0;

  // Multi-Sport / Tennis Court: center X = 55.5, Z = 15.9, width = 36.0, depth = 51.0 (orange markup extended to West)
  const courtX = 55.5;
  const courtZ = 15.9;
  const apronW = 36.0; // Total hardcourt slab width (extended West towards football pitch per orange markup)
  const apronD = 51.0; // Total hardcourt slab length
  const courtW = 31.0; // Playable court width (leaves 2.5m green border on sides)
  const courtD = 42.0; // Playable court length

  // Grand Football Stadium: shifted West clear of North Building (Dormitory)
  // bld-a wall is at X = -45.45. With stadiumX = -77.0 and stadiumW = 54.0,
  // stadium East edge is at X = -50.0 (4.55m clearance), perfectly aligning
  // with approach walkway from the central campus avenue.
  const stadiumX = -77.0;
  const stadiumZ = -78.6;
  const stadiumW = 54.0;
  const stadiumD = 104.0;
  const stadiumPitchW = 48.0;
  const stadiumPitchD = 96.0;

  return (
    <group>
      {/* ========================================================
          1. REGULATION FOOTBALL / SOCCER PITCH
         ======================================================== */}
      <group position={[pitchX, 0.095, pitchZ]}>
        {/* Natural Green Grass Pitch Turf Slab */}
        <mesh position={[0, -0.015, 0]} receiveShadow>
          <boxGeometry args={[pitchW, 0.02, pitchD]} />
          <meshStandardMaterial color="#15803d" roughness={0.85} />
        </mesh>
        {/* Pitch Perimeter Lines */}
        {/* Left Touchline */}
        <mesh position={[-pitchW / 2 + 0.5, 0.002, 0]}>
          <boxGeometry args={[0.12, 0.002, pitchD - 1.0]} />
          <primitive object={lineMat} attach="material" />
        </mesh>
        {/* Right Touchline */}
        <mesh position={[pitchW / 2 - 0.5, 0.002, 0]}>
          <boxGeometry args={[0.12, 0.002, pitchD - 1.0]} />
          <primitive object={lineMat} attach="material" />
        </mesh>
        {/* Top Goal Line */}
        <mesh position={[0, 0.002, -pitchD / 2 + 0.5]}>
          <boxGeometry args={[pitchW - 1.0, 0.002, 0.12]} />
          <primitive object={lineMat} attach="material" />
        </mesh>
        {/* Bottom Goal Line */}
        <mesh position={[0, 0.002, pitchD / 2 - 0.5]}>
          <boxGeometry args={[pitchW - 1.0, 0.002, 0.12]} />
          <primitive object={lineMat} attach="material" />
        </mesh>

        {/* Halfway Line */}
        <mesh position={[0, 0.002, 0]}>
          <boxGeometry args={[pitchW - 1.0, 0.002, 0.12]} />
          <primitive object={lineMat} attach="material" />
        </mesh>
        {/* Center Circle (Radius 4.5m) */}
        <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[4.44, 4.56, 32]} />
          <primitive object={lineMat} attach="material" />
        </mesh>
        {/* Center Spot */}
        <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.2, 16]} />
          <primitive object={lineMat} attach="material" />
        </mesh>

        {/* North Penalty Area (13m x 6m) */}
        <mesh position={[0, 0.002, -pitchD / 2 + 3.5]}>
          <boxGeometry args={[13.0, 0.002, 0.12]} />
          <primitive object={lineMat} attach="material" />
        </mesh>
        <mesh position={[-6.5, 0.002, -pitchD / 2 + 2.0]}>
          <boxGeometry args={[0.12, 0.002, 3.0]} />
          <primitive object={lineMat} attach="material" />
        </mesh>
        <mesh position={[6.5, 0.002, -pitchD / 2 + 2.0]}>
          <boxGeometry args={[0.12, 0.002, 3.0]} />
          <primitive object={lineMat} attach="material" />
        </mesh>

        {/* South Penalty Area (13m x 6m) */}
        <mesh position={[0, 0.002, pitchD / 2 - 3.5]}>
          <boxGeometry args={[13.0, 0.002, 0.12]} />
          <primitive object={lineMat} attach="material" />
        </mesh>
        <mesh position={[-6.5, 0.002, pitchD / 2 - 2.0]}>
          <boxGeometry args={[0.12, 0.002, 3.0]} />
          <primitive object={lineMat} attach="material" />
        </mesh>
        <mesh position={[6.5, 0.002, pitchD / 2 - 2.0]}>
          <boxGeometry args={[0.12, 0.002, 3.0]} />
          <primitive object={lineMat} attach="material" />
        </mesh>

        {/* 3D Soccer Goals */}
        <SoccerGoal position={[0, 0, -pitchD / 2 + 0.5]} rotationY={0} />
        <SoccerGoal position={[0, 0, pitchD / 2 - 0.5]} rotationY={Math.PI} />

        {/* Corner Flags */}
        {[
          [-pitchW / 2 + 0.5, -pitchD / 2 + 0.5],
          [pitchW / 2 - 0.5, -pitchD / 2 + 0.5],
          [-pitchW / 2 + 0.5, pitchD / 2 - 0.5],
          [pitchW / 2 - 0.5, pitchD / 2 - 0.5],
        ].map(([cx, cz], fIdx) => (
          <group key={`flag-${fIdx}`} position={[cx, 0, cz]}>
            <mesh position={[0, 0.75, 0]} material={flagPoleMat}>
              <cylinderGeometry args={[0.02, 0.02, 1.5, 8]} />
            </mesh>
            <mesh position={[0.16, 1.35, 0]} material={flagMat}>
              <boxGeometry args={[0.32, 0.22, 0.01]} />
            </mesh>
          </group>
        ))}

        {/* 5.8m High Sports Perimeter Ball-Stop Mesh Fence (Сетчатое ограждение +1м) */}
        <SportsMeshEnclosure width={pitchW + 0.6} depth={pitchD + 0.6} height={5.8} />
      </group>

      {/* ========================================================
          2. MULTI-SPORT COURT (Light Concrete Slab, Green Apron, Basketball Hoops)
         ======================================================== */}
      <group position={[courtX, 0.095, courtZ]}>
        {/* Dark Olive-Green Outer Hardcourt Apron */}
        <mesh position={[0, -0.016, 0]} receiveShadow>
          <boxGeometry args={[apronW, 0.018, apronD]} />
          <meshStandardMaterial color="#3d5236" roughness={0.9} />
        </mesh>
        {/* Light Neutral Concrete Playing Court */}
        <mesh position={[0, -0.006, 0]} receiveShadow>
          <boxGeometry args={[courtW, 0.016, courtD]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.78} />
        </mesh>
        {/* Perimeter Court Lines */}
        <mesh position={[-courtW / 2, 0.004, 0]}>
          <boxGeometry args={[0.08, 0.002, courtD]} />
          <primitive object={basketballLineMat} attach="material" />
        </mesh>
        <mesh position={[courtW / 2, 0.004, 0]}>
          <boxGeometry args={[0.08, 0.002, courtD]} />
          <primitive object={basketballLineMat} attach="material" />
        </mesh>
        <mesh position={[0, 0.004, -courtD / 2]}>
          <boxGeometry args={[courtW, 0.002, 0.08]} />
          <primitive object={basketballLineMat} attach="material" />
        </mesh>
        <mesh position={[0, 0.004, courtD / 2]}>
          <boxGeometry args={[courtW, 0.002, 0.08]} />
          <primitive object={basketballLineMat} attach="material" />
        </mesh>

        {/* Center Half-Court Line & Center Circle */}
        <mesh position={[0, 0.004, 0]}>
          <boxGeometry args={[courtW, 0.002, 0.08]} />
          <primitive object={basketballLineMat} attach="material" />
        </mesh>
        <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.75, 1.83, 32]} />
          <primitive object={basketballLineMat} attach="material" />
        </mesh>

        {/* North Key Lane (4.9m x 5.8m) */}
        <mesh position={[0, 0.004, -courtD / 2 + 5.8]}>
          <boxGeometry args={[4.9, 0.002, 0.08]} />
          <primitive object={basketballLineMat} attach="material" />
        </mesh>
        <mesh position={[-2.45, 0.004, -courtD / 2 + 2.9]}>
          <boxGeometry args={[0.08, 0.002, 5.8]} />
          <primitive object={basketballLineMat} attach="material" />
        </mesh>
        <mesh position={[2.45, 0.004, -courtD / 2 + 2.9]}>
          <boxGeometry args={[0.08, 0.002, 5.8]} />
          <primitive object={basketballLineMat} attach="material" />
        </mesh>

        {/* South Key Lane (4.9m x 5.8m) */}
        <mesh position={[0, 0.004, courtD / 2 - 5.8]}>
          <boxGeometry args={[4.9, 0.002, 0.08]} />
          <primitive object={basketballLineMat} attach="material" />
        </mesh>
        <mesh position={[-2.45, 0.004, courtD / 2 - 2.9]}>
          <boxGeometry args={[0.08, 0.002, 5.8]} />
          <primitive object={basketballLineMat} attach="material" />
        </mesh>
        <mesh position={[2.45, 0.004, courtD / 2 - 2.9]}>
          <boxGeometry args={[0.08, 0.002, 5.8]} />
          <primitive object={basketballLineMat} attach="material" />
        </mesh>

        {/* Tennis Net & Posts across center */}
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[courtW + 0.4, 0.85, 0.04]} />
          <meshStandardMaterial color="#ffffff" roughness={0.6} transparent opacity={0.65} />
        </mesh>
        <mesh position={[-courtW / 2 - 0.2, 0.5, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 1.05, 8]} />
          <meshStandardMaterial color="#1e293b" metalness={0.8} />
        </mesh>
        <mesh position={[courtW / 2 + 0.2, 0.5, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 1.05, 8]} />
          <meshStandardMaterial color="#1e293b" metalness={0.8} />
        </mesh>

        {/* Tennis Service Lines (6.4m north & south of center net) */}
        <mesh position={[0, 0.004, -6.4]}>
          <boxGeometry args={[courtW - 4.0, 0.002, 0.06]} />
          <primitive object={basketballLineMat} attach="material" />
        </mesh>
        <mesh position={[0, 0.004, 6.4]}>
          <boxGeometry args={[courtW - 4.0, 0.002, 0.06]} />
          <primitive object={basketballLineMat} attach="material" />
        </mesh>
        <mesh position={[0, 0.004, 0]}>
          <boxGeometry args={[0.06, 0.002, 12.8]} />
          <primitive object={basketballLineMat} attach="material" />
        </mesh>

        {/* 3D Cantilever Basketball Hoops at Both Ends */}
        <BasketballHoop position={[0, 0, -courtD / 2 - 0.2]} rotationY={0} />
        <BasketballHoop position={[0, 0, courtD / 2 + 0.2]} rotationY={Math.PI} />

        {/* 5.8m High Sports Perimeter Ball-Stop Mesh Fence (Сетчатое ограждение +1м) */}
        <SportsMeshEnclosure width={apronW + 0.2} depth={apronD + 0.2} height={5.8} />
      </group>

      {/* ========================================================
          3. REGULATION GRAND FOOTBALL STADIUM (Striped Pitch, FIFA Lines, 3D Goals, Dugouts, Bleachers)
         ======================================================== */}
      <group position={[stadiumX, 0.08, stadiumZ]}>
        {/* Outer Buffer & Safety Runoff Lawn (63m x 114m) */}
        <mesh position={[0, -0.015, 0]} receiveShadow>
          <boxGeometry args={[stadiumW, 0.02, stadiumD]} />
          <meshStandardMaterial color="#166534" roughness={0.88} />
        </mesh>

        {/* 10 Alternating Professional Mower Cut Grass Pitch Stripes */}
        {Array.from({ length: 10 }).map((_, sIdx) => {
          const stripeLen = stadiumPitchD / 10;
          const sz = -stadiumPitchD / 2 + (sIdx + 0.5) * stripeLen;
          const stripeColor = sIdx % 2 === 0 ? '#15803d' : '#16a34a';
          return (
            <mesh key={`stadium-stripe-${sIdx}`} position={[0, -0.005, sz]} receiveShadow>
              <boxGeometry args={[stadiumPitchW, 0.02, stripeLen]} />
              <meshStandardMaterial color={stripeColor} roughness={0.82} />
            </mesh>
          );
        })}

        {/* Pitch Perimeter Lines */}
        {/* Left Touchline */}
        <mesh position={[-stadiumPitchW / 2 + 0.5, 0.006, 0]}>
          <boxGeometry args={[0.12, 0.002, stadiumPitchD - 1.0]} />
          <primitive object={lineMat} attach="material" />
        </mesh>
        {/* Right Touchline */}
        <mesh position={[stadiumPitchW / 2 - 0.5, 0.006, 0]}>
          <boxGeometry args={[0.12, 0.002, stadiumPitchD - 1.0]} />
          <primitive object={lineMat} attach="material" />
        </mesh>
        {/* Top (North) Goal Line */}
        <mesh position={[0, 0.006, -stadiumPitchD / 2 + 0.5]}>
          <boxGeometry args={[stadiumPitchW - 1.0, 0.002, 0.12]} />
          <primitive object={lineMat} attach="material" />
        </mesh>
        {/* Bottom (South) Goal Line */}
        <mesh position={[0, 0.006, stadiumPitchD / 2 - 0.5]}>
          <boxGeometry args={[stadiumPitchW - 1.0, 0.002, 0.12]} />
          <primitive object={lineMat} attach="material" />
        </mesh>

        {/* Halfway Line */}
        <mesh position={[0, 0.006, 0]}>
          <boxGeometry args={[stadiumPitchW - 1.0, 0.002, 0.12]} />
          <primitive object={lineMat} attach="material" />
        </mesh>
        {/* Center Circle (Radius 9.15m) */}
        <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[9.09, 9.21, 64]} />
          <primitive object={lineMat} attach="material" />
        </mesh>
        {/* Center Spot */}
        <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.22, 16]} />
          <primitive object={lineMat} attach="material" />
        </mesh>

        {/* North Penalty Area (34.0m x 15.0m) */}
        <mesh position={[0, 0.006, -stadiumPitchD / 2 + 15.0]}>
          <boxGeometry args={[34.0, 0.002, 0.12]} />
          <primitive object={lineMat} attach="material" />
        </mesh>
        <mesh position={[-17.0, 0.006, -stadiumPitchD / 2 + 7.5]}>
          <boxGeometry args={[0.12, 0.002, 15.0]} />
          <primitive object={lineMat} attach="material" />
        </mesh>
        <mesh position={[17.0, 0.006, -stadiumPitchD / 2 + 7.5]}>
          <boxGeometry args={[0.12, 0.002, 15.0]} />
          <primitive object={lineMat} attach="material" />
        </mesh>

        {/* North Goal Area (16.5m x 5.5m) */}
        <mesh position={[0, 0.006, -stadiumPitchD / 2 + 5.5]}>
          <boxGeometry args={[16.5, 0.002, 0.12]} />
          <primitive object={lineMat} attach="material" />
        </mesh>
        <mesh position={[-8.25, 0.006, -stadiumPitchD / 2 + 2.75]}>
          <boxGeometry args={[0.12, 0.002, 5.5]} />
          <primitive object={lineMat} attach="material" />
        </mesh>
        <mesh position={[8.25, 0.006, -stadiumPitchD / 2 + 2.75]}>
          <boxGeometry args={[0.12, 0.002, 5.5]} />
          <primitive object={lineMat} attach="material" />
        </mesh>

        {/* North Penalty Spot at 11.0m */}
        <mesh position={[0, 0.006, -stadiumPitchD / 2 + 11.0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.2, 16]} />
          <primitive object={lineMat} attach="material" />
        </mesh>
        {/* North Penalty Arc ('D') */}
        <mesh position={[0, 0.006, -stadiumPitchD / 2 + 11.0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[9.09, 9.21, 32, 1, Math.PI * 0.28, Math.PI * 0.44]} />
          <primitive object={lineMat} attach="material" />
        </mesh>

        {/* South Penalty Area (34.0m x 15.0m) */}
        <mesh position={[0, 0.006, stadiumPitchD / 2 - 15.0]}>
          <boxGeometry args={[34.0, 0.002, 0.12]} />
          <primitive object={lineMat} attach="material" />
        </mesh>
        <mesh position={[-17.0, 0.006, stadiumPitchD / 2 - 7.5]}>
          <boxGeometry args={[0.12, 0.002, 15.0]} />
          <primitive object={lineMat} attach="material" />
        </mesh>
        <mesh position={[17.0, 0.006, stadiumPitchD / 2 - 7.5]}>
          <boxGeometry args={[0.12, 0.002, 15.0]} />
          <primitive object={lineMat} attach="material" />
        </mesh>

        {/* South Goal Area (16.5m x 5.5m) */}
        <mesh position={[0, 0.006, stadiumPitchD / 2 - 5.5]}>
          <boxGeometry args={[16.5, 0.002, 0.12]} />
          <primitive object={lineMat} attach="material" />
        </mesh>
        <mesh position={[-8.25, 0.006, stadiumPitchD / 2 - 2.75]}>
          <boxGeometry args={[0.12, 0.002, 5.5]} />
          <primitive object={lineMat} attach="material" />
        </mesh>
        <mesh position={[8.25, 0.006, stadiumPitchD / 2 - 2.75]}>
          <boxGeometry args={[0.12, 0.002, 5.5]} />
          <primitive object={lineMat} attach="material" />
        </mesh>

        {/* South Penalty Spot at 11.0m */}
        <mesh position={[0, 0.006, stadiumPitchD / 2 - 11.0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.2, 16]} />
          <primitive object={lineMat} attach="material" />
        </mesh>
        {/* South Penalty Arc ('D') */}
        <mesh position={[0, 0.006, stadiumPitchD / 2 - 11.0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[9.09, 9.21, 32, 1, Math.PI * 1.28, Math.PI * 0.44]} />
          <primitive object={lineMat} attach="material" />
        </mesh>

        {/* Corner Arcs (Radius 1.0m) */}
        {[
          [-stadiumPitchW / 2 + 0.5, -stadiumPitchD / 2 + 0.5, 0],
          [stadiumPitchW / 2 - 0.5, -stadiumPitchD / 2 + 0.5, Math.PI / 2],
          [stadiumPitchW / 2 - 0.5, stadiumPitchD / 2 - 0.5, Math.PI],
          [-stadiumPitchW / 2 + 0.5, stadiumPitchD / 2 - 0.5, -Math.PI / 2],
        ].map(([cx, cz, rot], idx) => (
          <mesh key={`stadium-corner-arc-${idx}`} position={[cx, 0.006, cz]} rotation={[-Math.PI / 2, 0, rot]}>
            <ringGeometry args={[0.94, 1.06, 16, 1, 0, Math.PI / 2]} />
            <primitive object={lineMat} attach="material" />
          </mesh>
        ))}

        {/* 3D Full Regulation Soccer Goals (7.32m x 2.44m x 2.0m) */}
        <SoccerGoal
          position={[0, 0, -stadiumPitchD / 2 + 0.5]}
          rotationY={0}
          goalWidth={7.32}
          goalHeight={2.44}
          goalDepth={2.0}
        />
        <SoccerGoal
          position={[0, 0, stadiumPitchD / 2 - 0.5]}
          rotationY={Math.PI}
          goalWidth={7.32}
          goalHeight={2.44}
          goalDepth={2.0}
        />
      </group>
    </group>
  );
}
