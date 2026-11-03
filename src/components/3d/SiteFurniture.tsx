import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  disposeMergedMap,
  NO_RAYCAST,
  StaticGeometryBatcher,
} from './geometry/staticGeometryMerger';

/**
 * Campus Outdoor Infrastructure & Site Furniture:
 * - LED Street Light Poles along roads and promenades.
 * - High-Mast Sports Floodlights around athletic courts.
 * - Park Benches & Trash Receptacles in gathering plazas.
 * - Campus Wayfinding Map Totem near main gate.
 * - Bicycle Parking Racks near building portals.
 *
 * All ~235 static sub-meshes are merged by material into 9 draw calls.
 */
export function SiteFurniture() {
  const materials = useMemo(() => {
    return {
      steel: new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.4,
        metalness: 0.8,
      }),
      base: new THREE.MeshStandardMaterial({
        color: '#64748b',
        roughness: 0.9,
      }),
      led: new THREE.MeshStandardMaterial({
        color: '#fef08a',
        emissive: '#fef08a',
        emissiveIntensity: 0.8,
        roughness: 0.2,
      }),
      mast: new THREE.MeshStandardMaterial({
        color: '#334155',
        roughness: 0.4,
        metalness: 0.78,
      }),
      floodHead: new THREE.MeshStandardMaterial({
        color: '#f8fafc',
        emissive: '#f8fafc',
        emissiveIntensity: 0.9,
      }),
      wood: new THREE.MeshStandardMaterial({
        color: '#92400e',
        roughness: 0.65,
      }),
      totemFrame: new THREE.MeshStandardMaterial({
        color: '#0f172a',
        roughness: 0.3,
        metalness: 0.7,
      }),
      totemDisplay: new THREE.MeshStandardMaterial({
        color: '#0284c7',
        roughness: 0.1,
        emissive: '#0369a1',
        emissiveIntensity: 0.3,
      }),
      totemGold: new THREE.MeshStandardMaterial({
        color: '#ba6f27',
        metalness: 0.8,
        roughness: 0.2,
      }),
      rack: new THREE.MeshStandardMaterial({
        color: '#94a3b8',
        roughness: 0.25,
        metalness: 0.9,
      }),
    };
  }, []);

  const merged = useMemo(() => {
    const batcher = new StaticGeometryBatcher();

    const toWorld = (
      ox: number,
      oy: number,
      oz: number,
      rotY: number,
      lx: number,
      ly: number,
      lz: number,
    ): [number, number, number] => {
      const c = Math.cos(rotY);
      const s = Math.sin(rotY);
      return [ox + lx * c + lz * s, oy + ly, oz - lx * s + lz * c];
    };

    // 1. Roadway and promenade light poles [x, y, z, rotationY, height]
    const lightPoles: [number, number, number, number, number][] = [
      // 20m Entrance Road (North side curbside, facing south towards road)
      [64.0, 0, 5.0, Math.PI, 6.0],
      [76.0, 0, 5.0, Math.PI, 6.0],
      [88.0, 0, 5.0, Math.PI, 6.0],
      [98.0, 0, 5.0, Math.PI, 6.0],
      // 20m Entrance Road (South side curbside, facing north towards road)
      [64.0, 0, 26.8, 0, 6.0],
      [76.0, 0, 26.8, 0, 6.0],
      [88.0, 0, 26.8, 0, 6.0],
      [98.0, 0, 26.8, 0, 6.0],
      // East Perimeter Road (flanking east road)
      [104.5, 0, -20.0, -Math.PI / 2, 6.0],
      [104.5, 0, -45.0, -Math.PI / 2, 6.0],
      [104.5, 0, 45.0, -Math.PI / 2, 6.0],
      [102.0, 0, 70.0, -Math.PI / 2, 6.0],
      [104.5, 0, 95.0, -Math.PI / 2, 6.0],
      [104.5, 0, 120.0, -Math.PI / 2, 6.0],
      // Central Pedestrian Promenade (outside sports courts)
      [17.5, 0, 55.0, -Math.PI / 2, 4.5],
      // Block A & Amphitheater Front Promenades
      [22.0, 0, 78.0, 0, 4.5],
      [36.0, 0, 78.0, 0, 4.5],
      [0.0, 0, 78.0, 0, 4.5],
      [-15.0, 0, 78.0, 0, 4.5],
    ];

    for (const [x, y, z, rotY, h] of lightPoles) {
      batcher.addCylinder('base', [0.22, 0.25, 0.3, 8], [x, y + 0.15, z]);
      batcher.addCylinder('steel', [0.07, 0.11, h, 10], [x, y + h / 2, z]);
      batcher.addBox('steel', [0.9, 0.08, 0.08], toWorld(x, y, z, rotY, 0.45, h - 0.05, 0), [0, rotY, 0]);
      batcher.addBox('steel', [0.5, 0.1, 0.22], toWorld(x, y, z, rotY, 0.85, h - 0.08, 0), [0, rotY, 0]);
      batcher.addBox('led', [0.44, 0.01, 0.18], toWorld(x, y, z, rotY, 0.85, h - 0.13, 0), [0, rotY, 0]);
    }

    // 2. Sports floodlight masts around court & soccer pitch
    const sportsFloodlights: [number, number, number, number][] = [
      [10.8, 0, -7.2, Math.PI / 4],
      [32.3, 0, -7.2, (3 * Math.PI) / 4],
      [10.8, 0, 34.0, -Math.PI / 4],
      [32.3, 0, 34.0, -(3 * Math.PI) / 4],
      [37.0, 0, -7.2, Math.PI / 4],
      [68.3, 0, -7.2, (3 * Math.PI) / 4],
      [37.0, 0, 34.0, -Math.PI / 4],
      [68.3, 0, 34.0, -(3 * Math.PI) / 4],
    ];

    const towerMat = new THREE.Matrix4();
    const lampMat = new THREE.Matrix4();
    const combinedMat = new THREE.Matrix4();
    const lampBoxProto = new THREE.BoxGeometry(0.32, 0.28, 0.18);
    const lampPlaneProto = new THREE.PlaneGeometry(0.28, 0.24);
    lampPlaneProto.translate(0, 0, 0.1);

    for (const [x, y, z, rotY] of sportsFloodlights) {
      batcher.addCylinder('mast', [0.45, 0.55, 0.6, 10], [x, y + 0.3, z]);
      batcher.addCylinder('mast', [0.16, 0.32, 12.0, 12], [x, y + 6.0, z]);
      batcher.addBox('mast', [2.8, 0.18, 0.25], [x, y + 12.1, z], [0, rotY, 0]);

      towerMat.makeRotationY(rotY).setPosition(x, y, z);
      for (const fx of [-1.0, -0.6, -0.2, 0.2, 0.6, 1.0]) {
        lampMat.makeRotationX(0.45).setPosition(fx, 12.15, 0.25);
        combinedMat.multiplyMatrices(towerMat, lampMat);

        const gBox = lampBoxProto.clone();
        gBox.applyMatrix4(combinedMat);
        batcher.addGeometry('mast', gBox);
        gBox.dispose();

        const gPlane = lampPlaneProto.clone();
        gPlane.applyMatrix4(combinedMat);
        batcher.addGeometry('floodHead', gPlane);
        gPlane.dispose();
      }
    }
    lampBoxProto.dispose();
    lampPlaneProto.dispose();

    // 3. Park Benches and Trash bins
    const benches: [number, number, number, number][] = [
      [22.0, 0, 83.5, 0],
      [32.0, 0, 83.5, 0],
      [-55.5, 0, 104.0, 0],
      [-55.5, 0, 114.0, Math.PI],
    ];

    for (const [x, y, z, rotY] of benches) {
      for (const lx of [-0.85, 0.85]) {
        batcher.addBox('steel', [0.06, 0.5, 0.5], toWorld(x, y, z, rotY, lx, 0.25, 0), [0, rotY, 0]);
      }
      for (const sz of [-0.15, -0.05, 0.05, 0.15]) {
        batcher.addBox('wood', [1.9, 0.035, 0.08], toWorld(x, y, z, rotY, 0, 0.46, sz), [0, rotY, 0]);
      }
      for (const by of [0.62, 0.74]) {
        batcher.addBox('wood', [1.9, 0.08, 0.035], toWorld(x, y, z, rotY, 0, by, -0.22), [0, rotY, 0]);
      }

      const binX = x + (rotY === 0 ? 1.4 : -1.4);
      batcher.addCylinder('mast', [0.22, 0.22, 0.9, 14], [binX, y + 0.45, z]);
      batcher.addCylinder('mast', [0.24, 0.24, 0.04, 14], [binX, y + 0.92, z]);
    }

    // 4. Wayfinding Totem at [99.5, 0, -14.0], rotY = -Math.PI / 2
    const tx = 99.5;
    const ty = 0;
    const tz = -14.0;
    const tRot = -Math.PI / 2;
    batcher.addBox('totemFrame', [1.2, 0.2, 0.4], toWorld(tx, ty, tz, tRot, 0, 0.1, 0), [0, tRot, 0]);
    batcher.addBox('totemFrame', [1.1, 2.3, 0.2], toWorld(tx, ty, tz, tRot, 0, 1.25, 0), [0, tRot, 0]);
    batcher.addBox('totemDisplay', [0.95, 1.8, 0.01], toWorld(tx, ty, tz, tRot, 0, 1.25, 0.105), [0, tRot, 0]);
    batcher.addBox('totemGold', [0.95, 0.1, 0.01], toWorld(tx, ty, tz, tRot, 0, 2.25, 0.106), [0, tRot, 0]);

    // 5. Bicycle Parking Racks
    const bikeRacks: [number, number, number, number, number][] = [
      [63.0, 0, 52.0, 0, 5],
      [79.0, 0, 92.0, Math.PI / 2, 5],
      [-42.0, 0, 108.9, Math.PI / 2, 6],
    ];
    const hoopBarProto = new THREE.CylinderGeometry(0.03, 0.03, 0.64, 8);
    hoopBarProto.rotateZ(Math.PI / 2);

    for (const [bx, by, bz, rotY, count] of bikeRacks) {
      for (let idx = 0; idx < count; idx++) {
        const rx = -((count - 1) * 0.85) / 2 + idx * 0.85;
        batcher.addCylinder('rack', [0.03, 0.03, 0.9, 8], toWorld(bx, by, bz, rotY, rx - 0.32, 0.45, 0));
        batcher.addCylinder('rack', [0.03, 0.03, 0.9, 8], toWorld(bx, by, bz, rotY, rx + 0.32, 0.45, 0));
        batcher.addGeometry('rack', hoopBarProto, toWorld(bx, by, bz, rotY, rx, 0.9, 0), [0, rotY, 0]);
      }
    }
    hoopBarProto.dispose();

    return batcher.buildAll();
  }, []);

  useEffect(() => {
    return () => {
      disposeMergedMap(merged);
      Object.values(materials).forEach((m) => m.dispose());
    };
  }, [merged, materials]);

  return (
    <group>
      {merged.steel && (
        <mesh geometry={merged.steel} material={materials.steel} castShadow raycast={NO_RAYCAST} />
      )}
      {merged.base && (
        <mesh geometry={merged.base} material={materials.base} raycast={NO_RAYCAST} />
      )}
      {merged.led && (
        <mesh geometry={merged.led} material={materials.led} raycast={NO_RAYCAST} />
      )}
      {merged.mast && (
        <mesh geometry={merged.mast} material={materials.mast} castShadow raycast={NO_RAYCAST} />
      )}
      {merged.floodHead && (
        <mesh geometry={merged.floodHead} material={materials.floodHead} raycast={NO_RAYCAST} />
      )}
      {merged.wood && (
        <mesh geometry={merged.wood} material={materials.wood} castShadow raycast={NO_RAYCAST} />
      )}
      {merged.totemFrame && (
        <mesh geometry={merged.totemFrame} material={materials.totemFrame} castShadow raycast={NO_RAYCAST} />
      )}
      {merged.totemDisplay && (
        <mesh geometry={merged.totemDisplay} material={materials.totemDisplay} raycast={NO_RAYCAST} />
      )}
      {merged.totemGold && (
        <mesh geometry={merged.totemGold} material={materials.totemGold} raycast={NO_RAYCAST} />
      )}
      {merged.rack && (
        <mesh geometry={merged.rack} material={materials.rack} raycast={NO_RAYCAST} />
      )}
    </group>
  );
}

