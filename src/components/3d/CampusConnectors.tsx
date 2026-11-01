import { useMemo } from 'react';
import * as THREE from 'three';
import { mapConfig } from '../../config/mapConfig';
import type { ConnectorGeometry } from '../../domain/geometry/types';
import { DaewooHallFacade } from './facades/DaewooHallFacade';
import { SuwonHallFacade } from './facades/SuwonHallFacade';

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
  const height = connector.id === 'conn-bld-d-bld-b' ? 4.95 : (connector.height || 3.0);
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

  const redRoofMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#991b1b', // Terracotta red pitched roof matching university buildings (image-1.png, Item 3)
        roughness: 0.65,
        metalness: 0.08,
        transparent: dimmed,
        opacity: dimmed ? 0.35 : 1,
      }),
    [dimmed]
  );

  const whiteTrimMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#f1f5f9', // Clean white composite frieze panels per blueprint media_1793539586758.jpg
        roughness: 0.85,
        metalness: 0.05,
        transparent: dimmed,
        opacity: dimmed ? 0.35 : 1,
      }),
    [dimmed]
  );

  const roofPitchH = 2.2;
  const hipRoofGeo = useMemo(() => {
    return createConnectorHipRoofGeometry(w + 0.4, d + 0.4, roofPitchH);
  }, [w, d, roofPitchH]);

  const loungeMaterials = useMemo(() => {
    const woodColumnMat = new THREE.MeshStandardMaterial({
      color: '#422006', // Polished dark timber columns
      roughness: 0.45,
    });
    const marbleTableMat = new THREE.MeshStandardMaterial({
      color: '#0f172a', // Black marble top
      roughness: 0.2,
      metalness: 0.3,
    });
    const chairYellowMat = new THREE.MeshStandardMaterial({
      color: '#eab308', // Yellow velvet armchair
      roughness: 0.7,
    });
    const chairGreenMat = new THREE.MeshStandardMaterial({
      color: '#047857', // Emerald green velvet armchair
      roughness: 0.7,
    });
    const chairBurgundyMat = new THREE.MeshStandardMaterial({
      color: '#831843', // Burgundy velvet armchair
      roughness: 0.7,
    });
    const handrailSteelMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1', // Stainless steel railing
      roughness: 0.25,
      metalness: 0.85,
    });
    return {
      woodColumnMat,
      marbleTableMat,
      chairYellowMat,
      chairGreenMat,
      chairBurgundyMat,
      handrailSteelMat,
    };
  }, []);

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

      {/* 2. Overhanging Eaves Fascia & Roof */}
      {connector.id === 'conn-bld-h-bld-i' ? (
        <group position={[0, height, 0]}>
          {/* White Composite Fascia Board per blueprint */}
          <mesh position={[0, 0.45, 0]} material={whiteTrimMat} castShadow receiveShadow>
            <boxGeometry args={[w + 0.3, 0.9, d + 0.3]} />
          </mesh>
          {/* Flat roof deck */}
          <mesh position={[0, 0.92, 0]} material={roofMat}>
            <boxGeometry args={[w + 0.1, 0.08, d + 0.1]} />
          </mesh>
        </group>
      ) : connector.id === 'conn-bld-d-bld-b' ? (
        <group position={[0, height, 0]}>
          {/* Recessed Flat Roof Deck behind SuwonHallFacade (prevents fascia clipping through 3D letters) */}
          <mesh position={[-1.2, 0.04, 0]} material={roofMat}>
            <boxGeometry args={[w - 2.4, 0.08, d - 0.2]} />
          </mesh>
        </group>
      ) : (
        <group position={[0, height, 0]}>
          {/* Fascia Overhang Board */}
          <mesh position={[0, 0.08, 0]} material={plinthMat} receiveShadow>
            <boxGeometry args={[w + (isXLong ? 0.4 : 0.6), 0.16, d + (isXLong ? 0.6 : 0.4)]} />
          </mesh>
          {/* Red Pitched Hip Roof */}
          <mesh position={[0, 0.16, 0]} geometry={hipRoofGeo} material={redRoofMat} castShadow receiveShadow />
          {/* Central Ridge Cap */}
          <mesh position={[0, 0.16 + roofPitchH + 0.04, 0]} material={frameMat}>
            <boxGeometry
              args={
                isXLong
                  ? [Math.max(1, w - d * 0.7), 0.08, 0.2]
                  : [0.2, 0.08, Math.max(1, d - w * 0.7)]
              }
            />
          </mesh>
        </group>
      )}

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
        // Exclude outer east corner columns for conn-bld-g-bld-i, south columns for conn-bld-h-bld-i, and east columns for conn-bld-d-bld-b
        if (connector.id === 'conn-bld-g-bld-i' && px > 0) return null;
        if (connector.id === 'conn-bld-h-bld-i' && pz > 0) return null;
        if (connector.id === 'conn-bld-d-bld-b' && px > 0) return null;
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
        // Outer (eastern) facade of connector B->C facing outward (away from amphitheater) is DAEWOO HALL
        if (connector.id === 'conn-bld-g-bld-i' && !isXLong && side > 0) {
          return (
            <DaewooHallFacade
              key={`daewoo-hall-${sIdx}`}
              width={length}
              position={[side + 0.25, 0, 0]}
              rotationY={Math.PI / 2}
              opacity={dimmed ? 0.35 : 1}
              transparent={dimmed}
              includeTrees={false}
            />
          );
        }

        // Outer (southern) facade of connector A->C facing fence is DAEWOO HALL per blueprint
        if (connector.id === 'conn-bld-h-bld-i' && isXLong && side > 0) {
          return (
            <DaewooHallFacade
              key={`daewoo-hall-a-c-${sIdx}`}
              width={length}
              position={[0, 0, side + 0.25]}
              rotationY={0}
              opacity={dimmed ? 0.35 : 1}
              transparent={dimmed}
              includeTrees={false}
            />
          );
        }

        // Connector F->E (conn-bld-d-bld-b) abuts Block E (North) and Block F (South)
        if (connector.id === 'conn-bld-d-bld-b') {
          return null;
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

      {/* 4b. Dedicated SUWON HALL Entrance Group Facade for connector F <-> E (facing East towards fence per CAD blueprint media_1793540540292.png) */}
      {connector.id === 'conn-bld-d-bld-b' && (
        <group>
          {/* East Facade: SUWON HALL facing fence */}
          <SuwonHallFacade
            width={d}
            position={[w / 2 + 0.15, 0, 0]}
            rotationY={Math.PI / 2}
            opacity={dimmed ? 0.35 : 1}
            transparent={dimmed}
          />
          {/* West Facade: Glazed window looking into inner courtyard */}
          <group position={[-w / 2, plinthH + windowH / 2, 0]}>
            <mesh material={glassMat}>
              <boxGeometry args={[0.05, windowH, d - 0.2]} />
            </mesh>
            <mesh position={[0, windowH / 2 - 0.03, 0]} material={frameMat}>
              <boxGeometry args={[0.08, 0.06, d]} />
            </mesh>
            <mesh position={[0, -windowH / 2 + 0.03, 0]} material={frameMat}>
              <boxGeometry args={[0.08, 0.06, d]} />
            </mesh>
          </group>
        </group>
      )}

      {/* 5. Two-storey Mezzanine Lounge Gallery for Connector A <-> C (Item 3, photos 17-17-47, 54, 57) */}
      {connector.id === 'conn-bld-h-bld-i' && (
        <group position={[0, height / 2, 0]}>
          {/* Wood Balustrade Columns along East edge overlooking amphitheater */}
          {[-8, -4, 0, 4, 8].map((czOffset, idx) => (
            <mesh key={`lounge-col-${idx}`} position={[w / 2 - 0.4, 1.8, czOffset]} material={loungeMaterials.woodColumnMat}>
              <boxGeometry args={[0.3, 3.6, 0.3]} />
            </mesh>
          ))}

          {/* Stainless Steel and Glass Railing along East Mezzanine Open Edge */}
          <mesh position={[w / 2 - 0.4, 0.55, 0]} material={glassMat}>
            <boxGeometry args={[0.04, 1.1, d - 1.0]} />
          </mesh>
          <mesh position={[w / 2 - 0.4, 1.1, 0]} material={loungeMaterials.handrailSteelMat}>
            <boxGeometry args={[0.08, 0.06, d - 1.0]} />
          </mesh>

          {/* Study / Cafe Lounge Tables and Velvet Armchairs (photos 17-17-47, 54, 57) */}
          {[-7, -3.5, 0, 3.5, 7].map((tz, tIdx) => {
            const chairColors = [
              loungeMaterials.chairYellowMat,
              loungeMaterials.chairGreenMat,
              loungeMaterials.chairBurgundyMat,
            ];
            const cMat = chairColors[tIdx % 3];
            return (
              <group key={`lounge-table-${tz}`} position={[-1.2, 0, tz]}>
                {/* Black Marble Table Top */}
                <mesh position={[0, 0.74, 0]} material={loungeMaterials.marbleTableMat} castShadow>
                  <boxGeometry args={[1.6, 0.04, 0.9]} />
                </mesh>
                {/* Slender Metal Table Legs */}
                <mesh position={[0, 0.37, 0]} material={frameMat}>
                  <cylinderGeometry args={[0.04, 0.04, 0.74, 8]} />
                </mesh>
                <mesh position={[0, 0.02, 0]} material={frameMat}>
                  <boxGeometry args={[0.6, 0.04, 0.6]} />
                </mesh>

                {/* 4 Colored Velvet Armchairs around table */}
                {[-0.55, 0.55].map((cxOffset, chIdx) => (
                  <group key={`chair-pair-${chIdx}`} position={[cxOffset, 0, 0]}>
                    {/* North Chair */}
                    <mesh position={[0, 0.44, -0.65]} material={cMat} castShadow>
                      <boxGeometry args={[0.42, 0.06, 0.4]} />
                    </mesh>
                    <mesh position={[0, 0.72, -0.82]} rotation={[0.1, 0, 0]} material={cMat}>
                      <boxGeometry args={[0.4, 0.36, 0.06]} />
                    </mesh>
                    {/* South Chair */}
                    <mesh position={[0, 0.44, 0.65]} material={cMat} castShadow>
                      <boxGeometry args={[0.42, 0.06, 0.4]} />
                    </mesh>
                    <mesh position={[0, 0.72, 0.82]} rotation={[-0.1, 0, 0]} material={cMat}>
                      <boxGeometry args={[0.4, 0.36, 0.06]} />
                    </mesh>
                  </group>
                ))}
              </group>
            );
          })}
        </group>
      )}
    </group>
  );
}
