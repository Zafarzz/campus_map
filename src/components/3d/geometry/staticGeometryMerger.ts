import * as THREE from 'three';

export const NO_RAYCAST = () => null;

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3();

/**
 * Merges an array of static BufferGeometries into a single BufferGeometry,
 * preserving position, normal, and uv attributes and disposing source geometries.
 */
export function mergeBufferGeometries(
  geometries: THREE.BufferGeometry[],
  disposeSources: boolean = true,
): THREE.BufferGeometry {
  if (geometries.length === 0) {
    return new THREE.BufferGeometry();
  }

  let totalVertices = 0;
  const nonIndexedList: THREE.BufferGeometry[] = [];

  for (const g of geometries) {
    const nonIdx = g.index ? g.toNonIndexed() : g;
    nonIndexedList.push(nonIdx);
    const pos = nonIdx.getAttribute('position');
    if (pos) totalVertices += pos.count;
  }

  const positions = new Float32Array(totalVertices * 3);
  const normals = new Float32Array(totalVertices * 3);
  const uvs = new Float32Array(totalVertices * 2);
  let hasAnyUV = false;

  let vOffset = 0;
  for (let idx = 0; idx < nonIndexedList.length; idx++) {
    const nonIdx = nonIndexedList[idx];
    const orig = geometries[idx];
    const pos = nonIdx.getAttribute('position');
    const norm = nonIdx.getAttribute('normal');
    const uv = nonIdx.getAttribute('uv');
    if (uv) hasAnyUV = true;

    const count = pos ? pos.count : 0;
    for (let i = 0; i < count; i++) {
      const pBase = (vOffset + i) * 3;
      positions[pBase] = pos.getX(i);
      positions[pBase + 1] = pos.getY(i);
      positions[pBase + 2] = pos.getZ(i);

      if (norm) {
        normals[pBase] = norm.getX(i);
        normals[pBase + 1] = norm.getY(i);
        normals[pBase + 2] = norm.getZ(i);
      } else {
        normals[pBase] = 0;
        normals[pBase + 1] = 1;
        normals[pBase + 2] = 0;
      }

      if (uv) {
        const uBase = (vOffset + i) * 2;
        uvs[uBase] = uv.getX(i);
        uvs[uBase + 1] = uv.getY(i);
      }
    }
    vOffset += count;

    if (nonIdx !== orig) nonIdx.dispose();
    if (disposeSources) orig.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  if (hasAnyUV) {
    merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }
  merged.computeBoundingSphere();
  return merged;
}

export const mergeStaticGeometries = mergeBufferGeometries;

/**
 * Declarative builder for accumulating static box/cylinder/sphere/custom geometries by material key
 * and compiling them into one merged BufferGeometry per material key.
 */
export class StaticGeometryBatcher {
  private buckets = new Map<string, THREE.BufferGeometry[]>();

  private getBucket(key: string): THREE.BufferGeometry[] {
    let b = this.buckets.get(key);
    if (!b) {
      b = [];
      this.buckets.set(key, b);
    }
    return b;
  }

  addBox(
    key: string,
    size: [number, number, number],
    position: [number, number, number] = [0, 0, 0],
    rotation?: [number, number, number],
  ): this {
    const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
    this.applyTransform(g, position, rotation);
    this.getBucket(key).push(g);
    return this;
  }

  addCylinder(
    key: string,
    args: [number, number, number, number?],
    position: [number, number, number] = [0, 0, 0],
    rotation?: [number, number, number],
  ): this {
    const g = new THREE.CylinderGeometry(args[0], args[1], args[2], args[3] ?? 8);
    this.applyTransform(g, position, rotation);
    this.getBucket(key).push(g);
    return this;
  }

  addSphere(
    key: string,
    args: [number, number?, number?, number?, number?, number?, number?],
    position: [number, number, number] = [0, 0, 0],
    rotation?: [number, number, number],
    scale?: [number, number, number],
  ): this {
    const g = new THREE.SphereGeometry(
      args[0],
      args[1] ?? 10,
      args[2] ?? 8,
      args[3],
      args[4],
      args[5],
      args[6],
    );
    this.applyTransform(g, position, rotation, scale);
    this.getBucket(key).push(g);
    return this;
  }

  addPlane(
    key: string,
    size: [number, number],
    position: [number, number, number] = [0, 0, 0],
    rotation?: [number, number, number],
    uvRepeat?: [number, number],
  ): this {
    const g = new THREE.PlaneGeometry(size[0], size[1]);
    if (uvRepeat && (uvRepeat[0] !== 1 || uvRepeat[1] !== 1)) {
      const uv = g.getAttribute('uv');
      if (uv) {
        for (let i = 0; i < uv.count; i++) {
          uv.setXY(i, uv.getX(i) * uvRepeat[0], uv.getY(i) * uvRepeat[1]);
        }
      }
    }
    this.applyTransform(g, position, rotation);
    this.getBucket(key).push(g);
    return this;
  }

  addCone(
    key: string,
    args: [number, number, number?],
    position: [number, number, number] = [0, 0, 0],
    rotation?: [number, number, number],
  ): this {
    const g = new THREE.ConeGeometry(args[0], args[1], args[2] ?? 8);
    this.applyTransform(g, position, rotation);
    this.getBucket(key).push(g);
    return this;
  }

  addTorus(
    key: string,
    args: [number, number, number?, number?, number?],
    position: [number, number, number] = [0, 0, 0],
    rotation?: [number, number, number],
  ): this {
    const g = new THREE.TorusGeometry(
      args[0],
      args[1],
      args[2] ?? 10,
      args[3] ?? 24,
      args[4],
    );
    this.applyTransform(g, position, rotation);
    this.getBucket(key).push(g);
    return this;
  }

  addRing(
    key: string,
    args: [number, number, number, number?, number?, number?],
    position: [number, number, number] = [0, 0, 0],
    rotation?: [number, number, number],
  ): this {
    const g = new THREE.RingGeometry(args[0], args[1], args[2], args[3] ?? 1, args[4], args[5]);
    this.applyTransform(g, position, rotation);
    this.getBucket(key).push(g);
    return this;
  }

  addGeometry(
    key: string,
    sourceGeometry: THREE.BufferGeometry,
    position: [number, number, number] = [0, 0, 0],
    rotation?: [number, number, number],
    scale?: [number, number, number],
  ): this {
    const g = sourceGeometry.clone();
    this.applyTransform(g, position, rotation, scale);
    this.getBucket(key).push(g);
    return this;
  }

  private applyTransform(
    g: THREE.BufferGeometry,
    position: [number, number, number],
    rotation?: [number, number, number],
    scale?: [number, number, number],
  ): void {
    if (!rotation && !scale) {
      if (position[0] !== 0 || position[1] !== 0 || position[2] !== 0) {
        g.translate(position[0], position[1], position[2]);
      }
      return;
    }
    _position.set(position[0], position[1], position[2]);
    if (rotation) {
      _euler.set(rotation[0], rotation[1], rotation[2]);
      _quaternion.setFromEuler(_euler);
    } else {
      _quaternion.identity();
    }
    if (scale) {
      _scale.set(scale[0], scale[1], scale[2]);
    } else {
      _scale.set(1, 1, 1);
    }
    _matrix.compose(_position, _quaternion, _scale);
    g.applyMatrix4(_matrix);
  }

  buildAll(): Record<string, THREE.BufferGeometry> {
    const out: Record<string, THREE.BufferGeometry> = {};
    for (const [key, list] of this.buckets.entries()) {
      if (list.length > 0) {
        out[key] = mergeBufferGeometries(list, true);
      }
    }
    this.buckets.clear();
    return out;
  }
}

export function disposeMergedMap(map: Record<string, THREE.BufferGeometry>): void {
  for (const g of Object.values(map)) {
    g.dispose();
  }
}
