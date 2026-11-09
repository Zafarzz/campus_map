import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  NO_RAYCAST,
  StaticGeometryBatcher,
  disposeMergedMap,
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

export type BlockAFacadeProps = {
  /** Building mass length along X (m) */
  buildingWidth: number;
  /** Building mass depth along Z (m) */
  buildingDepth: number;
  /** Primary facing direction: 'south' faces perimeter fence; 'north' faces inner campus */
  facing?: 'south' | 'north';
  /** Height up to cornice line (m), default 8.2 */
  wallHeight?: number;
  /** Height of pitched hip roof (m), default 3.6 */
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
  /** Window frame color */
  frameColor?: string;
  /** Roof color */
  roofColor?: string;
};

/**
 * Architectural 3D Elevation of Academic Block A (Учебный корпус А).
 * Optimized via StaticGeometryBatcher: merges all 6 bays, pilasters, downpipes, window ribbons,
 * entrance steps, handrails, and canopy into 9 material-batched draw calls instead of ~250 individual meshes.
 */
export function BlockAFacade({
  buildingWidth,
  buildingDepth,
  facing = 'south',
  wallHeight = 8.2,
  opacity = 1,
  transparent = false,
  wallColor = '#ebdcc5',
  trimColor = '#f8fafc',
  plinthColor = '#334155',
  frameColor = '#f8fafc',
}: BlockAFacadeProps) {
  const isSouth = facing === 'south';
  const zOffset = isSouth ? buildingDepth / 2 + 0.05 : -buildingDepth / 2 - 0.05;
  const rotY = isSouth ? 0 : Math.PI;

  const wallTextures = useMemo(() => getArchitecturalWallTextures(8, 2), []);
  const plinthTextures = useMemo(() => getGranitePlinthTextures(4, 1), []);
  const glassTexture = useMemo(() => getWindowGlassTexture(), []);

  const materials = useMemo(() => {
    const wallMat = applyTravertineWeatheringShader(
      new THREE.MeshStandardMaterial({
        color: wallColor,
        map: wallTextures?.map ?? null,
        normalMap: wallTextures?.normalMap ?? null,
        normalScale: new THREE.Vector2(0.22, 0.22),
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
      roughness: 0.86,
      metalness: 0.0,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: trimColor,
      roughness: 0.68,
      metalness: 0.0,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const frameMat = new THREE.MeshStandardMaterial({
      color: frameColor,
      roughness: 0.42,
      metalness: 0.25,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const glassMat = applyArchitecturalGlassShader(
      new THREE.MeshStandardMaterial({
        color: '#1e3a5f',
        map: glassTexture ?? null,
        roughness: 0.08,
        metalness: 0.15,
        envMapIntensity: 1.6,
        transparent: true,
        opacity: transparent ? opacity * 0.45 : 0.92,
        depthWrite: !transparent,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );

    const darkFrameMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.45,
      metalness: 0.65,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const steelMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      roughness: 0.22,
      metalness: 0.92,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const downpipeMat = new THREE.MeshStandardMaterial({
      color: '#7c2d12',
      roughness: 0.52,
      metalness: 0.35,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const grooveMat = new THREE.MeshStandardMaterial({
      color: '#b0a08e',
      roughness: 0.95,
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
      darkFrameMat,
      steelMat,
      downpipeMat,
      grooveMat,
    };
  }, [wallColor, trimColor, plinthColor, frameColor, wallTextures, transparent, opacity]);

  const merged = useMemo(() => {
    const batcher = new StaticGeometryBatcher();

    const totalUnits = 10;
    const unitW = buildingWidth / totalUnits;
    const bay1W = unitW * 1.0;
    const windowBayW = unitW * 2.0;
    const bay6W = unitW * 1.0;
    const startX = -buildingWidth / 2;

    const bayCenters = [
      startX + unitW * 0.5,
      startX + unitW * 2.0,
      startX + unitW * 4.0,
      startX + unitW * 6.0,
      startX + unitW * 8.0,
      startX + unitW * 9.5,
    ];

    const columnAxes = [
      startX,
      startX + unitW * 1,
      startX + unitW * 3,
      startX + unitW * 5,
      startX + unitW * 7,
      startX + unitW * 9,
      startX + unitW * 10,
    ];

    const plinthH = 0.8;
    const corniceH = 0.4;
    const mainWallH = wallHeight - plinthH - corniceH;

    // 1. Base Foundation Plinth
    batcher.addBox('plinth', [buildingWidth + 0.1, plinthH, 0.22], [0, plinthH / 2, 0.08]);

    // 2. Top Cornice & Frieze
    batcher.addBox('trim', [buildingWidth + 0.2, corniceH, 0.24], [0, wallHeight - corniceH / 2, 0.1]);
    batcher.addBox('trim', [buildingWidth + 0.3, 0.08, 0.34], [0, wallHeight + 0.04, 0.16]);

    // 3. Horizontal Spandrel Grooves
    batcher.addBox('groove', [buildingWidth, 0.06, 0.04], [0, 3.65, 0.03]);
    batcher.addBox('groove', [buildingWidth, 0.06, 0.04], [0, 5.35, 0.03]);

    // 4. Vertical Pilasters & Downspout Drainpipes
    columnAxes.forEach((ax, idx) => {
      const isCorner = idx === 0 || idx === columnAxes.length - 1;
      const pilasterW = isCorner ? 0.6 : 0.52;
      batcher.addBox('wall', [pilasterW, mainWallH, 0.14], [ax, plinthH + mainWallH / 2, 0.06]);

      if (idx > 0) {
        const px = ax + (idx === columnAxes.length - 1 ? -0.15 : 0.12);
        const pz = 0.15;
        batcher.addCylinder('downpipe', [0.075, 0.04, 0.22, 8], [px, wallHeight - 0.12, pz]);
        batcher.addCylinder('downpipe', [0.038, 0.038, wallHeight - 0.52, 8], [px, (wallHeight - 0.22 + 0.3) / 2, pz]);
        for (const by of [2.2, 4.4, 6.6]) {
          batcher.addBox('downpipe', [0.1, 0.03, 0.08], [px, by, pz - 0.04]);
        }
        batcher.addCylinder('downpipe', [0.038, 0.038, 0.22, 8], [px, 0.22, pz + 0.04], [0.4, 0, 0]);
      }
    });

    // 5. Bay 1 (West / Left)
    {
      const cx = bayCenters[0];
      const winW = bay1W * 0.7;
      const winH = 1.35;
      const winY = 6.65;
      const paneW = (winW - 0.08) / 3;

      batcher.addBox('wall', [bay1W - 0.5, 2.8, 0.08], [cx, plinthH + 1.4, 0.02]);
      batcher.addBox('trim', [winW + 0.14, 0.07, 0.16], [cx, winY - winH / 2 - 0.04, 0.06]);
      // Outer window frame border (top, bottom, left, right rails/stiles)
      batcher.addBox('frame', [winW, 0.06, 0.08], [cx, winY + winH / 2 - 0.03, 0.04]);
      batcher.addBox('frame', [winW, 0.06, 0.08], [cx, winY - winH / 2 + 0.03, 0.04]);
      batcher.addBox('frame', [0.06, winH - 0.12, 0.08], [cx - winW / 2 + 0.03, winY, 0.04]);
      batcher.addBox('frame', [0.06, winH - 0.12, 0.08], [cx + winW / 2 - 0.03, winY, 0.04]);
      for (const px of [-paneW, 0, paneW]) {
        batcher.addBox('glass', [paneW - 0.05, winH - 0.1, 0.02], [cx + px, winY, 0.05]);
      }
      for (const mx of [-paneW / 2, paneW / 2]) {
        batcher.addBox('frame', [0.04, winH - 0.08, 0.04], [cx + mx, winY, 0.06]);
      }
    }

    // 6. Bays 2, 3, 4, 5 (Ribbon Window Bays)
    for (const bayIndex of [1, 2, 3, 4]) {
      const cx = bayCenters[bayIndex];
      const winW = windowBayW - 0.65;
      const winH = 2.4;
      const transomH = 0.6;
      const bottomH = winH - transomH;

      const secWidths = [winW * 0.2, winW * 0.3, winW * 0.3, winW * 0.2];
      const secCenters = [
        -winW / 2 + secWidths[0] / 2,
        -winW / 2 + secWidths[0] + secWidths[1] / 2,
        winW / 2 - secWidths[3] - secWidths[2] / 2,
        winW / 2 - secWidths[3] / 2,
      ];
      const mullionXs = [-winW / 2 + secWidths[0], 0, winW / 2 - secWidths[3]];

      for (const { baseSillY, winCenterY } of [
        { baseSillY: 1.25, winCenterY: 1.25 + winH / 2 },
        { baseSillY: 5.45, winCenterY: 5.45 + winH / 2 },
      ]) {
        const bottomCenterY = baseSillY + bottomH / 2;
        const transomCenterY = baseSillY + bottomH + transomH / 2;

        batcher.addBox('trim', [winW + 0.16, 0.08, 0.16], [cx, baseSillY - 0.04, 0.06]);
        // Outer window frame border (top, bottom, left, right rails/stiles)
        batcher.addBox('frame', [winW, 0.06, 0.06], [cx, winCenterY + winH / 2 - 0.03, 0.04]);
        batcher.addBox('frame', [winW, 0.06, 0.06], [cx, winCenterY - winH / 2 + 0.03, 0.04]);
        batcher.addBox('frame', [0.06, winH - 0.12, 0.06], [cx - winW / 2 + 0.03, winCenterY, 0.04]);
        batcher.addBox('frame', [0.06, winH - 0.12, 0.06], [cx + winW / 2 - 0.03, winCenterY, 0.04]);
        batcher.addBox('frame', [winW - 0.04, 0.06, 0.08], [cx, baseSillY + bottomH, 0.05]);

        for (const mx of mullionXs) {
          batcher.addBox('frame', [0.06, bottomH - 0.04, 0.08], [cx + mx, bottomCenterY, 0.05]);
          batcher.addBox('frame', [0.05, transomH - 0.04, 0.06], [cx + mx, transomCenterY, 0.05]);
        }

        secCenters.forEach((scx, sIdx) => {
          batcher.addBox('glass', [secWidths[sIdx] - 0.06, transomH - 0.08, 0.02], [cx + scx, transomCenterY, 0.04]);

          const isSash = sIdx === 0 || sIdx === 3;
          const sw = secWidths[sIdx] - 0.08;

          if (isSash) {
            batcher.addBox('frame', [sw - 0.04, bottomH * 0.65, 0.03], [cx + scx, bottomCenterY - 0.25, 0.055]);
            batcher.addBox('glass', [sw - 0.12, bottomH * 0.65 - 0.08, 0.02], [cx + scx, bottomCenterY - 0.25, 0.06]);
            // Upper stationary pane above sash
            const upperSashH = bottomH - bottomH * 0.65;
            batcher.addBox('glass', [sw, upperSashH - 0.04, 0.02], [cx + scx, bottomCenterY + bottomH * 0.325, 0.04]);
            batcher.addBox(
              'steel',
              [0.02, 0.08, 0.03],
              [cx + scx + (sIdx === 0 ? sw * 0.35 : -sw * 0.35), bottomCenterY - 0.25, 0.085],
            );
          } else {
            batcher.addBox('glass', [sw, bottomH - 0.08, 0.02], [cx + scx, bottomCenterY, 0.04]);
          }
        });
      }

      batcher.addBox('wall', [winW + 0.1, 1.8, 0.06], [cx, 4.5, 0.02]);
    }

    // 7. Bay 6 (East Entrance Group + 2F Window)
    {
      const cx = bayCenters[5];
      const porchW = 3.0;
      const doorW = 1.8;
      const doorH = 2.35;
      const doorBaseY = 0.64;

      const f2WinW = 2.4;
      const f2WinH = 2.4;
      const f2WinY = 6.65;

      for (const { y, d, w } of [
        { y: 0.08, d: 1.6, w: porchW + 0.3 },
        { y: 0.24, d: 1.25, w: porchW + 0.2 },
        { y: 0.4, d: 0.9, w: porchW + 0.1 },
        { y: 0.56, d: 0.55, w: porchW },
      ]) {
        batcher.addBox('plinth', [w, 0.16, d], [cx - 0.2, y, d / 2 + 0.05]);
      }

      for (const hx of [-porchW / 2 - 0.05, porchW / 2 - 0.35]) {
        for (const pz of [-0.5, 0, 0.5]) {
          batcher.addCylinder('steel', [0.02, 0.02, 0.9, 6], [cx + hx, 0.32 + 0.45, 0.9 + pz]);
        }
        batcher.addBox('steel', [0.04, 0.04, 1.3], [cx + hx, 0.32 + 0.9, 0.9], [-0.22, 0, 0]);
        batcher.addBox('steel', [0.03, 0.02, 1.3], [cx + hx, 0.32 + 0.48, 0.9], [-0.22, 0, 0]);
      }

      // Doors
      const dx = cx - 0.2;
      batcher.addBox('darkFrame', [doorW, doorH, 0.08], [dx, doorBaseY + doorH / 2, 0.04]);
      batcher.addBox('glass', [doorW * 0.44, doorH * 0.82, 0.02], [dx - doorW * 0.24, doorBaseY + doorH * 0.45, 0.06]);
      batcher.addBox('glass', [doorW * 0.44, doorH * 0.82, 0.02], [dx + doorW * 0.24, doorBaseY + doorH * 0.45, 0.06]);
      batcher.addCylinder('steel', [0.015, 0.015, 0.85, 6], [dx - 0.06, doorBaseY + doorH * 0.45, 0.1]);
      batcher.addCylinder('steel', [0.015, 0.015, 0.85, 6], [dx + 0.06, doorBaseY + doorH * 0.45, 0.1]);
      batcher.addBox('glass', [doorW - 0.1, 0.32, 0.02], [dx, doorBaseY + doorH - 0.2, 0.06]);

      // Canopy
      batcher.addBox('darkFrame', [2.5, 0.22, 1.35], [dx, 3.25, 0.7]);
      batcher.addBox('steel', [2.52, 0.14, 0.04], [dx, 3.21, 1.38]);
      for (const lx of [-0.6, 0, 0.6]) {
        batcher.addCylinder('trim', [0.06, 0.06, 0.02, 8], [dx + lx, 3.14, 0.7]);
      }

      // Right wall & 2F window
      batcher.addBox('wall', [bay6W * 0.38, 2.8, 0.08], [cx + porchW * 0.38, plinthH + 1.4, 0.02]);
      batcher.addBox('trim', [f2WinW + 0.14, 0.08, 0.14], [dx, f2WinY - f2WinH / 2 - 0.04, 0.08]);
      // Outer window frame border (top, bottom, left, right rails/stiles)
      batcher.addBox('frame', [f2WinW, 0.06, 0.06], [dx, f2WinY + f2WinH / 2 - 0.03, 0.04]);
      batcher.addBox('frame', [f2WinW, 0.06, 0.06], [dx, f2WinY - f2WinH / 2 + 0.03, 0.04]);
      batcher.addBox('frame', [0.06, f2WinH - 0.12, 0.06], [dx - f2WinW / 2 + 0.03, f2WinY, 0.04]);
      batcher.addBox('frame', [0.06, f2WinH - 0.12, 0.06], [dx + f2WinW / 2 - 0.03, f2WinY, 0.04]);
      batcher.addBox('frame', [f2WinW - 0.06, 0.05, 0.06], [dx, f2WinY + f2WinH * 0.25, 0.06]);
      batcher.addBox('glass', [f2WinW - 0.1, f2WinH * 0.24, 0.02], [dx, f2WinY + f2WinH * 0.36, 0.05]);
      batcher.addBox('frame', [0.05, f2WinH * 0.58, 0.06], [dx - f2WinW * 0.1, f2WinY - f2WinH * 0.18, 0.06]);
      batcher.addBox('glass', [f2WinW * 0.35, f2WinH * 0.56, 0.02], [dx - f2WinW * 0.26, f2WinY - f2WinH * 0.18, 0.05]);
      batcher.addBox('glass', [f2WinW * 0.52, f2WinH * 0.56, 0.02], [dx + f2WinW * 0.2, f2WinY - f2WinH * 0.18, 0.05]);
    }

    return batcher.buildAll();
  }, [buildingWidth, wallHeight]);

  useEffect(() => () => disposeMergedMap(merged), [merged]);

  return (
    <group position={[0, 0, zOffset]} rotation={[0, rotY, 0]}>
      {merged.plinth && (
        <mesh geometry={merged.plinth} material={materials.plinthMat} raycast={NO_RAYCAST} receiveShadow />
      )}
      {merged.trim && (
        <mesh geometry={merged.trim} material={materials.trimMat} raycast={NO_RAYCAST} castShadow receiveShadow />
      )}
      {merged.groove && (
        <mesh geometry={merged.groove} material={materials.grooveMat} raycast={NO_RAYCAST} />
      )}
      {merged.wall && (
        <mesh geometry={merged.wall} material={materials.wallMat} raycast={NO_RAYCAST} castShadow receiveShadow />
      )}
      {merged.downpipe && (
        <mesh geometry={merged.downpipe} material={materials.downpipeMat} raycast={NO_RAYCAST} />
      )}
      {merged.frame && (
        <mesh geometry={merged.frame} material={materials.frameMat} raycast={NO_RAYCAST} />
      )}
      {merged.glass && (
        <mesh geometry={merged.glass} material={materials.glassMat} raycast={NO_RAYCAST} />
      )}
      {merged.darkFrame && (
        <mesh geometry={merged.darkFrame} material={materials.darkFrameMat} raycast={NO_RAYCAST} castShadow />
      )}
      {merged.steel && (
        <mesh geometry={merged.steel} material={materials.steelMat} raycast={NO_RAYCAST} />
      )}
    </group>
  );
}
