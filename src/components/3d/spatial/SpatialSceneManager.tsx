import { useFrame, useThree } from '@react-three/fiber';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as THREE from 'three';
import type { BuildingGeometry, CampusGeometry, Footprint, Vec3 } from '../../../domain/geometry/types';

export type SpatialLOD = 0 | 1 | 2;

export interface SpatialZoneBounds {
  id: string;
  center: Vec3;
  radius: number;
  min: Vec3;
  max: Vec3;
}

export interface SpatialZoneState {
  visible: boolean;
  lod: SpatialLOD;
  distance: number;
}

export interface SpatialVisibilitySnapshot {
  zones: Record<string, SpatialZoneState>;
  activeInteriorBuildingId?: string;
}

const DEFAULT_ZONE_STATE: SpatialZoneState = {
  visible: true,
  lod: 0,
  distance: 0,
};

/**
 * Computes an accurate world-space bounding sphere and AABB for a list of footprints and height.
 */
export function computeFootprintsBounds(
  id: string,
  parts: Footprint[],
  height: number,
  elevation: number = 0,
  padding: number = 6,
): SpatialZoneBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const fp of parts) {
    if (fp.type === 'rect') {
      const [cx, cz] = fp.center;
      const [w, d] = fp.size;
      const halfDiag = Math.hypot(w / 2, d / 2);
      if (cx - halfDiag < minX) minX = cx - halfDiag;
      if (cx + halfDiag > maxX) maxX = cx + halfDiag;
      if (cz - halfDiag < minZ) minZ = cz - halfDiag;
      if (cz + halfDiag > maxZ) maxZ = cz + halfDiag;
    } else {
      for (const [px, pz] of fp.points) {
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (pz < minZ) minZ = pz;
        if (pz > maxZ) maxZ = pz;
      }
    }
  }

  if (!Number.isFinite(minX)) {
    minX = -20;
    maxX = 20;
    minZ = -20;
    maxZ = 20;
  }

  const minY = elevation;
  const maxY = elevation + Math.max(height, 4);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  const rx = (maxX - minX) / 2 + padding;
  const ry = (maxY - minY) / 2 + padding;
  const rz = (maxZ - minZ) / 2 + padding;
  const radius = Math.hypot(rx, ry, rz);

  return {
    id,
    center: [cx, cy, cz],
    radius,
    min: [minX - padding, minY - 2, minZ - padding],
    max: [maxX + padding, maxY + padding, maxZ + padding],
  };
}

/**
 * Builds the complete spatial zone registry for the campus (all buildings + landmark/environment zones).
 */
export function buildCampusSpatialZones(geometry: CampusGeometry): Record<string, SpatialZoneBounds> {
  const zones: Record<string, SpatialZoneBounds> = {};

  for (const [bldId, bldGeo] of Object.entries(geometry.buildings)) {
    zones[bldId] = computeFootprintsBounds(bldId, bldGeo.parts, bldGeo.height, 0, 8);
  }

  // Dedicated spatial zones for non-building landmarks and environmental districts
  zones['zone:amphitheater'] = {
    id: 'zone:amphitheater',
    center: [42.0, 5.5, 76.5],
    radius: 26,
    min: [24, 0, 60],
    max: [60, 14, 93],
  };

  zones['zone:fountain'] = {
    id: 'zone:fountain',
    center: [73.5, 2.0, 28.0],
    radius: 36,
    min: [52, -2, -2],
    max: [95, 8, 58],
  };

  zones['zone:sports'] = {
    id: 'zone:sports',
    center: [-25.0, 4.0, -5.0],
    radius: 135,
    min: [-120, -1, -110],
    max: [70, 18, 80],
  };

  zones['zone:gate'] = {
    id: 'zone:gate',
    center: [99.8, 4.0, -23.1],
    radius: 28,
    min: [82, 0, -45],
    max: [118, 12, -2],
  };

  zones['zone:solar-canopies'] = {
    id: 'zone:solar-canopies',
    center: [-46.0, 3.0, 165.0],
    radius: 55,
    min: [-95, 0, 140],
    max: [5, 10, 190],
  };

  zones['zone:site-furniture'] = {
    id: 'zone:site-furniture',
    center: [10.0, 4.0, 20.0],
    radius: 240,
    min: [-140, 0, -140],
    max: [140, 18, 200],
  };

  return zones;
}

const SpatialSceneContext = createContext<{
  getZoneState: (zoneId: string) => SpatialZoneState;
  zones: Record<string, SpatialZoneBounds>;
  activeInteriorBuildingId?: string;
}>({
  getZoneState: () => DEFAULT_ZONE_STATE,
  zones: {},
});

export function useSpatialZone(zoneId: string): SpatialZoneState {
  const ctx = useContext(SpatialSceneContext);
  return ctx.getZoneState(zoneId);
}

export function useSpatialContext() {
  return useContext(SpatialSceneContext);
}

// Reusable scratch objects for zero-allocation frustum & distance evaluation
const _projScreenMatrix = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _sphere = new THREE.Sphere();
const _camPos = new THREE.Vector3();
const _zoneCenter = new THREE.Vector3();

/**
 * Spatial Scene Manager Provider.
 * Computes coarse frustum visibility and distance-based LOD tiers for all spatial zones
 * when the camera moves/rotates beyond a threshold, avoiding per-frame React reconciliation.
 */
export function SpatialSceneManager({
  geometry,
  selectedBuildingId,
  lod0Distance = 135,
  lod1Distance = 260,
  children,
}: {
  geometry: CampusGeometry;
  selectedBuildingId?: string;
  lod0Distance?: number;
  lod1Distance?: number;
  children: ReactNode;
}) {
  const zones = useMemo(() => buildCampusSpatialZones(geometry), [geometry]);
  const { camera } = useThree();

  const lastCamPos = useRef(new THREE.Vector3(Infinity, Infinity, Infinity));
  const lastCamQuat = useRef(new THREE.Quaternion());
  const lastSelectedRef = useRef<string | undefined>(selectedBuildingId);

  const computeSnapshot = (cam: THREE.Camera, activeBldId?: string): Record<string, SpatialZoneState> => {
    cam.updateMatrixWorld();
    _projScreenMatrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projScreenMatrix);
    _camPos.setFromMatrixPosition(cam.matrixWorld);

    const next: Record<string, SpatialZoneState> = {};
    for (const [id, z] of Object.entries(zones)) {
      _zoneCenter.set(z.center[0], z.center[1], z.center[2]);
      const dist = Math.max(0, _camPos.distanceTo(_zoneCenter) - z.radius * 0.5);
      _sphere.center.copy(_zoneCenter);
      // Generous shadow/frustum margin so shadow casters near frustum edge never pop
      _sphere.radius = z.radius + 35;
      const inFrustum = _frustum.intersectsSphere(_sphere);

      const isSelected = activeBldId === id;
      let lod: SpatialLOD = 0;
      if (!isSelected) {
        if (dist > lod1Distance) lod = 2;
        else if (dist > lod0Distance) lod = 1;
      }

      next[id] = {
        visible: isSelected || inFrustum,
        lod,
        distance: Math.round(dist),
      };
    }
    return next;
  };

  const [zoneStates, setZoneStates] = useState<Record<string, SpatialZoneState>>(() =>
    computeSnapshot(camera, selectedBuildingId),
  );

  useEffect(() => {
    setZoneStates(computeSnapshot(camera, selectedBuildingId));
    lastSelectedRef.current = selectedBuildingId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, selectedBuildingId]);

  useFrame(() => {
    const posMoved = camera.position.distanceToSquared(lastCamPos.current) > 16; // > 4m movement
    const rotMoved = 1 - Math.abs(camera.quaternion.dot(lastCamQuat.current)) > 0.004;
    const selChanged = lastSelectedRef.current !== selectedBuildingId;

    if (!posMoved && !rotMoved && !selChanged) return;

    lastCamPos.current.copy(camera.position);
    lastCamQuat.current.copy(camera.quaternion);
    lastSelectedRef.current = selectedBuildingId;

    const next = computeSnapshot(camera, selectedBuildingId);

    // Only trigger React state update if any zone's visibility or LOD tier actually changed
    setZoneStates((prev) => {
      let changed = false;
      for (const key of Object.keys(next)) {
        const p = prev[key];
        const n = next[key];
        if (!p || p.visible !== n.visible || p.lod !== n.lod) {
          changed = true;
          break;
        }
      }
      return changed ? next : prev;
    });
  });

  const value = useMemo(
    () => ({
      getZoneState: (zoneId: string) => zoneStates[zoneId] ?? DEFAULT_ZONE_STATE,
      zones,
      activeInteriorBuildingId: selectedBuildingId,
    }),
    [zoneStates, zones, selectedBuildingId],
  );

  return <SpatialSceneContext.Provider value={value}>{children}</SpatialSceneContext.Provider>;
}

/**
 * Computes a fast bounding proxy box for a building's parts to serve as a single lightweight
 * raycast target instead of raycasting 500-1,200 decorative facade sub-meshes.
 */
export function computeBuildingRaycastBounds(geometry: BuildingGeometry): {
  center: [number, number, number];
  size: [number, number, number];
} {
  const b = computeFootprintsBounds('proxy', geometry.parts, geometry.height, 0, 0.4);
  const w = Math.max(4, b.max[0] - b.min[0]);
  const h = Math.max(3, geometry.height + 1.5);
  const d = Math.max(4, b.max[2] - b.min[2]);
  return {
    center: [b.center[0], h / 2, b.center[2]],
    size: [w, h, d],
  };
}
