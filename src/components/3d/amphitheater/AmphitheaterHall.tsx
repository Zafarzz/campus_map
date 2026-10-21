import { useMemo } from 'react';
import * as THREE from 'three';
import { AMPHITHEATER_HALL } from '../../../data/amphitheater-hall';
import {
  getAmphitheaterFloorLogoTexture,
  getAmphitheaterScreenTexture,
  getBookshelfTexture,
  getGrilyatoTexture,
  getParquetFloorTexture,
  getSlateRoofTexture,
} from './amphitheaterTextures';

/**
 * Creates a 4-pitched hip roof geometry for the Amphitheater Hall,
 * matching the red pitched roofs ("шифер") of Block B and Block A.
 */
function createAmphitheaterHipRoofGeometry(
  width: number,
  depth: number,
  height: number,
): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  const hw = width / 2;
  const hd = depth / 2;
  const ridgeLen = Math.max(0, width - depth * 0.7);
  const hr = ridgeLen / 2;

  const positions: number[] = [
    // South face (Z > 0)
    -hw, 0, hd,   hw, 0, hd,   hr, height, 0,
    -hw, 0, hd,   hr, height, 0,  -hr, height, 0,

    // North face (Z < 0)
    hw, 0, -hd,  -hw, 0, -hd,  -hr, height, 0,
    hw, 0, -hd,  -hr, height, 0,   hr, height, 0,

    // West hip (X < 0)
    -hw, 0, -hd, -hw, 0, hd,   -hr, height, 0,

    // East hip (X > 0)
    hw, 0, hd,    hw, 0, -hd,   hr, height, 0,
  ];

  const uvs: number[] = [
    // South
    0, 0,  1, 0,  0.8, 1,
    0, 0,  0.8, 1, 0.2, 1,
    // North
    0, 0,  1, 0,  0.8, 1,
    0, 0,  0.8, 1, 0.2, 1,
    // West
    0, 0,  1, 0,  0.5, 1,
    // East
    0, 0,  1, 0,  0.5, 1,
  ];

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Creates an 8-point 2D octagon polygon contour centered at (0, 0).
 * rx = half-dimension X, ry = half-dimension Y, ch = corner 45° chamfer distance.
 */
function createOctagonShape(rx: number, ry: number, ch: number): THREE.Shape {
  const shape = new THREE.Shape();
  if (ch <= 0.001) {
    // Regular rectangle
    shape.moveTo(-rx, ry);
    shape.lineTo(rx, ry);
    shape.lineTo(rx, -ry);
    shape.lineTo(-rx, -ry);
    shape.closePath();
    return shape;
  }
  const pts = [
    [-rx + ch, ry],
    [rx - ch, ry],
    [rx, ry - ch],
    [rx, -ry + ch],
    [rx - ch, -ry],
    [-rx + ch, -ry],
    [-rx, -ry + ch],
    [-rx, ry - ch],
  ];
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    shape.lineTo(pts[i][0], pts[i][1]);
  }
  shape.closePath();
  return shape;
}

/**
 * Creates a tier ring geometry between an inner octagon and an outer octagon/polygon.
 */
function createTierRingGeometry(
  outerRx: number,
  outerRy: number,
  outerCh: number,
  innerRx: number,
  innerRy: number,
  innerCh: number,
  height: number,
): THREE.BufferGeometry {
  const shape = createOctagonShape(outerRx, outerRy, outerCh);
  const hole = createOctagonShape(innerRx, innerRy, innerCh);
  shape.holes.push(hole);

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
  });
  // ExtrudeGeometry extrudes along +Z. Rotate so flat faces are in XZ plane and extrusion is in +Y.
  geom.rotateX(Math.PI / 2);
  return geom;
}

/**
 * Staircase flight with 6 steps ascending from 0.00 to 1.35m.
 */
function StaircaseFlight({
  width,
  depth,
  steps,
  rotationY = 0,
  position,
}: {
  width: number;
  depth: number;
  steps: number;
  rotationY?: number;
  position: [number, number, number];
}) {
  const stepRise = 1.35 / steps;
  const stepTread = depth / steps;

  const matDark = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.8 }),
    [],
  );
  const matNosing = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.4 }),
    [],
  );

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {Array.from({ length: steps }, (_, i) => {
        const stepH = (i + 1) * stepRise;
        const zPos = -depth / 2 + (i + 0.5) * stepTread;
        return (
          <group key={`step-${i}`}>
            {/* Step solid riser and tread block */}
            <mesh position={[0, stepH / 2, zPos]} material={matDark} castShadow receiveShadow>
              <boxGeometry args={[width, stepH, stepTread]} />
            </mesh>
            {/* Contrasting safety nosing edge */}
            <mesh position={[0, stepH - 0.015, zPos + stepTread / 2 - 0.03]} material={matNosing}>
              <boxGeometry args={[width - 0.04, 0.03, 0.06]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/**
 * 3D Architectural Model of «Зал амфитеатра» (Amphitheater Hall).
 * Built exactly to the CAD drawings and specifications in ADR-029,
 * calibrated to the user's 2D editor contour: Center [50.5, 76.5], Size 20m × 17m.
 */
export function AmphitheaterHall({
  selected = false,
  onSelect,
}: {
  selected?: boolean;
  onSelect?: () => void;
}) {
  const spec = AMPHITHEATER_HALL;
  const [worldCenterX, worldCenterZ] = spec.center;

  // Textures
  const floorLogoTex = useMemo(() => getAmphitheaterFloorLogoTexture(), []);
  const parquetTex = useMemo(() => getParquetFloorTexture(), []);
  const screenTex = useMemo(() => getAmphitheaterScreenTexture(), []);
  const bookshelfTex = useMemo(() => getBookshelfTexture(), []);
  const grilyatoTex = useMemo(() => getGrilyatoTexture(), []);

  // Shared Materials
  const wallMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#eae3d2', // Warm travertine / limestone
        roughness: 0.85,
        metalness: 0.05,
      }),
    [],
  );

  const plinthMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#1e293b', // Dark architectural slate plinth
        roughness: 0.8,
        metalness: 0.2,
      }),
    [],
  );

  const tierMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#2d3748',
        roughness: 0.75,
      }),
    [],
  );

  const woodMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#78350f',
        roughness: 0.65,
      }),
    [],
  );

  const darkWoodMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#381c0d',
        roughness: 0.7,
      }),
    [],
  );

  const glassMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#93c5fd',
        roughness: 0.1,
        metalness: 0.1,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
      }),
    [],
  );

  const darkGlazeMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.15,
        metalness: 0.3,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      }),
    [],
  );

  const metalFrameMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.5,
        metalness: 0.6,
      }),
    [],
  );

  const goldAccentMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#d97706',
        roughness: 0.3,
        metalness: 0.7,
      }),
    [],
  );

  const screenMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: screenTex ?? undefined,
      color: screenTex ? '#ffffff' : '#030712',
      roughness: 0.2,
      metalness: 0.1,
      emissive: '#1e293b',
      emissiveIntensity: 0.4,
    });
  }, [screenTex]);

  const bookshelfMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: bookshelfTex ?? undefined,
      color: bookshelfTex ? '#ffffff' : '#3d2010',
      roughness: 0.7,
    });
  }, [bookshelfTex]);

  const floorLogoMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: floorLogoTex ?? undefined,
      color: floorLogoTex ? '#ffffff' : '#1d4ed8',
      roughness: 0.4,
      metalness: 0.2,
    });
  }, [floorLogoTex]);

  const parquetMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: parquetTex ?? undefined,
      color: parquetTex ? '#ffffff' : '#d7cbb5',
      roughness: 0.5,
    });
  }, [parquetTex]);

  const grilyatoMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: grilyatoTex ?? undefined,
      color: grilyatoTex ? '#ffffff' : '#090d16',
      roughness: 0.9,
      metalness: 0.3,
    });
  }, [grilyatoTex]);

  const redCushionMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.7 }),
    [],
  );

  const blueCushionMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.7 }),
    [],
  );

  const whiteColMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.35 }),
    [],
  );

  const slateRoofTex = useMemo(() => getSlateRoofTexture(), []);

  const roofMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: slateRoofTex ?? undefined,
        color: slateRoofTex ? '#ffffff' : '#991b1b',
        roughness: 0.65,
        metalness: 0.2,
      }),
    [slateRoofTex],
  );

  const fasciaMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#f1e6cf',
        roughness: 0.7,
      }),
    [],
  );

  const hipRoofGeo = useMemo(() => {
    return createAmphitheaterHipRoofGeometry(20.4, 17.4, 3.4);
  }, []);

  // Octagonal Sunken Floor Bowl (elevation 0.00m)
  const floorBowlGeo = useMemo(() => {
    const shape = createOctagonShape(spec.floor.bowl.rx, spec.floor.bowl.ry, spec.floor.bowl.chamfer);
    const geom = new THREE.ShapeGeometry(shape);
    geom.rotateX(Math.PI / 2); // Lay flat on XZ plane
    return geom;
  }, [spec.floor.bowl]);

  // Tier geometries
  const tier1Geo = useMemo(() => {
    const t = spec.tiers[0];
    return createTierRingGeometry(
      t.outer.rx,
      t.outer.ry,
      t.outer.chamfer,
      t.inner.rx,
      t.inner.ry,
      t.inner.chamfer,
      t.top,
    );
  }, [spec.tiers]);

  const tier2Geo = useMemo(() => {
    const t = spec.tiers[1];
    return createTierRingGeometry(
      t.outer.rx,
      t.outer.ry,
      t.outer.chamfer,
      t.inner.rx,
      t.inner.ry,
      t.inner.chamfer,
      t.top,
    );
  }, [spec.tiers]);

  const tier3Geo = useMemo(() => {
    const t = spec.tiers[2];
    return createTierRingGeometry(
      t.outer.rx,
      t.outer.ry,
      t.outer.chamfer,
      t.inner.rx,
      t.inner.ry,
      t.inner.chamfer,
      t.top,
    );
  }, [spec.tiers]);

  return (
    <group
      name="amphitheater-hall"
      position={[worldCenterX, 0, worldCenterZ]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
    >
      {/* =========================================================================
          1. FOUNDATION, SUNKEN BOWL & FLOOR LOGO
          ========================================================================= */}
      {/* Base subterranean slab */}
      <mesh position={[0, -0.15, 0]} material={plinthMat} receiveShadow>
        <boxGeometry args={[22, 0.3, 19]} />
      </mesh>

      {/* Sunken Octagonal Parquet Laminate Floor (elevation 0.001 to prevent z-fighting) */}
      <mesh position={[0, 0.002, 0]} geometry={floorBowlGeo} material={parquetMat} receiveShadow />

      {/* Circular Emblem In Floor: Ø 3.20m */}
      <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} material={floorLogoMat} receiveShadow>
        <circleGeometry args={[spec.floor.logoDiameter / 2, 48]} />
      </mesh>

      {/* =========================================================================
          2. AMPHITHEATER TIERS (3 STEPS: +0.45, +0.90, +1.35)
          ========================================================================= */}
      {/* Tier 1 (+0.45m) */}
      <mesh position={[0, 0, 0]} geometry={tier1Geo} material={tierMat} receiveShadow castShadow />

      {/* Tier 2 (+0.90m) */}
      <mesh position={[0, 0, 0]} geometry={tier2Geo} material={tierMat} receiveShadow castShadow />

      {/* Tier 3 (+1.35m) */}
      <mesh position={[0, 0, 0]} geometry={tier3Geo} material={tierMat} receiveShadow castShadow />

      {/* =========================================================================
          3. CUSHIONS ON TIERS 1 & 2
          East = Red, West = Blue, South = Blue
          ========================================================================= */}
      {/* East cushions (Red) */}
      {spec.cushions.alongY.map((y, idx) => (
        <group key={`cush-e-${idx}`}>
          {/* Tier 1 East (rx = 8.0m, Z = +0.45m) */}
          <mesh position={[8.0, 0.49, -y]} material={redCushionMat} castShadow>
            <cylinderGeometry args={[spec.cushions.radius, spec.cushions.radius, 0.08, 16]} />
          </mesh>
          {/* Tier 2 East (rx = 8.8m, Z = +0.90m) */}
          <mesh position={[8.8, 0.94, -y]} material={redCushionMat} castShadow>
            <cylinderGeometry args={[spec.cushions.radius, spec.cushions.radius, 0.08, 16]} />
          </mesh>
        </group>
      ))}

      {/* West cushions (Blue) */}
      {spec.cushions.alongY.map((y, idx) => (
        <group key={`cush-w-${idx}`}>
          {/* Tier 1 West (rx = -8.0m, Z = +0.45m) */}
          <mesh position={[-8.0, 0.49, -y]} material={blueCushionMat} castShadow>
            <cylinderGeometry args={[spec.cushions.radius, spec.cushions.radius, 0.08, 16]} />
          </mesh>
          {/* Tier 2 West (rx = -8.8m, Z = +0.90m) */}
          <mesh position={[-8.8, 0.94, -y]} material={blueCushionMat} castShadow>
            <cylinderGeometry args={[spec.cushions.radius, spec.cushions.radius, 0.08, 16]} />
          </mesh>
        </group>
      ))}

      {/* South cushions (Blue) */}
      {spec.cushions.alongX.map((x, idx) => (
        <group key={`cush-s-${idx}`}>
          {/* Tier 1 South (ry = 6.9m, localZ = +6.9m) */}
          <mesh position={[x, 0.49, 6.9]} material={blueCushionMat} castShadow>
            <cylinderGeometry args={[spec.cushions.radius, spec.cushions.radius, 0.08, 16]} />
          </mesh>
          {/* Tier 2 South (ry = 7.7m, localZ = +7.7m) */}
          <mesh position={[x, 0.94, 7.7]} material={blueCushionMat} castShadow>
            <cylinderGeometry args={[spec.cushions.radius, spec.cushions.radius, 0.08, 16]} />
          </mesh>
        </group>
      ))}

      {/* =========================================================================
          4. 3 CENTRAL STAIRCASES (EAST, WEST, SOUTH)
          Width 2.80m, depth 2.40m, 6 steps
          ========================================================================= */}
      {/* East Staircase (ascends towards East / +X: from 7.6 to 10.0m) */}
      <StaircaseFlight
        width={spec.stairs.width}
        depth={spec.stairs.depth}
        steps={spec.stairs.steps}
        rotationY={-Math.PI / 2}
        position={[8.8, 0, 0]}
      />

      {/* West Staircase (ascends towards West / -X: from -7.6 to -10.0m) */}
      <StaircaseFlight
        width={spec.stairs.width}
        depth={spec.stairs.depth}
        steps={spec.stairs.steps}
        rotationY={Math.PI / 2}
        position={[-8.8, 0, 0]}
      />

      {/* South Staircase (ascends towards South / +Z: from 6.1 to 8.5m) */}
      <StaircaseFlight
        width={spec.stairs.width}
        depth={spec.stairs.depth}
        steps={spec.stairs.steps}
        rotationY={Math.PI}
        position={[0, 0, 7.3]}
      />

      {/* =========================================================================
          5. NORTH WALL (WALL 1 — STAGE, SCREEN & BOOKSHELVES)
          Stage: X -3.2..3.2, localZ: -8.5..-6.1
          ========================================================================= */}
      {/* Stage Hardwood Podium (6.40m x 2.40m, H=+1.35m) */}
      <mesh position={[0, 1.35 / 2, -7.3]} material={woodMat} receiveShadow castShadow>
        <boxGeometry args={[6.4, 1.35, 2.4]} />
      </mesh>

      {/* Stage Front Railing (H=0.85m, along localZ = -6.1) */}
      <group position={[0, 1.35, -6.1]}>
        {/* Top rail */}
        <mesh position={[0, 0.85, 0]} material={metalFrameMat}>
          <boxGeometry args={[6.0, 0.04, 0.04]} />
        </mesh>
        {/* Mid safety bar */}
        <mesh position={[0, 0.45, 0]} material={metalFrameMat}>
          <boxGeometry args={[6.0, 0.02, 0.02]} />
        </mesh>
        {/* 6 vertical posts */}
        {[-2.8, -1.7, -0.6, 0.6, 1.7, 2.8].map((rx) => (
          <mesh key={`post-${rx}`} position={[rx, 0.425, 0]} material={metalFrameMat}>
            <boxGeometry args={[0.04, 0.85, 0.04]} />
          </mesh>
        ))}
      </group>

      {/* 2 Stage Corner Speakers */}
      {[-2.575, 2.575].map((sx) => (
        <group key={`spk-${sx}`} position={[sx, 1.35 + 0.35, -6.6]}>
          <mesh material={metalFrameMat} castShadow>
            <boxGeometry args={[0.45, 0.7, 0.45]} />
          </mesh>
          {/* Cyan acoustic trim */}
          <mesh position={[0, 0, 0.23]} material={goldAccentMat}>
            <boxGeometry args={[0.4, 0.65, 0.02]} />
          </mesh>
        </group>
      ))}

      {/* North Wall Backplane (X: -10..10, localZ = -8.4, Z: 0..7.20m) */}
      <mesh position={[0, 3.6, -8.4]} material={wallMat} receiveShadow>
        <boxGeometry args={[20, 7.2, 0.2]} />
      </mesh>

      {/* Giant LED Screen (6.40m x 3.50m, Z: 2.60..6.10, localZ = -8.25) */}
      <mesh position={[0, (2.6 + 6.1) / 2, -8.25]} material={screenMat}>
        <boxGeometry args={[6.4, 3.5, 0.1]} />
      </mesh>
      {/* LED Screen Framing */}
      <mesh position={[0, (2.6 + 6.1) / 2, -8.27]} material={metalFrameMat}>
        <boxGeometry args={[6.55, 3.65, 0.08]} />
      </mesh>

      {/* Wood Pilasters on screen sides */}
      {[-3.35, 3.35].map((px) => (
        <mesh key={`pilaster-${px}`} position={[px, 4.225, -8.22]} material={darkWoodMat}>
          <boxGeometry args={[0.3, 5.75, 0.18]} />
        </mesh>
      ))}

      {/* Left Bookshelves (X: -9.6..-3.5, W=6.1m, Z: 1.35..7.10) */}
      <group position={[(-9.6 - 3.5) / 2, 0, -8.2]}>
        {/* Lower wainscot panel (Z: 1.35..2.30) */}
        <mesh position={[0, (1.35 + 2.3) / 2, 0]} material={woodMat}>
          <boxGeometry args={[6.1, 0.95, 0.35]} />
        </mesh>
        {/* Bookshelf body with texture (Z: 2.30..7.10) */}
        <mesh position={[0, (2.3 + 7.1) / 2, 0]} material={bookshelfMat} receiveShadow>
          <boxGeometry args={[6.1, 4.8, 0.35]} />
        </mesh>
      </group>

      {/* Right Bookshelves (X: 3.5..9.6, W=6.1m, Z: 1.35..7.10) */}
      <group position={[(3.5 + 9.6) / 2, 0, -8.2]}>
        {/* Lower wainscot panel (Z: 1.35..2.30) */}
        <mesh position={[0, (1.35 + 2.3) / 2, 0]} material={woodMat}>
          <boxGeometry args={[6.1, 0.95, 0.35]} />
        </mesh>
        {/* Bookshelf body with texture (Z: 2.30..7.10) */}
        <mesh position={[0, (2.3 + 7.1) / 2, 0]} material={bookshelfMat} receiveShadow>
          <boxGeometry args={[6.1, 4.8, 0.35]} />
        </mesh>
      </group>

      {/* Upper 2 rows of bookshelves above LED screen (X: -3.2..3.2, Z: 6.20..7.10) */}
      <mesh position={[0, (6.2 + 7.1) / 2, -8.2]} material={bookshelfMat}>
        <boxGeometry args={[6.4, 0.9, 0.35]} />
      </mesh>

      {/* =========================================================================
          6. EAST WALL (WALL 2 — ENTRANCE, 4 COLUMNS & 2ND FLOOR BALCONY)
          X = +10.0m. Extends with Gallery Annex up to X = +12.2m (W=12.0m along Z)
          ========================================================================= */}
      {/* 4 White Columns on Tier 1 (section 0.6x0.6m, Z: 1.35..4.50m) */}
      {spec.east.columns.at.map((y) => (
        <group key={`col-e-${y}`}>
          {/* Lower white square column */}
          <mesh position={[9.7, (1.35 + 4.5) / 2, -y]} material={whiteColMat} castShadow>
            <boxGeometry args={[0.6, 3.15, 0.6]} />
          </mesh>
          {/* Black curtain drape behind column */}
          <mesh position={[9.9, (1.35 + 4.5) / 2, -y - 0.4]} material={metalFrameMat}>
            <boxGeometry args={[0.15, 3.15, 0.6]} />
          </mesh>
          {/* Upper 2nd floor wooden pillar (Z: 4.85..7.20m) */}
          <mesh position={[9.75, (4.85 + 7.2) / 2, -y]} material={darkWoodMat} castShadow>
            <boxGeometry args={[0.5, 2.35, 0.5]} />
          </mesh>
        </group>
      ))}

      {/* Mezzanine Balcony Beam across Y: -6.0..6.0 (Z: 4.50..4.85) */}
      <mesh position={[9.75, (4.5 + 4.85) / 2, 0]} material={woodMat} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.35, 12.0]} />
      </mesh>

      {/* Mezzanine Glass Railing (Z: 4.85..5.85, H=1.00m) */}
      <mesh position={[9.65, (4.85 + 5.85) / 2, 0]} material={glassMat}>
        <boxGeometry args={[0.04, 1.0, 12.0]} />
      </mesh>
      {/* Mezzanine Handrail top bar */}
      <mesh position={[9.65, 5.85, 0]} material={metalFrameMat}>
        <boxGeometry args={[0.08, 0.05, 12.0]} />
      </mesh>

      {/* East Corner Bookshelf Towers (Y: -8.5..-6.0 and 6.0..8.5, Z: 1.35..7.20) */}
      {[-7.2, 7.2].map((by) => (
        <mesh key={`bk-e-${by}`} position={[9.7, (1.35 + 7.2) / 2, -by]} material={bookshelfMat}>
          <boxGeometry args={[0.4, 5.85, 2.5]} />
        </mesh>
      ))}

      {/* East Gallery Annex Structure (X: 10.0..11.15m, Y: -6.0..6.0m) */}
      <group position={[10.575, 0, 0]}>
        {/* Annex ground slab (Z: 1.35) */}
        <mesh position={[0, 1.35 / 2, 0]} material={plinthMat}>
          <boxGeometry args={[1.15, 1.35, 12.0]} />
        </mesh>
        {/* Annex 2nd-floor mezzanine slab (Z: 4.65m) */}
        <mesh position={[0, 4.65, 0]} material={woodMat}>
          <boxGeometry args={[1.15, 0.25, 12.0]} />
        </mesh>
        {/* Annex ceiling / roof (Z: 7.20m) */}
        <mesh position={[0, 7.2, 0]} material={darkWoodMat}>
          <boxGeometry args={[1.15, 0.3, 12.0]} />
        </mesh>
        {/* Outer East Glazed Wall with Main Entrance Portal (at X = 11.15m) */}
        <mesh position={[1.15 / 2, (1.35 + 7.2) / 2, 0]} material={darkGlazeMat}>
          <boxGeometry args={[0.08, 5.85, 12.0]} />
        </mesh>
        {/* Glass Entrance Portal Frame (2.60m x 2.85m, Z: 1.35..4.20m) */}
        <mesh position={[1.15 / 2 + 0.02, (1.35 + 4.2) / 2, 0]} material={glassMat}>
          <boxGeometry args={[0.1, 2.85, 2.6]} />
        </mesh>
        {/* Entrance Portal Frame Border */}
        <mesh position={[1.15 / 2 + 0.04, (1.35 + 4.2) / 2, 0]} material={metalFrameMat}>
          <boxGeometry args={[0.12, 2.95, 2.75]} />
        </mesh>
      </group>

      {/* =========================================================================
          7. WEST WALL (WALL 3 — PANORAMIC CURTAIN WALL GLAZING)
          X = -10.0m. Window: Y -6.0..6.0 (W=12.0m), Z: 1.35..7.20 (H=5.85m)
          ========================================================================= */}
      {/* West Panoramic Curtain Wall Glazing Pane */}
      <mesh position={[-9.95, (1.35 + 7.2) / 2, 0]} material={glassMat}>
        <boxGeometry args={[0.06, 5.85, 12.0]} />
      </mesh>

      {/* 7 Vertical Mullions (6 bays of 2.00m) */}
      {Array.from({ length: 7 }, (_, i) => -6.0 + i * 2.0).map((wy) => (
        <mesh key={`mull-w-${wy}`} position={[-9.95, (1.35 + 7.2) / 2, -wy]} material={metalFrameMat}>
          <boxGeometry args={[0.12, 5.85, 0.08]} />
        </mesh>
      ))}

      {/* Horizontal Transoms at Z = 2.10m and Z = 5.40m */}
      <mesh position={[-9.95, 2.1, 0]} material={metalFrameMat}>
        <boxGeometry args={[0.1, 0.08, 12.0]} />
      </mesh>
      <mesh position={[-9.95, 5.4, 0]} material={metalFrameMat}>
        <boxGeometry args={[0.1, 0.08, 12.0]} />
      </mesh>

      {/* 4 White Floor Radiators/Convectors along bottom of window */}
      {spec.west.radiators.at.map((ry) => (
        <mesh key={`rad-${ry}`} position={[-9.78, (1.35 + 1.9) / 2, -ry]} material={whiteColMat}>
          <boxGeometry args={[0.18, 0.55, spec.west.radiators.width]} />
        </mesh>
      ))}

      {/* West Corner Bookshelf Towers (Y: -8.5..-6.0 and 6.0..8.5, Z: 1.35..7.20) */}
      {[-7.2, 7.2].map((by) => (
        <mesh key={`bk-w-${by}`} position={[-9.7, (1.35 + 7.2) / 2, -by]} material={bookshelfMat}>
          <boxGeometry args={[0.4, 5.85, 2.5]} />
        </mesh>
      ))}

      {/* =========================================================================
          8. SOUTH WALL (WALL 4 — OPEN COLONNADE, STEEL TRUSS & LOUNGE)
          localZ = +8.5m. Opening: X -7.0..7.0
          ========================================================================= */}
      {/* 4 Full-height Wooden Pillars (section 0.5x0.5m, Z: 1.35..7.20m) */}
      {spec.south.pillars.at.map((px) => (
        <mesh key={`pil-s-${px}`} position={[px, (1.35 + 7.2) / 2, 8.25]} material={woodMat} castShadow>
          <boxGeometry args={[0.5, 5.85, 0.5]} />
        </mesh>
      ))}

      {/* Exposed Steel Truss Beam across X: -7.0..7.0 at Z: 4.40..4.95m */}
      <mesh position={[0, (4.4 + 4.95) / 2, 8.3]} material={metalFrameMat}>
        <boxGeometry args={[14.0, 0.55, 0.25]} />
      </mesh>
      {/* Steel Truss lattice diagonal web */}
      {Array.from({ length: 20 }, (_, i) => -6.65 + i * 0.7).map((tx) => (
        <mesh key={`diag-${tx}`} position={[tx, 4.675, 8.35]} rotation={[0, 0, Math.PI / 4]} material={metalFrameMat}>
          <boxGeometry args={[0.65, 0.04, 0.04]} />
        </mesh>
      ))}

      {/* Suspended Theater Drapes next to columns */}
      {spec.south.drapes.map((dx) => (
        <mesh key={`drape-${dx}`} position={[dx, (1.35 + 4.4) / 2, 8.15]} material={metalFrameMat}>
          <boxGeometry args={[0.8, 3.05, 0.15]} />
        </mesh>
      ))}

      {/* Glass Railing between pillars (Z: 1.35..2.25m, H=0.90m) */}
      <mesh position={[0, (1.35 + 2.25) / 2, 8.1]} material={glassMat}>
        <boxGeometry args={[14.0, 0.9, 0.04]} />
      </mesh>

      {/* South Corner Bookshelf Towers (X: -10..-7.0 and 7.0..10) */}
      {[-8.5, 8.5].map((bx) => (
        <mesh key={`bk-s-${bx}`} position={[bx, (1.35 + 7.2) / 2, 8.2]} material={bookshelfMat}>
          <boxGeometry args={[3.0, 5.85, 0.4]} />
        </mesh>
      ))}

      {/* =========================================================================
          9. CEILING & LIGHTING (REFLECTED CEILING PLAN)
          Sloped perimeter soffit: +7.20 -> +8.50m (width 2.0m)
          Recessed Grilyato field: 16x13m at +8.50m
          Matrix of 5x5 LED panels
          ========================================================================= */}
      {/* Sloped Perimeter Timber Soffit (North, South, East, West) */}
      {/* North soffit band (Z: 7.2..8.5, localZ: -7.5) */}
      <mesh position={[0, 7.85, -7.5]} rotation={[Math.atan2(1.3, 2.0), 0, 0]} material={darkWoodMat}>
        <boxGeometry args={[20.0, 0.15, 2.38]} />
      </mesh>
      {/* South soffit band (Z: 7.2..8.5, localZ: +7.5) */}
      <mesh position={[0, 7.85, 7.5]} rotation={[-Math.atan2(1.3, 2.0), 0, 0]} material={darkWoodMat}>
        <boxGeometry args={[20.0, 0.15, 2.38]} />
      </mesh>
      {/* West soffit band (Z: 7.2..8.5, localX: -9.0) */}
      <mesh position={[-9.0, 7.85, 0]} rotation={[0, 0, -Math.atan2(1.3, 2.0)]} material={darkWoodMat}>
        <boxGeometry args={[2.38, 0.15, 17.0]} />
      </mesh>
      {/* East soffit band (Z: 7.2..8.5, localX: +9.0) */}
      <mesh position={[9.0, 7.85, 0]} rotation={[0, 0, Math.atan2(1.3, 2.0)]} material={darkWoodMat}>
        <boxGeometry args={[2.38, 0.15, 17.0]} />
      </mesh>

      {/* 4 Linear LED strips embedded in soffit */}
      {spec.ceiling.linearLedCenters.map((c) => (
        <group key={`led-strip-${c}`}>
          {/* North linear LED */}
          <mesh position={[c, 7.85, -7.5]}>
            <boxGeometry args={[spec.ceiling.linearLedLength, 0.04, 0.08]} />
            <meshStandardMaterial color="#fef08a" emissive="#fef08a" emissiveIntensity={0.8} />
          </mesh>
          {/* South linear LED */}
          <mesh position={[c, 7.85, 7.5]}>
            <boxGeometry args={[spec.ceiling.linearLedLength, 0.04, 0.08]} />
            <meshStandardMaterial color="#fef08a" emissive="#fef08a" emissiveIntensity={0.8} />
          </mesh>
          {/* West linear LED */}
          <mesh position={[-9.0, 7.85, c * 0.75]}>
            <boxGeometry args={[0.08, 0.04, spec.ceiling.linearLedLength * 0.75]} />
            <meshStandardMaterial color="#fef08a" emissive="#fef08a" emissiveIntensity={0.8} />
          </mesh>
          {/* East linear LED */}
          <mesh position={[9.0, 7.85, c * 0.75]}>
            <boxGeometry args={[0.08, 0.04, spec.ceiling.linearLedLength * 0.75]} />
            <meshStandardMaterial color="#fef08a" emissive="#fef08a" emissiveIntensity={0.8} />
          </mesh>
        </group>
      ))}

      {/* Recessed Central Grilyato Ceiling Field (16.0m x 13.0m at Z = +8.50m) */}
      <mesh position={[0, 8.5, 0]} rotation={[-Math.PI / 2, 0, 0]} material={grilyatoMat}>
        <planeGeometry args={[16.0, 13.0]} />
      </mesh>

      {/* 5x5 Matrix of Square Recessed LED Panels (60x60 cm) */}
      {spec.ceiling.ledCoordsX.map((lx) =>
        spec.ceiling.ledCoordsY.map((ly) => (
          <group key={`led-panel-${lx}-${ly}`} position={[lx, 8.52, -ly]}>
            {/* Outer Cyan Framing (70x70 cm) */}
            <mesh position={[0, -0.01, 0]}>
              <boxGeometry args={[0.7, 0.02, 0.7]} />
              <meshStandardMaterial color="#38bdf8" />
            </mesh>
            {/* White Diffuser Light Surface (60x60 cm) */}
            <mesh position={[0, -0.02, 0]}>
              <boxGeometry args={[0.6, 0.02, 0.6]} />
              <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.2} />
            </mesh>
          </group>
        )),
      )}

      {/* =========================================================================
          10. EXTERIOR ENCLOSURE & CORRUGATED SLATE HIP ROOF ("ШИФЕР")
          Red corrugated slate / metal profile hip roof matching Block B and Block A.
          When selected in orbit camera, fades to reveal the interior amphitheater.
          ========================================================================= */}
      {/* Perimeter Parapet & Roof Slab (+8.90..+9.70m) */}
      {/* North parapet */}
      <mesh position={[0, (8.9 + 9.7) / 2, -8.55]} material={wallMat} castShadow>
        <boxGeometry args={[20.5, 0.8, 0.35]} />
      </mesh>
      {/* South parapet */}
      <mesh position={[0, (8.9 + 9.7) / 2, 8.55]} material={wallMat} castShadow>
        <boxGeometry args={[20.5, 0.8, 0.35]} />
      </mesh>
      {/* West parapet */}
      <mesh position={[-10.05, (8.9 + 9.7) / 2, 0]} material={wallMat} castShadow>
        <boxGeometry args={[0.35, 0.8, 17.5]} />
      </mesh>
      {/* East parapet (including gallery extension) */}
      <mesh position={[11.20, (8.9 + 9.7) / 2, 0]} material={wallMat} castShadow>
        <boxGeometry args={[0.35, 0.8, 12.4]} />
      </mesh>

      {/* Corrugated Slate Hip Roof ("Крыша из шифера") */}
      {!selected && (
        <group position={[0, 8.9, 0]}>
          {/* Overhanging Fascia & Eaves board */}
          <mesh position={[0, 0.15, 0]} material={fasciaMat} castShadow receiveShadow>
            <boxGeometry args={[20.6, 0.3, 17.6]} />
          </mesh>

          {/* 4-Pitched Hip Roof with Slate ("Шифер") Texture */}
          <mesh position={[0, 0.3, 0]} geometry={hipRoofGeo} material={roofMat} castShadow receiveShadow />

          {/* East Gallery Annex Lean-to Roof Canopy at +7.20m */}
          <mesh position={[10.6, -1.55, 0]} material={roofMat} castShadow receiveShadow>
            <boxGeometry args={[1.25, 0.25, 12.2]} />
          </mesh>

          {/* Central Ridge Cap (Конёк) */}
          <mesh position={[0, 3.72, 0]} material={metalFrameMat}>
            <boxGeometry args={[8.4, 0.08, 0.25]} />
          </mesh>
        </group>
      )}
    </group>
  );
}
