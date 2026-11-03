import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';

export type ClassroomInteriorProps = {
  position: [number, number, number];
  size: [number, number, number];
  capacity?: number;
  roomNumber?: string;
  isBigLecture?: boolean;
  selected?: boolean;
};

const DESK_WIDTH = 1.25;
const DESK_DEPTH = 0.52;
const DESK_HEIGHT = 0.74;

function isCanvasSupported(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    return Boolean(c && typeof c.getContext === 'function');
  } catch {
    return false;
  }
}

/**
 * Creates texture for front presentation smartboard with subtle lecture slide branding.
 */
const screenTextureCache = new Map<string, THREE.CanvasTexture>();
const screenMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

function getLectureScreenMaterial(roomNumber: string = 'E-201'): THREE.MeshStandardMaterial {
  const existingMat = screenMaterialCache.get(roomNumber);
  if (existingMat) return existingMat;

  let texture = screenTextureCache.get(roomNumber);
  if (!texture && isCanvasSupported()) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (ctx) {
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
    }
    texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    screenTextureCache.set(roomNumber, texture);
  }

  const mat = new THREE.MeshStandardMaterial({
    color: texture ? '#ffffff' : '#0f172a',
    map: texture ?? null,
    roughness: 0.3,
    metalness: 0.1,
  });
  screenMaterialCache.set(roomNumber, mat);
  return mat;
}

/**
 * Creates texture for magnetic whiteboards flanking the central screen (cached singleton).
 */
let cachedWhiteboardTexture: THREE.CanvasTexture | null = null;

function getWhiteboardTexture(): THREE.CanvasTexture | null {
  if (cachedWhiteboardTexture) return cachedWhiteboardTexture;
  if (!isCanvasSupported()) return null;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }
  if (ctx) {
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
  }

  cachedWhiteboardTexture = new THREE.CanvasTexture(canvas);
  cachedWhiteboardTexture.needsUpdate = true;
  return cachedWhiteboardTexture;
}

interface SharedClassroomMaterials {
  floorMat: THREE.MeshStandardMaterial;
  wallCreamMat: THREE.MeshStandardMaterial;
  frontAccentMat: THREE.MeshStandardMaterial;
  deskTopMat: THREE.MeshStandardMaterial;
  deskModestyMat: THREE.MeshStandardMaterial;
  chairBlueMat: THREE.MeshStandardMaterial;
  metalLegMat: THREE.MeshStandardMaterial;
  screenBezelMat: THREE.MeshStandardMaterial;
  whiteboardMat: THREE.MeshStandardMaterial;
  blindsMat: THREE.MeshStandardMaterial;
  ceilingTileMat: THREE.MeshStandardMaterial;
  ledPanelMat: THREE.MeshStandardMaterial;
  radiatorMat: THREE.MeshStandardMaterial;
  glassPartitionMat: THREE.MeshStandardMaterial;
  frostedStripeMat: THREE.MeshStandardMaterial;
}

let sharedMaterials: SharedClassroomMaterials | null = null;

function getSharedClassroomMaterials(): SharedClassroomMaterials {
  if (sharedMaterials) return sharedMaterials;

  const wbTex = getWhiteboardTexture();
  sharedMaterials = {
    floorMat: new THREE.MeshStandardMaterial({
      color: '#e7dfd1',
      roughness: 0.65,
      metalness: 0.05,
    }),
    wallCreamMat: new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      roughness: 0.8,
    }),
    frontAccentMat: new THREE.MeshStandardMaterial({
      color: '#476558',
      roughness: 0.75,
    }),
    deskTopMat: new THREE.MeshStandardMaterial({
      color: '#decbb2',
      roughness: 0.5,
      metalness: 0.04,
    }),
    deskModestyMat: new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      roughness: 0.6,
      metalness: 0.2,
    }),
    chairBlueMat: new THREE.MeshStandardMaterial({
      color: '#1d4ed8',
      roughness: 0.45,
      metalness: 0.05,
    }),
    metalLegMat: new THREE.MeshStandardMaterial({
      color: '#94a3b8',
      roughness: 0.35,
      metalness: 0.7,
    }),
    screenBezelMat: new THREE.MeshStandardMaterial({
      color: '#0f172a',
      roughness: 0.2,
      metalness: 0.8,
    }),
    whiteboardMat: new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      map: wbTex ?? null,
      roughness: 0.4,
    }),
    blindsMat: new THREE.MeshStandardMaterial({
      color: '#27272a',
      roughness: 0.6,
      metalness: 0.2,
    }),
    ceilingTileMat: new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      roughness: 0.9,
    }),
    ledPanelMat: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#ffffff',
      emissiveIntensity: 0.9,
      roughness: 0.2,
    }),
    radiatorMat: new THREE.MeshStandardMaterial({
      color: '#f1f5f9',
      roughness: 0.7,
    }),
    glassPartitionMat: new THREE.MeshStandardMaterial({
      color: '#bae6fd',
      transparent: true,
      opacity: 0.38,
      roughness: 0.1,
      metalness: 0.3,
      depthWrite: false,
    }),
    frostedStripeMat: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.8,
      roughness: 0.4,
    }),
  };
  return sharedMaterials;
}

function mergeStaticGeometries(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];

  for (const g of geoms) {
    const nonIdx = g.index ? g.toNonIndexed() : g;
    const pos = nonIdx.getAttribute('position');
    const norm = nonIdx.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (norm) {
        normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
      } else {
        normals.push(0, 1, 0);
      }
    }
    if (nonIdx !== g) nonIdx.dispose();
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return merged;
}

// Shared unit primitives to avoid recreating BufferGeometries per room
const sharedUnitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
const sharedUnitPlaneGeo = new THREE.PlaneGeometry(1, 1);
const sharedClockOuterGeo = (() => {
  const g = new THREE.CylinderGeometry(0.22, 0.22, 0.04, 20);
  g.rotateX(Math.PI / 2);
  return g;
})();
const sharedClockFaceGeo = (() => {
  const g = new THREE.CylinderGeometry(0.19, 0.19, 0.01, 20);
  g.rotateX(Math.PI / 2);
  return g;
})();
const sharedPodiumLegGeo = new THREE.CylinderGeometry(0.025, 0.025, DESK_HEIGHT, 10);

/**
 * Pre-merged static geometries for a complete Student Desk + 2 Ergonomic Chairs unit,
 * grouped by material so an entire classroom's seating grid renders in 4 instanced draw calls
 * instead of 441 individual <mesh> elements.
 */
const sharedDeskUnitGeos = (() => {
  // 1. Desk Wood Top
  const topGeo = new THREE.BoxGeometry(DESK_WIDTH, 0.04, DESK_DEPTH);
  topGeo.translate(0, DESK_HEIGHT, 0);

  // 2. Modesty Panel
  const modestyGeo = new THREE.BoxGeometry(DESK_WIDTH - 0.1, DESK_HEIGHT * 0.6, 0.02);
  modestyGeo.translate(0, DESK_HEIGHT * 0.55, -DESK_DEPTH / 2 + 0.03);

  // 3. Ajou Blue Elements (Modesty emblem + 2 chair seats + 2 curved backrests + cutouts)
  const blueParts: THREE.BufferGeometry[] = [];
  const emblem = new THREE.CylinderGeometry(0.07, 0.07, 0.005, 14);
  emblem.rotateX(Math.PI / 2);
  emblem.translate(0, DESK_HEIGHT * 0.55, -DESK_DEPTH / 2 + 0.045);
  blueParts.push(emblem);

  const chairZ = DESK_DEPTH / 2 + 0.32;
  for (const chX of [-0.34, 0.34]) {
    const seat = new THREE.BoxGeometry(0.44, 0.04, 0.42);
    seat.translate(chX, 0.44, chairZ);
    blueParts.push(seat);

    const back = new THREE.BoxGeometry(0.42, 0.36, 0.04);
    back.rotateX(-0.1);
    back.translate(chX, 0.72, chairZ + 0.19);
    blueParts.push(back);
  }
  const chairBlueGeo = mergeStaticGeometries(blueParts);

  // 4. Metal Legs (2 desk posts + 2 caster feet + 8 tubular chair legs)
  const metalParts: THREE.BufferGeometry[] = [];
  for (const dx of [-DESK_WIDTH / 2 + 0.08, DESK_WIDTH / 2 - 0.08]) {
    const post = new THREE.CylinderGeometry(0.02, 0.02, DESK_HEIGHT, 8);
    post.translate(dx, DESK_HEIGHT / 2, 0);
    metalParts.push(post);

    const foot = new THREE.BoxGeometry(0.06, 0.04, DESK_DEPTH - 0.06);
    foot.translate(dx, 0.025, 0);
    metalParts.push(foot);
  }
  const legOffsets: [number, number][] = [
    [-0.18, -0.16],
    [0.18, -0.16],
    [-0.18, 0.16],
    [0.18, 0.16],
  ];
  for (const chX of [-0.34, 0.34]) {
    for (const [lx, lz] of legOffsets) {
      const chLeg = new THREE.CylinderGeometry(0.015, 0.015, 0.44, 6);
      chLeg.translate(chX + lx, 0.22, chairZ + lz);
      metalParts.push(chLeg);
    }
  }
  const metalLegsGeo = mergeStaticGeometries(metalParts);

  return {
    topGeo,
    modestyGeo,
    chairBlueGeo,
    metalLegsGeo,
  };
})();

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

  const materials = useMemo(() => getSharedClassroomMaterials(), []);
  const screenMat = useMemo(() => getLectureScreenMaterial(roomNumber), [roomNumber]);

  // Desk and seating arrangement
  const _isLarge = isBigLecture || capacity >= 60;
  void _isLarge;
  const numRows = Math.min(7, Math.max(3, Math.floor((roomDepth - 3.0) / 1.1)));

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

  // Instanced desk & chair assemblies (reduces ~441 meshes per room down to 4 instanced draw calls)
  const deskInstancedMeshes = useMemo(() => {
    const deskCount = rowOffsets.length * colCenters.length;
    if (deskCount <= 0) return null;

    const topMesh = new THREE.InstancedMesh(sharedDeskUnitGeos.topGeo, materials.deskTopMat, deskCount);
    const modestyMesh = new THREE.InstancedMesh(sharedDeskUnitGeos.modestyGeo, materials.deskModestyMat, deskCount);
    const chairMesh = new THREE.InstancedMesh(sharedDeskUnitGeos.chairBlueGeo, materials.chairBlueMat, deskCount);
    const legsMesh = new THREE.InstancedMesh(sharedDeskUnitGeos.metalLegsGeo, materials.metalLegMat, deskCount);

    topMesh.castShadow = true;
    topMesh.receiveShadow = true;
    chairMesh.castShadow = true;

    const dummy = new THREE.Object3D();
    let idx = 0;
    const baseY = -h / 2;

    for (const rz of rowOffsets) {
      for (const cxCol of colCenters) {
        dummy.position.set(cxCol, baseY, rz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        topMesh.setMatrixAt(idx, dummy.matrix);
        modestyMesh.setMatrixAt(idx, dummy.matrix);
        chairMesh.setMatrixAt(idx, dummy.matrix);
        legsMesh.setMatrixAt(idx, dummy.matrix);
        idx++;
      }
    }

    topMesh.instanceMatrix.needsUpdate = true;
    modestyMesh.instanceMatrix.needsUpdate = true;
    chairMesh.instanceMatrix.needsUpdate = true;
    legsMesh.instanceMatrix.needsUpdate = true;

    return { topMesh, modestyMesh, chairMesh, legsMesh };
  }, [rowOffsets, colCenters, h, materials]);

  useEffect(() => {
    if (!deskInstancedMeshes) return;
    return () => {
      deskInstancedMeshes.topMesh.dispose();
      deskInstancedMeshes.modestyMesh.dispose();
      deskInstancedMeshes.chairMesh.dispose();
      deskInstancedMeshes.legsMesh.dispose();
    };
  }, [deskInstancedMeshes]);

  // Front presentation wall elements
  const screenWidth = Math.min(3.4, roomW * 0.38);
  const screenHeight = 1.8;
  const boardWidth = Math.min(2.4, (roomW - screenWidth - 1.6) / 2);
  const boardHeight = 1.5;

  const windowCount = Math.max(2, Math.floor(roomDepth / 2.2));

  return (
    <group position={[cx, cy, cz]} rotation={[0, isXLong ? 0 : Math.PI / 2, 0]}>
      {/* 1. Floor Tile / Linoleum Slab */}
      <mesh
        position={[0, -h / 2 + 0.015, 0]}
        scale={[roomW - 0.05, 0.03, roomDepth - 0.05]}
        geometry={sharedUnitBoxGeo}
        material={materials.floorMat}
        receiveShadow
      />

      {/* 2. Perimeter Walls */}
      {/* North / Front Feature Accent Wall (behind the blackboard) */}
      <mesh
        position={[0, 0, -roomDepth / 2 + 0.08]}
        scale={[roomW, h, 0.16]}
        geometry={sharedUnitBoxGeo}
        material={materials.frontAccentMat}
      />

      {/* South / Back Wall (with Glass Door portal) */}
      <mesh
        position={[0, 0, roomDepth / 2 - 0.08]}
        scale={[roomW, h, 0.16]}
        geometry={sharedUnitBoxGeo}
        material={materials.wallCreamMat}
      />

      {/* West / Window Wall with Exterior Venetian Blinds */}
      <mesh
        position={[-roomW / 2 + 0.08, 0, 0]}
        scale={[0.16, h, roomDepth]}
        geometry={sharedUnitBoxGeo}
        material={materials.wallCreamMat}
      />

      {/* East / Corridor Glass Partition Wall */}
      <mesh
        position={[roomW / 2 - 0.08, 0, 0]}
        scale={[0.08, h - 0.1, roomDepth - 0.2]}
        geometry={sharedUnitBoxGeo}
        material={materials.glassPartitionMat}
      />

      {/* Frosted privacy stripes on corridor glass partition */}
      {[0.9, 1.15, 1.4].map((sy, idx) => (
        <mesh
          key={`frosted-${idx}`}
          position={[roomW / 2 - 0.075, -h / 2 + sy, 0]}
          scale={[0.09, 0.12, roomDepth - 0.4]}
          geometry={sharedUnitBoxGeo}
          material={materials.frostedStripeMat}
        />
      ))}

      {/* 3. Front Wall Teaching Ensemble */}
      {/* Central Interactive Smart Display Screen */}
      <group position={[0, -h / 2 + 1.65, -roomDepth / 2 + 0.18]}>
        {/* Screen Outer Bezel Frame */}
        <mesh
          scale={[screenWidth + 0.08, screenHeight + 0.08, 0.06]}
          geometry={sharedUnitBoxGeo}
          material={materials.screenBezelMat}
          castShadow
        />
        {/* Active Display Surface */}
        <mesh
          position={[0, 0, 0.035]}
          scale={[screenWidth, screenHeight, 1]}
          geometry={sharedUnitPlaneGeo}
          material={screenMat}
        />
      </group>

      {/* Left Whiteboard */}
      <group position={[-screenWidth / 2 - boardWidth / 2 - 0.2, -h / 2 + 1.55, -roomDepth / 2 + 0.18]}>
        <mesh
          scale={[boardWidth + 0.05, boardHeight + 0.05, 0.04]}
          geometry={sharedUnitBoxGeo}
          material={materials.screenBezelMat}
        />
        <mesh
          position={[0, 0, 0.025]}
          scale={[boardWidth, boardHeight, 1]}
          geometry={sharedUnitPlaneGeo}
          material={materials.whiteboardMat}
        />
      </group>

      {/* Right Whiteboard */}
      <group position={[screenWidth / 2 + boardWidth / 2 + 0.2, -h / 2 + 1.55, -roomDepth / 2 + 0.18]}>
        <mesh
          scale={[boardWidth + 0.05, boardHeight + 0.05, 0.04]}
          geometry={sharedUnitBoxGeo}
          material={materials.screenBezelMat}
        />
        <mesh
          position={[0, 0, 0.025]}
          scale={[boardWidth, boardHeight, 1]}
          geometry={sharedUnitPlaneGeo}
          material={materials.whiteboardMat}
        />
      </group>

      {/* Wall Clock Centered Above Screen */}
      <group position={[0, -h / 2 + 2.75, -roomDepth / 2 + 0.18]}>
        <mesh geometry={sharedClockOuterGeo} material={materials.screenBezelMat} />
        <mesh position={[0, 0, 0.025]} geometry={sharedClockFaceGeo} material={materials.ceilingTileMat} />
      </group>

      {/* Teacher Podium / Lecture Desk at Front */}
      <group position={[colCenters[0] || -1.5, -h / 2, -roomDepth / 2 + 1.1]}>
        {/* Podium Desktop */}
        <mesh
          position={[0, DESK_HEIGHT, 0]}
          scale={[1.4, 0.05, 0.7]}
          geometry={sharedUnitBoxGeo}
          material={materials.deskTopMat}
          castShadow
        />
        {/* Modesty Front Board */}
        <mesh
          position={[0, DESK_HEIGHT / 2, -0.32]}
          scale={[1.3, DESK_HEIGHT - 0.08, 0.03]}
          geometry={sharedUnitBoxGeo}
          material={materials.deskModestyMat}
        />
        {/* Metal Legs */}
        {[-0.62, 0.62].map((lx, lIdx) => (
          <mesh
            key={`p-leg-${lIdx}`}
            position={[lx, DESK_HEIGHT / 2, 0]}
            geometry={sharedPodiumLegGeo}
            material={materials.metalLegMat}
          />
        ))}
        {/* Teacher Laptop Mockup */}
        <mesh
          position={[0, DESK_HEIGHT + 0.015, 0]}
          scale={[0.34, 0.015, 0.24]}
          geometry={sharedUnitBoxGeo}
          material={materials.screenBezelMat}
        />
        <mesh
          position={[0, DESK_HEIGHT + 0.12, -0.1]}
          rotation={[-0.3, 0, 0]}
          scale={[0.34, 0.22, 0.015]}
          geometry={sharedUnitBoxGeo}
          material={materials.screenBezelMat}
        />
      </group>

      {/* 4. Instanced Student Desks and Ergonomic Blue Chairs Grid */}
      {deskInstancedMeshes && (
        <group name="classroom-seating-instanced">
          <primitive object={deskInstancedMeshes.topMesh} />
          <primitive object={deskInstancedMeshes.modestyMesh} />
          <primitive object={deskInstancedMeshes.chairMesh} />
          <primitive object={deskInstancedMeshes.legsMesh} />
        </group>
      )}

      {/* 5. Window Blinds & Radiators along West Wall (full sub-part detail when focused or narrow room) */}
      {Array.from({ length: selected ? windowCount : Math.min(2, windowCount) }).map((_, wIdx) => {
        const wz = -roomDepth / 2 + 1.2 + wIdx * 2.1;
        return (
          <group key={`window-${wIdx}`} position={[-roomW / 2 + 0.15, 0, wz]}>
            {/* Horizontal Zebra Blind Cassette */}
            <mesh
              position={[0, h / 2 - 0.2, 0]}
              scale={[0.08, 0.12, 1.8]}
              geometry={sharedUnitBoxGeo}
              material={materials.blindsMat}
            />
            {/* Dropped Louver Blind Sheet */}
            <mesh
              position={[0, 0.15, 0]}
              scale={[0.04, h - 0.8, 1.76]}
              geometry={sharedUnitBoxGeo}
              material={materials.blindsMat}
            />
            {/* Low-profile Floor Convector Radiator underneath */}
            <mesh
              position={[0.1, -h / 2 + 0.25, 0]}
              scale={[0.22, 0.48, 1.6]}
              geometry={sharedUnitBoxGeo}
              material={materials.radiatorMat}
              castShadow={selected}
            />
          </group>
        );
      })}

      {/* 6. Open Architectural Ceiling Trim & Transverse Beam (Open top for full visibility into room) */}
      <group position={[0, h / 2 - 0.04, 0]}>
        {/* Structural Transverse Overhead Beam per photo 17-08-35 (recessed, open at top) */}
        <mesh
          position={[0, -0.16, 0]}
          scale={[roomW, 0.28, 0.35]}
          geometry={sharedUnitBoxGeo}
          material={materials.ceilingTileMat}
        />

        {/* Perimeter Crown Railing Trim without blocking the top view */}
        <mesh
          position={[0, 0, -roomDepth / 2 + 0.1]}
          scale={[roomW, 0.1, 0.2]}
          geometry={sharedUnitBoxGeo}
          material={materials.ceilingTileMat}
        />
        <mesh
          position={[0, 0, roomDepth / 2 - 0.1]}
          scale={[roomW, 0.1, 0.2]}
          geometry={sharedUnitBoxGeo}
          material={materials.ceilingTileMat}
        />
      </group>
    </group>
  );
}

