import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Footprint } from '../../domain/geometry/types';
import {
  disposeMergedMap,
  NO_RAYCAST,
  StaticGeometryBatcher,
} from './geometry/staticGeometryMerger';

export type BlockCorridorProps = {
  floorId: string;
  floorElevation: number;
  parts: Footprint[];
};

function isCanvasSupported(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    return Boolean(c && typeof c.getContext === 'function');
  } catch {
    return false;
  }
}

let cachedFloorArrowTexture: THREE.CanvasTexture | null = null;

function getFloorArrowTexture(): THREE.CanvasTexture | null {
  if (cachedFloorArrowTexture) return cachedFloorArrowTexture;
  if (!isCanvasSupported()) return null;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }
  if (ctx) {
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(64, 28);
    ctx.lineTo(88, 56);
    ctx.lineTo(72, 56);
    ctx.lineTo(72, 96);
    ctx.lineTo(56, 96);
    ctx.lineTo(56, 56);
    ctx.lineTo(40, 56);
    ctx.closePath();
    ctx.fill();
  }

  cachedFloorArrowTexture = new THREE.CanvasTexture(canvas);
  cachedFloorArrowTexture.needsUpdate = true;
  return cachedFloorArrowTexture;
}

let cachedExitSignTexture: THREE.CanvasTexture | null = null;

function getExitSignTexture(): THREE.CanvasTexture | null {
  if (cachedExitSignTexture) return cachedExitSignTexture;
  if (!isCanvasSupported()) return null;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }
  if (ctx) {
    ctx.fillStyle = '#14532d';
    ctx.fillRect(0, 0, 256, 96);

    ctx.fillStyle = '#22c55e';
    ctx.fillRect(4, 4, 248, 88);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CHIQISH', 128, 38);
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('EXIT · ВЫХОД', 128, 72);
  }

  cachedExitSignTexture = new THREE.CanvasTexture(canvas);
  cachedExitSignTexture.needsUpdate = true;
  return cachedExitSignTexture;
}

interface SharedCorridorMaterials {
  floorCenterMat: THREE.MeshStandardMaterial;
  floorBorderMat: THREE.MeshStandardMaterial;
  lobbyFloorMat: THREE.MeshStandardMaterial;
  stairTreadMat: THREE.MeshStandardMaterial;
  stairRiserMat: THREE.MeshStandardMaterial;
  arrowMat: THREE.MeshStandardMaterial;
  wallMintMat: THREE.MeshStandardMaterial;
  partitionGlassMat: THREE.MeshStandardMaterial;
  frostedStripeMat: THREE.MeshStandardMaterial;
  frameMat: THREE.MeshStandardMaterial;
  steelRailMat: THREE.MeshStandardMaterial;
  exitSignMat: THREE.MeshStandardMaterial;
  ceilingMat: THREE.MeshStandardMaterial;
  ledMat: THREE.MeshStandardMaterial;
  radiatorMat: THREE.MeshStandardMaterial;
  pedestalMat: THREE.MeshStandardMaterial;
}

let sharedCorridorMaterials: SharedCorridorMaterials | null = null;

function getSharedCorridorMaterials(): SharedCorridorMaterials {
  if (sharedCorridorMaterials) return sharedCorridorMaterials;

  sharedCorridorMaterials = {
    floorCenterMat: new THREE.MeshStandardMaterial({
      color: '#eae3d2',
      roughness: 0.55,
      metalness: 0.05,
    }),
    floorBorderMat: new THREE.MeshStandardMaterial({
      color: '#475569',
      roughness: 0.65,
      metalness: 0.1,
    }),
    lobbyFloorMat: new THREE.MeshStandardMaterial({
      color: '#dcd5c9',
      roughness: 0.45,
      metalness: 0.08,
    }),
    stairTreadMat: new THREE.MeshStandardMaterial({
      color: '#f1f5f9',
      roughness: 0.4,
      metalness: 0.05,
    }),
    stairRiserMat: new THREE.MeshStandardMaterial({
      color: '#94a3b8',
      roughness: 0.8,
    }),
    arrowMat: new THREE.MeshStandardMaterial({
      color: '#16a34a',
      map: getFloorArrowTexture(),
      transparent: true,
      roughness: 0.4,
    }),
    wallMintMat: new THREE.MeshStandardMaterial({
      color: '#e4ebe6',
      roughness: 0.82,
    }),
    partitionGlassMat: new THREE.MeshStandardMaterial({
      color: '#bae6fd',
      transparent: true,
      opacity: 0.45,
      roughness: 0.1,
      metalness: 0.25,
      depthWrite: false,
    }),
    frostedStripeMat: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.85,
      roughness: 0.35,
    }),
    frameMat: new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.5,
      metalness: 0.5,
    }),
    steelRailMat: new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      roughness: 0.25,
      metalness: 0.85,
    }),
    exitSignMat: new THREE.MeshStandardMaterial({
      color: '#22c55e',
      map: getExitSignTexture(),
      emissive: '#16a34a',
      emissiveIntensity: 0.8,
      roughness: 0.3,
    }),
    ceilingMat: new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      roughness: 0.9,
    }),
    ledMat: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#ffffff',
      emissiveIntensity: 0.95,
      roughness: 0.2,
    }),
    radiatorMat: new THREE.MeshStandardMaterial({
      color: '#f1f5f9',
      roughness: 0.7,
    }),
    pedestalMat: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.3,
    }),
  };

  return sharedCorridorMaterials;
}

/**
 * 3D Corridors of Block B and Block E.
 * All ~95 sub-meshes per corridor floor are merged by material into 12 draw calls with NO_RAYCAST.
 */
export function BlockCorridor3D({ floorElevation, parts }: BlockCorridorProps) {
  const primaryPart = parts.find((p) => p.type === 'rect') ?? parts[0];
  if (!primaryPart || primaryPart.type !== 'rect') return null;

  const [cx, cz] = primaryPart.center;
  const [w, d] = primaryPart.size;
  const isXLong = w >= d;
  const corridorLen = isXLong ? w - 2.0 : d - 2.0;
  const corridorWidth = Math.min(1.6, isXLong ? d * 0.10 : w * 0.10);
  const corridorHeight = 2.8;

  const materials = useMemo(() => getSharedCorridorMaterials(), []);

  const merged = useMemo(() => {
    const batcher = new StaticGeometryBatcher();

    const bayCount = Math.max(4, Math.floor(corridorLen / 5.5));
    const bayStep = corridorLen / bayCount;
    const bayOffsets: number[] = [];
    for (let i = 0; i < bayCount; i++) {
      bayOffsets.push(-corridorLen / 2 + (i + 0.5) * bayStep);
    }

    const lobbyHalfW = corridorLen * 0.28;
    const lobbyDepth = d * 0.40;

    // 1. Two-Tone Corridor Flooring
    batcher.addBox('floorCenter', [corridorLen, 0.02, 1.0], [0, 0.012, 0]);
    for (const by of [-corridorWidth / 2 + 0.125, corridorWidth / 2 - 0.125]) {
      batcher.addBox('floorBorder', [corridorLen, 0.02, 0.25], [0, 0.012, by]);
    }

    // Green Directional Arrow Decals
    const arrowProto = new THREE.CircleGeometry(0.22, 16);
    arrowProto.applyMatrix4(
      new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2)),
    );
    for (const bx of bayOffsets) {
      batcher.addGeometry('arrow', arrowProto, [bx, 0.024, 0]);
    }
    arrowProto.dispose();

    // 2. North Corridor Partition Wall
    const nz = -corridorWidth / 2;
    for (const bx of bayOffsets) {
      batcher.addBox('wallMint', [0.6, corridorHeight, 0.12], [bx - bayStep / 2 + 0.3, corridorHeight / 2, nz]);
      batcher.addBox('partitionGlass', [bayStep - 1.2, corridorHeight - 0.1, 0.05], [bx + 0.2, corridorHeight / 2, nz]);
      for (const sy of [0.9, 1.15, 1.4]) {
        batcher.addBox('frostedStripe', [bayStep - 1.25, 0.12, 0.06], [bx + 0.2, sy, nz]);
      }
      batcher.addBox('frame', [0.08, 2.2, 0.08], [bx + 0.8, 1.1, nz]);
      batcher.addBox('frame', [0.08, 2.2, 0.08], [bx - 0.2, 1.1, nz]);
      batcher.addBox('frame', [1.08, 0.08, 0.08], [bx + 0.3, 2.15, nz]);
    }

    // 3. South Corridor Partition Wall (East & West wings)
    const sz = corridorWidth / 2;
    for (const bx of bayOffsets) {
      if (Math.abs(bx) <= lobbyHalfW) continue;
      batcher.addBox('wallMint', [0.6, corridorHeight, 0.12], [bx - bayStep / 2 + 0.3, corridorHeight / 2, sz]);
      batcher.addBox('partitionGlass', [bayStep - 1.2, corridorHeight - 0.1, 0.05], [bx + 0.2, corridorHeight / 2, sz]);
      for (const sy of [0.9, 1.15, 1.4]) {
        batcher.addBox('frostedStripe', [bayStep - 1.25, 0.12, 0.06], [bx + 0.2, sy, sz]);
      }
    }

    // 4. Lobby & Exhibition Hall
    const lobbyCenterZ = corridorWidth / 2 + lobbyDepth / 2;
    batcher.addBox('lobbyFloor', [lobbyHalfW * 2, 0.02, lobbyDepth], [0, 0.01, lobbyCenterZ]);

    for (const colX of [-lobbyHalfW * 0.45, lobbyHalfW * 0.45]) {
      for (const colZ of [-lobbyDepth * 0.25, lobbyDepth * 0.25]) {
        batcher.addCylinder('wallMint', [0.22, 0.24, corridorHeight, 16], [colX, corridorHeight / 2, lobbyCenterZ + colZ]);
      }
    }

    for (const px of [-2.2, 0, 2.2]) {
      batcher.addBox('pedestal', [1.2, 0.9, 0.9], [px, 0.45, lobbyCenterZ]);
      batcher.addBox('partitionGlass', [1.1, 0.4, 0.8], [px, 1.1, lobbyCenterZ]);
    }

    // 5. Dual Staircases in Lobby
    const stairW = 1.6;
    const stairD = lobbyDepth - 0.6;
    const stairH = 3.6;
    const stepCount = 12;
    const stepH = stairH / stepCount;
    const stepD = (stairD - 1.0) / stepCount;
    const angle = Math.atan2(stairH, stairD - 1.0);
    const railLen = Math.hypot(stairH, stairD - 1.0);

    for (const sx of [-lobbyHalfW * 0.72, lobbyHalfW * 0.72]) {
      const stZ = corridorWidth / 2 + 0.3;
      for (let i = 0; i < stepCount; i++) {
        const sy = (i + 0.5) * stepH;
        const stepZ = stZ + (i + 0.5) * stepD;
        batcher.addBox('stairTread', [stairW, 0.06, stepD + 0.04], [sx, sy, stepZ]);
        batcher.addBox('stairRiser', [stairW - 0.04, stepH, 0.04], [sx, sy - stepH / 2, stepZ - stepD / 2]);
      }
      batcher.addBox('stairTread', [stairW, 0.1, 1.0], [sx, stairH, stZ + stairD - 0.5]);

      for (const hx of [-stairW / 2 + 0.04, stairW / 2 - 0.04]) {
        batcher.addCylinder(
          'steelRail',
          [0.022, 0.022, railLen, 8],
          [sx + hx, stairH / 2 + 0.9, stZ + (stairD - 1.0) / 2],
          [angle, 0, 0],
        );
        batcher.addBox(
          'partitionGlass',
          [0.015, 0.75, railLen - 0.1],
          [sx + hx, stairH / 2 + 0.45, stZ + (stairD - 1.0) / 2],
          [angle, 0, 0],
        );
        batcher.addBox('steelRail', [0.04, 0.04, 1.0], [sx + hx, stairH + 0.9, stZ + stairD - 0.5]);
      }
    }

    // 6. Emergency Exit Door Portals
    [-corridorLen / 2 + 0.5, corridorLen / 2 - 0.5].forEach((ex, eIdx) => {
      const signX = eIdx === 0 ? 1 : -1;
      batcher.addBox('wallMint', [0.15, corridorHeight, 0.4], [ex, corridorHeight / 2, -corridorWidth / 2 + 0.2]);
      batcher.addBox('wallMint', [0.15, corridorHeight, 0.4], [ex, corridorHeight / 2, corridorWidth / 2 - 0.2]);
      batcher.addBox('partitionGlass', [0.04, 2.2, corridorWidth - 0.4], [ex, 1.1, 0]);
      batcher.addBox(
        'exitSign',
        [0.03, 0.26, 0.7],
        [ex + signX * 0.04, 2.4, 0],
        eIdx === 0 ? undefined : [0, Math.PI, 0],
      );
    });

    return batcher.buildAll();
  }, [corridorLen, corridorWidth, corridorHeight, d]);

  useEffect(() => {
    return () => {
      disposeMergedMap(merged);
    };
  }, [merged]);

  return (
    <group position={[cx, floorElevation, cz]} rotation={[0, isXLong ? 0 : Math.PI / 2, 0]}>
      {merged.floorCenter && (
        <mesh geometry={merged.floorCenter} material={materials.floorCenterMat} receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.floorBorder && (
        <mesh geometry={merged.floorBorder} material={materials.floorBorderMat} receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.arrow && (
        <mesh geometry={merged.arrow} material={materials.arrowMat} raycast={NO_RAYCAST} />
      )}
      {merged.wallMint && (
        <mesh geometry={merged.wallMint} material={materials.wallMintMat} castShadow raycast={NO_RAYCAST} />
      )}
      {merged.partitionGlass && (
        <mesh geometry={merged.partitionGlass} material={materials.partitionGlassMat} raycast={NO_RAYCAST} />
      )}
      {merged.frostedStripe && (
        <mesh geometry={merged.frostedStripe} material={materials.frostedStripeMat} raycast={NO_RAYCAST} />
      )}
      {merged.frame && (
        <mesh geometry={merged.frame} material={materials.frameMat} raycast={NO_RAYCAST} />
      )}
      {merged.lobbyFloor && (
        <mesh geometry={merged.lobbyFloor} material={materials.lobbyFloorMat} receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.pedestal && (
        <mesh geometry={merged.pedestal} material={materials.pedestalMat} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.stairTread && (
        <mesh geometry={merged.stairTread} material={materials.stairTreadMat} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.stairRiser && (
        <mesh geometry={merged.stairRiser} material={materials.stairRiserMat} raycast={NO_RAYCAST} />
      )}
      {merged.steelRail && (
        <mesh geometry={merged.steelRail} material={materials.steelRailMat} raycast={NO_RAYCAST} />
      )}
      {merged.exitSign && (
        <mesh geometry={merged.exitSign} material={materials.exitSignMat} raycast={NO_RAYCAST} />
      )}
    </group>
  );
}

