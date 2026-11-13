import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  disposeMergedMap,
  NO_RAYCAST,
  StaticGeometryBatcher,
} from './geometry/staticGeometryMerger';

let cachedPaverTexture: THREE.CanvasTexture | null = null;

/**
 * Procedural canvas texture for interlocking architectural stone pavers (singleton 256x256).
 */
function getPaverTexture(): THREE.CanvasTexture | null {
  if (cachedPaverTexture) return cachedPaverTexture;
  if (typeof document === 'undefined') return null;
  try {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#e2dfd8';
    ctx.fillRect(0, 0, size, size);

    const tileSize = 32;
    for (let y = 0; y < size; y += tileSize) {
      for (let x = 0; x < size; x += tileSize) {
        const offsetX = (y / tileSize) % 2 === 1 ? tileSize / 2 : 0;
        const tileX = (x + offsetX) % size;

        const shade = 220 + (((x * 7 + y * 13) % 20) - 10);
        ctx.fillStyle = `rgb(${shade + 4}, ${shade + 2}, ${shade - 2})`;
        ctx.fillRect(tileX + 1, y + 1, tileSize - 2, tileSize - 2);

        ctx.strokeStyle = '#c4c0b6';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(tileX + 1, y + 1, tileSize - 2, tileSize - 2);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 8);
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    cachedPaverTexture = texture;
    return texture;
  } catch {
    return null;
  }
}

export type WalkwaySegment = {
  center: [number, number]; // [x, z]
  size: [number, number];   // [width, depth]
  rotationY?: number;
  noCurbs?: boolean;
};

export function CampusWalkways() {
  const { paverMat, curbMat, crosswalkWhiteMat } = useMemo(() => {
    const paverMap = getPaverTexture();

    const paverMat = new THREE.MeshStandardMaterial({
      color: '#e7e5e0',
      map: paverMap,
      roughness: 0.88,
      metalness: 0.05,
    });

    const curbMat = new THREE.MeshStandardMaterial({
      color: '#94a3b8',
      roughness: 0.9,
    });

    const crosswalkWhiteMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    return { paverMat, curbMat, crosswalkWhiteMat };
  }, []);

  const merged = useMemo(() => {
    const batcher = new StaticGeometryBatcher();

    const toWorld = (
      ox: number,
      oy: number,
      oz: number,
      rotY: number,
      lx: number,
      ly: number,
      lz: number,
    ): [number, number, number] => {
      const c = Math.cos(rotY);
      const s = Math.sin(rotY);
      return [ox + lx * c + lz * s, oy + ly, oz - lx * s + lz * c];
    };

    const walkways: WalkwaySegment[] = [
      { center: [88.5, -10.0], size: [29.0, 140.0] },
      { center: [52.8, -54.0], size: [10.5, 36.0] },
      { center: [50.0, -35.0], size: [60.0, 5.0] },
      { center: [35.8, 16.0], size: [3.5, 52.0] },
      { center: [13.0, 16.0], size: [8.0, 52.0] },
      { center: [13.0, 64.0], size: [8.0, 44.0] },
      { center: [27.0, 76.5], size: [14.0, 16.0] },
      { center: [11.15, 78.0], size: [50.3, 6.0] },
      { center: [14.0, 105.5], size: [66.0, 5.0] },
      { center: [57.55, 128.25], size: [5.15, 50.5] },
      { center: [86.75, 116.5], size: [5.15, 69.0] },
      { center: [-21.35, 118.0], size: [5.0, 70.0] },
      { center: [-55.65, 103.5], size: [36.0, 19.5] },
      { center: [-55.65, 87.0], size: [36.0, 14.0] },
      { center: [-55.65, 125.6], size: [63.6, 3.2] },
      { center: [-85.75, 138.25], size: [4.5, 25.5] },
      { center: [-20.15, 129.0], size: [6.3, 10.0] },
      { center: [-55.65, 138.3], size: [6.0, 25.4] },
      { center: [-51.0, 151.0], size: [74.0, 4.0] },
      { center: [-32.0, -78.6], size: [36.0, 5.0] },
      { center: [-14.0, -104.0], size: [36.0, 6.0] },
      { center: [15.0, -68.0], size: [60.0, 6.0] },
      { center: [92.25, 36.25], size: [4.5, 33.5], rotationY: 0.227 },
      { center: [7.0, 139.0], size: [102.0, 5.5] },
      { center: [44.0, -57.6], size: [28.0, 39.0], noCurbs: true },
    ];

    for (const w of walkways) {
      const [wx, wz] = w.center;
      const wy = 0.055;
      const rotY = w.rotationY ?? 0;
      const rot: [number, number, number] | undefined = rotY ? [0, rotY, 0] : undefined;

      batcher.addBox('paver', [w.size[0], 0.016, w.size[1]], [wx, wy, wz], rot);

      if (!w.noCurbs) {
        const isXLonger = w.size[0] > w.size[1];
        if (isXLonger) {
          batcher.addBox(
            'curb',
            [w.size[0], 0.045, 0.16],
            toWorld(wx, wy, wz, rotY, 0, 0.02, -w.size[1] / 2 - 0.08),
            rot,
          );
          batcher.addBox(
            'curb',
            [w.size[0], 0.045, 0.16],
            toWorld(wx, wy, wz, rotY, 0, 0.02, w.size[1] / 2 + 0.08),
            rot,
          );
        } else {
          batcher.addBox(
            'curb',
            [0.16, 0.045, w.size[1]],
            toWorld(wx, wy, wz, rotY, -w.size[0] / 2 - 0.08, 0.02, 0),
            rot,
          );
          batcher.addBox(
            'curb',
            [0.16, 0.045, w.size[1]],
            toWorld(wx, wy, wz, rotY, w.size[0] / 2 + 0.08, 0.02, 0),
            rot,
          );
        }
      }
    }

    // Central Entrance Flared Round Plaza Node
    const circleGeo = new THREE.CircleGeometry(4.5, 32);
    circleGeo.rotateX(-Math.PI / 2);
    batcher.addGeometry('paver', circleGeo, [-55.65, 0.056, 137.0]);
    circleGeo.dispose();

    // Crosswalk markings
    const cwPos: [number, number, number] = [109.0, 0.041, -23.1];
    const cwSize: [number, number] = [8.6, 6.0];
    const stripeCount = Math.floor(cwSize[1] / 1.0);
    const stripeSpacing = cwSize[1] / stripeCount;
    for (let sIdx = 0; sIdx < stripeCount; sIdx++) {
      if (sIdx % 2 === 1) continue;
      const sz = -cwSize[1] / 2 + (sIdx + 0.5) * stripeSpacing;
      batcher.addBox(
        'crosswalk',
        [cwSize[0], 0.002, stripeSpacing * 0.75],
        [cwPos[0], cwPos[1], cwPos[2] + sz],
      );
    }

    return batcher.buildAll();
  }, []);

  useEffect(() => {
    return () => {
      disposeMergedMap(merged);
      paverMat.dispose();
      curbMat.dispose();
      crosswalkWhiteMat.dispose();
    };
  }, [merged, paverMat, curbMat, crosswalkWhiteMat]);

  return (
    <group>
      {merged.paver && (
        <mesh geometry={merged.paver} material={paverMat} receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.curb && (
        <mesh geometry={merged.curb} material={curbMat} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.crosswalk && (
        <mesh geometry={merged.crosswalk} material={crosswalkWhiteMat} raycast={NO_RAYCAST} />
      )}
    </group>
  );
}

