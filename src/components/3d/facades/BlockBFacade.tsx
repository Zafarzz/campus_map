import { useMemo } from 'react';
import * as THREE from 'three';
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
 * Reconstructed directly from CAD blueprints:
 * 1. "ФАСАД В ОСЯХ 1-24" (М 1:100) — Section 1-1, full 4-storey volume.
 * 2. "Фасад в осях 1-20 / Благоустройство территории" — Perspective & landscaping.
 *
 * Composition (Axes 1–24):
 * - Total length: 55.0m, 4 storeys (13.2m to cornice, 15.2m to ridge).
 * - Section 1 (axes 1–5): 4 standard 3-pane window bays with top transoms.
 * - Section 2 (axes 5–14):
 *     - Staircase core: horizontal ribbon windows (floors 2–4) & entrance door (floor 1).
 *     - 4 standard 3-pane window bays with top transoms.
 * - Section 3 (axes 15–24):
 *     - Staircase core: horizontal ribbon windows (floors 2–4) & entrance door (floor 1).
 *     - 3 standard 3-pane window bays with top transoms.
 * - Roof: 2 triangular dormers (слуховые окна) on the hip roof slope over the staircase bays.
 * - Downpipes: 4 full-height vertical downpipes with hoppers and shoes.
 * - Landscaping: Architectural gazebo (Беседка) and elevated heating pipeline with П-образный компенсатор.
 */
export function BlockBFacade({
  buildingWidth,
  buildingDepth,
  facing = 'north',
  wallHeight = 14.4,
  roofHeight = 3.6,
  opacity = 1,
  transparent = false,
  wallColor = '#ebdcc5',
  trimColor = '#f1e6cf',
  plinthColor = '#5c2d22',
  frameColor = '#4a5561',
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

  const plinthHeight = 1.0; // Plinth up to +1.000m
  const glassColor = '#7fa6c2'; // Blue-grey architectural glazing
  const pipeColor = '#853629'; // Terracotta downpipes

  // Materials
  const wallMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: wallColor,
        roughness: 0.8,
        metalness: 0.04,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [wallColor, transparent, opacity]
  );

  const plinthMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: plinthColor,
        roughness: 0.88,
        metalness: 0.08,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [plinthColor, transparent, opacity]
  );

  const trimMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: trimColor,
        roughness: 0.75,
        metalness: 0.05,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [trimColor, transparent, opacity]
  );

  const frameMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: frameColor,
        roughness: 0.45,
        metalness: 0.6,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [frameColor, transparent, opacity]
  );

  const glassMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: glassColor,
        roughness: 0.08,
        metalness: 0.35,
        transparent: true,
        opacity: transparent ? opacity * 0.75 : 0.88,
        depthWrite: !transparent,
      }),
    [glassColor, transparent, opacity]
  );

  const jointMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(wallColor).multiplyScalar(0.85),
        roughness: 0.9,
        metalness: 0,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [wallColor, transparent, opacity]
  );

  const roofMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: roofColor,
        roughness: 0.7,
        metalness: 0.1,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [roofColor, transparent, opacity]
  );

  const pipeMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: pipeColor,
        roughness: 0.5,
        metalness: 0.5,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [pipeColor, transparent, opacity]
  );

  // 13 Window Bays across axes 1 to 24:
  // Section 1: 4 standard bays
  const leftBayOffsets = [-24.0, -20.2, -16.4, -12.6];
  // Left Staircase Core: 1 bay
  const leftStairOffset = -9.2;
  // Section 2: 4 standard bays
  const midBayOffsets = [-5.8, -2.0, 1.8, 5.6];
  // Right Staircase Core: 1 bay
  const rightStairOffset = 9.2;
  // Section 3: 3 standard bays
  const rightBayOffsets = [13.5, 18.0, 22.5];

  // Combined standard classroom window bays (11 bays)
  const standardBayOffsets = [...leftBayOffsets, ...midBayOffsets, ...rightBayOffsets];

  // 2 Staircase bays
  const stairBayOffsets = [leftStairOffset, rightStairOffset];

  // Downpipes at 4 structural boundaries
  const downpipeOffsets = [-26.8, -10.8, 7.5, 26.8];

  // Floor heights calculation
  const floorHeight = (wallHeight - plinthHeight) / 4;
  const floorCenterYs = [
    plinthHeight + floorHeight * 0.45, // Floor 1
    plinthHeight + floorHeight * 1.42, // Floor 2
    plinthHeight + floorHeight * 2.42, // Floor 3
    plinthHeight + floorHeight * 3.42, // Floor 4
  ];

  // Horizontal rustication seams (panel joints across all 4 floors)
  const rusticationLines = useMemo(() => {
    const lines: number[] = [plinthHeight];
    for (let f = 0; f < 4; f++) {
      const base = plinthHeight + f * floorHeight;
      lines.push(base + floorHeight * 0.15); // Sill level
      lines.push(base + floorHeight * 0.72); // Lintel level
      lines.push(base + floorHeight);        // Floor division
    }
    return lines;
  }, [plinthHeight, floorHeight]);

  // Dormer Geometries for the 2 triangular dormers on the roof
  const dormerWallGeo = useMemo(() => createTriangularDormerGeometry(2.4 * scaleX, 1.7, 1.4), [scaleX]);
  const dormerFrameGeo = useMemo(() => createTriangularDormerGeometry(1.6 * scaleX, 1.15, 0.08), [scaleX]);
  const dormerGlassGeo = useMemo(() => createTriangularDormerGeometry(1.48 * scaleX, 1.05, 0.04), [scaleX]);

  return (
    <group position={[0, 0, wallZ]}>
      {/* ============================================================== */}
      {/* 1. DARK GRANITE PLINTH (-1.000 to 0.000 / 0 to +1.000 in CAD)   */}
      {/* ============================================================== */}
      <mesh position={[0, plinthHeight / 2, sign * 0.08]} material={plinthMat} castShadow receiveShadow>
        <boxGeometry args={[facadeWidth + 0.1, plinthHeight, 0.22]} />
      </mesh>
      {/* Plinth top drip edge molding at y = 1.000 */}
      <mesh position={[0, plinthHeight + 0.03, sign * 0.12]} material={trimMat} castShadow>
        <boxGeometry args={[facadeWidth + 0.15, 0.06, 0.16]} />
      </mesh>

      {/* ============================================================== */}
      {/* 2. MAIN MODULAR MASONRY FACADE WALL                            */}
      {/* ============================================================== */}
      <mesh position={[0, wallHeight / 2, 0]} material={wallMat} castShadow receiveShadow>
        <boxGeometry args={[facadeWidth, wallHeight, 0.15]} />
      </mesh>

      {/* Horizontal rustication panel seams */}
      {rusticationLines.map((yVal, idx) => (
        <mesh key={`rust-${idx}`} position={[0, yVal, sign * 0.078]} material={jointMat}>
          <boxGeometry args={[facadeWidth, 0.025, 0.01]} />
        </mesh>
      ))}

      {/* Vertical expansion joints between the 3 sections */}
      {[-10.8, 7.5].map((jx, idx) => (
        <mesh key={`v-joint-${idx}`} position={[jx * scaleX * signX, wallHeight / 2, sign * 0.078]} material={jointMat}>
          <boxGeometry args={[0.04, wallHeight, 0.015]} />
        </mesh>
      ))}

      {/* ============================================================== */}
      {/* 3. STANDARD CLASSROOM WINDOWS (11 BAYS × 4 FLOORS = 44 WINDOWS) */}
      {/* 3-leaf casement windows with upper transom bar (ОК-1 / ОК-2)   */}
      {/* ============================================================== */}
      {standardBayOffsets.map((bayX, bIdx) => {
        const wx = bayX * scaleX * signX;
        const ww = 2.4 * scaleX;
        const wh = 1.8;

        return (
          <group key={`std-bay-${bIdx}`}>
            {floorCenterYs.map((wy, fIdx) => (
              <group key={`win-f${fIdx}-${bIdx}`} position={[wx, wy, sign * 0.08]}>
                {/* Window Outer Frame */}
                <mesh material={frameMat}>
                  <boxGeometry args={[ww, wh, 0.1]} />
                </mesh>
                {/* Window Glass Pane */}
                <mesh position={[0, 0, sign * 0.02]} material={glassMat}>
                  <boxGeometry args={[ww - 0.12 * scaleX, wh - 0.14, 0.04]} />
                </mesh>
                {/* 2 Vertical Mullions (3-pane casement) */}
                {[-ww / 3, ww / 3].map((mx, mIdx) => (
                  <mesh key={`m-${mIdx}`} position={[mx, 0, sign * 0.03]} material={frameMat}>
                    <boxGeometry args={[0.06 * scaleX, wh - 0.14, 0.06]} />
                  </mesh>
                ))}
                {/* Upper Horizontal Transom Beam (Фрамуга) */}
                <mesh position={[0, wh / 2 - 0.45, sign * 0.03]} material={frameMat}>
                  <boxGeometry args={[ww - 0.12 * scaleX, 0.05, 0.05]} />
                </mesh>
                {/* Stone Sill Molding */}
                <mesh position={[0, -wh / 2 - 0.05, sign * 0.06]} material={trimMat}>
                  <boxGeometry args={[ww + 0.3 * scaleX, 0.1, 0.18]} />
                </mesh>
                {/* Stone Lintel Molding */}
                <mesh position={[0, wh / 2 + 0.05, sign * 0.04]} material={trimMat}>
                  <boxGeometry args={[ww + 0.2 * scaleX, 0.08, 0.14]} />
                </mesh>
              </group>
            ))}
          </group>
        );
      })}

      {/* ============================================================== */}
      {/* 4. STAIRCASE / CIRCULATION BAYS (2 BAYS)                       */}
      {/* Floor 1: Entrance Doors. Floors 2–4: Horizontal Ribbon Windows */}
      {/* ============================================================== */}
      {stairBayOffsets.map((stairX, sIdx) => {
        const sx = stairX * scaleX * signX;
        const ribbonW = 2.8 * scaleX;
        const ribbonH = 0.75; // Narrow horizontal strip window

        return (
          <group key={`stair-core-${sIdx}`}>
            {/* Ground Floor Entrance Door */}
            <group position={[sx, floorCenterYs[0] - 0.1, sign * 0.08]}>
              {/* Outer Door Frame */}
              <mesh material={frameMat}>
                <boxGeometry args={[2.4 * scaleX, 2.3, 0.12]} />
              </mesh>
              {/* Glazed Twin Doors */}
              <mesh position={[0, 0, sign * 0.02]} material={glassMat}>
                <boxGeometry args={[2.24 * scaleX, 2.14, 0.04]} />
              </mesh>
              {/* Central Stile Divider */}
              <mesh position={[0, 0, sign * 0.04]} material={frameMat}>
                <boxGeometry args={[0.06 * scaleX, 2.14, 0.08]} />
              </mesh>
              {/* Entrance Overhead Canopy */}
              <mesh position={[0, 1.25, sign * 0.4]} material={trimMat} castShadow>
                <boxGeometry args={[2.8 * scaleX, 0.12, 0.8]} />
              </mesh>
              {/* Door Handles */}
              {[-0.15 * scaleX, 0.15 * scaleX].map((hx, hIdx) => (
                <mesh key={`dh-${hIdx}`} position={[hx, 0, sign * 0.07]} material={trimMat}>
                  <boxGeometry args={[0.04, 0.7, 0.03]} />
                </mesh>
              ))}
            </group>

            {/* Floors 2, 3, 4: Horizontal Ribbon Transom Windows */}
            {[1, 2, 3].map((fIdx) => {
              const ry = floorCenterYs[fIdx] + 0.35; // Positioned high in the floor wall
              return (
                <group key={`ribbon-f${fIdx}-${sIdx}`} position={[sx, ry, sign * 0.08]}>
                  {/* Ribbon Outer Frame */}
                  <mesh material={frameMat}>
                    <boxGeometry args={[ribbonW, ribbonH, 0.1]} />
                  </mesh>
                  {/* Ribbon Glass Pane */}
                  <mesh position={[0, 0, sign * 0.02]} material={glassMat}>
                    <boxGeometry args={[ribbonW - 0.12 * scaleX, ribbonH - 0.12, 0.04]} />
                  </mesh>
                  {/* 3 Vertical Mullions dividing ribbon into 4 panes */}
                  {[-ribbonW * 0.25, 0, ribbonW * 0.25].map((mx, mIdx) => (
                    <mesh key={`rm-${mIdx}`} position={[mx, 0, sign * 0.03]} material={frameMat}>
                      <boxGeometry args={[0.05 * scaleX, ribbonH - 0.12, 0.06]} />
                    </mesh>
                  ))}
                  {/* Lintel and Sill Trim */}
                  <mesh position={[0, -ribbonH / 2 - 0.04, sign * 0.05]} material={trimMat}>
                    <boxGeometry args={[ribbonW + 0.2 * scaleX, 0.08, 0.14]} />
                  </mesh>
                  <mesh position={[0, ribbonH / 2 + 0.04, sign * 0.04]} material={trimMat}>
                    <boxGeometry args={[ribbonW + 0.2 * scaleX, 0.06, 0.12]} />
                  </mesh>
                </group>
              );
            })}
          </group>
        );
      })}

      {/* ============================================================== */}
      {/* 5. ROOF CORNICE / EAVES BEAM (+13.200 / +14.400)               */}
      {/* ============================================================== */}
      <mesh position={[0, wallHeight + 0.12, sign * 0.16]} material={trimMat} castShadow>
        <boxGeometry args={[facadeWidth + 0.4, 0.24, 0.36]} />
      </mesh>
      <mesh position={[0, wallHeight + 0.26, sign * 0.2]} material={trimMat} castShadow>
        <boxGeometry args={[facadeWidth + 0.6, 0.08, 0.44]} />
      </mesh>

      {/* ============================================================== */}
      {/* 6. TWIN TRIANGULAR ROOF DORMERS (СЛУХОВЫЕ ОКНА)                */}
      {/* Positioned directly over the two staircase bays                */}
      {/* ============================================================== */}
      {stairBayOffsets.map((dormerX, dIdx) => {
        const dx = dormerX * scaleX * signX;
        const dormerBaseY = wallHeight + 0.05;

        return (
          <group key={`dormer-${dIdx}`} position={[dx, dormerBaseY, sign * 0.2]}>
            {/* Triangular Dormer Wall Body */}
            <mesh geometry={dormerWallGeo} material={wallMat} castShadow receiveShadow />

            {/* Triangular Louver / Glass Window */}
            <mesh position={[0, 0.22, sign * 0.06]} geometry={dormerFrameGeo} material={frameMat} />
            <mesh position={[0, 0.22, sign * 0.08]} geometry={dormerGlassGeo} material={glassMat} />

            {/* Sloped Rake Cornice Beams */}
            {(() => {
              const rakeBase = 1.2 * scaleX;
              const rakeH = 1.7;
              const rakeLen = Math.hypot(rakeBase, rakeH);
              const angle = Math.atan2(rakeH, rakeBase);

              return (
                <>
                  <mesh
                    position={[-rakeBase / 2, rakeH / 2, sign * 0.05]}
                    rotation={[0, 0, angle]}
                    material={trimMat}
                    castShadow
                  >
                    <boxGeometry args={[rakeLen + 0.15, 0.14, 0.2]} />
                  </mesh>
                  <mesh
                    position={[rakeBase / 2, rakeH / 2, sign * 0.05]}
                    rotation={[0, 0, -angle]}
                    material={trimMat}
                    castShadow
                  >
                    <boxGeometry args={[rakeLen + 0.15, 0.14, 0.2]} />
                  </mesh>
                </>
              );
            })()}

            {/* Roof Top Ridge Shingles behind dormer gable */}
            <mesh position={[0, 0.85, -sign * 0.4]} material={roofMat}>
              <boxGeometry args={[2.2 * scaleX, 1.6, 1.0]} />
            </mesh>
          </group>
        );
      })}

      {/* ============================================================== */}
      {/* 7. 4 VERTICAL DRAINPIPES (ВОДОСТОЧНЫЕ ТРУБЫ)                   */}
      {/* ============================================================== */}
      {downpipeOffsets.map((px, idx) => {
        const pipeX = px * scaleX * signX;
        const pipeH = wallHeight - 0.4;

        return (
          <group key={`pipe-${idx}`} position={[pipeX, pipeH / 2 + 0.4, sign * 0.18]}>
            {/* Vertical pipe */}
            <mesh material={pipeMat} castShadow>
              <cylinderGeometry args={[0.06, 0.06, pipeH, 12]} />
            </mesh>
            {/* Top hopper funnel */}
            <mesh position={[0, pipeH / 2 + 0.05, 0]} material={pipeMat}>
              <cylinderGeometry args={[0.12, 0.06, 0.2, 12]} />
            </mesh>
            {/* Bottom shoe / discharge spout */}
            <mesh position={[0, -pipeH / 2 + 0.1, sign * 0.08]} rotation={[sign * 0.5, 0, 0]} material={pipeMat}>
              <cylinderGeometry args={[0.06, 0.06, 0.25, 12]} />
            </mesh>
            {/* Wall fastening brackets */}
            {[-pipeH / 2 + 1.8, -pipeH / 2 + 5.4, -pipeH / 2 + 9.0, -pipeH / 2 + 12.6].map((by, bIdx) => (
              <mesh key={`bracket-${bIdx}`} position={[0, by, -sign * 0.06]} material={frameMat}>
                <boxGeometry args={[0.18, 0.04, 0.12]} />
              </mesh>
            ))}
          </group>
        );
      })}

      {/* ============================================================== */}
      {/* 8. ARCHITECTURAL LANDSCAPING (БЕСЕДКА & ТЕПЛОТРАССА)           */}
      {/* Mounted directly in front of Block B facing the courtyard      */}
      {/* ============================================================== */}
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
