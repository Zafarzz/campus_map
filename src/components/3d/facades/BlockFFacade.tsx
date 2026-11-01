import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeBufferGeometries } from 'three-stdlib';
import { getArchitecturalWallTextures, getWindowGlassTexture } from '../materials/pbrMaterials';
import {
  getAjouEnglishFriezeTexture,
  getAjouKoreanFriezeTexture,
  getAjouDualFriezeTexture,
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
 *
 * Facade facing East towards perimeter fence:
 * - Grid Axes 1–7 (Base 36.0m CAD, 6 equal bays of 6 000 mm):
 *    * Bays 1 to 5 (Axes 1–6): Five massive window bays (6.0m each).
 *        - Ground Floor (1F): 1 600 × 1 400 mm windows, 3×2 grid (6 panes).
 *          Bay 1 has 1 window on right; Bays 2–5 have 2 windows each (9 windows total).
 *        - Second Floor (2F): 1 600 × 3 800 mm double-height stained glass windows,
 *          3×4 grid (12 panes each, 10 tall windows total).
 *    * Bay 6 (Axes 6–7): End solid bay (6.0m) featuring official universal circular
 *      emblem and "AJOU UNIVERSITY" typography plaque.
 * - 7 Classical vertical pilasters at every 6.0m axis (Axes 1 to 7) with fluting,
 *   plinth bases, and 3-tier classical capitals.
 * - Classical 3-tier entablature & cornice (+7.800m to +9.800m):
 *    * Rusticated architrave (+7.800 to +8.200m).
 *    * Dual language volumetric frieze (+8.200 to +8.900m):
 *      English: «AJOU UNIVERSITY IN TASHKENT» + Korean: «아주대학교 타슈кен트».
 *    * Stepped classical overhanging cornice with dentil molding (+8.900 to +9.800m).
 * - Dark granite / basalt foundation plinth with white drip molding (±0.000 to +0.600m).
 */
export function BlockFFacade({
  buildingWidth,
  buildingDepth,
  facing = 'east',
  wallHeight = 9.8,
  opacity = 1,
  transparent = false,
  wallColor = '#ebdcc5',
  trimColor = '#f8fafc',
  plinthColor = '#334155',
  frameColor = '#27272a',
}: BlockFFacadeProps) {
  const BASE_CAD_LENGTH = 36.0;
  const facadeLength = Math.max(BASE_CAD_LENGTH, buildingDepth);
  const scaleZ = facadeLength / BASE_CAD_LENGTH;

  const isEast = facing === 'east';
  const sign = isEast ? 1 : -1;
  const wallX = sign * (buildingWidth / 2);
  const rotY = sign * (Math.PI / 2);

  const plinthHeight = 0.6; // Ground to +0.600m
  const architraveHeight = 0.4; // +7.800 to +8.200m
  const friezeHeight = 0.7; // +8.200 to +8.900m
  const corniceHeight = 0.9; // +8.900 to +9.800m

  // Window geometry dimensions from blueprint
  const winW = 1.6;
  const f1WinH = 1.4;
  const f1WinCenterY = 1.8; // Sill at +1.100, lintel at +2.500
  const f2WinH = 3.8;
  const f2WinCenterY = 5.9; // Sill at +4.000, lintel at +7.800

  // Textures and PBR Materials
  const wallTextures = useMemo(() => getArchitecturalWallTextures(8, 2), []);
  const glassTexture = useMemo(() => getWindowGlassTexture(), []);
  const englishFriezeTexture = useMemo(() => getAjouEnglishFriezeTexture(), []);
  const koreanFriezeTexture = useMemo(() => getAjouKoreanFriezeTexture(), []);
  const dualFriezeTexture = useMemo(() => getAjouDualFriezeTexture(), []);

  const materials = useMemo(() => {
    // Warm sand travertine panels with horizontal cladding joints
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

    // Dark granite / basalt foundation plinth
    const plinthMat = new THREE.MeshStandardMaterial({
      color: plinthColor,
      roughness: 0.85,
      metalness: 0.08,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // Crisp white classical cornice, trim, pilasters and sills
    const trimMat = new THREE.MeshStandardMaterial({
      color: trimColor,
      roughness: 0.65,
      metalness: 0.06,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // Dark graphite architectural metal window frames & mullions
    const frameMat = new THREE.MeshStandardMaterial({
      color: frameColor,
      roughness: 0.35,
      metalness: 0.65,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // Deep dark architectural tinted window glass with realistic obsidian PBR reflection
    const glassMat = new THREE.MeshStandardMaterial({
      color: '#020617',
      map: glassTexture ?? null,
      roughness: 0.08,
      metalness: 0.85,
      envMapIntensity: 0.85,
      transparent: true,
      opacity: transparent ? opacity * 0.9 : 0.98,
      depthWrite: !transparent,
    });

    // Dark interior window cavity backing box (blocks light wall bleed-through)
    const cavityMat = new THREE.MeshBasicMaterial({
      color: '#020408',
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // Dedicated English Signage Frieze material ("AJOU UNIVERSITY IN TASHKENT")
    const englishFriezeMat = new THREE.MeshStandardMaterial({
      map: englishFriezeTexture ?? null,
      color: '#ffffff',
      roughness: 0.45,
      metalness: 0.08,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // Dedicated Korean Signage Frieze material ("아주대학교 타슈켄트")
    const koreanFriezeMat = new THREE.MeshStandardMaterial({
      map: koreanFriezeTexture ?? null,
      color: '#ffffff',
      roughness: 0.45,
      metalness: 0.08,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // Dual English/Korean signage frieze panel (fallback)
    const friezeMat = new THREE.MeshStandardMaterial({
      map: dualFriezeTexture ?? null,
      color: '#ffffff',
      roughness: 0.45,
      metalness: 0.08,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // Horizontal rustication grooves and flutes
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
      friezeMat,
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
    dualFriezeTexture,
    transparent,
    opacity,
  ]);

  // Facade length and architectural 6.0m bay layout:
  // North end (adjacent to Suwon Hall / Block E) is at -facadeLength / 2
  // South end (extended towards south walkway per Photo 3) is at +facadeLength / 2
  const bayCount = Math.max(6, Math.round(facadeLength / 6.0));
  const bayWidth = facadeLength / bayCount; // ~6.0m per bay
  const fromNorthZ = (dist: number) => -facadeLength / 2 + dist;

  // 11 Pilaster axes at 6.0m spacing (Axes 1 to bayCount + 1)
  const pilasterPositions = useMemo(() => {
    const list: number[] = [];
    for (let i = 0; i <= bayCount; i++) {
      list.push(fromNorthZ(i * bayWidth));
    }
    return list;
  }, [bayCount, bayWidth, facadeLength]);

  // Horizontal rustication joints every 0.45m from plinth (+0.600) to architrave (+7.800)
  const rusticationRows = useMemo(() => {
    const list: number[] = [];
    for (let y = 0.9; y <= 7.65; y += 0.45) {
      list.push(y);
    }
    return list;
  }, []);

  // Window placements across all window bays (bays 1 to bayCount - 1):
  // (Bay 0 at North end is the solid medallion bay)
  const windowOffsetsZ = useMemo(() => {
    const list: number[] = [];
    for (let b = 1; b < bayCount; b++) {
      const bayCenterZ = fromNorthZ((b + 0.5) * bayWidth);
      list.push(bayCenterZ - 1.4);
      list.push(bayCenterZ + 1.4);
    }
    return list;
  }, [bayCount, bayWidth, facadeLength]);

  const f1WindowOffsets = windowOffsetsZ;
  const f2WindowOffsets = windowOffsetsZ;

  // Key architectural bay centers:
  // Bay 0 (North end): Solid end bay with official circular Ajou logo medallion
  const emblemBayZ = fromNorthZ(0.5 * bayWidth);
  // Bay 1: Window bay with Korean signage frieze («아주대학교 타슈켄트»)
  const koreanSignZ = fromNorthZ(1.5 * bayWidth);
  // Bays 3 & 4: Window bays with English signage frieze («AJOU UNIVERSITY IN TASHKENT»)
  const englishSignZ = fromNorthZ(3.8 * bayWidth);

  // Pre-merged compound geometries for optimal performance (minimal draw calls)
  const f1FrameGeo = useMemo(() => {
    // Outer perimeter frame
    const outer = new THREE.BoxGeometry(0.06, f1WinH, winW);
    // Horizontal transom bar at mid-height
    const transom = new THREE.BoxGeometry(0.04, 0.045, winW - 0.1);
    transom.translate(0.015, 0, 0);
    // 2 Vertical mullions dividing into 3 columns
    const m1 = new THREE.BoxGeometry(0.04, f1WinH - 0.1, 0.045);
    m1.translate(0.015, 0, -winW / 6);
    const m2 = new THREE.BoxGeometry(0.04, f1WinH - 0.1, 0.045);
    m2.translate(0.015, 0, winW / 6);

    return mergeBufferGeometries([outer, transom, m1, m2]) ?? outer;
  }, [winW, f1WinH]);

  const f1StoneTrimGeo = useMemo(() => {
    // Projecting stone sill at bottom
    const sill = new THREE.BoxGeometry(0.18, 0.12, winW + 0.25);
    sill.translate(0.06, -f1WinH / 2 - 0.06, 0);
    // Classical stone lintel at top
    const lintel = new THREE.BoxGeometry(0.14, 0.1, winW + 0.2);
    lintel.translate(0.04, f1WinH / 2 + 0.05, 0);

    return mergeBufferGeometries([sill, lintel]) ?? sill;
  }, [winW, f1WinH]);

  const f2FrameGeo = useMemo(() => {
    // Outer perimeter frame
    const outer = new THREE.BoxGeometry(0.06, f2WinH, winW);
    // 3 Horizontal transoms dividing into 4 tiers
    const t1 = new THREE.BoxGeometry(0.04, 0.045, winW - 0.1);
    t1.translate(0.015, -f2WinH * 0.25, 0);
    const t2 = new THREE.BoxGeometry(0.04, 0.045, winW - 0.1);
    t2.translate(0.015, 0, 0);
    const t3 = new THREE.BoxGeometry(0.04, 0.045, winW - 0.1);
    t3.translate(0.015, f2WinH * 0.25, 0);
    // 2 Vertical mullions dividing into 3 columns
    const m1 = new THREE.BoxGeometry(0.04, f2WinH - 0.1, 0.045);
    m1.translate(0.015, 0, -winW / 6);
    const m2 = new THREE.BoxGeometry(0.04, f2WinH - 0.1, 0.045);
    m2.translate(0.015, 0, winW / 6);

    return mergeBufferGeometries([outer, t1, t2, t3, m1, m2]) ?? outer;
  }, [winW, f2WinH]);

  const f2StoneTrimGeo = useMemo(() => {
    // Projecting stone sill at bottom (+4.000m)
    const sill = new THREE.BoxGeometry(0.2, 0.14, winW + 0.25);
    sill.translate(0.07, -f2WinH / 2 - 0.07, 0);
    // Classical molded stone lintel / capital header at top (+7.800m)
    const lintel = new THREE.BoxGeometry(0.16, 0.12, winW + 0.2);
    lintel.translate(0.05, f2WinH / 2 + 0.06, 0);

    return mergeBufferGeometries([sill, lintel]) ?? sill;
  }, [winW, f2WinH]);

  // Dentils along the 36m cornice (spaced every 0.30m)
  const dentilsGeo = useMemo(() => {
    const toothGeo = new THREE.BoxGeometry(0.08, 0.12, 0.14);
    const geoms: THREE.BufferGeometry[] = [];
    const count = Math.floor(facadeLength / 0.3);
    for (let i = 0; i < count; i++) {
      const z = -facadeLength / 2 + (i + 0.5) * (facadeLength / count);
      const cloned = toothGeo.clone();
      cloned.translate(0, 0, z);
      geoms.push(cloned);
    }
    return mergeBufferGeometries(geoms) ?? toothGeo;
  }, [facadeLength]);

  return (
    <group position={[wallX, 0, 0]}>
      {/* ============================================================== */}
      {/* 1. DARK GRANITE FOUNDATION PLINTH (±0.000 to +0.600m)          */}
      {/* ============================================================== */}
      {/* Plinth Base Body */}
      <mesh position={[sign * 0.08, plinthHeight / 2, 0]} material={materials.plinthMat} receiveShadow>
        <boxGeometry args={[0.22, plinthHeight, facadeLength + 0.1]} />
      </mesh>
      {/* White Stone Plinth Drip Edge Molding at +0.600m */}
      <mesh position={[sign * 0.12, plinthHeight, 0]} material={materials.trimMat} castShadow>
        <boxGeometry args={[0.16, 0.08, facadeLength + 0.15]} />
      </mesh>

      {/* ============================================================== */}
      {/* 2. MAIN TRAVERTINE FACADE WALL (+0.600 to +7.800m)             */}
      {/* ============================================================== */}
      <mesh
        position={[0, (7.8 + plinthHeight) / 2, 0]}
        material={materials.wallMat}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[0.15, 7.8 - plinthHeight, facadeLength]} />
      </mesh>

      {/* Horizontal Travertine Slab Joints (every 0.45m) */}
      {rusticationRows.map((yVal, idx) => (
        <mesh key={`rust-${idx}`} position={[sign * 0.078, yVal, 0]} material={materials.jointMat}>
          <boxGeometry args={[0.01, 0.035, facadeLength]} />
        </mesh>
      ))}

      {/* ============================================================== */}
      {/* 3. CLASSICAL VERTICAL PILASTERS (at each 6.0m bay boundary)    */}
      {/* ============================================================== */}
      {pilasterPositions.map((pz, idx) => {
        const isCorner = idx === 0 || idx === pilasterPositions.length - 1;
        const pilasterW = isCorner ? 0.65 : 0.55;
        const shaftH = 7.4 - 0.85;

        return (
          <group key={`pilaster-${idx}`} position={[sign * 0.14, 0, pz]}>
            {/* Plinth Base (+0.60 to +0.85m) */}
            <mesh position={[0, 0.725, 0]} material={materials.trimMat} castShadow receiveShadow>
              <boxGeometry args={[0.26, 0.25, pilasterW + 0.08]} />
            </mesh>

            {/* Main Shaft Body (+0.85 to +7.40m) */}
            <mesh position={[-sign * 0.01, (7.4 + 0.85) / 2, 0]} material={materials.wallMat} castShadow receiveShadow>
              <boxGeometry args={[0.22, shaftH, pilasterW]} />
            </mesh>

            {/* Vertical Fluted Grooves in Pilaster Shaft Face */}
            <mesh position={[sign * 0.105, (7.4 + 0.85) / 2, -0.12]} material={materials.jointMat}>
              <boxGeometry args={[0.02, shaftH - 0.4, 0.05]} />
            </mesh>
            <mesh position={[sign * 0.105, (7.4 + 0.85) / 2, 0.12]} material={materials.jointMat}>
              <boxGeometry args={[0.02, shaftH - 0.4, 0.05]} />
            </mesh>

            {/* Classical Molded Capital (+7.40 to +7.80m) */}
            {/* Necking */}
            <mesh position={[0, 7.48, 0]} material={materials.trimMat} castShadow>
              <boxGeometry args={[0.26, 0.16, pilasterW + 0.06]} />
            </mesh>
            {/* Echinus / ovolo bed */}
            <mesh position={[sign * 0.02, 7.64, 0]} material={materials.trimMat} castShadow>
              <boxGeometry args={[0.3, 0.16, pilasterW + 0.12]} />
            </mesh>
            {/* Abacus top slab */}
            <mesh position={[sign * 0.04, 7.76, 0]} material={materials.trimMat} castShadow>
              <boxGeometry args={[0.34, 0.08, pilasterW + 0.18]} />
            </mesh>
          </group>
        );
      })}

      {/* ============================================================== */}
      {/* 4. GROUND FLOOR (1F) WINDOWS (+1.100 to +2.500m, 1600 × 1400)  */}
      {/* ============================================================== */}
      {f1WindowOffsets.map((wz, idx) => (
        <group key={`f1-win-${idx}`} position={[sign * 0.08, f1WinCenterY, wz]}>
          {/* Dark Interior Cavity Backing Box (avoids see-through to light travertine wall) */}
          <mesh position={[-sign * 0.035, 0, 0]} material={materials.cavityMat}>
            <boxGeometry args={[0.06, f1WinH - 0.06, winW - 0.06]} />
          </mesh>

          {/* Dark Graphite Outer Frame + Transom + 2 Mullions (Merged) */}
          <mesh geometry={f1FrameGeo} material={materials.frameMat} castShadow />

          {/* Recessed Tinted Glass (3×2 Grid Pane) */}
          <mesh position={[-sign * 0.015, 0, 0]} material={materials.glassMat}>
            <boxGeometry args={[0.03, f1WinH - 0.12, winW - 0.12]} />
          </mesh>

          {/* Projecting White Stone Sill & Lintel (Merged) */}
          <mesh geometry={f1StoneTrimGeo} material={materials.trimMat} castShadow />
        </group>
      ))}

      {/* ============================================================== */}
      {/* 5. 2F DOUBLE-HEIGHT WINDOWS (+4.000 to +7.800m, 1600 × 3800)   */}
      {/* ============================================================== */}
      {f2WindowOffsets.map((wz, idx) => (
        <group key={`f2-win-${idx}`} position={[sign * 0.08, f2WinCenterY, wz]}>
          {/* Dark Interior Cavity Backing Box (avoids see-through to light travertine wall) */}
          <mesh position={[-sign * 0.035, 0, 0]} material={materials.cavityMat}>
            <boxGeometry args={[0.06, f2WinH - 0.06, winW - 0.06]} />
          </mesh>

          {/* Dark Graphite Outer Frame + 3 Transoms + 2 Mullions (Merged) */}
          <mesh geometry={f2FrameGeo} material={materials.frameMat} castShadow />

          {/* Recessed Tinted Glass (3×4 Grid Pane = 12 panes!) */}
          <mesh position={[-sign * 0.015, 0, 0]} material={materials.glassMat}>
            <boxGeometry args={[0.03, f2WinH - 0.12, winW - 0.12]} />
          </mesh>

          {/* Projecting White Stone Sill & Classical Lintel (Merged) */}
          <mesh geometry={f2StoneTrimGeo} material={materials.trimMat} castShadow />
        </group>
      ))}

      {/* ============================================================== */}
      {/* 6. BAY 0 (North end): SOLID FIELD WITH OFFICIAL AJOU EMBLEM   */}
      {/* ============================================================== */}
      <group position={[sign * 0.05, 0, emblemBayZ]}>
        {/* Decorative horizontal relief grooves across the solid field */}
        {[2.0, 3.5, 5.0, 6.5].map((gy) => (
          <mesh key={`emblem-groove-${gy}`} position={[sign * 0.035, gy, 0]} material={materials.jointMat}>
            <boxGeometry args={[0.015, 0.035, bayWidth * 0.86]} />
          </mesh>
        ))}

        {/* Universal Official Ajou University Medallion & Typography */}
        <AjouLogoMedallion
          position={[sign * 0.1, 5.2, 0]}
          rotation={[0, rotY, 0]}
          radius={1.15}
          showText={true}
          opacity={opacity}
          transparent={transparent}
        />
      </group>

      {/* ============================================================== */}
      {/* 7. CLASSICAL ENTABLATURE & CORNICE (+7.800m to +9.800m)        */}
      {/* ============================================================== */}
      {/* 7a. Rusticated Architrave (+7.800 to +8.200m) */}
      <mesh position={[sign * 0.12, 8.0, 0]} material={materials.trimMat} castShadow receiveShadow>
        <boxGeometry args={[0.24, architraveHeight, facadeLength + 0.15]} />
      </mesh>
      {/* Architrave horizontal shadow reveals */}
      {[7.92, 8.08].map((gy) => (
        <mesh key={`architrave-reveal-${gy}`} position={[sign * 0.245, gy, 0]} material={materials.jointMat}>
          <boxGeometry args={[0.015, 0.025, facadeLength + 0.16]} />
        </mesh>
      ))}

      {/* 7b. Classical Volumetric Signage Frieze (+8.200 to +8.900m) */}
      <mesh position={[sign * 0.14, 8.55, 0]} material={materials.trimMat} castShadow receiveShadow>
        <boxGeometry args={[0.26, friezeHeight, facadeLength + 0.2]} />
      </mesh>

      {/* Korean Signage Plaque: «아주대학교 타슈켄트» (Bay 1 / Axes 5–6 per Blueprint Photo 2) */}
      {koreanFriezeTexture && (
        <mesh position={[sign * 0.272, 8.52, koreanSignZ]} rotation={[0, rotY, 0]}>
          <planeGeometry args={[Math.min(5.6, bayWidth - 0.4), 0.58]} />
          <primitive object={materials.koreanFriezeMat} attach="material" />
        </mesh>
      )}

      {/* English Signage Plaque: «AJOU UNIVERSITY IN TASHKENT» (Bays 3–4 / Axes 2–4 per Blueprint Photo 2) */}
      {englishFriezeTexture && (
        <mesh position={[sign * 0.272, 8.52, englishSignZ]} rotation={[0, rotY, 0]}>
          <planeGeometry args={[Math.min(13.5, 2.3 * bayWidth - 0.4), 0.58]} />
          <primitive object={materials.englishFriezeMat} attach="material" />
        </mesh>
      )}

      {/* 7c. Classical Multi-Tiered Stepped Cornice (+8.900 to +9.800m) */}
      {/* Lower bed molding (+8.900 to +9.150m) */}
      <mesh position={[sign * 0.2, 9.025, 0]} material={materials.trimMat} castShadow>
        <boxGeometry args={[0.36, 0.25, facadeLength + 0.25]} />
      </mesh>
      {/* Dentil reveal band beam (+9.150 to +9.350m) */}
      <mesh position={[sign * 0.24, 9.25, 0]} material={materials.trimMat} castShadow>
        <boxGeometry args={[0.44, 0.2, facadeLength + 0.3]} />
      </mesh>
      {/* Projecting 3D Dentil Blocks */}
      <mesh position={[sign * 0.44, 9.25, 0]} geometry={dentilsGeo} material={materials.trimMat} castShadow />

      {/* Massive Overhanging Corona & Cymatium Roof Eaves (+9.350 to +9.800m) */}
      <mesh position={[sign * 0.32, 9.575, 0]} material={materials.trimMat} castShadow>
        <boxGeometry args={[0.58, 0.45, facadeLength + 0.4]} />
      </mesh>
      {/* Roof eave drip nose cap */}
      <mesh position={[sign * 0.6, 9.775, 0]} material={materials.trimMat} castShadow>
        <boxGeometry args={[0.06, 0.05, facadeLength + 0.44]} />
      </mesh>
    </group>
  );
}
