import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  StaticGeometryBatcher,
  disposeMergedMap,
  NO_RAYCAST,
} from './geometry/staticGeometryMerger';

export const AJOU_ART_DIMENSIONS = {
  foundationLength: 7.2,
  foundationWidth: 0.6,
  foundationHeight: 0.15,
  frameLength: 6.8,
  frameWidth: 0.35,
  frameHeight: 0.15,
  letterIWidth: 0.35,
  letterIHeight: 1.65,
  letterDepth: 0.12,
  heartWidth: 2.1,
  heartHeight: 1.8,
  heartDepth: 0.12,
  letterAWidth: 1.0,
  letterAHeight: 1.2,
  letterJWidth: 0.8,
  letterJHeight: 1.2,
  letterOWidth: 0.9,
  letterOHeight: 1.1,
  letterUWidth: 0.9,
  letterUHeight: 1.1,
} as const;

export const AJOU_ART_MATERIALS = {
  navyLacquer: '#1A2840',
  heartRed: '#8B2635',
  steelFrame: '#B8C0C8',
  whiteFace: '#FFFFFF',
  concrete: '#94A3B8',
} as const;

export type AjouArtObjectProps = {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
};

/**
 * Высокоточная 3D-модель арт-объекта "I ♥ AJOU" у главного входа кампуса.
 */
export function AjouArtObject({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
}: AjouArtObjectProps) {
  const materials = useMemo(() => {
    const navyMat = new THREE.MeshStandardMaterial({
      color: AJOU_ART_MATERIALS.navyLacquer,
      roughness: 0.35,
      metalness: 0.3,
    });

    const heartMat = new THREE.MeshStandardMaterial({
      color: AJOU_ART_MATERIALS.heartRed,
      roughness: 0.3,
      metalness: 0.15,
    });

    const frameMat = new THREE.MeshStandardMaterial({
      color: AJOU_ART_MATERIALS.steelFrame,
      roughness: 0.45,
      metalness: 0.7,
    });

    const whiteMat = new THREE.MeshStandardMaterial({
      color: AJOU_ART_MATERIALS.whiteFace,
      emissive: AJOU_ART_MATERIALS.whiteFace,
      emissiveIntensity: 0.25,
      roughness: 0.2,
      metalness: 0.05,
    });

    const concreteMat = new THREE.MeshStandardMaterial({
      color: AJOU_ART_MATERIALS.concrete,
      roughness: 0.9,
      metalness: 0.05,
    });

    return { navyMat, heartMat, frameMat, whiteMat, concreteMat };
  }, []);

  const letterIGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.175, 0);
    shape.lineTo(0.175, 0);
    shape.lineTo(0.175, 0.1);
    shape.lineTo(0.11, 0.1);
    shape.lineTo(0.11, 1.55);
    shape.lineTo(0.175, 1.55);
    shape.lineTo(0.175, 1.65);
    shape.lineTo(-0.175, 1.65);
    shape.lineTo(-0.175, 1.55);
    shape.lineTo(-0.11, 1.55);
    shape.lineTo(-0.11, 0.1);
    shape.lineTo(-0.175, 0.1);
    shape.closePath();

    return new THREE.ExtrudeGeometry(shape, {
      depth: AJOU_ART_DIMENSIONS.letterDepth,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.008,
      bevelThickness: 0.008,
    });
  }, []);

  const heartGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.35);
    shape.bezierCurveTo(-0.35, -0.05, -0.85, 0.55, -0.85, 1.15);
    shape.bezierCurveTo(-0.85, 1.50, -0.55, 1.68, -0.35, 1.68);
    shape.bezierCurveTo(-0.15, 1.68, 0, 1.42, 0.04, 1.25);
    shape.bezierCurveTo(0.08, 1.48, 0.25, 1.85, 0.60, 1.85);
    shape.bezierCurveTo(0.95, 1.85, 1.25, 1.65, 1.25, 1.28);
    shape.bezierCurveTo(1.25, 0.75, 0.50, 0.10, 0, -0.35);

    const hole = new THREE.Path();
    hole.moveTo(0.02, 0.05);
    hole.bezierCurveTo(0.35, 0.35, 0.95, 0.85, 0.95, 1.25);
    hole.bezierCurveTo(0.95, 1.55, 0.72, 1.66, 0.52, 1.66);
    hole.bezierCurveTo(0.24, 1.66, 0.08, 1.38, 0.04, 1.15);
    hole.bezierCurveTo(0, 1.35, -0.15, 1.50, -0.32, 1.50);
    hole.bezierCurveTo(-0.48, 1.50, -0.65, 1.38, -0.65, 1.15);
    hole.bezierCurveTo(-0.65, 0.75, -0.22, 0.25, 0.02, 0.05);
    shape.holes.push(hole);

    return new THREE.ExtrudeGeometry(shape, {
      depth: AJOU_ART_DIMENSIONS.heartDepth,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.015,
      bevelThickness: 0.015,
    });
  }, []);

  const letterAGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, 0);
    shape.lineTo(-0.12, 1.2);
    shape.lineTo(0.12, 1.2);
    shape.lineTo(0.5, 0);
    shape.lineTo(0.32, 0);
    shape.lineTo(0.17, 0.4);
    shape.lineTo(-0.17, 0.4);
    shape.lineTo(-0.32, 0);
    shape.closePath();

    const hole = new THREE.Path();
    hole.moveTo(-0.13, 0.58);
    hole.lineTo(0.13, 0.58);
    hole.lineTo(0, 0.98);
    hole.closePath();
    shape.holes.push(hole);

    return new THREE.ExtrudeGeometry(shape, {
      depth: AJOU_ART_DIMENSIONS.letterDepth,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.008,
      bevelThickness: 0.008,
    });
  }, []);

  const letterJGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.1, 1.2);
    shape.lineTo(0.4, 1.2);
    shape.lineTo(0.4, 0.35);
    shape.bezierCurveTo(0.4, 0.0, 0.2, 0.0, 0.05, 0.0);
    shape.bezierCurveTo(-0.25, 0.0, -0.4, 0.15, -0.4, 0.42);
    shape.lineTo(-0.22, 0.42);
    shape.bezierCurveTo(-0.22, 0.22, -0.1, 0.18, 0.05, 0.18);
    shape.bezierCurveTo(0.18, 0.18, 0.22, 0.22, 0.22, 0.35);
    shape.lineTo(0.22, 1.05);
    shape.lineTo(-0.1, 1.05);
    shape.closePath();

    return new THREE.ExtrudeGeometry(shape, {
      depth: AJOU_ART_DIMENSIONS.letterDepth,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.008,
      bevelThickness: 0.008,
    });
  }, []);

  const letterOGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    const rx = AJOU_ART_DIMENSIONS.letterOWidth / 2;
    const ry = AJOU_ART_DIMENSIONS.letterOHeight / 2;
    shape.absellipse(0, ry, rx, ry, 0, Math.PI * 2, false, 0);

    const hole = new THREE.Path();
    hole.absellipse(0, ry, rx - 0.18, ry - 0.18, 0, Math.PI * 2, true, 0);
    shape.holes.push(hole);

    return new THREE.ExtrudeGeometry(shape, {
      depth: AJOU_ART_DIMENSIONS.letterDepth,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.008,
      bevelThickness: 0.008,
    });
  }, []);

  const letterUGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.45, 1.1);
    shape.lineTo(-0.27, 1.1);
    shape.lineTo(-0.27, 0.4);
    shape.bezierCurveTo(-0.27, 0.18, -0.15, 0.18, 0, 0.18);
    shape.bezierCurveTo(0.15, 0.18, 0.27, 0.18, 0.27, 0.4);
    shape.lineTo(0.27, 1.1);
    shape.lineTo(0.45, 1.1);
    shape.lineTo(0.45, 0.4);
    shape.bezierCurveTo(0.45, 0.0, 0.25, 0.0, 0, 0.0);
    shape.bezierCurveTo(-0.25, 0.0, -0.45, 0.0, -0.45, 0.4);
    shape.closePath();

    return new THREE.ExtrudeGeometry(shape, {
      depth: AJOU_ART_DIMENSIONS.letterDepth,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.008,
      bevelThickness: 0.008,
    });
  }, []);

  const d = AJOU_ART_DIMENSIONS;
  const frameY = d.frameHeight;
  const zOffset = -d.letterDepth / 2;

  const merged = useMemo(() => {
    const b = new StaticGeometryBatcher();
    b.addBox('concrete', [d.foundationLength, 0.12, d.foundationWidth], [0, 0.06, 0]);
    b.addBox('frame', [d.frameLength, 0.06, d.frameWidth], [0, frameY - 0.03, 0]);
    for (const xPost of [-2.5, -0.85, 0.85, 2.5]) {
      b.addCylinder('frame', [0.045, 0.045, 0.12, 10], [xPost, 0.06, 0]);
      b.addBox('frame', [0.16, 0.02, 0.16], [xPost, 0.11, 0]);
    }
    return b.buildAll();
  }, [d.foundationLength, d.foundationWidth, d.frameLength, d.frameWidth, frameY]);

  useEffect(() => () => disposeMergedMap(merged), [merged]);

  const illuminatedLetterMats = useMemo(
    () => [materials.whiteMat, materials.navyMat],
    [materials.whiteMat, materials.navyMat],
  );

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {merged.concrete && <mesh geometry={merged.concrete} material={materials.concreteMat} receiveShadow raycast={NO_RAYCAST} />}
      {merged.frame && <mesh geometry={merged.frame} material={materials.frameMat} castShadow receiveShadow raycast={NO_RAYCAST} />}
      <mesh position={[-3.075, frameY, zOffset]} geometry={letterIGeometry} material={materials.navyMat} castShadow receiveShadow raycast={NO_RAYCAST} />
      <mesh position={[-1.7, frameY, zOffset]} geometry={heartGeometry} material={materials.heartMat} castShadow receiveShadow raycast={NO_RAYCAST} />
      <mesh position={[0.0, frameY, zOffset]} geometry={letterAGeometry} material={illuminatedLetterMats} castShadow receiveShadow raycast={NO_RAYCAST} />
      <mesh position={[1.0, frameY, zOffset]} geometry={letterJGeometry} material={illuminatedLetterMats} castShadow receiveShadow raycast={NO_RAYCAST} />
      <mesh position={[1.95, frameY, zOffset]} geometry={letterOGeometry} material={illuminatedLetterMats} castShadow receiveShadow raycast={NO_RAYCAST} />
      <mesh position={[2.95, frameY, zOffset]} geometry={letterUGeometry} material={illuminatedLetterMats} castShadow receiveShadow raycast={NO_RAYCAST} />
    </group>
  );
}
