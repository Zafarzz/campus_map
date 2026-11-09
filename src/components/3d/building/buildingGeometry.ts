import * as THREE from 'three';
import type { Footprint } from '../../../domain/geometry/types';

export function getFootprintMetrics(fp: Footprint) {
  if (fp.type === 'rect') {
    return { worldX: fp.center[0], worldZ: fp.center[1], width: fp.size[0], depth: fp.size[1] };
  }
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const [x, z] of fp.points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return {
    worldX: (minX + maxX) / 2,
    worldZ: (minZ + maxZ) / 2,
    width: maxX - minX,
    depth: maxZ - minZ,
  };
}

export function mergeBufferGeometries(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  for (const g of geoms) {
    const nonIndexed = g.index ? g.toNonIndexed() : g;
    const posAttr = nonIndexed.getAttribute('position');
    const normAttr = nonIndexed.getAttribute('normal');
    const uvAttr = nonIndexed.getAttribute('uv');
    for (let i = 0; i < posAttr.count; i++) {
      positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      if (normAttr) {
        normals.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
      } else {
        normals.push(0, 1, 0);
      }
      if (uvAttr) {
        uvs.push(uvAttr.getX(i), uvAttr.getY(i));
      } else {
        uvs.push(0, 0);
      }
    }
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return merged;
}

/**
 * Builds a true architectural hipped roof with a horizontal ridge along the longer building axis.
 */
export function createTrueHipRoofGeometry(
  width: number,
  depth: number,
  height: number,
): THREE.BufferGeometry {
  const hw = width / 2;
  const hd = depth / 2;
  const h = height;

  // Ridge runs along the longer horizontal dimension
  const alongX = width >= depth;
  const ridgeHalf = alongX ? Math.max(0, (width - depth) * 0.5) : Math.max(0, (depth - width) * 0.5);

  // Base corners (y = 0)
  const bl = [-hw, 0, hd]; // Front-left (+Z)
  const br = [hw, 0, hd]; // Front-right (+Z)
  const tr = [hw, 0, -hd]; // Back-right (-Z)
  const tl = [-hw, 0, -hd]; // Back-left (-Z)

  // Ridge endpoints (y = h)
  const r1 = alongX ? [-ridgeHalf, h, 0] : [0, h, ridgeHalf];
  const r2 = alongX ? [ridgeHalf, h, 0] : [0, h, -ridgeHalf];

  const verts: number[] = [];
  const uvs: number[] = [];
  const slopeLen = Math.hypot(alongX ? hd : hw, h);

  const pushTriUV = (
    a: number[],
    b: number[],
    c: number[],
    ua: [number, number],
    ub: [number, number],
    uc: [number, number],
  ) => {
    verts.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    uvs.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
  };

  if (alongX) {
    // Front slope (+Z): quad bl -> br -> r2 -> r1
    pushTriUV(bl, br, r2, [-hw, 0], [hw, 0], [ridgeHalf, slopeLen]);
    pushTriUV(bl, r2, r1, [-hw, 0], [ridgeHalf, slopeLen], [-ridgeHalf, slopeLen]);
    // Back slope (-Z): quad tr -> tl -> r1 -> r2
    pushTriUV(tr, tl, r1, [-hw, 0], [hw, 0], [ridgeHalf, slopeLen]);
    pushTriUV(tr, r1, r2, [-hw, 0], [ridgeHalf, slopeLen], [-ridgeHalf, slopeLen]);
    // Left hip (-X): triangle tl -> bl -> r1
    pushTriUV(tl, bl, r1, [-hd, 0], [hd, 0], [0, slopeLen]);
    // Right hip (+X): triangle br -> tr -> r2
    pushTriUV(br, tr, r2, [-hd, 0], [hd, 0], [0, slopeLen]);
  } else {
    // Right slope (+X): quad br -> tr -> r2 -> r1
    pushTriUV(br, tr, r2, [-hd, 0], [hd, 0], [ridgeHalf, slopeLen]);
    pushTriUV(br, r2, r1, [-hd, 0], [ridgeHalf, slopeLen], [-ridgeHalf, slopeLen]);
    // Left slope (-X): quad tl -> bl -> r1 -> r2
    pushTriUV(tl, bl, r1, [-hd, 0], [hd, 0], [ridgeHalf, slopeLen]);
    pushTriUV(tl, r1, r2, [-hd, 0], [ridgeHalf, slopeLen], [-ridgeHalf, slopeLen]);
    // Front hip (+Z): triangle bl -> br -> r1
    pushTriUV(bl, br, r1, [-hw, 0], [hw, 0], [0, slopeLen]);
    // Back hip (-Z): triangle tr -> tl -> r2
    pushTriUV(tr, tl, r2, [-hw, 0], [hw, 0], [0, slopeLen]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

// Cached shared base geometries
export const sharedPedimentGeo = new THREE.ConeGeometry(Math.sqrt(0.5), 1, 4);
sharedPedimentGeo.rotateY(Math.PI / 4);

/**
 * Compound architectural window frame + sill + lintel + mullion + transom geometry.
 */
export const sharedWindowFrameGeo = (() => {
  const w = 1.35;
  const h = 1.85;
  const backing = new THREE.BoxGeometry(w, h, 0.06);
  const sill = new THREE.BoxGeometry(w + 0.22, 0.09, 0.16);
  sill.translate(0, -h / 2 - 0.04, 0.04);
  const lintel = new THREE.BoxGeometry(w + 0.16, 0.07, 0.12);
  lintel.translate(0, h / 2 + 0.035, 0.025);
  const mullion = new THREE.BoxGeometry(0.05, h - 0.12, 0.04);
  mullion.translate(0, 0, 0.045);
  const transom = new THREE.BoxGeometry(w - 0.12, 0.045, 0.04);
  transom.translate(0, h * 0.22, 0.045);

  return mergeBufferGeometries([backing, sill, lintel, mullion, transom]);
})();

export const sharedWindowGlassGeo = (() => {
  const g = new THREE.BoxGeometry(1.21, 1.71, 0.03);
  g.translate(0, 0, 0.025);
  return g;
})();

export const sharedColumnGeo = new THREE.CylinderGeometry(0.35, 0.4, 1, 12);
