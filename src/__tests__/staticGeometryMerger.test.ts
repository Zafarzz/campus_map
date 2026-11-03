import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  disposeMergedMap,
  mergeBufferGeometries,
  NO_RAYCAST,
  StaticGeometryBatcher,
} from '../components/3d/geometry/staticGeometryMerger';

describe('StaticGeometryBatcher & mergeBufferGeometries', () => {
  it('NO_RAYCAST returns null to short-circuit Three.js raycast checks', () => {
    expect(NO_RAYCAST()).toBeNull();
  });

  it('merges multiple primitives by material bucket into single BufferGeometries', () => {
    const batcher = new StaticGeometryBatcher();
    batcher.addBox('plaster', [2, 3, 4], [1, 2, 3]);
    batcher.addBox('plaster', [1, 1, 1], [-2, 0, 5], [0, Math.PI / 4, 0]);
    batcher.addCylinder('metal', [0.5, 0.5, 2, 8], [0, 1, 0]);
    batcher.addPlane('glass', [4, 2], [0, 2, 1], [0, 0, 0], [3, 2]);

    const compiled = batcher.buildAll();
    expect(Object.keys(compiled)).toHaveLength(3);

    const plasterGeo = compiled.plaster!;
    expect(plasterGeo).toBeInstanceOf(THREE.BufferGeometry);
    // 2 boxes * 36 vertices = 72 vertices
    expect(plasterGeo.getAttribute('position').count).toBe(72);
    expect(plasterGeo.getAttribute('normal').count).toBe(72);
    expect(plasterGeo.getAttribute('uv').count).toBe(72);
    expect(plasterGeo.boundingSphere).not.toBeNull();

    const glassGeo = compiled.glass!;
    const uvAttr = glassGeo.getAttribute('uv');
    let maxU = 0;
    let maxV = 0;
    for (let i = 0; i < uvAttr.count; i++) {
      maxU = Math.max(maxU, uvAttr.getX(i));
      maxV = Math.max(maxV, uvAttr.getY(i));
    }
    expect(maxU).toBeCloseTo(3);
    expect(maxV).toBeCloseTo(2);

    disposeMergedMap(compiled);
  });

  it('handles empty geometry list safely in mergeBufferGeometries', () => {
    const empty = mergeBufferGeometries([]);
    expect(empty).toBeInstanceOf(THREE.BufferGeometry);
  });
});
