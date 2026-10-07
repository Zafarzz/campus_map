import { useMemo } from 'react';
import * as THREE from 'three';
import type { CampusGeometry } from '../../domain/geometry/types';

export function Vegetation({ geometry }: { geometry: CampusGeometry }) {
  const treeCount = 150;
  
  const [treePositions, treeScales] = useMemo(() => {
    const positions: THREE.Vector3[] = [];
    const scales: number[] = [];
    
    // Find lawn areas to place trees
    const lawns = geometry.context.filter(f => f.kind === 'lawn');
    if (lawns.length === 0) return [positions, scales];
    
    // Simple random scatter within lawns
    let attempts = 0;
    while (positions.length < treeCount && attempts < 1000) {
      attempts++;
      const lawn = lawns[Math.floor(Math.random() * lawns.length)];
      if (lawn.footprint.type !== 'polygon') continue;
      
      const pts = lawn.footprint.points;
      if (pts.length < 3) continue;
      
      // Bounding box of the lawn polygon
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [x, z] of pts) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      
      const px = minX + Math.random() * (maxX - minX);
      const pz = minZ + Math.random() * (maxZ - minZ);
      
      // Simple point-in-polygon check
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0], zi = pts[i][1];
        const xj = pts[j][0], zj = pts[j][1];
        const intersect = ((zi > pz) !== (zj > pz)) && (px < (xj - xi) * (pz - zi) / (zj - zi) + xi);
        if (intersect) inside = !inside;
      }
      
      if (inside) {
        positions.push(new THREE.Vector3(px, 0, pz));
        scales.push(0.8 + Math.random() * 0.6);
      }
    }
    return [positions, scales];
  }, [geometry]);

  // Create instanced meshes for trunk and leaves
  const trunkMesh = useMemo(() => {
    const mesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.2, 0.4, 2, 5),
      new THREE.MeshStandardMaterial({ color: '#5c4033', roughness: 0.9 }),
      treePositions.length
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    const dummy = new THREE.Object3D();
    treePositions.forEach((pos, i) => {
      const scale = treeScales[i];
      dummy.position.set(pos.x, 1 * scale, pos.z);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.y = Math.random() * Math.PI;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [treePositions, treeScales]);

  const leavesMesh = useMemo(() => {
    const mesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(2, 1),
      new THREE.MeshStandardMaterial({ color: '#4ade80', roughness: 0.8 }),
      treePositions.length
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    const dummy = new THREE.Object3D();
    treePositions.forEach((pos, i) => {
      const scale = treeScales[i];
      dummy.position.set(pos.x, 3.5 * scale, pos.z);
      dummy.scale.set(scale, scale * 1.2, scale);
      dummy.rotation.set(Math.random(), Math.random(), Math.random());
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [treePositions, treeScales]);

  if (treePositions.length === 0) return null;

  return (
    <group>
      <primitive object={trunkMesh} />
      <primitive object={leavesMesh} />
    </group>
  );
}
