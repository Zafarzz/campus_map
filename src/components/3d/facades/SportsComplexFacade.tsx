import { useMemo } from 'react';
import * as THREE from 'three';

export type SportsComplexRoofProps = {
  width: number;
  depth: number;
  height?: number;
  color?: string;
  opacity?: number;
  transparent?: boolean;
};

export type SportsComplexFrontFacadeProps = {
  width: number;
  depth: number;
  wallHeight: number;
  opacity?: number;
  transparent?: boolean;
};

/**
 * Creates solid triangular prism roof geometry for one gable span.
 * Extruded along Z (depth) so it is 100% mathematically seamless:
 * zero gaps at ridge, zero gaps at valleys, solid front/rear pediment caps.
 */
function createGableRoofGeometry(
  spanWidth: number,
  peakHeight: number,
  depth: number
): THREE.BufferGeometry {
  const hw = spanWidth / 2;
  const shape = new THREE.Shape();

  // Solid triangle: base from -hw to +hw at Y = 0, peak at (0, peakHeight)
  shape.moveTo(-hw, 0);
  shape.lineTo(0, peakHeight);
  shape.lineTo(hw, 0);
  shape.closePath();

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: depth + 0.4,
    bevelEnabled: false,
  });

  // Center along Z so it spans [-depth/2 - 0.2, depth/2 + 0.2]
  geom.translate(0, 0, -(depth + 0.4) / 2);
  geom.computeVertexNormals();
  return geom;
}

/**
 * 3-Gable Sharp Triangular Pitched Roof (Многощипцовая трехскатная кровля) for Sports Complex.
 * Based on Blueprint: "ФАСАД В ОСЯХ А-В (2D ЧЕРТЕЖ-СХЕМА ПО ФОТОГРАФИИ)".
 *
 * Replaces old 4-barrel vaults with exactly 3 sharp triangular gables ("их трое а не четыре"):
 * - 3 parallel gables of 19.0m width each (total width = 57.0m, depth = 37.5m).
 * - Ridge height reaches +10.500m (gable rise = 6.9m above wall top).
 * - Cladding: dark graphite corrugated metal panels (#22252a, matte architectural finish).
 * - Seamless solid triangular prisms without cracks or Euler rotation inverted signs.
 * - Crisp white rake trim bands (ветровая планка) along the sloping gable edges per drawing.
 */
export function SportsComplexRoof({
  width = 57.0,
  depth = 37.5,
  height = 6.9, // 10.5m ridge height - 3.6m wall height
  color = '#22252a',
  opacity = 1,
  transparent = false,
}: SportsComplexRoofProps) {
  const numGables = 3; // EXACTLY 3 gables ("их трое а не четыре")
  const gableWidth = width / numGables; // 19.0m per gable
  const halfGableW = gableWidth / 2;

  // Slope geometry calculations
  const slopeAngle = Math.atan2(height, halfGableW);
  const slopeLength = Math.hypot(halfGableW, height);

  const materials = useMemo(() => {
    // Dark graphite standing seam metal roofing (#22252a)
    // Low metalness to prevent sky reflection from shifting color to navy blue
    const roofMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      metalness: 0.12,
      transparent,
      opacity,
      side: THREE.DoubleSide,
    });

    // Dark graphite for ridge caps & valley gutters
    const trimMat = new THREE.MeshStandardMaterial({
      color: '#181b20',
      roughness: 0.5,
      metalness: 0.4,
      transparent,
      opacity,
    });

    // Crisp white/light-gray rake trim band (ветровая планка по чертежу)
    const rakeTrimMat = new THREE.MeshStandardMaterial({
      color: '#e2e8f0',
      roughness: 0.7,
      metalness: 0.1,
      transparent,
      opacity,
    });

    // Dark base cornice trim under the roof line
    const corniceMat = new THREE.MeshStandardMaterial({
      color: '#1e2229',
      roughness: 0.75,
      metalness: 0.2,
      transparent,
      opacity,
    });

    return { roofMat, trimMat, rakeTrimMat, corniceMat };
  }, [color, opacity, transparent]);

  // Seamless extruded solid roof geometry for 1 gable
  const gableRoofGeo = useMemo(
    () => createGableRoofGeometry(gableWidth, height, depth),
    [gableWidth, height, depth]
  );

  // Centers of the 3 gables along X
  const gableCentersX = useMemo(() => {
    const list: number[] = [];
    for (let i = 0; i < numGables; i++) {
      list.push(-width / 2 + (i + 0.5) * gableWidth);
    }
    return list;
  }, [width, numGables, gableWidth]);

  return (
    <group position={[0, 0, 0]}>
      {/* Lower horizontal cornice band across entire width */}
      <mesh position={[0, 0.05, 0]} material={materials.corniceMat} receiveShadow>
        <boxGeometry args={[width + 0.3, 0.1, depth + 0.4]} />
      </mesh>

      {/* 3 Parallel Sharp Triangular Gables */}
      {gableCentersX.map((gx, gIdx) => (
        <group key={`gable-${gIdx}`} position={[gx, 0.1, 0]}>
          {/* 1. Seamless Extruded Triangular Roof Prism (Zero gap at ridge, zero gaps at valleys) */}
          <mesh
            geometry={gableRoofGeo}
            material={materials.roofMat}
            castShadow
            receiveShadow
          />

          {/* 2. Top Ridge Cap along Depth */}
          <mesh
            position={[0, height + 0.07, 0]}
            material={materials.trimMat}
            castShadow
          >
            <boxGeometry args={[0.38, 0.14, depth + 0.6]} />
          </mesh>

          {/* 3. Front Eaves Rake Trim (Белые наклонные планки фронтона по чертежу) */}
          <mesh
            position={[-halfGableW / 2, height / 2, -depth / 2 - 0.21]}
            rotation={[0, 0, slopeAngle]}
            material={materials.rakeTrimMat}
          >
            <boxGeometry args={[slopeLength + 0.25, 0.16, 0.08]} />
          </mesh>
          <mesh
            position={[halfGableW / 2, height / 2, -depth / 2 - 0.21]}
            rotation={[0, 0, -slopeAngle]}
            material={materials.rakeTrimMat}
          >
            <boxGeometry args={[slopeLength + 0.25, 0.16, 0.08]} />
          </mesh>

          {/* 4. Rear Eaves Rake Trim */}
          <mesh
            position={[-halfGableW / 2, height / 2, depth / 2 + 0.21]}
            rotation={[0, 0, slopeAngle]}
            material={materials.rakeTrimMat}
          >
            <boxGeometry args={[slopeLength + 0.25, 0.16, 0.08]} />
          </mesh>
          <mesh
            position={[halfGableW / 2, height / 2, depth / 2 + 0.21]}
            rotation={[0, 0, -slopeAngle]}
            material={materials.rakeTrimMat}
          >
            <boxGeometry args={[slopeLength + 0.25, 0.16, 0.08]} />
          </mesh>
        </group>
      ))}

      {/* 2 Valley Gutters between the 3 Gables (at X = -9.5 and +9.5) */}
      {[-width / 6, width / 6].map((vx, vIdx) => (
        <mesh key={`valley-${vIdx}`} position={[vx, 0.12, 0]} material={materials.trimMat}>
          <boxGeometry args={[0.42, 0.06, depth + 0.5]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Single Entrance Vestibule Group (Входной стеклянный тамбур, 13м х 3.34м)
 * Reusable component duplicated across all 3 spans of the Sports Complex.
 */
function EntranceVestibule({
  vestibuleW,
  vestibuleH,
  vestibuleD,
  materials,
}: {
  vestibuleW: number;
  vestibuleH: number;
  vestibuleD: number;
  materials: Record<string, THREE.Material>;
}) {
  return (
    <group position={[0, 0, -vestibuleD / 2]}>
      {/* Concrete Foundation Base */}
      <mesh position={[0, 0.08, 0]} material={materials.frameMat} receiveShadow>
        <boxGeometry args={[vestibuleW + 0.2, 0.16, vestibuleD + 0.2]} />
      </mesh>

      {/* Flat Roof Canopy with Dark Trim (at +3.34m) */}
      <mesh position={[0, vestibuleH + 0.1, 0]} material={materials.frameMat} castShadow>
        <boxGeometry args={[vestibuleW + 0.4, 0.2, vestibuleD + 0.4]} />
      </mesh>

      {/* --- Front Glazed Facade (Z = -vestibuleD / 2) --- */}
      {/* Section 1: Left Bay (4.3m wide, center at -4.35m) */}
      <mesh position={[-4.35, vestibuleH / 2 + 0.08, -vestibuleD / 2]} material={materials.glassMat}>
        <boxGeometry args={[4.2, vestibuleH - 0.2, 0.04]} />
      </mesh>
      {/* Section 2: Middle Bay (4.7m wide, center at +0.15m) */}
      <mesh position={[0.15, vestibuleH / 2 + 0.08, -vestibuleD / 2]} material={materials.glassMat}>
        <boxGeometry args={[4.6, vestibuleH - 0.2, 0.04]} />
      </mesh>
      {/* Section 3: Right Bay with Entrance Portal (4.0m wide, center at +4.5m) */}
      <group position={[4.5, 0, -vestibuleD / 2]}>
        {/* Double Glass Doors (2.0m wide, 2.4m high) */}
        {/* Left Leaf */}
        <mesh position={[-0.48, 1.3, 0.02]} material={materials.glassMat}>
          <boxGeometry args={[0.94, 2.36, 0.03]} />
        </mesh>
        <mesh position={[-0.48, 1.3, 0.02]} material={materials.frameMat}>
          <boxGeometry args={[0.98, 2.4, 0.05]} />
        </mesh>
        <mesh position={[-0.08, 1.25, 0.07]} material={materials.steelMat}>
          <cylinderGeometry args={[0.016, 0.016, 0.9, 8]} />
        </mesh>

        {/* Right Leaf */}
        <mesh position={[0.48, 1.3, 0.02]} material={materials.glassMat}>
          <boxGeometry args={[0.94, 2.36, 0.03]} />
        </mesh>
        <mesh position={[0.48, 1.3, 0.02]} material={materials.frameMat}>
          <boxGeometry args={[0.98, 2.4, 0.05]} />
        </mesh>
        <mesh position={[0.08, 1.25, 0.07]} material={materials.steelMat}>
          <cylinderGeometry args={[0.016, 0.016, 0.9, 8]} />
        </mesh>

        {/* Fixed Glass above and flanking doors */}
        <mesh position={[0, 2.85, 0.02]} material={materials.glassMat}>
          <boxGeometry args={[1.96, 0.7, 0.03]} />
        </mesh>
        <mesh position={[-1.48, vestibuleH / 2 + 0.08, 0.02]} material={materials.glassMat}>
          <boxGeometry args={[0.96, vestibuleH - 0.2, 0.04]} />
        </mesh>
        <mesh position={[1.48, vestibuleH / 2 + 0.08, 0.02]} material={materials.glassMat}>
          <boxGeometry args={[0.96, vestibuleH - 0.2, 0.04]} />
        </mesh>
      </group>

      {/* Structural Aluminum Posts along Front Face */}
      {[-vestibuleW / 2, -2.2, 2.5, vestibuleW / 2].map((px, idx) => (
        <mesh key={`vest-post-${idx}`} position={[px, vestibuleH / 2 + 0.08, -vestibuleD / 2]} material={materials.frameMat}>
          <boxGeometry args={[0.1, vestibuleH, 0.1]} />
        </mesh>
      ))}

      {/* Side Glazed Walls */}
      <mesh position={[-vestibuleW / 2, vestibuleH / 2 + 0.08, 0]} material={materials.glassMat}>
        <boxGeometry args={[0.04, vestibuleH - 0.2, vestibuleD - 0.1]} />
      </mesh>
      <mesh position={[vestibuleW / 2, vestibuleH / 2 + 0.08, 0]} material={materials.glassMat}>
        <boxGeometry args={[0.04, vestibuleH - 0.2, vestibuleD - 0.1]} />
      </mesh>
    </group>
  );
}

/**
 * Front Facade Elements for Sports Complex:
 * - Travertine / decorative stone base wall (2.2m high) with 0.6m band
 * - EXACTLY THREE Glazed Entrance Vestibules (13.0m wide each, duplicated across all 3 spans)
 * - Commemorative Stela («CONFERENCE HALL ANHOR») with granite pedestal
 */
export function SportsComplexFrontFacade({
  width = 57.0,
  depth = 37.5,
  opacity = 1,
  transparent = false,
}: SportsComplexFrontFacadeProps) {
  const materials = useMemo(() => {
    // Warm travertine / decorative facing stone (#dcd5c9)
    const stoneMat = new THREE.MeshStandardMaterial({
      color: '#dcd5c9',
      roughness: 0.88,
      metalness: 0.05,
      transparent,
      opacity,
    });

    // Dark graphite aluminum frame for glass vestibules
    const frameMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.35,
      metalness: 0.7,
      transparent,
      opacity,
    });

    // Deep tinted architectural glass
    const glassMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      roughness: 0.12,
      metalness: 0.78,
      transparent: true,
      opacity: transparent ? opacity * 0.5 : 0.94,
    });

    // Dark polished granite for stela base
    const graniteMat = new THREE.MeshStandardMaterial({
      color: '#18181b',
      roughness: 0.3,
      metalness: 0.6,
      transparent,
      opacity,
    });

    // Light stone tablet for stela
    const stelaMat = new THREE.MeshStandardMaterial({
      color: '#94a3b8',
      roughness: 0.6,
      metalness: 0.2,
      transparent,
      opacity,
    });

    // Brushed steel handles
    const steelMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      roughness: 0.2,
      metalness: 0.9,
      transparent,
      opacity,
    });

    return { stoneMat, frameMat, glassMat, graniteMat, stelaMat, steelMat };
  }, [opacity, transparent]);

  // Front face is North: Z = -depth / 2
  const frontZ = -depth / 2;

  // Vestibule dimensions from drawing:
  // Width: 13.0m (4.3m + 4.7m + 4.0m)
  // Height: 3.34m, Depth: 2.2m
  const vestibuleW = 13.0;
  const vestibuleH = 3.34;
  const vestibuleD = 2.2;

  // 3 Spans centers along X: -19.0m, 0.0m, +19.0m
  // In each span, the vestibule is centered or positioned ("входы три в спорт комплекс просто дублируй еще 2 раза")
  const entrancePositionsX = useMemo(() => [-19.0, 0.0, 19.0], []);

  return (
    <group position={[0, 0, frontZ]}>
      {/* ========================================================
          1. STONE BASE WALL (Цокольная часть фасада: высота 2.2м + 0.6м)
         ======================================================== */}
      {/* Main stone base slab (0 to 2.2m) */}
      <mesh position={[0, 1.1, -0.06]} material={materials.stoneMat} receiveShadow>
        <boxGeometry args={[width + 0.1, 2.2, 0.14]} />
      </mesh>
      {/* Decorative horizontal band (2.2m to 2.8m) */}
      <mesh position={[0, 2.5, -0.06]} material={materials.stoneMat}>
        <boxGeometry args={[width + 0.1, 0.6, 0.12]} />
      </mesh>
      {/* Horizontal belt reveal at 2.2m */}
      <mesh position={[0, 2.2, -0.04]} material={materials.frameMat}>
        <boxGeometry args={[width + 0.15, 0.05, 0.16]} />
      </mesh>

      {/* ========================================================
          2. THREE GLAZED ENTRANCE VESTIBULES (3 входных группы по 13м)
             ("входы три в спорт комплекс просто дублируй еще 2 раза")
         ======================================================== */}
      {entrancePositionsX.map((ex, idx) => (
        <group key={`entrance-vestibule-${idx}`} position={[ex, 0, 0]}>
          <EntranceVestibule
            vestibuleW={vestibuleW}
            vestibuleH={vestibuleH}
            vestibuleD={vestibuleD}
            materials={materials}
          />
        </group>
      ))}

      {/* ========================================================
          3. COMMEMORATIVE STELA (Стела «CONFERENCE HALL ANHOR»)
         ======================================================== */}
      {/* Located at 9.5m from left corner (X = -width / 2 + 9.5) */}
      <group position={[-width / 2 + 9.5, 0, -0.6]}>
        {/* Dark Granite Stepped Base */}
        <mesh position={[0, 0.15, 0]} material={materials.graniteMat} receiveShadow>
          <boxGeometry args={[1.4, 0.3, 0.8]} />
        </mesh>
        <mesh position={[0, 0.4, 0]} material={materials.graniteMat} castShadow>
          <boxGeometry args={[1.1, 0.25, 0.6]} />
        </mesh>

        {/* Vertical Stone Monument Tablet */}
        <mesh position={[0, 1.35, 0]} material={materials.stelaMat} castShadow>
          <boxGeometry args={[0.95, 1.5, 0.24]} />
        </mesh>
        {/* Inscribed Bronze/Gold Plaque */}
        <mesh position={[0, 1.45, -0.13]} material={materials.frameMat}>
          <boxGeometry args={[0.7, 0.55, 0.02]} />
        </mesh>
      </group>
    </group>
  );
}
