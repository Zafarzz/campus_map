import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
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

// Shared uniform object for wind vertex shader
const windUniforms = {
  uTime: { value: 0 },
  uWindStrength: { value: 0.14 },
};

function applyWindShader(material: THREE.MeshStandardMaterial, heightFactor: number) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWindStrength = windUniforms.uWindStrength;
    shader.vertexShader =
      `
      uniform float uTime;
      uniform float uWindStrength;
      ` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 worldInstPos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float phase = worldInstPos.x * 0.17 + worldInstPos.z * 0.23;
        #else
          float phase = position.x * 0.2 + position.z * 0.2;
        #endif
        float swayMask = clamp((position.y + 1.5) * ${heightFactor.toFixed(2)}, 0.0, 1.5);
        transformed.x += sin(uTime * 1.6 + phase) * uWindStrength * swayMask;
        transformed.z += cos(uTime * 1.25 + phase * 1.3) * uWindStrength * 0.75 * swayMask;
        `,
      );
  };
}

function mergeAndPerturbGeometries(
  parts: { geo: THREE.BufferGeometry; jitter?: number; yLightBoost?: number }[],
  seed = 1337,
): THREE.BufferGeometry {
  const prng = createPRNG(seed);
  const positions: number[] = [];
  const colors: number[] = [];

  // First pass: find Y bounds for smooth vertical ambient occlusion gradient
  let minY = Infinity;
  let maxY = -Infinity;
  const nonIndexedParts = parts.map(({ geo, jitter = 0, yLightBoost = 0 }) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const pos = g.getAttribute('position');
    // Use position-hashed displacement so shared vertices stay welded!
    for (let i = 0; i < pos.count; i++) {
      let vx = pos.getX(i);
      let vy = pos.getY(i);
      let vz = pos.getZ(i);
      if (jitter > 0) {
        const hash = Math.sin(vx * 12.9898 + vy * 78.233 + vz * 37.719) * 43758.5453;
        const frac = hash - Math.floor(hash);
        const disp = (frac - 0.5) * jitter;
        const len = Math.hypot(vx, vy, vz) || 1;
        vx += (vx / len) * disp;
        vy += (vy / len) * disp * 0.7;
        vz += (vz / len) * disp;
        pos.setXYZ(i, vx, vy, vz);
      }
      if (vy < minY) minY = vy;
      if (vy > maxY) maxY = vy;
    }
    g.computeVertexNormals();
    return { g, yLightBoost };
  });

  const normals: number[] = [];
  const spanY = Math.max(0.1, maxY - minY);

  for (const { g, yLightBoost } of nonIndexedParts) {
    const pos = g.getAttribute('position');
    const norm = g.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      positions.push(vx, vy, vz);
      normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));

      // Vertical AO + outward radial highlight (0.62 at bottom/interior -> 1.08 at sunlit top)
      const normY = (vy - minY) / spanY;
      const shade = Math.min(1.12, Math.max(0.6, 0.64 + normY * 0.42 + yLightBoost + (prng() - 0.5) * 0.04));
      colors.push(shade, shade, shade * 0.96);
    }
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return merged;
}

// Compound branched trunk geometry (main trunk + root flare + 3 primary limbs)
const trunkGeo = (() => {
  const main = new THREE.CylinderGeometry(0.18, 0.36, 2.5, 8);
  const b1 = new THREE.CylinderGeometry(0.08, 0.16, 1.35, 6);
  b1.rotateZ(0.52);
  b1.rotateY(0.4);
  b1.translate(-0.38, 1.15, 0.16);

  const b2 = new THREE.CylinderGeometry(0.08, 0.15, 1.3, 6);
  b2.rotateZ(-0.48);
  b2.rotateY(-0.6);
  b2.translate(0.36, 1.1, -0.2);

  const b3 = new THREE.CylinderGeometry(0.07, 0.14, 1.2, 6);
  b3.rotateX(0.5);
  b3.translate(0.05, 1.2, 0.36);

  return mergeAndPerturbGeometries([
    { geo: main, jitter: 0.02 },
    { geo: b1, jitter: 0.01 },
    { geo: b2, jitter: 0.01 },
    { geo: b3, jitter: 0.01 },
  ]);
})();

// Compound multi-clustered deciduous canopy (7 overlapping organic foliage sub-crowns)
const deciduousFoliageGeo = (() => {
  const clusterSpecs: [number, number, number, number, number, number, number][] = [
    // [x, y, z, rx, ry, rz, lightBoost]
    [0.0, 0.35, 0.0, 1.45, 1.22, 1.45, 0.06], // Main central upper dome
    [-0.95, -0.22, 0.55, 1.15, 0.92, 1.12, -0.02], // Front-left bough cluster
    [0.98, -0.18, 0.48, 1.12, 0.9, 1.08, 0.0], // Front-right bough cluster
    [-0.65, -0.28, -0.88, 1.1, 0.88, 1.12, -0.04], // Back-left bough cluster
    [0.78, -0.24, -0.82, 1.14, 0.9, 1.1, -0.02], // Back-right bough cluster
    [-0.32, 0.92, -0.18, 1.05, 0.85, 1.02, 0.08], // Upper-left sunlit crown puff
    [0.42, 0.86, 0.28, 0.98, 0.82, 0.96, 0.09], // Upper-right sunlit crown puff
  ];

  const parts = clusterSpecs.map(([x, y, z, rx, ry, rz, boost]) => {
    const g = new THREE.IcosahedronGeometry(1.0, 2);
    g.scale(rx, ry, rz);
    g.translate(x, y, z);
    return { geo: g, jitter: 0.14, yLightBoost: boost };
  });

  return mergeAndPerturbGeometries(parts, 4099);
})();

// Compound 4-tiered spruce/pine conifer crown
const coniferFoliageGeo = (() => {
  const tiers: [number, number, number, number][] = [
    // [radius, height, centerY, lightBoost]
    [1.75, 1.85, -1.05, -0.05], // Wide lower skirt boughs
    [1.42, 1.75, -0.15, 0.0], // Lower-mid tier
    [1.08, 1.6, 0.72, 0.04], // Upper-mid tier
    [0.72, 1.45, 1.52, 0.09], // Pointed crown leader
  ];

  const parts = tiers.map(([r, h, cy, boost], idx) => {
    const g = new THREE.ConeGeometry(r, h, 10, 2);
    g.rotateY(idx * 0.45);
    g.translate(0, cy, 0);
    return { geo: g, jitter: 0.12, yLightBoost: boost };
  });

  return mergeAndPerturbGeometries(parts, 7719);
})();

// Compound multi-mound ornamental shrub cluster
const shrubGeo = (() => {
  const mounds: [number, number, number, number, number, number][] = [
    [0, 0.12, 0, 0.62, 0.52, 0.62],
    [-0.38, -0.02, 0.24, 0.48, 0.42, 0.48],
    [0.4, 0.0, 0.2, 0.46, 0.4, 0.46],
    [-0.22, -0.04, -0.34, 0.45, 0.38, 0.45],
    [0.28, -0.02, -0.3, 0.44, 0.4, 0.44],
  ];

  const parts = mounds.map(([x, y, z, rx, ry, rz]) => {
    const g = new THREE.IcosahedronGeometry(1.0, 1);
    g.scale(rx, ry, rz);
    g.translate(x, y, z);
    return { geo: g, jitter: 0.08, yLightBoost: 0.03 };
  });

  return mergeAndPerturbGeometries(parts, 9103);
})();

const trunkMat = new THREE.MeshStandardMaterial({
  color: '#6b4c35',
  vertexColors: true,
  roughness: 0.92,
});

const deciduousMat = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  vertexColors: true,
  roughness: 0.76,
});
applyWindShader(deciduousMat, 0.35);

const coniferMat = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  vertexColors: true,
  roughness: 0.82,
});
applyWindShader(coniferMat, 0.3);

const shrubMat = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  vertexColors: true,
  roughness: 0.8,
});
applyWindShader(shrubMat, 0.45);

export type TreePlacement = {
  pos: THREE.Vector3;
  scale: number;
  rotY: number;
  type: 'deciduous' | 'conifer';
};

export type ShrubPlacement = {
  pos: THREE.Vector3;
  scaleXZ: number;
  scaleY: number;
  rotY: number;
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
  const buildingBoxes: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  for (const bld of Object.values(geometry.buildings)) {
    for (const part of bld.parts) {
      if (part.type === 'rect') {
        const hw = part.size[0] / 2 + 2.5; // 2.5m buffer
        const hd = part.size[1] / 2 + 2.5;
        buildingBoxes.push({
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
      buildingBoxes.push({
        minX: conn.footprint.center[0] - hw,
        maxX: conn.footprint.center[0] + hw,
        minZ: conn.footprint.center[1] - hd,
        maxZ: conn.footprint.center[1] + hd,
      });
    }
  }

  // Exclude 1.5x scaled central fountain plaza & basin
  buildingBoxes.push({
    minX: -50.0,
    maxX: 45.2,
    minZ: -3.5,
    maxZ: 35.5,
  });

  const isInsideBuilding = (x: number, z: number) => {
    return buildingBoxes.some((b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ);
  };

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

    // Ensure tree is within lawn and strictly outside building perimeters
    if (insideLawn && !isInsideBuilding(px, pz)) {
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

export function computeShrubPlacements(geometry: CampusGeometry): ShrubPlacement[] {
  const shrubCount = 140;
  const SEED = 20261099;
  const prng = createPRNG(SEED);
  const result: ShrubPlacement[] = [];

  const lawns = geometry.context.filter((f) => f.kind === 'lawn');
  if (lawns.length === 0) return result;

  const buildingBoxes: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  for (const bld of Object.values(geometry.buildings)) {
    for (const part of bld.parts) {
      if (part.type === 'rect') {
        const hw = part.size[0] / 2 + 1.8;
        const hd = part.size[1] / 2 + 1.8;
        buildingBoxes.push({
          minX: part.center[0] - hw,
          maxX: part.center[0] + hw,
          minZ: part.center[1] - hd,
          maxZ: part.center[1] + hd,
        });
      }
    }
  }
  // Exclude 1.5x scaled central fountain plaza & basin
  buildingBoxes.push({
    minX: -50.0,
    maxX: 45.2,
    minZ: -3.5,
    maxZ: 35.5,
  });

  const isInsideBuilding = (x: number, z: number) =>
    buildingBoxes.some((b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ);

  let attempts = 0;
  while (result.length < shrubCount && attempts < 1800) {
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

    if (insideLawn && !isInsideBuilding(px, pz)) {
      result.push({
        pos: new THREE.Vector3(px, 0, pz),
        scaleXZ: 0.75 + prng() * 0.7,
        scaleY: 0.55 + prng() * 0.45,
        rotY: prng() * Math.PI * 2,
      });
    }
  }
  return result;
}

export interface VegetationProps {
  geometry: CampusGeometry;
  windEnabled?: boolean;
  windSpeed?: number;
  windStrength?: number;
  densityMultiplier?: number;
  castShadows?: boolean;
}

export function Vegetation({
  geometry,
  windEnabled = true,
  windSpeed = 1.1,
  windStrength = 0.14,
  densityMultiplier = 1.0,
  castShadows = true,
}: VegetationProps) {
  const allPlacements = useMemo(() => computeTreePlacements(geometry), [geometry]);
  const allShrubs = useMemo(() => computeShrubPlacements(geometry), [geometry]);

  const placements = useMemo(() => {
    const count = Math.max(0, Math.round(allPlacements.length * Math.min(1, Math.max(0, densityMultiplier))));
    return allPlacements.slice(0, count);
  }, [allPlacements, densityMultiplier]);

  const shrubs = useMemo(() => {
    const count = Math.max(0, Math.round(allShrubs.length * Math.min(1, Math.max(0, densityMultiplier))));
    return allShrubs.slice(0, count);
  }, [allShrubs, densityMultiplier]);

  useFrame(({ clock }) => {
    if (!windEnabled) {
      windUniforms.uWindStrength.value = 0;
      return;
    }
    windUniforms.uTime.value = clock.getElapsedTime() * windSpeed;
    windUniforms.uWindStrength.value = windStrength;
  });

  // Instanced Trunks
  const trunkMesh = useMemo(() => {
    if (placements.length === 0) return null;
    const mesh = new THREE.InstancedMesh(trunkGeo, trunkMat, placements.length);
    mesh.castShadow = castShadows;
    mesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    placements.forEach((item, i) => {
      dummy.position.set(item.pos.x, 1.25 * item.scale, item.pos.z);
      dummy.scale.set(item.scale, item.scale, item.scale);
      dummy.rotation.set(0, item.rotY, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [placements, castShadows]);

  // Instanced Deciduous Crowns with organic botanical foliage tint variation
  const deciduousMesh = useMemo(() => {
    const deciduousItems = placements.filter((p) => p.type === 'deciduous');
    if (deciduousItems.length === 0) return null;

    const mesh = new THREE.InstancedMesh(deciduousFoliageGeo, deciduousMat, deciduousItems.length);
    mesh.castShadow = castShadows;
    mesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    deciduousItems.forEach((item, i) => {
      dummy.position.set(item.pos.x, 3.35 * item.scale, item.pos.z);
      dummy.scale.set(item.scale, item.scale * 1.1, item.scale);
      dummy.rotation.set(0, item.rotY, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Natural warm sunlit deciduous olive/maple/plane-tree greens
      const hue = 0.28 + ((i % 7) - 3) * 0.012;
      const sat = 0.46 + ((i % 5) - 2) * 0.035;
      const light = 0.38 + ((i % 4) - 1.5) * 0.035;
      color.setHSL(hue, sat, light);
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }, [placements, castShadows]);

  // Instanced Conifer Crowns with deep pine/spruce color variation
  const coniferMesh = useMemo(() => {
    const coniferItems = placements.filter((p) => p.type === 'conifer');
    if (coniferItems.length === 0) return null;

    const mesh = new THREE.InstancedMesh(coniferFoliageGeo, coniferMat, coniferItems.length);
    mesh.castShadow = castShadows;
    mesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    coniferItems.forEach((item, i) => {
      dummy.position.set(item.pos.x, 3.45 * item.scale, item.pos.z);
      dummy.scale.set(item.scale, item.scale, item.scale);
      dummy.rotation.set(0, item.rotY, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const hue = 0.32 + ((i % 5) - 2) * 0.01;
      const sat = 0.48 + ((i % 3) - 1) * 0.04;
      const light = 0.28 + ((i % 4) - 1.5) * 0.025;
      color.setHSL(hue, sat, light);
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }, [placements, castShadows]);

  // Instanced Ornamental Shrubs & Bushes in Lawns
  const shrubMesh = useMemo(() => {
    if (shrubs.length === 0) return null;
    const mesh = new THREE.InstancedMesh(shrubGeo, shrubMat, shrubs.length);
    mesh.castShadow = castShadows;
    mesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    shrubs.forEach((item, i) => {
      dummy.position.set(item.pos.x, 0.36 * item.scaleY, item.pos.z);
      dummy.scale.set(item.scaleXZ, item.scaleY, item.scaleXZ);
      dummy.rotation.set(0, item.rotY, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const hue = 0.27 + ((i % 6) - 2.5) * 0.012;
      const sat = 0.45 + ((i % 4) - 1.5) * 0.04;
      const light = 0.36 + ((i % 5) - 2) * 0.03;
      color.setHSL(hue, sat, light);
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }, [shrubs, castShadows]);

  if (placements.length === 0 && shrubs.length === 0) return null;

  return (
    <group name="campus-vegetation">
      {trunkMesh && <primitive object={trunkMesh} />}
      {deciduousMesh && <primitive object={deciduousMesh} />}
      {coniferMesh && <primitive object={coniferMesh} />}
      {shrubMesh && <primitive object={shrubMesh} />}
    </group>
  );
}
