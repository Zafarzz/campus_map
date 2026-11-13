import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  StaticGeometryBatcher,
  disposeMergedMap,
  NO_RAYCAST,
} from '../geometry/staticGeometryMerger';
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
 */
export function SuwonHallFacade({
  width = 14.0,
  position = [0, 0, 0],
  rotationY = 0,
  opacity = 1,
  transparent = false,
}: SuwonHallFacadeProps) {
  const baseWidth = 14.0;
  const scaleX = width / baseWidth;

  const glassTex = useMemo(() => getWindowGlassTexture(), []);

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
        color: '#003876',
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

  const merged = useMemo(() => {
    const b = new StaticGeometryBatcher();

    const doorW = 2.155 * scaleX;
    const panelW = 2.16 * scaleX;
    const totalGlazeH = 3.75;
    const doorH = 2.4;
    const transomH = 1.1;

    // 1. Base granite plinth
    b.addBox('plinth', [14.0 * scaleX + 0.4, 0.08, 0.45], [0, 0.04, 0.08]);

    // 2. Structural cladding pillars
    b.addBox('whitePanel', [0.48 * scaleX, totalGlazeH, 0.28], [0, totalGlazeH / 2, 0.06]);
    b.addBox('whitePanel', [0.4 * scaleX, totalGlazeH, 0.28], [-7.0 * scaleX + 0.2 * scaleX, totalGlazeH / 2, 0.06]);
    b.addBox('whitePanel', [0.4 * scaleX, totalGlazeH, 0.28], [7.0 * scaleX - 0.2 * scaleX, totalGlazeH / 2, 0.06]);

    // 3 & 4. Left and Right stained glass sections
    for (const secX of [-3.5 * scaleX, 3.5 * scaleX]) {
      // Left fixed glass panel
      const lpx = secX - doorW / 2 - panelW / 2;
      b.addBox('glass', [panelW - 0.06, 2.6, 0.04], [lpx, 1.325, 0.02]);
      b.addBox('glass', [panelW - 0.06, transomH - 0.04, 0.04], [lpx, 2.65 + transomH / 2, 0.02]);
      b.addBox('darkFrame', [panelW, 0.06, 0.08], [lpx, 2.65, 0.04]);
      b.addBox('darkFrame', [0.06, totalGlazeH, 0.08], [lpx - panelW / 2, totalGlazeH / 2, 0.04]);

      // Center double entrance door
      for (const leafSign of [-1, 1]) {
        const lx = secX + leafSign * (doorW / 4);
        const ly = doorH / 2;
        const lz = 0.04;
        b.addBox('glass', [doorW / 2 - 0.08, doorH - 0.1, 0.03], [lx, ly, lz]);
        b.addBox('darkFrame', [doorW / 2, 0.08, 0.06], [lx, ly + doorH / 2 - 0.04, lz]);
        b.addBox('darkFrame', [doorW / 2, 0.08, 0.06], [lx, ly - doorH / 2 + 0.04, lz]);
        b.addBox('darkFrame', [0.06, doorH, 0.06], [lx - doorW / 4 + 0.03, ly, lz]);
        b.addBox('darkFrame', [0.06, doorH, 0.06], [lx + doorW / 4 - 0.03, ly, lz]);
        const hx = lx - leafSign * (doorW / 4 - 0.1);
        b.addCylinder('steelRail', [0.016, 0.016, 1.2, 12], [hx, ly, lz + 0.07]);
      }
      b.addBox('darkFrame', [doorW, 0.25, 0.08], [secX, 2.525, 0.04]);
      b.addBox('glass', [doorW - 0.06, transomH - 0.04, 0.04], [secX, 2.65 + transomH / 2, 0.02]);

      // Right fixed glass panel
      const rpx = secX + doorW / 2 + panelW / 2;
      b.addBox('glass', [panelW - 0.06, 2.6, 0.04], [rpx, 1.325, 0.02]);
      b.addBox('glass', [panelW - 0.06, transomH - 0.04, 0.04], [rpx, 2.65 + transomH / 2, 0.02]);
      b.addBox('darkFrame', [panelW, 0.06, 0.08], [rpx, 2.65, 0.04]);
      b.addBox('darkFrame', [0.06, totalGlazeH, 0.08], [rpx + panelW / 2, totalGlazeH / 2, 0.04]);
    }

    // 5. Parapet frieze canopy
    const fy = 3.75 + 0.6;
    const fz = 0.22;
    b.addBox('whitePanel', [14.0 * scaleX + 0.6, 1.2, 0.44], [0, fy, fz]);
    const step = (14.0 * scaleX) / 12;
    for (let i = 1; i < 12; i++) {
      const lx = -7.0 * scaleX + i * step;
      b.addBox('rustication', [0.018, 1.18, 0.015], [lx, fy, fz + 0.225]);
    }
    b.addBox('rustication', [14.0 * scaleX + 0.66, 0.04, 0.48], [0, fy + 0.62, fz + 0.01]);

    // 6. Rooftop metal support frame & 3D letters «SUWON HALL» (elevated and brought forward to clear parapet line-of-sight)
    const rx = 0.2;
    const ry = 5.38;
    const rz = 0.28;
    b.addBox('darkFrame', [6.2, 0.04, 0.04], [rx, ry + 0.16, rz]);
    b.addBox('darkFrame', [6.2, 0.04, 0.04], [rx, ry + 0.62, rz]);
    for (const sx of [-2.7, -1.35, 0, 1.35, 2.7]) {
      b.addBox('darkFrame', [0.04, 0.8, 0.08], [rx + sx, ry + 0.4, rz - 0.04]);
    }

    const letters = ['S', 'U', 'W', 'O', 'N', ' ', 'H', 'A', 'L', 'L'];
    const letterHeight = 0.72;
    const letterSpacing = 0.12;
    const spaceWidth = 0.32;
    const widths = letters.map((l) =>
      l === ' ' ? spaceWidth : l === 'W' ? letterHeight * 0.95 : l === 'L' ? letterHeight * 0.65 : letterHeight * 0.75,
    );
    const totalWordWidth = widths.reduce((sum, w) => sum + w, 0) + (letters.length - 1) * letterSpacing;
    let curX = -totalWordWidth / 2;
    for (let i = 0; i < letters.length; i++) {
      const letter = letters[i];
      const lw = widths[i];
      if (letter !== ' ') {
        const geom = createLetterGeometry(letter, letterHeight, 0.08);
        b.addGeometry('blueLetter', geom, [rx + curX + lw / 2, ry + 0.16, rz + 0.08]);
        geom.dispose();
      }
      curX += lw + letterSpacing;
    }

    return b.buildAll();
  }, [scaleX]);

  useEffect(() => () => disposeMergedMap(merged), [merged]);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {merged.plinth && <mesh geometry={merged.plinth} material={plinthMat} castShadow receiveShadow raycast={NO_RAYCAST} />}
      {merged.whitePanel && <mesh geometry={merged.whitePanel} material={whitePanelMat} castShadow receiveShadow raycast={NO_RAYCAST} />}
      {merged.rustication && <mesh geometry={merged.rustication} material={rusticationJointMat} raycast={NO_RAYCAST} />}
      {merged.darkFrame && <mesh geometry={merged.darkFrame} material={darkFrameMat} raycast={NO_RAYCAST} />}
      {merged.glass && <mesh geometry={merged.glass} material={glassMat} raycast={NO_RAYCAST} />}
      {merged.steelRail && <mesh geometry={merged.steelRail} material={steelRailMat} raycast={NO_RAYCAST} />}
      {merged.blueLetter && <mesh geometry={merged.blueLetter} material={blueLetterMat} raycast={NO_RAYCAST} />}
    </group>
  );
}
