import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import { mapConfig } from '../../config/mapConfig';
import { disposeMergedMap, mergeStaticGeometries } from './geometry/staticGeometryMerger';

/**
 * Merges an array of BufferGeometries into a single BufferGeometry for optimal draw-call efficiency.
 */
function mergeGeometries(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeStaticGeometries(geoms);
}


// ============================================================================
// WEST FOYER & CORRIDOR INTERIOR (5.53m x 10.76m x 2.6m)
// Blueprint Passages:
// - Blue Arrows "B": Two exterior entrance double-doors on West Wall
// - East Side: Open threshold connecting into Room 5
// - North Door: Access to Northwest Staircase
// - South Door: Access to Restrooms
// ============================================================================

export type BlockCFoyerProps = {
  position: [number, number, number] | readonly [number, number, number];
  size: [number, number, number] | readonly [number, number, number];
  selected?: boolean;
};

export function BlockCFoyerInterior3D({ position, size, selected = false }: BlockCFoyerProps) {
  const [widthX, heightY, lengthZ] = size;
  const floorY = -heightY / 2;
  const ceilingY = heightY / 2;
  const halfW = widthX / 2;
  const halfL = lengthZ / 2;

  const materials = useMemo(() => {
    return {
      floorTile: new THREE.MeshStandardMaterial({
        color: '#e2e8f0',
        roughness: 0.25,
        metalness: 0.1,
      }),
      wallPlaster: new THREE.MeshStandardMaterial({
        color: '#f1f5f9',
        roughness: 0.8,
      }),
      frameDark: new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.35,
        metalness: 0.8,
      }),
      glassDoors: new THREE.MeshStandardMaterial({
        color: '#93c5fd',
        transparent: true,
        opacity: 0.45,
        roughness: 0.1,
      }),
      blueIndicatorGlow: new THREE.MeshStandardMaterial({
        color: '#0284c7',
        emissive: '#0ea5e9',
        emissiveIntensity: 0.95,
        roughness: 0.2,
      }),
      benchWood: new THREE.MeshStandardMaterial({
        color: '#92400e',
        roughness: 0.4,
      }),
      metalBlack: new THREE.MeshStandardMaterial({
        color: '#0f172a',
        roughness: 0.4,
        metalness: 0.7,
      }),
      kioskScreen: new THREE.MeshStandardMaterial({
        color: '#020617',
        emissive: '#0284c7',
        emissiveIntensity: 0.8,
        roughness: 0.2,
      }),
    };
  }, []);

  const geometries = useMemo(() => {
    const wallParts: THREE.BufferGeometry[] = [];
    const frameParts: THREE.BufferGeometry[] = [];
    const glassParts: THREE.BufferGeometry[] = [];
    const blueGlowParts: THREE.BufferGeometry[] = [];
    const woodParts: THREE.BufferGeometry[] = [];
    const metalParts: THREE.BufferGeometry[] = [];
    const screenParts: THREE.BufferGeometry[] = [];

    const wallThick = 0.22;
    const doorH = 2.2;
    const doorW = 1.8;

    // -------------------------------------------------------------
    // WEST WALL with Passages "B" (indicated by two blue arrows)
    // - Portal B1: Z = -2.5
    // - Portal B2: Z = +2.5
    // -------------------------------------------------------------
    const westX = -halfW + wallThick / 2;
    const b1Z = -2.5;
    const b2Z = 2.5;

    // West solid segments
    const wSeg1L = (b1Z - doorW / 2) - (-halfL);
    const wSeg1 = new THREE.BoxGeometry(wallThick, heightY, wSeg1L);
    wSeg1.translate(westX, 0, -halfL + wSeg1L / 2);
    wallParts.push(wSeg1);

    const wSeg2L = (b2Z - doorW / 2) - (b1Z + doorW / 2);
    const wSeg2 = new THREE.BoxGeometry(wallThick, heightY, wSeg2L);
    wSeg2.translate(westX, 0, b1Z + doorW / 2 + wSeg2L / 2);
    wallParts.push(wSeg2);

    const wSeg3L = halfL - (b2Z + doorW / 2);
    const wSeg3 = new THREE.BoxGeometry(wallThick, heightY, wSeg3L);
    wSeg3.translate(westX, 0, halfL - wSeg3L / 2);
    wallParts.push(wSeg3);

    // Lintels and doors for B1 and B2
    for (const bz of [b1Z, b2Z]) {
      const lintel = new THREE.BoxGeometry(wallThick, heightY - doorH, doorW);
      lintel.translate(westX, floorY + doorH + (heightY - doorH) / 2, bz);
      wallParts.push(lintel);

      const frame = new THREE.BoxGeometry(0.08, doorH + 0.04, doorW + 0.08);
      frame.translate(westX, floorY + doorH / 2, bz);
      frameParts.push(frame);

      const glass = new THREE.BoxGeometry(0.03, doorH - 0.1, doorW - 0.1);
      glass.translate(westX, floorY + doorH / 2, bz);
      glassParts.push(glass);

      // Blue Arrow "B" Glowing Floor Threshold & Exterior Canopy Ledge
      const glowThreshold = new THREE.BoxGeometry(0.4, 0.02, doorW + 0.2);
      glowThreshold.translate(westX + 0.2, floorY + 0.02, bz);
      blueGlowParts.push(glowThreshold);

      const canopyGlow = new THREE.BoxGeometry(0.08, 0.06, doorW + 0.4);
      canopyGlow.translate(westX - 0.08, floorY + doorH + 0.05, bz);
      blueGlowParts.push(canopyGlow);
    }

    // -------------------------------------------------------------
    // NORTH WALL (Door to Northwest Staircase)
    // -------------------------------------------------------------
    const northZ = -halfL + wallThick / 2;
    const stairDoorW = 1.2;
    const nWall1 = new THREE.BoxGeometry(halfW - stairDoorW / 2, heightY, wallThick);
    nWall1.translate(-halfW + (halfW - stairDoorW / 2) / 2, 0, northZ);
    wallParts.push(nWall1);

    const nLintel = new THREE.BoxGeometry(stairDoorW, heightY - doorH, wallThick);
    nLintel.translate(0, floorY + doorH + (heightY - doorH) / 2, northZ);
    wallParts.push(nLintel);

    const nDoor = new THREE.BoxGeometry(stairDoorW - 0.06, doorH - 0.04, 0.05);
    nDoor.translate(0, floorY + doorH / 2, northZ);
    woodParts.push(nDoor);

    // -------------------------------------------------------------
    // SOUTH WALL (Door to Restrooms)
    // -------------------------------------------------------------
    const southZ = halfL - wallThick / 2;
    const sDoorW = 1.2;
    const sLintel = new THREE.BoxGeometry(sDoorW, heightY - doorH, wallThick);
    sLintel.translate(0, floorY + doorH + (heightY - doorH) / 2, southZ);
    wallParts.push(sLintel);

    const sWall1 = new THREE.BoxGeometry(halfW - sDoorW / 2, heightY, wallThick);
    sWall1.translate(-halfW + (halfW - sDoorW / 2) / 2, 0, southZ);
    wallParts.push(sWall1);

    const sDoor = new THREE.BoxGeometry(sDoorW - 0.06, doorH - 0.04, 0.05);
    sDoor.translate(0, floorY + doorH / 2, southZ);
    woodParts.push(sDoor);

    // -------------------------------------------------------------
    // EAST WALL (Opening connecting to Room 5 at north, partition at south)
    // -------------------------------------------------------------
    const eastX = halfW - wallThick / 2;
    // South half has partition wall
    const eSolidL = halfL; // Southern 5.38m
    const eWall = new THREE.BoxGeometry(wallThick, heightY, eSolidL);
    eWall.translate(eastX, 0, halfL - eSolidL / 2);
    wallParts.push(eWall);

    // Northern 5.38m is open walkthrough to Room 5!
    const eLintel = new THREE.BoxGeometry(wallThick, heightY - doorH, halfL);
    eLintel.translate(eastX, floorY + doorH + (heightY - doorH) / 2, -halfL + halfL / 2);
    wallParts.push(eLintel);

    // -------------------------------------------------------------
    // FURNITURE: Information Kiosk, Bench & Directory Totem
    // -------------------------------------------------------------
    // Interactive Directory Totem
    const kioskBase = new THREE.BoxGeometry(0.8, 1.8, 0.25);
    kioskBase.translate(0.6, floorY + 0.9, 0.5);
    metalParts.push(kioskBase);

    const kScreen = new THREE.BoxGeometry(0.65, 0.9, 0.02);
    kScreen.translate(0.6, floorY + 1.2, 0.5 - 0.13);
    screenParts.push(kScreen);

    // Comfortable Foyer Benches along solid wall
    for (const bz of [-0.5, 3.8]) {
      const bench = new THREE.BoxGeometry(0.6, 0.44, 2.0);
      bench.translate(eastX - 0.45, floorY + 0.22, bz);
      woodParts.push(bench);

      for (const legZ of [-0.8, 0.8]) {
        const leg = new THREE.BoxGeometry(0.55, 0.42, 0.06);
        leg.translate(eastX - 0.45, floorY + 0.21, bz + legZ);
        metalParts.push(leg);
      }
    }

    return {
      wall: mergeGeometries(wallParts),
      frame: mergeGeometries(frameParts),
      glass: mergeGeometries(glassParts),
      blueGlow: mergeGeometries(blueGlowParts),
      wood: mergeGeometries(woodParts),
      metal: mergeGeometries(metalParts),
      screen: mergeGeometries(screenParts),
    };
  }, [widthX, heightY, lengthZ, floorY, ceilingY, halfW, halfL]);

  useEffect(() => () => disposeMergedMap(geometries), [geometries]);
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);

  return (
    <group position={position}>
      {/* 1. Floor Tile Slab */}
      <mesh position={[0, floorY + 0.01, 0]}>
        <boxGeometry args={[widthX - 0.04, 0.02, lengthZ - 0.04]} />
        <primitive object={materials.floorTile} attach="material" />
      </mesh>

      {/* 2. Architecture & Elements */}
      <mesh geometry={geometries.wall}>
        <primitive object={materials.wallPlaster} attach="material" />
      </mesh>
      <mesh geometry={geometries.frame}>
        <primitive object={materials.frameDark} attach="material" />
      </mesh>
      <mesh geometry={geometries.glass}>
        <primitive object={materials.glassDoors} attach="material" />
      </mesh>
      <mesh geometry={geometries.blueGlow}>
        <primitive object={materials.blueIndicatorGlow} attach="material" />
      </mesh>
      <mesh geometry={geometries.wood}>
        <primitive object={materials.benchWood} attach="material" />
      </mesh>
      <mesh geometry={geometries.metal}>
        <primitive object={materials.metalBlack} attach="material" />
      </mesh>
      <mesh geometry={geometries.screen}>
        <primitive object={materials.kioskScreen} attach="material" />
      </mesh>

      {selected && (
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={size} />
          <meshBasicMaterial visible={false} />
          <Edges color={mapConfig.colors.roomSelected} lineWidth={3} />
        </mesh>
      )}
    </group>
  );
}

// ============================================================================
// RESTROOMS / TOILETS (5.53m x 6.31m x 2.6m)
// ============================================================================

export type BlockCWCProps = {
  position: [number, number, number] | readonly [number, number, number];
  size: [number, number, number] | readonly [number, number, number];
  selected?: boolean;
};

export function BlockCWCInterior3D({ position, size, selected = false }: BlockCWCProps) {
  const [widthX, heightY, lengthZ] = size;
  const floorY = -heightY / 2;
  const halfW = widthX / 2;
  const halfL = lengthZ / 2;

  const materials = useMemo(() => {
    return {
      floorTile: new THREE.MeshStandardMaterial({
        color: '#cbd5e1',
        roughness: 0.2,
      }),
      wallTile: new THREE.MeshStandardMaterial({
        color: '#f8fafc',
        roughness: 0.25,
      }),
      stallWood: new THREE.MeshStandardMaterial({
        color: '#475569',
        roughness: 0.5,
      }),
      ceramicWhite: new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.1,
      }),
      mirror: new THREE.MeshStandardMaterial({
        color: '#e2e8f0',
        metalness: 0.95,
        roughness: 0.05,
      }),
    };
  }, []);

  const geometries = useMemo(() => {
    const wallParts: THREE.BufferGeometry[] = [];
    const stallParts: THREE.BufferGeometry[] = [];
    const ceramicParts: THREE.BufferGeometry[] = [];
    const mirrorParts: THREE.BufferGeometry[] = [];

    const wallThick = 0.2;

    // Perimeter Enclosing Walls
    // North wall (dividing from foyer, with entrance door)
    const nWall = new THREE.BoxGeometry(widthX, heightY, wallThick);
    nWall.translate(0, 0, -halfL + wallThick / 2);
    wallParts.push(nWall);

    // South wall (dividing from canteen)
    const sWall = new THREE.BoxGeometry(widthX, heightY, wallThick);
    sWall.translate(0, 0, halfL - wallThick / 2);
    wallParts.push(sWall);

    // West wall
    const wWall = new THREE.BoxGeometry(wallThick, heightY, lengthZ);
    wWall.translate(-halfW + wallThick / 2, 0, 0);
    wallParts.push(wWall);

    // East wall (dividing from Room 5)
    const eWall = new THREE.BoxGeometry(wallThick, heightY, lengthZ);
    eWall.translate(halfW - wallThick / 2, 0, 0);
    wallParts.push(eWall);

    // Central dividing partition between Male and Female sections
    const divider = new THREE.BoxGeometry(widthX - 1.6, heightY, wallThick);
    divider.translate(-0.8, 0, 0);
    wallParts.push(divider);

    // Toilet cubicles (4 stalls)
    for (const cz of [-1.8, -0.6, 0.6, 1.8]) {
      const stallDivider = new THREE.BoxGeometry(1.6, 2.0, 0.04);
      stallDivider.translate(-halfW + 1.2, floorY + 1.0, cz);
      stallParts.push(stallDivider);

      const toiletBowl = new THREE.BoxGeometry(0.4, 0.42, 0.55);
      toiletBowl.translate(-halfW + 0.6, floorY + 0.21, cz);
      ceramicParts.push(toiletBowl);
    }

    // Vanity Sinks & Mirrors along East partition
    const vanityCounter = new THREE.BoxGeometry(0.65, 0.85, 4.2);
    vanityCounter.translate(halfW - 0.6, floorY + 0.42, 0);
    ceramicParts.push(vanityCounter);

    const mirror = new THREE.BoxGeometry(0.04, 1.1, 4.0);
    mirror.translate(halfW - wallThick - 0.02, floorY + 1.5, 0);
    mirrorParts.push(mirror);

    return {
      wall: mergeGeometries(wallParts),
      stall: mergeGeometries(stallParts),
      ceramic: mergeGeometries(ceramicParts),
      mirror: mergeGeometries(mirrorParts),
    };
  }, [widthX, heightY, lengthZ, floorY, halfW, halfL]);

  useEffect(() => () => disposeMergedMap(geometries), [geometries]);
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);

  return (
    <group position={position}>
      <mesh position={[0, floorY + 0.01, 0]}>
        <boxGeometry args={[widthX - 0.04, 0.02, lengthZ - 0.04]} />
        <primitive object={materials.floorTile} attach="material" />
      </mesh>
      <mesh geometry={geometries.wall}>
        <primitive object={materials.wallTile} attach="material" />
      </mesh>
      <mesh geometry={geometries.stall}>
        <primitive object={materials.stallWood} attach="material" />
      </mesh>
      <mesh geometry={geometries.ceramic}>
        <primitive object={materials.ceramicWhite} attach="material" />
      </mesh>
      <mesh geometry={geometries.mirror}>
        <primitive object={materials.mirror} attach="material" />
      </mesh>

      {selected && (
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={size} />
          <meshBasicMaterial visible={false} />
          <Edges color={mapConfig.colors.roomSelected} lineWidth={3} />
        </mesh>
      )}
    </group>
  );
}

// ============================================================================
// NORTHWEST STAIRCASE (5.53m x 3.44m x 2.6m)
// ============================================================================

export type BlockCStairsProps = {
  position: [number, number, number] | readonly [number, number, number];
  size: [number, number, number] | readonly [number, number, number];
  selected?: boolean;
};

export function BlockCStairsInterior3D({ position, size, selected = false }: BlockCStairsProps) {
  const [widthX, heightY, lengthZ] = size;
  const floorY = -heightY / 2;
  const halfW = widthX / 2;
  const halfL = lengthZ / 2;

  const materials = useMemo(() => {
    return {
      concreteSteps: new THREE.MeshStandardMaterial({
        color: '#94a3b8',
        roughness: 0.7,
      }),
      wallPlaster: new THREE.MeshStandardMaterial({
        color: '#f1f5f9',
        roughness: 0.8,
      }),
      handrailMetal: new THREE.MeshStandardMaterial({
        color: '#1e293b',
        metalness: 0.8,
        roughness: 0.25,
      }),
    };
  }, []);

  const geometries = useMemo(() => {
    const wallParts: THREE.BufferGeometry[] = [];
    const stepParts: THREE.BufferGeometry[] = [];
    const railParts: THREE.BufferGeometry[] = [];

    const wallThick = 0.2;

    // Enclosing walls
    const nWall = new THREE.BoxGeometry(widthX, heightY, wallThick);
    nWall.translate(0, 0, -halfL + wallThick / 2);
    wallParts.push(nWall);

    const wWall = new THREE.BoxGeometry(wallThick, heightY, lengthZ);
    wWall.translate(-halfW + wallThick / 2, 0, 0);
    wallParts.push(wWall);

    const eWall = new THREE.BoxGeometry(wallThick, heightY, lengthZ);
    eWall.translate(halfW - wallThick / 2, 0, 0);
    wallParts.push(eWall);

    // Stair flights ascending to 2nd floor
    const stepCount = 10;
    const stepW = 1.8;
    const stepD = 0.28;
    const stepH = heightY / (stepCount * 2);

    for (let s = 0; s < stepCount; s++) {
      const step = new THREE.BoxGeometry(stepW, (s + 1) * stepH, stepD);
      step.translate(-halfW + stepW / 2 + 0.4, floorY + ((s + 1) * stepH) / 2, -halfL + 0.5 + s * stepD);
      stepParts.push(step);
    }

    // Handrail
    const rail = new THREE.BoxGeometry(0.06, 0.06, stepCount * stepD);
    rail.rotateX(-0.5);
    rail.translate(-halfW + stepW + 0.35, floorY + 1.1, -halfL + 0.5 + (stepCount * stepD) / 2);
    railParts.push(rail);

    return {
      wall: mergeGeometries(wallParts),
      step: mergeGeometries(stepParts),
      rail: mergeGeometries(railParts),
    };
  }, [widthX, heightY, lengthZ, floorY, halfW, halfL]);

  useEffect(() => () => disposeMergedMap(geometries), [geometries]);
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);

  return (
    <group position={position}>
      <mesh geometry={geometries.wall}>
        <primitive object={materials.wallPlaster} attach="material" />
      </mesh>
      <mesh geometry={geometries.step}>
        <primitive object={materials.concreteSteps} attach="material" />
      </mesh>
      <mesh geometry={geometries.rail}>
        <primitive object={materials.handrailMetal} attach="material" />
      </mesh>

      {selected && (
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={size} />
          <meshBasicMaterial visible={false} />
          <Edges color={mapConfig.colors.roomSelected} lineWidth={3} />
        </mesh>
      )}
    </group>
  );
}
