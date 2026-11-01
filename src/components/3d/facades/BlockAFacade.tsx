import { useMemo } from 'react';
import * as THREE from 'three';
import { getArchitecturalWallTextures, getWindowGlassTexture } from '../materials/pbrMaterials';

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
 * Reconstructed directly from 2D CAD Blueprint:
 * «ФАСАД УЧЕБНОГО КОРПУСА С ВХОДНОЙ ГРУППОЙ «DAEWOO HALL» (2D ЧЕРТЕЖ-РАЗВЕРТКА)».
 *
 * Facade facing South ("сторона А блока, смотрящая на заборы"):
 * - Grid Axes А – Е (Total 42.0m CAD base, scaled proportionally to building footprint).
 * - 6-bay rhythm with exact ratio [1 : 2 : 2 : 2 : 2 : 1] across 10 structural units:
 *    * Bay 1 (West / Left, Axis А-Б): Solid travertine on 1F, 3-pane horizontal transom window on 2F.
 *    * Bays 2, 3, 4, 5 (Axes Б-В, В-Г, Г-Д, Д-Е): Four massive panoramic ribbon window bays
 *      on both 1F and 2F. Each window features a continuous top transom band and 4 bottom sections
 *      (operable sashes on flanks, fixed panoramic glass in center).
 *    * Bay 6 (East / Right, Axis Д-Е / E): Entrance Group («Входная группа с козырьком»)
 *      featuring wide stone steps, stainless steel handrails, glazed double doors,
 *      cantilevered modern canopy, and 2F transom window.
 * - Column pilasters with full-height terracotta downspout drainpipes at every axis.
 * - Dark granite / basalt foundation plinth (±0.000 to +0.800m).
 * - Continuous white cornice frieze (+7.800m to +8.200m eaves level).
 * - Directly on the right (East), corridor A => C («DAEWOO HALL») seamlessly attaches.
 */
export function BlockAFacade({
  buildingWidth,
  buildingDepth,
  facing = 'south',
  wallHeight = 8.2,
  roofHeight = 3.6,
  opacity = 1,
  transparent = false,
  wallColor = '#ebdcc5',
  trimColor = '#f8fafc',
  plinthColor = '#334155',
  frameColor = '#f8fafc',
  roofColor = '#991b1b',
}: BlockAFacadeProps) {
  const isSouth = facing === 'south';
  const zOffset = isSouth ? buildingDepth / 2 + 0.05 : -buildingDepth / 2 - 0.05;
  const rotY = isSouth ? 0 : Math.PI;

  // 1:2:2:2:2:1 bay distribution over 10 unit steps
  const totalUnits = 10;
  const unitW = buildingWidth / totalUnits;
  const bay1W = unitW * 1.0;
  const windowBayW = unitW * 2.0;
  const bay6W = unitW * 1.0;

  const startX = -buildingWidth / 2;

  // X centers of each bay (from left to right)
  const bayCenters = useMemo(() => {
    return [
      startX + unitW * 0.5, // Bay 1 (0..1)
      startX + unitW * 2.0, // Bay 2 (1..3)
      startX + unitW * 4.0, // Bay 3 (3..5)
      startX + unitW * 6.0, // Bay 4 (5..7)
      startX + unitW * 8.0, // Bay 5 (7..9)
      startX + unitW * 9.5, // Bay 6 (9..10)
    ];
  }, [startX, unitW]);

  // Structural column axes (pilasters and drainpipes)
  const columnAxes = useMemo(() => {
    return [
      startX,              // Axis A (West corner)
      startX + unitW * 1,  // Axis Б
      startX + unitW * 3,  // Axis В
      startX + unitW * 5,  // Axis Г
      startX + unitW * 7,  // Axis Д
      startX + unitW * 9,  // Axis E
      startX + unitW * 10, // East corner (touches connector A => C)
    ];
  }, [startX, unitW]);

  // Textures and PBR Materials
  const wallTextures = useMemo(() => getArchitecturalWallTextures(8, 2), []);
  const glassTexture = useMemo(() => getWindowGlassTexture(), []);

  const materials = useMemo(() => {
    // Warm sand travertine panels with horizontal joints
    const wallMat = new THREE.MeshStandardMaterial({
      color: wallColor,
      map: wallTextures?.map ?? null,
      normalMap: wallTextures?.normalMap ?? null,
      normalScale: new THREE.Vector2(0.2, 0.2),
      roughnessMap: wallTextures?.roughnessMap ?? null,
      roughness: 0.78,
      metalness: 0.04,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // Dark granite / basalt foundation plinth
    const plinthMat = new THREE.MeshStandardMaterial({
      color: plinthColor,
      roughness: 0.86,
      metalness: 0.12,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // Clean white eaves cornice and window frames
    const trimMat = new THREE.MeshStandardMaterial({
      color: trimColor,
      roughness: 0.65,
      metalness: 0.08,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const frameMat = new THREE.MeshStandardMaterial({
      color: frameColor,
      roughness: 0.45,
      metalness: 0.25,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // Architectural deep blue reflective window glass
    const glassMat = new THREE.MeshStandardMaterial({
      color: '#1e3a5f',
      roughness: 0.1,
      metalness: 0.85,
      transparent: true,
      opacity: transparent ? opacity * 0.45 : 0.92,
      depthWrite: !transparent,
    });

    // Dark graphite aluminum for entrance doors and canopy casing
    const darkFrameMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.45,
      metalness: 0.65,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // Stainless steel handrails and door pull handles
    const steelMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      roughness: 0.22,
      metalness: 0.92,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // Terracotta red / copper-brown downspout drainpipes
    const downpipeMat = new THREE.MeshStandardMaterial({
      color: '#7c2d12',
      roughness: 0.52,
      metalness: 0.35,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // Shadow reveal groove
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

  const plinthH = 0.8;
  const corniceH = 0.4;
  const mainWallH = wallHeight - plinthH - corniceH; // 7.0m

  return (
    <group position={[0, 0, zOffset]} rotation={[0, rotY, 0]}>
      {/* ========================================================
          1. BASE FOUNDATION PLINTH (±0.000 to +0.800m)
         ======================================================== */}
      <mesh position={[0, plinthH / 2, 0.08]} material={materials.plinthMat} receiveShadow>
        <boxGeometry args={[buildingWidth + 0.1, plinthH, 0.22]} />
      </mesh>

      {/* ========================================================
          2. TOP CORNICE & FRIEZE (+7.800m to +8.200m)
         ======================================================== */}
      {/* White composite frieze board */}
      <mesh position={[0, wallHeight - corniceH / 2, 0.1]} material={materials.trimMat} castShadow receiveShadow>
        <boxGeometry args={[buildingWidth + 0.2, corniceH, 0.24]} />
      </mesh>
      {/* Projecting roof gutter moulding under eaves */}
      <mesh position={[0, wallHeight + 0.04, 0.16]} material={materials.trimMat} castShadow>
        <boxGeometry args={[buildingWidth + 0.3, 0.08, 0.34]} />
      </mesh>

      {/* ========================================================
          3. HORIZONTAL SPANDREL SHADOW REVEAL GROOVES
         ======================================================== */}
      {/* Recess groove above 1F windows (Y = 3.65m) */}
      <mesh position={[0, 3.65, 0.03]} material={materials.grooveMat}>
        <boxGeometry args={[buildingWidth, 0.06, 0.04]} />
      </mesh>
      {/* Recess groove below 2F windows (Y = 5.35m) */}
      <mesh position={[0, 5.35, 0.03]} material={materials.grooveMat}>
        <boxGeometry args={[buildingWidth, 0.06, 0.04]} />
      </mesh>

      {/* ========================================================
          4. VERTICAL STRUCTURAL PILASTERS & DOWNSPOUT DRAINPIPES
         ======================================================== */}
      {columnAxes.map((ax, idx) => {
        const isCorner = idx === 0 || idx === columnAxes.length - 1;
        const pilasterW = isCorner ? 0.6 : 0.52;
        return (
          <group key={`col-axis-${idx}`} position={[ax, 0, 0]}>
            {/* Structural pilaster projection */}
            <mesh
              position={[0, plinthH + mainWallH / 2, 0.06]}
              material={materials.wallMat}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[pilasterW, mainWallH, 0.14]} />
            </mesh>

            {/* Vertical Downspout Drainpipe (Terracotta red per blueprint) */}
            {idx > 0 && (
              <group position={[idx === columnAxes.length - 1 ? -0.15 : 0.12, 0, 0.15]}>
                {/* Funnel Hopper under roof gutter */}
                <mesh position={[0, wallHeight - 0.12, 0]} material={materials.downpipeMat} castShadow>
                  <cylinderGeometry args={[0.075, 0.04, 0.22, 12]} />
                </mesh>
                {/* Vertical Downpipe */}
                <mesh position={[0, (wallHeight - 0.22 + 0.3) / 2, 0]} material={materials.downpipeMat} castShadow>
                  <cylinderGeometry args={[0.038, 0.038, wallHeight - 0.52, 12]} />
                </mesh>
                {/* Wall fixing brackets */}
                {[2.2, 4.4, 6.6].map((by) => (
                  <mesh key={`bracket-${by}`} position={[0, by, -0.04]} material={materials.downpipeMat}>
                    <boxGeometry args={[0.1, 0.03, 0.08]} />
                  </mesh>
                ))}
                {/* Curved discharge shoe elbow over plinth */}
                <mesh position={[0, 0.22, 0.04]} rotation={[0.4, 0, 0]} material={materials.downpipeMat}>
                  <cylinderGeometry args={[0.038, 0.038, 0.22, 12]} />
                </mesh>
              </group>
            )}
          </group>
        );
      })}

      {/* ========================================================
          5. BAY 1 (West / Left, Axis А-Б, 6 000 mm)
             - 1F: Solid travertine wall panel
             - 2F: 3-pane horizontal transom window
         ======================================================== */}
      {(() => {
        const cx = bayCenters[0];
        const winW = bay1W * 0.7;
        const winH = 1.35;
        const winY = 6.65;
        const paneW = (winW - 0.08) / 3;

        return (
          <group key="bay-1" position={[cx, 0, 0]}>
            {/* 1F Solid Travertine Wall Panel */}
            <mesh position={[0, plinthH + 1.4, 0.02]} material={materials.wallMat} receiveShadow>
              <boxGeometry args={[bay1W - 0.5, 2.8, 0.08]} />
            </mesh>

            {/* 2F High Transom Window Assembly */}
            {/* White window sill */}
            <mesh position={[0, winY - winH / 2 - 0.04, 0.06]} material={materials.trimMat} castShadow>
              <boxGeometry args={[winW + 0.14, 0.07, 0.16]} />
            </mesh>
            {/* Outer window frame border */}
            <mesh position={[0, winY, 0.04]} material={materials.frameMat} castShadow>
              <boxGeometry args={[winW, winH, 0.08]} />
            </mesh>
            {/* 3 Glass Panes with 2 white vertical mullions */}
            {[-paneW, 0, paneW].map((px, pIdx) => (
              <mesh key={`b1-glass-${pIdx}`} position={[px, winY, 0.05]} material={materials.glassMat}>
                <boxGeometry args={[paneW - 0.05, winH - 0.1, 0.02]} />
              </mesh>
            ))}
            {/* 2 Vertical mullion bars */}
            {[-paneW / 2, paneW / 2].map((mx, mIdx) => (
              <mesh key={`b1-mull-${mIdx}`} position={[mx, winY, 0.06]} material={materials.frameMat}>
                <boxGeometry args={[0.04, winH - 0.08, 0.04]} />
              </mesh>
            ))}
          </group>
        );
      })()}

      {/* ========================================================
          6. BAYS 2, 3, 4, 5 (Four Large Ribbon Window Bays, 12 000 mm each)
             - Double ribbon windows on 1F and 2F
             - Continuous top horizontal transom strip
             - 4 bottom sections: operable sash on flanks, fixed panoramic in center
         ======================================================== */}
      {[1, 2, 3, 4].map((bayIndex) => {
        const cx = bayCenters[bayIndex];
        const winW = windowBayW - 0.65;
        const winH = 2.4;
        const transomH = 0.6;
        const bottomH = winH - transomH; // 1.8m

        // 4 section widths: 20%, 30%, 30%, 20%
        const secWidths = [winW * 0.2, winW * 0.3, winW * 0.3, winW * 0.2];
        const secCenters = [
          -winW / 2 + secWidths[0] / 2,
          -winW / 2 + secWidths[0] + secWidths[1] / 2,
          winW / 2 - secWidths[3] - secWidths[2] / 2,
          winW / 2 - secWidths[3] / 2,
        ];
        const mullionXs = [
          -winW / 2 + secWidths[0],
          0,
          winW / 2 - secWidths[3],
        ];

        return (
          <group key={`window-bay-${bayIndex}`} position={[cx, 0, 0]}>
            {/* --- Floor 1 & Floor 2 Window Ribbon Assemblies --- */}
            {[
              { floor: 1, baseSillY: 1.25, winCenterY: 1.25 + winH / 2 },
              { floor: 2, baseSillY: 5.45, winCenterY: 5.45 + winH / 2 },
            ].map(({ floor, baseSillY, winCenterY }) => {
              const bottomCenterY = baseSillY + bottomH / 2;
              const transomCenterY = baseSillY + bottomH + transomH / 2;

              return (
                <group key={`f${floor}-win`}>
                  {/* Projecting White Window Sill */}
                  <mesh position={[0, baseSillY - 0.04, 0.06]} material={materials.trimMat} castShadow>
                    <boxGeometry args={[winW + 0.16, 0.08, 0.16]} />
                  </mesh>

                  {/* Outer Frame Perimeter */}
                  <mesh position={[0, winCenterY, 0.03]} material={materials.frameMat} castShadow>
                    <boxGeometry args={[winW, winH, 0.06]} />
                  </mesh>

                  {/* Horizontal Transom Dividing Bar */}
                  <mesh position={[0, baseSillY + bottomH, 0.05]} material={materials.frameMat} castShadow>
                    <boxGeometry args={[winW - 0.04, 0.06, 0.08]} />
                  </mesh>

                  {/* 3 Vertical Mullions running through bottom section */}
                  {mullionXs.map((mx, mIdx) => (
                    <mesh key={`mull-${mIdx}`} position={[mx, bottomCenterY, 0.05]} material={materials.frameMat} castShadow>
                      <boxGeometry args={[0.06, bottomH - 0.04, 0.08]} />
                    </mesh>
                  ))}

                  {/* 3 Vertical Mullions in top transom section */}
                  {mullionXs.map((mx, mIdx) => (
                    <mesh key={`tr-mull-${mIdx}`} position={[mx, transomCenterY, 0.05]} material={materials.frameMat}>
                      <boxGeometry args={[0.05, transomH - 0.04, 0.06]} />
                    </mesh>
                  ))}

                  {/* Top Transom Glass Panes (4 panes matching vertical rhythm) */}
                  {secCenters.map((scx, sIdx) => (
                    <mesh key={`tr-glass-${sIdx}`} position={[scx, transomCenterY, 0.04]} material={materials.glassMat}>
                      <boxGeometry args={[secWidths[sIdx] - 0.06, transomH - 0.08, 0.02]} />
                    </mesh>
                  ))}

                  {/* Bottom Glass Panes: 4 Sections */}
                  {secCenters.map((scx, sIdx) => {
                    const isSash = sIdx === 0 || sIdx === 3;
                    const sw = secWidths[sIdx] - 0.08;

                    return (
                      <group key={`bot-pane-${sIdx}`} position={[scx, bottomCenterY, 0.04]}>
                        {/* Architectural Glass Pane */}
                        <mesh material={materials.glassMat}>
                          <boxGeometry args={[sw, bottomH - 0.08, 0.02]} />
                        </mesh>

                        {/* Operable Sash sub-frame on flanks (left & right) */}
                        {isSash && (
                          <group position={[0, -0.25, 0.015]}>
                            {/* Inner sash border */}
                            <mesh material={materials.frameMat}>
                              <boxGeometry args={[sw - 0.04, bottomH * 0.65, 0.03]} />
                            </mesh>
                            <mesh material={materials.glassMat} position={[0, 0, 0.005]}>
                              <boxGeometry args={[sw - 0.12, bottomH * 0.65 - 0.08, 0.02]} />
                            </mesh>
                            {/* Small metallic latch handle */}
                            <mesh position={[sIdx === 0 ? sw * 0.35 : -sw * 0.35, 0, 0.03]} material={materials.steelMat}>
                              <boxGeometry args={[0.02, 0.08, 0.03]} />
                            </mesh>
                          </group>
                        )}
                      </group>
                    );
                  })}
                </group>
              );
            })}

            {/* Travertine Spandrel Wall Panel between 1F and 2F */}
            <mesh position={[0, 4.5, 0.02]} material={materials.wallMat} receiveShadow>
              <boxGeometry args={[winW + 0.1, 1.8, 0.06]} />
            </mesh>
          </group>
        );
      })}

      {/* ========================================================
          7. BAY 6 (East / Right, Axis Д-Е / E, 6 000 mm)
             - 1F: ENTRANCE GROUP WITH CANOPY («Входная группа с козырьком»)
             - 2F: Window with transom
         ======================================================== */}
      {(() => {
        const cx = bayCenters[5];
        const porchW = 3.0;
        const porchDepth = 1.6;
        const doorW = 1.8;
        const doorH = 2.35;
        const doorBaseY = 0.64;

        const f2WinW = 2.4;
        const f2WinH = 2.4;
        const f2WinY = 6.65;

        return (
          <group key="bay-6" position={[cx, 0, 0]}>
            {/* --- 1F ENTRANCE GROUP («Входная группа с козырьком») --- */}
            {/* 4 Wide Granite Steps rising to entrance doors */}
            {[
              { stepIdx: 0, y: 0.08, d: 1.6, w: porchW + 0.3 },
              { stepIdx: 1, y: 0.24, d: 1.25, w: porchW + 0.2 },
              { stepIdx: 2, y: 0.40, d: 0.9, w: porchW + 0.1 },
              { stepIdx: 3, y: 0.56, d: 0.55, w: porchW },
            ].map(({ stepIdx, y, d, w }) => (
              <mesh key={`step-${stepIdx}`} position={[-0.2, y, d / 2 + 0.05]} material={materials.plinthMat} receiveShadow>
                <boxGeometry args={[w, 0.16, d]} />
              </mesh>
            ))}

            {/* Stainless Steel Handrails on Left & Right of Entrance Steps */}
            {[-porchW / 2 - 0.05, porchW / 2 - 0.35].map((hx, hIdx) => (
              <group key={`handrail-${hIdx}`} position={[hx, 0.32, 0.9]}>
                {/* Handrail Posts */}
                {[-0.5, 0, 0.5].map((pz, pIdx) => (
                  <mesh key={`post-${pIdx}`} position={[0, 0.45, pz]} material={materials.steelMat}>
                    <cylinderGeometry args={[0.02, 0.02, 0.9, 8]} />
                  </mesh>
                ))}
                {/* Sloped Top Rail */}
                <mesh position={[0, 0.9, 0]} rotation={[-0.22, 0, 0]} material={materials.steelMat}>
                  <boxGeometry args={[0.04, 0.04, 1.3]} />
                </mesh>
                {/* Mid Safety Rail */}
                <mesh position={[0, 0.48, 0]} rotation={[-0.22, 0, 0]} material={materials.steelMat}>
                  <boxGeometry args={[0.03, 0.02, 1.3]} />
                </mesh>
              </group>
            ))}

            {/* Double Glazed Entrance Doors */}
            <group position={[-0.2, doorBaseY, 0.04]}>
              {/* Outer Door Frame */}
              <mesh position={[0, doorH / 2, 0]} material={materials.darkFrameMat} castShadow>
                <boxGeometry args={[doorW, doorH, 0.08]} />
              </mesh>
              {/* Left Door Leaf */}
              <mesh position={[-doorW * 0.24, doorH * 0.45, 0.02]} material={materials.glassMat}>
                <boxGeometry args={[doorW * 0.44, doorH * 0.82, 0.02]} />
              </mesh>
              {/* Right Door Leaf */}
              <mesh position={[doorW * 0.24, doorH * 0.45, 0.02]} material={materials.glassMat}>
                <boxGeometry args={[doorW * 0.44, doorH * 0.82, 0.02]} />
              </mesh>
              {/* Left Door Vertical Steel Pull Handle */}
              <mesh position={[-0.06, doorH * 0.45, 0.06]} material={materials.steelMat}>
                <cylinderGeometry args={[0.015, 0.015, 0.85, 8]} />
              </mesh>
              {/* Right Door Vertical Steel Pull Handle */}
              <mesh position={[0.06, doorH * 0.45, 0.06]} material={materials.steelMat}>
                <cylinderGeometry args={[0.015, 0.015, 0.85, 8]} />
              </mesh>
              {/* Glass Transom above doors */}
              <mesh position={[0, doorH - 0.2, 0.02]} material={materials.glassMat}>
                <boxGeometry args={[doorW - 0.1, 0.32, 0.02]} />
              </mesh>
            </group>

            {/* Cantilevered Modern Entrance Canopy («Входная группа с козырьком») */}
            <group position={[-0.2, 3.25, 0.7]}>
              {/* Canopy main slab */}
              <mesh material={materials.darkFrameMat} castShadow>
                <boxGeometry args={[2.5, 0.22, 1.35]} />
              </mesh>
              {/* Beveled forward edge / fascia lip */}
              <mesh position={[0, -0.04, 0.68]} material={materials.steelMat}>
                <boxGeometry args={[2.52, 0.14, 0.04]} />
              </mesh>
              {/* Underside downlight fixtures */}
              {[-0.6, 0, 0.6].map((lx, lIdx) => (
                <mesh key={`light-${lIdx}`} position={[lx, -0.11, 0]} material={materials.trimMat}>
                  <cylinderGeometry args={[0.06, 0.06, 0.02, 12]} />
                </mesh>
              ))}
            </group>

            {/* Solid travertine wall on the right side of the door */}
            <mesh position={[porchW * 0.38, plinthH + 1.4, 0.02]} material={materials.wallMat} receiveShadow>
              <boxGeometry args={[bay6W * 0.38, 2.8, 0.08]} />
            </mesh>

            {/* --- 2F WINDOW WITH TRANSOM --- */}
            <group position={[-0.2, f2WinY, 0.04]}>
              {/* White window sill */}
              <mesh position={[0, -f2WinH / 2 - 0.04, 0.04]} material={materials.trimMat} castShadow>
                <boxGeometry args={[f2WinW + 0.14, 0.08, 0.14]} />
              </mesh>
              {/* Outer frame */}
              <mesh material={materials.frameMat} castShadow>
                <boxGeometry args={[f2WinW, f2WinH, 0.06]} />
              </mesh>
              {/* Top horizontal transom bar */}
              <mesh position={[0, f2WinH * 0.25, 0.02]} material={materials.frameMat}>
                <boxGeometry args={[f2WinW - 0.06, 0.05, 0.06]} />
              </mesh>
              {/* Top transom glass */}
              <mesh position={[0, f2WinH * 0.36, 0.01]} material={materials.glassMat}>
                <boxGeometry args={[f2WinW - 0.1, f2WinH * 0.24, 0.02]} />
              </mesh>
              {/* Bottom vertical divider: main pane 65%, side sash 35% */}
              <mesh position={[-f2WinW * 0.1, -f2WinH * 0.18, 0.02]} material={materials.frameMat}>
                <boxGeometry args={[0.05, f2WinH * 0.58, 0.06]} />
              </mesh>
              <mesh position={[-f2WinW * 0.26, -f2WinH * 0.18, 0.01]} material={materials.glassMat}>
                <boxGeometry args={[f2WinW * 0.35, f2WinH * 0.56, 0.02]} />
              </mesh>
              <mesh position={[f2WinW * 0.2, -f2WinH * 0.18, 0.01]} material={materials.glassMat}>
                <boxGeometry args={[f2WinW * 0.52, f2WinH * 0.56, 0.02]} />
              </mesh>
            </group>
          </group>
        );
      })()}
    </group>
  );
}
