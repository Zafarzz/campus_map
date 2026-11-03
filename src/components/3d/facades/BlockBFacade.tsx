import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  NO_RAYCAST,
  StaticGeometryBatcher,
  disposeMergedMap,
} from '../geometry/staticGeometryMerger';
import { getArchitecturalWallTextures, getWindowGlassTexture } from '../materials/pbrMaterials';
import { BlockBLandscape } from './BlockBLandscape';

export type BlockBFacadeProps = {
  buildingWidth: number;
  buildingDepth: number;
  facing?: 'south' | 'north';
  wallHeight?: number;
  roofHeight?: number;
  opacity?: number;
  transparent?: boolean;
  wallColor?: string;
  trimColor?: string;
  plinthColor?: string;
  frameColor?: string;
  roofColor?: string;
  includeLandscape?: boolean;
};

/**
 * Creates a triangular prism geometry for the roof dormers (слуховые окна).
 */
function createTriangularDormerGeometry(baseWidth: number, height: number, depth: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-baseWidth / 2, 0);
  shape.lineTo(baseWidth / 2, 0);
  shape.lineTo(0, height);
  shape.closePath();

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
  });
  geom.translate(0, 0, -depth / 2);
  return geom;
}

/**
 * Highly accurate 3D architectural facade for Block B (Учебный корпус №2), facing the courtyard/driveway.
 * Optimized via StaticGeometryBatcher: merges all 44 classroom windows, stair ribbon windows, dormers,
 * rustication joints, and downpipes into 8 material-batched draw calls instead of ~340 individual meshes.
 */
export function BlockBFacade({
  buildingWidth,
  buildingDepth,
  facing = 'north',
  wallHeight = 14.4,
  opacity = 1,
  transparent = false,
  wallColor = '#ebdcc5',
  trimColor = '#f1e6cf',
  plinthColor = '#5c2d22',
  roofColor = '#991b1b',
  includeLandscape = true,
}: BlockBFacadeProps) {
  const BASE_CAD_WIDTH = 55.0;
  const facadeWidth = Math.max(BASE_CAD_WIDTH, buildingWidth);
  const scaleX = facadeWidth / BASE_CAD_WIDTH;

  const isSouth = facing === 'south';
  const sign = isSouth ? 1 : -1;
  const signX = 1;
  const wallZ = sign * (buildingDepth / 2);

  const plinthHeight = 1.0;
  const glassColor = '#0f172a';
  const pipeColor = '#853629';

  const wallTextures = useMemo(() => getArchitecturalWallTextures(14, 4), []);
  const glassTexture = useMemo(() => getWindowGlassTexture(), []);

  const materials = useMemo(() => {
    const wallMat = new THREE.MeshStandardMaterial({
      color: wallColor,
      map: wallTextures?.map ?? null,
      normalMap: wallTextures?.normalMap ?? null,
      normalScale: new THREE.Vector2(0.25, 0.25),
      roughnessMap: wallTextures?.roughnessMap ?? null,
      roughness: 0.78,
      metalness: 0.03,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const plinthMat = new THREE.MeshStandardMaterial({
      color: plinthColor,
      roughness: 0.85,
      metalness: 0.06,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: trimColor,
      roughness: 0.7,
      metalness: 0.05,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const frameMat = new THREE.MeshStandardMaterial({
      color: '#27272a',
      roughness: 0.35,
      metalness: 0.65,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const glassMat = new THREE.MeshStandardMaterial({
      color: glassColor,
      map: glassTexture ?? null,
      roughness: 0.12,
      metalness: 0.78,
      envMapIntensity: 1.45,
      transparent: true,
      opacity: transparent ? opacity * 0.85 : 0.94,
      depthWrite: !transparent,
    });

    const jointMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(wallColor).multiplyScalar(0.85),
      roughness: 0.9,
      metalness: 0,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const roofMat = new THREE.MeshStandardMaterial({
      color: roofColor,
      roughness: 0.7,
      metalness: 0.1,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const pipeMat = new THREE.MeshStandardMaterial({
      color: pipeColor,
      roughness: 0.5,
      metalness: 0.5,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    return { wallMat, plinthMat, trimMat, frameMat, glassMat, jointMat, roofMat, pipeMat };
  }, [wallColor, plinthColor, trimColor, roofColor, wallTextures, glassTexture, transparent, opacity]);

  const merged = useMemo(() => {
    const batcher = new StaticGeometryBatcher();

    const standardBayOffsets = [-24.0, -20.2, -16.4, -12.6, -5.8, -2.0, 1.8, 5.6, 13.5, 18.0, 22.5];
    const stairBayOffsets = [-9.2, 9.2];
    const downpipeOffsets = [-26.8, -10.8, 7.5, 26.8];

    const floorHeight = (wallHeight - plinthHeight) / 4;
    const floorCenterYs = [
      plinthHeight + floorHeight * 0.45,
      plinthHeight + floorHeight * 1.42,
      plinthHeight + floorHeight * 2.42,
      plinthHeight + floorHeight * 3.42,
    ];

    // 1. Plinth & Main Wall
    batcher.addBox('plinth', [facadeWidth + 0.1, plinthHeight, 0.22], [0, plinthHeight / 2, sign * 0.08]);
    batcher.addBox('trim', [facadeWidth + 0.15, 0.06, 0.16], [0, plinthHeight + 0.03, sign * 0.12]);
    batcher.addBox('wall', [facadeWidth, wallHeight, 0.15], [0, wallHeight / 2, 0]);

    // 2. Rustication seams & vertical joints
    batcher.addBox('joint', [facadeWidth, 0.025, 0.01], [0, plinthHeight, sign * 0.078]);
    for (let f = 0; f < 4; f++) {
      const base = plinthHeight + f * floorHeight;
      for (const yVal of [base + floorHeight * 0.15, base + floorHeight * 0.72, base + floorHeight]) {
        batcher.addBox('joint', [facadeWidth, 0.025, 0.01], [0, yVal, sign * 0.078]);
      }
    }
    for (const jx of [-10.8, 7.5]) {
      batcher.addBox('joint', [0.04, wallHeight, 0.015], [jx * scaleX * signX, wallHeight / 2, sign * 0.078]);
    }

    // 3. 44 Standard Classroom Windows
    const ww = 2.4 * scaleX;
    const wh = 1.8;
    const wz = sign * 0.08;
    for (const bayX of standardBayOffsets) {
      const wx = bayX * scaleX * signX;
      for (const wy of floorCenterYs) {
        batcher.addBox('frame', [ww, wh, 0.06], [wx, wy, wz]);
        batcher.addBox('glass', [ww - 0.12 * scaleX, wh - 0.14, 0.03], [wx, wy, wz + sign * 0.025]);
        for (const mx of [-ww / 3, ww / 3]) {
          batcher.addBox('frame', [0.06 * scaleX, wh - 0.14, 0.04], [wx + mx, wy, wz + sign * 0.045]);
        }
        batcher.addBox('frame', [ww - 0.12 * scaleX, 0.05, 0.04], [wx, wy + wh / 2 - 0.45, wz + sign * 0.045]);
        batcher.addBox('trim', [ww + 0.3 * scaleX, 0.1, 0.18], [wx, wy - wh / 2 - 0.05, wz + sign * 0.06]);
        batcher.addBox('trim', [ww + 0.2 * scaleX, 0.08, 0.14], [wx, wy + wh / 2 + 0.05, wz + sign * 0.04]);
      }
    }

    // 4. Staircase Bays
    const ribbonW = 2.8 * scaleX;
    const ribbonH = 0.75;
    for (const stairX of stairBayOffsets) {
      const sx = stairX * scaleX * signX;
      const dy = floorCenterYs[0] - 0.1;

      batcher.addBox('frame', [2.4 * scaleX, 2.3, 0.06], [sx, dy, wz]);
      batcher.addBox('glass', [2.24 * scaleX, 2.14, 0.03], [sx, dy, wz + sign * 0.025]);
      batcher.addBox('frame', [0.06 * scaleX, 2.14, 0.05], [sx, dy, wz + sign * 0.045]);
      batcher.addBox('trim', [2.8 * scaleX, 0.12, 0.8], [sx, dy + 1.25, wz + sign * 0.4]);
      for (const hx of [-0.15 * scaleX, 0.15 * scaleX]) {
        batcher.addBox('trim', [0.04, 0.7, 0.03], [sx + hx, dy, wz + sign * 0.07]);
      }

      for (const fIdx of [1, 2, 3]) {
        const ry = floorCenterYs[fIdx] + 0.35;
        batcher.addBox('frame', [ribbonW, ribbonH, 0.06], [sx, ry, wz]);
        batcher.addBox('glass', [ribbonW - 0.12 * scaleX, ribbonH - 0.12, 0.03], [sx, ry, wz + sign * 0.025]);
        for (const mx of [-ribbonW * 0.25, 0, ribbonW * 0.25]) {
          batcher.addBox('frame', [0.05 * scaleX, ribbonH - 0.12, 0.04], [sx + mx, ry, wz + sign * 0.045]);
        }
        batcher.addBox('trim', [ribbonW + 0.2 * scaleX, 0.08, 0.14], [sx, ry - ribbonH / 2 - 0.04, wz + sign * 0.05]);
        batcher.addBox('trim', [ribbonW + 0.2 * scaleX, 0.06, 0.12], [sx, ry + ribbonH / 2 + 0.04, wz + sign * 0.04]);
      }
    }

    // 5. Roof Cornice
    batcher.addBox('trim', [facadeWidth + 0.4, 0.24, 0.36], [0, wallHeight + 0.12, sign * 0.16]);
    batcher.addBox('trim', [facadeWidth + 0.6, 0.08, 0.44], [0, wallHeight + 0.26, sign * 0.2]);

    // 6. Twin Triangular Roof Dormers
    const dormerWallGeo = createTriangularDormerGeometry(2.4 * scaleX, 1.7, 1.4);
    const dormerFrameGeo = createTriangularDormerGeometry(1.6 * scaleX, 1.15, 0.08);
    const dormerGlassGeo = createTriangularDormerGeometry(1.48 * scaleX, 1.05, 0.04);
    const rakeBase = 1.2 * scaleX;
    const rakeH = 1.7;
    const rakeLen = Math.hypot(rakeBase, rakeH);
    const angle = Math.atan2(rakeH, rakeBase);

    for (const dormerX of stairBayOffsets) {
      const dx = dormerX * scaleX * signX;
      const dBaseY = wallHeight + 0.05;
      const dz = sign * 0.2;

      batcher.addGeometry('wall', dormerWallGeo, [dx, dBaseY, dz]);
      batcher.addGeometry('frame', dormerFrameGeo, [dx, dBaseY + 0.22, dz + sign * 0.06]);
      batcher.addGeometry('glass', dormerGlassGeo, [dx, dBaseY + 0.22, dz + sign * 0.08]);
      batcher.addBox('trim', [rakeLen + 0.15, 0.14, 0.2], [dx - rakeBase / 2, dBaseY + rakeH / 2, dz + sign * 0.05], [0, 0, angle]);
      batcher.addBox('trim', [rakeLen + 0.15, 0.14, 0.2], [dx + rakeBase / 2, dBaseY + rakeH / 2, dz + sign * 0.05], [0, 0, -angle]);
      batcher.addBox('roof', [2.2 * scaleX, 1.6, 1.0], [dx, dBaseY + 0.85, dz - sign * 0.4]);
    }
    dormerWallGeo.dispose();
    dormerFrameGeo.dispose();
    dormerGlassGeo.dispose();

    // 7. 4 Vertical Drainpipes
    const pipeH = wallHeight - 0.4;
    const pipeCy = pipeH / 2 + 0.4;
    const pz = sign * 0.18;
    for (const px of downpipeOffsets) {
      const pipeX = px * scaleX * signX;
      batcher.addCylinder('pipe', [0.06, 0.06, pipeH, 8], [pipeX, pipeCy, pz]);
      batcher.addCylinder('pipe', [0.12, 0.06, 0.2, 8], [pipeX, pipeCy + pipeH / 2 + 0.05, pz]);
      batcher.addCylinder('pipe', [0.06, 0.06, 0.25, 8], [pipeX, pipeCy - pipeH / 2 + 0.1, pz + sign * 0.08], [sign * 0.5, 0, 0]);
      for (const by of [-pipeH / 2 + 1.8, -pipeH / 2 + 5.4, -pipeH / 2 + 9.0, -pipeH / 2 + 12.6]) {
        batcher.addBox('frame', [0.18, 0.04, 0.12], [pipeX, pipeCy + by, pz - sign * 0.06]);
      }
    }

    return batcher.buildAll();
  }, [facadeWidth, scaleX, sign, signX, wallHeight]);

  useEffect(() => () => disposeMergedMap(merged), [merged]);

  return (
    <group position={[0, 0, wallZ]}>
      {merged.plinth && (
        <mesh geometry={merged.plinth} material={materials.plinthMat} raycast={NO_RAYCAST} castShadow receiveShadow />
      )}
      {merged.wall && (
        <mesh geometry={merged.wall} material={materials.wallMat} raycast={NO_RAYCAST} castShadow receiveShadow />
      )}
      {merged.joint && (
        <mesh geometry={merged.joint} material={materials.jointMat} raycast={NO_RAYCAST} />
      )}
      {merged.trim && (
        <mesh geometry={merged.trim} material={materials.trimMat} raycast={NO_RAYCAST} castShadow />
      )}
      {merged.frame && (
        <mesh geometry={merged.frame} material={materials.frameMat} raycast={NO_RAYCAST} />
      )}
      {merged.glass && (
        <mesh geometry={merged.glass} material={materials.glassMat} raycast={NO_RAYCAST} />
      )}
      {merged.roof && (
        <mesh geometry={merged.roof} material={materials.roofMat} raycast={NO_RAYCAST} />
      )}
      {merged.pipe && (
        <mesh geometry={merged.pipe} material={materials.pipeMat} raycast={NO_RAYCAST} />
      )}

      {includeLandscape && (
        <BlockBLandscape
          scaleX={scaleX}
          sign={sign}
          signX={signX}
          opacity={opacity}
          transparent={transparent}
        />
      )}
    </group>
  );
}
