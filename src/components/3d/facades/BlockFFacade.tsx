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
import {
  getAjouEnglishFriezeTexture,
  getAjouKoreanFriezeTexture,
} from './facadeTextures';
import { AjouLogoMedallion } from './AjouLogoMedallion';

export type BlockFFacadeProps = {
  /** Width of the building mass along X (m) */
  buildingWidth: number;
  /** Depth of the building mass along Z (m) */
  buildingDepth: number;
  /** Primary facing direction: 'east' faces perimeter fence (default) */
  facing?: 'east' | 'west';
  /** Height up to cornice line (m), default 9.8 per CAD elevation */
  wallHeight?: number;
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
  /** Window frame color (dark graphite architectural metal) */
  frameColor?: string;
};

/**
 * Architectural 3D Elevation of Block F (Корпус F / Учебный корпус «Ajou University in Tashkent»).
 * Reconstructed directly from 2D CAD Blueprint:
 * «ФАСАД КОРПУСА «AJOU UNIVERSITY IN TASHKENT» В ОСЯХ 1–7 (2D ЧЕРТЕЖ-РАЗВЕРТКА)».
 */
export function BlockFFacade({
  buildingWidth,
  buildingDepth,
  facing = 'east',
  opacity = 1,
  transparent = false,
  wallColor = '#ebdcc5',
  trimColor = '#f8fafc',
  plinthColor = '#334155',
  frameColor = '#27272a',
}: BlockFFacadeProps) {
  const BASE_CAD_LENGTH = 36.0;
  const facadeLength = Math.max(BASE_CAD_LENGTH, buildingDepth);

  const isEast = facing === 'east';
  const sign = isEast ? 1 : -1;
  const wallX = sign * (buildingWidth / 2);
  const rotY = sign * (Math.PI / 2);

  const plinthHeight = 0.6;
  const architraveHeight = 0.4;
  const friezeHeight = 0.7;

  const winW = 1.6;
  const f1WinH = 1.4;
  const f1WinCenterY = 1.8;
  const f2WinH = 3.8;
  const f2WinCenterY = 5.9;

  const wallTextures = useMemo(() => getArchitecturalWallTextures(8, 2), []);
  const plinthTextures = useMemo(() => getGranitePlinthTextures(4, 1), []);
  const glassTexture = useMemo(() => getWindowGlassTexture(), []);
  const englishFriezeTexture = useMemo(() => getAjouEnglishFriezeTexture(), []);
  const koreanFriezeTexture = useMemo(() => getAjouKoreanFriezeTexture(), []);

  const materials = useMemo(() => {
    const wallMat = applyTravertineWeatheringShader(
      new THREE.MeshStandardMaterial({
        color: wallColor,
        map: wallTextures?.map ?? null,
        normalMap: wallTextures?.normalMap ?? null,
        normalScale: new THREE.Vector2(0.25, 0.25),
        roughnessMap: wallTextures?.roughnessMap ?? null,
        roughness: 0.8,
        metalness: 0.0,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    );

    const plinthMat = new THREE.MeshStandardMaterial({
      color: plinthColor,
      map: plinthTextures?.map ?? null,
      normalMap: plinthTextures?.normalMap ?? null,
      normalScale: new THREE.Vector2(0.25, 0.25),
      roughnessMap: plinthTextures?.roughnessMap ?? null,
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
        map: glassTexture ?? null,
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

    const englishFriezeMat = new THREE.MeshStandardMaterial({
      map: englishFriezeTexture ?? null,
      color: '#ffffff',
      roughness: 0.45,
      metalness: 0.08,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const koreanFriezeMat = new THREE.MeshStandardMaterial({
      map: koreanFriezeTexture ?? null,
      color: '#ffffff',
      roughness: 0.45,
      metalness: 0.08,
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
      englishFriezeMat,
      koreanFriezeMat,
      jointMat,
    };
  }, [
    wallColor,
    trimColor,
    plinthColor,
    frameColor,
    wallTextures,
    glassTexture,
    englishFriezeTexture,
    koreanFriezeTexture,
    transparent,
    opacity,
  ]);

  const bayCount = Math.max(6, Math.round(facadeLength / 6.0));
  const bayWidth = facadeLength / bayCount;
  const fromNorthZ = (dist: number) => -facadeLength / 2 + dist;

  const emblemBayZ = fromNorthZ(0.5 * bayWidth);
  const koreanSignZ = fromNorthZ(1.5 * bayWidth);
  const englishSignZ = fromNorthZ(3.8 * bayWidth);

  const merged = useMemo(() => {
    const b = new StaticGeometryBatcher();

    // 1. Plinth & drip molding
    b.addBox('plinth', [0.22, plinthHeight, facadeLength + 0.1], [sign * 0.08, plinthHeight / 2, 0]);
    b.addBox('trim', [0.16, 0.08, facadeLength + 0.15], [sign * 0.12, plinthHeight, 0]);

    // 2. Main travertine wall & rustication joints
    b.addBox('wall', [0.15, 7.8 - plinthHeight, facadeLength], [0, (7.8 + plinthHeight) / 2, 0]);
    for (let y = 0.9; y <= 7.65; y += 0.45) {
      b.addBox('joint', [0.01, 0.035, facadeLength], [sign * 0.078, y, 0]);
    }

    // 3. Classical vertical pilasters
    const shaftH = 7.4 - 0.85;
    const shaftY = (7.4 + 0.85) / 2;
    const px = sign * 0.14;
    for (let i = 0; i <= bayCount; i++) {
      const pz = -facadeLength / 2 + i * bayWidth;
      const isCorner = i === 0 || i === bayCount;
      const pilasterW = isCorner ? 0.65 : 0.55;
      b.addBox('trim', [0.26, 0.25, pilasterW + 0.08], [px, 0.725, pz]);
      b.addBox('wall', [0.22, shaftH, pilasterW], [px - sign * 0.01, shaftY, pz]);
      b.addBox('joint', [0.02, shaftH - 0.4, 0.05], [px + sign * 0.105, shaftY, pz - 0.12]);
      b.addBox('joint', [0.02, shaftH - 0.4, 0.05], [px + sign * 0.105, shaftY, pz + 0.12]);
      b.addBox('trim', [0.26, 0.16, pilasterW + 0.06], [px, 7.48, pz]);
      b.addBox('trim', [0.3, 0.16, pilasterW + 0.12], [px + sign * 0.02, 7.64, pz]);
      b.addBox('trim', [0.34, 0.08, pilasterW + 0.18], [px + sign * 0.04, 7.76, pz]);
    }

    // 4 & 5. Windows (1F and 2F)
    const wx = sign * 0.08;
    for (let bay = 1; bay < bayCount; bay++) {
      const bayCenterZ = -facadeLength / 2 + (bay + 0.5) * bayWidth;
      for (const wz of [bayCenterZ - 1.4, bayCenterZ + 1.4]) {
        // 1F Window
        b.addBox('cavity', [0.06, f1WinH - 0.06, winW - 0.06], [wx - sign * 0.035, f1WinCenterY, wz]);
        b.addBox('frame', [0.06, f1WinH, winW], [wx, f1WinCenterY, wz]);
        b.addBox('frame', [0.04, 0.045, winW - 0.1], [wx + 0.015, f1WinCenterY, wz]);
        b.addBox('frame', [0.04, f1WinH - 0.1, 0.045], [wx + 0.015, f1WinCenterY, wz - winW / 6]);
        b.addBox('frame', [0.04, f1WinH - 0.1, 0.045], [wx + 0.015, f1WinCenterY, wz + winW / 6]);
        b.addBox('glass', [0.03, f1WinH - 0.12, winW - 0.12], [wx - sign * 0.015, f1WinCenterY, wz]);
        b.addBox('trim', [0.18, 0.12, winW + 0.25], [wx + 0.06, f1WinCenterY - f1WinH / 2 - 0.06, wz]);
        b.addBox('trim', [0.14, 0.1, winW + 0.2], [wx + 0.04, f1WinCenterY + f1WinH / 2 + 0.05, wz]);

        // 2F Window
        b.addBox('cavity', [0.06, f2WinH - 0.06, winW - 0.06], [wx - sign * 0.035, f2WinCenterY, wz]);
        b.addBox('frame', [0.06, f2WinH, winW], [wx, f2WinCenterY, wz]);
        b.addBox('frame', [0.04, 0.045, winW - 0.1], [wx + 0.015, f2WinCenterY - f2WinH * 0.25, wz]);
        b.addBox('frame', [0.04, 0.045, winW - 0.1], [wx + 0.015, f2WinCenterY, wz]);
        b.addBox('frame', [0.04, 0.045, winW - 0.1], [wx + 0.015, f2WinCenterY + f2WinH * 0.25, wz]);
        b.addBox('frame', [0.04, f2WinH - 0.1, 0.045], [wx + 0.015, f2WinCenterY, wz - winW / 6]);
        b.addBox('frame', [0.04, f2WinH - 0.1, 0.045], [wx + 0.015, f2WinCenterY, wz + winW / 6]);
        b.addBox('glass', [0.03, f2WinH - 0.12, winW - 0.12], [wx - sign * 0.015, f2WinCenterY, wz]);
        b.addBox('trim', [0.2, 0.14, winW + 0.25], [wx + 0.07, f2WinCenterY - f2WinH / 2 - 0.07, wz]);
        b.addBox('trim', [0.16, 0.12, winW + 0.2], [wx + 0.05, f2WinCenterY + f2WinH / 2 + 0.06, wz]);
      }
    }

    // 6. Bay 0 decorative grooves
    for (const gy of [2.0, 3.5, 5.0, 6.5]) {
      b.addBox('joint', [0.015, 0.035, bayWidth * 0.86], [sign * 0.085, gy, emblemBayZ]);
    }

    // 7. Classical entablature & cornice
    b.addBox('trim', [0.24, architraveHeight, facadeLength + 0.15], [sign * 0.12, 8.0, 0]);
    for (const gy of [7.92, 8.08]) {
      b.addBox('joint', [0.015, 0.025, facadeLength + 0.16], [sign * 0.245, gy, 0]);
    }
    b.addBox('trim', [0.26, friezeHeight, facadeLength + 0.2], [sign * 0.14, 8.55, 0]);
    b.addBox('trim', [0.36, 0.25, facadeLength + 0.25], [sign * 0.2, 9.025, 0]);
    b.addBox('trim', [0.44, 0.2, facadeLength + 0.3], [sign * 0.24, 9.25, 0]);

    // Dentils
    const dentilCount = Math.floor(facadeLength / 0.3);
    for (let i = 0; i < dentilCount; i++) {
      const z = -facadeLength / 2 + (i + 0.5) * (facadeLength / dentilCount);
      b.addBox('trim', [0.08, 0.12, 0.14], [sign * 0.44, 9.25, z]);
    }
    b.addBox('trim', [0.58, 0.45, facadeLength + 0.4], [sign * 0.32, 9.575, 0]);
    b.addBox('trim', [0.06, 0.05, facadeLength + 0.44], [sign * 0.6, 9.775, 0]);

    return b.buildAll();
  }, [facadeLength, sign, bayCount, bayWidth, emblemBayZ, plinthHeight, architraveHeight, friezeHeight, winW, f1WinH, f1WinCenterY, f2WinH, f2WinCenterY]);

  useEffect(() => () => disposeMergedMap(merged), [merged]);

  return (
    <group position={[wallX, 0, 0]}>
      {merged.plinth && <mesh geometry={merged.plinth} material={materials.plinthMat} receiveShadow raycast={NO_RAYCAST} />}
      {merged.wall && <mesh geometry={merged.wall} material={materials.wallMat} castShadow receiveShadow raycast={NO_RAYCAST} />}
      {merged.trim && <mesh geometry={merged.trim} material={materials.trimMat} castShadow receiveShadow raycast={NO_RAYCAST} />}
      {merged.frame && <mesh geometry={merged.frame} material={materials.frameMat} raycast={NO_RAYCAST} />}
      {merged.glass && <mesh geometry={merged.glass} material={materials.glassMat} raycast={NO_RAYCAST} />}
      {merged.cavity && <mesh geometry={merged.cavity} material={materials.cavityMat} raycast={NO_RAYCAST} />}
      {merged.joint && <mesh geometry={merged.joint} material={materials.jointMat} raycast={NO_RAYCAST} />}

      {/* Universal Official Ajou University Medallion & Typography */}
      <AjouLogoMedallion
        position={[sign * 0.15, 5.2, emblemBayZ]}
        rotation={[0, rotY, 0]}
        radius={1.15}
        showText={true}
        opacity={opacity}
        transparent={transparent}
      />

      {/* Korean Signage Plaque */}
      {koreanFriezeTexture && (
        <mesh
          position={[sign * 0.272, 8.52, koreanSignZ]}
          rotation={[0, rotY, 0]}
          material={materials.koreanFriezeMat}
          raycast={NO_RAYCAST}
        >
          <planeGeometry args={[Math.min(5.6, bayWidth - 0.4), 0.58]} />
        </mesh>
      )}

      {/* English Signage Plaque */}
      {englishFriezeTexture && (
        <mesh
          position={[sign * 0.272, 8.52, englishSignZ]}
          rotation={[0, rotY, 0]}
          material={materials.englishFriezeMat}
          raycast={NO_RAYCAST}
        >
          <planeGeometry args={[Math.min(13.5, 2.3 * bayWidth - 0.4), 0.58]} />
        </mesh>
      )}
    </group>
  );
}
