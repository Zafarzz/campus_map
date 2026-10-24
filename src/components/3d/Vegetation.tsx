import { useMemo } from 'react';
import * as THREE from 'three';
import { AMPHITHEATER_HALL } from '../../data/amphitheater-hall';
import type { CampusGeometry } from '../../domain/geometry/types';

// Deterministic Pseudo-Random Number Generator (Mulberry32)
function createPRNG(seed: number) {
  let s = seed;
  return function next() {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cached shared vegetation geometries and materials
const trunkGeo = new THREE.CylinderGeometry(0.2, 0.38, 2.2, 7);
const deciduousFoliageGeo = new THREE.IcosahedronGeometry(1.9, 1);
const coniferFoliageGeo = new THREE.ConeGeometry(1.6, 4.0, 7);

const trunkMat = new THREE.MeshStandardMaterial({
  color: '#5c4033',
  roughness: 0.9,
});

const deciduousMat = new THREE.MeshStandardMaterial({
  color: '#22c55e',
  roughness: 0.8,
});

const coniferMat = new THREE.MeshStandardMaterial({
  color: '#15803d',
  roughness: 0.85,
});

export type TreePlacement = {
  pos: THREE.Vector3;
  scale: number;
  rotY: number;
  type: 'deciduous' | 'conifer';
};

export function computeTreePlacements(geometry: CampusGeometry): TreePlacement[] {
  const treeCount = 180;
  const SEED = 20261014;
  const prng = createPRNG(SEED);
  const result: TreePlacement[] = [];

  // Lawns in context
  const lawns = geometry.context.filter((f) => f.kind === 'lawn');
  if (lawns.length === 0) return result;

  // Building & connector bounding boxes for collision exclusion
  const exclusionBoxes: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  for (const bld of Object.values(geometry.buildings)) {
    for (const part of bld.parts) {
      if (part.type === 'rect') {
        const hw = part.size[0] / 2 + 2.5; // 2.5m buffer
        const hd = part.size[1] / 2 + 2.5;
        exclusionBoxes.push({
          minX: part.center[0] - hw,
          maxX: part.center[0] + hw,
          minZ: part.center[1] - hd,
          maxZ: part.center[1] + hd,
        });
      }
    }
  }
  for (const conn of geometry.connectors ?? []) {
    if (conn.footprint.type === 'rect') {
      const hw = conn.footprint.size[0] / 2 + 1.5;
      const hd = conn.footprint.size[1] / 2 + 1.5;
      exclusionBoxes.push({
        minX: conn.footprint.center[0] - hw,
        maxX: conn.footprint.center[0] + hw,
        minZ: conn.footprint.center[1] - hd,
        maxZ: conn.footprint.center[1] + hd,
      });
    }
  }

  // Exclude Amphitheater Hall area and surrounding plaza (ADR-029)
  exclusionBoxes.push({
    minX: AMPHITHEATER_HALL.center[0] - AMPHITHEATER_HALL.size[0] / 2 - 12.0, // Clear 12m plaza on West
    maxX: AMPHITHEATER_HALL.center[0] + AMPHITHEATER_HALL.size[0] / 2 + 6.0,  // East gallery & walkway
    minZ: AMPHITHEATER_HALL.center[1] - AMPHITHEATER_HALL.size[1] / 2 - 4.0,  // North
    maxZ: AMPHITHEATER_HALL.center[1] + AMPHITHEATER_HALL.size[1] / 2 + 5.0,  // South
  });

  // Exclude Main Entrance Gate, Entrance Plaza, Art Object, and Checkpoint Ensemble
  exclusionBoxes.push({
    minX: 68.0,
    maxX: 106.0,
    minZ: -33.0,
    maxZ: -13.0,
  });
  // Exclude Grand Fountain ensemble on central lawn (calibrated to X in [-23, +34])
  exclusionBoxes.push({
    minX: -24.0,
    maxX: 35.5,
    minZ: -33.0,
    maxZ: -13.0,
  });
  // Exclude East Perimeter Road
  exclusionBoxes.push({
    minX: 104.0,
    maxX: 116.0,
    minZ: -160.0,
    maxZ: 170.0,
  });
  // Exclude Dormitory parking lot, courtyard, and canopies
  exclusionBoxes.push({
    minX: -98.0,
    maxX: -18.0,
    minZ: 85.0,
    maxZ: 175.0,
  });

  // Exclude Sports Zones (Football Pitch, Basketball Court, Tennis Court, Stadium Track)
  for (const ctxFeat of geometry.context) {
    if (
      ctxFeat.kind === 'pitch' ||
      ctxFeat.kind === 'court' ||
      ctxFeat.kind === 'track' ||
      ctxFeat.id.startsWith('solar-canopy')
    ) {
      if (ctxFeat.footprint.type === 'rect') {
        const hw = ctxFeat.footprint.size[0] / 2 + 2.0;
        const hd = ctxFeat.footprint.size[1] / 2 + 2.0;
        exclusionBoxes.push({
          minX: ctxFeat.footprint.center[0] - hw,
          maxX: ctxFeat.footprint.center[0] + hw,
          minZ: ctxFeat.footprint.center[1] - hd,
          maxZ: ctxFeat.footprint.center[1] + hd,
        });
      }
    }
  }

  const isObstructed = (x: number, z: number) => {
    return exclusionBoxes.some((b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ);
  };

  // 1. Structured Orchard Grids (Agricultural fruit tree orchard matching satellite imagery)
  // Orchard 1: Between Block B/C cluster and West Buildings
  for (let ox = -5.0; ox <= 22.0; ox += 6.5) {
    for (let oz = 58.0; oz <= 82.0; oz += 6.5) {
      if (!isObstructed(ox, oz)) {
        result.push({
          pos: new THREE.Vector3(ox, 0, oz),
          scale: 0.95 + prng() * 0.2,
          rotY: prng() * Math.PI * 2,
          type: 'deciduous', // Fruit trees are deciduous
        });
      }
    }
  }

  // Orchard 2: South Orchard Garden
  for (let ox = -15.0; ox <= 42.0; ox += 7.0) {
    for (let oz = 118.0; oz <= 142.0; oz += 7.0) {
      if (!isObstructed(ox, oz)) {
        result.push({
          pos: new THREE.Vector3(ox, 0, oz),
          scale: 0.9 + prng() * 0.25,
          rotY: prng() * Math.PI * 2,
          type: 'deciduous',
        });
      }
    }
  }

  // 2. Avenue Trees (Street trees flanking Central Promenade)
  for (let az = -6.0; az <= 60.0; az += 12.0) {
    const axLeft = 6.0;
    const axRight = 20.0;
    if (!isObstructed(axLeft, az)) {
      result.push({
        pos: new THREE.Vector3(axLeft, 0, az),
        scale: 1.15,
        rotY: prng() * Math.PI * 2,
        type: 'deciduous',
      });
    }
    if (!isObstructed(axRight, az)) {
      result.push({
        pos: new THREE.Vector3(axRight, 0, az),
        scale: 1.15,
        rotY: prng() * Math.PI * 2,
        type: 'deciduous',
      });
    }
  }

  // Dormitory front lawn landscaped trees (media_1792882021253.png)
  result.push({
    pos: new THREE.Vector3(-73.0, 0, 127.5),
    scale: 1.1,
    rotY: 0.5,
    type: 'deciduous',
  });
  result.push({
    pos: new THREE.Vector3(-67.0, 0, 127.5),
    scale: 1.15,
    rotY: 1.2,
    type: 'deciduous',
  });
  result.push({
    pos: new THREE.Vector3(-96.0, 0, 123.5),
    scale: 1.0,
    rotY: 2.1,
    type: 'deciduous',
  });

  // 3. Natural Landscaped Lawn Trees (Mulberry32 PRNG fill across remaining lawns)
  let attempts = 0;
  while (result.length < treeCount && attempts < 2500) {
    attempts++;
    const lawn = lawns[Math.floor(prng() * lawns.length)];

    let px = 0,
      pz = 0;
    let insideLawn = false;

    if (lawn.footprint.type === 'rect') {
      const { center, size } = lawn.footprint;
      const hw = size[0] / 2;
      const hd = size[1] / 2;
      px = center[0] - hw + prng() * size[0];
      pz = center[1] - hd + prng() * size[1];
      insideLawn = true;
    } else if (lawn.footprint.type === 'polygon') {
      const pts = lawn.footprint.points;
      if (pts.length < 3) continue;

      let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
      for (const [x, z] of pts) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }

      px = minX + prng() * (maxX - minX);
      pz = minZ + prng() * (maxZ - minZ);

      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0],
          zi = pts[i][1];
        const xj = pts[j][0],
          zj = pts[j][1];
        const intersect = zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi;
        if (intersect) insideLawn = !insideLawn;
      }
    }

    // Ensure tree is within lawn and strictly outside obstacle perimeters
    if (insideLawn && !isObstructed(px, pz)) {
      const type: 'deciduous' | 'conifer' = prng() > 0.4 ? 'deciduous' : 'conifer';
      const scale = 0.85 + prng() * 0.5;
      const rotY = prng() * Math.PI * 2;
      result.push({
        pos: new THREE.Vector3(px, 0, pz),
        scale,
        rotY,
        type,
      });
    }
  }

  return result;
}

export function Vegetation({ geometry }: { geometry: CampusGeometry }) {
  const placements = useMemo(() => computeTreePlacements(geometry), [geometry]);

  // Instanced Trunks
  const trunkMesh = useMemo(() => {
    if (placements.length === 0) return null;
    const mesh = new THREE.InstancedMesh(trunkGeo, trunkMat, placements.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    placements.forEach((item, i) => {
      dummy.position.set(item.pos.x, 1.1 * item.scale, item.pos.z);
      dummy.scale.set(item.scale, item.scale, item.scale);
      dummy.rotation.set(0, item.rotY, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [placements]);

  // Instanced Deciduous Crowns
  const deciduousMesh = useMemo(() => {
    const deciduousItems = placements.filter((p) => p.type === 'deciduous');
    if (deciduousItems.length === 0) return null;

    const mesh = new THREE.InstancedMesh(deciduousFoliageGeo, deciduousMat, deciduousItems.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    deciduousItems.forEach((item, i) => {
      dummy.position.set(item.pos.x, 3.2 * item.scale, item.pos.z);
      dummy.scale.set(item.scale, item.scale * 1.15, item.scale);
      dummy.rotation.set(0, item.rotY, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [placements]);

  // Instanced Conifer Crowns
  const coniferMesh = useMemo(() => {
    const coniferItems = placements.filter((p) => p.type === 'conifer');
    if (coniferItems.length === 0) return null;

    const mesh = new THREE.InstancedMesh(coniferFoliageGeo, coniferMat, coniferItems.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    coniferItems.forEach((item, i) => {
      dummy.position.set(item.pos.x, 3.5 * item.scale, item.pos.z);
      dummy.scale.set(item.scale, item.scale, item.scale);
      dummy.rotation.set(0, item.rotY, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [placements]);

  if (placements.length === 0) return null;

  return (
    <group>
      {trunkMesh && <primitive object={trunkMesh} />}
      {deciduousMesh && <primitive object={deciduousMesh} />}
      {coniferMesh && <primitive object={coniferMesh} />}
    </group>
  );
}
