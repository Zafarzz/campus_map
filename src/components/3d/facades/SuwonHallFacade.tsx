import { useMemo } from 'react';
import * as THREE from 'three';
import { getWindowGlassTexture } from '../materials/pbrMaterials';

export type SuwonHallFacadeProps = {
  /** Width of the facade opening (m), default 14.0 per CAD blueprint */
  width?: number;
  /** World position [x, y, z] */
  position?: [number, number, number];
  /** Rotation around Y axis in radians (default 0) */
  rotationY?: number;
  /** Opacity for selection dimming */
  opacity?: number;
  /** Transparent flag */
  transparent?: boolean;
};

/**
 * Creates 3D extruded vector geometry for individual capital letters of «SUWON HALL».
 * Extruded locally without any external font or CDN dependencies.
 */
function createLetterGeometry(letter: string, height: number = 0.7, depth: number = 0.08): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const w = height * (letter === 'W' ? 0.95 : letter === 'I' ? 0.25 : letter === 'L' ? 0.65 : 0.75);
  const barThick = height * 0.16;

  switch (letter) {
    case 'S': {
      shape.moveTo(0, 0);
      shape.lineTo(w, 0);
      shape.lineTo(w, height * 0.5 + barThick / 2);
      shape.lineTo(barThick, height * 0.5 + barThick / 2);
      shape.lineTo(barThick, height - barThick);
      shape.lineTo(w, height - barThick);
      shape.lineTo(w, height);
      shape.lineTo(0, height);
      shape.lineTo(0, height * 0.5 - barThick / 2);
      shape.lineTo(w - barThick, height * 0.5 - barThick / 2);
      shape.lineTo(w - barThick, barThick);
      shape.lineTo(0, barThick);
      shape.closePath();
      break;
    }
    case 'U': {
      shape.moveTo(0, height);
      shape.lineTo(barThick, height);
      shape.lineTo(barThick, barThick);
      shape.lineTo(w - barThick, barThick);
      shape.lineTo(w - barThick, height);
      shape.lineTo(w, height);
      shape.lineTo(w, 0);
      shape.lineTo(0, 0);
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
    case 'N': {
      shape.moveTo(0, 0);
      shape.lineTo(barThick, 0);
      shape.lineTo(barThick, height * 0.4);
      shape.lineTo(w - barThick, 0);
      shape.lineTo(w, 0);
      shape.lineTo(w, height);
      shape.lineTo(w - barThick, height);
      shape.lineTo(w - barThick, height * 0.6);
      shape.lineTo(barThick, height);
      shape.lineTo(0, height);
      shape.closePath();
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
 * Architectural 3D Elevation of the «SUWON HALL» Entrance Group Pavilion.
 * Connecting Block F (bld-d) and Block E (bld-b), facing East towards the perimeter fence & driveway.
 * Reconstructed directly from CAD blueprint:
 * «ФАСАД ВХОДНОЙ ГРУППЫ «SUWON HALL» В ОСЯХ А–В (2D ЧЕРТЕЖ)»
 * (Ортогональная проекция павильона без примыкающих корпусов | Размеры в мм (М 1:100)).
 *
 * Anatomy & Dimensions:
 * - Total facade length: 14 000 mm (14.0m) in structural axes А–В.
 * - Symmetrical 2 blocks of 7 000 mm (Left block: Axes А–Б, Right block: Axes Б–В).
 * - Central structural pillar at axis Б with off-white composite cladding.
 * - Two sets of double entrance doors (2 155 mm wide, 2 400 mm high) with long stainless steel pull handles.
 * - Four large panoramic fixed glass bays (2 160 mm wide, 3 750 mm total height).
 * - Continuous horizontal transom bar at +2.650 m with upper transom window pane («Фрамуга», 1 100 mm).
 * - Massive cantilevered parapet frieze canopy: height 1 200 mm (+3.750 m to +4.950 m) with vertical panel rustication.
 * - Individual 3D rooftop letters «SUWON HALL» in Ajou University Blue (height 700 mm, top at +5.650 m) on structural metal frame.
 */
export function SuwonHallFacade({
  width = 14.0,
  position = [0, 0, 0],
  rotationY = 0,
  opacity = 1,
  transparent = false,
}: SuwonHallFacadeProps) {
  // Base CAD dimensions
  const baseWidth = 14.0;
  const scaleX = width / baseWidth;

  const glassTex = useMemo(() => getWindowGlassTexture(), []);

  // Materials
  const whitePanelMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#f8fafc',
        roughness: 0.42,
        metalness: 0.08,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [transparent, opacity],
  );

  const rusticationJointMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#cbd5e1',
        roughness: 0.8,
        metalness: 0.1,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [transparent, opacity],
  );

  const darkFrameMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.35,
        metalness: 0.45,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [transparent, opacity],
  );

  const plinthMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#334155',
        roughness: 0.85,
        metalness: 0.15,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [transparent, opacity],
  );

  const glassMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#1e3a5f',
        map: glassTex,
        roughness: 0.12,
        metalness: 0.82,
        transparent: true,
        opacity: Math.min(opacity, 0.88),
        depthWrite: !transparent,
        envMapIntensity: 1.6,
      }),
    [glassTex, transparent, opacity],
  );

  const blueLetterMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#003876', // Official Ajou Blue per university brand identity
        roughness: 0.28,
        metalness: 0.25,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [transparent, opacity],
  );

  const steelRailMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#cbd5e1',
        roughness: 0.2,
        metalness: 0.88,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [transparent, opacity],
  );

  // 3D Rooftop Letters «SUWON HALL» (calibrated height 720 mm per architectural blueprint)
  const lettersData = useMemo(() => {
    const letters = ['S', 'U', 'W', 'O', 'N', ' ', 'H', 'A', 'L', 'L'];
    const letterHeight = 0.72; // 720 mm
    const letterSpacing = 0.12;
    const spaceWidth = 0.32;

    const widths: number[] = letters.map((l) =>
      l === ' ' ? spaceWidth : l === 'W' ? letterHeight * 0.95 : l === 'L' ? letterHeight * 0.65 : letterHeight * 0.75,
    );
    const totalWordWidth = widths.reduce((sum, w) => sum + w, 0) + (letters.length - 1) * letterSpacing;

    let curX = -totalWordWidth / 2;
    const items: Array<{ geom: THREE.BufferGeometry; x: number }> = [];

    letters.forEach((letter, i) => {
      const lw = widths[i];
      if (letter !== ' ') {
        const geom = createLetterGeometry(letter, letterHeight, 0.08);
        items.push({ geom, x: curX + lw / 2 });
      }
      curX += lw + letterSpacing;
    });

    return items;
  }, []);

  // Vertical panel rustication lines for 1.2m frieze (12 lines spaced every ~1.16m)
  const friezeRusticationLines = useMemo(() => {
    const lines: number[] = [];
    const count = 12;
    const step = (14.0 * scaleX) / count;
    for (let i = 1; i < count; i++) {
      lines.push(-7.0 * scaleX + i * step);
    }
    return lines;
  }, [scaleX]);

  // Entrance door and window dimensions
  const doorW = 2.155 * scaleX;
  const panelW = 2.16 * scaleX;
  const totalGlazeH = 3.75;
  const doorH = 2.4;
  const transomH = 1.1; // +2.65m to +3.75m

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* 1. Base Granite Plinth / Step (±0.000 to +0.050 m) */}
      <mesh position={[0, 0.04, 0.08]} material={plinthMat} castShadow receiveShadow>
        <boxGeometry args={[14.0 * scaleX + 0.4, 0.08, 0.45]} />
      </mesh>

      {/* 2. Structural Cladding Pillars:
          - Central Pillar at Axis Б (x = 0)
          - Left End Pillar at Axis А (x = -7.0 * scaleX)
          - Right End Pillar at Axis В (x = +7.0 * scaleX) */}
      <mesh position={[0, totalGlazeH / 2, 0.06]} material={whitePanelMat} castShadow receiveShadow>
        <boxGeometry args={[0.48 * scaleX, totalGlazeH, 0.28]} />
      </mesh>
      <mesh position={[-7.0 * scaleX + (0.2 * scaleX), totalGlazeH / 2, 0.06]} material={whitePanelMat} castShadow receiveShadow>
        <boxGeometry args={[0.4 * scaleX, totalGlazeH, 0.28]} />
      </mesh>
      <mesh position={[7.0 * scaleX - (0.2 * scaleX), totalGlazeH / 2, 0.06]} material={whitePanelMat} castShadow receiveShadow>
        <boxGeometry args={[0.4 * scaleX, totalGlazeH, 0.28]} />
      </mesh>

      {/* 3. Left Stained Glass Section (Axes А–Б, 7 000 mm, center at -3.5 * scaleX) */}
      <group position={[-3.5 * scaleX, 0, 0]}>
        {/* 3a. Left Fixed Glass Panel (2 160 mm) */}
        <group position={[-doorW / 2 - panelW / 2, 0, 0]}>
          {/* Main Lower Pane (0 to +2.65m) */}
          <mesh position={[0, 1.325, 0.02]} material={glassMat}>
            <boxGeometry args={[panelW - 0.06, 2.6, 0.04]} />
          </mesh>
          {/* Upper Transom Pane (Фрамуга, +2.65 to +3.75m) */}
          <mesh position={[0, 2.65 + transomH / 2, 0.02]} material={glassMat}>
            <boxGeometry args={[panelW - 0.06, transomH - 0.04, 0.04]} />
          </mesh>
          {/* Mullion Frame */}
          <mesh position={[0, 2.65, 0.04]} material={darkFrameMat}>
            <boxGeometry args={[panelW, 0.06, 0.08]} />
          </mesh>
          <mesh position={[-panelW / 2, totalGlazeH / 2, 0.04]} material={darkFrameMat}>
            <boxGeometry args={[0.06, totalGlazeH, 0.08]} />
          </mesh>
        </group>

        {/* 3b. Center Double Entrance Door (2 155 mm wide, 2 400 mm high) */}
        <group position={[0, 0, 0]}>
          {/* Left Door Leaf */}
          <group position={[-doorW / 4, doorH / 2, 0.04]}>
            <mesh material={glassMat}>
              <boxGeometry args={[doorW / 2 - 0.08, doorH - 0.1, 0.03]} />
            </mesh>
            {/* Door leaf perimeter frame */}
            <mesh position={[0, doorH / 2 - 0.04, 0]} material={darkFrameMat}>
              <boxGeometry args={[doorW / 2, 0.08, 0.06]} />
            </mesh>
            <mesh position={[0, -doorH / 2 + 0.04, 0]} material={darkFrameMat}>
              <boxGeometry args={[doorW / 2, 0.08, 0.06]} />
            </mesh>
            <mesh position={[-doorW / 4 + 0.03, 0, 0]} material={darkFrameMat}>
              <boxGeometry args={[0.06, doorH, 0.06]} />
            </mesh>
            <mesh position={[doorW / 4 - 0.03, 0, 0]} material={darkFrameMat}>
              <boxGeometry args={[0.06, doorH, 0.06]} />
            </mesh>
            {/* Long Vertical Pull Handle (Stainless steel rail, Y: 0.85 to 2.05m) */}
            <mesh position={[doorW / 4 - 0.1, 0, 0.07]} material={steelRailMat} castShadow>
              <cylinderGeometry args={[0.016, 0.016, 1.2, 16]} />
            </mesh>
          </group>

          {/* Right Door Leaf */}
          <group position={[doorW / 4, doorH / 2, 0.04]}>
            <mesh material={glassMat}>
              <boxGeometry args={[doorW / 2 - 0.08, doorH - 0.1, 0.03]} />
            </mesh>
            <mesh position={[0, doorH / 2 - 0.04, 0]} material={darkFrameMat}>
              <boxGeometry args={[doorW / 2, 0.08, 0.06]} />
            </mesh>
            <mesh position={[0, -doorH / 2 + 0.04, 0]} material={darkFrameMat}>
              <boxGeometry args={[doorW / 2, 0.08, 0.06]} />
            </mesh>
            <mesh position={[-doorW / 4 + 0.03, 0, 0]} material={darkFrameMat}>
              <boxGeometry args={[0.06, doorH, 0.06]} />
            </mesh>
            <mesh position={[doorW / 4 - 0.03, 0, 0]} material={darkFrameMat}>
              <boxGeometry args={[0.06, doorH, 0.06]} />
            </mesh>
            {/* Long Vertical Pull Handle */}
            <mesh position={[-doorW / 4 + 0.1, 0, 0.07]} material={steelRailMat} castShadow>
              <cylinderGeometry args={[0.016, 0.016, 1.2, 16]} />
            </mesh>
          </group>

          {/* Door Header Transom Beam (+2.40 to +2.65m) */}
          <mesh position={[0, 2.525, 0.04]} material={darkFrameMat}>
            <boxGeometry args={[doorW, 0.25, 0.08]} />
          </mesh>

          {/* Upper Transom Pane above door (+2.65 to +3.75m) */}
          <mesh position={[0, 2.65 + transomH / 2, 0.02]} material={glassMat}>
            <boxGeometry args={[doorW - 0.06, transomH - 0.04, 0.04]} />
          </mesh>
        </group>

        {/* 3c. Right Fixed Glass Panel (2 160 mm) */}
        <group position={[doorW / 2 + panelW / 2, 0, 0]}>
          <mesh position={[0, 1.325, 0.02]} material={glassMat}>
            <boxGeometry args={[panelW - 0.06, 2.6, 0.04]} />
          </mesh>
          <mesh position={[0, 2.65 + transomH / 2, 0.02]} material={glassMat}>
            <boxGeometry args={[panelW - 0.06, transomH - 0.04, 0.04]} />
          </mesh>
          <mesh position={[0, 2.65, 0.04]} material={darkFrameMat}>
            <boxGeometry args={[panelW, 0.06, 0.08]} />
          </mesh>
          <mesh position={[panelW / 2, totalGlazeH / 2, 0.04]} material={darkFrameMat}>
            <boxGeometry args={[0.06, totalGlazeH, 0.08]} />
          </mesh>
        </group>
      </group>

      {/* 4. Right Stained Glass Section (Axes Б–В, 7 000 mm, center at +3.5 * scaleX) */}
      <group position={[3.5 * scaleX, 0, 0]}>
        {/* 4a. Left Fixed Glass Panel (2 160 mm) */}
        <group position={[-doorW / 2 - panelW / 2, 0, 0]}>
          <mesh position={[0, 1.325, 0.02]} material={glassMat}>
            <boxGeometry args={[panelW - 0.06, 2.6, 0.04]} />
          </mesh>
          <mesh position={[0, 2.65 + transomH / 2, 0.02]} material={glassMat}>
            <boxGeometry args={[panelW - 0.06, transomH - 0.04, 0.04]} />
          </mesh>
          <mesh position={[0, 2.65, 0.04]} material={darkFrameMat}>
            <boxGeometry args={[panelW, 0.06, 0.08]} />
          </mesh>
          <mesh position={[-panelW / 2, totalGlazeH / 2, 0.04]} material={darkFrameMat}>
            <boxGeometry args={[0.06, totalGlazeH, 0.08]} />
          </mesh>
        </group>

        {/* 4b. Center Double Entrance Door (2 155 mm wide, 2 400 mm high) */}
        <group position={[0, 0, 0]}>
          {/* Left Door Leaf */}
          <group position={[-doorW / 4, doorH / 2, 0.04]}>
            <mesh material={glassMat}>
              <boxGeometry args={[doorW / 2 - 0.08, doorH - 0.1, 0.03]} />
            </mesh>
            <mesh position={[0, doorH / 2 - 0.04, 0]} material={darkFrameMat}>
              <boxGeometry args={[doorW / 2, 0.08, 0.06]} />
            </mesh>
            <mesh position={[0, -doorH / 2 + 0.04, 0]} material={darkFrameMat}>
              <boxGeometry args={[doorW / 2, 0.08, 0.06]} />
            </mesh>
            <mesh position={[-doorW / 4 + 0.03, 0, 0]} material={darkFrameMat}>
              <boxGeometry args={[0.06, doorH, 0.06]} />
            </mesh>
            <mesh position={[doorW / 4 - 0.03, 0, 0]} material={darkFrameMat}>
              <boxGeometry args={[0.06, doorH, 0.06]} />
            </mesh>
            <mesh position={[doorW / 4 - 0.1, 0, 0.07]} material={steelRailMat} castShadow>
              <cylinderGeometry args={[0.016, 0.016, 1.2, 16]} />
            </mesh>
          </group>

          {/* Right Door Leaf */}
          <group position={[doorW / 4, doorH / 2, 0.04]}>
            <mesh material={glassMat}>
              <boxGeometry args={[doorW / 2 - 0.08, doorH - 0.1, 0.03]} />
            </mesh>
            <mesh position={[0, doorH / 2 - 0.04, 0]} material={darkFrameMat}>
              <boxGeometry args={[doorW / 2, 0.08, 0.06]} />
            </mesh>
            <mesh position={[0, -doorH / 2 + 0.04, 0]} material={darkFrameMat}>
              <boxGeometry args={[doorW / 2, 0.08, 0.06]} />
            </mesh>
            <mesh position={[-doorW / 4 + 0.03, 0, 0]} material={darkFrameMat}>
              <boxGeometry args={[0.06, doorH, 0.06]} />
            </mesh>
            <mesh position={[doorW / 4 - 0.03, 0, 0]} material={darkFrameMat}>
              <boxGeometry args={[0.06, doorH, 0.06]} />
            </mesh>
            <mesh position={[-doorW / 4 + 0.1, 0, 0.07]} material={steelRailMat} castShadow>
              <cylinderGeometry args={[0.016, 0.016, 1.2, 16]} />
            </mesh>
          </group>

          <mesh position={[0, 2.525, 0.04]} material={darkFrameMat}>
            <boxGeometry args={[doorW, 0.25, 0.08]} />
          </mesh>
          <mesh position={[0, 2.65 + transomH / 2, 0.02]} material={glassMat}>
            <boxGeometry args={[doorW - 0.06, transomH - 0.04, 0.04]} />
          </mesh>
        </group>

        {/* 4c. Right Fixed Glass Panel (2 160 mm) */}
        <group position={[doorW / 2 + panelW / 2, 0, 0]}>
          <mesh position={[0, 1.325, 0.02]} material={glassMat}>
            <boxGeometry args={[panelW - 0.06, 2.6, 0.04]} />
          </mesh>
          <mesh position={[0, 2.65 + transomH / 2, 0.02]} material={glassMat}>
            <boxGeometry args={[panelW - 0.06, transomH - 0.04, 0.04]} />
          </mesh>
          <mesh position={[0, 2.65, 0.04]} material={darkFrameMat}>
            <boxGeometry args={[panelW, 0.06, 0.08]} />
          </mesh>
          <mesh position={[panelW / 2, totalGlazeH / 2, 0.04]} material={darkFrameMat}>
            <boxGeometry args={[0.06, totalGlazeH, 0.08]} />
          </mesh>
        </group>
      </group>

      {/* 5. Parapet Frieze Canopy (1 200 mm height, from +3.750 m to +4.950 m) */}
      <group position={[0, 3.75 + 0.6, 0.22]}>
        {/* Main Frieze Facade Box */}
        <mesh material={whitePanelMat} castShadow receiveShadow>
          <boxGeometry args={[14.0 * scaleX + 0.6, 1.2, 0.44]} />
        </mesh>

        {/* Vertical panel rustication lines */}
        {friezeRusticationLines.map((lx, idx) => (
          <mesh key={`frust-${idx}`} position={[lx, 0, 0.225]} material={rusticationJointMat}>
            <boxGeometry args={[0.018, 1.18, 0.015]} />
          </mesh>
        ))}

        {/* Top Edge Flashing Strip at +4.950 m */}
        <mesh position={[0, 0.6 + 0.02, 0.01]} material={rusticationJointMat}>
          <boxGeometry args={[14.0 * scaleX + 0.66, 0.04, 0.48]} />
        </mesh>
      </group>

      {/* 6. Rooftop Metal Support Frame & 3D Letters «SUWON HALL» */}
      <group position={[0.2, 4.95, 0.12]}>
        {/* Horizontal Metal Frame Rails (steel tubes) */}
        <mesh position={[0, 0.16, 0]} material={darkFrameMat}>
          <boxGeometry args={[6.2, 0.04, 0.04]} />
        </mesh>
        <mesh position={[0, 0.62, 0]} material={darkFrameMat}>
          <boxGeometry args={[6.2, 0.04, 0.04]} />
        </mesh>

        {/* Vertical Frame Support Stanchions (5 posts) */}
        {[-2.7, -1.35, 0, 1.35, 2.7].map((sx, idx) => (
          <mesh key={`post-${idx}`} position={[sx, 0.4, -0.04]} material={darkFrameMat}>
            <boxGeometry args={[0.04, 0.8, 0.08]} />
          </mesh>
        ))}

        {/* 3D Blue Letters «SUWON HALL» (Height 720 mm) */}
        <group position={[0, 0.16, 0.08]}>
          {lettersData.map(({ geom, x }, idx) => (
            <mesh key={`letter-${idx}`} position={[x, 0, 0]} geometry={geom} material={blueLetterMat} castShadow />
          ))}
        </group>
      </group>
    </group>
  );
}
