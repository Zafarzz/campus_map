import { useMemo } from 'react';
import * as THREE from 'three';
import { getArchitecturalWallTextures, getWindowGlassTexture } from '../materials/pbrMaterials';

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

  return new THREE.ShapeGeometry(shape, 24);
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
  // Outer contour
  shape.moveTo(-w2 - frameWidth, baseY);
  shape.lineTo(w2 + frameWidth, baseY);
  shape.lineTo(w2 + frameWidth, springY);
  shape.absarc(0, springY, radius + frameWidth, 0, Math.PI, false);
  shape.lineTo(-w2 - frameWidth, baseY);
  shape.closePath();

  // Inner hole
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
 * Reconstructed directly from CAD blueprint:
 * «ФАСАД 4-ЭТАЖНОГО УЧЕБНОГО КОРПУСА С АРОЧНЫМ ВИТРАЖОМ В ОСЯХ 1–4 (2D ЧЕРТЕЖ)»
 * (Ортогональная проекция корпуса без примыкающего павильона холла | Размеры в мм (М 1:100)).
 *
 * Full Symmetrical Architectural Composition:
 * - Base CAD module in axes 1–4 is 32 000 mm (Left half), symmetrical on the right across Axis 4 (Total 64.0m).
 * - Two monumental staircase risalits with arched stained glass windows (2 400 × 11 650 mm, apex at +12.400 m, 3×11 grid).
 * - Central academic wing (32.0m) featuring 4+4 large 3-pane windows with upper transoms (2 600 × 1 700 mm).
 * - Flanking end wings (12.0m each) with 5 window axes of 1 600 × 1 700 mm.
 * - Total height: 14 350 mm to cornice line across 4 storeys (1F: 3.65m, 2F: 3.3m, 3F: 3.3m, 4F: 3.45m).
 * - 1 600 mm rusticated travertine spandrels between all floors with horizontal shadow grooves.
 * - Central & end stepped parapet firewalls (брандмауэры) and burgundy downspout drainpipes.
 * - Dark granite plinth (+0.000 to +0.700 m) and terracotta pitched hip roof (+14.350 to +18.000 m).
 */
export function BlockEFacade({
  buildingWidth,
  buildingDepth,
  facing = 'south',
  wallHeight = 14.35,
  roofHeight = 3.6,
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

  // 64.0m full symmetrical composition scale factor
  const baseWidth = 64.0;
  const scaleX = buildingWidth / baseWidth;

  // Window vertical levels (4 floors)
  const floorLevels = useMemo(
    () => [
      { floor: 1, centerY: 0.7 + 1.7 / 2, sillY: 0.7 },
      { floor: 2, centerY: 4.0 + 1.7 / 2, sillY: 4.0 },
      { floor: 3, centerY: 7.3 + 1.7 / 2, sillY: 7.3 },
      { floor: 4, centerY: 10.6 + 1.7 / 2, sillY: 10.6 },
    ],
    [],
  );

  // Inter-floor rusticated spandrels (1.6m high) between windows
  const spandrelLevels = useMemo(() => [2.4 + 0.8, 5.7 + 0.8, 9.0 + 0.8], []);

  // Textures & Materials
  const travertinePbr = useMemo(() => getArchitecturalWallTextures(16, 4), []);
  const glassTex = useMemo(() => getWindowGlassTexture(), []);

  const wallMat = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: wallColor,
      roughness: 0.8,
      metalness: 0.05,
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
      mat.normalScale = new THREE.Vector2(0.18, 0.18);
      mat.roughnessMap = travertinePbr.roughnessMap;
    }
    return mat;
  }, [wallColor, transparent, opacity, travertinePbr]);

  const plinthMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: plinthColor,
        roughness: 0.88,
        metalness: 0.12,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [plinthColor, transparent, opacity],
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
        roughness: 0.45,
        metalness: 0.08,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [trimColor, transparent, opacity],
  );

  const glassMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#1e3a5f',
        map: glassTex,
        roughness: 0.1,
        metalness: 0.85,
        transparent: true,
        opacity: Math.min(opacity, 0.92),
        depthWrite: !transparent,
        envMapIntensity: 1.55,
      }),
    [glassTex, transparent, opacity],
  );

  const stairGlassMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#172554', // Deep stained cobalt/navy blue for monumental stair tower
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

  // Common Geometries
  const plinthGeo = useMemo(() => new THREE.BoxGeometry(buildingWidth + 0.3, 0.7, 0.22), [buildingWidth]);
  const plinthCapGeo = useMemo(() => new THREE.BoxGeometry(buildingWidth + 0.35, 0.04, 0.26), [buildingWidth]);

  // Arched Stained Glass Geometries
  const archWindowWidth = 2.4 * scaleX;
  const archGlassGeo = useMemo(() => createArchedWindowGeometry(archWindowWidth), [archWindowWidth]);
  const archFrameGeo = useMemo(() => createArchedFrameGeometry(archWindowWidth), [archWindowWidth]);

  // Risalit Wall Box (4.0m wide, +0.12m projection)
  const risalitWidth = 4.0 * scaleX;
  const risalitGeo = useMemo(
    () => new THREE.BoxGeometry(risalitWidth, wallHeight - 0.7, 0.18),
    [risalitWidth, wallHeight],
  );

  // Standard Windows:
  // 1. Large 3-pane window (Central wings, width 2.6m * scaleX, height 1.7m)
  const largeWinW = 2.6 * scaleX;
  const winH = 1.7;
  const largeWinGlassGeo = useMemo(() => new THREE.PlaneGeometry(largeWinW, winH), [largeWinW]);
  const largeWinFrameHorizGeo = useMemo(() => new THREE.BoxGeometry(largeWinW, 0.05, 0.05), [largeWinW]);
  const largeWinFrameVertGeo = useMemo(() => new THREE.BoxGeometry(0.045, winH, 0.05), []);
  const largeWinSillGeo = useMemo(() => new THREE.BoxGeometry(largeWinW + 0.14, 0.06, 0.1), [largeWinW]);

  // 2. Small 2-pane window (End wings, width 1.6m * scaleX, height 1.7m)
  const smallWinW = 1.6 * scaleX;
  const smallWinGlassGeo = useMemo(() => new THREE.PlaneGeometry(smallWinW, winH), [smallWinW]);
  const smallWinFrameHorizGeo = useMemo(() => new THREE.BoxGeometry(smallWinW, 0.05, 0.05), [smallWinW]);
  const smallWinFrameVertGeo = useMemo(() => new THREE.BoxGeometry(0.045, winH, 0.05), []);
  const smallWinSillGeo = useMemo(() => new THREE.BoxGeometry(smallWinW + 0.14, 0.06, 0.1), [smallWinW]);

  // Drainpipe geometry
  const pipeRadius = 0.065;
  const pipeH = wallHeight - 0.75;
  const drainpipeGeo = useMemo(() => new THREE.CylinderGeometry(pipeRadius, pipeRadius, pipeH, 16), [pipeH]);
  const hopperGeo = useMemo(() => new THREE.ConeGeometry(pipeRadius * 2.2, 0.35, 16), []);
  const shoeGeo = useMemo(() => new THREE.CylinderGeometry(pipeRadius, pipeRadius * 1.15, 0.35, 16), []);

  // Stepped firewall parapet at center & ends
  const firewallGeo = useMemo(() => new THREE.BoxGeometry(1.2 * scaleX, 1.1, 0.4), [scaleX]);

  // Horizontal window axes calculation:
  // Left End Wing: 5 windows (axes -32 to -20)
  const leftEndAxes = useMemo(() => {
    const list: number[] = [];
    for (let i = 0; i < 5; i++) {
      list.push((-32 + (i + 0.5) * (12 / 5)) * scaleX);
    }
    return list;
  }, [scaleX]);

  // Left Risalit center: -18 * scaleX
  const leftRisalitX = -18.0 * scaleX;

  // Central-Left Wing: 4 large windows (axes -16 to 0)
  const centralLeftAxes = useMemo(() => {
    const list: number[] = [];
    for (let i = 0; i < 4; i++) {
      list.push((-16 + (i + 0.5) * (16 / 4)) * scaleX);
    }
    return list;
  }, [scaleX]);

  // Central-Right Wing: 4 large windows (axes 0 to 16)
  const centralRightAxes = useMemo(() => {
    const list: number[] = [];
    for (let i = 0; i < 4; i++) {
      list.push(((i + 0.5) * (16 / 4)) * scaleX);
    }
    return list;
  }, [scaleX]);

  // Right Risalit center: +18 * scaleX
  const rightRisalitX = 18.0 * scaleX;

  // Right End Wing: 5 windows (axes 20 to 32)
  const rightEndAxes = useMemo(() => {
    const list: number[] = [];
    for (let i = 0; i < 5; i++) {
      list.push((20 + (i + 0.5) * (12 / 5)) * scaleX);
    }
    return list;
  }, [scaleX]);

  // Drainpipe positions
  const pipePositions = useMemo(
    () => [
      -32.0 * scaleX + 0.2, // Left end
      -20.0 * scaleX,       // Left risalit west flank
      -16.0 * scaleX,       // Left risalit east flank
      0.0,                  // Center firewall axis
      16.0 * scaleX,        // Right risalit west flank
      20.0 * scaleX,        // Right risalit east flank
      32.0 * scaleX - 0.2,  // Right end
    ],
    [scaleX],
  );

  return (
    <group position={[0, 0, wallZ]}>
      {/* 1. Base Granite Plinth (+0.000 to +0.700 m) */}
      <mesh position={[0, 0.35, sign * 0.08]} geometry={plinthGeo} material={plinthMat} castShadow receiveShadow />
      <mesh position={[0, 0.7 + 0.02, sign * 0.1]} geometry={plinthCapGeo} material={plinthMat} castShadow />

      {/* 2. Inter-floor Rusticated Travertine Spandrel Lines (between 1F-2F, 2F-3F, 3F-4F) */}
      {spandrelLevels.map((sy, sIdx) => (
        <group key={`spandrel-${sIdx}`} position={[0, sy, sign * 0.03]}>
          <mesh position={[0, -0.4, 0]} material={rusticationJointMat}>
            <boxGeometry args={[buildingWidth, 0.025, 0.015]} />
          </mesh>
          <mesh position={[0, 0.0, 0]} material={rusticationJointMat}>
            <boxGeometry args={[buildingWidth, 0.025, 0.015]} />
          </mesh>
          <mesh position={[0, 0.4, 0]} material={rusticationJointMat}>
            <boxGeometry args={[buildingWidth, 0.025, 0.015]} />
          </mesh>
        </group>
      ))}

      {/* 3. Windows across all 4 floors */}
      {floorLevels.map(({ floor, centerY, sillY }) => (
        <group key={`floor-${floor}`}>
          {/* 3a. Left End Wing: 5 small 2-pane windows */}
          {leftEndAxes.map((wx, idx) => (
            <group key={`lw-${floor}-${idx}`} position={[wx, centerY, sign * 0.04]}>
              <mesh position={[0, -winH / 2 - 0.03, sign * 0.03]} geometry={smallWinSillGeo} material={trimMat} castShadow />
              <mesh rotation={[0, isSouth ? 0 : Math.PI, 0]} geometry={smallWinGlassGeo} material={glassMat} />
              {/* Outer frame */}
              <mesh position={[0, -winH / 2 + 0.025, sign * 0.02]} geometry={smallWinFrameHorizGeo} material={whiteFrameMat} />
              <mesh position={[0, winH / 2 - 0.025, sign * 0.02]} geometry={smallWinFrameHorizGeo} material={whiteFrameMat} />
              <mesh position={[-smallWinW / 2 + 0.025, 0, sign * 0.02]} geometry={smallWinFrameVertGeo} material={whiteFrameMat} />
              <mesh position={[smallWinW / 2 - 0.025, 0, sign * 0.02]} geometry={smallWinFrameVertGeo} material={whiteFrameMat} />
              {/* Central vertical divider */}
              <mesh position={[0, 0, sign * 0.02]} geometry={smallWinFrameVertGeo} material={whiteFrameMat} />
              {/* Horizontal transom bar */}
              <mesh position={[0, winH / 2 - 0.42, sign * 0.02]} geometry={smallWinFrameHorizGeo} material={whiteFrameMat} />
            </group>
          ))}

          {/* 3b. Central-Left Wing: 4 large 3-pane windows */}
          {centralLeftAxes.map((wx, idx) => (
            <group key={`clw-${floor}-${idx}`} position={[wx, centerY, sign * 0.04]}>
              <mesh position={[0, -winH / 2 - 0.03, sign * 0.03]} geometry={largeWinSillGeo} material={trimMat} castShadow />
              <mesh rotation={[0, isSouth ? 0 : Math.PI, 0]} geometry={largeWinGlassGeo} material={glassMat} />
              <mesh position={[0, -winH / 2 + 0.025, sign * 0.02]} geometry={largeWinFrameHorizGeo} material={whiteFrameMat} />
              <mesh position={[0, winH / 2 - 0.025, sign * 0.02]} geometry={largeWinFrameHorizGeo} material={whiteFrameMat} />
              <mesh position={[-largeWinW / 2 + 0.025, 0, sign * 0.02]} geometry={largeWinFrameVertGeo} material={whiteFrameMat} />
              <mesh position={[largeWinW / 2 - 0.025, 0, sign * 0.02]} geometry={largeWinFrameVertGeo} material={whiteFrameMat} />
              {/* 2 intermediate mullions for 3 panes */}
              <mesh position={[-largeWinW / 6, 0, sign * 0.02]} geometry={largeWinFrameVertGeo} material={whiteFrameMat} />
              <mesh position={[largeWinW / 6, 0, sign * 0.02]} geometry={largeWinFrameVertGeo} material={whiteFrameMat} />
              {/* Horizontal transom bar */}
              <mesh position={[0, winH / 2 - 0.42, sign * 0.02]} geometry={largeWinFrameHorizGeo} material={whiteFrameMat} />
            </group>
          ))}

          {/* 3c. Central-Right Wing: 4 large 3-pane windows (symmetrical) */}
          {centralRightAxes.map((wx, idx) => (
            <group key={`crw-${floor}-${idx}`} position={[wx, centerY, sign * 0.04]}>
              <mesh position={[0, -winH / 2 - 0.03, sign * 0.03]} geometry={largeWinSillGeo} material={trimMat} castShadow />
              <mesh rotation={[0, isSouth ? 0 : Math.PI, 0]} geometry={largeWinGlassGeo} material={glassMat} />
              <mesh position={[0, -winH / 2 + 0.025, sign * 0.02]} geometry={largeWinFrameHorizGeo} material={whiteFrameMat} />
              <mesh position={[0, winH / 2 - 0.025, sign * 0.02]} geometry={largeWinFrameHorizGeo} material={whiteFrameMat} />
              <mesh position={[-largeWinW / 2 + 0.025, 0, sign * 0.02]} geometry={largeWinFrameVertGeo} material={whiteFrameMat} />
              <mesh position={[largeWinW / 2 - 0.025, 0, sign * 0.02]} geometry={largeWinFrameVertGeo} material={whiteFrameMat} />
              <mesh position={[-largeWinW / 6, 0, sign * 0.02]} geometry={largeWinFrameVertGeo} material={whiteFrameMat} />
              <mesh position={[largeWinW / 6, 0, sign * 0.02]} geometry={largeWinFrameVertGeo} material={whiteFrameMat} />
              <mesh position={[0, winH / 2 - 0.42, sign * 0.02]} geometry={largeWinFrameHorizGeo} material={whiteFrameMat} />
            </group>
          ))}

          {/* 3d. Right End Wing: 5 small 2-pane windows (symmetrical) */}
          {rightEndAxes.map((wx, idx) => (
            <group key={`rw-${floor}-${idx}`} position={[wx, centerY, sign * 0.04]}>
              <mesh position={[0, -winH / 2 - 0.03, sign * 0.03]} geometry={smallWinSillGeo} material={trimMat} castShadow />
              <mesh rotation={[0, isSouth ? 0 : Math.PI, 0]} geometry={smallWinGlassGeo} material={glassMat} />
              <mesh position={[0, -winH / 2 + 0.025, sign * 0.02]} geometry={smallWinFrameHorizGeo} material={whiteFrameMat} />
              <mesh position={[0, winH / 2 - 0.025, sign * 0.02]} geometry={smallWinFrameHorizGeo} material={whiteFrameMat} />
              <mesh position={[-smallWinW / 2 + 0.025, 0, sign * 0.02]} geometry={smallWinFrameVertGeo} material={whiteFrameMat} />
              <mesh position={[smallWinW / 2 - 0.025, 0, sign * 0.02]} geometry={smallWinFrameVertGeo} material={whiteFrameMat} />
              <mesh position={[0, 0, sign * 0.02]} geometry={smallWinFrameVertGeo} material={whiteFrameMat} />
              <mesh position={[0, winH / 2 - 0.42, sign * 0.02]} geometry={smallWinFrameHorizGeo} material={whiteFrameMat} />
            </group>
          ))}
        </group>
      ))}

      {/* 4. Left Staircase Risalit with Monumental Arched Stained Glass Window */}
      <group position={[leftRisalitX, 0, sign * 0.08]}>
        {/* Projecting Risalit Travertine Body */}
        <mesh position={[0, 0.7 + (wallHeight - 0.7) / 2, 0]} geometry={risalitGeo} material={wallMat} castShadow receiveShadow />
        {/* Arched Stained Glass Window */}
        <mesh position={[0, 0, sign * 0.1]} rotation={[0, isSouth ? 0 : Math.PI, 0]} geometry={archGlassGeo} material={stairGlassMat} />
        {/* Outer White Frame Trim */}
        <mesh position={[0, 0, sign * 0.12]} geometry={archFrameGeo} material={whiteFrameMat} castShadow />

        {/* 3x11 Mullion Grid: 2 vertical mullions */}
        {[-archWindowWidth / 3, archWindowWidth / 3].map((mx, mIdx) => (
          <mesh key={`arch-mull-${mIdx}`} position={[mx, 0.75 + 10.45 / 2, sign * 0.11]} material={whiteFrameMat}>
            <boxGeometry args={[0.045, 10.45, 0.04]} />
          </mesh>
        ))}

        {/* Horizontal transom bars (11 rows) */}
        {[1.7, 2.65, 3.6, 4.55, 5.5, 6.45, 7.4, 8.35, 9.3, 10.25, 11.2].map((ty, tIdx) => (
          <mesh key={`arch-transom-${tIdx}`} position={[0, ty, sign * 0.11]} material={whiteFrameMat}>
            <boxGeometry args={[archWindowWidth, 0.04, 0.04]} />
          </mesh>
        ))}

        {/* Sunburst radial mullions in the arched head */}
        {[-Math.PI / 4, 0, Math.PI / 4].map((ang, aIdx) => (
          <mesh
            key={`radial-${aIdx}`}
            position={[0, 11.2, sign * 0.11]}
            rotation={[0, 0, ang]}
            material={whiteFrameMat}
          >
            <boxGeometry args={[0.035, archWindowWidth / 2, 0.04]} />
          </mesh>
        ))}
      </group>

      {/* 5. Right Staircase Risalit with Monumental Arched Stained Glass Window (Symmetrical) */}
      <group position={[rightRisalitX, 0, sign * 0.08]}>
        <mesh position={[0, 0.7 + (wallHeight - 0.7) / 2, 0]} geometry={risalitGeo} material={wallMat} castShadow receiveShadow />
        <mesh position={[0, 0, sign * 0.1]} rotation={[0, isSouth ? 0 : Math.PI, 0]} geometry={archGlassGeo} material={stairGlassMat} />
        <mesh position={[0, 0, sign * 0.12]} geometry={archFrameGeo} material={whiteFrameMat} castShadow />

        {[-archWindowWidth / 3, archWindowWidth / 3].map((mx, mIdx) => (
          <mesh key={`r-arch-mull-${mIdx}`} position={[mx, 0.75 + 10.45 / 2, sign * 0.11]} material={whiteFrameMat}>
            <boxGeometry args={[0.045, 10.45, 0.04]} />
          </mesh>
        ))}

        {[1.7, 2.65, 3.6, 4.55, 5.5, 6.45, 7.4, 8.35, 9.3, 10.25, 11.2].map((ty, tIdx) => (
          <mesh key={`r-arch-transom-${tIdx}`} position={[0, ty, sign * 0.11]} material={whiteFrameMat}>
            <boxGeometry args={[archWindowWidth, 0.04, 0.04]} />
          </mesh>
        ))}

        {[-Math.PI / 4, 0, Math.PI / 4].map((ang, aIdx) => (
          <mesh
            key={`r-radial-${aIdx}`}
            position={[0, 11.2, sign * 0.11]}
            rotation={[0, 0, ang]}
            material={whiteFrameMat}
          >
            <boxGeometry args={[0.035, archWindowWidth / 2, 0.04]} />
          </mesh>
        ))}
      </group>

      {/* 6. Vertical Downspout Drainpipes */}
      {pipePositions.map((px, pIdx) => (
        <group key={`pipe-${pIdx}`} position={[px, 0, sign * 0.18]}>
          <mesh position={[0, wallHeight - 0.18, 0]} rotation={[Math.PI, 0, 0]} geometry={hopperGeo} material={pipeMat} castShadow />
          <mesh position={[0, 0.7 + pipeH / 2, 0]} geometry={drainpipeGeo} material={pipeMat} castShadow />
          <mesh position={[0, 0.68, sign * 0.08]} rotation={[sign * 0.45, 0, 0]} geometry={shoeGeo} material={pipeMat} castShadow />
        </group>
      ))}

      {/* 7. Stepped Parapet Firewalls (Брандмауэры) at Left End, Center, and Right End */}
      {[-32.0 * scaleX + 0.6 * scaleX, 0, 32.0 * scaleX - 0.6 * scaleX].map((fx, fIdx) => (
        <group key={`firewall-${fIdx}`} position={[fx, wallHeight + 0.45, sign * 0.05]}>
          <mesh geometry={firewallGeo} material={wallMat} castShadow receiveShadow />
          <mesh position={[0, 0.56, 0]} material={trimMat}>
            <boxGeometry args={[1.3 * scaleX, 0.06, 0.44]} />
          </mesh>
        </group>
      ))}

      {/* 8. White Soffit Fascia Cornice Overhang (+14.00 to +14.35 m) */}
      <mesh position={[0, wallHeight - 0.175, sign * 0.18]} material={trimMat} castShadow receiveShadow>
        <boxGeometry args={[buildingWidth + 1.2, 0.35, 0.42]} />
      </mesh>
      {/* Burgundy metal drip edge (+14.35 to +14.45 m) */}
      <mesh position={[0, wallHeight + 0.05, sign * 0.22]} material={pipeMat} castShadow>
        <boxGeometry args={[buildingWidth + 1.26, 0.1, 0.48]} />
      </mesh>
    </group>
  );
}
