import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  StaticGeometryBatcher,
  disposeMergedMap,
  NO_RAYCAST,
} from '../geometry/staticGeometryMerger';
import {
  getArchitecturalWallTextures,
  getRoofTileTextures,
} from '../materials/pbrMaterials';
import { applyTravertineWeatheringShader } from '../shaders/architecturalShaders';

export type BlockFRoofProps = {
  /** Opacity for selection dimming */
  opacity?: number;
  /** Transparent flag */
  transparent?: boolean;
  /** Architectural standing-seam metal roof color */
  roofColor?: string;
  /** Parapet composite panel frieze color */
  corniceColor?: string;
  /** Main travertine stone wall color */
  wallColor?: string;
};

/**
 * Architectural Stepped Low-Slope Parapet Roof for Block F (Library / Hall Building).
 * Reconstructed with 100% CAD precision from architectural roof plan media_1794217480505_836ffadf.png
 * and elevation media_1794216793227_98a34af3.jpg:
 *
 * - Total building footprint: 20.0 m width × 48.0 m length.
 * - Main Higher Volume (Axes Б–В, width 13.5 m):
 *   - Level: +12.000 m (Верх парапета).
 *   - Standing seam metal roof with 3% drainage slope (i = 3%).
 *   - White composite panel parapet frieze (height 1 200 mm) with metallic coping cap.
 * - Lower Setback Roof Strip (Axes А–Б, width 6.5 m, marked in red):
 *   - Level: +9.200 m parapet (+9.000 m roof deck, 2.8–3.0 m below the main roof).
 *   - Single-slope standing seam metal roof (i = 3% towards courtyard).
 *   - White composite panel parapet frieze (height 1 000 mm).
 * - Vertical Step Reveal Wall at Axis Б (X = 58.55 m):
 *   - 2 800 mm exposed travertine wall between lower (+9.2 m) and higher (+12.0 m) roofs.
 */
export function BlockFRoof({
  opacity = 1,
  transparent = false,
  roofColor = '#8a99a8',
  corniceColor = '#f8fafc',
  wallColor = '#ebdcc5',
}: BlockFRoofProps) {
  const wallTextures = useMemo(() => getArchitecturalWallTextures(), []);
  const roofTextures = useMemo(() => getRoofTileTextures(6, 6), []);

  const materials = useMemo(() => {
    const roofMat = new THREE.MeshStandardMaterial({
      color: roofColor,
      map: roofTextures?.map ?? null,
      normalMap: roofTextures?.normalMap ?? null,
      normalScale: new THREE.Vector2(0.3, 0.3),
      roughness: 0.52,
      metalness: 0.42,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const friezeMat = new THREE.MeshStandardMaterial({
      color: corniceColor,
      roughness: 0.36,
      metalness: 0.08,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: '#0f172a', // Dark architectural metal coping cap / flashing
      roughness: 0.38,
      metalness: 0.8,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const wallMat = applyTravertineWeatheringShader(
      new THREE.MeshStandardMaterial({
        color: wallColor,
        map: wallTextures?.map ?? null,
        normalMap: wallTextures?.normalMap ?? null,
        normalScale: new THREE.Vector2(0.24, 0.24),
        roughness: 0.82,
        metalness: 0.0,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    );

    const jointMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(wallColor).multiplyScalar(0.78),
      roughness: 0.92,
      metalness: 0.0,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    return { roofMat, friezeMat, trimMat, wallMat, jointMat };
  }, [roofColor, corniceColor, wallColor, wallTextures, roofTextures, transparent, opacity]);

  const merged = useMemo(() => {
    const b = new StaticGeometryBatcher();

    // Geometric Grid Coordinates (aligned with BlockFSouthFacade & Campus Grid)
    const axisAX = 52.05; // West edge
    const axisBX = 58.55; // Step axis (6.5 m from Axis A)
    const axisVX = 72.05; // East edge (13.5 m from Axis Б)
    const northZ = -97.2; // North boundary
    const southZ = -49.2; // South boundary

    const length = southZ - northZ; // 48.0 m
    const centerZ = (northZ + southZ) / 2; // -73.2 m

    const leftWidth = axisBX - axisAX; // 6.5 m
    const leftCenterX = (axisAX + axisBX) / 2; // 55.30 m
    const rightWidth = axisVX - axisBX; // 13.5 m
    const rightCenterX = (axisBX + axisVX) / 2; // 65.30 m

    // =========================================================================
    // 1. MAIN HIGHER ROOF (Axes Б–В, width 13.5 m, parapet +12.000 m)
    // =========================================================================
    const mainParapetY = 12.0;
    const mainFriezeH = 1.2;
    const mainWallTopY = mainParapetY - mainFriezeH; // 10.80 m
    const baseWallH = 8.05; // procedural building wall top

    // Travertine upper wall infill (from 8.05 m to 10.80 m, height = 2.75 m)
    const infillH = mainWallTopY - baseWallH;
    const infillCenterY = baseWallH + infillH / 2; // 9.425 m
    // East inner parapet liner facing the roof deck (exterior East face is crowned by BlockFFacade)
    b.addBox('wall', [0.15, 0.45, length], [axisVX - 0.22, 11.825, centerZ]);
    // North wall infill (right portion)
    b.addBox('wall', [rightWidth, infillH, 0.2], [rightCenterX, infillCenterY, northZ + 0.1]);

    // Horizontal rustication joints on exposed upper walls
    for (const jy of [8.4, 9.2, 10.0]) {
      b.addBox('joint', [rightWidth, 0.025, 0.015], [rightCenterX, jy, northZ - 0.01]);
    }

    // White composite panel parapet frieze (+10.800 m to +12.000 m, height = 1.2 m)
    const mainFriezeCenterY = mainWallTopY + mainFriezeH / 2; // 11.40 m
    // North frieze
    b.addBox('frieze', [rightWidth, mainFriezeH, 0.24], [rightCenterX, mainFriezeCenterY, northZ + 0.06]);
    // South frieze (backing behind BlockFSouthFacade)
    b.addBox('frieze', [rightWidth, mainFriezeH, 0.24], [rightCenterX, mainFriezeCenterY, southZ - 0.06]);

    // Dark architectural coping cap (+12.040 m)
    b.addBox('trim', [rightWidth + 0.1, 0.08, 0.32], [rightCenterX, 12.04, northZ + 0.06]);
    b.addBox('trim', [rightWidth + 0.1, 0.08, 0.32], [rightCenterX, 12.04, southZ - 0.06]);

    // Main roof surface deck with subtle 3% slope (i = 3%)
    // Central ridge along Z at rightCenterX (X = 65.30 m)
    const ridgeY = 11.85;
    const gutterY = 11.65; // 0.20 m drop over 6.6 m = 3% slope
    const halfSpan = (rightWidth - 0.6) / 2;
    const slopeAng = Math.atan2(ridgeY - gutterY, halfSpan);

    // East roof plane (sloping down from ridge towards East gutter)
    b.addBox(
      'roof',
      [halfSpan, 0.06, length - 0.6],
      [rightCenterX + halfSpan / 2, (ridgeY + gutterY) / 2, centerZ],
      [0, 0, -slopeAng],
    );

    // West roof plane (sloping down from ridge towards Axis Б gutter)
    b.addBox(
      'roof',
      [halfSpan, 0.06, length - 0.6],
      [rightCenterX - halfSpan / 2, (ridgeY + gutterY) / 2, centerZ],
      [0, 0, slopeAng],
    );

    // Standing seam metal ribs along Z (every 0.9 m across rightWidth)
    const seamCountRight = Math.floor(rightWidth / 0.9);
    for (let i = 1; i < seamCountRight; i++) {
      const sx = axisBX + 0.4 + i * 0.9;
      const distFromRidge = Math.abs(sx - rightCenterX);
      const sy = ridgeY - distFromRidge * Math.tan(slopeAng) + 0.04;
      b.addBox('trim', [0.035, 0.04, length - 0.8], [sx, sy, centerZ]);
    }

    // =========================================================================
    // 2. LOWER SETBACK ROOF STRIP (Axes А–Б, width 6.5 m, marked in red)
    // =========================================================================
    const lowerParapetY = 9.2;
    const lowerFriezeH = 1.0;
    const lowerWallTopY = lowerParapetY - lowerFriezeH; // 8.20 m

    // West wall infill (from 8.05 m to 8.20 m)
    b.addBox('wall', [0.18, 0.15, length], [axisAX + 0.09, 8.125, centerZ]);
    // North wall infill (left portion)
    b.addBox('wall', [leftWidth, 0.15, 0.18], [leftCenterX, 8.125, northZ + 0.09]);

    // White composite panel frieze (+8.200 m to +9.200 m, height = 1.0 m)
    const lowerFriezeCenterY = lowerWallTopY + lowerFriezeH / 2; // 8.70 m
    // West outer frieze
    b.addBox('frieze', [0.22, lowerFriezeH, length + 0.2], [axisAX + 0.06, lowerFriezeCenterY, centerZ]);
    // North frieze
    b.addBox('frieze', [leftWidth + 0.2, lowerFriezeH, 0.22], [leftCenterX, lowerFriezeCenterY, northZ + 0.06]);
    // South frieze (backing)
    b.addBox('frieze', [leftWidth + 0.2, lowerFriezeH, 0.22], [leftCenterX, lowerFriezeCenterY, southZ - 0.06]);

    // Dark architectural coping cap (+9.240 m)
    b.addBox('trim', [0.3, 0.08, length + 0.3], [axisAX + 0.06, 9.24, centerZ]);
    b.addBox('trim', [leftWidth + 0.3, 0.08, 0.3], [leftCenterX, 9.24, northZ + 0.06]);
    b.addBox('trim', [leftWidth + 0.3, 0.08, 0.3], [leftCenterX, 9.24, southZ - 0.06]);

    // Lower roof surface deck with 3% slope (i = 3% sloping towards courtyard)
    // High edge at Axis Б (Y = 9.05 m), low edge at Axis A (Y = 8.85 m)
    const lowerDeckW = leftWidth - 0.5;
    const lowerHighY = 9.05;
    const lowerLowY = 8.85;
    const lowerSlopeAng = Math.atan2(lowerHighY - lowerLowY, lowerDeckW);

    b.addBox(
      'roof',
      [lowerDeckW, 0.06, length - 0.6],
      [leftCenterX, (lowerHighY + lowerLowY) / 2, centerZ],
      [0, 0, lowerSlopeAng],
    );

    // Standing seam metal ribs along Z on lower roof (every 0.9 m across leftWidth)
    const seamCountLeft = Math.floor(leftWidth / 0.9);
    for (let i = 1; i < seamCountLeft; i++) {
      const sx = axisAX + 0.3 + i * 0.9;
      const frac = (axisBX - sx) / lowerDeckW;
      const sy = lowerHighY - (1 - frac) * (lowerHighY - lowerLowY) + 0.04;
      b.addBox('trim', [0.035, 0.04, length - 0.8], [sx, sy, centerZ]);
    }

    // =========================================================================
    // 3. VERTICAL STEP REVEAL WALL AT AXIS Б (X = 58.55 m)
    // =========================================================================
    // Connects lower roof (+9.0 m deck) to higher parapet (+12.0 m)
    // Height = 2.80 m (to parapet top 12.04 m), facing West (-X)
    const stepWallH = 12.04 - lowerHighY; // ~2.99 m
    const stepCenterY = lowerHighY + stepWallH / 2; // ~10.54 m

    // Travertine step wall facing West
    b.addBox('wall', [0.22, stepWallH, length], [axisBX + 0.08, stepCenterY, centerZ]);

    // Horizontal rustication joints on step wall
    for (const jy of [9.4, 10.2, 11.0]) {
      b.addBox('joint', [0.015, 0.025, length], [axisBX - 0.035, jy, centerZ]);
    }

    // White composite coping trim and parapet ledge at Axis Б top (+12.04 m)
    b.addBox('frieze', [0.26, 0.35, length + 0.1], [axisBX + 0.08, 11.85, centerZ]);
    b.addBox('trim', [0.32, 0.08, length + 0.2], [axisBX + 0.08, 12.04, centerZ]);

    return b.buildAll();
  }, []);

  useEffect(() => () => disposeMergedMap(merged), [merged]);

  return (
    <group>
      {merged.roof && (
        <mesh geometry={merged.roof} material={materials.roofMat} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.frieze && (
        <mesh geometry={merged.frieze} material={materials.friezeMat} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.trim && (
        <mesh geometry={merged.trim} material={materials.trimMat} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.wall && (
        <mesh geometry={merged.wall} material={materials.wallMat} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.joint && (
        <mesh geometry={merged.joint} material={materials.jointMat} raycast={NO_RAYCAST} />
      )}
    </group>
  );
}
