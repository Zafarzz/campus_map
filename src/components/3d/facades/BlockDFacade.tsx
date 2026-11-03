import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  StaticGeometryBatcher,
  disposeMergedMap,
  NO_RAYCAST,
} from '../geometry/staticGeometryMerger';
import {
  getArchitecturalWallTextures,
  getGranitePlinthTextures,
  getWindowGlassTexture,
} from '../materials/pbrMaterials';
import {
  applyArchitecturalGlassShader,
  applyTravertineWeatheringShader,
} from '../shaders/architecturalShaders';

export type BlockDFacadeProps = {
  /** Building mass length along X (m) */
  buildingWidth: number;
  /** Building mass depth along Z (m) */
  buildingDepth: number;
  /** Facing direction: 'south' faces lawn/fountain; 'north' faces inner rear */
  facing?: 'south' | 'north';
  /** Height up to cornice line (m), default 8.05 per CAD elevation */
  wallHeight?: number;
  /** Height of pitched hip roof (m), default 1.6 */
  roofHeight?: number;
  /** Opacity for selection dimming */
  opacity?: number;
  /** Transparent flag */
  transparent?: boolean;
  /** Main travertine stone wall color */
  wallColor?: string;
  /** Cornice / trim color */
  trimColor?: string;
  /** Foundation plinth color */
  plinthColor?: string;
  /** Window frame color (dark graphite architectural metal unified with Block C) */
  frameColor?: string;
  /** Roof & downspout drainpipe color (burgundy per CAD) */
  roofColor?: string;
};

/**
 * Architectural 3D Elevation of Academic Block D (2-storey Academic Building / Учебный корпус №2).
 * Reconstructed directly from CAD blueprint:
 * «ДВОРОВЫЙ ПРОДОЛЬНЫЙ ФАСАД 2-ЭТАЖНОГО УЧЕБНОГО КОРПУСА В ОСЯХ А–Ж (2D ЧЕРТЕЖ)».
 */
export function BlockDFacade({
  buildingWidth,
  buildingDepth,
  facing = 'south',
  wallHeight = 8.05,
  opacity = 1,
  transparent = false,
  wallColor = '#ebdcc5',
  trimColor = '#f8fafc',
  plinthColor = '#334155',
  frameColor = '#27272a',
  roofColor = '#991b1b',
}: BlockDFacadeProps) {
  const isSouth = facing === 'south';
  const wallZ = isSouth ? buildingDepth / 2 : -buildingDepth / 2;
  const sign = isSouth ? 1 : -1;

  const numBays = 6;
  const bayWidth = buildingWidth / numBays;
  const windowWidth = bayWidth * 0.75;
  const pilasterWidth = Math.max(0.55, bayWidth * 0.12);
  const winHeight = 2.0;

  const travertinePbr = useMemo(() => getArchitecturalWallTextures(12, 3), []);
  const plinthPbr = useMemo(() => getGranitePlinthTextures(4, 1), []);
  const glassTex = useMemo(() => getWindowGlassTexture(), []);

  const materials = useMemo(() => {
    const wallMat = applyTravertineWeatheringShader(
      new THREE.MeshStandardMaterial({
        color: wallColor,
        map: travertinePbr?.map ?? null,
        normalMap: travertinePbr?.normalMap ?? null,
        normalScale: new THREE.Vector2(0.25, 0.25),
        roughnessMap: travertinePbr?.roughnessMap ?? null,
        roughness: 0.8,
        metalness: 0.0,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    );

    const plinthMat = new THREE.MeshStandardMaterial({
      color: plinthColor,
      map: plinthPbr?.map ?? null,
      normalMap: plinthPbr?.normalMap ?? null,
      normalScale: new THREE.Vector2(0.25, 0.25),
      roughnessMap: plinthPbr?.roughnessMap ?? null,
      roughness: 0.85,
      metalness: 0.0,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: trimColor,
      roughness: 0.65,
      metalness: 0.0,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const frameMat = new THREE.MeshStandardMaterial({
      color: frameColor,
      roughness: 0.35,
      metalness: 0.65,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const glassMat = applyArchitecturalGlassShader(
      new THREE.MeshStandardMaterial({
        color: '#16283e',
        map: glassTex ?? null,
        roughness: 0.08,
        metalness: 0.15,
        envMapIntensity: 1.6,
        transparent: true,
        opacity: transparent ? opacity * 0.9 : 0.94,
        depthWrite: !transparent,
      }),
    );

    const cavityMat = new THREE.MeshBasicMaterial({
      color: '#020408',
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const burgundyMat = new THREE.MeshStandardMaterial({
      color: roofColor,
      roughness: 0.45,
      metalness: 0.35,
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

    return {
      wallMat,
      plinthMat,
      trimMat,
      frameMat,
      glassMat,
      cavityMat,
      burgundyMat,
      jointMat,
    };
  }, [wallColor, trimColor, plinthColor, frameColor, roofColor, travertinePbr, glassTex, transparent, opacity]);

  const merged = useMemo(() => {
    const b = new StaticGeometryBatcher();

    // 1. Plinth & drip molding
    b.addBox('plinth', [buildingWidth + 0.35, 0.6, 0.24], [0, 0.3, sign * 0.08]);
    b.addBox('trim', [buildingWidth + 0.4, 0.08, 0.28], [0, 0.6, sign * 0.1]);

    // 2. Main travertine wall & rustication joints
    b.addBox('wall', [buildingWidth, wallHeight - 0.6, 0.15], [0, (wallHeight + 0.6) / 2, 0]);
    for (let y = 0.9; y <= 7.65; y += 0.45) {
      b.addBox('joint', [buildingWidth, 0.035, 0.01], [0, y, sign * 0.078]);
    }

    // 3. Structural column pilasters
    const colY = 0.6 + (wallHeight - 0.6) / 2;
    const colZ = sign * 0.08;
    for (let i = 0; i <= numBays; i++) {
      const ax = -buildingWidth / 2 + i * bayWidth;
      b.addBox('wall', [pilasterWidth, wallHeight - 0.6, 0.16], [ax, colY, colZ]);
      b.addBox('joint', [0.045, wallHeight - 1.2, 0.02], [ax - 0.12, colY, colZ + sign * 0.082]);
      b.addBox('joint', [0.045, wallHeight - 1.2, 0.02], [ax + 0.12, colY, colZ + sign * 0.082]);
      b.addBox('trim', [pilasterWidth + 0.08, 0.24, 0.2], [ax, colY - (wallHeight - 0.6) / 2 + 0.12, colZ + sign * 0.02]);
      b.addBox('trim', [pilasterWidth + 0.1, 0.24, 0.22], [ax, colY + (wallHeight - 0.6) / 2 - 0.12, colZ + sign * 0.02]);
    }

    // 4. The 6 window bays (1F and 2F)
    const addWindow = (cx: number, wy: number) => {
      const wz = sign * 0.08;
      b.addBox('cavity', [windowWidth - 0.06, winHeight - 0.06, 0.06], [cx, wy, wz - sign * 0.035]);
      // Frame outer + 3 mullions + transom
      b.addBox('frame', [windowWidth, winHeight, 0.06], [cx, wy, wz]);
      b.addBox('frame', [0.045, winHeight - 0.08, 0.045], [cx - windowWidth * 0.25, wy, wz + 0.015]);
      b.addBox('frame', [0.045, winHeight - 0.08, 0.045], [cx, wy, wz + 0.015]);
      b.addBox('frame', [0.045, winHeight - 0.08, 0.045], [cx + windowWidth * 0.25, wy, wz + 0.015]);
      b.addBox('frame', [windowWidth - 0.08, 0.045, 0.045], [cx, wy + winHeight / 2 - 0.45, wz + 0.015]);
      // Glass
      b.addBox('glass', [windowWidth - 0.1, winHeight - 0.1, 0.03], [cx, wy, wz - sign * 0.015]);
      // Stone sill & lintel
      b.addBox('trim', [windowWidth + 0.22, 0.12, 0.18], [cx, wy - winHeight / 2 - 0.06, wz + 0.05]);
      b.addBox('trim', [windowWidth + 0.16, 0.1, 0.14], [cx, wy + winHeight / 2 + 0.05, wz + 0.03]);
    };

    for (let i = 0; i < numBays; i++) {
      const cx = -buildingWidth / 2 + (i + 0.5) * bayWidth;
      addWindow(cx, 2.1);
      addWindow(cx, 5.5);
    }

    // 5. Downspout drainpipes at axes 1, 3, 5
    const pipeRadius = 0.065;
    const pipeHeight = wallHeight - 0.65;
    for (const axisIdx of [1, 3, 5]) {
      const ax = -buildingWidth / 2 + axisIdx * bayWidth;
      const pz = sign * 0.2;
      const hopper = new THREE.ConeGeometry(pipeRadius * 2.2, 0.35, 12);
      b.addGeometry('burgundy', hopper, [ax, wallHeight - 0.18, pz], [Math.PI, 0, 0]);
      hopper.dispose();

      b.addCylinder('burgundy', [pipeRadius, pipeRadius, pipeHeight, 12], [ax, 0.6 + pipeHeight / 2, pz]);
      for (const by of [1.4, 3.2, 5.0, 6.8]) {
        b.addBox('burgundy', [pipeRadius * 3, 0.04, 0.16], [ax, by, pz - sign * 0.05]);
      }
      b.addCylinder('burgundy', [pipeRadius, pipeRadius * 1.15, 0.35, 12], [ax, 0.58, pz + sign * 0.08], [sign * 0.45, 0, 0]);
    }

    // 6. Roof eave overhang & cornice
    b.addBox('trim', [buildingWidth + 1.2, 0.35, 0.42], [0, wallHeight - 0.175, sign * 0.2]);
    b.addBox('burgundy', [buildingWidth + 1.26, 0.08, 0.48], [0, wallHeight + 0.04, sign * 0.24]);

    return b.buildAll();
  }, [buildingWidth, wallHeight, sign, numBays, bayWidth, windowWidth, pilasterWidth, winHeight]);

  useEffect(() => () => disposeMergedMap(merged), [merged]);

  return (
    <group position={[0, 0, wallZ]}>
      {merged.plinth && <mesh geometry={merged.plinth} material={materials.plinthMat} castShadow receiveShadow raycast={NO_RAYCAST} />}
      {merged.wall && <mesh geometry={merged.wall} material={materials.wallMat} castShadow receiveShadow raycast={NO_RAYCAST} />}
      {merged.trim && <mesh geometry={merged.trim} material={materials.trimMat} castShadow receiveShadow raycast={NO_RAYCAST} />}
      {merged.frame && <mesh geometry={merged.frame} material={materials.frameMat} raycast={NO_RAYCAST} />}
      {merged.glass && <mesh geometry={merged.glass} material={materials.glassMat} raycast={NO_RAYCAST} />}
      {merged.cavity && <mesh geometry={merged.cavity} material={materials.cavityMat} raycast={NO_RAYCAST} />}
      {merged.burgundy && <mesh geometry={merged.burgundy} material={materials.burgundyMat} raycast={NO_RAYCAST} />}
      {merged.joint && <mesh geometry={merged.joint} material={materials.jointMat} raycast={NO_RAYCAST} />}
    </group>
  );
}
