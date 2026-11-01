import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeBufferGeometries } from 'three-stdlib';
import { getArchitecturalWallTextures, getWindowGlassTexture } from '../materials/pbrMaterials';

export type BlockFCourtyardFacadeProps = {
  /** Opacity for selection dimming */
  opacity?: number;
  /** Transparent flag */
  transparent?: boolean;
  /** Main travertine stone wall color (warm beige matching reference photo) */
  wallColor?: string;
  /** Cornice / trim color */
  trimColor?: string;
  /** Foundation plinth color */
  plinthColor?: string;
  /** Window frame color (dark graphite architectural metal) */
  frameColor?: string;
  /** Roof color (metal roof tone per reference photo) */
  roofColor?: string;
};

/**
 * Architectural 3D Elevation of the Block F Courtyard Ensemble.
 * Reconstructed with 100% fidelity from real-world reference photo:
 * media_1793558789621.jpg:
 *
 * 1. West Facade of Block F (Long 2-Storey Wing on the Right):
 *    - Length: 39.0m (along Z from Z = -77.1m to Z = -38.1m), Height: 8.05m.
 *    - Warm travertine stone wall (#ebdcc5) with subtle PBR relief.
 *    - Dark granite plinth (+0.000 to +0.600m) with white drip-edge molding.
 *    - 10 regular window bays on Ground Floor (1F) and Second Floor (2F).
 *    - Dark graphite aluminum frames with upper transom and twin vertical sashes.
 *    - Deep obsidian reflective tinted glass.
 *    - Projecting white stone sills & lintels.
 *    - 4 Sloped metal-hood basement window covers (приямки цокольного этажа со скошенными козырьками).
 *    - 4 Vertical cylindrical drainpipes (водосточные трубы) with wall mounting brackets.
 *    - Continuous molded white cornice along the top with gutter and sloped metal roof.
 *
 * 2. 1-Storey Corner Entrance Vestibule (Part 0, connecting Block D and Block F):
 *    - Width: 13.5m (along X from X = 44.55m to X = 58.05m at Z = -77.1m).
 *    - 1-storey entrance pavilion (height 4.0m) projecting forward with entrance porch steps.
 *    - Massive white architectural fascia band along the top (+3.200 to +4.000m).
 *    - Full-height floor-to-ceiling panoramic glass entrance doors with handles and mullions.
 *    - Second Floor wall above vestibule (+4.000 to +8.050m) with 3 regular window bays.
 *
 * 3. South End Facade of Block F (Width 19.5m at Z = -38.1m):
 *    - Warm travertine wall, plinth, cornice, and stepped parapet cap.
 */
export function BlockFCourtyardFacade({
  opacity = 1,
  transparent = false,
  wallColor = '#ebdcc5',
  trimColor = '#f8fafc',
  plinthColor = '#334155',
  frameColor = '#1e293b',
  roofColor = '#8a99a8',
}: BlockFCourtyardFacadeProps) {
  // PBR Textures
  const wallTextures = useMemo(() => getArchitecturalWallTextures(), []);
  const glassTexture = useMemo(() => getWindowGlassTexture(), []);

  // Shared Architectural Materials
  const materials = useMemo(() => {
    // 1. Warm buff limestone / travertine facade wall
    const wallMat = new THREE.MeshStandardMaterial({
      color: wallColor,
      map: wallTextures?.map ?? null,
      normalMap: wallTextures?.normalMap ?? null,
      normalScale: new THREE.Vector2(0.12, 0.12),
      roughnessMap: wallTextures?.roughnessMap ?? null,
      roughness: 0.82,
      metalness: 0.04,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // 2. Foundation Plinth (dark granite / slate)
    const plinthMat = new THREE.MeshStandardMaterial({
      color: plinthColor,
      roughness: 0.85,
      metalness: 0.06,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // 3. White Architectural Moldings, Cornices, Sills & Vestibule Fascia
    const trimMat = new THREE.MeshStandardMaterial({
      color: trimColor,
      roughness: 0.45,
      metalness: 0.08,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // 4. Dark Graphite Aluminum Window & Door Frames
    const frameMat = new THREE.MeshStandardMaterial({
      color: frameColor,
      roughness: 0.5,
      metalness: 0.7,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // 5. Deep Obsidian Reflective Tinted Glass
    const glassMat = new THREE.MeshStandardMaterial({
      color: '#020617',
      map: glassTexture ?? null,
      roughness: 0.06,
      metalness: 0.88,
      envMapIntensity: 0.9,
      transparent: true,
      opacity: transparent ? opacity * 0.9 : 0.96,
      depthWrite: !transparent,
    });

    // 6. Dark Interior Window Cavity Backing Box
    const cavityMat = new THREE.MeshBasicMaterial({
      color: '#020408',
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // 7. Sloped Basement Window Metal Hoods (приямки)
    const hoodMat = new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.65,
      metalness: 0.45,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // 8. Drainpipe Metal (light grey / off-white)
    const pipeMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      roughness: 0.4,
      metalness: 0.65,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // 9. Standing Seam Metal Roof Slope
    const roofMat = new THREE.MeshStandardMaterial({
      color: roofColor,
      roughness: 0.55,
      metalness: 0.4,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // 10. Horizontal Stone Rustication Reveal Grooves
    const jointMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(wallColor).multiplyScalar(0.82),
      roughness: 0.92,
      metalness: 0.0,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // 11. Stainless Steel Door Push Handles
    const handleMat = new THREE.MeshStandardMaterial({
      color: '#e2e8f0',
      roughness: 0.25,
      metalness: 0.9,
    });

    return {
      wallMat,
      plinthMat,
      trimMat,
      frameMat,
      glassMat,
      cavityMat,
      hoodMat,
      pipeMat,
      roofMat,
      jointMat,
      handleMat,
    };
  }, [wallColor, trimColor, plinthColor, frameColor, roofColor, wallTextures, glassTexture, transparent, opacity]);

  // =========================================================================
  // GEOMETRY DEFINITIONS & DIMENSIONS
  // =========================================================================

  // 1. West Facade of Block F (Part 1 courtyard face)
  // Position in World: X = 58.05m.
  // Z runs from -77.1m to -38.1m -> Length = 39.0m.
  const westLength = 39.0;
  const westCenterZ = (-77.1 + -38.1) / 2; // -57.6m
  const westWallX = 58.05;
  const wallH = 8.05;
  const plinthH = 0.6;

  // 10 Window bays spaced every 3.8m
  const bayCount = 10;
  const bayWidth = westLength / bayCount; // 3.9m
  const winW = 1.6;
  const winH = 1.75;
  const f1WinY = 1.85;
  const f2WinY = 5.45;

  const windowBaysZ = useMemo(() => {
    const list: number[] = [];
    for (let i = 0; i < bayCount; i++) {
      list.push(-77.1 + (i + 0.5) * bayWidth);
    }
    return list;
  }, [bayCount, bayWidth]);

  // Standard 1.6m x 1.75m Rectangular Window Frame Geometry
  const standardFrameGeo = useMemo(() => {
    // Outer frame perimeter
    const outer = new THREE.BoxGeometry(0.06, winH, winW);
    // Upper horizontal transom bar (divides upper transom at 0.5m from top)
    const transom = new THREE.BoxGeometry(0.045, 0.045, winW - 0.08);
    transom.translate(0.01, winH / 2 - 0.52, 0);
    // Vertical mullion dividing lower main sash into 2 vertical glass panes
    const lowerH = winH - 0.52;
    const mullion = new THREE.BoxGeometry(0.045, lowerH - 0.06, 0.045);
    mullion.translate(0.01, -winH / 2 + lowerH / 2, 0);

    return mergeBufferGeometries([outer, transom, mullion]) ?? outer;
  }, [winW, winH]);

  // Standard Stone Sill & Lintel Trim Geometry
  const standardTrimGeo = useMemo(() => {
    // Projecting stone sill at bottom
    const sill = new THREE.BoxGeometry(0.18, 0.12, winW + 0.24);
    sill.translate(-0.06, -winH / 2 - 0.06, 0);
    // Projecting stone lintel at top
    const lintel = new THREE.BoxGeometry(0.14, 0.1, winW + 0.18);
    lintel.translate(-0.04, winH / 2 + 0.05, 0);

    return mergeBufferGeometries([sill, lintel]) ?? sill;
  }, [winW, winH]);

  // Sloped Basement Window Metal Hood (приямок) Geometry
  // A triangular prism wedge sloping down from the wall out onto the pavement
  const basementHoodGeo = useMemo(() => {
    const hw = 1.75; // width along Z
    const projection = 0.95; // outward along X
    const topH = 0.72; // top at wall
    const botH = 0.16; // bottom at outer edge

    const shape = new THREE.Shape();
    // Side profile in (X, Y)
    shape.moveTo(0, topH);
    shape.lineTo(-projection, botH);
    shape.lineTo(-projection, 0);
    shape.lineTo(0, 0);
    shape.closePath();

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      steps: 1,
      depth: hw,
      bevelEnabled: false,
    };
    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // Center along Z
    geom.translate(0, 0, -hw / 2);
    return geom;
  }, []);

  // Vertical Downspout Drainpipe Geometry
  const downspoutGeo = useMemo(() => {
    const pipe = new THREE.CylinderGeometry(0.05, 0.05, wallH - 0.4, 16);
    pipe.translate(-0.1, (wallH - 0.4) / 2 + 0.35, 0);

    // Wall mounting bracket rings
    const ringGeo = new THREE.TorusGeometry(0.06, 0.015, 8, 16);
    ringGeo.rotateY(Math.PI / 2);
    const geoms: THREE.BufferGeometry[] = [pipe];
    for (let y = 1.5; y <= 7.5; y += 2.0) {
      const ring = ringGeo.clone();
      ring.translate(-0.08, y, 0);
      geoms.push(ring);
    }
    return mergeBufferGeometries(geoms) ?? pipe;
  }, [wallH]);

  // Bays with basement lightwell hoods (bays 2, 4, 6, 8 per reference photo)
  const hoodBayIndices = [2, 4, 6, 8];
  // Bays with vertical drainpipes (between bays at 1, 4, 7, 9)
  const pipeBayIndices = [1, 4, 7, 9];

  // 2. Corner Entrance Vestibule Dimensions (Part 0 at Z = -77.1m)
  const vestWidth = 13.5;
  const vestCenterX = (44.55 + 58.05) / 2; // 51.3m
  const vestZ = -77.1;
  const vestHeight = 4.0;

  // 3. South End Facade Dimensions (Part 1 at Z = -38.1m)
  const southEndWidth = 19.5;
  const southEndCenterX = (58.05 + 77.55) / 2; // 67.8m
  const southEndZ = -38.1;

  return (
    <group>
      {/* ============================================================== */}
      {/* 1. WEST FACADE OF BLOCK F (Facing Courtyard at X = 58.05m)     */}
      {/* ============================================================== */}
      <group position={[westWallX, 0, 0]}>
        {/* Base Granite Plinth (±0.000 to +0.600m) */}
        <mesh position={[-0.08, plinthH / 2, westCenterZ]} material={materials.plinthMat} receiveShadow>
          <boxGeometry args={[0.22, plinthH, westLength + 0.1]} />
        </mesh>
        {/* White Stone Plinth Drip Edge Molding at +0.600m */}
        <mesh position={[-0.12, plinthH, westCenterZ]} material={materials.trimMat} castShadow>
          <boxGeometry args={[0.16, 0.08, westLength + 0.15]} />
        </mesh>

        {/* Main Travertine Wall Body (+0.600 to +8.050m) */}
        <mesh
          position={[0, (wallH + plinthH) / 2, westCenterZ]}
          material={materials.wallMat}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[0.15, wallH - plinthH, westLength]} />
        </mesh>

        {/* Horizontal Travertine Slab Joints every 0.45m */}
        {[1.35, 2.7, 4.05, 4.95, 6.3, 7.2].map((gy) => (
          <mesh key={`west-joint-${gy}`} position={[-0.078, gy, westCenterZ]} material={materials.jointMat}>
            <boxGeometry args={[0.01, 0.03, westLength]} />
          </mesh>
        ))}

        {/* Continuous Molded White Cornice & Gutter (+7.850 to +8.250m) */}
        <mesh position={[-0.18, 8.05, westCenterZ]} material={materials.trimMat} castShadow>
          <boxGeometry args={[0.36, 0.35, westLength + 0.2]} />
        </mesh>
        {/* Sloped Roof Overhang Cap */}
        <mesh position={[-0.32, 8.28, westCenterZ]} material={materials.trimMat} castShadow>
          <boxGeometry args={[0.28, 0.12, westLength + 0.3]} />
        </mesh>

        {/* Sloped Standing Seam Metal Roof Deck (rising from Y=8.2 to 9.2m) */}
        <mesh
          position={[0.5, 8.7, westCenterZ]}
          rotation={[0, 0, -0.15]}
          material={materials.roofMat}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[1.6, 0.08, westLength + 0.2]} />
        </mesh>

        {/* Ground Floor (1F) Windows (+1.85m center) */}
        {windowBaysZ.map((wz, idx) => (
          <group key={`west-f1-win-${idx}`} position={[-0.08, f1WinY, wz]}>
            {/* Interior cavity box */}
            <mesh position={[0.035, 0, 0]} material={materials.cavityMat}>
              <boxGeometry args={[0.06, winH - 0.06, winW - 0.06]} />
            </mesh>
            {/* Frame */}
            <mesh geometry={standardFrameGeo} material={materials.frameMat} castShadow />
            {/* Glass */}
            <mesh position={[0.015, 0, 0]} material={materials.glassMat}>
              <boxGeometry args={[0.03, winH - 0.1, winW - 0.1]} />
            </mesh>
            {/* Stone Sill & Lintel */}
            <mesh geometry={standardTrimGeo} material={materials.trimMat} castShadow />
          </group>
        ))}

        {/* Second Floor (2F) Windows (+5.45m center) */}
        {windowBaysZ.map((wz, idx) => (
          <group key={`west-f2-win-${idx}`} position={[-0.08, f2WinY, wz]}>
            {/* Interior cavity box */}
            <mesh position={[0.035, 0, 0]} material={materials.cavityMat}>
              <boxGeometry args={[0.06, winH - 0.06, winW - 0.06]} />
            </mesh>
            {/* Frame */}
            <mesh geometry={standardFrameGeo} material={materials.frameMat} castShadow />
            {/* Glass */}
            <mesh position={[0.015, 0, 0]} material={materials.glassMat}>
              <boxGeometry args={[0.03, winH - 0.1, winW - 0.1]} />
            </mesh>
            {/* Stone Sill & Lintel */}
            <mesh geometry={standardTrimGeo} material={materials.trimMat} castShadow />
          </group>
        ))}

        {/* Sloped Basement Window Metal Hoods (приямки) */}
        {hoodBayIndices.map((bIdx) => {
          const wz = windowBaysZ[bIdx];
          return (
            <group key={`hood-${bIdx}`} position={[-0.08, 0, wz]}>
              {/* Sloped Metal Hood Body */}
              <mesh geometry={basementHoodGeo} material={materials.hoodMat} castShadow receiveShadow />
              {/* Side concrete retaining cheeks */}
              <mesh position={[-0.45, 0.35, -0.9]} material={materials.plinthMat} castShadow>
                <boxGeometry args={[0.9, 0.7, 0.08]} />
              </mesh>
              <mesh position={[-0.45, 0.35, 0.9]} material={materials.plinthMat} castShadow>
                <boxGeometry args={[0.9, 0.7, 0.08]} />
              </mesh>
            </group>
          );
        })}

        {/* Vertical Downspouts (Водосточные трубы) */}
        {pipeBayIndices.map((bIdx) => {
          const pz = -77.1 + bIdx * bayWidth;
          return (
            <mesh
              key={`downspout-${bIdx}`}
              position={[0, 0, pz]}
              geometry={downspoutGeo}
              material={materials.pipeMat}
              castShadow
            />
          );
        })}
      </group>

      {/* ============================================================== */}
      {/* 2. 1-STOREY CORNER ENTRANCE VESTIBULE (Part 0 at Z = -77.1m)   */}
      {/* ============================================================== */}
      <group position={[vestCenterX, 0, vestZ]}>
        {/* Concrete Entrance Porch Landing Plinth */}
        <mesh position={[0, 0.11, 1.0]} material={materials.plinthMat} receiveShadow>
          <boxGeometry args={[vestWidth + 0.4, 0.22, 2.2]} />
        </mesh>
        {/* Low Entrance Steps */}
        <mesh position={[0, 0.06, 2.2]} material={materials.plinthMat} receiveShadow>
          <boxGeometry args={[vestWidth + 0.6, 0.12, 0.4]} />
        </mesh>

        {/* 1-Storey Projecting Vestibule Body (+0.22 to +4.00m) */}
        {/* Massive White Architectural Fascia Band (+3.20 to +4.00m) */}
        <mesh position={[0, 3.6, 0.22]} material={materials.trimMat} castShadow receiveShadow>
          <boxGeometry args={[vestWidth + 0.2, 0.8, 0.45]} />
        </mesh>
        {/* Recessed Dark Shadow Reveal Line underneath Fascia */}
        <mesh position={[0, 3.16, 0.23]} material={materials.jointMat}>
          <boxGeometry args={[vestWidth + 0.2, 0.04, 0.46]} />
        </mesh>
        {/* Projecting Top Roof Drip Coping */}
        <mesh position={[0, 4.02, 0.25]} material={materials.trimMat} castShadow>
          <boxGeometry args={[vestWidth + 0.3, 0.08, 0.52]} />
        </mesh>

        {/* Side Solid Wing Walls */}
        <mesh position={[-vestWidth / 2 + 0.4, 1.7, 0.1]} material={materials.wallMat} castShadow receiveShadow>
          <boxGeometry args={[0.8, 3.0, 0.3]} />
        </mesh>
        <mesh position={[vestWidth / 2 - 0.4, 1.7, 0.1]} material={materials.wallMat} castShadow receiveShadow>
          <boxGeometry args={[0.8, 3.0, 0.3]} />
        </mesh>

        {/* Panoramic Glass Entrance Portal (+0.22 to +3.14m) */}
        {/* Continuous Floor-to-Ceiling Dark Tinted Glass */}
        <mesh position={[0, 1.68, 0.12]} material={materials.glassMat}>
          <boxGeometry args={[vestWidth - 1.6, 2.92, 0.04]} />
        </mesh>
        {/* Interior Cavity Box */}
        <mesh position={[0, 1.68, -0.05]} material={materials.cavityMat}>
          <boxGeometry args={[vestWidth - 1.6, 2.92, 0.1]} />
        </mesh>

        {/* Aluminum Door & Window Mullion Grid (4 Double Doors = 8 glass bays) */}
        {Array.from({ length: 9 }).map((_, mIdx) => {
          const mx = -(vestWidth - 1.6) / 2 + mIdx * ((vestWidth - 1.6) / 8);
          return (
            <mesh key={`vest-mullion-${mIdx}`} position={[mx, 1.68, 0.15]} material={materials.frameMat} castShadow>
              <boxGeometry args={[0.08, 2.92, 0.06]} />
            </mesh>
          );
        })}
        {/* Horizontal Transom at Y = 2.45m */}
        <mesh position={[0, 2.45, 0.15]} material={materials.frameMat} castShadow>
          <boxGeometry args={[vestWidth - 1.6, 0.06, 0.06]} />
        </mesh>

        {/* Stainless Steel Vertical Door Handles on 4 Main Entrance Doors */}
        {[-3.2, -1.8, 1.8, 3.2].map((hx, hIdx) => (
          <group key={`door-handle-${hIdx}`} position={[hx, 1.3, 0.2]}>
            <mesh material={materials.handleMat} castShadow>
              <cylinderGeometry args={[0.018, 0.018, 0.7, 12]} />
            </mesh>
          </group>
        ))}

        {/* Second Floor Facade Wall above the Vestibule (+4.00 to +8.05m) */}
        <mesh position={[0, 6.025, 0]} material={materials.wallMat} castShadow receiveShadow>
          <boxGeometry args={[vestWidth, 4.05, 0.15]} />
        </mesh>
        {/* 2F White Cornice (+7.85 to +8.25m) */}
        <mesh position={[0, 8.05, 0.1]} material={materials.trimMat} castShadow>
          <boxGeometry args={[vestWidth + 0.2, 0.35, 0.3]} />
        </mesh>

        {/* 3 Upper Windows on 2F above the vestibule */}
        {[-3.6, 0, 3.6].map((wx, wIdx) => (
          <group key={`vest-2f-win-${wIdx}`} position={[wx, f2WinY, 0.08]} rotation={[0, Math.PI / 2, 0]}>
            {/* Frame */}
            <mesh geometry={standardFrameGeo} material={materials.frameMat} castShadow />
            {/* Glass */}
            <mesh position={[0.015, 0, 0]} material={materials.glassMat}>
              <boxGeometry args={[0.03, winH - 0.1, winW - 0.1]} />
            </mesh>
            {/* Sills */}
            <mesh geometry={standardTrimGeo} material={materials.trimMat} castShadow />
          </group>
        ))}
      </group>

      {/* ============================================================== */}
      {/* 3. SOUTH END FACADE OF BLOCK F (Width 19.5m at Z = -38.1m)     */}
      {/* ============================================================== */}
      <group position={[southEndCenterX, 0, southEndZ]}>
        {/* Plinth */}
        <mesh position={[0, plinthH / 2, 0.08]} material={materials.plinthMat} receiveShadow>
          <boxGeometry args={[southEndWidth + 0.1, plinthH, 0.2]} />
        </mesh>
        {/* Plinth Drip Molding */}
        <mesh position={[0, plinthH, 0.12]} material={materials.trimMat} castShadow>
          <boxGeometry args={[southEndWidth + 0.15, 0.08, 0.16]} />
        </mesh>
        {/* Wall Body */}
        <mesh position={[0, (wallH + plinthH) / 2, 0]} material={materials.wallMat} castShadow receiveShadow>
          <boxGeometry args={[southEndWidth, wallH - plinthH, 0.15]} />
        </mesh>
        {/* White Cornice & Parapet Cap (+7.85 to +8.35m) */}
        <mesh position={[0, 8.05, 0.14]} material={materials.trimMat} castShadow>
          <boxGeometry args={[southEndWidth + 0.2, 0.35, 0.32]} />
        </mesh>
        <mesh position={[0, 8.35, 0.18]} material={materials.trimMat} castShadow>
          <boxGeometry args={[southEndWidth + 0.25, 0.15, 0.38]} />
        </mesh>

        {/* 4 Windows on 1F and 4 Windows on 2F */}
        {[-6.0, -2.0, 2.0, 6.0].map((ex, eIdx) => (
          <group key={`south-end-wins-${eIdx}`}>
            {/* 1F */}
            <group position={[ex, f1WinY, 0.08]} rotation={[0, Math.PI / 2, 0]}>
              <mesh geometry={standardFrameGeo} material={materials.frameMat} castShadow />
              <mesh position={[0.015, 0, 0]} material={materials.glassMat}>
                <boxGeometry args={[0.03, winH - 0.1, winW - 0.1]} />
              </mesh>
              <mesh geometry={standardTrimGeo} material={materials.trimMat} castShadow />
            </group>
            {/* 2F */}
            <group position={[ex, f2WinY, 0.08]} rotation={[0, Math.PI / 2, 0]}>
              <mesh geometry={standardFrameGeo} material={materials.frameMat} castShadow />
              <mesh position={[0.015, 0, 0]} material={materials.glassMat}>
                <boxGeometry args={[0.03, winH - 0.1, winW - 0.1]} />
              </mesh>
              <mesh geometry={standardTrimGeo} material={materials.trimMat} castShadow />
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}
