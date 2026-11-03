import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  StaticGeometryBatcher,
  disposeMergedMap,
  NO_RAYCAST,
} from '../geometry/staticGeometryMerger';

export type DaewooHallFacadeProps = {
  width?: number;
  position?: [number, number, number];
  rotationY?: number;
  opacity?: number;
  transparent?: boolean;
  /** Whether to render the white birch trees along the front apron per blueprint */
  includeTrees?: boolean;
};

function createLetterGeometry(letter: string, height: number = 0.72, depth: number = 0.08): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const w = height * 0.75;
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
 */
export function DaewooHallFacade({
  width = 14.0,
  position = [0, 0, 0],
  rotationY = 0,
  opacity = 1,
  transparent = false,
  includeTrees = false,
}: DaewooHallFacadeProps) {
  const facadeWidth = width;
  const numBays = 7;
  const bayWidth = facadeWidth / numBays;

  const materials = useMemo(() => {
    const frameMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.35,
      metalness: 0.7,
      transparent,
      opacity,
    });

    const glassMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      roughness: 0.12,
      metalness: 0.78,
      transparent: true,
      opacity: transparent ? opacity * 0.5 : 0.94,
    });

    const friezeMat = new THREE.MeshStandardMaterial({
      color: '#e2e8f0',
      roughness: 0.85,
      metalness: 0.05,
      transparent,
      opacity,
    });

    const stepsMat = new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.8,
      metalness: 0.2,
      transparent,
      opacity,
    });

    const steelMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      roughness: 0.25,
      metalness: 0.9,
      transparent,
      opacity,
    });

    const lettersMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      roughness: 0.25,
      metalness: 0.8,
      transparent,
      opacity,
    });

    return { frameMat, glassMat, friezeMat, stepsMat, steelMat, lettersMat };
  }, [opacity, transparent]);

  const merged = useMemo(() => {
    const b = new StaticGeometryBatcher();

    // 1. Entrance steps & steel handrails
    b.addBox('steps', [6.2, 0.12, 1.2], [0, 0.11, 0.6]);
    b.addBox('steps', [6.1, 0.12, 0.8], [0, 0.23, 0.4]);
    b.addBox('steps', [6.0, 0.12, 0.4], [0, 0.35, 0.2]);

    for (const rx of [-3.0, 3.0]) {
      b.addCylinder('steel', [0.025, 0.025, 0.9, 8], [rx, 0.8, 0.2]);
      b.addCylinder('steel', [0.025, 0.025, 0.9, 8], [rx, 0.8, 1.0]);
      b.addBox('steel', [0.05, 0.05, 1.25], [rx, 1.25, 0.6], [-0.14, 0, 0]);
    }

    // 2. Structural aluminum mullions (8 vertical posts)
    for (let i = 0; i <= numBays; i++) {
      const mx = -facadeWidth / 2 + i * bayWidth;
      b.addBox('frame', [0.08, 6.8, 0.12], [mx, 3.4, 0]);
    }

    // 3. Horizontal transoms & header rails
    b.addBox('frame', [facadeWidth, 0.08, 0.14], [0, 0.04, 0]);
    b.addBox('frame', [facadeWidth, 0.08, 0.14], [0, 3.0, 0]);
    b.addBox('frame', [facadeWidth, 0.06, 0.12], [0, 4.25, 0]);
    b.addBox('frame', [facadeWidth, 0.06, 0.12], [0, 5.5, 0]);
    b.addBox('frame', [facadeWidth, 0.08, 0.16], [0, 6.8, 0]);

    // 4. Glass panes per tier
    for (let bIdx = 0; bIdx < numBays; bIdx++) {
      const cx = -facadeWidth / 2 + (bIdx + 0.5) * bayWidth;
      if (bIdx === 3) {
        b.addBox('glass', [0.92, 2.3, 0.04], [cx - 0.48, 1.5, 0.02]);
        b.addBox('frame', [0.96, 2.34, 0.06], [cx - 0.48, 1.5, 0.02]);
        b.addCylinder('steel', [0.018, 0.018, 0.95, 8], [cx - 0.08, 1.45, 0.08]);

        b.addBox('glass', [0.92, 2.3, 0.04], [cx + 0.48, 1.5, 0.02]);
        b.addBox('frame', [0.96, 2.34, 0.06], [cx + 0.48, 1.5, 0.02]);
        b.addCylinder('steel', [0.018, 0.018, 0.95, 8], [cx + 0.08, 1.45, 0.08]);

        b.addBox('frame', [bayWidth - 0.08, 0.06, 0.1], [cx, 2.65, 0]);
        b.addBox('glass', [bayWidth - 0.08, 0.3, 0.03], [cx, 2.825, 0]);
      } else {
        b.addBox('glass', [bayWidth - 0.08, 2.9, 0.03], [cx, 1.5, 0]);
      }
      b.addBox('glass', [bayWidth - 0.08, 1.18, 0.03], [cx, 3.625, 0]);
      b.addBox('glass', [bayWidth - 0.08, 1.18, 0.03], [cx, 4.875, 0]);
      b.addBox('glass', [bayWidth - 0.08, 1.22, 0.03], [cx, 6.15, 0]);
    }

    // 5. Attic frieze & signage letters
    b.addBox('frieze', [facadeWidth + 0.1, 1.3, 0.28], [0, 6.45, 0.04]);
    b.addBox('frame', [facadeWidth + 0.15, 0.06, 0.14], [0, 5.82, 0.12]);
    b.addBox('frame', [facadeWidth + 0.2, 0.08, 0.36], [0, 7.12, 0.06]);

    const letterGeoms: Record<string, THREE.BufferGeometry> = {
      D: createLetterGeometry('D'),
      A: createLetterGeometry('A'),
      E: createLetterGeometry('E'),
      W: createLetterGeometry('W'),
      O: createLetterGeometry('O'),
      H: createLetterGeometry('H'),
      L: createLetterGeometry('L'),
    };
    const chars = [
      { char: 'D', x: -4.3 },
      { char: 'A', x: -3.5 },
      { char: 'E', x: -2.75 },
      { char: 'W', x: -1.95 },
      { char: 'O', x: -1.15 },
      { char: 'O', x: -0.4 },
      { char: 'H', x: 0.7 },
      { char: 'A', x: 1.5 },
      { char: 'L', x: 2.25 },
      { char: 'L', x: 2.95 },
    ];
    for (const { char, x } of chars) {
      const geom = letterGeoms[char];
      if (geom) {
        b.addGeometry('letters', geom, [x, 6.35, 0.2]);
      }
    }
    for (const g of Object.values(letterGeoms)) g.dispose();

    return b.buildAll();
  }, [facadeWidth, numBays, bayWidth]);

  useEffect(() => () => disposeMergedMap(merged), [merged]);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {merged.steps && <mesh geometry={merged.steps} material={materials.stepsMat} receiveShadow raycast={NO_RAYCAST} />}
      {merged.steel && <mesh geometry={merged.steel} material={materials.steelMat} raycast={NO_RAYCAST} />}
      {merged.frame && <mesh geometry={merged.frame} material={materials.frameMat} castShadow raycast={NO_RAYCAST} />}
      {merged.glass && <mesh geometry={merged.glass} material={materials.glassMat} raycast={NO_RAYCAST} />}
      {merged.frieze && <mesh geometry={merged.frieze} material={materials.friezeMat} castShadow receiveShadow raycast={NO_RAYCAST} />}
      {merged.letters && <mesh geometry={merged.letters} material={materials.lettersMat} raycast={NO_RAYCAST} />}

      {includeTrees && <BirchTreesGroup facadeWidth={facadeWidth} />}
    </group>
  );
}

function BirchTreesGroup({ facadeWidth }: { facadeWidth: number }) {
  const treeMaterials = useMemo(() => {
    const barkWhiteMat = new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      roughness: 0.85,
      metalness: 0.05,
    });
    const barkDarkMat = new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.9,
    });
    const leafMat = new THREE.MeshStandardMaterial({
      color: '#4d7c0f',
      roughness: 0.75,
      metalness: 0.05,
    });
    return { barkWhiteMat, barkDarkMat, leafMat };
  }, []);

  const merged = useMemo(() => {
    const b = new StaticGeometryBatcher();
    const trees = [
      { x: -facadeWidth * 0.28, z: 0.9, height: 6.2, r: 0.065 },
      { x: -facadeWidth * 0.16, z: 1.1, height: 7.0, r: 0.075 },
      { x: -facadeWidth * 0.02, z: 0.85, height: 7.6, r: 0.08 },
      { x: facadeWidth * 0.22, z: 1.05, height: 6.6, r: 0.07 },
      { x: facadeWidth * 0.36, z: 0.8, height: 6.1, r: 0.065 },
    ];
    for (const t of trees) {
      b.addCylinder('barkWhite', [t.r * 0.7, t.r, t.height, 8], [t.x, t.height / 2, t.z]);
      for (const ry of [1.2, 2.4, 3.6, 4.8]) {
        b.addCylinder('barkDark', [t.r * 0.95, t.r * 0.95, 0.08, 8], [t.x, ry, t.z]);
      }
      b.addSphere('leaf', [0.95, 8, 6], [t.x, t.height - 0.5, t.z]);
      b.addSphere('leaf', [0.75, 8, 6], [t.x + 0.2, t.height + 0.2, t.z + 0.1]);
      b.addSphere('leaf', [0.8, 8, 6], [t.x - 0.25, t.height - 1.2, t.z - 0.1]);
    }
    return b.buildAll();
  }, [facadeWidth]);

  useEffect(() => () => disposeMergedMap(merged), [merged]);

  return (
    <group name="daewoo-birch-trees">
      {merged.barkWhite && <mesh geometry={merged.barkWhite} material={treeMaterials.barkWhiteMat} castShadow raycast={NO_RAYCAST} />}
      {merged.barkDark && <mesh geometry={merged.barkDark} material={treeMaterials.barkDarkMat} raycast={NO_RAYCAST} />}
      {merged.leaf && <mesh geometry={merged.leaf} material={treeMaterials.leafMat} castShadow raycast={NO_RAYCAST} />}
    </group>
  );
}
