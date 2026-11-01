import { useFrame } from '@react-three/fiber';
import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { CampusGeometry, Footprint } from '../../../domain/geometry/types';

export interface StreetLampSpec {
  x: number;
  z: number;
  rotY: number;
  hasPointLight?: boolean;
}

export interface BenchSpec {
  x: number;
  z: number;
  rotY: number;
  hasBin: boolean;
}

export interface TotemSpec {
  x: number;
  z: number;
  rotY: number;
}

function isPointInsideFootprintWithMargin(
  x: number,
  z: number,
  fp: Footprint,
  margin: number,
): boolean {
  if (fp.type === 'rect') {
    const hw = fp.size[0] / 2 + margin;
    const hd = fp.size[1] / 2 + margin;
    return Math.abs(x - fp.center[0]) <= hw && Math.abs(z - fp.center[1]) <= hd;
  }
  const poly = fp.points;
  if (poly.length < 3) return false;
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const [px, pz] of poly) {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (pz < minZ) minZ = pz;
    if (pz > maxZ) maxZ = pz;
  }
  return x >= minX - margin && x <= maxX + margin && z >= minZ - margin && z <= maxZ + margin;
}

function isInsideBuildingMargin(
  x: number,
  z: number,
  geometry: CampusGeometry,
  margin: number,
): boolean {
  for (const b of Object.values(geometry.buildings)) {
    for (const part of b.parts) {
      if (isPointInsideFootprintWithMargin(x, z, part, margin)) {
        return true;
      }
    }
  }
  for (const conn of geometry.connectors ?? []) {
    if (isPointInsideFootprintWithMargin(x, z, conn.footprint, margin)) {
      return true;
    }
  }
  // Exclude rendered sports courts, pitches and running tracks
  for (const ctx of geometry.context) {
    if (ctx.kind === 'court' || ctx.kind === 'track' || ctx.kind === 'pitch') {
      if (isPointInsideFootprintWithMargin(x, z, ctx.footprint, Math.max(1.2, margin * 0.6))) {
        return true;
      }
    }
  }
  // Explicit world-space bounds for 3D sports facilities in SportsFacilities.tsx:
  // - Small Soccer Pitch & Multi-Sport / Tennis Courts (x in [11.5, 73.5], z in [-9.6, 41.4])
  if (x >= 11.5 && x <= 73.5 && z >= -9.6 && z <= 41.4) return true;
  // - Regulation Grand Football Stadium (x in [-105.0, -49.0], z in [-131.0, -26.0])
  if (x >= -105.0 && x <= -49.0 && z >= -131.0 && z <= -26.0) return true;
  // Keep clear of fountain water basins
  if (x > -39.0 && x < 34.0 && z > 6.2 && z < 25.6) return true;
  if (x > -6.5 && x < 17.5 && z > -29.1 && z < -17.1) return true;
  return false;
}

/**
 * Compound multi-puff cumulus cloud geometry with sunlit top and soft sky-blue base vertex colors.
 */
const cumulusCloudGeo = (() => {
  const puffs: [number, number, number, number, number, number][] = [
    [0.0, 0.22, 0.0, 0.48, 0.55, 0.48],
    [-0.42, 0.05, 0.08, 0.38, 0.42, 0.38],
    [0.44, 0.08, -0.05, 0.4, 0.45, 0.38],
    [-0.2, 0.14, -0.25, 0.35, 0.38, 0.35],
    [0.22, 0.12, 0.24, 0.36, 0.4, 0.36],
    [-0.68, -0.06, -0.04, 0.28, 0.3, 0.28],
    [0.7, -0.04, 0.06, 0.28, 0.32, 0.28],
  ];

  const positions: number[] = [];
  const colors: number[] = [];

  for (const [px, py, pz, sx, sy, sz] of puffs) {
    const g = new THREE.IcosahedronGeometry(1, 2);
    g.scale(sx, sy, sz);
    g.translate(px, py, pz);
    const nonIdx = g.index ? g.toNonIndexed() : g;
    const pos = nonIdx.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      positions.push(vx, vy, vz);
      // Smooth sky-lit gradient: pure sunlit white at top, soft atmospheric sky-blue at base
      const t = Math.min(1, Math.max(0, (vy + 0.35) / 0.95));
      const r = 0.87 + t * 0.13;
      const gr = 0.93 + t * 0.07;
      const b = 0.98 + t * 0.02;
      colors.push(r, gr, b);
    }
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.computeVertexNormals();
  return merged;
})();

/**
 * V-winged soaring bird silhouette geometry.
 */
const soaringBirdGeo = (() => {
  // Left wing, right wing, and slender body
  const verts = new Float32Array([
    // Left inner wing
    0.0, 0.0, 0.22, -0.45, 0.12, 0.04, 0.0, 0.0, -0.18,
    // Left outer wingtip
    -0.45, 0.12, 0.04, -0.95, 0.02, -0.16, 0.0, 0.0, -0.18,
    // Right inner wing
    0.0, 0.0, 0.22, 0.0, 0.0, -0.18, 0.45, 0.12, 0.04,
    // Right outer wingtip
    0.45, 0.12, 0.04, 0.0, 0.0, -0.18, 0.95, 0.02, -0.16,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  return geo;
})();

/**
 * Computes deterministic street lamp positions along main walkways and plazas.
 */
export function computeCampusStreetLamps(geometry: CampusGeometry): StreetLampSpec[] {
  const candidates: StreetLampSpec[] = [];

  // West & East approach avenues outside the fountain plaza
  const avenueX = [-102, -84, -66, -52, 48, 64, 78];
  avenueX.forEach((x, idx) => {
    const isLightStop = idx % 2 === 0;
    candidates.push({ x, z: 5.4, rotY: 0, hasPointLight: isLightStop });
    candidates.push({ x, z: 26.4, rotY: Math.PI, hasPointLight: !isLightStop });
  });

  // Outer perimeter of the 1.5x Grand Fountain Plaza (z = -3.8 on North, z = 35.6 on South)
  const fountainPlazaX = [-38, -20, 0, 20, 36];
  fountainPlazaX.forEach((x, idx) => {
    const isLightStop = idx % 2 === 0;
    candidates.push({ x, z: -3.8, rotY: 0, hasPointLight: isLightStop });
    candidates.push({ x, z: 35.6, rotY: Math.PI, hasPointLight: !isLightStop });
  });

  // Academic spine walkway along Block C, Block B, and Block A
  const spineZ = [42, 60, 78, 96, 114, 128];
  spineZ.forEach((z, idx) => {
    candidates.push({
      x: 49.5,
      z,
      rotY: Math.PI / 2,
      hasPointLight: idx % 2 === 0,
    });
    candidates.push({
      x: 89.2,
      z,
      rotY: -Math.PI / 2,
      hasPointLight: idx % 2 === 1,
    });
  });

  // Western quad walkway toward Block E / Block F / Sports Complex
  const westZ = [-18, -38, -58, -78, 42, 64, 86];
  westZ.forEach((z, idx) => {
    candidates.push({
      x: -44.0,
      z,
      rotY: Math.PI / 2,
      hasPointLight: idx % 3 === 0,
    });
  });

  return candidates.filter((c) => !isInsideBuildingMargin(c.x, c.z, geometry, 2.2));
}

/**
 * Computes deterministic park bench and waste bin placements along promenades and courtyards.
 */
export function computeCampusBenchesAndBins(geometry: CampusGeometry): BenchSpec[] {
  const candidates: BenchSpec[] = [
    // Wide North-South Pedestrian Avenue (east of Building F and athletic courts)
    { x: 88.5, z: -40.0, rotY: -Math.PI / 2, hasBin: true },
    { x: 88.5, z: -20.0, rotY: -Math.PI / 2, hasBin: false },
    { x: 88.5, z: 0.0, rotY: -Math.PI / 2, hasBin: true },
    { x: 88.5, z: 20.0, rotY: -Math.PI / 2, hasBin: false },
    { x: 88.5, z: 40.0, rotY: -Math.PI / 2, hasBin: true },
    { x: 88.5, z: 82.0, rotY: -Math.PI / 2, hasBin: true },
    { x: 88.5, z: 114.0, rotY: -Math.PI / 2, hasBin: true },
    // Block A Front Pedestrian Avenue
    { x: 8.0, z: 78.0, rotY: 0, hasBin: true },
    { x: -10.0, z: 78.0, rotY: 0, hasBin: false },
    // Amphitheater Gathering Plaza
    { x: 22.0, z: 83.5, rotY: 0, hasBin: true },
    { x: 32.0, z: 83.5, rotY: 0, hasBin: false },
    // Dormitory Quadrangle
    { x: -55.5, z: 104.0, rotY: 0, hasBin: true },
    { x: -55.5, z: 114.0, rotY: Math.PI, hasBin: false },
    // North Academic Walkway
    { x: -14.0, z: -104.0, rotY: 0, hasBin: true },
    { x: -30.0, z: -104.0, rotY: 0, hasBin: false },
  ];

  return candidates.filter((c) => !isInsideBuildingMargin(c.x, c.z, geometry, 2.2));
}

/**
 * Computes deterministic campus wayfinding totems at key pedestrian intersections.
 */
export function computeCampusTotems(geometry: CampusGeometry): TotemSpec[] {
  const candidates: TotemSpec[] = [
    // Main Entrance plaza (matching calibrated SiteFurniture totem location)
    { x: 99.5, z: -14.0, rotY: -Math.PI / 2 },
    // North-South Pedestrian Avenue intersections
    { x: 88.5, z: 0.0, rotY: -Math.PI / 2 },
    { x: 88.5, z: 96.0, rotY: -Math.PI / 2 },
    // Central Spine & Promenade intersections
    { x: 12.0, z: 64.0, rotY: -Math.PI / 2 },
    { x: 12.0, z: -4.2, rotY: 0 },
    { x: 12.0, z: 36.2, rotY: Math.PI },
    // Dormitory approach
    { x: -55.5, z: 80.0, rotY: 0 },
  ];
  return candidates.filter((c) => !isInsideBuildingMargin(c.x, c.z, geometry, 2.0));
}

interface CampusEnvironmentDetailProps {
  geometry: CampusGeometry;
  enableNightLights?: boolean;
  campusPropsEnabled?: boolean;
  skyLifeEnabled?: boolean;
  windEnabled?: boolean;
  windSpeed?: number;
  windStrength?: number;
  quality?: 'low' | 'medium' | 'high' | 'original';
}

export const CampusEnvironmentDetail: React.FC<CampusEnvironmentDetailProps> = React.memo(
  ({
    geometry,
    enableNightLights = false,
    campusPropsEnabled = true,
    skyLifeEnabled = true,
    windEnabled = true,
    windSpeed = 1.1,
    quality = 'high',
  }) => {
    const allLamps = useMemo(() => computeCampusStreetLamps(geometry), [geometry]);
    const allBenches = useMemo(() => computeCampusBenchesAndBins(geometry), [geometry]);
    const allTotems = useMemo(() => computeCampusTotems(geometry), [geometry]);

    const propRatio = quality === 'high' ? 1.0 : quality === 'medium' ? 0.7 : quality === 'low' ? 0.4 : 0;
    const lamps = useMemo(() => allLamps.slice(0, Math.round(allLamps.length * propRatio)), [allLamps, propRatio]);
    const benches = useMemo(() => allBenches.slice(0, Math.round(allBenches.length * propRatio)), [allBenches, propRatio]);
    const totems = useMemo(() => allTotems.slice(0, Math.round(allTotems.length * propRatio)), [allTotems, propRatio]);
    const bins = useMemo(() => benches.filter((b) => b.hasBin), [benches]);

    // Outer perimeter trees removed per user request: "убери также пустые зоны за пределами кампуса"
    const horizonTrees = useMemo(
      () => [] as { x: number; z: number; scaleXZ: number; scaleY: number }[],
      [],
    );

    // Instanced refs
    const poleMeshRef = useRef<THREE.InstancedMesh>(null);
    const armMeshRef = useRef<THREE.InstancedMesh>(null);
    const lanternMeshRef = useRef<THREE.InstancedMesh>(null);
    const benchSeatRef = useRef<THREE.InstancedMesh>(null);
    const benchBackRef = useRef<THREE.InstancedMesh>(null);
    const benchLegsRef = useRef<THREE.InstancedMesh>(null);
    const binMeshRef = useRef<THREE.InstancedMesh>(null);
    const totemBodyRef = useRef<THREE.InstancedMesh>(null);
    const totemHeaderRef = useRef<THREE.InstancedMesh>(null);
    const horizonCanopyRef = useRef<THREE.InstancedMesh>(null);
    const horizonTrunkRef = useRef<THREE.InstancedMesh>(null);
    const birdsRef = useRef<THREE.InstancedMesh>(null);
    const cloudsGroupRef = useRef<THREE.Group>(null);

    // Populate static instanced meshes
    useLayoutEffect(() => {
      if (!campusPropsEnabled || quality === 'original') return;
      const dummy = new THREE.Object3D();

      // 1. Street Lamps
      if (poleMeshRef.current && armMeshRef.current && lanternMeshRef.current) {
        lamps.forEach((lamp, i) => {
          dummy.position.set(lamp.x, 2.3, lamp.z);
          dummy.rotation.set(0, lamp.rotY, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          poleMeshRef.current!.setMatrixAt(i, dummy.matrix);

          const forwardX = Math.sin(lamp.rotY) * 0.42;
          const forwardZ = Math.cos(lamp.rotY) * 0.42;
          dummy.position.set(lamp.x + forwardX * 0.5, 4.55, lamp.z + forwardZ * 0.5);
          dummy.rotation.set(0, lamp.rotY, 0);
          dummy.updateMatrix();
          armMeshRef.current!.setMatrixAt(i, dummy.matrix);

          dummy.position.set(lamp.x + forwardX, 4.42, lamp.z + forwardZ);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          lanternMeshRef.current!.setMatrixAt(i, dummy.matrix);
        });
        poleMeshRef.current.instanceMatrix.needsUpdate = true;
        armMeshRef.current.instanceMatrix.needsUpdate = true;
        lanternMeshRef.current.instanceMatrix.needsUpdate = true;
      }

      // 2. Park Benches
      if (benchSeatRef.current && benchBackRef.current && benchLegsRef.current) {
        benches.forEach((bench, i) => {
          dummy.position.set(bench.x, 0.45, bench.z);
          dummy.rotation.set(0, bench.rotY, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          benchSeatRef.current!.setMatrixAt(i, dummy.matrix);

          const backOffsetX = -Math.sin(bench.rotY) * 0.22;
          const backOffsetZ = -Math.cos(bench.rotY) * 0.22;
          dummy.position.set(bench.x + backOffsetX, 0.78, bench.z + backOffsetZ);
          dummy.rotation.set(0, bench.rotY, 0);
          dummy.updateMatrix();
          benchBackRef.current!.setMatrixAt(i, dummy.matrix);

          dummy.position.set(bench.x, 0.22, bench.z);
          dummy.rotation.set(0, bench.rotY, 0);
          dummy.updateMatrix();
          benchLegsRef.current!.setMatrixAt(i, dummy.matrix);
        });
        benchSeatRef.current.instanceMatrix.needsUpdate = true;
        benchBackRef.current.instanceMatrix.needsUpdate = true;
        benchLegsRef.current.instanceMatrix.needsUpdate = true;
      }

      // 3. Waste Bins (placed 1.35m to the side of benches that have bins)
      if (binMeshRef.current) {
        bins.forEach((b, i) => {
          const sideX = Math.cos(b.rotY) * 1.35;
          const sideZ = -Math.sin(b.rotY) * 1.35;
          dummy.position.set(b.x + sideX, 0.42, b.z + sideZ);
          dummy.rotation.set(0, b.rotY, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          binMeshRef.current!.setMatrixAt(i, dummy.matrix);
        });
        binMeshRef.current.instanceMatrix.needsUpdate = true;
      }

      // 4. Wayfinding Totems
      if (totemBodyRef.current && totemHeaderRef.current) {
        totems.forEach((t, i) => {
          dummy.position.set(t.x, 1.35, t.z);
          dummy.rotation.set(0, t.rotY, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          totemBodyRef.current!.setMatrixAt(i, dummy.matrix);

          dummy.position.set(t.x, 2.55, t.z);
          dummy.rotation.set(0, t.rotY, 0);
          dummy.updateMatrix();
          totemHeaderRef.current!.setMatrixAt(i, dummy.matrix);
        });
        totemBodyRef.current.instanceMatrix.needsUpdate = true;
        totemHeaderRef.current.instanceMatrix.needsUpdate = true;
      }
    }, [lamps, benches, bins, totems, campusPropsEnabled, quality]);

    // Populate Horizon Tree Ring
    useLayoutEffect(() => {
      if (!skyLifeEnabled || quality === 'original') return;
      if (!horizonCanopyRef.current || !horizonTrunkRef.current) return;

      const dummy = new THREE.Object3D();
      const color = new THREE.Color();
      horizonTrees.forEach((t, i) => {
        dummy.position.set(t.x, t.scaleY * 0.42, t.z);
        dummy.rotation.set(0, (i * 1.1) % Math.PI, 0);
        dummy.scale.set(t.scaleXZ * 0.22, t.scaleY * 0.85, t.scaleXZ * 0.22);
        dummy.updateMatrix();
        horizonTrunkRef.current!.setMatrixAt(i, dummy.matrix);

        dummy.position.set(t.x, t.scaleY * 1.15, t.z);
        dummy.scale.set(t.scaleXZ, t.scaleY * 0.82, t.scaleXZ);
        dummy.updateMatrix();
        horizonCanopyRef.current!.setMatrixAt(i, dummy.matrix);

        const hueShift = ((i % 5) - 2) * 0.012;
        color.setHSL(0.28 + hueShift, 0.38, 0.36 + (i % 3) * 0.03);
        horizonCanopyRef.current!.setColorAt(i, color);
      });
      horizonTrunkRef.current.instanceMatrix.needsUpdate = true;
      horizonCanopyRef.current.instanceMatrix.needsUpdate = true;
      if (horizonCanopyRef.current.instanceColor) {
        horizonCanopyRef.current.instanceColor.needsUpdate = true;
      }
    }, [horizonTrees, skyLifeEnabled, quality]);

    // Animate drifting clouds & soaring birds
    const birdDummy = useMemo(() => new THREE.Object3D(), []);
    const birdCount = quality === 'high' ? 18 : quality === 'medium' ? 12 : 6;

    useFrame(({ clock }) => {
      if (!skyLifeEnabled || quality === 'original') return;
      const t = clock.getElapsedTime() * (windEnabled ? Math.max(0.3, windSpeed) : 0.5);

      // Drift cloud ring gently across the sky
      if (cloudsGroupRef.current) {
        cloudsGroupRef.current.rotation.y = t * 0.008;
      }

      // Soaring bird flocks in wide lazy circles above the central courtyard
      if (birdsRef.current) {
        for (let i = 0; i < birdCount; i++) {
          const flockOffset = (i / birdCount) * Math.PI * 2;
          const orbitAngle = t * 0.16 + flockOffset;
          const radius = 52 + Math.sin(t * 0.3 + i) * 14 + (i % 3) * 6;
          const bx = Math.cos(orbitAngle) * radius;
          const bz = 20 + Math.sin(orbitAngle) * radius * 0.85;
          const by = 42 + Math.sin(t * 0.9 + i * 0.7) * 2.5 + (i % 4) * 1.8;

          birdDummy.position.set(bx, by, bz);
          birdDummy.rotation.set(
            Math.sin(t * 5.5 + i * 1.3) * 0.12,
            -orbitAngle + Math.PI,
            Math.cos(t * 5.5 + i * 1.3) * 0.18,
          );
          const wingFlap = 1 + Math.sin(t * 6.5 + i * 1.7) * 0.35;
          birdDummy.scale.set(0.65, 0.55 * wingFlap, 0.65);
          birdDummy.updateMatrix();
          birdsRef.current.setMatrixAt(i, birdDummy.matrix);
        }
        birdsRef.current.instanceMatrix.needsUpdate = true;
      }
    });

    if (quality === 'original') return null;

    const castPropShadow = quality === 'high';
    const activeLightLamps = enableNightLights
      ? lamps.filter((l) => l.hasPointLight).slice(0, quality === 'high' ? 14 : 6)
      : [];

    return (
      <group name="campus-environment-detail">
        {campusPropsEnabled && (
          <group name="campus-medium-range-props">
            {/* Street Lamp Poles */}
            <instancedMesh
              ref={poleMeshRef}
              args={[undefined, undefined, lamps.length]}
              castShadow={castPropShadow}
              receiveShadow
            >
              <cylinderGeometry args={[0.065, 0.1, 4.6, 8]} />
              <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.75} />
            </instancedMesh>

            {/* Street Lamp Overhang Arms */}
            <instancedMesh
              ref={armMeshRef}
              args={[undefined, undefined, lamps.length]}
              castShadow={castPropShadow}
            >
              <boxGeometry args={[0.06, 0.06, 0.55]} />
              <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.75} />
            </instancedMesh>

            {/* Street Lamp Lantern Globes */}
            <instancedMesh ref={lanternMeshRef} args={[undefined, undefined, lamps.length]}>
              <cylinderGeometry args={[0.16, 0.11, 0.26, 8]} />
              <meshStandardMaterial
                color={enableNightLights ? '#fef3c7' : '#f8fafc'}
                emissive={enableNightLights ? '#f59e0b' : '#000000'}
                emissiveIntensity={enableNightLights ? 2.8 : 0}
                roughness={0.2}
                metalness={0.1}
              />
            </instancedMesh>

            {/* Selective warm evening promenade pools of light */}
            {activeLightLamps.map((lamp, idx) => (
              <pointLight
                key={`lamp-light-${idx}`}
                position={[lamp.x, 4.1, lamp.z]}
                color="#fbbf24"
                intensity={14}
                distance={22}
                decay={1.8}
              />
            ))}

            {/* Park Bench Wooden Seats */}
            <instancedMesh
              ref={benchSeatRef}
              args={[undefined, undefined, benches.length]}
              castShadow={castPropShadow}
              receiveShadow
            >
              <boxGeometry args={[1.85, 0.08, 0.52]} />
              <meshStandardMaterial color="#92400e" roughness={0.72} metalness={0.08} />
            </instancedMesh>

            {/* Park Bench Wooden Backrests */}
            <instancedMesh
              ref={benchBackRef}
              args={[undefined, undefined, benches.length]}
              castShadow={castPropShadow}
              receiveShadow
            >
              <boxGeometry args={[1.85, 0.42, 0.07]} />
              <meshStandardMaterial color="#b45309" roughness={0.7} metalness={0.08} />
            </instancedMesh>

            {/* Park Bench Cast-Iron Frame Base */}
            <instancedMesh
              ref={benchLegsRef}
              args={[undefined, undefined, benches.length]}
              castShadow={castPropShadow}
            >
              <boxGeometry args={[1.65, 0.42, 0.46]} />
              <meshStandardMaterial color="#1e293b" roughness={0.5} metalness={0.7} />
            </instancedMesh>

            {/* Cylindrical Campus Waste Bins */}
            <instancedMesh
              ref={binMeshRef}
              args={[undefined, undefined, bins.length]}
              castShadow={castPropShadow}
              receiveShadow
            >
              <cylinderGeometry args={[0.22, 0.2, 0.82, 10]} />
              <meshStandardMaterial color="#334155" roughness={0.45} metalness={0.6} />
            </instancedMesh>

            {/* Campus Wayfinding Totem Monoliths */}
            <instancedMesh
              ref={totemBodyRef}
              args={[undefined, undefined, totems.length]}
              castShadow={castPropShadow}
              receiveShadow
            >
              <boxGeometry args={[0.68, 2.7, 0.18]} />
              <meshStandardMaterial color="#1e3a8a" roughness={0.35} metalness={0.45} />
            </instancedMesh>

            {/* Wayfinding Illuminated Gold Accent Header */}
            <instancedMesh ref={totemHeaderRef} args={[undefined, undefined, totems.length]}>
              <boxGeometry args={[0.7, 0.34, 0.2]} />
              <meshStandardMaterial
                color="#f59e0b"
                emissive={enableNightLights ? '#f59e0b' : '#b45309'}
                emissiveIntensity={enableNightLights ? 1.4 : 0.25}
                roughness={0.3}
                metalness={0.5}
              />
            </instancedMesh>
          </group>
        )}

        {skyLifeEnabled && (
          <group name="campus-long-range-atmosphere">
            {/* Soaring Bird Flock */}
            <instancedMesh
              ref={birdsRef}
              args={[soaringBirdGeo, undefined, birdCount]}
            >
              <meshBasicMaterial color="#334155" side={THREE.DoubleSide} />
            </instancedMesh>
          </group>
        )}
      </group>
    );
  },
);
CampusEnvironmentDetail.displayName = 'CampusEnvironmentDetail';
