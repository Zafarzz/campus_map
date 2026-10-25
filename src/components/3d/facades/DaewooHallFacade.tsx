import { useMemo } from 'react';
import * as THREE from 'three';

export type DaewooHallFacadeProps = {
  width?: number;
  position?: [number, number, number];
  rotationY?: number;
  opacity?: number;
  transparent?: boolean;
};

/**
 * Creates 3D extruded vector geometry for individual capital letters of «DAEWOO HALL».
 * Extruded locally without any external font/CDN dependency.
 */
function createLetterGeometry(letter: string, height: number = 0.72, depth: number = 0.08): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const w = height * 0.75; // Standard letter aspect ratio
  const barThick = height * 0.16;

  switch (letter) {
    case 'D': {
      shape.moveTo(0, 0);
      shape.lineTo(w * 0.55, 0);
      shape.quadraticCurveTo(w, 0, w, height * 0.5);
      shape.quadraticCurveTo(w, height, w * 0.55, height);
      shape.lineTo(0, height);
      shape.closePath();

      const hole = new THREE.Path();
      hole.moveTo(barThick, barThick);
      hole.lineTo(w * 0.5, barThick);
      hole.quadraticCurveTo(w - barThick, barThick, w - barThick, height * 0.5);
      hole.quadraticCurveTo(w - barThick, height - barThick, w * 0.5, height - barThick);
      hole.lineTo(barThick, height - barThick);
      hole.closePath();
      shape.holes.push(hole);
      break;
    }
    case 'A': {
      shape.moveTo(0, 0);
      shape.lineTo(w * 0.35, height);
      shape.lineTo(w * 0.65, height);
      shape.lineTo(w, 0);
      shape.lineTo(w - barThick * 1.1, 0);
      shape.lineTo(w * 0.78, height * 0.38);
      shape.lineTo(w * 0.22, height * 0.38);
      shape.lineTo(barThick * 1.1, 0);
      shape.closePath();

      const hole = new THREE.Path();
      hole.moveTo(w * 0.28, height * 0.5);
      hole.lineTo(w * 0.72, height * 0.5);
      hole.lineTo(w * 0.5, height * 0.88);
      hole.closePath();
      shape.holes.push(hole);
      break;
    }
    case 'E': {
      shape.moveTo(0, 0);
      shape.lineTo(w * 0.85, 0);
      shape.lineTo(w * 0.85, barThick);
      shape.lineTo(barThick, barThick);
      shape.lineTo(barThick, height * 0.44);
      shape.lineTo(w * 0.75, height * 0.44);
      shape.lineTo(w * 0.75, height * 0.44 + barThick);
      shape.lineTo(barThick, height * 0.44 + barThick);
      shape.lineTo(barThick, height - barThick);
      shape.lineTo(w * 0.85, height - barThick);
      shape.lineTo(w * 0.85, height);
      shape.lineTo(0, height);
      shape.closePath();
      break;
    }
    case 'W': {
      const segW = w / 4;
      shape.moveTo(0, height);
      shape.lineTo(barThick * 0.9, height);
      shape.lineTo(segW * 1.2, barThick);
      shape.lineTo(segW * 2 - barThick * 0.4, height * 0.75);
      shape.lineTo(segW * 2 + barThick * 0.4, height * 0.75);
      shape.lineTo(segW * 2.8, barThick);
      shape.lineTo(w - barThick * 0.9, height);
      shape.lineTo(w, height);
      shape.lineTo(segW * 3.1, 0);
      shape.lineTo(segW * 2.4, 0);
      shape.lineTo(segW * 2, height * 0.55);
      shape.lineTo(segW * 1.6, 0);
      shape.lineTo(segW * 0.9, 0);
      shape.closePath();
      break;
    }
    case 'O': {
      shape.moveTo(w * 0.5, 0);
      shape.quadraticCurveTo(w, 0, w, height * 0.5);
      shape.quadraticCurveTo(w, height, w * 0.5, height);
      shape.quadraticCurveTo(0, height, 0, height * 0.5);
      shape.quadraticCurveTo(0, 0, w * 0.5, 0);
      shape.closePath();

      const hole = new THREE.Path();
      hole.moveTo(w * 0.5, barThick);
      hole.quadraticCurveTo(barThick, barThick, barThick, height * 0.5);
      hole.quadraticCurveTo(barThick, height - barThick, w * 0.5, height - barThick);
      hole.quadraticCurveTo(w - barThick, height - barThick, w - barThick, height * 0.5);
      hole.quadraticCurveTo(w - barThick, barThick, w * 0.5, barThick);
      hole.closePath();
      shape.holes.push(hole);
      break;
    }
    case 'H': {
      shape.moveTo(0, 0);
      shape.lineTo(barThick, 0);
      shape.lineTo(barThick, height * 0.44);
      shape.lineTo(w - barThick, height * 0.44);
      shape.lineTo(w - barThick, 0);
      shape.lineTo(w, 0);
      shape.lineTo(w, height);
      shape.lineTo(w - barThick, height);
      shape.lineTo(w - barThick, height * 0.44 + barThick);
      shape.lineTo(barThick, height * 0.44 + barThick);
      shape.lineTo(barThick, height);
      shape.lineTo(0, height);
      shape.closePath();
      break;
    }
    case 'L': {
      shape.moveTo(0, 0);
      shape.lineTo(w * 0.85, 0);
      shape.lineTo(w * 0.85, barThick);
      shape.lineTo(barThick, barThick);
      shape.lineTo(barThick, height);
      shape.lineTo(0, height);
      shape.closePath();
      break;
    }
    default: {
      shape.moveTo(0, 0);
      shape.lineTo(w, 0);
      shape.lineTo(w, height);
      shape.lineTo(0, height);
      shape.closePath();
      break;
    }
  }

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.01,
    bevelSegments: 2,
  });
  geom.center();
  return geom;
}

/**
 * Architectural 3D Reconstruction of the «DAEWOO HALL» Entrance Pavilion / Corridor Facade.
 * Based on Blueprint: "ФАСАД ВХОДНОЙ ГРУППЫ «DAEWOO HALL» В ОСЯХ А-В (2D ЧЕРТЕЖ)".
 *
 * Dimensions:
 * - Width: 14.000m (7 bays x 2.000m)
 * - Parapet Height: 8.200m
 * - Rooftop Letter Sign: +8.200m to +9.050m («DAEWOO HALL» on steel frame)
 * - Attic Frieze: +6.800m to +8.200m (1.400m high, light-gray composite panel)
 * - Curtain Wall: 0.000m to +6.800m (6.800m high, 4 vertical tiers):
 *    * Tier 1 (Portal): 3.000m high, double entrance doors + steps + handrails
 *    * Tier 2: 1.250m high (+3.000 to +4.250)
 *    * Tier 3: 1.250m high (+4.250 to +5.500)
 *    * Tier 4: 1.300m high (+5.500 to +6.800)
 */
export function DaewooHallFacade({
  width = 14.0,
  position = [0, 0, 0],
  rotationY = 0,
  opacity = 1,
  transparent = false,
}: DaewooHallFacadeProps) {
  const facadeWidth = width;
  const numBays = 7;
  const bayWidth = facadeWidth / numBays;

  // Materials
  const materials = useMemo(() => {
    // Dark graphite anodized aluminum framing
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

    // Light-gray attic frieze panels
    const friezeMat = new THREE.MeshStandardMaterial({
      color: '#e2e8f0',
      roughness: 0.85,
      metalness: 0.05,
      transparent,
      opacity,
    });

    // Dark granite / basalt entrance steps
    const stepsMat = new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.8,
      metalness: 0.2,
      transparent,
      opacity,
    });

    // Brushed stainless steel for handrails & door handles
    const steelMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      roughness: 0.25,
      metalness: 0.9,
      transparent,
      opacity,
    });

    // Rooftop 3D letters dark charcoal finish
    const lettersMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      roughness: 0.25,
      metalness: 0.8,
      transparent,
      opacity,
    });

    return { frameMat, glassMat, friezeMat, stepsMat, steelMat, lettersMat };
  }, [opacity, transparent]);

  // Pre-generate 3D letter geometries for "DAEWOO HALL"
  const letterGeometries = useMemo(() => {
    return {
      D: createLetterGeometry('D'),
      A: createLetterGeometry('A'),
      E: createLetterGeometry('E'),
      W: createLetterGeometry('W'),
      O: createLetterGeometry('O'),
      H: createLetterGeometry('H'),
      L: createLetterGeometry('L'),
    };
  }, []);

  // Letters layout: offsets along the 14m width
  const letterLayout = useMemo(() => {
    // Word 1: "DAEWOO" centered on left, Word 2: "HALL" on right
    // Overall text centered around X = 0
    const chars = [
      { char: 'D', x: -4.3 },
      { char: 'A', x: -3.5 },
      { char: 'E', x: -2.75 },
      { char: 'W', x: -1.95 },
      { char: 'O', x: -1.15 },
      { char: 'O', x: -0.4 },
      // space
      { char: 'H', x: 0.7 },
      { char: 'A', x: 1.5 },
      { char: 'L', x: 2.25 },
      { char: 'L', x: 2.95 },
    ] as const;
    return chars;
  }, []);

  // Mullion X coordinates: 8 vertical posts for 7 bays
  const mullionPositions = useMemo(() => {
    const list: number[] = [];
    for (let i = 0; i <= numBays; i++) {
      list.push(-facadeWidth / 2 + i * bayWidth);
    }
    return list;
  }, [facadeWidth, numBays, bayWidth]);

  // Bay center X coordinates
  const bayCenters = useMemo(() => {
    const list: number[] = [];
    for (let i = 0; i < numBays; i++) {
      list.push(-facadeWidth / 2 + (i + 0.5) * bayWidth);
    }
    return list;
  }, [facadeWidth, numBays, bayWidth]);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* ========================================================
          1. ENTRANCE STEPS & STEEL HANDRAILS (Портал входа)
         ======================================================== */}
      {/* 3 Tiers of Granite Entrance Steps (6.0m wide, from X = -3.0 to +3.0) */}
      <mesh position={[0, 0.11, 0.6]} material={materials.stepsMat} receiveShadow>
        <boxGeometry args={[6.2, 0.12, 1.2]} />
      </mesh>
      <mesh position={[0, 0.23, 0.4]} material={materials.stepsMat} receiveShadow>
        <boxGeometry args={[6.1, 0.12, 0.8]} />
      </mesh>
      <mesh position={[0, 0.35, 0.2]} material={materials.stepsMat} receiveShadow>
        <boxGeometry args={[6.0, 0.12, 0.4]} />
      </mesh>

      {/* Left Handrail at X = -3.0m */}
      <group position={[-3.0, 0.35, 0.6]}>
        {/* Posts */}
        <mesh position={[0, 0.45, -0.4]} material={materials.steelMat}>
          <cylinderGeometry args={[0.025, 0.025, 0.9, 8]} />
        </mesh>
        <mesh position={[0, 0.45, 0.4]} material={materials.steelMat}>
          <cylinderGeometry args={[0.025, 0.025, 0.9, 8]} />
        </mesh>
        {/* Sloped Top Rail */}
        <mesh position={[0, 0.9, 0]} rotation={[-0.14, 0, 0]} material={materials.steelMat}>
          <boxGeometry args={[0.05, 0.05, 1.25]} />
        </mesh>
      </group>

      {/* Right Handrail at X = +3.0m */}
      <group position={[3.0, 0.35, 0.6]}>
        {/* Posts */}
        <mesh position={[0, 0.45, -0.4]} material={materials.steelMat}>
          <cylinderGeometry args={[0.025, 0.025, 0.9, 8]} />
        </mesh>
        <mesh position={[0, 0.45, 0.4]} material={materials.steelMat}>
          <cylinderGeometry args={[0.025, 0.025, 0.9, 8]} />
        </mesh>
        {/* Sloped Top Rail */}
        <mesh position={[0, 0.9, 0]} rotation={[-0.14, 0, 0]} material={materials.steelMat}>
          <boxGeometry args={[0.05, 0.05, 1.25]} />
        </mesh>
      </group>

      {/* ========================================================
          2. STRUCTURAL ALUMINUM MULLIONS (8 Vertical Posts)
         ======================================================== */}
      {mullionPositions.map((mx, idx) => (
        <mesh key={`mullion-${idx}`} position={[mx, 3.4, 0]} material={materials.frameMat} castShadow>
          <boxGeometry args={[0.08, 6.8, 0.12]} />
        </mesh>
      ))}

      {/* ========================================================
          3. HORIZONTAL TRANSOMS & HEADER RAILS
         ======================================================== */}
      {/* Plinth Base Rail at Y = 0.04 */}
      <mesh position={[0, 0.04, 0]} material={materials.frameMat}>
        <boxGeometry args={[facadeWidth, 0.08, 0.14]} />
      </mesh>
      {/* Level 1 Transom at Y = 3.00 (Header of Portal / Tier 1) */}
      <mesh position={[0, 3.0, 0]} material={materials.frameMat} castShadow>
        <boxGeometry args={[facadeWidth, 0.08, 0.14]} />
      </mesh>
      {/* Level 2 Transom at Y = 4.25 */}
      <mesh position={[0, 4.25, 0]} material={materials.frameMat} castShadow>
        <boxGeometry args={[facadeWidth, 0.06, 0.12]} />
      </mesh>
      {/* Level 3 Transom at Y = 5.50 */}
      <mesh position={[0, 5.5, 0]} material={materials.frameMat} castShadow>
        <boxGeometry args={[facadeWidth, 0.06, 0.12]} />
      </mesh>
      {/* Curtain Wall Top Header at Y = 6.80 */}
      <mesh position={[0, 6.8, 0]} material={materials.frameMat} castShadow>
        <boxGeometry args={[facadeWidth, 0.08, 0.16]} />
      </mesh>

      {/* ========================================================
          4. GLASS PANES PER TIER
         ======================================================== */}
      {/* --- Tier 1 (Y: 0.0 to 3.0m, Height: 3.0m) --- */}
      {bayCenters.map((cx, bIdx) => {
        // Center bay (index 3, X = 0) is the Double Glass Door Portal
        if (bIdx === 3) {
          return (
            <group key={`tier1-bay-${bIdx}`} position={[cx, 0, 0]}>
              {/* Double Entrance Glass Doors (from Y = 0.35 to 2.65, width 2.0m) */}
              {/* Left Door Leaf */}
              <mesh position={[-0.48, 1.5, 0.02]} material={materials.glassMat}>
                <boxGeometry args={[0.92, 2.3, 0.04]} />
              </mesh>
              <mesh position={[-0.48, 1.5, 0.02]} material={materials.frameMat}>
                <boxGeometry args={[0.96, 2.34, 0.06]} />
              </mesh>
              {/* Left Door Pull Handle */}
              <mesh position={[-0.08, 1.45, 0.08]} material={materials.steelMat}>
                <cylinderGeometry args={[0.018, 0.018, 0.95, 8]} />
              </mesh>

              {/* Right Door Leaf */}
              <mesh position={[0.48, 1.5, 0.02]} material={materials.glassMat}>
                <boxGeometry args={[0.92, 2.3, 0.04]} />
              </mesh>
              <mesh position={[0.48, 1.5, 0.02]} material={materials.frameMat}>
                <boxGeometry args={[0.96, 2.34, 0.06]} />
              </mesh>
              {/* Right Door Pull Handle */}
              <mesh position={[0.08, 1.45, 0.08]} material={materials.steelMat}>
                <cylinderGeometry args={[0.018, 0.018, 0.95, 8]} />
              </mesh>

              {/* Transom Bar above doors at Y = 2.65 */}
              <mesh position={[0, 2.65, 0]} material={materials.frameMat}>
                <boxGeometry args={[bayWidth - 0.08, 0.06, 0.1]} />
              </mesh>
              {/* Glass Transom Window above doors (Y = 2.65 to 3.00) */}
              <mesh position={[0, 2.825, 0]} material={materials.glassMat}>
                <boxGeometry args={[bayWidth - 0.08, 0.3, 0.03]} />
              </mesh>
            </group>
          );
        }

        // Standard fixed panoramic glass bay for Tier 1
        return (
          <mesh key={`tier1-bay-${bIdx}`} position={[cx, 1.5, 0]} material={materials.glassMat}>
            <boxGeometry args={[bayWidth - 0.08, 2.9, 0.03]} />
          </mesh>
        );
      })}

      {/* --- Tier 2 (Y: 3.0 to 4.25m, Height: 1.25m) --- */}
      {bayCenters.map((cx, bIdx) => (
        <mesh key={`tier2-bay-${bIdx}`} position={[cx, 3.625, 0]} material={materials.glassMat}>
          <boxGeometry args={[bayWidth - 0.08, 1.18, 0.03]} />
        </mesh>
      ))}

      {/* --- Tier 3 (Y: 4.25 to 5.50m, Height: 1.25m) --- */}
      {bayCenters.map((cx, bIdx) => (
        <mesh key={`tier3-bay-${bIdx}`} position={[cx, 4.875, 0]} material={materials.glassMat}>
          <boxGeometry args={[bayWidth - 0.08, 1.18, 0.03]} />
        </mesh>
      ))}

      {/* --- Tier 4 (Y: 5.50 to 6.80m, Height: 1.30m) --- */}
      {bayCenters.map((cx, bIdx) => (
        <mesh key={`tier4-bay-${bIdx}`} position={[cx, 6.15, 0]} material={materials.glassMat}>
          <boxGeometry args={[bayWidth - 0.08, 1.22, 0.03]} />
        </mesh>
      ))}

      {/* ========================================================
          5. ATTIC FRIEZE & PARAPET (Аттиковый фриз: +6.80 to +8.20m, 1.4m high)
         ======================================================== */}
      {/* Light-gray composite fascia panel */}
      <mesh position={[0, 7.5, 0.04]} material={materials.friezeMat} castShadow receiveShadow>
        <boxGeometry args={[facadeWidth + 0.1, 1.4, 0.28]} />
      </mesh>
      {/* Lower Decorative Cornice Reveal at Y = 6.80 */}
      <mesh position={[0, 6.82, 0.12]} material={materials.frameMat}>
        <boxGeometry args={[facadeWidth + 0.15, 0.06, 0.14]} />
      </mesh>
      {/* Upper Parapet Coping Trim at Y = 8.20 */}
      <mesh position={[0, 8.2, 0.06]} material={materials.frameMat} castShadow>
        <boxGeometry args={[facadeWidth + 0.2, 0.08, 0.36]} />
      </mesh>

      {/* ========================================================
          6. ROOFTOP 3D VOLUMETRIC LETTERS «DAEWOO HALL» ON METAL FRAME
         ======================================================== */}
      {/* Horizontal Steel Support Truss Frame at Y = 8.24 */}
      <group position={[0, 8.24, 0.06]}>
        {/* Bottom mounting rail */}
        <mesh position={[0, 0.04, 0]} material={materials.frameMat}>
          <boxGeometry args={[8.6, 0.04, 0.06]} />
        </mesh>
        {/* Top stabilizer rail */}
        <mesh position={[0, 0.45, -0.06]} material={materials.frameMat}>
          <boxGeometry args={[8.6, 0.03, 0.04]} />
        </mesh>
        {/* 6 Vertical Support Stanchions */}
        {[-4.0, -2.4, -0.8, 0.8, 2.4, 4.0].map((rx, idx) => (
          <mesh key={`roof-post-${idx}`} position={[rx, 0.38, -0.03]} material={materials.frameMat}>
            <cylinderGeometry args={[0.02, 0.02, 0.72, 8]} />
          </mesh>
        ))}
      </group>

      {/* 3D Extruded Capital Letters «DAEWOO HALL» */}
      <group position={[0, 8.7, 0.08]}>
        {letterLayout.map(({ char, x }, idx) => {
          const geom = letterGeometries[char as keyof typeof letterGeometries];
          if (!geom) return null;
          return (
            <mesh
              key={`letter-${idx}`}
              position={[x, 0, 0]}
              geometry={geom}
              material={materials.lettersMat}
              castShadow
            />
          );
        })}
      </group>
    </group>
  );
}
