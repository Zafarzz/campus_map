import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  disposeMergedMap,
  NO_RAYCAST,
  StaticGeometryBatcher,
} from './geometry/staticGeometryMerger';

export type SolarCanopiesProps = {
  positions?: [number, number, number][];
};

type CanopySpec = {
  pos: [number, number, number];
  length: number;
  width: number;
};

/**
 * Photovoltaic (PV) Carport Canopy Structures & Dormitory Parking Ensemble:
 * Calibrated directly to CAD reference masterplan (media_1792882021253.png):
 * - Solar Canopy segments with structural steel T-frames and tilted monocrystalline solar arrays.
 * - Asphalt parking lot with white stall striping and parked EV campus vehicles.
 * - South utility garages/sheds along the perimeter fence.
 * - West covered shelter & utility structure along the west wing.
 */
export function SolarCanopies({ positions }: SolarCanopiesProps) {
  const materials = useMemo(() => {
    const steelMat = new THREE.MeshStandardMaterial({
      color: '#334155',
      metalness: 0.8,
      roughness: 0.35,
    });
    const solarMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.22,
      metalness: 0.75,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: '#94a3b8',
      metalness: 0.9,
      roughness: 0.25,
    });
    const lineMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
    });
    const asphaltMat = new THREE.MeshStandardMaterial({
      color: '#475569',
      roughness: 0.88,
    });
    const curbMat = new THREE.MeshStandardMaterial({
      color: '#94a3b8',
      roughness: 0.85,
    });
    const hedgeMat = new THREE.MeshStandardMaterial({
      color: '#2d5a27',
      roughness: 0.8,
    });
    const garageWallMat = new THREE.MeshStandardMaterial({
      color: '#e2e8f0',
      roughness: 0.85,
    });
    const garageRoofMat = new THREE.MeshStandardMaterial({
      color: '#78350f',
      roughness: 0.65,
    });
    const corrugatedMat = new THREE.MeshStandardMaterial({
      color: '#94a3b8',
      metalness: 0.7,
      roughness: 0.4,
    });

    const carColors = ['#f8fafc', '#0284c7', '#334155', '#b91c1c', '#e2e8f0', '#059669'];
    const carMats = carColors.map(
      (c) =>
        new THREE.MeshStandardMaterial({
          color: c,
          metalness: 0.6,
          roughness: 0.3,
        }),
    );

    return {
      steelMat,
      solarMat,
      trimMat,
      lineMat,
      asphaltMat,
      curbMat,
      hedgeMat,
      garageWallMat,
      garageRoofMat,
      corrugatedMat,
      carMats,
    };
  }, []);

  const canopies: CanopySpec[] = useMemo(() => {
    if (positions && positions.length >= 2) {
      return positions.map((p) => ({ pos: p, length: 25.0, width: 6.5 }));
    }
    return [
      { pos: [-66.0, 0, 164.0], length: 25.0, width: 6.5 },
      { pos: [-66.0, 0, 180.0], length: 25.0, width: 6.5 },
    ];
  }, [positions]);

  const parkingGeo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-88.0, -153.0);
    shape.lineTo(-50.0, -153.0);
    shape.lineTo(-50.0, -193.5);
    shape.lineTo(-88.0, -201.5);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, []);

  const merged = useMemo(() => {
    const batcher = new StaticGeometryBatcher();

    // 1. Surrounding Concrete Curbs & Hedge
    batcher.addBox('curb', [38.0, 0.06, 0.2], [-69.0, 0.04, 153.0]);
    batcher.addBox('curb', [0.2, 0.06, 48.5], [-88.0, 0.04, 177.25]);
    batcher.addBox('curb', [0.2, 0.06, 40.5], [-50.0, 0.04, 173.25]);
    batcher.addBox('hedge', [36.0, 0.5, 0.8], [-69.0, 0.25, 152.5]);

    const wheelProto = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12);
    wheelProto.rotateZ(Math.PI / 2);

    // 2. Solar Canopies
    canopies.forEach((canopy, cIdx) => {
      const [cx, cy, cz] = canopy.pos;
      const cLen = canopy.length;
      const cW = canopy.width;
      const columnCount = 5;
      const colSpacing = cLen / (columnCount - 1);
      const stallCount = 8;
      const stallW = cLen / stallCount;

      for (let sIdx = 0; sIdx <= stallCount; sIdx++) {
        const sx = -cLen / 2 + sIdx * stallW;
        batcher.addBox('line', [0.1, 0.002, cW], [cx + sx, cy + 0.026, cz]);
      }

      for (let colIdx = 0; colIdx < columnCount; colIdx++) {
        const colX = cx - cLen / 2 + colIdx * colSpacing;
        batcher.addCylinder('curb', [0.22, 0.28, 0.3, 12], [colX, cy + 0.15, cz]);
        batcher.addCylinder('steel', [0.11, 0.13, 3.2, 12], [colX, cy + 1.6, cz]);
        batcher.addBox('steel', [0.18, 0.22, cW - 0.4], [colX, cy + 3.2, cz]);
      }

      for (const pz of [-1.8, 0, 1.8]) {
        batcher.addBox('steel', [cLen, 0.1, 0.1], [cx, cy + 3.32, cz + pz]);
      }

      batcher.addBox('solar', [cLen, 0.04, cW], [cx, cy + 3.42, cz], [0.19, 0, 0]);
      batcher.addBox('trim', [cLen + 0.06, 0.05, cW + 0.06], [cx, cy + 3.42, cz], [0.19, 0, 0]);

      [0, 2, 4, 6].forEach((stallIdx, vIdx) => {
        const carX = cx - cLen / 2 + (stallIdx + 0.5) * stallW;
        const carY = cy + 0.75;
        const carZ = cz + 0.1;
        const carKey = `car_${(cIdx * 2 + vIdx) % 6}`;

        batcher.addBox(carKey, [1.9, 0.7, 4.0], [carX, carY, carZ]);
        batcher.addBox('steel', [1.6, 0.5, 2.3], [carX, carY + 0.52, carZ - 0.2]);

        for (const wx of [-0.92, 0.92]) {
          for (const wz of [-1.25, 1.25]) {
            batcher.addGeometry('steel', wheelProto, [carX + wx, carY - 0.38, carZ + wz]);
          }
        }
      });
    });

    wheelProto.dispose();

    // 3. South Utility Garages / Sheds along diagonal fence
    batcher.addBox('garageWall', [11.0, 3.2, 6.5], [-75.0, 1.6, 198.5], [0, 0.2186, 0]);
    batcher.addBox('garageRoof', [11.6, 1.2, 7.1], [-75.0, 3.8, 198.5], [0, 0.2186, 0]);

    batcher.addBox('garageWall', [8.5, 2.8, 5.5], [-63.5, 1.4, 196.0], [0, 0.2186, 0]);
    batcher.addBox('garageRoof', [9.1, 1.0, 6.1], [-63.5, 3.3, 196.0], [0, 0.2186, 0]);

    batcher.addBox('garageWall', [6.5, 2.6, 5.0], [-54.0, 1.3, 194.0], [0, 0.2186, 0]);
    batcher.addBox('garageRoof', [7.1, 0.9, 5.6], [-54.0, 3.05, 194.0], [0, 0.2186, 0]);

    // 4. West Covered Shelter & Utility Structure
    batcher.addBox('curb', [6.0, 0.1, 19.5], [-94.5, 0.05, 103.5]);
    for (const pz of [-8.5, -4.25, 0, 4.25, 8.5]) {
      batcher.addCylinder('steel', [0.06, 0.06, 3.0, 8], [-94.5 - 2.7, 1.5, 103.5 + pz]);
      batcher.addCylinder('steel', [0.06, 0.06, 3.0, 8], [-94.5 + 2.7, 1.5, 103.5 + pz]);
    }
    batcher.addBox('corrugated', [6.4, 0.15, 20.0], [-94.5, 3.1, 103.5]);

    batcher.addBox('garageWall', [6.0, 3.2, 7.5], [-94.5, 1.6, 118.5]);
    batcher.addBox('garageRoof', [6.6, 0.7, 8.1], [-94.5, 3.5, 118.5]);

    return batcher.buildAll();
  }, [canopies]);

  useEffect(() => {
    return () => {
      parkingGeo.dispose();
      disposeMergedMap(merged);
      materials.steelMat.dispose();
      materials.solarMat.dispose();
      materials.trimMat.dispose();
      materials.lineMat.dispose();
      materials.asphaltMat.dispose();
      materials.curbMat.dispose();
      materials.hedgeMat.dispose();
      materials.garageWallMat.dispose();
      materials.garageRoofMat.dispose();
      materials.corrugatedMat.dispose();
      materials.carMats.forEach((m) => m.dispose());
    };
  }, [parkingGeo, merged, materials]);

  return (
    <group>
      <mesh
        geometry={parkingGeo}
        material={materials.asphaltMat}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.015, 0]}
        receiveShadow
        raycast={NO_RAYCAST}
      />
      {merged.curb && (
        <mesh geometry={merged.curb} material={materials.curbMat} receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.hedge && (
        <mesh geometry={merged.hedge} material={materials.hedgeMat} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.line && (
        <mesh geometry={merged.line} material={materials.lineMat} raycast={NO_RAYCAST} />
      )}
      {merged.steel && (
        <mesh geometry={merged.steel} material={materials.steelMat} castShadow raycast={NO_RAYCAST} />
      )}
      {merged.solar && (
        <mesh geometry={merged.solar} material={materials.solarMat} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.trim && (
        <mesh geometry={merged.trim} material={materials.trimMat} raycast={NO_RAYCAST} />
      )}
      {merged.garageWall && (
        <mesh geometry={merged.garageWall} material={materials.garageWallMat} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.garageRoof && (
        <mesh geometry={merged.garageRoof} material={materials.garageRoofMat} castShadow raycast={NO_RAYCAST} />
      )}
      {merged.corrugated && (
        <mesh geometry={merged.corrugated} material={materials.corrugatedMat} castShadow raycast={NO_RAYCAST} />
      )}
      {materials.carMats.map((carMat, idx) => {
        const g = merged[`car_${idx}`];
        if (!g) return null;
        return (
          <mesh
            key={`car-batch-${idx}`}
            geometry={g}
            material={carMat}
            castShadow
            receiveShadow
            raycast={NO_RAYCAST}
          />
        );
      })}
    </group>
  );
}

