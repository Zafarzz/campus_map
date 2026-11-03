import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  StaticGeometryBatcher,
  disposeMergedMap,
  NO_RAYCAST,
} from '../geometry/staticGeometryMerger';

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

function createGableRoofGeometry(
  spanWidth: number,
  peakHeight: number,
  depth: number
): THREE.BufferGeometry {
  const hw = spanWidth / 2;
  const shape = new THREE.Shape();

  shape.moveTo(-hw, 0);
  shape.lineTo(0, peakHeight);
  shape.lineTo(hw, 0);
  shape.closePath();

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: depth + 0.4,
    bevelEnabled: false,
  });

  geom.translate(0, 0, -(depth + 0.4) / 2);
  geom.computeVertexNormals();
  return geom;
}

/**
 * 3-Gable Sharp Triangular Pitched Roof (Многощипцовая трехскатная кровля) for Sports Complex.
 */
export function SportsComplexRoof({
  width = 57.0,
  depth = 37.5,
  height = 6.9,
  color = '#22252a',
  opacity = 1,
  transparent = false,
}: SportsComplexRoofProps) {
  const numGables = 3;
  const gableWidth = width / numGables;
  const halfGableW = gableWidth / 2;

  const slopeAngle = Math.atan2(height, halfGableW);
  const slopeLength = Math.hypot(halfGableW, height);

  const materials = useMemo(() => {
    const roofMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      metalness: 0.12,
      transparent,
      opacity,
      side: THREE.DoubleSide,
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: '#181b20',
      roughness: 0.5,
      metalness: 0.4,
      transparent,
      opacity,
    });

    const rakeTrimMat = new THREE.MeshStandardMaterial({
      color: '#e2e8f0',
      roughness: 0.7,
      metalness: 0.1,
      transparent,
      opacity,
    });

    const corniceMat = new THREE.MeshStandardMaterial({
      color: '#1e2229',
      roughness: 0.75,
      metalness: 0.2,
      transparent,
      opacity,
    });

    return { roofMat, trimMat, rakeTrimMat, corniceMat };
  }, [color, opacity, transparent]);

  const merged = useMemo(() => {
    const b = new StaticGeometryBatcher();

    b.addBox('cornice', [width + 0.3, 0.1, depth + 0.4], [0, 0.05, 0]);
    const gableRoofGeo = createGableRoofGeometry(gableWidth, height, depth);

    for (let i = 0; i < numGables; i++) {
      const gx = -width / 2 + (i + 0.5) * gableWidth;
      b.addGeometry('roof', gableRoofGeo, [gx, 0.1, 0]);
      b.addBox('trim', [0.38, 0.14, depth + 0.6], [gx, 0.1 + height + 0.07, 0]);
      b.addBox('rake', [slopeLength + 0.25, 0.16, 0.08], [gx - halfGableW / 2, 0.1 + height / 2, -depth / 2 - 0.21], [0, 0, slopeAngle]);
      b.addBox('rake', [slopeLength + 0.25, 0.16, 0.08], [gx + halfGableW / 2, 0.1 + height / 2, -depth / 2 - 0.21], [0, 0, -slopeAngle]);
      b.addBox('rake', [slopeLength + 0.25, 0.16, 0.08], [gx - halfGableW / 2, 0.1 + height / 2, depth / 2 + 0.21], [0, 0, slopeAngle]);
      b.addBox('rake', [slopeLength + 0.25, 0.16, 0.08], [gx + halfGableW / 2, 0.1 + height / 2, depth / 2 + 0.21], [0, 0, -slopeAngle]);
    }
    gableRoofGeo.dispose();

    for (const vx of [-width / 6, width / 6]) {
      b.addBox('trim', [0.42, 0.06, depth + 0.5], [vx, 0.12, 0]);
    }

    return b.buildAll();
  }, [width, depth, height, numGables, gableWidth, halfGableW, slopeAngle, slopeLength]);

  useEffect(() => () => disposeMergedMap(merged), [merged]);

  return (
    <group position={[0, 0, 0]}>
      {merged.cornice && <mesh geometry={merged.cornice} material={materials.corniceMat} receiveShadow raycast={NO_RAYCAST} />}
      {merged.roof && <mesh geometry={merged.roof} material={materials.roofMat} castShadow receiveShadow raycast={NO_RAYCAST} />}
      {merged.trim && <mesh geometry={merged.trim} material={materials.trimMat} castShadow raycast={NO_RAYCAST} />}
      {merged.rake && <mesh geometry={merged.rake} material={materials.rakeTrimMat} raycast={NO_RAYCAST} />}
    </group>
  );
}

/**
 * Front Facade Elements for Sports Complex
 */
export function SportsComplexFrontFacade({
  width = 57.0,
  depth = 37.5,
  opacity = 1,
  transparent = false,
}: SportsComplexFrontFacadeProps) {
  const materials = useMemo(() => {
    const stoneMat = new THREE.MeshStandardMaterial({
      color: '#dcd5c9',
      roughness: 0.88,
      metalness: 0.05,
      transparent,
      opacity,
    });

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

    const steelMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      roughness: 0.2,
      metalness: 0.9,
      transparent,
      opacity,
    });

    return { stoneMat, frameMat, glassMat, steelMat };
  }, [opacity, transparent]);

  const frontZ = -depth / 2;

  const merged = useMemo(() => {
    const b = new StaticGeometryBatcher();

    // 1. Stone base wall
    b.addBox('stone', [width + 0.1, 2.2, 0.14], [0, 1.1, -0.06]);
    b.addBox('stone', [width + 0.1, 0.6, 0.12], [0, 2.5, -0.06]);
    b.addBox('frame', [width + 0.15, 0.05, 0.16], [0, 2.2, -0.04]);

    // 2. Three glazed entrance vestibules
    const vestibuleW = 13.0;
    const vestibuleH = 3.34;
    const vestibuleD = 2.2;
    const vz = -vestibuleD / 2;
    const fz = vz - vestibuleD / 2;

    for (const ex of [-19.0, 0.0, 19.0]) {
      b.addBox('frame', [vestibuleW + 0.2, 0.16, vestibuleD + 0.2], [ex, 0.08, vz]);
      b.addBox('frame', [vestibuleW + 0.4, 0.2, vestibuleD + 0.4], [ex, vestibuleH + 0.1, vz]);
      b.addBox('glass', [4.2, vestibuleH - 0.2, 0.04], [ex - 4.35, vestibuleH / 2 + 0.08, fz]);
      b.addBox('glass', [4.6, vestibuleH - 0.2, 0.04], [ex + 0.15, vestibuleH / 2 + 0.08, fz]);

      // Portal at ex + 4.5
      const px = ex + 4.5;
      b.addBox('glass', [0.94, 2.36, 0.03], [px - 0.48, 1.3, fz + 0.02]);
      b.addBox('frame', [0.98, 2.4, 0.05], [px - 0.48, 1.3, fz + 0.02]);
      b.addCylinder('steel', [0.016, 0.016, 0.9, 8], [px - 0.08, 1.25, fz + 0.07]);
      b.addBox('glass', [0.94, 2.36, 0.03], [px + 0.48, 1.3, fz + 0.02]);
      b.addBox('frame', [0.98, 2.4, 0.05], [px + 0.48, 1.3, fz + 0.02]);
      b.addCylinder('steel', [0.016, 0.016, 0.9, 8], [px + 0.08, 1.25, fz + 0.07]);
      b.addBox('glass', [1.96, 0.7, 0.03], [px, 2.85, fz + 0.02]);
      b.addBox('glass', [0.96, vestibuleH - 0.2, 0.04], [px - 1.48, vestibuleH / 2 + 0.08, fz + 0.02]);
      b.addBox('glass', [0.96, vestibuleH - 0.2, 0.04], [px + 1.48, vestibuleH / 2 + 0.08, fz + 0.02]);

      for (const postX of [-vestibuleW / 2, -2.2, 2.5, vestibuleW / 2]) {
        b.addBox('frame', [0.1, vestibuleH, 0.1], [ex + postX, vestibuleH / 2 + 0.08, fz]);
      }

      b.addBox('glass', [0.04, vestibuleH - 0.2, vestibuleD - 0.1], [ex - vestibuleW / 2, vestibuleH / 2 + 0.08, vz]);
      b.addBox('glass', [0.04, vestibuleH - 0.2, vestibuleD - 0.1], [ex + vestibuleW / 2, vestibuleH / 2 + 0.08, vz]);
    }

    return b.buildAll();
  }, [width]);

  useEffect(() => () => disposeMergedMap(merged), [merged]);

  return (
    <group position={[0, 0, frontZ]}>
      {merged.stone && <mesh geometry={merged.stone} material={materials.stoneMat} receiveShadow raycast={NO_RAYCAST} />}
      {merged.frame && <mesh geometry={merged.frame} material={materials.frameMat} castShadow receiveShadow raycast={NO_RAYCAST} />}
      {merged.glass && <mesh geometry={merged.glass} material={materials.glassMat} raycast={NO_RAYCAST} />}
      {merged.steel && <mesh geometry={merged.steel} material={materials.steelMat} raycast={NO_RAYCAST} />}
    </group>
  );
}

/**
 * Commemorative Monument / Stela («CONFERENCE HALL ANHOR») with stepped granite pedestal.
 */
export function CommemorativeStela({
  position = [0, 0, 0],
  rotationY = 0,
}: {
  position?: [number, number, number];
  rotationY?: number;
}) {
  const materials = useMemo(() => {
    const graniteMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.35,
      metalness: 0.15,
    });
    const stelaMat = new THREE.MeshStandardMaterial({
      color: '#f1f5f9',
      roughness: 0.65,
    });
    const frameMat = new THREE.MeshStandardMaterial({
      color: '#d97706',
      roughness: 0.4,
      metalness: 0.8,
    });
    return { graniteMat, stelaMat, frameMat };
  }, []);

  const merged = useMemo(() => {
    const b = new StaticGeometryBatcher();
    b.addBox('granite', [1.4, 0.3, 0.8], [0, 0.15, 0]);
    b.addBox('granite', [1.1, 0.25, 0.6], [0, 0.4, 0]);
    return b.buildAll();
  }, []);

  useEffect(() => () => disposeMergedMap(merged), [merged]);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {merged.granite && <mesh geometry={merged.granite} material={materials.graniteMat} castShadow receiveShadow raycast={NO_RAYCAST} />}
      <mesh position={[0, 1.35, 0]} material={materials.stelaMat} castShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[0.95, 1.5, 0.24]} />
      </mesh>
      <mesh position={[0, 1.45, -0.13]} material={materials.frameMat} raycast={NO_RAYCAST}>
        <boxGeometry args={[0.7, 0.55, 0.02]} />
      </mesh>
    </group>
  );
}
