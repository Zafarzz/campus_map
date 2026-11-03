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

export type BlockEFacadeProps = {
  /** Building mass length along X (m) */
  buildingWidth: number;
  /** Building mass depth along Z (m) */
  buildingDepth: number;
  /** Facing direction: 'south' faces Block F and Suwon Hall; 'north' faces rear */
  facing?: 'south' | 'north';
  /** Height up to cornice line (m), default 14.35 per CAD blueprint */
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
  /** Window frame color (white per CAD) */
  frameColor?: string;
  /** Roof & downspout drainpipe color (terracotta/burgundy per CAD) */
  roofColor?: string;
};

/**
 * Creates 2D arched shape geometry for the monumental staircase stained glass window.
 * Width 2.4m, straight rectangle from baseY=0.75m to springY=11.2m, semicircular arch up to apexY=12.4m.
 */
function createArchedWindowGeometry(width: number, baseY: number = 0.75, springY: number = 11.2): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const w2 = width / 2;
  const radius = w2;

  shape.moveTo(-w2, baseY);
  shape.lineTo(w2, baseY);
  shape.lineTo(w2, springY);
  shape.absarc(0, springY, radius, 0, Math.PI, false);
  shape.lineTo(-w2, baseY);
  shape.closePath();

  return new THREE.ShapeGeometry(shape, 18);
}

/**
 * Creates 3D extruded frame trim around the arched window.
 */
function createArchedFrameGeometry(width: number, frameWidth: number = 0.08, depth: number = 0.06): THREE.BufferGeometry {
  const w2 = width / 2;
  const baseY = 0.75;
  const springY = 11.2;
  const radius = w2;

  const shape = new THREE.Shape();
  shape.moveTo(-w2 - frameWidth, baseY);
  shape.lineTo(w2 + frameWidth, baseY);
  shape.lineTo(w2 + frameWidth, springY);
  shape.absarc(0, springY, radius + frameWidth, 0, Math.PI, false);
  shape.lineTo(-w2 - frameWidth, baseY);
  shape.closePath();

  const hole = new THREE.Path();
  hole.moveTo(-w2, baseY);
  hole.lineTo(w2, baseY);
  hole.lineTo(w2, springY);
  hole.absarc(0, springY, radius, 0, Math.PI, false);
  hole.lineTo(-w2, baseY);
  hole.closePath();
  shape.holes.push(hole);

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
  });
  geom.translate(0, 0, -depth / 2);
  return geom;
}

/**
 * Architectural 3D Elevation of Academic Block E (4-Storey Architecture & Design Block / Учебный корпус №3).
 * Optimized via StaticGeometryBatcher: merges all 72 windows, arched stair mullions, drainpipes,
 * rustication seams, and cornices by material into 8 batched draw calls instead of ~620 individual meshes.
 */
export function BlockEFacade({
  buildingWidth,
  buildingDepth,
  facing = 'south',
  wallHeight = 14.35,
  opacity = 1,
  transparent = false,
  wallColor = '#ebdcc5',
  trimColor = '#f8fafc',
  plinthColor = '#334155',
  frameColor = '#ffffff',
  roofColor = '#991b1b',
}: BlockEFacadeProps) {
  const isSouth = facing === 'south';
  const wallZ = isSouth ? buildingDepth / 2 : -buildingDepth / 2;
  const sign = isSouth ? 1 : -1;

  const baseWidth = 64.0;
  const scaleX = buildingWidth / baseWidth;

  const travertinePbr = useMemo(() => getArchitecturalWallTextures(16, 4), []);
  const plinthPbr = useMemo(() => getGranitePlinthTextures(4, 1), []);
  const glassTex = useMemo(() => getWindowGlassTexture(), []);

  const wallMat = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: wallColor,
      roughness: 0.8,
      metalness: 0.0,
      transparent,
      opacity,
      depthWrite: !transparent,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    if (travertinePbr?.map) {
      mat.map = travertinePbr.map;
      mat.normalMap = travertinePbr.normalMap;
      mat.normalScale = new THREE.Vector2(0.22, 0.22);
      mat.roughnessMap = travertinePbr.roughnessMap;
    }
    return applyTravertineWeatheringShader(mat);
  }, [wallColor, transparent, opacity, travertinePbr]);

  const plinthMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: plinthColor,
        map: plinthPbr?.map ?? null,
        normalMap: plinthPbr?.normalMap ?? null,
        normalScale: new THREE.Vector2(0.25, 0.25),
        roughnessMap: plinthPbr?.roughnessMap ?? null,
        roughness: 0.88,
        metalness: 0.0,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [plinthColor, plinthPbr, transparent, opacity],
  );

  const whiteFrameMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: frameColor,
        roughness: 0.35,
        metalness: 0.15,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [frameColor, transparent, opacity],
  );

  const trimMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: trimColor,
        roughness: 0.65,
        metalness: 0.0,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [trimColor, transparent, opacity],
  );

  const glassMat = useMemo(
    () =>
      applyArchitecturalGlassShader(
        new THREE.MeshStandardMaterial({
          color: '#1e3a5f',
          map: glassTex,
          roughness: 0.08,
          metalness: 0.15,
          transparent: true,
          opacity: Math.min(opacity, 0.92),
          depthWrite: !transparent,
          envMapIntensity: 1.6,
        }),
      ),
    [glassTex, transparent, opacity],
  );

  const stairGlassMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#172554',
        map: glassTex,
        roughness: 0.08,
        metalness: 0.88,
        transparent: true,
        opacity: Math.min(opacity, 0.95),
        depthWrite: !transparent,
        envMapIntensity: 1.75,
      }),
    [glassTex, transparent, opacity],
  );

  const pipeMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: roofColor,
        roughness: 0.45,
        metalness: 0.35,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [roofColor, transparent, opacity],
  );

  const rusticationJointMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#b8a994',
        roughness: 0.95,
        metalness: 0.02,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [transparent, opacity],
  );

  // Merge all static facade elements into 8 material-batched geometries
  const merged = useMemo(() => {
    const batcher = new StaticGeometryBatcher();

    // 1. Plinth
    batcher.addBox('plinth', [buildingWidth + 0.3, 0.7, 0.22], [0, 0.35, sign * 0.08]);
    batcher.addBox('plinth', [buildingWidth + 0.35, 0.04, 0.26], [0, 0.72, sign * 0.1]);

    // 2. Inter-floor Rusticated Spandrel Lines
    for (const sy of [3.2, 6.5, 9.8]) {
      for (const dy of [-0.4, 0, 0.4]) {
        batcher.addBox('rustication', [buildingWidth, 0.025, 0.015], [0, sy + dy, sign * 0.03]);
      }
    }

    // 3. Windows across all 4 floors
    const floorCentersY = [1.55, 4.85, 8.15, 11.45];
    const winH = 1.7;
    const smallWinW = 1.6 * scaleX;
    const largeWinW = 2.6 * scaleX;
    const rotY = isSouth ? 0 : Math.PI;

    const smallAxes: number[] = [];
    for (let i = 0; i < 5; i++) {
      smallAxes.push((-32 + (i + 0.5) * 2.4) * scaleX);
      smallAxes.push((20 + (i + 0.5) * 2.4) * scaleX);
    }

    const largeAxes: number[] = [];
    for (let i = 0; i < 4; i++) {
      largeAxes.push((-16 + (i + 0.5) * 4) * scaleX);
      largeAxes.push((i + 0.5) * 4 * scaleX);
    }

    for (const centerY of floorCentersY) {
      // Small 2-pane windows
      for (const wx of smallAxes) {
        const zBase = sign * 0.04;
        batcher.addBox('trim', [smallWinW + 0.14, 0.06, 0.1], [wx, centerY - winH / 2 - 0.03, zBase + sign * 0.03]);
        batcher.addPlane('glass', [smallWinW, winH], [wx, centerY, zBase], [0, rotY, 0]);
        const fz = zBase + sign * 0.02;
        batcher.addBox('whiteFrame', [smallWinW, 0.05, 0.05], [wx, centerY - winH / 2 + 0.025, fz]);
        batcher.addBox('whiteFrame', [smallWinW, 0.05, 0.05], [wx, centerY + winH / 2 - 0.025, fz]);
        batcher.addBox('whiteFrame', [0.045, winH, 0.05], [wx - smallWinW / 2 + 0.025, centerY, fz]);
        batcher.addBox('whiteFrame', [0.045, winH, 0.05], [wx + smallWinW / 2 - 0.025, centerY, fz]);
        batcher.addBox('whiteFrame', [0.045, winH, 0.05], [wx, centerY, fz]);
        batcher.addBox('whiteFrame', [smallWinW, 0.05, 0.05], [wx, centerY + winH / 2 - 0.42, fz]);
      }

      // Large 3-pane windows
      for (const wx of largeAxes) {
        const zBase = sign * 0.04;
        batcher.addBox('trim', [largeWinW + 0.14, 0.06, 0.1], [wx, centerY - winH / 2 - 0.03, zBase + sign * 0.03]);
        batcher.addPlane('glass', [largeWinW, winH], [wx, centerY, zBase], [0, rotY, 0]);
        const fz = zBase + sign * 0.02;
        batcher.addBox('whiteFrame', [largeWinW, 0.05, 0.05], [wx, centerY - winH / 2 + 0.025, fz]);
        batcher.addBox('whiteFrame', [largeWinW, 0.05, 0.05], [wx, centerY + winH / 2 - 0.025, fz]);
        batcher.addBox('whiteFrame', [0.045, winH, 0.05], [wx - largeWinW / 2 + 0.025, centerY, fz]);
        batcher.addBox('whiteFrame', [0.045, winH, 0.05], [wx + largeWinW / 2 - 0.025, centerY, fz]);
        batcher.addBox('whiteFrame', [0.045, winH, 0.05], [wx - largeWinW / 6, centerY, fz]);
        batcher.addBox('whiteFrame', [0.045, winH, 0.05], [wx + largeWinW / 6, centerY, fz]);
        batcher.addBox('whiteFrame', [largeWinW, 0.05, 0.05], [wx, centerY + winH / 2 - 0.42, fz]);
      }
    }

    // 4 & 5. Left & Right Staircase Risalits with Monumental Arched Stained Glass Windows
    const archWindowWidth = 2.4 * scaleX;
    const archGlassGeo = createArchedWindowGeometry(archWindowWidth);
    const archFrameGeo = createArchedFrameGeometry(archWindowWidth);
    const risalitWidth = 4.0 * scaleX;

    for (const rx of [-18.0 * scaleX, 18.0 * scaleX]) {
      const rz = sign * 0.08;
      batcher.addBox('wall', [risalitWidth, wallHeight - 0.7, 0.18], [rx, 0.7 + (wallHeight - 0.7) / 2, rz]);
      batcher.addGeometry('stairGlass', archGlassGeo, [rx, 0, rz + sign * 0.1], [0, rotY, 0]);
      batcher.addGeometry('whiteFrame', archFrameGeo, [rx, 0, rz + sign * 0.12]);

      for (const mx of [-archWindowWidth / 3, archWindowWidth / 3]) {
        batcher.addBox('whiteFrame', [0.045, 10.45, 0.04], [rx + mx, 0.75 + 10.45 / 2, rz + sign * 0.11]);
      }
      for (const ty of [1.7, 2.65, 3.6, 4.55, 5.5, 6.45, 7.4, 8.35, 9.3, 10.25, 11.2]) {
        batcher.addBox('whiteFrame', [archWindowWidth, 0.04, 0.04], [rx, ty, rz + sign * 0.11]);
      }
      for (const ang of [-Math.PI / 4, 0, Math.PI / 4]) {
        batcher.addBox('whiteFrame', [0.035, archWindowWidth / 2, 0.04], [rx, 11.2, rz + sign * 0.11], [0, 0, ang]);
      }
    }
    archGlassGeo.dispose();
    archFrameGeo.dispose();

    // 6. Downspout Drainpipes
    const pipeRadius = 0.065;
    const pipeH = wallHeight - 0.75;
    const hopperGeo = new THREE.ConeGeometry(pipeRadius * 2.2, 0.35, 10);
    const pipePositions = [
      -32.0 * scaleX + 0.2,
      -20.0 * scaleX,
      -16.0 * scaleX,
      0.0,
      16.0 * scaleX,
      20.0 * scaleX,
      32.0 * scaleX - 0.2,
    ];
    for (const px of pipePositions) {
      const pz = sign * 0.18;
      batcher.addGeometry('pipe', hopperGeo, [px, wallHeight - 0.18, pz], [Math.PI, 0, 0]);
      batcher.addCylinder('pipe', [pipeRadius, pipeRadius, pipeH, 10], [px, 0.7 + pipeH / 2, pz]);
      batcher.addCylinder('pipe', [pipeRadius, pipeRadius * 1.15, 0.35, 10], [px, 0.68, pz + sign * 0.08], [sign * 0.45, 0, 0]);
    }
    hopperGeo.dispose();

    // 7. Stepped Parapet Firewalls
    for (const fx of [-32.0 * scaleX + 0.6 * scaleX, 0, 32.0 * scaleX - 0.6 * scaleX]) {
      batcher.addBox('wall', [1.2 * scaleX, 1.1, 0.4], [fx, wallHeight + 0.45, sign * 0.05]);
      batcher.addBox('trim', [1.3 * scaleX, 0.06, 0.44], [fx, wallHeight + 1.01, sign * 0.05]);
    }

    // 8. Cornice & Drip Edge
    batcher.addBox('trim', [buildingWidth + 1.2, 0.35, 0.42], [0, wallHeight - 0.175, sign * 0.18]);
    batcher.addBox('pipe', [buildingWidth + 1.26, 0.1, 0.48], [0, wallHeight + 0.05, sign * 0.22]);

    return batcher.buildAll();
  }, [buildingWidth, scaleX, sign, isSouth, wallHeight]);

  useEffect(() => () => disposeMergedMap(merged), [merged]);

  return (
    <group position={[0, 0, wallZ]}>
      {merged.plinth && (
        <mesh geometry={merged.plinth} material={plinthMat} raycast={NO_RAYCAST} castShadow receiveShadow />
      )}
      {merged.rustication && (
        <mesh geometry={merged.rustication} material={rusticationJointMat} raycast={NO_RAYCAST} />
      )}
      {merged.wall && (
        <mesh geometry={merged.wall} material={wallMat} raycast={NO_RAYCAST} castShadow receiveShadow />
      )}
      {merged.trim && (
        <mesh geometry={merged.trim} material={trimMat} raycast={NO_RAYCAST} castShadow receiveShadow />
      )}
      {merged.whiteFrame && (
        <mesh geometry={merged.whiteFrame} material={whiteFrameMat} raycast={NO_RAYCAST} />
      )}
      {merged.glass && (
        <mesh geometry={merged.glass} material={glassMat} raycast={NO_RAYCAST} />
      )}
      {merged.stairGlass && (
        <mesh geometry={merged.stairGlass} material={stairGlassMat} raycast={NO_RAYCAST} />
      )}
      {merged.pipe && (
        <mesh geometry={merged.pipe} material={pipeMat} raycast={NO_RAYCAST} />
      )}
    </group>
  );
}
