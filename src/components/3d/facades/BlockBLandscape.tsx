import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  NO_RAYCAST,
  StaticGeometryBatcher,
  disposeMergedMap,
} from '../geometry/staticGeometryMerger';

export type BlockBLandscapeProps = {
  scaleX?: number;
  sign?: number; // 1 if facing south, -1 if facing north
  signX?: number; // 1 if facing south, -1 if facing north
  opacity?: number;
  transparent?: boolean;
};

/**
 * Creates a 4-pitched hip/pyramidal roof geometry for the Gazebo (Беседка).
 */
function createGazeboHipRoofGeometry(width: number, depth: number, height: number): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  const hw = width / 2;
  const hd = depth / 2;
  const ridgeLen = Math.max(0, width - depth * 0.8);
  const hr = ridgeLen / 2;

  const vertices = [
    -hw, 0, hd,   hw, 0, hd,   hr, height, 0,
    -hw, 0, hd,   hr, height, 0, -hr, height, 0,
    hw, 0, -hd,  -hw, 0, -hd,  -hr, height, 0,
    hw, 0, -hd,  -hr, height, 0,  hr, height, 0,
    -hw, 0, -hd, -hw, 0, hd,   -hr, height, 0,
    hw, 0, hd,    hw, 0, -hd,   hr, height, 0,
  ];

  geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geom.computeVertexNormals();
  return geom;
}

let cachedGazeboPlaqueTex: THREE.CanvasTexture | null = null;

function getGazeboPlaqueTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (cachedGazeboPlaqueTex) return cachedGazeboPlaqueTex;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 256, 64);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(4, 4, 248, 56);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Беседка', 128, 32);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  cachedGazeboPlaqueTex = texture;
  return texture;
}

/**
 * Architectural landscape elements in front of Block B (Беседка & Надземная теплотрасса).
 * Optimized via StaticGeometryBatcher: merges all 85+ gazebo balusters, curtains, pipeline supports,
 * and cabinet parts into 8 material-batched draw calls.
 */
export function BlockBLandscape({
  scaleX = 1,
  sign = -1,
  signX = -1,
  opacity = 1,
  transparent = false,
}: BlockBLandscapeProps) {
  const sX = signX ?? sign;

  const materials = useMemo(() => {
    const timberMat = new THREE.MeshStandardMaterial({
      color: '#8b5a2b',
      roughness: 0.75,
      metalness: 0.05,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const patioMat = new THREE.MeshStandardMaterial({
      color: '#e2e8f0',
      roughness: 0.9,
      metalness: 0.05,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const gazeboRoofMat = new THREE.MeshStandardMaterial({
      color: '#7f1d1d',
      roughness: 0.65,
      metalness: 0.1,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const curtainMat = new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      roughness: 0.95,
      metalness: 0.0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: transparent ? opacity * 0.8 : 0.92,
      depthWrite: !transparent,
    });

    const pipeMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      roughness: 0.35,
      metalness: 0.7,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const steelRackMat = new THREE.MeshStandardMaterial({
      color: '#475569',
      roughness: 0.6,
      metalness: 0.5,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const cabinetMat = new THREE.MeshStandardMaterial({
      color: '#64748b',
      roughness: 0.5,
      metalness: 0.4,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const plaqueTex = getGazeboPlaqueTexture();
    const plaqueMat = plaqueTex
      ? new THREE.MeshBasicMaterial({ map: plaqueTex, transparent: true })
      : new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.8 });

    return {
      timberMat,
      patioMat,
      gazeboRoofMat,
      curtainMat,
      pipeMat,
      steelRackMat,
      cabinetMat,
      plaqueMat,
    };
  }, [transparent, opacity]);

  const gw = 5.2;
  const gd = 4.0;
  const eaveH = 2.6;
  const roofH = 1.1;
  const gzX = 18.0 * scaleX * sX;
  const gzZ = sign * 9.0;

  const merged = useMemo(() => {
    const batcher = new StaticGeometryBatcher();

    // 1. Gazebo
    batcher.addBox('patio', [gw + 0.8, 0.24, gd + 0.8], [gzX, 0.12, gzZ]);
    batcher.addBox('steelRack', [gw + 0.9, 0.06, gd + 0.9], [gzX, 0.14, gzZ]);
    batcher.addBox('patio', [1.8, 0.08, 1.6], [gzX + (-gw / 2 - 1.2) * sX, 0.04, gzZ]);

    for (const [cx, cz] of [
      [-gw / 2 + 0.15, -gd / 2 + 0.15],
      [0, -gd / 2 + 0.15],
      [gw / 2 - 0.15, -gd / 2 + 0.15],
      [-gw / 2 + 0.15, gd / 2 - 0.15],
      [0, gd / 2 - 0.15],
      [gw / 2 - 0.15, gd / 2 - 0.15],
    ]) {
      batcher.addBox('timber', [0.16, eaveH, 0.16], [gzX + cx, 0.24 + eaveH / 2, gzZ + cz]);
    }

    batcher.addBox('timber', [gw, 0.16, 0.16], [gzX, 0.24 + eaveH - 0.08, gzZ - gd / 2 + 0.15]);
    batcher.addBox('timber', [gw, 0.16, 0.16], [gzX, 0.24 + eaveH - 0.08, gzZ + gd / 2 - 0.15]);
    batcher.addBox('timber', [0.16, 0.16, gd], [gzX - gw / 2 + 0.15, 0.24 + eaveH - 0.08, gzZ]);
    batcher.addBox('timber', [0.16, 0.16, gd], [gzX + gw / 2 - 0.15, 0.24 + eaveH - 0.08, gzZ]);

    const roofGeo = createGazeboHipRoofGeometry(gw + 0.6, gd + 0.6, roofH);
    batcher.addGeometry('gazeboRoof', roofGeo, [gzX, 0.24 + eaveH, gzZ]);
    roofGeo.dispose();

    // Front & Back Railings
    for (const rz of [-sign * (gd / 2 - 0.15), sign * (gd / 2 - 0.15)]) {
      batcher.addBox('timber', [gw - 0.3, 0.06, 0.08], [gzX, 0.24 + 0.87, gzZ + rz]);
      batcher.addBox('timber', [gw - 0.3, 0.06, 0.08], [gzX, 0.24 + 0.03, gzZ + rz]);
      for (const bx of [-2.0, -1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5, 2.0]) {
        batcher.addBox('timber', [0.04, 0.8, 0.04], [gzX + bx, 0.24 + 0.45, gzZ + rz]);
      }
    }

    // Closed Side Railing
    const rxSide = gzX + (gw / 2 - 0.15) * sX;
    batcher.addBox('timber', [0.08, 0.06, gd - 0.3], [rxSide, 0.24 + 0.87, gzZ]);
    batcher.addBox('timber', [0.08, 0.06, gd - 0.3], [rxSide, 0.24 + 0.03, gzZ]);
    for (const bz of [-1.4, -0.7, 0, 0.7, 1.4]) {
      batcher.addBox('timber', [0.04, 0.8, 0.04], [rxSide, 0.24 + 0.45, gzZ + bz]);
    }

    // Walkway Side Railing
    const lxSide = gzX + (-gw / 2 + 0.15) * sX;
    for (const segZ of [-1.2, 1.2]) {
      batcher.addBox('timber', [0.08, 0.06, 1.1], [lxSide, 0.24 + 0.87, gzZ + segZ]);
      batcher.addBox('timber', [0.08, 0.06, 1.1], [lxSide, 0.24 + 0.03, gzZ + segZ]);
      for (const bz of [-0.35, 0, 0.35]) {
        batcher.addBox('timber', [0.04, 0.8, 0.04], [lxSide, 0.24 + 0.45, gzZ + segZ + bz]);
      }
    }

    // Picnic Table & Benches
    batcher.addBox('timber', [3.2, 0.06, 1.0], [gzX, 0.24 + 0.76, gzZ]);
    for (const tx of [-1.2, 1.2]) {
      batcher.addBox('timber', [0.1, 0.74, 0.8], [gzX + tx, 0.24 + 0.38, gzZ]);
      batcher.addBox('timber', [0.08, 0.45, 0.28], [gzX + tx, 0.24 + 0.23, gzZ - 0.9]);
      batcher.addBox('timber', [0.08, 0.45, 0.28], [gzX + tx, 0.24 + 0.23, gzZ + 0.9]);
    }
    batcher.addBox('timber', [3.2, 0.05, 0.35], [gzX, 0.24 + 0.46, gzZ - 0.9]);
    batcher.addBox('timber', [3.2, 0.05, 0.35], [gzX, 0.24 + 0.46, gzZ + 0.9]);

    // Curtains
    const coneGeo = new THREE.ConeGeometry(0.28, eaveH * 0.55, 8);
    for (const [cx, cz] of [
      [-gw / 2 + 0.3, -gd / 2 + 0.3],
      [gw / 2 - 0.3, -gd / 2 + 0.3],
      [-gw / 2 + 0.3, gd / 2 - 0.3],
      [gw / 2 - 0.3, gd / 2 - 0.3],
    ]) {
      batcher.addGeometry('curtain', coneGeo, [gzX + cx, 0.24 + eaveH * 0.72, gzZ + cz]);
      batcher.addCylinder('timber', [0.14, 0.14, 0.06, 8], [gzX + cx, 0.24 + eaveH * 0.42, gzZ + cz]);
      batcher.addCylinder('curtain', [0.14, 0.22, eaveH * 0.4, 8], [gzX + cx, 0.24 + eaveH * 0.2, gzZ + cz]);
    }
    coneGeo.dispose();

    // 2. Elevated Heating Pipeline
    const pipeZ = sign * 6.8;
    const pipeRadius = 0.11;
    const pipeSpacing = 0.32;
    const pLowX1 = Math.min(12.0 * scaleX * sX, 27.5 * scaleX * sX);
    const pLowX2 = Math.max(12.0 * scaleX * sX, 27.5 * scaleX * sX);
    const runLength = pLowX2 - pLowX1;
    const runCenterX = (pLowX1 + pLowX2) / 2;

    const px1 = 8.5 * scaleX * sX;
    const px2 = 12.0 * scaleX * sX;
    const archW = Math.abs(px2 - px1);
    const archH = 3.0;
    const topY = 3.85;

    for (const offsetZ of [-pipeSpacing / 2, pipeSpacing / 2]) {
      batcher.addCylinder('pipe', [pipeRadius, pipeRadius, runLength, 10], [runCenterX, 0.85, pipeZ + offsetZ], [0, 0, Math.PI / 2]);
      batcher.addCylinder('pipe', [pipeRadius, pipeRadius, archH, 10], [px1, 0.85 + archH / 2, pipeZ + offsetZ]);
      batcher.addSphere('pipe', [pipeRadius * 1.15, 8, 8], [px1 + Math.sign(px2 - px1) * pipeRadius * 0.7, topY - pipeRadius * 0.7, pipeZ + offsetZ]);
      batcher.addCylinder('pipe', [pipeRadius, pipeRadius, archW, 10], [(px1 + px2) / 2, topY, pipeZ + offsetZ], [0, 0, Math.PI / 2]);
      batcher.addSphere('pipe', [pipeRadius * 1.15, 8, 8], [px2 - Math.sign(px2 - px1) * pipeRadius * 0.7, topY - pipeRadius * 0.7, pipeZ + offsetZ]);
      batcher.addCylinder('pipe', [pipeRadius, pipeRadius, archH, 10], [px2, 0.85 + archH / 2, pipeZ + offsetZ]);
    }

    for (const rx of [14.0, 18.5, 23.0, 27.0]) {
      const rackX = rx * scaleX * sX;
      batcher.addCylinder('steelRack', [0.045, 0.045, 0.8, 6], [rackX, 0.4, pipeZ]);
      batcher.addBox('steelRack', [0.08, 0.05, pipeSpacing + 0.3], [rackX, 0.74, pipeZ]);
      batcher.addBox('patio', [0.25, 0.1, 0.5], [rackX, 0.05, pipeZ]);
    }

    for (const frameX of [px1, px2]) {
      for (const colZ of [-pipeSpacing / 2 - 0.12, pipeSpacing / 2 + 0.12]) {
        batcher.addBox('steelRack', [0.07, 3.8, 0.07], [frameX, 1.9, pipeZ + colZ]);
      }
      for (const tieY of [1.2, 2.4, 3.6]) {
        batcher.addBox('steelRack', [0.08, 0.05, pipeSpacing + 0.3], [frameX, tieY, pipeZ]);
      }
    }

    // Utility Control Cabinet
    const cabZ = pipeZ + sign * 0.8;
    for (const lx of [-0.3, 0.3]) {
      batcher.addCylinder('steelRack', [0.03, 0.03, 0.7, 6], [px1 + lx, 0.35, cabZ]);
    }
    batcher.addBox('cabinet', [0.85, 0.95, 0.45], [px1, 1.15, cabZ]);
    batcher.addBox('steelRack', [0.02, 0.85, 0.02], [px1, 1.15, cabZ + sign * 0.23]);
    batcher.addBox('timber', [0.03, 0.12, 0.03], [px1 + 0.2 * sX, 1.15, cabZ + sign * 0.24]);
    batcher.addBox('steelRack', [0.92, 0.05, 0.52], [px1, 1.65, cabZ]);

    // Outdoor Metal Waste Bin
    const binX = 9.8 * scaleX * sX;
    const binZ = pipeZ + sign * 1.1;
    for (const bx of [-0.18, 0.18]) {
      batcher.addBox('steelRack', [0.03, 0.8, 0.03], [binX + bx, 0.4, binZ]);
      batcher.addBox('steelRack', [0.03, 0.04, 0.26], [binX + bx, 0.02, binZ]);
    }
    batcher.addBox('cabinet', [0.32, 0.45, 0.24], [binX, 0.45, binZ]);
    batcher.addBox('steelRack', [0.38, 0.03, 0.3], [binX, 0.78, binZ]);

    return batcher.buildAll();
  }, [scaleX, sign, sX, gw, gd, eaveH, roofH, gzX, gzZ]);

  useEffect(() => () => disposeMergedMap(merged), [merged]);

  return (
    <group>
      {merged.patio && (
        <mesh geometry={merged.patio} material={materials.patioMat} raycast={NO_RAYCAST} receiveShadow castShadow />
      )}
      {merged.timber && (
        <mesh geometry={merged.timber} material={materials.timberMat} raycast={NO_RAYCAST} castShadow />
      )}
      {merged.gazeboRoof && (
        <mesh geometry={merged.gazeboRoof} material={materials.gazeboRoofMat} raycast={NO_RAYCAST} castShadow receiveShadow />
      )}
      {merged.curtain && (
        <mesh geometry={merged.curtain} material={materials.curtainMat} raycast={NO_RAYCAST} />
      )}
      {merged.pipe && (
        <mesh geometry={merged.pipe} material={materials.pipeMat} raycast={NO_RAYCAST} castShadow />
      )}
      {merged.steelRack && (
        <mesh geometry={merged.steelRack} material={materials.steelRackMat} raycast={NO_RAYCAST} />
      )}
      {merged.cabinet && (
        <mesh geometry={merged.cabinet} material={materials.cabinetMat} raycast={NO_RAYCAST} castShadow />
      )}
      <mesh
        position={[gzX, 0.24 + eaveH + 0.28, gzZ + sign * (gd / 2 + 0.18)]}
        rotation={[0, sign === 1 ? 0 : Math.PI, 0]}
        material={materials.plaqueMat}
        raycast={NO_RAYCAST}
      >
        <planeGeometry args={[1.6, 0.4]} />
      </mesh>
    </group>
  );
}
