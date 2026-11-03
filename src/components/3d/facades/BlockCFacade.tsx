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
  getAtticBannerTexture,
  getCanopySignTexture,
} from './facadeTextures';
import { AjouLogoMedallion } from './AjouLogoMedallion';

type BlockCFacadeProps = {
  /** Width of the building mass along X (m) */
  buildingWidth: number;
  /** Depth of the building mass along Z (m) */
  buildingDepth: number;
  /** Direction the facade faces (default: 'east' facing perimeter fence and main gate) */
  facing?: 'east' | 'west';
  /** Height up to cornice line (m), default 10.8 */
  wallHeight?: number;
  /** Total height including attic/parapet (m), default 13.5 */
  totalHeight?: number;
  /** Opacity for selection dimming */
  opacity?: number;
  /** Transparent flag */
  transparent?: boolean;
  /** Main wall color (sand travertine) */
  wallColor?: string;
  /** Pilasters / cornice / attic color */
  trimColor?: string;
  /** Granite plinth color */
  plinthColor?: string;
  /** Window frame color */
  frameColor?: string;
};

/**
 * Highly accurate 3D architectural facade for Block C, facing the perimeter fence.
 * Reconstructed directly from CAD blueprint "Фасады и оконные блоки. Чертеж 2D. Лист 1 (1:100)".
 * Mirrored so the entrance doors and pavilion are on the right, matching the perspective view.
 */
export function BlockCFacade({
  buildingWidth,
  buildingDepth,
  facing = 'east',
  wallHeight = 10.8,
  totalHeight = 13.5,
  opacity = 1,
  transparent = false,
  wallColor = '#e2c391',
  trimColor = '#f1e6cf',
  plinthColor = '#7b4a3a',
  frameColor = '#4a5561',
}: BlockCFacadeProps) {
  const BASE_CAD_LENGTH = 35.9;
  const isExtended = buildingDepth > 45.0;
  const facadeLength = Math.max(BASE_CAD_LENGTH, buildingDepth);
  const scaleZ = isExtended ? 1.0 : facadeLength / BASE_CAD_LENGTH;
  const isEast = facing === 'east';
  const sign = isEast ? 1 : -1;
  const wallX = sign * (buildingWidth / 2);
  const rotY = sign * (Math.PI / 2);

  const plinthHeight = 1.1; // -1.100 to 0.000
  const darkFrameColor = frameColor;
  const glassColor = '#0f172a';

  // Textures
  const atticTexture = useMemo(() => getAtticBannerTexture(), []);
  const canopyTexture = useMemo(() => getCanopySignTexture(), []);
  const wallTextures = useMemo(() => getArchitecturalWallTextures(10, 3), []);
  const plinthTextures = useMemo(() => getGranitePlinthTextures(4, 1), []);
  const glassTexture = useMemo(() => getWindowGlassTexture(), []);

  // Shared reusable materials
  const wallMat = useMemo(
    () =>
      applyTravertineWeatheringShader(
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
      ),
    [wallColor, wallTextures, transparent, opacity]
  );

  const plinthMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
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
      }),
    [plinthColor, plinthTextures, transparent, opacity]
  );

  const trimMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: trimColor,
        roughness: 0.7,
        metalness: 0.0,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [trimColor, transparent, opacity]
  );

  const frameMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#27272a',
        roughness: 0.35,
        metalness: 0.65,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [darkFrameColor, transparent, opacity]
  );

  const glassMat = useMemo(
    () =>
      applyArchitecturalGlassShader(
        new THREE.MeshStandardMaterial({
          color: glassColor,
          map: glassTexture ?? null,
          roughness: 0.08,
          metalness: 0.15,
          envMapIntensity: 1.6,
          transparent: true,
          opacity: transparent ? opacity * 0.85 : 0.92,
          depthWrite: !transparent,
        }),
      ),
    [glassColor, glassTexture, transparent, opacity]
  );

  const jointMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(wallColor).multiplyScalar(0.84),
        roughness: 0.9,
        metalness: 0,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [wallColor, transparent, opacity]
  );

  const canopySignMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: canopyTexture ?? null,
        roughness: 0.4,
        metalness: 0.2,
        transparent,
        opacity,
      }),
    [canopyTexture, transparent, opacity]
  );

  const atticSignMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: atticTexture ?? null,
        roughness: 0.6,
        metalness: 0.05,
        transparent,
        opacity,
      }),
    [atticTexture, transparent, opacity]
  );

  const bayCount = isExtended ? Math.max(8, Math.floor((facadeLength - 10.0) / 3.0)) : 8;
  const pavilionZ = facadeLength / 2 - (isExtended ? (bayCount + 2.5) * 3.0 : 31.7) * scaleZ;
  const pavWidth = 8.4 * scaleZ;
  const pavDepth = 2.8;
  const pavHeight = 4.1;

  const merged = useMemo(() => {
    const b = new StaticGeometryBatcher();
    const toZ = (offset: number) => facadeLength / 2 - offset * scaleZ;

    // 1. Plinth & drip molding
    b.addBox('plinth', [0.22, plinthHeight, facadeLength + 0.1], [sign * 0.08, -plinthHeight / 2, 0]);
    b.addBox('trim', [0.16, 0.08, facadeLength + 0.15], [sign * 0.12, 0.04, 0]);

    // 2. Main travertine wall & joints
    b.addBox('wall', [0.15, wallHeight, facadeLength], [0, wallHeight / 2, 0]);
    for (let i = 0; i < 23; i++) {
      const yVal = 0.45 + i * 0.45;
      b.addBox('joint', [0.01, 0.035, facadeLength], [sign * 0.078, yVal, 0]);
    }

    // 3. Pilasters
    const pilasterAxes = isExtended
      ? Array.from({ length: bayCount + 2 }, (_, i) => i * 3.0)
      : [0, 3, 6, 9, 12, 15, 18, 21, 24, 27];
    for (const axisOffset of pilasterAxes) {
      const pz = toZ(axisOffset);
      const px = sign * 0.15;
      b.addBox('trim', [0.22, 9.8, 0.45 * scaleZ], [px, 4.9, pz]);
      b.addBox('wall', [0.03, 9.0, 0.06 * scaleZ], [px + sign * 0.11, 4.9, pz - 0.1 * scaleZ]);
      b.addBox('wall', [0.03, 9.0, 0.06 * scaleZ], [px + sign * 0.11, 4.9, pz + 0.1 * scaleZ]);
      b.addBox('trim', [0.3, 1.0, 0.65 * scaleZ], [px, 10.3, pz]);
      b.addBox('wall', [0.04, 0.7, 0.55 * scaleZ], [px + sign * 0.15, 10.2, pz]);
      b.addBox('trim', [0.36, 0.15, 0.75 * scaleZ], [px + sign * 0.05, 10.75, pz]);
    }

    // 4. 1F Windows
    const tallWindowBays = isExtended
      ? Array.from({ length: bayCount }, (_, i) => 1.5 + i * 3.0)
      : [1.5, 4.5, 7.5, 10.5, 13.5, 16.5, 19.5, 22.5];
    for (const bayOffset of tallWindowBays) {
      const wz = toZ(bayOffset);
      const wx = sign * 0.08;
      b.addBox('frame', [0.06, 1.8, 1.8 * scaleZ], [wx, 1.8, wz]);
      b.addBox('glass', [0.03, 1.64, 1.64 * scaleZ], [wx + sign * 0.025, 1.8, wz]);
      b.addBox('frame', [0.04, 1.64, 0.06 * scaleZ], [wx + sign * 0.045, 1.8, wz]);
      b.addBox('trim', [0.15, 0.12, 2.0 * scaleZ], [wx + sign * 0.08, 1.8 - 0.95, wz]);
      b.addBox('trim', [0.12, 0.1, 2.0 * scaleZ], [wx + sign * 0.08, 1.8 + 0.95, wz]);
    }

    // Bay 9: OK-4
    const ok4z = toZ(isExtended ? (bayCount + 0.5) * 3.0 : 25.5);
    const ok4x = sign * 0.08;
    b.addBox('frame', [0.06, 1.2, 1.2 * scaleZ], [ok4x, 1.8, ok4z]);
    b.addBox('glass', [0.03, 1.08, 1.08 * scaleZ], [ok4x + sign * 0.025, 1.8, ok4z]);
    b.addBox('trim', [0.15, 0.1, 1.4 * scaleZ], [ok4x + sign * 0.08, 1.8 - 0.65, ok4z]);

    // 5. 2F Tall Windows
    const tallWindows = [
      ...tallWindowBays.map((offset) => ({ offset, width: 1.8 * scaleZ, bottom: 4.0, top: 10.3 })),
      { offset: isExtended ? (bayCount + 0.5) * 3.0 : 25.5, width: 1.2 * scaleZ, bottom: 4.0, top: 10.3 },
      { offset: isExtended ? (bayCount + 1.6) * 3.0 : 28.8, width: 1.2 * scaleZ, bottom: 5.3, top: 10.3 },
      { offset: isExtended ? (bayCount + 2.3) * 3.0 : 30.8, width: 1.2 * scaleZ, bottom: 5.3, top: 10.3 },
    ];
    for (const { offset, width, bottom, top } of tallWindows) {
      const h = top - bottom;
      const wz = toZ(offset);
      const wy = bottom + h / 2;
      const wx = sign * 0.08;
      const mullions = width > 1.5 * scaleZ ? [-width / 6, width / 6] : [0];
      const transoms = [h / 2 - h * 0.22, -h / 2 + h * 0.4];

      b.addBox('frame', [0.06, h, width], [wx, wy, wz]);
      b.addBox('glass', [0.03, h - 0.14, width - 0.14 * scaleZ], [wx + sign * 0.025, wy, wz]);
      for (const mz of mullions) {
        b.addBox('frame', [0.04, h - 0.14, 0.06], [wx + sign * 0.045, wy, wz + mz]);
      }
      for (const ty of transoms) {
        b.addBox('frame', [0.04, 0.06, width - 0.14 * scaleZ], [wx + sign * 0.045, wy + ty, wz]);
      }
      b.addBox('trim', [0.16, 0.12, width + 0.2 * scaleZ], [wx + sign * 0.1, wy - h / 2 - 0.06, wz]);
      b.addBox('trim', [0.12, 0.1, width + 0.2 * scaleZ], [wx + sign * 0.08, wy + h / 2 + 0.06, wz]);
    }

    // 6. Entrance Pavilion
    const pvx = sign * (pavDepth / 2);
    b.addBox('plinth', [1.4, 0.44, 4.0 * scaleZ], [pvx + sign * (pavDepth / 2 + 0.7), 0.22, pavilionZ + 0.4 * scaleZ]);
    b.addBox('plinth', [0.6, 0.24, 4.2 * scaleZ], [pvx + sign * (pavDepth / 2 + 1.1), 0.12, pavilionZ + 0.4 * scaleZ]);
    // Ramp
    const rx = pvx + sign * (pavDepth / 2 + 0.6);
    const rz = pavilionZ - 2.6 * scaleZ;
    b.addBox('plinth', [1.6, 0.4, 1.8 * scaleZ], [rx, 0.2, rz]);
    b.addBox('frame', [1.6, 0.05, 0.05], [rx, 0.8, rz + 0.8 * scaleZ]);
    b.addBox('frame', [0.05, 0.6, 0.05], [rx - sign * 0.7, 0.5, rz + 0.8 * scaleZ]);
    b.addBox('frame', [0.05, 0.6, 0.05], [rx + sign * 0.7, 0.5, rz + 0.8 * scaleZ]);
    // Curtain wall box
    b.addBox('glass', [pavDepth, pavHeight, pavWidth], [pvx, pavHeight / 2, pavilionZ]);
    // Mullions grid on front face
    const mgx = pvx + sign * (pavDepth / 2 + 0.02);
    const mgy = pavHeight / 2;
    for (const mx of [-4.2, -3.5, -2.1, -0.7, 0.7, 2.1, 3.5, 4.2]) {
      b.addBox('frame', [0.08, pavHeight, 0.08], [mgx + sign * 0.02, mgy, pavilionZ + mx * scaleZ]);
    }
    b.addBox('frame', [0.08, 0.1, pavWidth + 0.1 * scaleZ], [mgx + sign * 0.02, mgy + pavHeight / 2 - 0.05, pavilionZ]);
    b.addBox('frame', [0.08, 0.1, pavWidth + 0.1 * scaleZ], [mgx + sign * 0.02, mgy - pavHeight / 2 + 0.05, pavilionZ]);
    b.addBox('frame', [0.08, 0.1, pavWidth], [mgx + sign * 0.02, mgy - pavHeight / 2 + 2.7, pavilionZ]);
    b.addBox('glass', [0.04, 2.6, 2.2 * scaleZ], [mgx + sign * 0.04, mgy - pavHeight / 2 + 1.35, pavilionZ + 0.4 * scaleZ]);
    b.addBox('frame', [0.05, 2.6, 0.08], [mgx + sign * 0.06, mgy - pavHeight / 2 + 1.35, pavilionZ + 0.4 * scaleZ]);
    b.addBox('frame', [0.04, 0.8, 0.04], [mgx + sign * 0.1, mgy - pavHeight / 2 + 1.2, pavilionZ + 0.28 * scaleZ]);
    b.addBox('frame', [0.04, 0.8, 0.04], [mgx + sign * 0.1, mgy - pavHeight / 2 + 1.2, pavilionZ + 0.52 * scaleZ]);
    b.addBox('trim', [pavDepth + 0.8, 0.6, pavWidth + 0.6 * scaleZ], [pvx, pavHeight + 0.3, pavilionZ]);

    // 8. Cornice, Attic & Parapet
    b.addBox('trim', [0.35, 0.9, facadeLength + 0.2], [sign * 0.18, wallHeight + 0.45, 0]);
    b.addBox('wall', [0.1, 0.15, facadeLength + 0.1], [sign * 0.24, wallHeight + 0.15, 0]);
    b.addBox('wall', [0.15, 1.6, facadeLength], [sign * 0.05, wallHeight + 1.7, 0]);
    b.addBox('trim', [0.42, 0.2, facadeLength + 0.3], [sign * 0.2, totalHeight - 0.1, 0]);

    return b.buildAll();
  }, [facadeLength, scaleZ, sign, plinthHeight, wallHeight, totalHeight, isExtended, bayCount, pavilionZ, pavWidth, pavDepth, pavHeight]);

  useEffect(() => () => disposeMergedMap(merged), [merged]);

  const toZ = (offset: number) => facadeLength / 2 - offset * scaleZ;

  return (
    <group position={[wallX, 0, 0]}>
      {merged.plinth && <mesh geometry={merged.plinth} material={plinthMat} castShadow receiveShadow raycast={NO_RAYCAST} />}
      {merged.wall && <mesh geometry={merged.wall} material={wallMat} castShadow receiveShadow raycast={NO_RAYCAST} />}
      {merged.trim && <mesh geometry={merged.trim} material={trimMat} castShadow receiveShadow raycast={NO_RAYCAST} />}
      {merged.frame && <mesh geometry={merged.frame} material={frameMat} raycast={NO_RAYCAST} />}
      {merged.glass && <mesh geometry={merged.glass} material={glassMat} raycast={NO_RAYCAST} />}
      {merged.joint && <mesh geometry={merged.joint} material={jointMat} raycast={NO_RAYCAST} />}

      {/* Canopy Fascia Sign: "AJOU UNIVERSITY IN TASHKENT" */}
      {canopyTexture && (
        <mesh
          position={[sign * (pavDepth + 0.45), pavHeight + 0.3, pavilionZ]}
          rotation={[0, rotY, 0]}
          material={canopySignMat}
          raycast={NO_RAYCAST}
        >
          <planeGeometry args={[pavWidth + 0.4 * scaleZ, 0.52]} />
        </mesh>
      )}

      {/* Official Circular University Medallion Logo on Right */}
      <AjouLogoMedallion
        position={[sign * 0.14, 8.0, toZ(isExtended ? (bayCount + 3.2) * 3.0 : 33.9)]}
        rotation={[0, rotY, 0]}
        radius={1.2}
        showText={false}
        opacity={opacity}
        transparent={transparent}
      />

      {/* Attic Signboard: "TOSHKENT SHAHRIDAGI ADJU UNIVERSITETI" */}
      {atticTexture && (
        <mesh
          position={[sign * 0.14, wallHeight + 1.7, toZ(isExtended ? bayCount * 1.5 : 16.5)]}
          rotation={[0, rotY, 0]}
          material={atticSignMat}
          raycast={NO_RAYCAST}
        >
          <planeGeometry args={[15.0 * scaleZ, 1.35]} />
        </mesh>
      )}
    </group>
  );
}
