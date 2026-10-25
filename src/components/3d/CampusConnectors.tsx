import { useMemo } from 'react';
import * as THREE from 'three';
import { mapConfig } from '../../config/mapConfig';
import type { ConnectorGeometry } from '../../domain/geometry/types';
import { DaewooHallFacade } from './facades/DaewooHallFacade';

const FLOOR_HEIGHT = mapConfig.building.floorHeight;

type Props = {
  connectors?: ConnectorGeometry[];
  selectedBuildingId?: string;
};

/**
 * 3D architectural rendering for glazed inter-building connectors (ADR-020).
 * Features panoramic glass windows on both exterior sides, dark aluminum mullions,
 * structural corner columns, plinth base, and overhanging roof canopy.
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
  const height = connector.height || 3.0;
  const plinthH = 0.3;
  const roofH = 0.24;
  const windowH = height - plinthH - roofH;

  // Detect orientation: isXLong means passage runs East-West (windows on North & South).
  // Otherwise passage runs North-South (windows on West & East).
  const isXLong = w >= d;

  // Materials
  const glassMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.12,
        metalness: 0.75,
        transparent: true,
        opacity: dimmed ? 0.25 : 0.7,
        depthWrite: false,
      }),
    [dimmed]
  );

  const frameMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.6,
        metalness: 0.4,
        transparent: dimmed,
        opacity: dimmed ? 0.35 : 1,
      }),
    [dimmed]
  );

  const plinthMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#334155',
        roughness: 0.85,
        transparent: dimmed,
        opacity: dimmed ? 0.35 : 1,
      }),
    [dimmed]
  );

  const roofMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#475569',
        roughness: 0.7,
        metalness: 0.2,
        transparent: dimmed,
        opacity: dimmed ? 0.35 : 1,
      }),
    [dimmed]
  );

  const cornerPosts = useMemo(() => {
    const hw = w / 2 - 0.1;
    const hd = d / 2 - 0.1;
    return [
      [-hw, -hd],
      [-hw, hd],
      [hw, -hd],
      [hw, hd],
    ];
  }, [w, d]);

  // Storeys: derived from the volume height (floorCount × FLOOR_HEIGHT, ADR-029).
  const storeyCount = Math.max(1, Math.round(height / FLOOR_HEIGHT));
  const storeyH = windowH / storeyCount;
  const length = isXLong ? w : d;

  // Vertical mullions roughly every 1.5m along the passage length.
  const mullionOffsets = useMemo(() => {
    const bays = Math.max(2, Math.round((length - 0.2) / 1.5));
    const step = (length - 0.2) / bays;
    const offsets: number[] = [];
    for (let i = 1; i < bays; i++) offsets.push(-(length - 0.2) / 2 + i * step);
    return offsets;
  }, [length]);

  // Local Y (relative to window centre) of each intermediate floor slab band.
  const slabOffsets = useMemo(() => {
    const offsets: number[] = [];
    for (let i = 1; i < storeyCount; i++) offsets.push(-windowH / 2 + i * storeyH);
    return offsets;
  }, [storeyCount, storeyH, windowH]);

  // Handrail transom 0.85m above each storey floor.
  const transomOffsets = useMemo(() => {
    const offsets: number[] = [];
    for (let i = 0; i < storeyCount; i++) offsets.push(-windowH / 2 + i * storeyH + 0.85);
    return offsets;
  }, [storeyCount, storeyH, windowH]);

  // Pane / bar dimensions oriented along the passage side.
  const along = length - 0.15;
  const bar = (thickAlong: number, h: number, thickAcross: number): [number, number, number] =>
    isXLong ? [thickAlong, h, thickAcross] : [thickAcross, h, thickAlong];

  return (
    <group position={[cx, connector.elevation, cz]}>
      {/* 1. Floor Base Plinth */}
      <mesh
        position={
          connector.id === 'conn-bld-g-bld-i'
            ? [-0.15, plinthH / 2, 0]
            : [0, plinthH / 2, 0]
        }
        material={plinthMat}
        receiveShadow
      >
        <boxGeometry
          args={
            connector.id === 'conn-bld-g-bld-i'
              ? [w - 0.3, plinthH, d]
              : [w, plinthH, d]
          }
        />
      </mesh>

      {/* 2. Roof Canopy with slight architectural trim */}
      <mesh
        position={
          connector.id === 'conn-bld-g-bld-i'
            ? [-0.15, height - roofH / 2, 0]
            : [0, height - roofH / 2, 0]
        }
        material={roofMat}
        castShadow
        receiveShadow
      >
        <boxGeometry
          args={
            connector.id === 'conn-bld-g-bld-i'
              ? [w - 0.3, roofH, d]
              : [
                  w + (isXLong ? 0 : 0.3),
                  roofH,
                  d + (isXLong ? 0.3 : 0),
                ]
          }
        />
      </mesh>

      {/* 2b. Intermediate floor slabs for multi-storey passages (visible as opaque bands) */}
      {slabOffsets.map((oy) => (
        <mesh
          key={`slab-${oy}`}
          position={
            connector.id === 'conn-bld-g-bld-i'
              ? [-0.15, plinthH + windowH / 2 + oy, 0]
              : [0, plinthH + windowH / 2 + oy, 0]
          }
          material={plinthMat}
          castShadow
          receiveShadow
        >
          <boxGeometry
            args={
              connector.id === 'conn-bld-g-bld-i'
                ? [w - 0.3, 0.3, d]
                : [w + (isXLong ? 0 : 0.12), 0.3, d + (isXLong ? 0.12 : 0)]
            }
          />
        </mesh>
      ))}

      {/* 3. Corner Structural Support Columns */}
      {cornerPosts.map(([px, pz], idx) => {
        // Exclude outer east corner columns for conn-bld-g-bld-i as DaewooHallFacade has its own structural framing
        if (connector.id === 'conn-bld-g-bld-i' && px > 0) return null;
        return (
          <mesh
            key={`col-${idx}`}
            position={[px, height / 2, pz]}
            material={frameMat}
            castShadow
          >
            <boxGeometry args={[0.2, height, 0.2]} />
          </mesh>
        );
      })}

      {/* 4. Glazed Side Windows with Mullions (по бокам окна, а не сплошные стены) */}
      {(isXLong ? [-d / 2, d / 2] : [-w / 2, w / 2]).map((side, sIdx) => {
        // Outer (eastern) facade of connector facing outward (away from amphitheater) is DAEWOO HALL
        if (connector.id === 'conn-bld-g-bld-i' && !isXLong && side > 0) {
          return (
            <DaewooHallFacade
              key={`daewoo-hall-${sIdx}`}
              width={length}
              position={[side + 0.25, 0, 0]}
              rotationY={Math.PI / 2}
              opacity={dimmed ? 0.35 : 1}
              transparent={dimmed}
            />
          );
        }

        return (
          <group
            key={`side-${sIdx}`}
            position={isXLong ? [0, plinthH + windowH / 2, side] : [side, plinthH + windowH / 2, 0]}
          >
          {/* Continuous Architectural Glazing Pane */}
          <mesh material={glassMat}>
            <boxGeometry args={bar(length - 0.2, windowH, 0.05)} />
          </mesh>
          {/* Top & Bottom Window Framing */}
          <mesh position={[0, windowH / 2 - 0.03, 0]} material={frameMat}>
            <boxGeometry args={bar(along, 0.06, 0.08)} />
          </mesh>
          <mesh position={[0, -windowH / 2 + 0.03, 0]} material={frameMat}>
            <boxGeometry args={bar(along, 0.06, 0.08)} />
          </mesh>
          {/* Mid-height Transom Bars (Handrail level of every storey) */}
          {transomOffsets.map((oy) => (
            <mesh key={`tr-${oy}`} position={[0, oy, 0]} material={frameMat}>
              <boxGeometry args={bar(along, 0.05, 0.06)} />
            </mesh>
          ))}
          {/* Vertical Mullion Posts (every ~1.5m along the passage) */}
          {mullionOffsets.map((m) => (
            <mesh key={`mull-${m}`} position={isXLong ? [m, 0, 0] : [0, 0, m]} material={frameMat} castShadow>
              <boxGeometry args={[0.08, windowH, 0.08]} />
            </mesh>
          ))}
        </group>
        );
      })}
    </group>
  );
}
