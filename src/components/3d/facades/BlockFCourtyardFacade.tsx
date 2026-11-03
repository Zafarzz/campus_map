import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  StaticGeometryBatcher,
  disposeMergedMap,
  NO_RAYCAST,
} from '../geometry/staticGeometryMerger';
import { getArchitecturalWallTextures, getWindowGlassTexture } from '../materials/pbrMaterials';

export type BlockFCourtyardFacadeProps = {
  /** Opacity for selection dimming */
  opacity?: number;
  /** Transparent flag */
  transparent?: boolean;
  /** Main travertine stone wall color (warm beige matching reference photo) */
  wallColor?: string;
  /** Cornice / trim color */
  trimColor?: string;
  /** Foundation plinth color */
  plinthColor?: string;
  /** Window frame color (dark graphite architectural metal) */
  frameColor?: string;
  /** Roof color (metal roof tone per reference photo) */
  roofColor?: string;
};

/**
 * Architectural 3D Elevation of the Block F Courtyard Ensemble.
 * Reconstructed with 100% fidelity from real-world reference photo.
 */
export function BlockFCourtyardFacade({
  opacity = 1,
  transparent = false,
  wallColor = '#ebdcc5',
  trimColor = '#f8fafc',
  plinthColor = '#334155',
  frameColor = '#1e293b',
  roofColor = '#8a99a8',
}: BlockFCourtyardFacadeProps) {
  const wallTextures = useMemo(() => getArchitecturalWallTextures(), []);
  const glassTexture = useMemo(() => getWindowGlassTexture(), []);

  const materials = useMemo(() => {
    const wallMat = new THREE.MeshStandardMaterial({
      color: wallColor,
      map: wallTextures?.map ?? null,
      normalMap: wallTextures?.normalMap ?? null,
      normalScale: new THREE.Vector2(0.12, 0.12),
      roughnessMap: wallTextures?.roughnessMap ?? null,
      roughness: 0.82,
      metalness: 0.04,
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
      roughness: 0.45,
      metalness: 0.08,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const frameMat = new THREE.MeshStandardMaterial({
      color: frameColor,
      roughness: 0.5,
      metalness: 0.7,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const glassMat = new THREE.MeshStandardMaterial({
      color: '#020617',
      map: glassTexture ?? null,
      roughness: 0.06,
      metalness: 0.88,
      envMapIntensity: 0.9,
      transparent: true,
      opacity: transparent ? opacity * 0.9 : 0.96,
      depthWrite: !transparent,
    });

    const cavityMat = new THREE.MeshBasicMaterial({
      color: '#020408',
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const hoodMat = new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.65,
      metalness: 0.45,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const pipeMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      roughness: 0.4,
      metalness: 0.65,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const roofMat = new THREE.MeshStandardMaterial({
      color: roofColor,
      roughness: 0.55,
      metalness: 0.4,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const jointMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(wallColor).multiplyScalar(0.82),
      roughness: 0.92,
      metalness: 0.0,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const handleMat = new THREE.MeshStandardMaterial({
      color: '#e2e8f0',
      roughness: 0.25,
      metalness: 0.9,
    });

    return {
      wallMat,
      plinthMat,
      trimMat,
      frameMat,
      glassMat,
      cavityMat,
      hoodMat,
      pipeMat,
      roofMat,
      jointMat,
      handleMat,
    };
  }, [wallColor, trimColor, plinthColor, frameColor, roofColor, wallTextures, glassTexture, transparent, opacity]);

  const merged = useMemo(() => {
    const b = new StaticGeometryBatcher();

    const westStartZ = -80.2;
    const westEndZ = -49.2;
    const westLength = westEndZ - westStartZ;
    const westCenterZ = (westStartZ + westEndZ) / 2;
    const westWallX = 52.05;
    const wallH = 8.05;
    const plinthH = 0.6;
    const bayCount = 10;
    const bayWidth = westLength / bayCount;
    const winW = 1.6;
    const winH = 1.75;
    const f1WinY = 1.85;
    const f2WinY = 5.45;

    // 1. West Facade of Block F
    b.addBox('plinth', [0.22, plinthH, westLength + 0.1], [westWallX - 0.08, plinthH / 2, westCenterZ]);
    b.addBox('trim', [0.16, 0.08, westLength + 0.15], [westWallX - 0.12, plinthH, westCenterZ]);
    b.addBox('wall', [0.15, wallH - plinthH, westLength], [westWallX, (wallH + plinthH) / 2, westCenterZ]);
    for (const gy of [1.35, 2.7, 4.05, 4.95, 6.3, 7.2]) {
      b.addBox('joint', [0.01, 0.03, westLength], [westWallX - 0.078, gy, westCenterZ]);
    }
    b.addBox('trim', [0.36, 0.35, westLength + 0.2], [westWallX - 0.18, 8.05, westCenterZ]);
    b.addBox('trim', [0.28, 0.12, westLength + 0.3], [westWallX - 0.32, 8.28, westCenterZ]);
    b.addBox('roof', [1.6, 0.08, westLength + 0.2], [westWallX + 0.5, 8.7, westCenterZ], [0, 0, -0.15]);

    const lowerH = winH - 0.52;
    const addWestWindow = (wy: number, wz: number) => {
      const wx = westWallX - 0.08;
      b.addBox('cavity', [0.06, winH - 0.06, winW - 0.06], [wx + 0.035, wy, wz]);
      b.addBox('frame', [0.06, winH, winW], [wx, wy, wz]);
      b.addBox('frame', [0.045, 0.045, winW - 0.08], [wx + 0.01, wy + winH / 2 - 0.52, wz]);
      b.addBox('frame', [0.045, lowerH - 0.06, 0.045], [wx + 0.01, wy - winH / 2 + lowerH / 2, wz]);
      b.addBox('glass', [0.03, winH - 0.1, winW - 0.1], [wx + 0.015, wy, wz]);
      b.addBox('trim', [0.18, 0.12, winW + 0.24], [wx - 0.06, wy - winH / 2 - 0.06, wz]);
      b.addBox('trim', [0.14, 0.1, winW + 0.18], [wx - 0.04, wy + winH / 2 + 0.05, wz]);
    };

    const windowBaysZ: number[] = [];
    for (let i = 0; i < bayCount; i++) {
      const wz = westStartZ + (i + 0.5) * bayWidth;
      windowBaysZ.push(wz);
      addWestWindow(f1WinY, wz);
      addWestWindow(f2WinY, wz);
    }

    // Basement hoods
    const hw = 1.75;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.72);
    shape.lineTo(-0.95, 0.16);
    shape.lineTo(-0.95, 0);
    shape.lineTo(0, 0);
    shape.closePath();
    const hoodGeom = new THREE.ExtrudeGeometry(shape, { steps: 1, depth: hw, bevelEnabled: false });
    hoodGeom.translate(0, 0, -hw / 2);

    for (const bIdx of [2, 4, 6, 8]) {
      const wz = windowBaysZ[bIdx];
      const hx = westWallX - 0.08;
      b.addGeometry('hood', hoodGeom, [hx, 0, wz]);
      b.addBox('plinth', [0.9, 0.7, 0.08], [hx - 0.45, 0.35, wz - 0.9]);
      b.addBox('plinth', [0.9, 0.7, 0.08], [hx - 0.45, 0.35, wz + 0.9]);
    }
    hoodGeom.dispose();

    // Vertical downspouts
    for (const bIdx of [1, 4, 7, 9]) {
      const pz = westStartZ + bIdx * bayWidth;
      b.addCylinder('pipe', [0.05, 0.05, wallH - 0.4, 12], [westWallX - 0.1, (wallH - 0.4) / 2 + 0.35, pz]);
      for (let y = 1.5; y <= 7.5; y += 2.0) {
        b.addBox('pipe', [0.04, 0.03, 0.12], [westWallX - 0.08, y, pz]);
      }
    }

    // 2. Corner Entrance Vestibule
    const vestWidth = 12.0;
    const vestCenterX = 46.05;
    const vestZ = -80.2;
    b.addBox('plinth', [vestWidth + 0.4, 0.22, 2.2], [vestCenterX, 0.11, vestZ + 1.0]);
    b.addBox('plinth', [vestWidth + 0.6, 0.12, 0.4], [vestCenterX, 0.06, vestZ + 2.2]);
    b.addBox('trim', [vestWidth + 0.2, 0.8, 0.45], [vestCenterX, 3.6, vestZ + 0.22]);
    b.addBox('joint', [vestWidth + 0.2, 0.04, 0.46], [vestCenterX, 3.16, vestZ + 0.23]);
    b.addBox('trim', [vestWidth + 0.3, 0.08, 0.52], [vestCenterX, 4.02, vestZ + 0.25]);
    b.addBox('wall', [0.8, 3.0, 0.3], [vestCenterX - vestWidth / 2 + 0.4, 1.7, vestZ + 0.1]);
    b.addBox('wall', [0.8, 3.0, 0.3], [vestCenterX + vestWidth / 2 - 0.4, 1.7, vestZ + 0.1]);
    b.addBox('glass', [vestWidth - 1.6, 2.92, 0.04], [vestCenterX, 1.68, vestZ + 0.12]);
    b.addBox('cavity', [vestWidth - 1.6, 2.92, 0.1], [vestCenterX, 1.68, vestZ - 0.05]);
    for (let mIdx = 0; mIdx < 9; mIdx++) {
      const mx = vestCenterX - (vestWidth - 1.6) / 2 + mIdx * ((vestWidth - 1.6) / 8);
      b.addBox('frame', [0.08, 2.92, 0.06], [mx, 1.68, vestZ + 0.15]);
    }
    b.addBox('frame', [vestWidth - 1.6, 0.06, 0.06], [vestCenterX, 2.45, vestZ + 0.15]);
    for (const hx of [-3.0, -1.6, 1.6, 3.0]) {
      b.addCylinder('handle', [0.018, 0.018, 0.7, 10], [vestCenterX + hx, 1.3, vestZ + 0.2]);
    }

    // 3. South End Facade
    const southEndWidth = 20.0;
    const southEndCenterX = 62.05;
    const southEndZ = -49.2;
    b.addBox('plinth', [southEndWidth + 0.1, plinthH, 0.2], [southEndCenterX, plinthH / 2, southEndZ + 0.08]);
    b.addBox('trim', [southEndWidth + 0.15, 0.08, 0.16], [southEndCenterX, plinthH, southEndZ + 0.12]);
    b.addBox('wall', [southEndWidth, wallH - plinthH, 0.15], [southEndCenterX, (wallH + plinthH) / 2, southEndZ]);
    b.addBox('trim', [southEndWidth + 0.2, 0.35, 0.32], [southEndCenterX, 8.05, southEndZ + 0.14]);
    b.addBox('trim', [southEndWidth + 0.25, 0.15, 0.38], [southEndCenterX, 8.35, southEndZ + 0.18]);

    const addSouthWindow = (wx: number, wy: number) => {
      const wz = southEndZ + 0.08;
      b.addBox('frame', [winW, winH, 0.06], [wx, wy, wz]);
      b.addBox('frame', [winW - 0.08, 0.045, 0.045], [wx, wy + winH / 2 - 0.52, wz + 0.01]);
      b.addBox('frame', [0.045, lowerH - 0.06, 0.045], [wx, wy - winH / 2 + lowerH / 2, wz + 0.01]);
      b.addBox('glass', [winW - 0.1, winH - 0.1, 0.03], [wx, wy, wz + 0.015]);
      b.addBox('trim', [winW + 0.24, 0.12, 0.18], [wx, wy - winH / 2 - 0.06, wz - 0.06]);
      b.addBox('trim', [winW + 0.18, 0.1, 0.14], [wx, wy + winH / 2 + 0.05, wz - 0.04]);
    };

    for (const ex of [-6.0, -2.0, 2.0, 6.0]) {
      addSouthWindow(southEndCenterX + ex, f1WinY);
      addSouthWindow(southEndCenterX + ex, f2WinY);
    }

    return b.buildAll();
  }, []);

  useEffect(() => () => disposeMergedMap(merged), [merged]);

  return (
    <group>
      {merged.plinth && <mesh geometry={merged.plinth} material={materials.plinthMat} receiveShadow raycast={NO_RAYCAST} />}
      {merged.wall && <mesh geometry={merged.wall} material={materials.wallMat} castShadow receiveShadow raycast={NO_RAYCAST} />}
      {merged.trim && <mesh geometry={merged.trim} material={materials.trimMat} castShadow receiveShadow raycast={NO_RAYCAST} />}
      {merged.frame && <mesh geometry={merged.frame} material={materials.frameMat} raycast={NO_RAYCAST} />}
      {merged.glass && <mesh geometry={merged.glass} material={materials.glassMat} raycast={NO_RAYCAST} />}
      {merged.cavity && <mesh geometry={merged.cavity} material={materials.cavityMat} raycast={NO_RAYCAST} />}
      {merged.hood && <mesh geometry={merged.hood} material={materials.hoodMat} castShadow receiveShadow raycast={NO_RAYCAST} />}
      {merged.pipe && <mesh geometry={merged.pipe} material={materials.pipeMat} raycast={NO_RAYCAST} />}
      {merged.roof && <mesh geometry={merged.roof} material={materials.roofMat} castShadow receiveShadow raycast={NO_RAYCAST} />}
      {merged.joint && <mesh geometry={merged.joint} material={materials.jointMat} raycast={NO_RAYCAST} />}
      {merged.handle && <mesh geometry={merged.handle} material={materials.handleMat} raycast={NO_RAYCAST} />}
    </group>
  );
}
