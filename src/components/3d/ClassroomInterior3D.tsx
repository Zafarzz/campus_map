import { useMemo } from 'react';
import * as THREE from 'three';

export type ClassroomInteriorProps = {
  position: [number, number, number];
  size: [number, number, number];
  capacity?: number;
  roomNumber?: string;
  isBigLecture?: boolean;
  selected?: boolean;
};

/**
 * Creates texture for front presentation smartboard with subtle lecture slide branding.
 */
function createLectureScreenTexture(roomNumber: string = 'E-201'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Deep slate background
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 512, 256);

  // Top header bar
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(0, 0, 512, 44);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(`AJOU UNIVERSITY IN TASHKENT · ${roomNumber}`, 20, 30);

  // Presentation slide content
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(24, 60, 464, 172);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('Interactive Lecture & Collaborative Studio', 44, 105);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '16px sans-serif';
  ctx.fillText('• Academic Schedule & Smart Classroom Systems', 44, 145);
  ctx.fillText('• Department of Architecture & Computer Engineering', 44, 175);
  ctx.fillText('• Welcome to AUT Campus Digital Twin', 44, 205);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Creates texture for magnetic whiteboards flanking the central screen.
 */
function createWhiteboardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle marker sketches/equations
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(60, 70, 30, 0, Math.PI * 1.5);
  ctx.stroke();

  ctx.fillStyle = '#1e293b';
  ctx.font = '16px monospace';
  ctx.fillText('f(x) = dx/dt', 40, 140);
  ctx.fillText('∑ Wi · Xi + b', 40, 180);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * High-fidelity 3D Architectural Classroom Interior (Item 2 of todo_list.md).
 * Models authentic Ajou University lecture room features from reference photos:
 * - Light wood laminate desks with rounded corners and Ajou modesty logo panel
 * - Ergonomic cobalt-blue curved classroom chairs with circular backrest cutouts
 * - Front presentation wall: Smart display screen, dual whiteboards, wall clock, teacher podium
 * - Perimeter window wall with dark zebra horizontal blinds and heating convectors
 * - Suspended Armstrong acoustic tile ceiling with warm LED panel troffers & structural beams
 * - Glass entrance portal partition with privacy stripes
 */
export function ClassroomInterior3D({
  position,
  size,
  capacity = 50,
  roomNumber = 'Lecture Room',
  isBigLecture = false,
  selected = false,
}: ClassroomInteriorProps) {
  const [cx, cy, cz] = position;
  const [w, h, d] = size;

  // Determine classroom orientation: isXLong means desks face North/South.
  // Otherwise desks face East/West.
  const isXLong = w >= d;
  const roomW = isXLong ? w : d; // Width along teaching wall
  const roomDepth = isXLong ? d : w; // Depth from front to back

  const materials = useMemo(() => {
    const floorMat = new THREE.MeshStandardMaterial({
      color: '#e7dfd1', // Light beige classroom linoleum/tile
      roughness: 0.65,
      metalness: 0.05,
    });

    const wallCreamMat = new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      roughness: 0.8,
    });

    const frontAccentMat = new THREE.MeshStandardMaterial({
      color: '#476558', // Light sage green accent feature wall behind blackboard
      roughness: 0.75,
    });

    const deskTopMat = new THREE.MeshStandardMaterial({
      color: '#decbb2', // Light birch/ash laminate wood desk top
      roughness: 0.5,
      metalness: 0.04,
    });

    const deskModestyMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1', // Modesty panel with perforation
      roughness: 0.6,
      metalness: 0.2,
    });

    const chairBlueMat = new THREE.MeshStandardMaterial({
      color: '#1d4ed8', // Distinctive Ajou vibrant blue plastic chairs
      roughness: 0.45,
      metalness: 0.05,
    });

    const metalLegMat = new THREE.MeshStandardMaterial({
      color: '#94a3b8', // Silver curved tubular steel legs
      roughness: 0.35,
      metalness: 0.7,
    });

    const screenBezelMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      roughness: 0.2,
      metalness: 0.8,
    });

    const screenMat = new THREE.MeshStandardMaterial({
      map: createLectureScreenTexture(roomNumber),
      roughness: 0.3,
      metalness: 0.1,
    });

    const whiteboardMat = new THREE.MeshStandardMaterial({
      map: createWhiteboardTexture(),
      roughness: 0.4,
    });

    const blindsMat = new THREE.MeshStandardMaterial({
      color: '#27272a', // Dark charcoal/brown horizontal zebra blinds
      roughness: 0.6,
      metalness: 0.2,
    });

    const ceilingTileMat = new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      roughness: 0.9,
    });

    const ledPanelMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#ffffff',
      emissiveIntensity: 0.9,
      roughness: 0.2,
    });

    const radiatorMat = new THREE.MeshStandardMaterial({
      color: '#f1f5f9',
      roughness: 0.7,
    });

    const glassPartitionMat = new THREE.MeshStandardMaterial({
      color: '#bae6fd',
      transparent: true,
      opacity: 0.38,
      roughness: 0.1,
      metalness: 0.3,
      depthWrite: false,
    });

    const frostedStripeMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.8,
      roughness: 0.4,
    });

    return {
      floorMat,
      wallCreamMat,
      frontAccentMat,
      deskTopMat,
      deskModestyMat,
      chairBlueMat,
      metalLegMat,
      screenBezelMat,
      screenMat,
      whiteboardMat,
      blindsMat,
      ceilingTileMat,
      ledPanelMat,
      radiatorMat,
      glassPartitionMat,
      frostedStripeMat,
    };
  }, [roomNumber]);

  // Desk and seating arrangement
  const isLarge = isBigLecture || capacity >= 60;
  const numRows = Math.min(7, Math.max(3, Math.floor((roomDepth - 3.0) / 1.1)));
  const deskWidth = 1.25;
  const deskDepth = 0.52;
  const deskHeight = 0.74;

  // 3 Columns of desks (Left, Center, Right) or 2 columns if narrow
  const columnCount = roomW > 7.5 ? 3 : 2;
  const colSpacing = (roomW - 1.8) / columnCount;
  const colCenters = useMemo(() => {
    const centers: number[] = [];
    for (let c = 0; c < columnCount; c++) {
      centers.push(-((columnCount - 1) * colSpacing) / 2 + c * colSpacing);
    }
    return centers;
  }, [columnCount, colSpacing]);

  const rowOffsets = useMemo(() => {
    const offsets: number[] = [];
    const startZ = -roomDepth / 2 + 2.2;
    for (let r = 0; r < numRows; r++) {
      offsets.push(startZ + r * 1.05);
    }
    return offsets;
  }, [numRows, roomDepth]);

  // Front presentation wall elements
  const screenWidth = Math.min(3.4, roomW * 0.38);
  const screenHeight = 1.8;
  const boardWidth = Math.min(2.4, (roomW - screenWidth - 1.6) / 2);
  const boardHeight = 1.5;

  return (
    <group position={[cx, cy, cz]} rotation={[0, isXLong ? 0 : Math.PI / 2, 0]}>
      {/* 1. Floor Tile / Linoleum Slab */}
      <mesh position={[0, -h / 2 + 0.015, 0]} material={materials.floorMat} receiveShadow>
        <boxGeometry args={[roomW - 0.05, 0.03, roomDepth - 0.05]} />
      </mesh>

      {/* 2. Perimeter Walls */}
      {/* North / Front Feature Accent Wall (behind the blackboard) */}
      <mesh position={[0, 0, -roomDepth / 2 + 0.08]} material={materials.frontAccentMat}>
        <boxGeometry args={[roomW, h, 0.16]} />
      </mesh>

      {/* South / Back Wall (with Glass Door portal) */}
      <mesh position={[0, 0, roomDepth / 2 - 0.08]} material={materials.wallCreamMat}>
        <boxGeometry args={[roomW, h, 0.16]} />
      </mesh>

      {/* West / Window Wall with Exterior Venetian Blinds */}
      <mesh position={[-roomW / 2 + 0.08, 0, 0]} material={materials.wallCreamMat}>
        <boxGeometry args={[0.16, h, roomDepth]} />
      </mesh>

      {/* East / Corridor Glass Partition Wall */}
      <mesh position={[roomW / 2 - 0.08, 0, 0]} material={materials.glassPartitionMat}>
        <boxGeometry args={[0.08, h - 0.1, roomDepth - 0.2]} />
      </mesh>

      {/* Frosted privacy stripes on corridor glass partition */}
      {[0.9, 1.15, 1.4].map((sy, idx) => (
        <mesh key={`frosted-${idx}`} position={[roomW / 2 - 0.075, -h / 2 + sy, 0]} material={materials.frostedStripeMat}>
          <boxGeometry args={[0.09, 0.12, roomDepth - 0.4]} />
        </mesh>
      ))}

      {/* 3. Front Wall Teaching Ensemble */}
      {/* Central Interactive Smart Display Screen */}
      <group position={[0, -h / 2 + 1.65, -roomDepth / 2 + 0.18]}>
        {/* Screen Outer Bezel Frame */}
        <mesh material={materials.screenBezelMat} castShadow>
          <boxGeometry args={[screenWidth + 0.08, screenHeight + 0.08, 0.06]} />
        </mesh>
        {/* Active Display Surface */}
        <mesh position={[0, 0, 0.035]} material={materials.screenMat}>
          <planeGeometry args={[screenWidth, screenHeight]} />
        </mesh>
      </group>

      {/* Left Whiteboard */}
      <group position={[-screenWidth / 2 - boardWidth / 2 - 0.2, -h / 2 + 1.55, -roomDepth / 2 + 0.18]}>
        <mesh material={materials.screenBezelMat}>
          <boxGeometry args={[boardWidth + 0.05, boardHeight + 0.05, 0.04]} />
        </mesh>
        <mesh position={[0, 0, 0.025]} material={materials.whiteboardMat}>
          <planeGeometry args={[boardWidth, boardHeight]} />
        </mesh>
      </group>

      {/* Right Whiteboard */}
      <group position={[screenWidth / 2 + boardWidth / 2 + 0.2, -h / 2 + 1.55, -roomDepth / 2 + 0.18]}>
        <mesh material={materials.screenBezelMat}>
          <boxGeometry args={[boardWidth + 0.05, boardHeight + 0.05, 0.04]} />
        </mesh>
        <mesh position={[0, 0, 0.025]} material={materials.whiteboardMat}>
          <planeGeometry args={[boardWidth, boardHeight]} />
        </mesh>
      </group>

      {/* Wall Clock Centered Above Screen */}
      <group position={[0, -h / 2 + 2.75, -roomDepth / 2 + 0.18]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={materials.screenBezelMat}>
          <cylinderGeometry args={[0.22, 0.22, 0.04, 24]} />
        </mesh>
        <mesh position={[0, 0, 0.025]} rotation={[Math.PI / 2, 0, 0]} material={materials.ceilingTileMat}>
          <cylinderGeometry args={[0.19, 0.19, 0.01, 24]} />
        </mesh>
      </group>

      {/* Teacher Podium / Lecture Desk at Front */}
      <group position={[colCenters[0] || -1.5, -h / 2, -roomDepth / 2 + 1.1]}>
        {/* Podium Desktop */}
        <mesh position={[0, deskHeight, 0]} material={materials.deskTopMat} castShadow>
          <boxGeometry args={[1.4, 0.05, 0.7]} />
        </mesh>
        {/* Modesty Front Board */}
        <mesh position={[0, deskHeight / 2, -0.32]} material={materials.deskModestyMat}>
          <boxGeometry args={[1.3, deskHeight - 0.08, 0.03]} />
        </mesh>
        {/* Metal Legs */}
        {[-0.62, 0.62].map((lx, lIdx) => (
          <mesh key={`p-leg-${lIdx}`} position={[lx, deskHeight / 2, 0]} material={materials.metalLegMat}>
            <cylinderGeometry args={[0.025, 0.025, deskHeight, 12]} />
          </mesh>
        ))}
        {/* Teacher Laptop Mockup */}
        <mesh position={[0, deskHeight + 0.015, 0]} material={materials.screenBezelMat}>
          <boxGeometry args={[0.34, 0.015, 0.24]} />
        </mesh>
        <mesh position={[0, deskHeight + 0.12, -0.1]} rotation={[-0.3, 0, 0]} material={materials.screenBezelMat}>
          <boxGeometry args={[0.34, 0.22, 0.015]} />
        </mesh>
      </group>

      {/* 4. Student Desks and Ergonomic Blue Chairs Grid */}
      {rowOffsets.map((rz, rIdx) => (
        <group key={`row-${rIdx}`}>
          {colCenters.map((cxCol, cIdx) => (
            <group key={`desk-${rIdx}-${cIdx}`} position={[cxCol, -h / 2, rz]}>
              {/* Desk Wood Top */}
              <mesh position={[0, deskHeight, 0]} material={materials.deskTopMat} castShadow receiveShadow>
                <boxGeometry args={[deskWidth, 0.04, deskDepth]} />
              </mesh>

              {/* Perforated Modesty Front Panel */}
              <mesh position={[0, deskHeight * 0.55, -deskDepth / 2 + 0.03]} material={materials.deskModestyMat}>
                <boxGeometry args={[deskWidth - 0.1, deskHeight * 0.6, 0.02]} />
              </mesh>

              {/* Ajou Circular Emblem on Modesty Panel */}
              <mesh
                position={[0, deskHeight * 0.55, -deskDepth / 2 + 0.045]}
                rotation={[Math.PI / 2, 0, 0]}
                material={materials.chairBlueMat}
              >
                <cylinderGeometry args={[0.07, 0.07, 0.005, 16]} />
              </mesh>

              {/* Curved Tubular Metal Legs with Casters */}
              {[-deskWidth / 2 + 0.08, deskWidth / 2 - 0.08].map((dx, dIdx) => (
                <group key={`leg-${dIdx}`} position={[dx, 0, 0]}>
                  {/* Vertical Post */}
                  <mesh position={[0, deskHeight / 2, 0]} material={materials.metalLegMat}>
                    <cylinderGeometry args={[0.02, 0.02, deskHeight, 10]} />
                  </mesh>
                  {/* Base Caster Foot */}
                  <mesh position={[0, 0.025, 0]} material={materials.metalLegMat}>
                    <boxGeometry args={[0.06, 0.04, deskDepth - 0.06]} />
                  </mesh>
                </group>
              ))}

              {/* 2 Ergonomic Blue Chairs behind each desk */}
              {[-0.34, 0.34].map((chX, chIdx) => (
                <group key={`chair-${chIdx}`} position={[chX, 0, deskDepth / 2 + 0.32]}>
                  {/* Seat Cushion / Bucket */}
                  <mesh position={[0, 0.44, 0]} material={materials.chairBlueMat} castShadow>
                    <boxGeometry args={[0.44, 0.04, 0.42]} />
                  </mesh>

                  {/* Curved Ergonomic Backrest */}
                  <mesh position={[0, 0.72, 0.19]} rotation={[-0.1, 0, 0]} material={materials.chairBlueMat}>
                    <boxGeometry args={[0.42, 0.36, 0.04]} />
                  </mesh>

                  {/* Circular Cutout Perforation in Backrest (Distinctive Ajou Detail) */}
                  <mesh
                    position={[0, 0.78, 0.2]}
                    rotation={[Math.PI / 2, 0, 0]}
                    material={materials.wallCreamMat}
                  >
                    <cylinderGeometry args={[0.05, 0.05, 0.06, 16]} />
                  </mesh>

                  {/* 4 Tubular Metal Chair Legs */}
                  {[
                    [-0.18, -0.16],
                    [0.18, -0.16],
                    [-0.18, 0.16],
                    [0.18, 0.16],
                  ].map(([lx, lz], legIdx) => (
                    <mesh key={`ch-leg-${legIdx}`} position={[lx, 0.22, lz]} material={materials.metalLegMat}>
                      <cylinderGeometry args={[0.015, 0.015, 0.44, 8]} />
                    </mesh>
                  ))}
                </group>
              ))}
            </group>
          ))}
        </group>
      ))}

      {/* 5. Window Blinds & Radiators along West Wall */}
      {Array.from({ length: Math.max(2, Math.floor(roomDepth / 2.2)) }).map((_, wIdx) => {
        const wz = -roomDepth / 2 + 1.2 + wIdx * 2.1;
        return (
          <group key={`window-${wIdx}`} position={[-roomW / 2 + 0.15, 0, wz]}>
            {/* Horizontal Zebra Blind Cassette */}
            <mesh position={[0, h / 2 - 0.2, 0]} material={materials.blindsMat}>
              <boxGeometry args={[0.08, 0.12, 1.8]} />
            </mesh>
            {/* Dropped Louver Blind Sheet */}
            <mesh position={[0, 0.15, 0]} material={materials.blindsMat}>
              <boxGeometry args={[0.04, h - 0.8, 1.76]} />
            </mesh>
            {/* Low-profile Floor Convector Radiator underneath */}
            <mesh position={[0.1, -h / 2 + 0.25, 0]} material={materials.radiatorMat} castShadow>
              <boxGeometry args={[0.22, 0.48, 1.6]} />
            </mesh>
          </group>
        );
      })}

      {/* 6. Open Architectural Ceiling Trim & Transverse Beam (Open top for full visibility into room) */}
      <group position={[0, h / 2 - 0.04, 0]}>
        {/* Structural Transverse Overhead Beam per photo 17-08-35 (recessed, open at top) */}
        <mesh position={[0, -0.16, 0]} material={materials.ceilingTileMat}>
          <boxGeometry args={[roomW, 0.28, 0.35]} />
        </mesh>

        {/* Perimeter Crown Railing Trim without blocking the top view */}
        <mesh position={[0, 0, -roomDepth / 2 + 0.1]} material={materials.ceilingTileMat}>
          <boxGeometry args={[roomW, 0.1, 0.2]} />
        </mesh>
        <mesh position={[0, 0, roomDepth / 2 - 0.1]} material={materials.ceilingTileMat}>
          <boxGeometry args={[roomW, 0.1, 0.2]} />
        </mesh>
      </group>
    </group>
  );
}
