import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mapConfig } from '../../config/mapConfig';
import type { ConnectorGeometry } from '../../domain/geometry/types';
import { DaewooHallFacade } from './facades/DaewooHallFacade';
import { SuwonHallFacade } from './facades/SuwonHallFacade';
import { getDarkMarbleTextures, getRoofTileTextures } from './materials/pbrMaterials';
import {
  disposeMergedMap,
  NO_RAYCAST,
  StaticGeometryBatcher,
} from './geometry/staticGeometryMerger';

const FLOOR_HEIGHT = mapConfig.building.floorHeight;

/**
 * Creates 4-pitched hip roof geometry for connectors matching building roofs (image-1.png).
 * Correct outward CCW normals for both isX and !isX with UV coordinates.
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
  const ridgeLen = isX ? Math.max(0.6, width - depth * 0.6) : Math.max(0.6, depth - width * 0.6);
  const hr = ridgeLen / 2;

  let positions: number[];
  let uvs: number[];

  if (isX) {
    // Ridge runs along X: from (-hr, height, 0) to (hr, height, 0)
    // CCW viewed from exterior:
    positions = [
      // South face (+Z)
      -hw, 0, hd,   hw, 0, hd,   hr, height, 0,
      -hw, 0, hd,   hr, height, 0,  -hr, height, 0,
      // North face (-Z)
      hw, 0, -hd,  -hw, 0, -hd,  -hr, height, 0,
      hw, 0, -hd,  -hr, height, 0,   hr, height, 0,
      // West hip (-X)
      -hw, 0, -hd,  -hw, 0, hd,  -hr, height, 0,
      // East hip (+X)
      hw, 0, hd,   hw, 0, -hd,   hr, height, 0,
    ];
    uvs = [
      0, 0,  width, 0,  width / 2 + hr, height,
      0, 0,  width / 2 + hr, height,  width / 2 - hr, height,
      0, 0,  width, 0,  width / 2 - hr, height,
      0, 0,  width / 2 - hr, height,  width / 2 + hr, height,
      0, 0,  depth, 0,  depth / 2, height,
      0, 0,  depth, 0,  depth / 2, height,
    ];
  } else {
    // Ridge runs along Z: from (0, height, -hr) to (0, height, hr)
    // CCW viewed from exterior:
    positions = [
      // East face (+X): normal points +X, +Y
      hw, 0, hd,   hw, 0, -hd,  0, height, -hr,
      hw, 0, hd,   0, height, -hr,  0, height, hr,
      // West face (-X): normal points -X, +Y
      -hw, 0, -hd,  -hw, 0, hd,  0, height, hr,
      -hw, 0, -hd,  0, height, hr,  0, height, -hr,
      // North hip (-Z): normal points -Z, +Y
      hw, 0, -hd,  -hw, 0, -hd,  0, height, -hr,
      // South hip (+Z): normal points +Z, +Y
      -hw, 0, hd,   hw, 0, hd,   0, height, hr,
    ];
    uvs = [
      0, 0,  depth, 0,  depth / 2 - hr, height,
      0, 0,  depth / 2 - hr, height,  depth / 2 + hr, height,
      0, 0,  depth, 0,  depth / 2 + hr, height,
      0, 0,  depth / 2 + hr, height,  depth / 2 - hr, height,
      0, 0,  width, 0,  width / 2, height,
      0, 0,  width, 0,  width / 2, height,
    ];
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  return geom;
}

type Props = {
  connectors?: ConnectorGeometry[];
  selectedBuildingId?: string;
  selectedRoomId?: string;
  onSelectConnector?: (connectorId: string) => void;
  onSelectRoom?: (roomId: string) => void;
};

/**
 * 3D architectural rendering for glazed inter-building connectors (ADR-020).
 */
export function CampusConnectors({
  connectors,
  selectedBuildingId,
  selectedRoomId,
  onSelectConnector,
  onSelectRoom,
}: Props) {
  if (!connectors || connectors.length === 0) return null;

  return (
    <group name="campus-connectors">
      {connectors.map((c) => {
        const isConnected = selectedBuildingId
          ? c.buildingIds.includes(selectedBuildingId) ||
            ((c.id === 'conn-bld-h-bld-i' || c.id === 'conn-bld-g-bld-i') && selectedBuildingId === 'amph-hall') ||
            selectedBuildingId === c.id
          : false;
        const dimmed = selectedBuildingId ? !isConnected : false;
        const isSelectedRoom =
          (selectedRoomId === 'room-open-study-bc' && c.id === 'conn-bld-g-bld-i') ||
          (selectedRoomId === 'room-open-study-ac' && c.id === 'conn-bld-h-bld-i') ||
          (selectedRoomId === 'room-admin-office' && c.id === 'conn-bld-h-bld-i');

        const hideRoof =
          isConnected ||
          isSelectedRoom ||
          (selectedBuildingId === 'bld-i' && (c.id === 'conn-bld-h-bld-i' || c.id === 'conn-bld-g-bld-i')) ||
          (selectedBuildingId === 'amph-hall' && (c.id === 'conn-bld-h-bld-i' || c.id === 'conn-bld-g-bld-i'));

        return (
          <GlazedConnectorMesh
            key={c.id}
            connector={c}
            dimmed={dimmed}
            hideRoof={hideRoof}
            isSelectedRoom={isSelectedRoom}
            onSelect={() => {
              if (c.id === 'conn-bld-g-bld-i') {
                onSelectRoom ? onSelectRoom('room-open-study-bc') : onSelectConnector?.(c.id);
              } else if (c.id === 'conn-bld-h-bld-i') {
                onSelectRoom ? onSelectRoom('room-open-study-ac') : onSelectConnector?.(c.id);
              } else {
                onSelectConnector?.(c.id);
              }
            }}
          />
        );
      })}
    </group>
  );
}

/**
 * Builds reference designer chair (Sheet 1: 500x500x800mm, seat 450mm, back 105° tilt, splayed steel legs with glides).
 */
function addReferenceChair(
  batcher: StaticGeometryBatcher,
  cx: number,
  cy: number,
  cz: number,
  facingAngle = 0,
  matKey = 'chairTextile',
) {
  const cos = Math.cos(facingAngle);
  const sin = Math.sin(facingAngle);
  const rotatePoint = (lx: number, lz: number): [number, number] => [
    cx + lx * cos - lz * sin,
    cz + lx * sin + lz * cos,
  ];

  // 1. Upholstered seat cushion (500mm x 500mm, seat height 450mm)
  batcher.addBox(matKey, [0.48, 0.05, 0.46], [cx, cy + 0.435, cz], [0, facingAngle, 0]);

  // 2. Under-seat steel tubular frame
  batcher.addBox('metalLegs', [0.42, 0.025, 0.4], [cx, cy + 0.405, cz], [0, facingAngle, 0]);

  // 3. Ergonomic curved backrest (inclination 105° -> 15° tilt back)
  const [backX, backZ] = rotatePoint(0, -0.18);
  batcher.addBox(
    matKey,
    [0.48, 0.20, 0.06],
    [backX, cy + 0.70, backZ],
    [-0.26, facingAngle, 0],
  );

  // 4. Backrest tubular steel support uprights
  for (const lx of [-0.16, 0.16]) {
    const [supX, supZ] = rotatePoint(lx, -0.15);
    batcher.addCylinder('metalLegs', [0.012, 0.012, 0.28, 8], [supX, cy + 0.54, supZ], [-0.22, facingAngle, 0]);
  }

  // 5. Four splayed steel legs with glides (Kt = 75°-80° splay outward)
  const legOffsets = [
    { tx: -0.18, tz: -0.16, bx: -0.23, bz: -0.22 },
    { tx: 0.18, tz: -0.16, bx: 0.23, bz: -0.22 },
    { tx: -0.18, tz: 0.16, bx: -0.23, bz: 0.22 },
    { tx: 0.18, tz: 0.16, bx: 0.23, bz: 0.22 },
  ];

  for (const leg of legOffsets) {
    const [topX, topZ] = rotatePoint(leg.tx, leg.tz);
    const [botX, botZ] = rotatePoint(leg.bx, leg.bz);
    const midX = (topX + botX) / 2;
    const midZ = (topZ + botZ) / 2;
    batcher.addCylinder('metalLegs', [0.014, 0.011, 0.42, 8], [midX, cy + 0.21, midZ]);
    batcher.addCylinder('metalLegs', [0.025, 0.025, 0.014, 8], [botX, cy + 0.007, botZ]);
  }
}

/**
 * Builds reference marble rectangular table (Sheet 1: 1400x800x750mm, splayed steel legs with glides).
 */
function addReferenceMarbleTable(
  batcher: StaticGeometryBatcher,
  cx: number,
  cy: number,
  cz: number,
  facingAngle = 0,
) {
  const cos = Math.cos(facingAngle);
  const sin = Math.sin(facingAngle);
  const rotatePoint = (lx: number, lz: number): [number, number] => [
    cx + lx * cos - lz * sin,
    cz + lx * sin + lz * cos,
  ];

  // 1. Tabletop: MDF with marble imitation (1400mm x 800mm, height 750mm)
  batcher.addBox('marbleTable', [1.4, 0.038, 0.8], [cx, cy + 0.75 - 0.019, cz], [0, facingAngle, 0]);

  // 2. Steel underframe (1240mm x 640mm)
  batcher.addBox('metalLegs', [1.24, 0.035, 0.64], [cx, cy + 0.70, cz], [0, facingAngle, 0]);

  // 3. Four angled splayed steel legs with glides (Kt = ~80° angle from horizontal)
  const legOffsets = [
    { tx: -0.56, tz: -0.28, bx: -0.65, bz: -0.37 },
    { tx: 0.56, tz: -0.28, bx: 0.65, bz: -0.37 },
    { tx: -0.56, tz: 0.28, bx: -0.65, bz: 0.37 },
    { tx: 0.56, tz: 0.28, bx: 0.65, bz: 0.37 },
  ];

  for (const leg of legOffsets) {
    const [topX, topZ] = rotatePoint(leg.tx, leg.tz);
    const [botX, botZ] = rotatePoint(leg.bx, leg.bz);
    const midX = (topX + botX) / 2;
    const midZ = (topZ + botZ) / 2;
    batcher.addCylinder('metalLegs', [0.02, 0.015, 0.70, 8], [midX, cy + 0.35, midZ]);
    batcher.addCylinder('metalLegs', [0.035, 0.035, 0.016, 8], [botX, cy + 0.008, botZ]);
  }
}

/**
 * Builds reference round marble table (Sheet 2: "Столы круглые" Ø950mm x 750mm, splayed steel legs with glides).
 */
function addReferenceRoundTable(
  batcher: StaticGeometryBatcher,
  cx: number,
  cy: number,
  cz: number,
) {
  // 1. Circular dark marble tabletop (Ø950mm x 35mm, height 750mm)
  batcher.addCylinder('marbleTable', [0.475, 0.475, 0.035, 24], [cx, cy + 0.75 - 0.0175, cz]);

  // 2. Steel underframe ring
  batcher.addCylinder('metalLegs', [0.36, 0.36, 0.03, 16], [cx, cy + 0.70, cz]);

  // 3. Four splayed steel legs radiating outward at 45°, 135°, 225°, 315°
  for (const ang of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    const topR = 0.26;
    const botR = 0.38;
    const topX = cx + Math.cos(ang) * topR;
    const topZ = cz + Math.sin(ang) * topR;
    const botX = cx + Math.cos(ang) * botR;
    const botZ = cz + Math.sin(ang) * botR;
    const midX = (topX + botX) / 2;
    const midZ = (topZ + botZ) / 2;
    batcher.addCylinder('metalLegs', [0.02, 0.015, 0.70, 8], [midX, cy + 0.35, midZ]);
    batcher.addCylinder('metalLegs', [0.035, 0.035, 0.016, 8], [botX, cy + 0.008, botZ]);
  }
}

/**
 * Builds slatted wood acoustic ceiling ("Реечный потолок", Sheet 2).
 */
function addSlattedCeiling(
  batcher: StaticGeometryBatcher,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  ceilingY: number,
) {
  // Black acoustic plenum backing
  batcher.addBox('metalLegs', [maxX - minX, 0.02, maxZ - minZ], [(minX + maxX) / 2, ceilingY + 0.01, (minZ + maxZ) / 2]);

  // Natural warm oak wood slats (cross-section 50mm x 100mm, spacing 240mm)
  const spanZ = maxZ - minZ;
  for (let x = minX + 0.12; x <= maxX - 0.12; x += 0.24) {
    batcher.addBox('slattedCeiling', [0.05, 0.10, spanZ], [x, ceilingY - 0.05, (minZ + maxZ) / 2]);
  }
}

/**
 * Builds continuous linear LED luminaire ("Линейный LED светильник", Sheet 2).
 */
function addLinearLed(
  batcher: StaticGeometryBatcher,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  y: number,
) {
  const lenX = Math.abs(endX - startX) || 0.08;
  const lenZ = Math.abs(endZ - startZ) || 0.08;
  const midX = (startX + endX) / 2;
  const midZ = (startZ + endZ) / 2;

  // Extruded fixture housing
  batcher.addBox('metalLegs', [lenX, 0.06, lenZ], [midX, y + 0.03, midZ]);
  // Linear glowing diffuser
  batcher.addBox('linearLed', [lenX - 0.02, 0.02, lenZ - 0.02], [midX, y, midZ]);

  // Thin aircraft suspension cables
  const cableH = 0.28;
  for (const t of [0.15, 0.5, 0.85]) {
    const cx = startX + (endX - startX) * t;
    const cz = startZ + (endZ - startZ) * t;
    batcher.addCylinder('handrailSteel', [0.003, 0.003, cableH, 6], [cx, y + 0.06 + cableH / 2, cz]);
  }
}

/**
 * Builds glass balustrade with stainless steel handrail ("Ограждение стеклянное с поручнем из н/ж стали", Sheet 2, H=1100mm).
 */
function addGlassStainlessBalustrade(
  batcher: StaticGeometryBatcher,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  floorY: number,
) {
  const len = Math.hypot(endX - startX, endZ - startZ);
  const midX = (startX + endX) / 2;
  const midZ = (startZ + endZ) / 2;
  const angle = Math.atan2(endZ - startZ, endX - startX);

  // Height = 1100mm (1.1m) per blueprint
  // 1. Tempered glass balustrade panel
  batcher.addBox('glass', [len, 0.96, 0.016], [midX, floorY + 0.53, midZ], [0, -angle, 0]);

  // 2. Stainless steel round top handrail (Ø50mm)
  batcher.addBox('handrailSteel', [len, 0.05, 0.05], [midX, floorY + 1.075, midZ], [0, -angle, 0]);

  // 3. Stainless steel base clamp channel
  batcher.addBox('handrailSteel', [len, 0.05, 0.04], [midX, floorY + 0.025, midZ], [0, -angle, 0]);

  // 4. Stainless steel posts
  const posts = Math.max(2, Math.round(len / 1.4));
  for (let i = 0; i <= posts; i++) {
    const t = i / posts;
    const px = startX + (endX - startX) * t;
    const pz = startZ + (endZ - startZ) * t;
    batcher.addBox('handrailSteel', [0.04, 1.05, 0.04], [px, floorY + 0.525, pz], [0, -angle, 0]);
  }
}

function GlazedConnectorMesh({
  connector,
  dimmed,
  hideRoof,
  isSelectedRoom,
  onSelect,
}: {
  connector: ConnectorGeometry;
  dimmed: boolean;
  hideRoof?: boolean;
  isSelectedRoom?: boolean;
  onSelect?: () => void;
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

  const roofTileTex = useMemo(() => getRoofTileTextures(0.5, 0.5), []);
  const marbleTex = useMemo(() => getDarkMarbleTextures(1, 1), []);

  const materials = useMemo(() => {
    return {
      glass: new THREE.MeshStandardMaterial({
        color: '#e2e8f0', // Clear neutral architectural glass
        roughness: 0.08,
        metalness: 0.1,
        transparent: true,
        opacity: dimmed ? 0.15 : 0.22,
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
        map: roofTileTex?.map ?? null,
        normalMap: roofTileTex?.normalMap ?? null,
        normalScale: new THREE.Vector2(0.25, 0.25),
        roughnessMap: roofTileTex?.roughnessMap ?? null,
        roughness: 0.65,
        metalness: 0.1,
        transparent: dimmed,
        opacity: dimmed ? 0.35 : 1,
      }),
      whiteTrim: new THREE.MeshStandardMaterial({
        color: '#f5f0e6',
        roughness: 0.72,
        metalness: 0.0,
        transparent: dimmed,
        opacity: dimmed ? 0.35 : 1,
      }),
      woodColumn: new THREE.MeshStandardMaterial({
        color: '#422006',
        roughness: 0.45,
      }),
      marbleTable: new THREE.MeshStandardMaterial({
        color: '#18181b', // Dark Nero Marquina / graphite marble (Sheet 1)
        map: marbleTex?.map ?? null,
        normalMap: marbleTex?.normalMap ?? null,
        roughnessMap: marbleTex?.roughnessMap ?? null,
        roughness: 0.18,
        metalness: 0.25,
      }),
      chairTextile: new THREE.MeshStandardMaterial({
        color: '#334155', // Charcoal designer textile (Sheet 1)
        roughness: 0.85,
        metalness: 0.05,
      }),
      chairTextileWarm: new THREE.MeshStandardMaterial({
        color: '#475569', // Slate grey designer textile (Sheet 1)
        roughness: 0.85,
        metalness: 0.05,
      }),
      chairTextileTerracotta: new THREE.MeshStandardMaterial({
        color: '#9a3412', // Warm terracotta designer textile accent
        roughness: 0.85,
        metalness: 0.05,
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
      metalLegs: new THREE.MeshStandardMaterial({
        color: '#0f172a', // Black matte steel tubular legs (Sheet 1)
        roughness: 0.45,
        metalness: 0.8,
      }),
      slattedCeiling: new THREE.MeshStandardMaterial({
        color: '#b47b48', // Slatted wood acoustic ceiling ("Реечный потолок", Sheet 2)
        roughness: 0.65,
        metalness: 0.05,
      }),
      linearLed: new THREE.MeshStandardMaterial({
        color: '#ffffff',
        emissive: '#fef08a', // Warm white 3500K LED luminaire ("Линейный LED светильник", Sheet 2)
        emissiveIntensity: 1.4,
        roughness: 0.2,
      }),
      handrailSteel: new THREE.MeshStandardMaterial({
        color: '#e2e8f0', // Polished stainless steel ("Ограждение стеклянное с поручнем из н/ж стали", Sheet 2)
        roughness: 0.18,
        metalness: 0.95,
      }),
      wall: new THREE.MeshStandardMaterial({
        color: '#f8fafc',
        roughness: 0.85,
        metalness: 0.05,
        transparent: dimmed,
        opacity: dimmed ? 0.35 : 1,
      }),
      wood: new THREE.MeshStandardMaterial({
        color: '#a66534',
        roughness: 0.5,
        metalness: 0.0,
        transparent: dimmed,
        opacity: dimmed ? 0.35 : 1,
      }),
      darkWood: new THREE.MeshStandardMaterial({
        color: '#452210',
        roughness: 0.6,
        metalness: 0.0,
        transparent: dimmed,
        opacity: dimmed ? 0.35 : 1,
      }),
      screen: new THREE.MeshStandardMaterial({
        color: '#030712',
        roughness: 0.2,
        emissive: '#1e293b',
        emissiveIntensity: 0.4,
        transparent: dimmed,
        opacity: dimmed ? 0.35 : 1,
      }),
    };
  }, [dimmed, roofTileTex, marbleTex]);

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

    // 2. Overhanging Eaves Fascia & Roof (Matching Image 1: true 4-pitched red hip roof)
    // Note: conn-bld-g-bld-i shares a single unified hip roof with AmphitheaterHall (ADR-029 & CAD masterplan)
    const overhang = 0.4;
    const rw = w + overhang;
    const rd = d + overhang;

    if (connector.id !== 'conn-bld-g-bld-i') {
      // Molded white eaves cornice & fascia at wall height
      batcher.addBox(
        'whiteTrim',
        [rw + 0.1, 0.28, rd + 0.1],
        [0, height + 0.14, 0],
      );

      // True 4-pitched hip roof for all connectors matching university roofs (Image 1)
      const hipRoofGeo = createConnectorHipRoofGeometry(rw, rd, roofPitchH);
      batcher.addGeometry(
        'redRoof',
        hipRoofGeo,
        [0, height + 0.28, 0],
      );
      hipRoofGeo.dispose();

      // Ridge cap tile beam
      const ridgeLen = isXLong ? Math.max(0.6, rw - rd * 0.6) : Math.max(0.6, rd - rw * 0.6);
      batcher.addBox(
        'redRoof',
        isXLong ? [ridgeLen, 0.14, 0.24] : [0.24, 0.14, ridgeLen],
        [0, height + 0.28 + roofPitchH + 0.07, 0],
      );
    }

    // 2b. Intermediate floor slabs
    for (let i = 1; i < storeyCount; i++) {
      const oy = -windowH / 2 + i * storeyH;
      if (connector.id === 'conn-bld-h-bld-i') {
        // Corridor A <-> C (CAD blueprint & user spec):
        // 1. North 2F Open Study Place mezzanine (Z: -9.0m .. -1.5m, depth 7.5m < 50% width)
        batcher.addBox('plinth', [w - 0.2, 0.28, 7.5], [0, plinthH + windowH / 2 + oy, -5.25]);
        // 2. South 1-Storey Administration Office ceiling slab (Z: +3.5m .. +9.0m, depth 5.5m)
        batcher.addBox('plinth', [w - 0.2, 0.25, 5.5], [0, plinthH + windowH / 2 + oy, 6.25]);
        // 3. Middle zone (Z: -1.5m .. +3.5m, depth 5.0m) is an open double-height atrium void ("пустота без второго этажа")
      } else {
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

    if (connector.id !== 'conn-bld-d-bld-b' && connector.id !== 'conn-bld-h-bld-i' && connector.id !== 'conn-bld-g-bld-i') {
      for (const side of isXLong ? [-d / 2, d / 2] : [-w / 2, w / 2]) {

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
    } else if (connector.id === 'conn-bld-h-bld-i') {
      // Full panoramic mirrored glass curtain wall on South Facade facing courtyard ("фасад просто зеркола")
      const southZ = d / 2;
      const sy = plinthH + windowH / 2;
      const faceW = w - 0.2;
      const hBays = Math.max(2, Math.round(faceW / 1.5));
      const hStep = faceW / hBays;

      // Reflective mirror glass pane
      batcher.addBox('glass', [faceW, windowH, 0.05], [0, sy, southZ]);
      // Top & bottom architectural framing
      batcher.addBox('frame', [w - 0.1, 0.06, 0.08], [0, sy + windowH / 2 - 0.03, southZ]);
      batcher.addBox('frame', [w - 0.1, 0.06, 0.08], [0, sy - windowH / 2 + 0.03, southZ]);

      // Mid-height transom bars per floor
      for (const oy of transomOffsets) {
        batcher.addBox('frame', [w - 0.1, 0.05, 0.06], [0, sy + oy, southZ]);
      }
      // Vertical structural mullions across the 15m width
      for (let i = 1; i < hBays; i++) {
        const mx = -faceW / 2 + i * hStep;
        batcher.addBox('frame', [0.08, windowH, 0.08], [mx, sy, southZ]);
      }
    } else if (connector.id === 'conn-bld-d-bld-b') {
      // West Facade of conn-bld-d-bld-b only (conn-bld-g-bld-i opens directly to Amphitheater Hall)
      const sy = plinthH + windowH / 2;
      batcher.addBox('glass', [0.05, windowH, d - 0.2], [-w / 2, sy, 0]);
      batcher.addBox('frame', [0.08, 0.06, d], [-w / 2, sy + windowH / 2 - 0.03, 0]);
      batcher.addBox('frame', [0.08, 0.06, d], [-w / 2, sy - windowH / 2 + 0.03, 0]);
    }

    // 5. Interior Architecture for Connector A <-> C (conn-bld-h-bld-i) per user blueprint
    if (connector.id === 'conn-bld-h-bld-i') {
      const ly = height / 2; // +3.6m (2F level)

      // --- ZONE 1: North 2F Open Study Place (Z: -9.0m .. -1.5m, Sheet 1 & Sheet 2 Blueprint) ---
      // Glass balustrades with stainless steel handrail (H = 1100mm per blueprint)
      // 1. South edge overlooking the double-height atrium void at Z = -1.5m
      addGlassStainlessBalustrade(batcher, -w / 2 + 0.2, -1.5, w / 2 - 2.6, -1.5, ly);
      // 2. North edge overlooking Amphitheater Hall at Z = -8.85m
      addGlassStainlessBalustrade(batcher, -w / 2 + 0.2, -8.85, w / 2 - 0.2, -8.85, ly);

      // Wood architectural columns ("Деревянная колонна", Sheet 2 Axis Б)
      for (const cx of [-4.5, 0, 4.5]) {
        batcher.addBox('woodColumn', [0.4, ly, 0.4], [cx, ly / 2, -1.5]);
      }

      // Slatted wood acoustic ceiling ("Реечный потолок", Sheet 2) overhead at Y = 6.95m
      addSlattedCeiling(batcher, -w / 2 + 0.3, w / 2 - 0.3, -8.8, -1.6, height - 0.15);

      // Continuous suspended linear LED luminaires ("Линейный LED светильник", Sheet 2)
      addLinearLed(batcher, -5.6, -6.5, 5.2, -6.5, height - 0.45);
      addLinearLed(batcher, -5.6, -3.5, 5.2, -3.5, height - 0.45);

      // Exact Table & Chair Layout per Blueprint (Sheet 2):
      // Row 1 (Upper row, Z = -6.5m): Rectangular marble table, Round marble table, Rectangular, Round
      // Table 1: Rectangular marble (1400x800) at X = -4.8m
      addReferenceMarbleTable(batcher, -4.8, ly, -6.5);
      addReferenceChair(batcher, -5.2, ly, -6.5 - 0.75, 0, 'chairTextile');
      addReferenceChair(batcher, -4.4, ly, -6.5 - 0.75, 0, 'chairTextileWarm');
      addReferenceChair(batcher, -5.2, ly, -6.5 + 0.75, Math.PI, 'chairTextile');
      addReferenceChair(batcher, -4.4, ly, -6.5 + 0.75, Math.PI, 'chairTextileWarm');
      batcher.addBox('metalLegs', [0.32, 0.015, 0.24], [-4.8, ly + 0.75, -6.5 - 0.2]);
      batcher.addBox('screen', [0.32, 0.22, 0.015], [-4.8, ly + 0.85, -6.5 - 0.3], [-0.25, 0, 0]);

      // Table 2: Round marble (Ø950) at X = -1.8m
      addReferenceRoundTable(batcher, -1.8, ly, -6.5);
      addReferenceChair(batcher, -1.8, ly, -6.5 - 0.78, 0, 'chairTextile');
      addReferenceChair(batcher, -1.8, ly, -6.5 + 0.78, Math.PI, 'chairTextileWarm');
      addReferenceChair(batcher, -1.8 - 0.78, ly, -6.5, Math.PI / 2, 'chairTextileTerracotta');
      addReferenceChair(batcher, -1.8 + 0.78, ly, -6.5, -Math.PI / 2, 'chairTextile');

      // Table 3: Rectangular marble (1400x800) at X = +1.4m
      addReferenceMarbleTable(batcher, 1.4, ly, -6.5);
      addReferenceChair(batcher, 1.0, ly, -6.5 - 0.75, 0, 'chairTextileWarm');
      addReferenceChair(batcher, 1.8, ly, -6.5 - 0.75, 0, 'chairTextile');
      addReferenceChair(batcher, 1.0, ly, -6.5 + 0.75, Math.PI, 'chairTextileWarm');
      addReferenceChair(batcher, 1.8, ly, -6.5 + 0.75, Math.PI, 'chairTextile');
      batcher.addBox('metalLegs', [0.32, 0.015, 0.24], [1.4, ly + 0.75, -6.5 - 0.2]);
      batcher.addBox('screen', [0.32, 0.22, 0.015], [1.4, ly + 0.85, -6.5 - 0.3], [-0.25, 0, 0]);

      // Table 4: Round marble (Ø950) at X = +4.4m
      addReferenceRoundTable(batcher, 4.4, ly, -6.5);
      addReferenceChair(batcher, 4.4, ly, -6.5 - 0.78, 0, 'chairTextile');
      addReferenceChair(batcher, 4.4, ly, -6.5 + 0.78, Math.PI, 'chairTextileWarm');
      addReferenceChair(batcher, 4.4 - 0.78, ly, -6.5, Math.PI / 2, 'chairTextile');
      addReferenceChair(batcher, 4.4 + 0.78, ly, -6.5, -Math.PI / 2, 'chairTextileTerracotta');

      // Row 2 (Lower row, Z = -3.5m, along atrium balustrade):
      // Table 5: Rectangular marble (1400x800) at X = -4.8m
      addReferenceMarbleTable(batcher, -4.8, ly, -3.5);
      addReferenceChair(batcher, -5.2, ly, -3.5 - 0.75, 0, 'chairTextileWarm');
      addReferenceChair(batcher, -4.4, ly, -3.5 - 0.75, 0, 'chairTextile');
      addReferenceChair(batcher, -5.2, ly, -3.5 + 0.75, Math.PI, 'chairTextileWarm');
      addReferenceChair(batcher, -4.4, ly, -3.5 + 0.75, Math.PI, 'chairTextile');

      // Table 6: Rectangular marble (1400x800) at X = -1.8m
      addReferenceMarbleTable(batcher, -1.8, ly, -3.5);
      addReferenceChair(batcher, -2.2, ly, -3.5 - 0.75, 0, 'chairTextile');
      addReferenceChair(batcher, -1.4, ly, -3.5 - 0.75, 0, 'chairTextileTerracotta');
      addReferenceChair(batcher, -2.2, ly, -3.5 + 0.75, Math.PI, 'chairTextile');
      addReferenceChair(batcher, -1.4, ly, -3.5 + 0.75, Math.PI, 'chairTextileTerracotta');
      batcher.addBox('metalLegs', [0.32, 0.015, 0.24], [-1.8, ly + 0.75, -3.5 + 0.2]);
      batcher.addBox('screen', [0.32, 0.22, 0.015], [-1.8, ly + 0.85, -3.5 + 0.3], [0.25, Math.PI, 0]);

      // Table 7: Round marble (Ø950) with 4 chairs angled at 45° (Sheet 2) at X = +1.4m
      addReferenceRoundTable(batcher, 1.4, ly, -3.5);
      const ang45 = Math.PI / 4;
      addReferenceChair(batcher, 1.4 + Math.cos(ang45) * 0.78, ly, -3.5 + Math.sin(ang45) * 0.78, -ang45 - Math.PI / 2, 'chairTextile');
      addReferenceChair(batcher, 1.4 - Math.cos(ang45) * 0.78, ly, -3.5 - Math.sin(ang45) * 0.78, -ang45 + Math.PI / 2, 'chairTextileWarm');
      addReferenceChair(batcher, 1.4 - Math.sin(ang45) * 0.78, ly, -3.5 + Math.cos(ang45) * 0.78, ang45, 'chairTextileTerracotta');
      addReferenceChair(batcher, 1.4 + Math.sin(ang45) * 0.78, ly, -3.5 - Math.cos(ang45) * 0.78, ang45 + Math.PI, 'chairTextile');

      // Table 8: Rectangular marble (1400x800) at X = +4.4m
      addReferenceMarbleTable(batcher, 4.4, ly, -3.5);
      addReferenceChair(batcher, 4.0, ly, -3.5 - 0.75, 0, 'chairTextile');
      addReferenceChair(batcher, 4.8, ly, -3.5 - 0.75, 0, 'chairTextileWarm');
      addReferenceChair(batcher, 4.0, ly, -3.5 + 0.75, Math.PI, 'chairTextile');
      addReferenceChair(batcher, 4.8, ly, -3.5 + 0.75, Math.PI, 'chairTextileWarm');

      // Bookshelves on side walls (leaves North wide open to Amphitheater)
      for (const sx of [-w / 2 + 0.35]) {
        batcher.addBox('darkWood', [0.38, 2.2, 3.8], [sx, ly + 1.1, -5.25]);
        batcher.addBox('wood', [0.36, 0.04, 3.6], [sx, ly + 0.6, -5.25]);
        batcher.addBox('wood', [0.36, 0.04, 3.6], [sx, ly + 1.2, -5.25]);
        batcher.addBox('wood', [0.36, 0.04, 3.6], [sx, ly + 1.8, -5.25]);
      }

      // --- ZONE 2: Middle Void (Z: -1.5m .. +3.5m) ---
      // Ground floor central indoor planter with green shrubs
      batcher.addBox('plinth', [3.8, 0.45, 1.4], [0, 0.225, 1.0]);
      batcher.addBox('chairGreen', [3.5, 0.35, 1.1], [0, 0.55, 1.0]);

      // Open architectural staircase from 1F up to 2F mezzanine along East wall
      const stairX = w / 2 - 1.2;
      for (let s = 0; s < 12; s++) {
        const stepProgress = s / 12;
        const stepY = plinthH + stepProgress * (ly - plinthH);
        const stepZ = 2.5 - stepProgress * 3.8;
        batcher.addBox('darkWood', [1.8, 0.16, 0.34], [stairX, stepY + 0.08, stepZ]);
        batcher.addBox('wood', [1.8, 0.04, 0.34], [stairX, stepY + 0.16, stepZ]);
      }
      batcher.addBox('handrailSteel', [0.06, 1.0, 4.2], [stairX - 0.9, ly / 2 + 0.5, 0.6], [-0.55, 0, 0]);

      // --- ZONE 3: South 1-Storey Administration Office (Z: +3.5m .. +9.0m) ---
      // Partition wall along Z = +3.5m (height = 3.6m, 1st floor only)
      batcher.addBox('wall', [w - 0.2, ly, 0.16], [0, ly / 2, 3.5]);
      // Office entrance door (open/glazed frame)
      batcher.addBox('frame', [1.2, 2.3, 0.18], [3.2, 1.15, 3.5]);
      // Large glazed inspection window into office
      batcher.addBox('glass', [4.2, 1.6, 0.06], [-2.5, 2.1, 3.5]);
      batcher.addBox('frame', [4.3, 1.7, 0.08], [-2.5, 2.1, 3.5]);

      // Administration furniture on 1F (inside office, Y: 0 .. 3.6m)
      // L-shaped Reception/Admin Counter
      batcher.addBox('wood', [3.6, 1.05, 0.8], [-2.0, 1.05 / 2, 5.0]);
      batcher.addBox('marbleTable', [3.7, 0.04, 0.85], [-2.0, 1.07, 5.0]);
      batcher.addBox('screen', [0.5, 0.34, 0.04], [-2.0, 1.26, 5.0]);
      // Admin office chair behind counter
      batcher.addBox('chairBurgundy', [0.46, 0.08, 0.46], [-2.0, 0.48, 5.8]);
      batcher.addBox('chairBurgundy', [0.44, 0.5, 0.06], [-2.0, 0.75, 6.05]);
      // Visitor armchairs in front of counter
      batcher.addBox('chairYellow', [0.55, 0.42, 0.55], [2.2, 0.42 / 2, 5.2]);
      batcher.addBox('chairYellow', [0.55, 0.42, 0.55], [3.2, 0.42 / 2, 5.2]);
      batcher.addBox('wood', [1.2, 0.42, 0.6], [2.7, 0.21, 6.2]);
      // Document filing cabinets & archive shelving along side wall
      batcher.addBox('darkWood', [0.5, 2.4, 3.2], [-6.8, 1.2, 6.5]);
      batcher.addBox('frame', [0.52, 2.42, 3.22], [-6.8, 1.2, 6.5]);
    }

    // 6. 2F Open Study Place for Corridor B <-> C (conn-bld-g-bld-i, Sheet 1 & Sheet 2 Reference)
    if (connector.id === 'conn-bld-g-bld-i') {
      const ly = height / 2; // +3.6m (2F level)

      // Slatted wood ceiling overhead
      addSlattedCeiling(batcher, -w / 2 + 0.2, w / 2 - 0.2, -d / 2 + 0.3, d / 2 - 0.3, height - 0.15);

      // Continuous suspended linear LED luminaires along the corridor
      addLinearLed(batcher, -0.2, -d / 2 + 1.2, -0.2, d / 2 - 1.2, height - 0.45);

      // Glass and stainless steel balustrade on west edge overlooking amphitheater
      addGlassStainlessBalustrade(batcher, -w / 2 + 0.2, -d / 2 + 0.5, -w / 2 + 0.2, d / 2 - 0.5, ly);

      // Cluster 1 (North): Reference Rectangular Marble Table (1400x800)
      addReferenceMarbleTable(batcher, -0.2, ly, -5.2);
      addReferenceChair(batcher, -0.6, ly, -5.2 - 0.75, 0, 'chairTextile');
      addReferenceChair(batcher, 0.2, ly, -5.2 - 0.75, 0, 'chairTextileWarm');
      addReferenceChair(batcher, -0.6, ly, -5.2 + 0.75, Math.PI, 'chairTextile');
      addReferenceChair(batcher, 0.2, ly, -5.2 + 0.75, Math.PI, 'chairTextileWarm');
      batcher.addBox('metalLegs', [0.3, 0.015, 0.22], [-0.2, ly + 0.75, -5.2 - 0.2]);
      batcher.addBox('screen', [0.3, 0.2, 0.015], [-0.2, ly + 0.85, -5.2 - 0.3], [-0.25, 0, 0]);

      // Cluster 2 (Center): Reference Round Marble Table (Ø950) with 4 chairs angled at 45°
      addReferenceRoundTable(batcher, -0.2, ly, 0.0);
      const ang45 = Math.PI / 4;
      addReferenceChair(batcher, -0.2 + Math.cos(ang45) * 0.78, ly, Math.sin(ang45) * 0.78, -ang45 - Math.PI / 2, 'chairTextileTerracotta');
      addReferenceChair(batcher, -0.2 - Math.cos(ang45) * 0.78, ly, -Math.sin(ang45) * 0.78, -ang45 + Math.PI / 2, 'chairTextile');
      addReferenceChair(batcher, -0.2 - Math.sin(ang45) * 0.78, ly, Math.cos(ang45) * 0.78, ang45, 'chairTextileWarm');
      addReferenceChair(batcher, -0.2 + Math.sin(ang45) * 0.78, ly, -Math.cos(ang45) * 0.78, ang45 + Math.PI, 'chairTextile');

      // Cluster 3 (South): Reference Rectangular Marble Table (1400x800)
      addReferenceMarbleTable(batcher, -0.2, ly, 5.2);
      addReferenceChair(batcher, -0.6, ly, 5.2 - 0.75, 0, 'chairTextileWarm');
      addReferenceChair(batcher, 0.2, ly, 5.2 - 0.75, 0, 'chairTextile');
      addReferenceChair(batcher, -0.6, ly, 5.2 + 0.75, Math.PI, 'chairTextileWarm');
      addReferenceChair(batcher, 0.2, ly, 5.2 + 0.75, Math.PI, 'chairTextileTerracotta');
      batcher.addBox('metalLegs', [0.3, 0.015, 0.22], [-0.2, ly + 0.75, 5.2 + 0.2]);
      batcher.addBox('screen', [0.3, 0.2, 0.015], [-0.2, ly + 0.85, 5.2 + 0.3], [0.25, Math.PI, 0]);

      // Bookshelves along East wall
      for (const bz of [-2.6, 2.6]) {
        batcher.addBox('darkWood', [0.38, 2.2, 2.6], [w / 2 - 0.35, ly + 1.1, bz]);
        batcher.addBox('wood', [0.36, 0.04, 2.5], [w / 2 - 0.35, ly + 0.6, bz]);
        batcher.addBox('wood', [0.36, 0.04, 2.5], [w / 2 - 0.35, ly + 1.2, bz]);
        batcher.addBox('wood', [0.36, 0.04, 2.5], [w / 2 - 0.35, ly + 1.8, bz]);
      }
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
    <group
      position={[cx, connector.elevation, cz]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
    >
      {merged.plinth && (
        <mesh geometry={merged.plinth} material={materials.plinth} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {!hideRoof && merged.whiteTrim && (
        <mesh geometry={merged.whiteTrim} material={materials.whiteTrim} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.roof && (
        <mesh geometry={merged.roof} material={materials.roof} raycast={NO_RAYCAST} />
      )}
      {!hideRoof && merged.redRoof && (
        <mesh geometry={merged.redRoof} material={materials.redRoof} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.frame && (
        <mesh geometry={merged.frame} material={materials.frame} castShadow raycast={NO_RAYCAST} />
      )}
      {isSelectedRoom && (
        <mesh
          position={[0, height / 2 + 0.05, connector.id === 'conn-bld-h-bld-i' ? -5.25 : 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[w - 0.4, connector.id === 'conn-bld-h-bld-i' ? 7.3 : d - 0.4]} />
          <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.35} />
        </mesh>
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
      {merged.chairTextile && (
        <mesh geometry={merged.chairTextile} material={materials.chairTextile} castShadow raycast={NO_RAYCAST} />
      )}
      {merged.chairTextileWarm && (
        <mesh geometry={merged.chairTextileWarm} material={materials.chairTextileWarm} castShadow raycast={NO_RAYCAST} />
      )}
      {merged.chairTextileTerracotta && (
        <mesh geometry={merged.chairTextileTerracotta} material={materials.chairTextileTerracotta} castShadow raycast={NO_RAYCAST} />
      )}
      {merged.metalLegs && (
        <mesh geometry={merged.metalLegs} material={materials.metalLegs} castShadow raycast={NO_RAYCAST} />
      )}
      {merged.slattedCeiling && (
        <mesh geometry={merged.slattedCeiling} material={materials.slattedCeiling} receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.linearLed && (
        <mesh geometry={merged.linearLed} material={materials.linearLed} raycast={NO_RAYCAST} />
      )}
      {merged.wall && (
        <mesh geometry={merged.wall} material={materials.wall} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.wood && (
        <mesh geometry={merged.wood} material={materials.wood} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.darkWood && (
        <mesh geometry={merged.darkWood} material={materials.darkWood} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.screen && (
        <mesh geometry={merged.screen} material={materials.screen} raycast={NO_RAYCAST} />
      )}

      {/* Daewoo Hall Entrance Pavilion on East Facade of Corridor B<->C (conn-bld-g-bld-i) */}
      {connector.id === 'conn-bld-g-bld-i' && (
        <DaewooHallFacade
          width={length}
          position={[w / 2 + 0.15, 0, 0]}
          rotationY={Math.PI / 2}
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
