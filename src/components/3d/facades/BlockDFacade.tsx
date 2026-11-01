import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeBufferGeometries } from 'three-stdlib';
import { getArchitecturalWallTextures, getWindowGlassTexture } from '../materials/pbrMaterials';

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
 * «ДВОРОВЫЙ ПРОДОЛЬНЫЙ ФАСАД 2-ЭТАЖНОГО УЧЕБНОГО КОРПУСА В ОСЯХ А–Ж (2D ЧЕРТЕЖ)»
 * (Ортогональная проекция со стороны газона | Размеры в мм (М 1:100)).
 *
 * Unified with Block C Material & Window Architectural Standards:
 * - High-grade travertine wall with normal & roughness PBR maps.
 * - Dark graphite architectural metal window frames (#27272a).
 * - Deep tinted reflective glass with PBR environment reflections (#0f172a).
 * - Projecting classical stone sills & lintels (#f8fafc).
 * - Dark granite plinth with white stone drip molding (±0.000 to +0.600m).
 * - Symmetrical 4-section panoramic ribbon windows with transom in each bay (4 500 × 2 000 mm).
 * - Vertical structural pilasters along column axes with burgundy metal drainpipes at axes Б, Г, Е.
 * - Horizontal rustication joints every 0.45m.
 */
export function BlockDFacade({
  buildingWidth,
  buildingDepth,
  facing = 'south',
  wallHeight = 8.05,
  roofHeight = 1.6,
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

  // Grid Axes А to Ж: 6 bays
  const numBays = 6;
  const bayWidth = buildingWidth / numBays;
  // Window width is 75% of bay width (4 500 mm in a 6 000 mm bay)
  const windowWidth = bayWidth * 0.75;
  const pilasterWidth = Math.max(0.55, bayWidth * 0.12);
  const winHeight = 2.0;

  // Column axes along X (Axes А, Б, В, Г, Д, Е, Ж)
  const columnAxes = useMemo(() => {
    const list: number[] = [];
    for (let i = 0; i <= numBays; i++) {
      list.push(-buildingWidth / 2 + i * bayWidth);
    }
    return list;
  }, [buildingWidth, bayWidth, numBays]);

  // Bay center coordinates along X
  const bayCenters = useMemo(() => {
    const list: number[] = [];
    for (let i = 0; i < numBays; i++) {
      list.push(-buildingWidth / 2 + (i + 0.5) * bayWidth);
    }
    return list;
  }, [buildingWidth, bayWidth, numBays]);

  // Textures and Materials (Unified with Block C standard)
  const travertinePbr = useMemo(() => getArchitecturalWallTextures(12, 3), []);
  const glassTex = useMemo(() => getWindowGlassTexture(), []);

  const materials = useMemo(() => {
    // Warm sand travertine panels with horizontal cladding joints
    const wallMat = new THREE.MeshStandardMaterial({
      color: wallColor,
      map: travertinePbr?.map ?? null,
      normalMap: travertinePbr?.normalMap ?? null,
      normalScale: new THREE.Vector2(0.25, 0.25),
      roughnessMap: travertinePbr?.roughnessMap ?? null,
      roughness: 0.78,
      metalness: 0.03,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // Dark granite foundation plinth
    const plinthMat = new THREE.MeshStandardMaterial({
      color: plinthColor,
      roughness: 0.85,
      metalness: 0.08,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // Clean white classical cornice and stone sills
    const trimMat = new THREE.MeshStandardMaterial({
      color: trimColor,
      roughness: 0.65,
      metalness: 0.06,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // Dark graphite architectural metal window frames (unified with Block C)
    const frameMat = new THREE.MeshStandardMaterial({
      color: frameColor,
      roughness: 0.35,
      metalness: 0.65,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // Deep architectural tinted window glass (unified obsidian PBR reflection)
    const glassMat = new THREE.MeshStandardMaterial({
      color: '#020617',
      map: glassTex ?? null,
      roughness: 0.08,
      metalness: 0.85,
      envMapIntensity: 0.9,
      transparent: true,
      opacity: transparent ? opacity * 0.9 : 0.98,
      depthWrite: !transparent,
    });

    // Dark interior window cavity backing box (blocks light bleed-through)
    const cavityMat = new THREE.MeshBasicMaterial({
      color: '#020408',
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // Burgundy metal for roof edge and downspouts
    const burgundyMat = new THREE.MeshStandardMaterial({
      color: roofColor,
      roughness: 0.45,
      metalness: 0.35,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // Rustication joint lines
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

  // Pre-merged Window Compound Geometry (Outer Frame + 3 Vertical Mullions + Horizontal Transom)
  const windowFrameGeo = useMemo(() => {
    // Outer perimeter box
    const outer = new THREE.BoxGeometry(windowWidth, winHeight, 0.06);
    // 3 Vertical Mullions dividing into 4 equal panes
    const m1 = new THREE.BoxGeometry(0.045, winHeight - 0.08, 0.045);
    m1.translate(-windowWidth * 0.25, 0, 0.015);
    const m2 = new THREE.BoxGeometry(0.045, winHeight - 0.08, 0.045);
    m2.translate(0, 0, 0.015);
    const m3 = new THREE.BoxGeometry(0.045, winHeight - 0.08, 0.045);
    m3.translate(windowWidth * 0.25, 0, 0.015);
    // Horizontal Transom Bar (фрамуга, 0.45m below top)
    const transom = new THREE.BoxGeometry(windowWidth - 0.08, 0.045, 0.045);
    transom.translate(0, winHeight / 2 - 0.45, 0.015);

    return mergeBufferGeometries([outer, m1, m2, m3, transom]) ?? outer;
  }, [windowWidth, winHeight]);

  // Pre-merged Stone Sill & Lintel Trim
  const windowStoneTrimGeo = useMemo(() => {
    // Projecting stone sill at bottom
    const sill = new THREE.BoxGeometry(windowWidth + 0.22, 0.12, 0.18);
    sill.translate(0, -winHeight / 2 - 0.06, 0.05);
    // Classical stone lintel at top
    const lintel = new THREE.BoxGeometry(windowWidth + 0.16, 0.1, 0.14);
    lintel.translate(0, winHeight / 2 + 0.05, 0.03);

    return mergeBufferGeometries([sill, lintel]) ?? sill;
  }, [windowWidth, winHeight]);

  // Common Geometries
  const plinthGeo = useMemo(() => new THREE.BoxGeometry(buildingWidth + 0.35, 0.6, 0.24), [buildingWidth]);
  const plinthCapGeo = useMemo(() => new THREE.BoxGeometry(buildingWidth + 0.4, 0.08, 0.28), [buildingWidth]);

  const pilasterGeo = useMemo(
    () => new THREE.BoxGeometry(pilasterWidth, wallHeight - 0.6, 0.16),
    [pilasterWidth, wallHeight],
  );

  // Horizontal rustication rows (every 0.45m)
  const rusticationRows = useMemo(() => {
    const list: number[] = [];
    for (let y = 0.9; y <= 7.65; y += 0.45) {
      list.push(y);
    }
    return list;
  }, []);

  // Cornice soffit & drip edge
  const corniceSoffitGeo = useMemo(
    () => new THREE.BoxGeometry(buildingWidth + 1.2, 0.35, 0.42),
    [buildingWidth],
  );
  const corniceDripEdgeGeo = useMemo(
    () => new THREE.BoxGeometry(buildingWidth + 1.26, 0.08, 0.48),
    [buildingWidth],
  );

  // Drainpipe geometry
  const pipeRadius = 0.065;
  const pipeHeight = wallHeight - 0.65;
  const drainpipeGeo = useMemo(() => new THREE.CylinderGeometry(pipeRadius, pipeRadius, pipeHeight, 16), [pipeHeight]);
  const hopperGeo = useMemo(() => new THREE.ConeGeometry(pipeRadius * 2.2, 0.35, 16), []);
  const bracketGeo = useMemo(() => new THREE.BoxGeometry(pipeRadius * 3, 0.04, 0.16), []);
  const shoeGeo = useMemo(() => new THREE.CylinderGeometry(pipeRadius, pipeRadius * 1.15, 0.35, 16), []);

  return (
    <group position={[0, 0, wallZ]}>
      {/* ============================================================== */}
      {/* 1. DARK GRANITE FOUNDATION PLINTH (±0.000 to +0.600 m)         */}
      {/* ============================================================== */}
      <mesh
        position={[0, 0.3, sign * 0.08]}
        geometry={plinthGeo}
        material={materials.plinthMat}
        castShadow
        receiveShadow
      />
      {/* Plinth White Stone Drip Molding at +0.600m */}
      <mesh
        position={[0, 0.6, sign * 0.1]}
        geometry={plinthCapGeo}
        material={materials.trimMat}
        castShadow
      />

      {/* ============================================================== */}
      {/* 2. MAIN TRAVERTINE FACADE WALL (+0.600 to +8.050 m)            */}
      {/* ============================================================== */}
      <mesh position={[0, (wallHeight + 0.6) / 2, 0]} material={materials.wallMat} castShadow receiveShadow>
        <boxGeometry args={[buildingWidth, wallHeight - 0.6, 0.15]} />
      </mesh>

      {/* Horizontal Travertine Slab Joints (every 0.45 m) */}
      {rusticationRows.map((yVal, idx) => (
        <mesh key={`rust-${idx}`} position={[0, yVal, sign * 0.078]} material={materials.jointMat}>
          <boxGeometry args={[buildingWidth, 0.035, 0.01]} />
        </mesh>
      ))}

      {/* ============================================================== */}
      {/* 3. STRUCTURAL COLUMN PILASTERS (Axes А, Б, В, Г, Д, Е, Ж)       */}
      {/* ============================================================== */}
      {columnAxes.map((ax, idx) => (
        <group key={`col-${idx}`} position={[ax, 0.6 + (wallHeight - 0.6) / 2, sign * 0.08]}>
          {/* Main Pilaster Shaft */}
          <mesh geometry={pilasterGeo} material={materials.wallMat} castShadow receiveShadow />
          {/* Vertical Fluted Grooves in Pilaster Face */}
          <mesh position={[-0.12, 0, sign * 0.082]} material={materials.jointMat}>
            <boxGeometry args={[0.045, wallHeight - 1.2, 0.02]} />
          </mesh>
          <mesh position={[0.12, 0, sign * 0.082]} material={materials.jointMat}>
            <boxGeometry args={[0.045, wallHeight - 1.2, 0.02]} />
          </mesh>
          {/* Pilaster Plinth Base at +0.60m */}
          <mesh position={[0, -(wallHeight - 0.6) / 2 + 0.12, sign * 0.02]} material={materials.trimMat} castShadow>
            <boxGeometry args={[pilasterWidth + 0.08, 0.24, 0.2]} />
          </mesh>
          {/* Pilaster Molded Capital under Cornice */}
          <mesh position={[0, (wallHeight - 0.6) / 2 - 0.12, sign * 0.02]} material={materials.trimMat} castShadow>
            <boxGeometry args={[pilasterWidth + 0.1, 0.24, 0.22]} />
          </mesh>
        </group>
      ))}

      {/* ============================================================== */}
      {/* 4. THE 6 WINDOW BAYS (Axes А–Б, Б–В, В–Г, Г–Д, Д–Е, Е–Ж)       */}
      {/* ============================================================== */}
      {bayCenters.map((cx, bayIdx) => (
        <group key={`bay-${bayIdx}`} position={[cx, 0, 0]}>
          {/* --- 4a. 1st Floor Window (+1.100 to +3.100 m, Center Y = 2.100 m) --- */}
          <group position={[0, 2.1, sign * 0.08]}>
            {/* Interior cavity box (blocks light bleed) */}
            <mesh position={[0, 0, -sign * 0.035]} material={materials.cavityMat}>
              <boxGeometry args={[windowWidth - 0.06, winHeight - 0.06, 0.06]} />
            </mesh>

            {/* Merged Dark Graphite Frame (Outer + 3 Mullions + Transom) */}
            <mesh geometry={windowFrameGeo} material={materials.frameMat} castShadow />

            {/* Recessed Tinted Glass (Reflective PBR) */}
            <mesh position={[0, 0, -sign * 0.015]} material={materials.glassMat}>
              <boxGeometry args={[windowWidth - 0.1, winHeight - 0.1, 0.03]} />
            </mesh>

            {/* Projecting White Stone Sill & Lintel */}
            <mesh geometry={windowStoneTrimGeo} material={materials.trimMat} castShadow />
          </group>

          {/* --- 4b. 2nd Floor Window (+4.500 to +6.500 m, Center Y = 5.500 m) --- */}
          <group position={[0, 5.5, sign * 0.08]}>
            {/* Interior cavity box (blocks light bleed) */}
            <mesh position={[0, 0, -sign * 0.035]} material={materials.cavityMat}>
              <boxGeometry args={[windowWidth - 0.06, winHeight - 0.06, 0.06]} />
            </mesh>

            {/* Merged Dark Graphite Frame (Outer + 3 Mullions + Transom) */}
            <mesh geometry={windowFrameGeo} material={materials.frameMat} castShadow />

            {/* Recessed Tinted Glass (Reflective PBR) */}
            <mesh position={[0, 0, -sign * 0.015]} material={materials.glassMat}>
              <boxGeometry args={[windowWidth - 0.1, winHeight - 0.1, 0.03]} />
            </mesh>

            {/* Projecting White Stone Sill & Lintel */}
            <mesh geometry={windowStoneTrimGeo} material={materials.trimMat} castShadow />
          </group>
        </group>
      ))}

      {/* ============================================================== */}
      {/* 5. DOWNSPOUT DRAINPIPES AT AXES Б, Г, Е (indices 1, 3, 5)       */}
      {/* ============================================================== */}
      {[1, 3, 5].map((axisIdx) => {
        const ax = columnAxes[axisIdx];
        return (
          <group key={`downspout-${axisIdx}`} position={[ax, 0, sign * 0.2]}>
            {/* Funnel Hopper under the cornice */}
            <mesh
              position={[0, wallHeight - 0.18, 0]}
              rotation={[Math.PI, 0, 0]}
              geometry={hopperGeo}
              material={materials.burgundyMat}
              castShadow
            />

            {/* Vertical Drain Pipe */}
            <mesh
              position={[0, 0.6 + pipeHeight / 2, 0]}
              geometry={drainpipeGeo}
              material={materials.burgundyMat}
              castShadow
            />

            {/* Mounting Brackets */}
            {[1.4, 3.2, 5.0, 6.8].map((by, bIdx) => (
              <mesh
                key={`b-${bIdx}`}
                position={[0, by, -sign * 0.05]}
                geometry={bracketGeo}
                material={materials.burgundyMat}
              />
            ))}

            {/* Bottom Drain Shoe / Elbow discharging over plinth */}
            <mesh
              position={[0, 0.58, sign * 0.08]}
              rotation={[sign * 0.45, 0, 0]}
              geometry={shoeGeo}
              material={materials.burgundyMat}
              castShadow
            />
          </group>
        );
      })}

      {/* ============================================================== */}
      {/* 6. ROOF EAVE OVERHANG & CORNICE                                */}
      {/* ============================================================== */}
      {/* 6a. White Soffit / Fascia (+7.700 to +8.050 m) */}
      <mesh
        position={[0, wallHeight - 0.175, sign * 0.2]}
        geometry={corniceSoffitGeo}
        material={materials.trimMat}
        castShadow
        receiveShadow
      />

      {/* 6b. Burgundy Metal Drip Edge / Coping (+8.050 to +8.150 m) */}
      <mesh
        position={[0, wallHeight + 0.04, sign * 0.24]}
        geometry={corniceDripEdgeGeo}
        material={materials.burgundyMat}
        castShadow
      />
    </group>
  );
}
