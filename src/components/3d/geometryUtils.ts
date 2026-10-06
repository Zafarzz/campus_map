import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Footprint, RoomGeometry, Vec2, Vec3 } from '../../domain/geometry/types';

const ARC_SEGMENTS = 10;

function rectOutline(size: Vec2, cornerRadius = 0): Vec2[] {
  const [w, d] = size;
  const hw = w / 2;
  const hd = d / 2;
  const r = Math.min(cornerRadius, hw, hd);
  if (r <= 0) return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];

  const corners: [Vec2, number][] = [
    [[hw - r, -hd + r], -Math.PI / 2],
    [[hw - r, hd - r], 0],
    [[-hw + r, hd - r], Math.PI / 2],
    [[-hw + r, -hd + r], Math.PI],
  ];
  const pts: Vec2[] = [];
  for (const [[cx, cz], start] of corners) {
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const a = start + (i / ARC_SEGMENTS) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  }
  return pts;
}

/** World-space outline (x, z) of a footprint. */
export function footprintOutline(fp: Footprint): Vec2[] {
  if (fp.type === 'polygon') return fp.points;
  const rot = fp.rotation ?? 0;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return rectOutline(fp.size, fp.cornerRadius).map(([x, z]) => [
    fp.center[0] + x * cos - z * sin,
    fp.center[1] + x * sin + z * cos,
  ]);
}

/**
 * Shape in the XY plane where y = -z, so that after rotating the mesh by
 * -90° around X the extrusion points up (+Y) and the outline lands on (x, z).
 */
export function outlineToShape(points: Vec2[]): THREE.Shape {
  return new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
}

/** Memoized extruded geometry for an outline; disposed on change/unmount. */
export function useExtrudedGeometry(points: Vec2[], height: number): THREE.ExtrudeGeometry {
  const geometry = useMemo(
    () => new THREE.ExtrudeGeometry(outlineToShape(points), { depth: height, bevelEnabled: false }),
    [points, height],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

export const EXTRUDE_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0];

export function roomCenter(g: RoomGeometry): Vec3 {
  if (g.type === 'box') return g.position;
  const n = g.points.length || 1;
  const [sx, sz] = g.points.reduce<Vec2>(([ax, az], [x, z]) => [ax + x, az + z], [0, 0]);
  return [sx / n, g.elevation + g.height / 2, sz / n];
}

export function roomTop(g: RoomGeometry): number {
  return g.type === 'box' ? g.position[1] + g.size[1] / 2 : g.elevation + g.height;
}
