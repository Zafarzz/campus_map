import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mapConfig } from '../../config/mapConfig';
import type { ConnectorGeometry } from '../../domain/geometry/types';
import { DaewooHallFacade } from './facades/DaewooHallFacade';
import { SuwonHallFacade } from './facades/SuwonHallFacade';
import {
  disposeMergedMap,
  NO_RAYCAST,
  StaticGeometryBatcher,
} from './geometry/staticGeometryMerger';

const FLOOR_HEIGHT = mapConfig.building.floorHeight;

/**
 * Creates 4-pitched hip roof geometry for connectors matching building roofs (image-1.png, Item 3).
 */
function createConnectorHipRoofGeometry(
  width: number,
  depth: number,
  height: number,
): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  const hw = width / 2;
  const hd = depth / 2;
  const isX = width >= depth;
  const ridgeLen = isX ? Math.max(0.6, width - depth * 0.7) : Math.max(0.6, depth - width * 0.7);
  const hr = ridgeLen / 2;

  let positions: number[];
  if (isX) {
    positions = [
      // South face
      -hw, 0, hd,  hw, 0, hd,  hr, height, 0,
      -hw, 0, hd,  hr, height, 0,  -hr, height, 0,
      // North face
      hw, 0, -hd,  -hw, 0, -hd,  -hr, height, 0,
      hw, 0, -hd,  -hr, height, 0,   hr, height, 0,
      // West hip
      -hw, 0, -hd,  -hw, 0, hd,  -hr, height, 0,
      // East hip
      hw, 0, hd,   hw, 0, -hd,   hr, height, 0,
    ];
  } else {
    positions = [
      // East face
      hw, 0, -hd,  hw, 0, hd,  0, height, hr,
      hw, 0, -hd,  0, height, hr,  0, height, -hr,
      // West face
      -hw, 0, hd,  -hw, 0, -hd,  0, height, -hr,
      -hw, 0, hd,  0, height, -hr,  0, height, hr,
      // North hip
      -hw, 0, -hd,  hw, 0, -hd,  0, height, -hr,
      // South hip
      hw, 0, hd,  -hw, 0, hd,  0, height, hr,
    ];
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return geom;
}

type Props = {
  connectors?: ConnectorGeometry[];
  selectedBuildingId?: string;
};

/**
 * 3D architectural rendering for glazed inter-building connectors (ADR-020).
 */
export function CampusConnectors({ connectors, selectedBuildingId }: Props) {
  if (!connectors || connectors.length === 0) return null;

  return (
    <group name="campus-connectors">
      {connectors.map((c) => {
        const isConnected = selectedBuildingId ? c.buildingIds.includes(selectedBuildingId) : false;
        const dimmed = selectedBuildingId ? !isConnected : false;

        return (
          <GlazedConnectorMesh
            key={c.id}
            connector={c}
            dimmed={dimmed}
          />
        );
      })}
    </group>
  );
}

function GlazedConnectorMesh({
  connector,
  dimmed,
}: {
  connector: ConnectorGeometry;
  dimmed: boolean;
}) {
  const footprint = connector.footprint;
  if (footprint.type !== 'rect') return null;

  const [cx, cz] = footprint.center;
  const [w, d] = footprint.size;
  const height = connector.id === 'conn-bld-d-bld-b' ? 4.95 : (connector.height || 3.0);
  const plinthH = 0.3;
  const roofH = 0.24;
  const windowH = height - plinthH - roofH;
  const isXLong = w >= d;
  const length = isXLong ? w : d;

  const materials = useMemo(() => {
    return {
      glass: new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.12,
        metalness: 0.75,
        transparent: true,
        opacity: dimmed ? 0.25 : 0.7,
        depthWrite: false,
      }),
      frame: new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.6,
        metalness: 0.4,
        transparent: dimmed,
        opacity: dimmed ? 0.35 : 1,
      }),
      plinth: new THREE.MeshStandardMaterial({
        color: '#334155',
        roughness: 0.85,
        transparent: dimmed,
        opacity: dimmed ? 0.35 : 1,
      }),
      roof: new THREE.MeshStandardMaterial({
        color: '#475569',
        roughness: 0.7,
        metalness: 0.2,
        transparent: dimmed,
        opacity: dimmed ? 0.35 : 1,
      }),
      redRoof: new THREE.MeshStandardMaterial({
        color: '#991b1b',
        roughness: 0.65,
        metalness: 0.08,
        transparent: dimmed,
        opacity: dimmed ? 0.35 : 1,
      }),
      whiteTrim: new THREE.MeshStandardMaterial({
        color: '#f1f5f9',
        roughness: 0.85,
        metalness: 0.05,
        transparent: dimmed,
        opacity: dimmed ? 0.35 : 1,
      }),
      woodColumn: new THREE.MeshStandardMaterial({
        color: '#422006',
        roughness: 0.45,
      }),
      marbleTable: new THREE.MeshStandardMaterial({
        color: '#0f172a',
        roughness: 0.2,
        metalness: 0.3,
      }),
      chairYellow: new THREE.MeshStandardMaterial({
        color: '#eab308',
        roughness: 0.7,
      }),
      chairGreen: new THREE.MeshStandardMaterial({
        color: '#047857',
        roughness: 0.7,
      }),
      chairBurgundy: new THREE.MeshStandardMaterial({
        color: '#831843',
        roughness: 0.7,
      }),
      handrailSteel: new THREE.MeshStandardMaterial({
        color: '#cbd5e1',
        roughness: 0.25,
        metalness: 0.85,
      }),
    };
  }, [dimmed]);

  const merged = useMemo(() => {
    const batcher = new StaticGeometryBatcher();
    const roofPitchH = 2.2;
    const storeyCount = Math.max(1, Math.round(height / FLOOR_HEIGHT));
    const storeyH = windowH / storeyCount;
    const along = length - 0.15;
    const bar = (thickAlong: number, h: number, thickAcross: number): [number, number, number] =>
      isXLong ? [thickAlong, h, thickAcross] : [thickAcross, h, thickAlong];

    // 1. Floor Base Plinth
    batcher.addBox(
      'plinth',
      connector.id === 'conn-bld-g-bld-i' ? [w - 0.3, plinthH, d] : [w, plinthH, d],
      connector.id === 'conn-bld-g-bld-i' ? [-0.15, plinthH / 2, 0] : [0, plinthH / 2, 0],
    );

    // 2. Overhanging Eaves Fascia & Roof
    if (connector.id === 'conn-bld-h-bld-i') {
      batcher.addBox('whiteTrim', [w + 0.3, 0.9, d + 0.3], [0, height + 0.45, 0]);
      batcher.addBox('roof', [w + 0.1, 0.08, d + 0.1], [0, height + 0.92, 0]);
    } else if (connector.id === 'conn-bld-d-bld-b') {
      batcher.addBox('roof', [w - 2.4, 0.08, d - 0.2], [-1.2, height + 0.04, 0]);
    } else {
      batcher.addBox(
        'plinth',
        [w + (isXLong ? 0.4 : 0.6), 0.16, d + (isXLong ? 0.6 : 0.4)],
        [0, height + 0.08, 0],
      );
      const hipRoofGeo = createConnectorHipRoofGeometry(w + 0.4, d + 0.4, roofPitchH);
      batcher.addGeometry('redRoof', hipRoofGeo, [0, height + 0.16, 0]);
      hipRoofGeo.dispose();

      batcher.addBox(
        'frame',
        isXLong
          ? [Math.max(1, w - d * 0.7), 0.08, 0.2]
          : [0.2, 0.08, Math.max(1, d - w * 0.7)],
        [0, height + 0.16 + roofPitchH + 0.04, 0],
      );
    }

    // 2b. Intermediate floor slabs
    for (let i = 1; i < storeyCount; i++) {
      const oy = -windowH / 2 + i * storeyH;
      batcher.addBox(
        'plinth',
        connector.id === 'conn-bld-g-bld-i'
          ? [w - 0.3, 0.3, d]
          : [w + (isXLong ? 0 : 0.12), 0.3, d + (isXLong ? 0.12 : 0)],
        connector.id === 'conn-bld-g-bld-i'
          ? [-0.15, plinthH + windowH / 2 + oy, 0]
          : [0, plinthH + windowH / 2 + oy, 0],
      );
    }

    // 3. Corner Structural Support Columns
    const hw = w / 2 - 0.1;
    const hd = d / 2 - 0.1;
    for (const [px, pz] of [
      [-hw, -hd],
      [-hw, hd],
      [hw, -hd],
      [hw, hd],
    ]) {
      if (connector.id === 'conn-bld-g-bld-i' && px > 0) continue;
      if (connector.id === 'conn-bld-h-bld-i' && pz > 0) continue;
      if (connector.id === 'conn-bld-d-bld-b' && px > 0) continue;
      batcher.addBox('frame', [0.2, height, 0.2], [px, height / 2, pz]);
    }

    // 4. Glazed Side Windows with Mullions
    const bays = Math.max(2, Math.round((length - 0.2) / 1.5));
    const step = (length - 0.2) / bays;
    const mullionOffsets: number[] = [];
    for (let i = 1; i < bays; i++) mullionOffsets.push(-(length - 0.2) / 2 + i * step);

    const transomOffsets: number[] = [];
    for (let i = 0; i < storeyCount; i++) transomOffsets.push(-windowH / 2 + i * storeyH + 0.85);

    if (connector.id !== 'conn-bld-d-bld-b') {
      for (const side of isXLong ? [-d / 2, d / 2] : [-w / 2, w / 2]) {
        if (connector.id === 'conn-bld-g-bld-i' && !isXLong && side > 0) continue;
        if (connector.id === 'conn-bld-h-bld-i' && isXLong && side > 0) continue;

        const sx = isXLong ? 0 : side;
        const sy = plinthH + windowH / 2;
        const sz = isXLong ? side : 0;

        batcher.addBox('glass', bar(length - 0.2, windowH, 0.05), [sx, sy, sz]);
        batcher.addBox('frame', bar(along, 0.06, 0.08), [sx, sy + windowH / 2 - 0.03, sz]);
        batcher.addBox('frame', bar(along, 0.06, 0.08), [sx, sy - windowH / 2 + 0.03, sz]);

        for (const oy of transomOffsets) {
          batcher.addBox('frame', bar(along, 0.05, 0.06), [sx, sy + oy, sz]);
        }
        for (const m of mullionOffsets) {
          batcher.addBox(
            'frame',
            [0.08, windowH, 0.08],
            isXLong ? [sx + m, sy, sz] : [sx, sy, sz + m],
          );
        }
      }
    } else {
      // West Facade of conn-bld-d-bld-b
      const sy = plinthH + windowH / 2;
      batcher.addBox('glass', [0.05, windowH, d - 0.2], [-w / 2, sy, 0]);
      batcher.addBox('frame', [0.08, 0.06, d], [-w / 2, sy + windowH / 2 - 0.03, 0]);
      batcher.addBox('frame', [0.08, 0.06, d], [-w / 2, sy - windowH / 2 + 0.03, 0]);
    }

    // 5. Two-storey Mezzanine Lounge Gallery for Connector A <-> C
    if (connector.id === 'conn-bld-h-bld-i') {
      const ly = height / 2;
      for (const czOffset of [-8, -4, 0, 4, 8]) {
        batcher.addBox('woodColumn', [0.3, 3.6, 0.3], [w / 2 - 0.4, ly + 1.8, czOffset]);
      }
      batcher.addBox('glass', [0.04, 1.1, d - 1.0], [w / 2 - 0.4, ly + 0.55, 0]);
      batcher.addBox('handrailSteel', [0.08, 0.06, d - 1.0], [w / 2 - 0.4, ly + 1.1, 0]);

      const chairKeys = ['chairYellow', 'chairGreen', 'chairBurgundy'] as const;
      [-7, -3.5, 0, 3.5, 7].forEach((tz, tIdx) => {
        const cKey = chairKeys[tIdx % 3];
        batcher.addBox('marbleTable', [1.6, 0.04, 0.9], [-1.2, ly + 0.74, tz]);
        batcher.addCylinder('frame', [0.04, 0.04, 0.74, 8], [-1.2, ly + 0.37, tz]);
        batcher.addBox('frame', [0.6, 0.04, 0.6], [-1.2, ly + 0.02, tz]);

        for (const cxOffset of [-0.55, 0.55]) {
          batcher.addBox(cKey, [0.42, 0.06, 0.4], [-1.2 + cxOffset, ly + 0.44, tz - 0.65]);
          batcher.addBox(cKey, [0.4, 0.36, 0.06], [-1.2 + cxOffset, ly + 0.72, tz - 0.82], [0.1, 0, 0]);
          batcher.addBox(cKey, [0.42, 0.06, 0.4], [-1.2 + cxOffset, ly + 0.44, tz + 0.65]);
          batcher.addBox(cKey, [0.4, 0.36, 0.06], [-1.2 + cxOffset, ly + 0.72, tz + 0.82], [-0.1, 0, 0]);
        }
      });
    }

    return batcher.buildAll();
  }, [connector.id, w, d, height, plinthH, windowH, isXLong, length]);

  useEffect(() => {
    return () => {
      disposeMergedMap(merged);
      Object.values(materials).forEach((m) => m.dispose());
    };
  }, [merged, materials]);

  return (
    <group position={[cx, connector.elevation, cz]}>
      {merged.plinth && (
        <mesh geometry={merged.plinth} material={materials.plinth} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.whiteTrim && (
        <mesh geometry={merged.whiteTrim} material={materials.whiteTrim} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.roof && (
        <mesh geometry={merged.roof} material={materials.roof} raycast={NO_RAYCAST} />
      )}
      {merged.redRoof && (
        <mesh geometry={merged.redRoof} material={materials.redRoof} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.frame && (
        <mesh geometry={merged.frame} material={materials.frame} castShadow raycast={NO_RAYCAST} />
      )}
      {merged.glass && (
        <mesh geometry={merged.glass} material={materials.glass} raycast={NO_RAYCAST} />
      )}
      {merged.woodColumn && (
        <mesh geometry={merged.woodColumn} material={materials.woodColumn} raycast={NO_RAYCAST} />
      )}
      {merged.handrailSteel && (
        <mesh geometry={merged.handrailSteel} material={materials.handrailSteel} raycast={NO_RAYCAST} />
      )}
      {merged.marbleTable && (
        <mesh geometry={merged.marbleTable} material={materials.marbleTable} castShadow raycast={NO_RAYCAST} />
      )}
      {merged.chairYellow && (
        <mesh geometry={merged.chairYellow} material={materials.chairYellow} castShadow raycast={NO_RAYCAST} />
      )}
      {merged.chairGreen && (
        <mesh geometry={merged.chairGreen} material={materials.chairGreen} castShadow raycast={NO_RAYCAST} />
      )}
      {merged.chairBurgundy && (
        <mesh geometry={merged.chairBurgundy} material={materials.chairBurgundy} castShadow raycast={NO_RAYCAST} />
      )}

      {/* Daewoo Hall Facades */}
      {connector.id === 'conn-bld-g-bld-i' && !isXLong && (
        <DaewooHallFacade
          width={length}
          position={[w / 2 + 0.25, 0, 0]}
          rotationY={Math.PI / 2}
          opacity={dimmed ? 0.35 : 1}
          transparent={dimmed}
          includeTrees={false}
        />
      )}
      {connector.id === 'conn-bld-h-bld-i' && isXLong && (
        <DaewooHallFacade
          width={length}
          position={[0, 0, d / 2 + 0.25]}
          rotationY={0}
          opacity={dimmed ? 0.35 : 1}
          transparent={dimmed}
          includeTrees={false}
        />
      )}

      {/* Suwon Hall Facade */}
      {connector.id === 'conn-bld-d-bld-b' && (
        <SuwonHallFacade
          width={d}
          position={[w / 2 + 0.15, 0, 0]}
          rotationY={Math.PI / 2}
          opacity={dimmed ? 0.35 : 1}
          transparent={dimmed}
        />
      )}
    </group>
  );
}

