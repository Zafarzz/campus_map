import { useMemo } from 'react';
import * as THREE from 'three';
import type { ConnectorGeometry } from '../../domain/geometry/types';

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
        color: '#7fa6c2',
        roughness: 0.1,
        metalness: 0.35,
        transparent: true,
        opacity: dimmed ? 0.25 : 0.6,
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

  return (
    <group position={[cx, connector.elevation, cz]}>
      {/* 1. Floor Base Plinth */}
      <mesh position={[0, plinthH / 2, 0]} material={plinthMat} receiveShadow>
        <boxGeometry args={[w, plinthH, d]} />
      </mesh>

      {/* 2. Roof Canopy with slight architectural trim */}
      <mesh
        position={[0, height - roofH / 2, 0]}
        material={roofMat}
        castShadow
        receiveShadow
      >
        <boxGeometry
          args={[
            w + (isXLong ? 0 : 0.3),
            roofH,
            d + (isXLong ? 0.3 : 0),
          ]}
        />
      </mesh>

      {/* 3. Corner Structural Support Columns */}
      {cornerPosts.map(([px, pz], idx) => (
        <mesh
          key={`col-${idx}`}
          position={[px, height / 2, pz]}
          material={frameMat}
          castShadow
        >
          <boxGeometry args={[0.2, height, 0.2]} />
        </mesh>
      ))}

      {/* 4. Glazed Side Windows with Mullions (по бокам окна, а не сплошные стены) */}
      {isXLong ? (
        // East-West passage: side windows on North (Z = -d/2) and South (Z = +d/2)
        [-d / 2, d / 2].map((sideZ, sIdx) => (
          <group key={`side-z-${sIdx}`} position={[0, plinthH + windowH / 2, sideZ]}>
            {/* Continuous Architectural Glazing Pane */}
            <mesh material={glassMat}>
              <boxGeometry args={[w - 0.2, windowH, 0.05]} />
            </mesh>
            {/* Top & Bottom Window Framing */}
            <mesh position={[0, windowH / 2 - 0.03, 0]} material={frameMat}>
              <boxGeometry args={[w - 0.15, 0.06, 0.08]} />
            </mesh>
            <mesh position={[0, -windowH / 2 + 0.03, 0]} material={frameMat}>
              <boxGeometry args={[w - 0.15, 0.06, 0.08]} />
            </mesh>
            {/* Mid-height Transom Bar (Handrail level) */}
            <mesh position={[0, -windowH / 2 + 0.85, 0]} material={frameMat}>
              <boxGeometry args={[w - 0.15, 0.05, 0.06]} />
            </mesh>
            {/* Vertical Mullion Posts (every 1.5m across the 6m length) */}
            {[-1.5, 0, 1.5].map((mx) => (
              <mesh key={`mull-x-${mx}`} position={[mx, 0, 0]} material={frameMat} castShadow>
                <boxGeometry args={[0.08, windowH, 0.08]} />
              </mesh>
            ))}
          </group>
        ))
      ) : (
        // North-South passage: side windows on West (X = -w/2) and East (X = +w/2)
        [-w / 2, w / 2].map((sideX, sIdx) => (
          <group key={`side-x-${sIdx}`} position={[sideX, plinthH + windowH / 2, 0]}>
            {/* Continuous Architectural Glazing Pane */}
            <mesh material={glassMat}>
              <boxGeometry args={[0.05, windowH, d - 0.2]} />
            </mesh>
            {/* Top & Bottom Window Framing */}
            <mesh position={[0, windowH / 2 - 0.03, 0]} material={frameMat}>
              <boxGeometry args={[0.08, 0.06, d - 0.15]} />
            </mesh>
            <mesh position={[0, -windowH / 2 + 0.03, 0]} material={frameMat}>
              <boxGeometry args={[0.08, 0.06, d - 0.15]} />
            </mesh>
            {/* Mid-height Transom Bar (Handrail level) */}
            <mesh position={[0, -windowH / 2 + 0.85, 0]} material={frameMat}>
              <boxGeometry args={[0.06, 0.05, d - 0.15]} />
            </mesh>
            {/* Vertical Mullion Posts (every 1.5m across the 6m length) */}
            {[-1.5, 0, 1.5].map((mz) => (
              <mesh key={`mull-z-${mz}`} position={[0, 0, mz]} material={frameMat} castShadow>
                <boxGeometry args={[0.08, windowH, 0.08]} />
              </mesh>
            ))}
          </group>
        ))
      )}
    </group>
  );
}
