import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeStaticGeometries } from './geometry/staticGeometryMerger';
import { getInteriorWoodTextures } from './materials/pbrMaterials';

export type ClassroomInteriorProps = {
  position: [number, number, number];
  size: [number, number, number];
  capacity?: number;
  roomNumber?: string;
  isBigLecture?: boolean;
  selected?: boolean;
};

// Blueprint Furniture Dimensions per Sheet 1 Group I25C:
// Individual booth: 800 x 600 mm, height 950 mm
// Double booth: 1600 x 600 mm, height 950 mm
export const CLASSROOM_BOOTH_SPECS = {
  boothWidth: 1.60,
  boothDepth: 0.60,
  deskSurfaceHeight: 0.74,
  wingHeight: 0.95,
  wingFilletRadius: 0.14,
  cableGrommetDiameter: 0.06,
  chairSeatHeight: 0.45,
  chairBackHeight: 0.80,
  finishMaterial: 'ЛДСП 16 мм Дуб сонома',
  frameMaterial: 'Стальной каркас',
} as const;

const BOOTH_WIDTH = CLASSROOM_BOOTH_SPECS.boothWidth;
const BOOTH_DEPTH = CLASSROOM_BOOTH_SPECS.boothDepth;
const DESK_SURFACE_HEIGHT = CLASSROOM_BOOTH_SPECS.deskSurfaceHeight;
const WING_HEIGHT = CLASSROOM_BOOTH_SPECS.wingHeight;
const WING_FILLET_RADIUS = CLASSROOM_BOOTH_SPECS.wingFilletRadius;

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
 * Creates texture for front interactive presentation smartboard.
 */
const screenTextureCache = new Map<string, THREE.CanvasTexture>();
const screenMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

function getLectureScreenMaterial(roomNumber: string = 'E-201'): THREE.MeshStandardMaterial {
  const existingMat = screenMaterialCache.get(roomNumber);
  if (existingMat) return existingMat;

  let texture = screenTextureCache.get(roomNumber);
  if (!texture && isCanvasSupported()) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (ctx) {
      // Dark slate background
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, 1024, 512);

      // Top header bar
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(0, 0, 1024, 76);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px sans-serif';
      ctx.fillText(`AJOU UNIVERSITY IN TASHKENT · ${roomNumber}`, 36, 52);

      // Interactive presentation canvas
      ctx.fillStyle = '#111827';
      ctx.fillRect(36, 100, 952, 380);

      // Presentation title
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 42px sans-serif';
      ctx.fillText('Interactive Lecture & Collaborative Studio', 64, 175);

      // Key details
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '26px sans-serif';
      ctx.fillText('• Academic Schedule & Smart Classroom Systems', 64, 240);
      ctx.fillText('• Department of Architecture & Computer Engineering', 64, 290);
      ctx.fillText('• AUT Digital Twin Campus · Interactive 3D Model', 64, 340);

      // Status badge
      ctx.fillStyle = '#059669';
      ctx.beginPath();
      ctx.roundRect(64, 380, 220, 46, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('● SYSTEM ACTIVE', 84, 410);
    }
    texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    screenTextureCache.set(roomNumber, texture);
  }

  const mat = new THREE.MeshStandardMaterial({
    color: texture ? '#ffffff' : '#0f172a',
    map: texture ?? null,
    roughness: 0.25,
    metalness: 0.1,
  });
  screenMaterialCache.set(roomNumber, mat);
  return mat;
}

/**
 * Creates decorative architectural mural texture for the rear wall per Sheet 1 Group I25C
 * ("Стена с декоративной росписью").
 */
let cachedMuralTexture: THREE.CanvasTexture | null = null;
let cachedMuralMaterial: THREE.MeshStandardMaterial | null = null;

function getRearMuralMaterial(): THREE.MeshStandardMaterial {
  if (cachedMuralMaterial) return cachedMuralMaterial;

  if (!cachedMuralTexture && isCanvasSupported()) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (ctx) {
      // Artistic background gradient
      const grad = ctx.createLinearGradient(0, 0, 1024, 512);
      grad.addColorStop(0, '#0c4a6e');
      grad.addColorStop(0.5, '#0284c7');
      grad.addColorStop(1, '#0e7490');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 512);

      // Stylized campus architectural silhouettes
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      ctx.moveTo(0, 512);
      ctx.lineTo(120, 280);
      ctx.lineTo(240, 360);
      ctx.lineTo(380, 190);
      ctx.lineTo(520, 310);
      ctx.lineTo(700, 160);
      ctx.lineTo(840, 260);
      ctx.lineTo(1024, 180);
      ctx.lineTo(1024, 512);
      ctx.closePath();
      ctx.fill();

      // Foreground geometric architectural blocks
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.fillRect(160, 240, 140, 272);
      ctx.fillRect(340, 290, 160, 222);
      ctx.fillRect(560, 210, 180, 302);
      ctx.fillRect(780, 270, 150, 242);

      // Perspective wireframe grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 3;
      for (let i = 0; i <= 10; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 102, 512);
        ctx.lineTo(512, 120);
        ctx.stroke();
      }

      // Artistic text banner
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 44px sans-serif';
      ctx.fillText('AJOU UNIVERSITY IN TASHKENT', 80, 100);
      ctx.font = '24px sans-serif';
      ctx.fillStyle = '#fde047';
      ctx.fillText('FACULTY OF ARCHITECTURE & CIVIL ENGINEERING · CREATIVE STUDIO', 80, 145);
    }
    cachedMuralTexture = new THREE.CanvasTexture(canvas);
    cachedMuralTexture.needsUpdate = true;
  }

  cachedMuralMaterial = new THREE.MeshStandardMaterial({
    color: cachedMuralTexture ? '#ffffff' : '#0284c7',
    map: cachedMuralTexture ?? null,
    roughness: 0.65,
    metalness: 0.05,
  });
  return cachedMuralMaterial;
}

interface SharedClassroomMaterials {
  floorMat: THREE.MeshStandardMaterial;
  wallPlasterMat: THREE.MeshStandardMaterial;
  concreteColumnMat: THREE.MeshStandardMaterial;
  sonomaOakMat: THREE.MeshStandardMaterial;
  steelFrameMat: THREE.MeshStandardMaterial;
  chairSeatMat: THREE.MeshStandardMaterial;
  cableGrommetMat: THREE.MeshStandardMaterial;
  screenBezelMat: THREE.MeshStandardMaterial;
  projectorMat: THREE.MeshStandardMaterial;
  blindsMat: THREE.MeshStandardMaterial;
  radiatorMat: THREE.MeshStandardMaterial;
  glassPartitionMat: THREE.MeshStandardMaterial;
  frostedStripeMat: THREE.MeshStandardMaterial;
  doorMat: THREE.MeshStandardMaterial;
  ceilingCorniceMat: THREE.MeshStandardMaterial;
}

let sharedMaterials: SharedClassroomMaterials | null = null;

function getSharedClassroomMaterials(): SharedClassroomMaterials {
  if (sharedMaterials) return sharedMaterials;

  const woodPbr = getInteriorWoodTextures(3, 3);
  sharedMaterials = {
    // Warm light terrazzo / linoleum floor tile
    floorMat: new THREE.MeshStandardMaterial({
      color: '#ede8dd',
      map: woodPbr?.map ?? null,
      normalMap: woodPbr?.normalMap ?? null,
      normalScale: new THREE.Vector2(0.12, 0.12),
      roughness: 0.55,
      metalness: 0.0,
    }),
    wallPlasterMat: new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      roughness: 0.85,
      metalness: 0.0,
    }),
    concreteColumnMat: new THREE.MeshStandardMaterial({
      color: '#e2e8f0',
      roughness: 0.88,
      metalness: 0.05,
    }),
    // ЛДСП 16 мм Дуб сонома per Sheet 1
    sonomaOakMat: new THREE.MeshStandardMaterial({
      color: '#d5be9e',
      map: woodPbr?.map ?? null,
      normalMap: woodPbr?.normalMap ?? null,
      normalScale: new THREE.Vector2(0.15, 0.15),
      roughness: 0.45,
      metalness: 0.0,
    }),
    // Стальной каркас (black tubular metal frame)
    steelFrameMat: new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.35,
      metalness: 0.75,
    }),
    // Стул на металлокаркасе (matte ergonomic seat & backrest)
    chairSeatMat: new THREE.MeshStandardMaterial({
      color: '#18181b',
      roughness: 0.45,
      metalness: 0.05,
    }),
    cableGrommetMat: new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.3,
      metalness: 0.6,
    }),
    screenBezelMat: new THREE.MeshStandardMaterial({
      color: '#0f172a',
      roughness: 0.2,
      metalness: 0.85,
    }),
    projectorMat: new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      roughness: 0.3,
      metalness: 0.2,
    }),
    blindsMat: new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.6,
      metalness: 0.25,
    }),
    radiatorMat: new THREE.MeshStandardMaterial({
      color: '#f1f5f9',
      roughness: 0.7,
    }),
    glassPartitionMat: new THREE.MeshStandardMaterial({
      color: '#bae6fd',
      transparent: true,
      opacity: 0.35,
      roughness: 0.1,
      metalness: 0.2,
      depthWrite: false,
    }),
    frostedStripeMat: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.82,
      roughness: 0.35,
    }),
    doorMat: new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.4,
      metalness: 0.6,
    }),
    ceilingCorniceMat: new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      roughness: 0.9,
    }),
  };
  return sharedMaterials;
}

// Shared unit primitives
const sharedUnitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
const sharedUnitPlaneGeo = new THREE.PlaneGeometry(1, 1);

/**
 * Pre-merged static geometries for a 2-Seater Study Booth Unit ("Учебные парты-кабины двухместные")
 * with 2 Ergonomic Chairs per Sheet 1 Group I25C:
 * 1. Sonoma Oak woodwork: Desktop (1600 x 600 mm), 3 rounded acoustic privacy wings (h=950 mm), modesty panel.
 * 2. Black steel metalwork: Leg frames, foot rails, cable grommets, chair legs.
 * 3. Ergonomic black seats: 2 contoured seats + 2 curved backrests.
 */
export const sharedBoothUnitGeos = (() => {
  // 1. Sonoma Oak woodwork
  const woodParts: THREE.BufferGeometry[] = [];

  // Desktop (1600 x 600 x 25 mm) at height DESK_SURFACE_HEIGHT
  const topGeo = new THREE.BoxGeometry(BOOTH_WIDTH, 0.025, BOOTH_DEPTH);
  topGeo.translate(0, DESK_SURFACE_HEIGHT, 0);
  woodParts.push(topGeo);

  // Modesty backboard (front of desk facing teaching wall at Z = +BOOTH_DEPTH / 2 - 0.02)
  const modestyGeo = new THREE.BoxGeometry(BOOTH_WIDTH - 0.04, 0.42, 0.016);
  modestyGeo.translate(0, DESK_SURFACE_HEIGHT - 0.22, BOOTH_DEPTH / 2 - 0.02);
  woodParts.push(modestyGeo);

  // 3 Acoustic privacy divider wings: left wing (x = -BOOTH_WIDTH/2), center divider (x = 0), right wing (x = +BOOTH_WIDTH/2)
  // Each wing precisely spans the desk depth [-BOOTH_DEPTH/2, BOOTH_DEPTH/2] (-0.30m to +0.30m)
  // with rounded front-top corner per blueprint isometric detail (r = WING_FILLET_RADIUS)
  const halfD = BOOTH_DEPTH / 2;
  const wingShape = new THREE.Shape();
  wingShape.moveTo(-halfD, 0);
  wingShape.lineTo(-halfD, WING_HEIGHT);
  wingShape.lineTo(halfD - WING_FILLET_RADIUS, WING_HEIGHT);
  wingShape.absarc(
    halfD - WING_FILLET_RADIUS,
    WING_HEIGHT - WING_FILLET_RADIUS,
    WING_FILLET_RADIUS,
    Math.PI / 2,
    0,
    true
  );
  wingShape.lineTo(halfD, 0);
  wingShape.closePath();

  for (const wx of [-BOOTH_WIDTH / 2 + 0.01, 0, BOOTH_WIDTH / 2 - 0.01]) {
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.02, bevelEnabled: false });
    // Center extrusion thickness around 0:
    wingGeo.translate(0, 0, -0.01);
    // Rotate so shape X maps to 3D Z:
    wingGeo.rotateY(-Math.PI / 2);
    // Position at wx (flush with desk sides and center divider):
    wingGeo.translate(wx, 0, 0);
    woodParts.push(wingGeo);
  }
  const boothWoodGeo = mergeStaticGeometries(woodParts);

  // 2. Black steel metalwork
  const metalParts: THREE.BufferGeometry[] = [];

  // Desk tubular leg supports under wings
  for (const lx of [-BOOTH_WIDTH / 2 + 0.01, 0, BOOTH_WIDTH / 2 - 0.01]) {
    // 2 upright posts per wing
    for (const pz of [-BOOTH_DEPTH / 2 + 0.08, BOOTH_DEPTH / 2 - 0.08]) {
      const post = new THREE.CylinderGeometry(0.015, 0.015, DESK_SURFACE_HEIGHT, 8);
      post.translate(lx, DESK_SURFACE_HEIGHT / 2, pz);
      metalParts.push(post);
    }
    // Floor rail
    const rail = new THREE.BoxGeometry(0.03, 0.025, BOOTH_DEPTH - 0.06);
    rail.translate(lx, 0.015, 0);
    metalParts.push(rail);
  }

  // Cable-channel grommets (d=60 mm per blueprint)
  for (const gx of [-BOOTH_WIDTH / 4, BOOTH_WIDTH / 4]) {
    const grommet = new THREE.CylinderGeometry(0.03, 0.03, 0.028, 12);
    grommet.translate(gx, DESK_SURFACE_HEIGHT + 0.005, BOOTH_DEPTH / 4);
    metalParts.push(grommet);
  }

  // Chair legs (4 tubular legs per chair)
  const chairZ = -BOOTH_DEPTH / 2 - 0.28;
  const chairLegOffsets: [number, number][] = [
    [-0.17, -0.16],
    [0.17, -0.16],
    [-0.17, 0.16],
    [0.17, 0.16],
  ];
  for (const chX of [-BOOTH_WIDTH / 4, BOOTH_WIDTH / 4]) {
    for (const [lx, lz] of chairLegOffsets) {
      const leg = new THREE.CylinderGeometry(0.012, 0.012, 0.44, 8);
      leg.translate(chX + lx, 0.22, chairZ + lz);
      metalParts.push(leg);
    }
  }
  const boothMetalGeo = mergeStaticGeometries(metalParts);

  // 3. Ergonomic black chair seats & curved backrests per blueprint
  const chairParts: THREE.BufferGeometry[] = [];
  for (const chX of [-BOOTH_WIDTH / 4, BOOTH_WIDTH / 4]) {
    // Contoured seat at height 450 mm
    const seat = new THREE.BoxGeometry(0.44, 0.035, 0.42);
    seat.translate(chX, 0.44, chairZ);
    chairParts.push(seat);

    // Ergonomic curved backrest up to 800 mm
    const back = new THREE.BoxGeometry(0.42, 0.34, 0.025);
    back.rotateX(-0.1);
    back.translate(chX, 0.70, chairZ - 0.18);
    chairParts.push(back);
  }
  const chairSeatGeo = mergeStaticGeometries(chairParts);

  return { boothWoodGeo, boothMetalGeo, chairSeatGeo };
})();

/**
 * High-fidelity 3D Architectural Classroom Interior designed to exact specifications of:
 * CAD Sheet 1 Group I25C ("ПЛАН УЧЕБНОЙ АУДИТОРИИ. ПЛАН, РАЗРЕЗ, ДЕТАЛИ МЕБЕЛИ"):
 *
 * 1. Double Study Booths ("Учебные парты-кабины двухместные", 1600 x 600 mm) in Sonoma Oak ("ЛДСП 16 мм Дуб сонома")
 *    with 950 mm rounded side privacy wings, steel frame, and cable grommets (d=60).
 * 2. Chairs on metal frame ("Стул на металлокаркасе", black ergonomic seat at 450 mm, backrest at 800 mm).
 * 3. Front Wall: Interactive Smartboard ("Интерактивная доска"), Teacher's Lectern ("Кафедра"), entrance door.
 * 4. Ceiling: Projector bracket ("Кронштейн проектора") pointing at the interactive screen.
 * 5. Rear Wall: Feature decorative architectural mural ("Стена с декоративной росписью").
 * 6. Window Wall: Panoramic bay windows ("Оконный проем", 6000 mm bays) with reinforced concrete columns ("Железобетонная колонна") and convector radiators.
 * 7. Corridor Wall: Frosted and clear glass partitions ("Перегородка из матового стекла", "Внутренняя стекла").
 * 8. Open Ceiling: Perimeter cornice and lintel ("Железобетонный ригель") leaving the center 100% open so no element obstructs camera view!
 */
export function ClassroomInterior3D({
  position,
  size,
  capacity = 36,
  roomNumber = 'Lecture Room',
  isBigLecture = false,
  selected = false,
}: ClassroomInteriorProps) {
  const [cx, cy, cz] = position;
  const [w, h, d] = size;

  // Architectural orientation:
  // The long axis of the room is the roomLength (from rear mural wall to front teaching wall).
  // The short axis is the roomWidth (from exterior window wall to corridor partition wall).
  const isXLong = w >= d;
  const roomLength = isXLong ? w : d;
  const roomWidth = isXLong ? d : w;

  const materials = useMemo(() => getSharedClassroomMaterials(), []);
  const screenMat = useMemo(() => getLectureScreenMaterial(roomNumber), [roomNumber]);
  const muralMat = useMemo(() => getRearMuralMaterial(), []);

  // Seating arrangement per blueprint:
  // 2 banks of desks (Window side bank and Corridor side bank) separated by central aisle.
  // Large lecture halls (width > 8.5m) get 3 banks.
  const columnCount = roomWidth > 8.5 ? 3 : 2;
  const colCenters = useMemo(() => {
    if (columnCount === 2) {
      // 2 banks centered in left and right halves with wide central aisle
      const halfW = roomWidth / 2;
      return [-halfW / 2, halfW / 2];
    }
    const spacing = (roomWidth - 2.4) / 2;
    return [-spacing, 0, spacing];
  }, [columnCount, roomWidth]);

  // Rows along Z:
  // Rows face +Z (toward front interactive board).
  // Front clearance ~2.4m for lectern & presentation zone, rear clearance ~1.4m for aisle & mural.
  const numRows = Math.min(
    10,
    Math.max(3, Math.floor((roomLength - 3.8) / 1.15))
  );

  const rowOffsets = useMemo(() => {
    const offsets: number[] = [];
    const startZ = -roomLength / 2 + 1.8;
    for (let r = 0; r < numRows; r++) {
      offsets.push(startZ + r * 1.15);
    }
    return offsets;
  }, [numRows, roomLength]);

  // Instanced booth meshes (wood, metal, seats)
  const boothInstancedMeshes = useMemo(() => {
    const boothCount = rowOffsets.length * colCenters.length;
    if (boothCount <= 0) return null;

    const woodMesh = new THREE.InstancedMesh(
      sharedBoothUnitGeos.boothWoodGeo,
      materials.sonomaOakMat,
      boothCount
    );
    const metalMesh = new THREE.InstancedMesh(
      sharedBoothUnitGeos.boothMetalGeo,
      materials.steelFrameMat,
      boothCount
    );
    const chairMesh = new THREE.InstancedMesh(
      sharedBoothUnitGeos.chairSeatGeo,
      materials.chairSeatMat,
      boothCount
    );

    woodMesh.castShadow = true;
    woodMesh.receiveShadow = true;
    chairMesh.castShadow = true;

    const dummy = new THREE.Object3D();
    let idx = 0;
    const baseY = -h / 2;

    for (const rz of rowOffsets) {
      for (const cxCol of colCenters) {
        dummy.position.set(cxCol, baseY, rz);
        dummy.rotation.set(0, 0, 0); // Desks face +Z toward front teaching wall
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();

        woodMesh.setMatrixAt(idx, dummy.matrix);
        metalMesh.setMatrixAt(idx, dummy.matrix);
        chairMesh.setMatrixAt(idx, dummy.matrix);
        idx++;
      }
    }

    woodMesh.instanceMatrix.needsUpdate = true;
    metalMesh.instanceMatrix.needsUpdate = true;
    chairMesh.instanceMatrix.needsUpdate = true;

    return { woodMesh, metalMesh, chairMesh };
  }, [rowOffsets, colCenters, h, materials]);

  useEffect(() => {
    if (!boothInstancedMeshes) return;
    return () => {
      boothInstancedMeshes.woodMesh.dispose();
      boothInstancedMeshes.metalMesh.dispose();
      boothInstancedMeshes.chairMesh.dispose();
    };
  }, [boothInstancedMeshes]);

  // Interactive screen size
  const screenWidth = Math.min(3.6, roomWidth * 0.55);
  const screenHeight = 1.7;

  // Window bay count along room length (matching ~6.0m bays)
  const bayCount = Math.max(2, Math.round(roomLength / 5.5));
  const columnPositionsZ = useMemo(() => {
    const positions: number[] = [];
    const baySpacing = roomLength / bayCount;
    for (let i = 1; i < bayCount; i++) {
      positions.push(-roomLength / 2 + i * baySpacing);
    }
    return positions;
  }, [bayCount, roomLength]);

  return (
    <group
      position={[cx, cy, cz]}
      rotation={[0, isXLong ? -Math.PI / 2 : 0, 0]}
    >
      {/* 1. Floor Slab */}
      <mesh
        position={[0, -h / 2 + 0.015, 0]}
        scale={[roomWidth - 0.04, 0.03, roomLength - 0.04]}
        geometry={sharedUnitBoxGeo}
        material={materials.floorMat}
        receiveShadow
      />

      {/* 2. Perimeter Walls */}
      {/* Front Teaching Wall (+Z) */}
      <mesh
        position={[0, 0, roomLength / 2 - 0.08]}
        scale={[roomWidth, h, 0.16]}
        geometry={sharedUnitBoxGeo}
        material={materials.wallPlasterMat}
      />

      {/* Rear Mural Feature Wall (-Z) */}
      <mesh
        position={[0, 0, -roomLength / 2 + 0.08]}
        scale={[roomWidth, h, 0.16]}
        geometry={sharedUnitBoxGeo}
        material={materials.wallPlasterMat}
      />

      {/* Exterior Window Wall (-X) */}
      <mesh
        position={[-roomWidth / 2 + 0.08, 0, 0]}
        scale={[0.16, h, roomLength]}
        geometry={sharedUnitBoxGeo}
        material={materials.wallPlasterMat}
      />

      {/* Corridor Glass Partition Wall (+X) */}
      <mesh
        position={[roomWidth / 2 - 0.08, 0, 0]}
        scale={[0.08, h - 0.1, roomLength - 0.2]}
        geometry={sharedUnitBoxGeo}
        material={materials.glassPartitionMat}
      />

      {/* Frosted privacy film stripes along corridor glass */}
      {[0.85, 1.15, 1.45].map((sy, idx) => (
        <mesh
          key={`frosted-${idx}`}
          position={[roomWidth / 2 - 0.075, -h / 2 + sy, 0]}
          scale={[0.09, 0.14, roomLength - 0.3]}
          geometry={sharedUnitBoxGeo}
          material={materials.frostedStripeMat}
        />
      ))}

      {/* 3. Reinforced Concrete Columns ("Железобетонная колонна") along window and corridor walls */}
      {columnPositionsZ.map((colZ, idx) => (
        <React.Fragment key={`column-${idx}`}>
          {/* Column on Window Wall */}
          <mesh
            position={[-roomWidth / 2 + 0.22, 0, colZ]}
            scale={[0.32, h, 0.48]}
            geometry={sharedUnitBoxGeo}
            material={materials.concreteColumnMat}
          />
          {/* Column on Corridor Wall */}
          <mesh
            position={[roomWidth / 2 - 0.22, 0, colZ]}
            scale={[0.32, h, 0.48]}
            geometry={sharedUnitBoxGeo}
            material={materials.concreteColumnMat}
          />
        </React.Fragment>
      ))}

      {/* 4. Rear Decorative Architectural Mural ("Стена с декоративной росписью") */}
      <group position={[0, -h / 2 + 1.45, -roomLength / 2 + 0.18]}>
        <mesh
          scale={[roomWidth - 0.8, 2.3, 0.04]}
          geometry={sharedUnitBoxGeo}
          material={materials.screenBezelMat}
        />
        <mesh
          position={[0, 0, 0.025]}
          scale={[roomWidth - 0.84, 2.26, 1]}
          geometry={sharedUnitPlaneGeo}
          material={muralMat}
        />
      </group>

      {/* 5. Front Teaching Wall Ensemble ("Интерактивная доска", "Кафедра") */}
      {/* Interactive Smartboard */}
      <group position={[0, -h / 2 + 1.65, roomLength / 2 - 0.18]}>
        <mesh
          scale={[screenWidth + 0.08, screenHeight + 0.08, 0.06]}
          geometry={sharedUnitBoxGeo}
          material={materials.screenBezelMat}
          castShadow
        />
        <mesh
          position={[0, 0, -0.035]}
          rotation={[0, Math.PI, 0]}
          scale={[screenWidth, screenHeight, 1]}
          geometry={sharedUnitPlaneGeo}
          material={screenMat}
        />
        {/* Soundbar / Stylus tray */}
        <mesh
          position={[0, -screenHeight / 2 - 0.06, -0.03]}
          scale={[screenWidth * 0.7, 0.06, 0.06]}
          geometry={sharedUnitBoxGeo}
          material={materials.screenBezelMat}
        />
      </group>

      {/* Teacher Podium / Lectern ("Кафедра") in Sonoma Oak & Black Steel */}
      <group
        position={[
          roomWidth / 2 - 1.15,
          -h / 2,
          roomLength / 2 - 1.25,
        ]}
        rotation={[0, -Math.PI * 0.75, 0]}
      >
        {/* Sonoma oak angled reading top */}
        <mesh
          position={[0, 1.05, 0]}
          rotation={[-0.25, 0, 0]}
          scale={[0.72, 0.03, 0.52]}
          geometry={sharedUnitBoxGeo}
          material={materials.sonomaOakMat}
          castShadow
        />
        {/* Front modesty board */}
        <mesh
          position={[0, 0.58, 0.22]}
          scale={[0.66, 0.85, 0.02]}
          geometry={sharedUnitBoxGeo}
          material={materials.sonomaOakMat}
        />
        {/* Black steel pedestal and base plate */}
        <mesh
          position={[0, 0.50, 0]}
          scale={[0.06, 1.0, 0.06]}
          geometry={sharedUnitBoxGeo}
          material={materials.steelFrameMat}
        />
        <mesh
          position={[0, 0.02, 0]}
          scale={[0.54, 0.03, 0.44]}
          geometry={sharedUnitBoxGeo}
          material={materials.steelFrameMat}
        />
        {/* Instructor laptop mockup */}
        <mesh
          position={[0, 1.10, -0.02]}
          rotation={[-0.25, 0, 0]}
          scale={[0.32, 0.015, 0.22]}
          geometry={sharedUnitBoxGeo}
          material={materials.screenBezelMat}
        />
      </group>

      {/* Ceiling Digital Projector Mount ("Кронштейн проектора") */}
      <group position={[0, h / 2 - 0.35, roomLength / 2 - 3.2]}>
        {/* Telescopic ceiling rod */}
        <mesh
          position={[0, 0.16, 0]}
          scale={[0.04, 0.35, 0.04]}
          geometry={sharedUnitBoxGeo}
          material={materials.steelFrameMat}
        />
        {/* Projector body */}
        <mesh
          scale={[0.38, 0.14, 0.28]}
          geometry={sharedUnitBoxGeo}
          material={materials.projectorMat}
        />
        {/* Optical projection lens pointed at the board (+Z) */}
        <mesh
          position={[0, 0, 0.15]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[0.06, 0.04, 0.06]}
          geometry={new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16)}
          material={materials.screenBezelMat}
        />
      </group>

      {/* Entrance Door (Front) */}
      <group position={[roomWidth / 2 - 0.05, -h / 2 + 1.1, roomLength / 2 - 0.95]}>
        <mesh
          scale={[0.06, 2.15, 0.95]}
          geometry={sharedUnitBoxGeo}
          material={materials.doorMat}
        />
        {/* Handle */}
        <mesh
          position={[-0.04, 0, -0.32]}
          scale={[0.04, 0.18, 0.03]}
          geometry={sharedUnitBoxGeo}
          material={materials.steelFrameMat}
        />
      </group>

      {/* 6. Instanced Student Desks and Ergonomic Chairs */}
      {boothInstancedMeshes && (
        <group name="classroom-booths-instanced">
          <primitive object={boothInstancedMeshes.woodMesh} />
          <primitive object={boothInstancedMeshes.metalMesh} />
          <primitive object={boothInstancedMeshes.chairMesh} />
        </group>
      )}

      {/* 7. Window Bays: Louver Blinds and Convector Radiators */}
      {Array.from({ length: bayCount }).map((_, bIdx) => {
        const bayZ = -roomLength / 2 + (bIdx + 0.5) * (roomLength / bayCount);
        return (
          <group key={`window-bay-${bIdx}`} position={[-roomWidth / 2 + 0.15, 0, bayZ]}>
            {/* Louver blind cassette */}
            <mesh
              position={[0, h / 2 - 0.18, 0]}
              scale={[0.08, 0.12, (roomLength / bayCount) - 0.6]}
              geometry={sharedUnitBoxGeo}
              material={materials.blindsMat}
            />
            {/* Venetian blind sheet */}
            <mesh
              position={[0, 0.15, 0]}
              scale={[0.03, h - 0.8, (roomLength / bayCount) - 0.65]}
              geometry={sharedUnitBoxGeo}
              material={materials.blindsMat}
            />
            {/* Convector heating radiator */}
            <mesh
              position={[0.1, -h / 2 + 0.25, 0]}
              scale={[0.20, 0.48, (roomLength / bayCount) - 0.8]}
              geometry={sharedUnitBoxGeo}
              material={materials.radiatorMat}
            />
          </group>
        );
      })}

      {/* 8. Perimeter Armstrong Trim & Concrete Lintel ("Железобетонный ригель")
          Only along perimeter walls. NO transverse beam cutting through the center! */}
      <group position={[0, h / 2 - 0.05, 0]}>
        {/* Front & rear perimeter headers */}
        <mesh
          position={[0, 0, roomLength / 2 - 0.1]}
          scale={[roomWidth, 0.1, 0.2]}
          geometry={sharedUnitBoxGeo}
          material={materials.ceilingCorniceMat}
        />
        <mesh
          position={[0, 0, -roomLength / 2 + 0.1]}
          scale={[roomWidth, 0.1, 0.2]}
          geometry={sharedUnitBoxGeo}
          material={materials.ceilingCorniceMat}
        />
        {/* Window & corridor perimeter headers */}
        <mesh
          position={[-roomWidth / 2 + 0.1, 0, 0]}
          scale={[0.2, 0.1, roomLength]}
          geometry={sharedUnitBoxGeo}
          material={materials.ceilingCorniceMat}
        />
        <mesh
          position={[roomWidth / 2 - 0.1, 0, 0]}
          scale={[0.2, 0.1, roomLength]}
          geometry={sharedUnitBoxGeo}
          material={materials.ceilingCorniceMat}
        />
      </group>
    </group>
  );
}
