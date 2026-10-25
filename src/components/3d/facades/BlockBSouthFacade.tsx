import { useMemo } from 'react';
import * as THREE from 'three';
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
 * Reconstructed directly from CAD blueprint:
 * "ГЛАВНЫЙ ФАСАД В ОСЯХ 1-10 (ПОЛНЫЙ ОБЪЕМ УЧЕБНОГО КОРПУСА №2) — Лист 1 (1:100)".
 *
 * Symmetrical composition:
 * - Left wing (Axes 1–5): 24m (4 window bays of 6m)
 * - Central glazed curtain wall (Axes 5–6): 7m with stained glass & roof pediment
 * - Right wing (Axes 6–10): 24m (4 window bays of 6m)
 * Total length: 55.0m, 4 storeys (14.4m to cornice).
 */
export function BlockBSouthFacade({
  buildingWidth,
  buildingDepth,
  facing = 'south',
  wallHeight = 14.4,
  roofHeight = 3.6,
  opacity = 1,
  transparent = false,
  wallColor = '#ebdcc5',
  trimColor = '#f1e6cf',
  plinthColor = '#5c2d22',
  frameColor = '#4a5561',
  roofColor = '#991b1b',
}: BlockBSouthFacadeProps) {
  const BASE_CAD_WIDTH = 55.0;
  const facadeWidth = Math.max(BASE_CAD_WIDTH, buildingWidth);
  const scaleX = facadeWidth / BASE_CAD_WIDTH;

  const isSouth = facing === 'south';
  const sign = isSouth ? 1 : -1;
  const wallZ = sign * (buildingDepth / 2);

  const plinthHeight = 1.0; // -1.000 to 0.000 in drawing
  const glassColor = '#0f172a'; // Deep architectural tinted glass
  const pipeColor = '#853629'; // Terracotta downpipes

  const wallTextures = useMemo(() => getArchitecturalWallTextures(14, 4), []);
  const glassTexture = useMemo(() => getWindowGlassTexture(), []);

  // Materials
  const wallMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
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
      }),
    [wallColor, wallTextures, transparent, opacity]
  );

  const plinthMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: plinthColor,
        roughness: 0.85,
        metalness: 0.06,
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
        roughness: 0.7,
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
        color: '#27272a',
        roughness: 0.35,
        metalness: 0.65,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [transparent, opacity]
  );

  const glassMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: glassColor,
        map: glassTexture ?? null,
        roughness: 0.12,
        metalness: 0.78,
        envMapIntensity: 1.45,
        transparent: true,
        opacity: transparent ? opacity * 0.85 : 0.94,
        depthWrite: !transparent,
      }),
    [glassColor, glassTexture, transparent, opacity]
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

  // 8 Window Axes along X: 4 on the left wing, 4 on the right wing
  // Spacing: 6.0m per bay. Centers: 3m, 9m, 15m, 21m from outer edges.
  const windowBayOffsets = [-24.5, -18.5, -12.5, -6.5, 6.5, 12.5, 18.5, 24.5];

  // Horizontal rustication lines (panel joints between floors and window lintels/sills)
  const rusticationLines = [
    1.0, 2.8, 3.6, 4.6, 6.4, 7.2, 8.2, 10.0, 10.8, 11.8, 13.6, 14.4
  ];

  // Pediment Geometries
  const pedimentWallGeo = useMemo(() => {
    return createTriangularPedimentGeometry(7.0 * scaleX, 2.4, 0.25);
  }, [scaleX]);

  const pedimentGlassGeo = useMemo(() => {
    return createTriangularPedimentGeometry(4.4 * scaleX, 1.5, 0.06);
  }, [scaleX]);

  const pedimentFrameGeo = useMemo(() => {
    return createTriangularPedimentGeometry(4.6 * scaleX, 1.6, 0.08);
  }, [scaleX]);

  // Central curtain wall dimensions
  const curtainWidth = 7.0 * scaleX;
  const curtainHeight = 14.0; // from y=0.4 to y=14.4
  const curtainCenterY = 0.4 + curtainHeight / 2; // y=7.4

  return (
    <group position={[0, 0, wallZ]}>
      {/* ============================================================== */}
      {/* 1. DARK GRANITE PLINTH (-1.000 to 0.000 in drawing)            */}
      {/* ============================================================== */}
      <mesh position={[0, plinthHeight / 2, sign * 0.08]} material={plinthMat} castShadow receiveShadow>
        <boxGeometry args={[facadeWidth + 0.1, plinthHeight, 0.22]} />
      </mesh>
      {/* Plinth top drip edge molding at y = 1.000 */}
      <mesh position={[0, plinthHeight + 0.03, sign * 0.12]} material={trimMat} castShadow>
        <boxGeometry args={[facadeWidth + 0.15, 0.06, 0.16]} />
      </mesh>

      {/* ============================================================== */}
      {/* 2. MAIN TRAVERTINE FACADE WALL                                 */}
      {/* ============================================================== */}
      <mesh position={[0, wallHeight / 2, 0]} material={wallMat} castShadow receiveShadow>
        <boxGeometry args={[facadeWidth, wallHeight, 0.15]} />
      </mesh>

      {/* Horizontal rustication joints */}
      {rusticationLines.map((yVal, idx) => (
        <mesh key={`rust-${idx}`} position={[0, yVal, sign * 0.078]} material={jointMat}>
          <boxGeometry args={[facadeWidth, 0.025, 0.01]} />
        </mesh>
      ))}

      {/* ============================================================== */}
      {/* 3. 1ST FLOOR WINDOWS: ОК-2 (2000 x 1800 mm, 3-pane)            */}
      {/* ============================================================== */}
      {windowBayOffsets.map((bayX, idx) => {
        const wx = bayX * scaleX;
        const wy = 1.9; // center at Y=1.9m (from Y=1.0 to Y=2.8m)
        const ww = 2.0 * scaleX;
        const wh = 1.8;

        return (
          <group key={`ok2-${idx}`} position={[wx, wy, sign * 0.08]}>
            {/* Window Outer Frame */}
            <mesh material={frameMat}>
              <boxGeometry args={[ww, wh, 0.06]} />
            </mesh>
            {/* Window Glass Pane */}
            <mesh position={[0, 0, sign * 0.025]} material={glassMat}>
              <boxGeometry args={[ww - 0.12 * scaleX, wh - 0.14, 0.03]} />
            </mesh>
            {/* 2 Vertical Mullions (3-pane casement) */}
            {[-ww / 3, ww / 3].map((mx, mIdx) => (
              <mesh key={`m2-${mIdx}`} position={[mx, 0, sign * 0.045]} material={frameMat}>
                <boxGeometry args={[0.06 * scaleX, wh - 0.14, 0.04]} />
              </mesh>
            ))}
            {/* Horizontal Transom Beam (Upper fanlight) */}
            <mesh position={[0, wh / 2 - 0.45, sign * 0.045]} material={frameMat}>
              <boxGeometry args={[ww - 0.12 * scaleX, 0.05, 0.04]} />
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
        );
      })}

      {/* ============================================================== */}
      {/* 4. 2ND, 3RD, 4TH FLOOR WINDOWS: ОК-1 (2400 x 1800 mm, 3-pane)  */}
      {/* ============================================================== */}
      {[
        { floor: 2, centerY: 5.5 },
        { floor: 3, centerY: 9.1 },
        { floor: 4, centerY: 12.7 },
      ].map(({ floor, centerY }) => (
        <group key={`floor-${floor}`}>
          {windowBayOffsets.map((bayX, idx) => {
            const wx = bayX * scaleX;
            const ww = 2.4 * scaleX;
            const wh = 1.8;

            return (
              <group key={`ok1-f${floor}-${idx}`} position={[wx, centerY, sign * 0.08]}>
                {/* Window Outer Frame */}
                <mesh material={frameMat}>
                  <boxGeometry args={[ww, wh, 0.06]} />
                </mesh>
                {/* Window Glass Pane */}
                <mesh position={[0, 0, sign * 0.025]} material={glassMat}>
                  <boxGeometry args={[ww - 0.12 * scaleX, wh - 0.14, 0.03]} />
                </mesh>
                {/* 2 Vertical Mullions (3-pane casement) */}
                {[-ww / 3, ww / 3].map((mx, mIdx) => (
                  <mesh key={`m1-${mIdx}`} position={[mx, 0, sign * 0.045]} material={frameMat}>
                    <boxGeometry args={[0.06 * scaleX, wh - 0.14, 0.04]} />
                  </mesh>
                ))}
                {/* Horizontal Transom Beam (Upper fanlight) */}
                <mesh position={[0, wh / 2 - 0.45, sign * 0.045]} material={frameMat}>
                  <boxGeometry args={[ww - 0.12 * scaleX, 0.05, 0.04]} />
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
            );
          })}
        </group>
      ))}

      {/* ============================================================== */}
      {/* 5. CENTRAL GLAZED CURTAIN WALL (ВИТ-1: 7000 x 14000 mm)        */}
      {/* ============================================================== */}
      <group position={[0, curtainCenterY, sign * 0.09]}>
        {/* Outer Perimeter Frame */}
        <mesh material={frameMat} castShadow>
          <boxGeometry args={[curtainWidth, curtainHeight, 0.06]} />
        </mesh>
        {/* Continuous Glazed Curtain Box */}
        <mesh position={[0, 0, sign * 0.025]} material={glassMat}>
          <boxGeometry args={[curtainWidth - 0.16 * scaleX, curtainHeight - 0.16, 0.04]} />
        </mesh>

        {/* 5 Vertical Mullions dividing 7m into 6 bays (~1.16m each) */}
        {[-2.33, -1.17, 0, 1.17, 2.33].map((mx, idx) => (
          <mesh key={`curt-mull-${idx}`} position={[mx * scaleX, 0, sign * 0.05]} material={frameMat}>
            <boxGeometry args={[0.08 * scaleX, curtainHeight - 0.16, 0.06]} />
          </mesh>
        ))}

        {/* Horizontal Floor Transoms (every 3.6m relative to building base) */}
        {/* curtainCenterY is 7.4m. Transoms at y=3.6 (dy=-3.8), y=7.2 (dy=-0.2), y=10.8 (dy=+3.4) */}
        {[-3.8, -0.2, 3.4].map((dy, idx) => (
          <mesh key={`curt-floor-beam-${idx}`} position={[0, dy, sign * 0.05]} material={frameMat}>
            <boxGeometry args={[curtainWidth - 0.16 * scaleX, 0.12, 0.06]} />
          </mesh>
        ))}

        {/* Intermediate Transoms at mid-floor levels */}
        {[-5.6, -2.0, 1.6, 5.2].map((dy, idx) => (
          <mesh key={`curt-mid-beam-${idx}`} position={[0, dy, sign * 0.045]} material={frameMat}>
            <boxGeometry args={[curtainWidth - 0.16 * scaleX, 0.06, 0.05]} />
          </mesh>
        ))}

        {/* Chevron / Diagonal Architectural Reflections visible on drawing */}
        {[-3.8, -0.2, 3.4].map((baseY, idx) => (
          <group key={`brace-${idx}`} position={[0, baseY + 1.8, sign * 0.048]}>
            <mesh rotation={[0, 0, Math.PI / 12]} material={frameMat}>
              <boxGeometry args={[curtainWidth * 0.52, 0.04, 0.02]} />
            </mesh>
            <mesh rotation={[0, 0, -Math.PI / 12]} material={frameMat}>
              <boxGeometry args={[curtainWidth * 0.52, 0.04, 0.02]} />
            </mesh>
          </group>
        ))}

        {/* Ground Floor Entrance Doors in Center of Curtain Wall */}
        <group position={[0, -curtainHeight / 2 + 1.3, sign * 0.05]}>
          {/* Double Door Frame */}
          <mesh material={frameMat}>
            <boxGeometry args={[2.4 * scaleX, 2.4, 0.06]} />
          </mesh>
          {/* Glass Doors */}
          <mesh position={[0, 0, sign * 0.025]} material={glassMat}>
            <boxGeometry args={[2.24 * scaleX, 2.24, 0.03]} />
          </mesh>
          {/* Center Door Mullion / Meeting Stile */}
          <mesh position={[0, 0, sign * 0.045]} material={frameMat}>
            <boxGeometry args={[0.06 * scaleX, 2.24, 0.05]} />
          </mesh>
          {/* Door Handles */}
          <mesh position={[-0.15 * scaleX, 0, sign * 0.08]} material={trimMat}>
            <boxGeometry args={[0.04, 0.8, 0.04]} />
          </mesh>
          <mesh position={[0.15 * scaleX, 0, sign * 0.08]} material={trimMat}>
            <boxGeometry args={[0.04, 0.8, 0.04]} />
          </mesh>
        </group>
      </group>

      {/* ============================================================== */}
      {/* 6. TRIANGULAR ROOF PEDIMENT WITH TRIANGULAR WINDOW (Above 7m)  */}
      {/* ============================================================== */}
      <group position={[0, wallHeight, sign * 0.12]}>
        {/* Triangular Wall Base / Tympanum */}
        <mesh geometry={pedimentWallGeo} material={wallMat} castShadow receiveShadow />

        {/* Triangular Glass Window in Center */}
        <mesh position={[0, 0.35, sign * 0.06]} geometry={pedimentFrameGeo} material={frameMat} />
        <mesh position={[0, 0.35, sign * 0.08]} geometry={pedimentGlassGeo} material={glassMat} />

        {/* Triangular Rake Cornice Moldings (Left & Right sloped beams) */}
        {(() => {
          const rakeLen = Math.hypot(3.5 * scaleX, 2.4);
          const angle = Math.atan2(2.4, 3.5 * scaleX);

          return (
            <>
              {/* Left Rake */}
              <mesh
                position={[-1.75 * scaleX, 1.2, sign * 0.04]}
                rotation={[0, 0, angle]}
                material={trimMat}
                castShadow
              >
                <boxGeometry args={[rakeLen + 0.2, 0.2, 0.32]} />
              </mesh>
              {/* Right Rake */}
              <mesh
                position={[1.75 * scaleX, 1.2, sign * 0.04]}
                rotation={[0, 0, -angle]}
                material={trimMat}
                castShadow
              >
                <boxGeometry args={[rakeLen + 0.2, 0.2, 0.32]} />
              </mesh>
            </>
          );
        })()}

        {/* Roof tiles behind pediment peak */}
        <mesh position={[0, 1.15, -sign * 0.1]} material={roofMat}>
          <boxGeometry args={[6.8 * scaleX, 2.3, 0.3]} />
        </mesh>
      </group>

      {/* ============================================================== */}
      {/* 7. ROOF CORNICE / EAVES BEAM (+14.400)                          */}
      {/* ============================================================== */}
      <mesh position={[0, wallHeight + 0.15, sign * 0.18]} material={trimMat} castShadow>
        <boxGeometry args={[facadeWidth + 0.4, 0.3, 0.4]} />
      </mesh>
      {/* Cornice Upper Drip Cap */}
      <mesh position={[0, wallHeight + 0.32, sign * 0.22]} material={trimMat} castShadow>
        <boxGeometry args={[facadeWidth + 0.6, 0.1, 0.48]} />
      </mesh>

      {/* ============================================================== */}
      {/* 8. 4 VERTICAL DRAINPIPES (ВОДОСТОЧНЫЕ ТРУБЫ)                   */}
      {/* ============================================================== */}
      {[-27.0, -3.8, 3.8, 27.0].map((px, idx) => {
        const pipeX = px * scaleX;
        const pipeH = wallHeight - 0.4; // from y=0.4 to y=14.4

        return (
          <group key={`pipe-${idx}`} position={[pipeX, pipeH / 2 + 0.4, sign * 0.18]}>
            {/* Main vertical pipe */}
            <mesh material={pipeMat} castShadow>
              <cylinderGeometry args={[0.06, 0.06, pipeH, 12]} />
            </mesh>
            {/* Upper funnel under roof gutter */}
            <mesh position={[0, pipeH / 2 + 0.05, 0]} material={pipeMat}>
              <cylinderGeometry args={[0.12, 0.06, 0.2, 12]} />
            </mesh>
            {/* Lower shoe / discharge spout towards ground */}
            <mesh position={[0, -pipeH / 2 + 0.1, sign * 0.08]} rotation={[sign * 0.5, 0, 0]} material={pipeMat}>
              <cylinderGeometry args={[0.06, 0.06, 0.25, 12]} />
            </mesh>
            {/* Wall fastening brackets every 3.6m */}
            {[-pipeH / 2 + 1.8, -pipeH / 2 + 5.4, -pipeH / 2 + 9.0, -pipeH / 2 + 12.6].map((by, bIdx) => (
              <mesh key={`bracket-${bIdx}`} position={[0, by, -sign * 0.06]} material={frameMat}>
                <boxGeometry args={[0.18, 0.04, 0.12]} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}
