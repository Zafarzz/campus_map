import { CameraControls } from '@react-three/drei';
import { useEffect, useRef, type ComponentRef } from 'react';
import { mapConfig } from '../../config/mapConfig';
import type { CampusGeometry, Vec3 } from '../../domain/geometry/types';
import type { Selection } from '../../state/MapProvider';
import { roomCenter } from './geometryUtils';

type Props = { geometry: CampusGeometry; selection: Selection };

const normalize = ([x, y, z]: Vec3): Vec3 => {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
};

export function campusCenter(geometry: CampusGeometry): Vec3 {
  const { min, max } = geometry.bounds;
  return [(min[0] + max[0]) / 2, 0, (min[1] + max[1]) / 2];
}

/** Computes [cameraPosition, target] for the current selection. */
function framing(geometry: CampusGeometry, selection: Selection): [Vec3, Vec3] {
  const cam = mapConfig.camera;
  const dir = normalize(cam.focusDirection);
  const along = (t: Vec3, dist: number): [Vec3, Vec3] => [
    [t[0] + dir[0] * dist, t[1] + dir[1] * dist, t[2] + dir[2] * dist],
    t,
  ];

  const room = selection.roomId ? geometry.rooms[selection.roomId] : undefined;
  if (room) return along(roomCenter(room), cam.roomDistance);

  const building = selection.buildingId ? geometry.buildings[selection.buildingId] : undefined;
  if (building) {
    const floorY = (selection.floorId && building.floors[selection.floorId]?.elevation) || 0;
    const target: Vec3 = [building.center[0], floorY, building.center[2]];
    return along(target, Math.max(cam.minBuildingDistance, building.radius * cam.buildingDistanceFactor));
  }

  const c = campusCenter(geometry);
  const p = cam.campusPosition;
  return [[c[0] + p[0], c[1] + p[1], c[2] + p[2]], c];
}

/** Smoothly moves the camera whenever the selection changes. */
export function CameraController({ geometry, selection }: Props) {
  const controls = useRef<ComponentRef<typeof CameraControls>>(null);
  const { buildingId, floorId, roomId } = selection;

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    if (typeof window !== 'undefined') {
      (window as unknown as { __cameraControls?: unknown }).__cameraControls = c;
    }
    const params = new URLSearchParams(window.location.search);
    const camParam = params.get('cam');
    if (camParam) {
      const nums = camParam.split(',').map(Number);
      if (nums.length === 6 && nums.every((n) => Number.isFinite(n))) {
        void c.setLookAt(nums[0], nums[1], nums[2], nums[3], nums[4], nums[5], false);
        return;
      }
    }
    const [pos, target] = framing(geometry, { buildingId, floorId, roomId });
    void c.setLookAt(...pos, ...target, true);
  }, [geometry, buildingId, floorId, roomId]);

  useEffect(() => {
    const win = window as unknown as {
      __setMapCamera?: (
        cx: number,
        cy: number,
        cz: number,
        tx: number,
        ty: number,
        tz: number,
      ) => void;
    };
    win.__setMapCamera = (cx, cy, cz, tx, ty, tz) => {
      void controls.current?.setLookAt(cx, cy, cz, tx, ty, tz, false);
    };
    return () => {
      delete win.__setMapCamera;
    };
  }, []);

  const cam = mapConfig.camera;
  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={cam.minDistance}
      maxDistance={cam.maxDistance}
      maxPolarAngle={cam.maxPolarAngle}
      dollyToCursor
      smoothTime={0.35}
    />
  );
}

export { framing as cameraFraming };
