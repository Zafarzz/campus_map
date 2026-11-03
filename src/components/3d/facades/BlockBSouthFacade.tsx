import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  NO_RAYCAST,
  StaticGeometryBatcher,
  disposeMergedMap,
} from '../geometry/staticGeometryMerger';
import { getArchitecturalWallTextures, getWindowGlassTexture } from '../materials/pbrMaterials';

export type BlockBSouthFacadeProps = {
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
};

/**
 * Creates a triangular prism geometry for the central pediment (gable).
 */
function createTriangularPedimentGeometry(baseWidth: number, height: number, depth: number): THREE.BufferGeometry {
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
 * Highly accurate 3D architectural facade for Block B (Учебный корпус №2), facing south towards Block C.
 * Optimized via StaticGeometryBatcher: merges all 32 windows, central glazed curtain wall, pediment,
 * rustication joints, and downpipes into 8 material-batched draw calls instead of ~250 individual meshes.
 */
export function BlockBSouthFacade({
  buildingWidth,
  buildingDepth,
  facing = 'south',
  wallHeight = 14.4,
  opacity = 1,
  transparent = false,
  wallColor = '#ebdcc5',
  trimColor = '#f1e6cf',
  plinthColor = '#5c2d22',
  roofColor = '#991b1b',
}: BlockBSouthFacadeProps) {
  const BASE_CAD_WIDTH = 55.0;
  const facadeWidth = Math.max(BASE_CAD_WIDTH, buildingWidth);
  const scaleX = facadeWidth / BASE_CAD_WIDTH;

  const isSouth = facing === 'south';
  const sign = isSouth ? 1 : -1;
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

    const windowBayOffsets = [-24.5, -18.5, -12.5, -6.5, 6.5, 12.5, 18.5, 24.5];
    const rusticationLines = [1.0, 2.8, 3.6, 4.6, 6.4, 7.2, 8.2, 10.0, 10.8, 11.8, 13.6, 14.4];

    // 1. Plinth & Main Wall
    batcher.addBox('plinth', [facadeWidth + 0.1, plinthHeight, 0.22], [0, plinthHeight / 2, sign * 0.08]);
    batcher.addBox('trim', [facadeWidth + 0.15, 0.06, 0.16], [0, plinthHeight + 0.03, sign * 0.12]);
    batcher.addBox('wall', [facadeWidth, wallHeight, 0.15], [0, wallHeight / 2, 0]);

    // 2. Rustication joints
    for (const yVal of rusticationLines) {
      batcher.addBox('joint', [facadeWidth, 0.025, 0.01], [0, yVal, sign * 0.078]);
    }

    // 3 & 4. 1st Floor (2.0m wide) and 2nd–4th Floor (2.4m wide) Windows
    const wh = 1.8;
    const wz = sign * 0.08;
    const floors = [
      { wy: 1.9, ww: 2.0 * scaleX },
      { wy: 5.5, ww: 2.4 * scaleX },
      { wy: 9.1, ww: 2.4 * scaleX },
      { wy: 12.7, ww: 2.4 * scaleX },
    ];

    for (const { wy, ww } of floors) {
      for (const bayX of windowBayOffsets) {
        const wx = bayX * scaleX;
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

    // 5. Central Glazed Curtain Wall
    const curtainWidth = 7.0 * scaleX;
    const curtainHeight = 14.0;
    const curtainCenterY = 7.4;
    const cz = sign * 0.09;

    batcher.addBox('frame', [curtainWidth, curtainHeight, 0.06], [0, curtainCenterY, cz]);
    batcher.addBox('glass', [curtainWidth - 0.16 * scaleX, curtainHeight - 0.16, 0.04], [0, curtainCenterY, cz + sign * 0.025]);

    for (const mx of [-2.33, -1.17, 0, 1.17, 2.33]) {
      batcher.addBox('frame', [0.08 * scaleX, curtainHeight - 0.16, 0.06], [mx * scaleX, curtainCenterY, cz + sign * 0.05]);
    }
    for (const dy of [-3.8, -0.2, 3.4]) {
      batcher.addBox('frame', [curtainWidth - 0.16 * scaleX, 0.12, 0.06], [0, curtainCenterY + dy, cz + sign * 0.05]);
      batcher.addBox('frame', [curtainWidth * 0.52, 0.04, 0.02], [0, curtainCenterY + dy + 1.8, cz + sign * 0.048], [0, 0, Math.PI / 12]);
      batcher.addBox('frame', [curtainWidth * 0.52, 0.04, 0.02], [0, curtainCenterY + dy + 1.8, cz + sign * 0.048], [0, 0, -Math.PI / 12]);
    }
    for (const dy of [-5.6, -2.0, 1.6, 5.2]) {
      batcher.addBox('frame', [curtainWidth - 0.16 * scaleX, 0.06, 0.05], [0, curtainCenterY + dy, cz + sign * 0.045]);
    }

    // Ground Floor Entrance Doors in Center of Curtain Wall
    const doorCy = curtainCenterY - curtainHeight / 2 + 1.3;
    const doorZ = cz + sign * 0.05;
    batcher.addBox('frame', [2.4 * scaleX, 2.4, 0.06], [0, doorCy, doorZ]);
    batcher.addBox('glass', [2.24 * scaleX, 2.24, 0.03], [0, doorCy, doorZ + sign * 0.025]);
    batcher.addBox('frame', [0.06 * scaleX, 2.24, 0.05], [0, doorCy, doorZ + sign * 0.045]);
    batcher.addBox('trim', [0.04, 0.8, 0.04], [-0.15 * scaleX, doorCy, doorZ + sign * 0.08]);
    batcher.addBox('trim', [0.04, 0.8, 0.04], [0.15 * scaleX, doorCy, doorZ + sign * 0.08]);

    // 6. Triangular Roof Pediment
    const pedimentWallGeo = createTriangularPedimentGeometry(7.0 * scaleX, 2.4, 0.25);
    const pedimentFrameGeo = createTriangularPedimentGeometry(4.6 * scaleX, 1.6, 0.08);
    const pedimentGlassGeo = createTriangularPedimentGeometry(4.4 * scaleX, 1.5, 0.06);
    const pzPed = sign * 0.12;

    batcher.addGeometry('wall', pedimentWallGeo, [0, wallHeight, pzPed]);
    batcher.addGeometry('frame', pedimentFrameGeo, [0, wallHeight + 0.35, pzPed + sign * 0.06]);
    batcher.addGeometry('glass', pedimentGlassGeo, [0, wallHeight + 0.35, pzPed + sign * 0.08]);

    const rakeLen = Math.hypot(3.5 * scaleX, 2.4);
    const angle = Math.atan2(2.4, 3.5 * scaleX);
    batcher.addBox('trim', [rakeLen + 0.2, 0.2, 0.32], [-1.75 * scaleX, wallHeight + 1.2, pzPed + sign * 0.04], [0, 0, angle]);
    batcher.addBox('trim', [rakeLen + 0.2, 0.2, 0.32], [1.75 * scaleX, wallHeight + 1.2, pzPed + sign * 0.04], [0, 0, -angle]);
    batcher.addBox('roof', [6.8 * scaleX, 2.3, 0.3], [0, wallHeight + 1.15, pzPed - sign * 0.1]);

    pedimentWallGeo.dispose();
    pedimentFrameGeo.dispose();
    pedimentGlassGeo.dispose();

    // 7. Roof Cornice
    batcher.addBox('trim', [facadeWidth + 0.4, 0.3, 0.4], [0, wallHeight + 0.15, sign * 0.18]);
    batcher.addBox('trim', [facadeWidth + 0.6, 0.1, 0.48], [0, wallHeight + 0.32, sign * 0.22]);

    // 8. 4 Vertical Drainpipes
    const pipeH = wallHeight - 0.4;
    const pipeCy = pipeH / 2 + 0.4;
    const pz = sign * 0.18;
    for (const px of [-27.0, -3.8, 3.8, 27.0]) {
      const pipeX = px * scaleX;
      batcher.addCylinder('pipe', [0.06, 0.06, pipeH, 8], [pipeX, pipeCy, pz]);
      batcher.addCylinder('pipe', [0.12, 0.06, 0.2, 8], [pipeX, pipeCy + pipeH / 2 + 0.05, pz]);
      batcher.addCylinder('pipe', [0.06, 0.06, 0.25, 8], [pipeX, pipeCy - pipeH / 2 + 0.1, pz + sign * 0.08], [sign * 0.5, 0, 0]);
      for (const by of [-pipeH / 2 + 1.8, -pipeH / 2 + 5.4, -pipeH / 2 + 9.0, -pipeH / 2 + 12.6]) {
        batcher.addBox('frame', [0.18, 0.04, 0.12], [pipeX, pipeCy + by, pz - sign * 0.06]);
      }
    }

    return batcher.buildAll();
  }, [facadeWidth, scaleX, sign, wallHeight]);

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
    </group>
  );
}
