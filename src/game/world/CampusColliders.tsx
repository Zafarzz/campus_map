import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useMemo } from 'react';
import { AJOU_ART_DIMENSIONS } from '../../components/3d/AjouArtObject';
import { LIBRARY_LAYOUT, LIBRARY_ROOM_ID } from '../../components/3d/BlockFLibraryInterior';
import { FOUNTAIN_DIMENSIONS } from '../../components/3d/CampusFountain';
import { MAIN_ENTRANCE_WIDTH } from '../../components/3d/MainEntranceGate';
import { computeTreePlacements } from '../../components/3d/Vegetation';
import { mapConfig } from '../../config/mapConfig';
import { AMPHITHEATER_HALL } from '../../data/amphitheater-hall';
import type { CampusGeometry, Footprint } from '../../domain/geometry/types';

export type BoxColliderSpec = {
  id: string;
  position: [number, number, number];
  halfExtents: [number, number, number];
  rotation?: [number, number, number];
  friction?: number;
};

export type CylinderColliderSpec = {
  id: string;
  position: [number, number, number];
  halfHeight: number;
  radius: number;
};

function footprintToBox(
  id: string,
  fp: Footprint,
  bottom: number,
  height: number,
): BoxColliderSpec | null {
  const halfH = Math.max(0.1, height / 2);
  const centerY = bottom + halfH;

  if (fp.type === 'rect') {
    return {
      id,
      position: [fp.center[0], centerY, fp.center[1]],
      halfExtents: [Math.max(0.1, fp.size[0] / 2), halfH, Math.max(0.1, fp.size[1] / 2)],
      rotation: fp.rotation ? [0, -fp.rotation, 0] : undefined,
    };
  }

  if (fp.points.length < 3) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of fp.points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return {
    id,
    position: [(minX + maxX) / 2, centerY, (minZ + maxZ) / 2],
    halfExtents: [Math.max(0.1, (maxX - minX) / 2), halfH, Math.max(0.1, (maxZ - minZ) / 2)],
  };
}

export function buildLibraryInteriorColliderSpecs(geometry: CampusGeometry): BoxColliderSpec[] {
  const roomGeo = geometry.rooms[LIBRARY_ROOM_ID];
  if (!roomGeo || roomGeo.type !== 'box') return [];

  const [cx, cy, cz] = roomGeo.position;
  const [w, h, d] = roomGeo.size;
  const floorY = cy - h / 2;
  const hw = w / 2;
  const hd = d / 2;
  const portalHalfZ = LIBRARY_LAYOUT.portalHalfWidthZ;
  const sideWallLenZ = hd - portalHalfZ;

  const list: BoxColliderSpec[] = [];

  // 1. Floor slab of the library (top at floorY = 0.25m, gentle ramp at entrance portal)
  list.push({
    id: 'lib-floor-slab',
    position: [cx, floorY / 2, cz],
    halfExtents: [hw + 1.2, floorY / 2, hd],
    friction: 0.2,
  });

  // 2. Perimeter & Partition Walls (leaving the 5.6m West entrance portal open)
  list.push({
    id: 'lib-wall-west-north',
    position: [cx - hw + 0.08, floorY + 1.3, cz - (portalHalfZ + sideWallLenZ / 2)],
    halfExtents: [0.1, 1.3, sideWallLenZ / 2],
  });
  list.push({
    id: 'lib-wall-west-south',
    position: [cx - hw + 0.08, floorY + 1.3, cz + (portalHalfZ + sideWallLenZ / 2)],
    halfExtents: [0.1, 1.3, sideWallLenZ / 2],
  });
  list.push({
    id: 'lib-wall-east',
    position: [cx + hw - 0.08, floorY + 1.3, cz],
    halfExtents: [0.1, 1.3, hd],
  });
  list.push({
    id: 'lib-wall-north',
    position: [cx, floorY + 1.3, cz - hd + 0.08],
    halfExtents: [hw, 1.3, 0.1],
  });
  list.push({
    id: 'lib-wall-south',
    position: [cx, floorY + 1.3, cz + hd - 0.08],
    halfExtents: [hw, 1.3, 0.1],
  });

  // 3. Librarian Reception Desk
  const [rx, , rz] = LIBRARY_LAYOUT.receptionPos;
  const [rw, rh, rd] = LIBRARY_LAYOUT.receptionSize;
  list.push({
    id: 'lib-reception-desk',
    position: [cx + rx, floorY + rh / 2, cz + rz],
    halfExtents: [rw / 2, rh / 2, rd / 2],
  });

  // 4. 10 Tall Oak Bookcases
  const [bw, bh, bd] = LIBRARY_LAYOUT.bookcaseSize;
  LIBRARY_LAYOUT.bookcaseRowsZ.forEach((rowZ, rIdx) => {
    LIBRARY_LAYOUT.bookcaseColsX.forEach((colX, cIdx) => {
      list.push({
        id: `lib-bookcase-${rIdx}-${cIdx}`,
        position: [cx + colX, floorY + bh / 2, cz + rowZ],
        halfExtents: [bw / 2, bh / 2, bd / 2],
      });
    });
  });

  // 5. 8 Reading Hall Study Tables
  const [tw, th, td] = LIBRARY_LAYOUT.readingTableSize;
  LIBRARY_LAYOUT.readingTableRowsZ.forEach((tz, rIdx) => {
    LIBRARY_LAYOUT.readingTableColsX.forEach((tx, cIdx) => {
      list.push({
        id: `lib-reading-table-${rIdx}-${cIdx}`,
        position: [cx + tx, floorY + th / 2, cz + tz],
        halfExtents: [tw / 2, th / 2, td / 2],
      });
    });
  });

  // 6. Digital Media Workstation Bar
  const [dx, , dz] = LIBRARY_LAYOUT.digitalDeskPos;
  const [dw, dh, dd] = LIBRARY_LAYOUT.digitalDeskSize;
  list.push({
    id: 'lib-digital-desk',
    position: [cx + dx, floorY + dh / 2, cz + dz],
    halfExtents: [dw / 2, dh / 2, dd / 2],
  });

  return list;
}

export function buildCampusColliderSpecs(
  geometry: CampusGeometry,
  enteredBuildingId?: string | null,
): BoxColliderSpec[] {
  const list: BoxColliderSpec[] = [];
  const { min, max } = geometry.bounds;

  // 1. Ground terrain collider (top surface at Y = 0)
  const margin = 120;
  const groundWidth = max[0] - min[0] + margin * 2;
  const groundDepth = max[1] - min[1] + margin * 2;
  const groundHalfThickness = 1.0;
  list.push({
    id: 'ground-terrain',
    position: [(min[0] + max[0]) / 2, -groundHalfThickness, (min[1] + max[1]) / 2],
    halfExtents: [groundWidth / 2, groundHalfThickness, groundDepth / 2],
    friction: 0.2,
  });

  // 2. All campus buildings (skip solid mass for enteredBuildingId so player can walk inside)
  for (const bld of Object.values(geometry.buildings)) {
    if (enteredBuildingId && bld.buildingId === enteredBuildingId) continue;
    bld.parts.forEach((part, idx) => {
      const spec = footprintToBox(`bld-${bld.buildingId}-${idx}`, part, 0, bld.height);
      if (spec) list.push(spec);
    });
  }

  // Add detailed interior furniture & partition colliders when inside Block F (bld-d)
  if (enteredBuildingId === 'bld-d') {
    list.push(...buildLibraryInteriorColliderSpecs(geometry));
  }

  // 3. Inter-building glazed connectors
  for (const conn of geometry.connectors) {
    const spec = footprintToBox(
      `conn-${conn.id}`,
      conn.footprint,
      conn.elevation,
      conn.height || mapConfig.building.floorHeight,
    );
    if (spec) list.push(spec);
  }

  // 4. Auxiliary context structures (excluding kpp-e which is replaced by MainEntranceGate)
  for (const feature of geometry.context) {
    if (feature.kind !== 'structure' || feature.id === 'kpp-e') continue;
    const h = feature.height ?? mapConfig.building.unknownStructureHeight;
    const spec = footprintToBox(`ctx-${feature.id}`, feature.footprint, 0, h);
    if (spec) list.push(spec);
  }

  // 5. Perimeter fence and Main Entrance Gate (matching ContextLayer.tsx math)
  let gateZ = (min[1] + max[1]) / 2;
  const kppFeature = geometry.context.find((f) => f.id === 'kpp-e');
  if (kppFeature) {
    if (kppFeature.footprint.type === 'rect') {
      gateZ = kppFeature.footprint.center[1];
    } else if (kppFeature.footprint.points.length > 0) {
      gateZ =
        kppFeature.footprint.points.reduce((acc, p) => acc + p[1], 0) /
        kppFeature.footprint.points.length;
    }
  } else {
    const bldB = geometry.buildings['bld-g'];
    const bldF = geometry.buildings['bld-d'];
    if (bldB && bldF) {
      gateZ = (bldB.center[2] + bldF.center[2]) / 2;
    }
  }

  const left = min[0] - 22;
  const right = max[0] + 12;
  const top = min[1] - 22;
  const bottom = max[1] + 22;
  const fenceHeight = 2.5;
  const fenceHalfThick = 0.25;
  const gateWidth = MAIN_ENTRANCE_WIDTH;

  list.push({
    id: 'fence-north',
    position: [(left + right) / 2, fenceHeight / 2, top],
    halfExtents: [(right - left) / 2, fenceHeight / 2, fenceHalfThick],
  });
  list.push({
    id: 'fence-south',
    position: [(left + right) / 2, fenceHeight / 2, bottom],
    halfExtents: [(right - left) / 2, fenceHeight / 2, fenceHalfThick],
  });
  list.push({
    id: 'fence-west',
    position: [left, fenceHeight / 2, (top + bottom) / 2],
    halfExtents: [fenceHalfThick, fenceHeight / 2, (bottom - top) / 2],
  });

  const eastTopLen = Math.max(1, gateZ - gateWidth / 2 - top);
  list.push({
    id: 'fence-east-top',
    position: [right, fenceHeight / 2, (top + gateZ - gateWidth / 2) / 2],
    halfExtents: [fenceHalfThick, fenceHeight / 2, eastTopLen / 2],
  });

  const eastBottomLen = Math.max(1, bottom - (gateZ + gateWidth / 2));
  list.push({
    id: 'fence-east-bottom',
    position: [right, fenceHeight / 2, (bottom + gateZ + gateWidth / 2) / 2],
    halfExtents: [fenceHalfThick, fenceHeight / 2, eastBottomLen / 2],
  });

  // Main Entrance Gate solid structures
  list.push({
    id: 'gate-security-cabin',
    position: [right, 2.0, gateZ + 4.5],
    halfExtents: [2.5, 2.0, 3.2],
  });
  list.push({
    id: 'gate-central-pylon',
    position: [right, 2.3, gateZ - 4.65],
    halfExtents: [2.0, 2.3, 1.25],
  });
  list.push({
    id: 'gate-stele',
    position: [right + 0.3, 0.8, gateZ - 15.5],
    halfExtents: [0.4, 0.8, 5.55],
  });
  list.push({
    id: 'gate-pavilion',
    position: [right - 3.8, 1.4, gateZ + 14.5],
    halfExtents: [2.2, 1.4, 2.6],
  });
  list.push({
    id: 'gate-outer-boundary',
    position: [right + 4.5, fenceHeight / 2, gateZ],
    halfExtents: [fenceHalfThick, fenceHeight / 2, gateWidth / 2 + 2],
  });

  // 6. Landmark Art Object "I ♥ AJOU" on entrance plaza
  const artX = 78.5;
  const artZ = gateZ;
  list.push({
    id: 'ajou-art-object',
    position: [artX, 1.0, artZ],
    halfExtents: [
      AJOU_ART_DIMENSIONS.foundationWidth / 2 + 0.1,
      1.0,
      AJOU_ART_DIMENSIONS.foundationLength / 2,
    ],
  });

  // 7. Grand Campus Fountain: located on the central lawn north of the Sports Complex
  const fountainX = 0.0;
  const fountainZ = -23.1;
  const s = 0.7; // scaled to fit central lawn
  const outerHalfLen = (FOUNTAIN_DIMENSIONS.outerLength * s) / 2;
  const outerHalfWid = (FOUNTAIN_DIMENSIONS.outerWidth * s) / 2;

  // Bridge centers along X relative to fountainX: ±(7.5 + 1.05) * 1.5 = ±12.825m
  const bridgeOffset =
    (FOUNTAIN_DIMENSIONS.bridgeDistance / 2 + FOUNTAIN_DIMENSIONS.bridgeWalkwayWidth / 2) * s;
  const bridgeHalfW = (FOUNTAIN_DIMENSIONS.bridgeWalkwayWidth * s) / 2; // 1.575m
  const deckTopY = (FOUNTAIN_DIMENSIONS.bridgeDeckHeight + 0.07) * s;   // ~1.23m

  // Three solid water/cascade bays separated by the two bridge corridors
  const westBayMinX = -outerHalfLen;
  const westBayMaxX = -bridgeOffset - bridgeHalfW;
  list.push({
    id: 'campus-fountain-basin-west',
    position: [fountainX + (westBayMinX + westBayMaxX) / 2, 1.1, fountainZ],
    halfExtents: [(westBayMaxX - westBayMinX) / 2, 1.1, outerHalfWid],
  });

  const centerBayMinX = -bridgeOffset + bridgeHalfW;
  const centerBayMaxX = bridgeOffset - bridgeHalfW;
  list.push({
    id: 'campus-fountain-basin',
    position: [fountainX + (centerBayMinX + centerBayMaxX) / 2, 1.1, fountainZ],
    halfExtents: [(centerBayMaxX - centerBayMinX) / 2, 1.1, outerHalfWid],
  });

  const eastBayMinX = bridgeOffset + bridgeHalfW;
  const eastBayMaxX = outerHalfLen;
  list.push({
    id: 'campus-fountain-basin-east',
    position: [fountainX + (eastBayMinX + eastBayMaxX) / 2, 1.1, fountainZ],
    halfExtents: [(eastBayMaxX - eastBayMinX) / 2, 1.1, outerHalfWid],
  });

  // Walkable decks and north/south stair-ramps for both bridges
  const deckHalfLenZ = ((FOUNTAIN_DIMENSIONS.basinWidth + 1.2) * s) / 2; // 14.4m
  const rampRunZ = 2.6;
  const rampLength = Math.hypot(rampRunZ, deckTopY);
  const rampAngle = Math.atan2(deckTopY, rampRunZ);

  [-bridgeOffset, bridgeOffset].forEach((bx, idx) => {
    const worldBx = fountainX + bx;
    // Flat bridge deck (top surface at deckTopY)
    list.push({
      id: `fountain-bridge-deck-${idx}`,
      position: [worldBx, deckTopY / 2, fountainZ],
      halfExtents: [bridgeHalfW, deckTopY / 2, deckHalfLenZ],
      friction: 0.2,
    });
    // North approach ramp (Z < fountainZ, slopes up as Z increases toward fountainZ)
    list.push({
      id: `fountain-bridge-ramp-n-${idx}`,
      position: [worldBx, deckTopY / 2 - 0.05, fountainZ - deckHalfLenZ - rampRunZ / 2 + 0.2],
      halfExtents: [bridgeHalfW, 0.12, rampLength / 2],
      rotation: [rampAngle, 0, 0],
      friction: 0.3,
    });
    // South approach ramp (Z > fountainZ, slopes up as Z decreases toward fountainZ)
    list.push({
      id: `fountain-bridge-ramp-s-${idx}`,
      position: [worldBx, deckTopY / 2 - 0.05, fountainZ + deckHalfLenZ + rampRunZ / 2 - 0.2],
      halfExtents: [bridgeHalfW, 0.12, rampLength / 2],
      rotation: [-rampAngle, 0, 0],
      friction: 0.3,
    });
  });

  // 8. Amphitheater Hall (out-plaza-mvijfubr, ADR-029)
  const [amphX, amphZ] = AMPHITHEATER_HALL.center;
  const extRampRun = 3.0;
  const extRampRise = 1.35;
  const extRampAngle = Math.atan2(extRampRise, extRampRun);
  const extRampLength = Math.hypot(extRampRun, extRampRise);

  const intStairsRun = 2.4;
  const intStairsRise = 1.35;
  const intStairsAngle = Math.atan2(intStairsRise, intStairsRun);
  const intStairsLength = Math.hypot(intStairsRun, intStairsRise);

  // North solid wall
  list.push({
    id: 'amph-wall-north',
    position: [amphX, 3.6, amphZ - 8.35],
    halfExtents: [10.0, 3.6, 0.15],
  });

  // West panoramic curtain wall & double door entrance portal (2.8m wide opening at center)
  list.push({
    id: 'amph-wall-west-north',
    position: [amphX - 9.95, 3.6, amphZ - 4.95],
    halfExtents: [0.15, 3.6, 3.55],
  });
  list.push({
    id: 'amph-wall-west-south',
    position: [amphX - 9.95, 3.6, amphZ + 4.95],
    halfExtents: [0.15, 3.6, 3.55],
  });
  // West entrance portal lintel (clearance below from Y=1.35m to Y=4.20m = 2.85m open headroom)
  list.push({
    id: 'amph-wall-west-lintel',
    position: [amphX - 9.95, (4.2 + 7.2) / 2, amphZ],
    halfExtents: [0.15, (7.2 - 4.2) / 2, 1.4],
  });

  // Walkable exterior entrance ramp (slopes up from ground Y=0 at X=amphX-14.2 to landing Y=1.35 at X=amphX-11.2)
  list.push({
    id: 'amph-ramp-west-exterior',
    position: [amphX - 12.7, 0.635, amphZ],
    halfExtents: [extRampLength / 2, 0.1, 2.2],
    rotation: [0, 0, extRampAngle],
    friction: 0.3,
  });

  // Walkable exterior entrance landing (elevation Y=1.35m, X: amphX-11.2..amphX-9.9)
  list.push({
    id: 'amph-landing-west-exterior',
    position: [amphX - 10.55, 1.35 / 2, amphZ],
    halfExtents: [0.65, 1.35 / 2, 2.2],
    friction: 0.2,
  });

  // Flanking parapet cheek walls along the exterior entrance flight
  list.push({
    id: 'amph-parapet-west-north',
    position: [amphX - 12.7, 1.35 / 2 + 0.45, amphZ - 2.3],
    halfExtents: [1.5, 1.35 / 2 + 0.45, 0.1],
  });
  list.push({
    id: 'amph-parapet-west-south',
    position: [amphX - 12.7, 1.35 / 2 + 0.45, amphZ + 2.3],
    halfExtents: [1.5, 1.35 / 2 + 0.45, 0.1],
  });

  // Walkable interior West staircase ramp (slopes down from doorway Y=1.35 at X=amphX-10.0 to bowl Y=0 at X=amphX-7.6)
  list.push({
    id: 'amph-ramp-west-interior',
    position: [amphX - 8.8, 0.635, amphZ],
    halfExtents: [intStairsLength / 2, 0.1, 1.4],
    rotation: [0, 0, -intStairsAngle],
    friction: 0.2,
  });

  // Sunken octagonal floor bowl at Y=0 (±0.00m)
  list.push({
    id: 'amph-floor-bowl',
    position: [amphX, -0.05, amphZ],
    halfExtents: [7.6, 0.05, 6.1],
    friction: 0.2,
  });

  // Walkable interior East staircase ramp (slopes down from gallery Y=1.35 at X=amphX+10.0 to bowl Y=0 at X=amphX+7.6)
  list.push({
    id: 'amph-ramp-east-interior',
    position: [amphX + 8.8, 0.635, amphZ],
    halfExtents: [intStairsLength / 2, 0.1, 1.4],
    rotation: [0, 0, intStairsAngle],
    friction: 0.2,
  });

  // Walkable East gallery floor (elevation Y=1.35m, X: amphX+10.0..amphX+11.2)
  list.push({
    id: 'amph-floor-east-gallery',
    position: [amphX + 10.6, 1.35 / 2, amphZ],
    halfExtents: [0.6, 1.35 / 2, 4.0],
    friction: 0.2,
  });

  // East wall gallery (leaving 2.6m center entrance portal open)
  list.push({
    id: 'amph-wall-east-north',
    position: [amphX + 11.15, 3.6, amphZ - 3.65],
    halfExtents: [0.15, 3.6, 2.35],
  });
  list.push({
    id: 'amph-wall-east-south',
    position: [amphX + 11.15, 3.6, amphZ + 3.65],
    halfExtents: [0.15, 3.6, 2.35],
  });
  list.push({
    id: 'amph-wall-east-lintel',
    position: [amphX + 11.15, (4.2 + 7.2) / 2, amphZ],
    halfExtents: [0.15, (7.2 - 4.2) / 2, 1.3],
  });

  // Walkable interior South staircase ramp (slopes down from colonnade Y=1.35 at Z=amphZ+8.5 to bowl Y=0 at Z=amphZ+6.1)
  list.push({
    id: 'amph-ramp-south-interior',
    position: [amphX, 0.635, amphZ + 7.3],
    halfExtents: [1.4, 0.1, intStairsLength / 2],
    rotation: [-intStairsAngle, 0, 0],
    friction: 0.2,
  });

  // South colonnade floor landing at Y=1.35m
  list.push({
    id: 'amph-floor-south-landing',
    position: [amphX, 1.35 / 2, amphZ + 8.2],
    halfExtents: [6.0, 1.35 / 2, 0.3],
    friction: 0.2,
  });

  // South colonnade corner walls
  list.push({
    id: 'amph-wall-south-sw',
    position: [amphX - 8.5, 3.6, amphZ + 8.3],
    halfExtents: [1.5, 3.6, 0.2],
  });
  list.push({
    id: 'amph-wall-south-se',
    position: [amphX + 8.5, 3.6, amphZ + 8.3],
    halfExtents: [1.5, 3.6, 0.2],
  });
  // South glass rail (H=0.9m)
  list.push({
    id: 'amph-south-railing',
    position: [amphX, 1.8, amphZ + 8.1],
    halfExtents: [7.0, 0.45, 0.05],
  });

  // Stage podium
  list.push({
    id: 'amph-stage-podium',
    position: [amphX, 1.35 / 2, amphZ - 7.3],
    halfExtents: [3.2, 1.35 / 2, 1.2],
    friction: 0.2,
  });

  // Walkable amphitheater seating tiers
  // West Tiers (North & South flanks)
  [-3.75, 3.75].forEach((offsetZ, sIdx) => {
    const sideKey = sIdx === 0 ? 'n' : 's';
    list.push({
      id: `amph-tier-w1-${sideKey}`,
      position: [amphX - 8.0, 0.45 / 2, amphZ + offsetZ],
      halfExtents: [0.4, 0.45 / 2, 2.35],
      friction: 0.2,
    });
    list.push({
      id: `amph-tier-w2-${sideKey}`,
      position: [amphX - 8.8, 0.90 / 2, amphZ + offsetZ],
      halfExtents: [0.4, 0.90 / 2, 2.35],
      friction: 0.2,
    });
    list.push({
      id: `amph-tier-w3-${sideKey}`,
      position: [amphX - 9.6, 1.35 / 2, amphZ + offsetZ],
      halfExtents: [0.4, 1.35 / 2, 2.35],
      friction: 0.2,
    });
  });

  // East Tiers (North & South flanks)
  [-3.75, 3.75].forEach((offsetZ, sIdx) => {
    const sideKey = sIdx === 0 ? 'n' : 's';
    list.push({
      id: `amph-tier-e1-${sideKey}`,
      position: [amphX + 8.0, 0.45 / 2, amphZ + offsetZ],
      halfExtents: [0.4, 0.45 / 2, 2.35],
      friction: 0.2,
    });
    list.push({
      id: `amph-tier-e2-${sideKey}`,
      position: [amphX + 8.8, 0.90 / 2, amphZ + offsetZ],
      halfExtents: [0.4, 0.90 / 2, 2.35],
      friction: 0.2,
    });
    list.push({
      id: `amph-tier-e3-${sideKey}`,
      position: [amphX + 9.6, 1.35 / 2, amphZ + offsetZ],
      halfExtents: [0.4, 1.35 / 2, 2.35],
      friction: 0.2,
    });
  });

  // South Tiers (West & East flanks)
  [-4.5, 4.5].forEach((offsetX, sIdx) => {
    const sideKey = sIdx === 0 ? 'w' : 'e';
    list.push({
      id: `amph-tier-s1-${sideKey}`,
      position: [amphX + offsetX, 0.45 / 2, amphZ + 6.5],
      halfExtents: [3.1, 0.45 / 2, 0.4],
      friction: 0.2,
    });
    list.push({
      id: `amph-tier-s2-${sideKey}`,
      position: [amphX + offsetX, 0.90 / 2, amphZ + 7.3],
      halfExtents: [3.1, 0.90 / 2, 0.4],
      friction: 0.2,
    });
    list.push({
      id: `amph-tier-s3-${sideKey}`,
      position: [amphX + offsetX, 1.35 / 2, amphZ + 8.1],
      halfExtents: [3.1, 1.35 / 2, 0.4],
      friction: 0.2,
    });
  });

  return list;
}

export function buildTreeColliderSpecs(geometry: CampusGeometry): CylinderColliderSpec[] {
  const placements = computeTreePlacements(geometry);
  return placements.map((t, idx) => ({
    id: `tree-trunk-${idx}`,
    position: [t.pos.x, 1.2 * t.scale, t.pos.z],
    halfHeight: 1.2 * t.scale,
    radius: 0.32 * t.scale,
  }));
}

/**
 * Generates lightweight analytical CuboidColliders and CylinderColliders for the campus:
 * - Ground terrain plane
 * - All building footprints and wings (except enteredBuildingId when inspecting interiors)
 * - Inter-building enclosed connectors
 * - Perimeter fence, Main Entrance checkpoint structures, and outer gate boundary
 * - "I ♥ AJOU" landmark art object
 * - Grand Campus Fountain with 2 walkable pedestrian bridges and ramps
 * - Deterministic tree trunks
 */
export function CampusColliders({
  geometry,
  enteredBuildingId,
}: {
  geometry: CampusGeometry;
  enteredBuildingId?: string | null;
}) {
  const boxColliders = useMemo<BoxColliderSpec[]>(
    () => buildCampusColliderSpecs(geometry, enteredBuildingId),
    [geometry, enteredBuildingId],
  );
  const treeColliders = useMemo<CylinderColliderSpec[]>(
    () => buildTreeColliderSpecs(geometry),
    [geometry],
  );

  return (
    <RigidBody type="fixed" colliders={false} friction={0} restitution={0}>
      {boxColliders.map((c) => (
        <CuboidCollider
          key={c.id}
          position={c.position}
          rotation={c.rotation}
          args={c.halfExtents}
          friction={c.friction ?? 0}
          restitution={0}
        />
      ))}
      {treeColliders.map((t) => (
        <CylinderCollider
          key={t.id}
          position={t.position}
          args={[t.halfHeight, t.radius]}
          friction={0}
          restitution={0}
        />
      ))}
    </RigidBody>
  );
}
