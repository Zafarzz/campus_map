import { useMemo } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import { mapConfig } from '../../config/mapConfig';
import { getInteriorWoodTextures } from './materials/pbrMaterials';

export const CANTEEN_ROOM_ID = 'room-canteen';

export const CANTEEN_LAYOUT = {
  widthX: 19.0,
  heightY: 2.6,
  lengthZ: 27.2,
  worldPosition: [69.65, 1.55, 119.08] as const,
  worldSize: [19.0, 2.6, 27.2] as const,
} as const;

export type BlockCCanteenInterior3DProps = {
  /** World-space center of the canteen room box. */
  position: [number, number, number] | readonly [number, number, number];
  /** World-space size [widthX, heightY, lengthZ] of the canteen room box. */
  size: [number, number, number] | readonly [number, number, number];
  selected?: boolean;
};

/**
 * Merges an array of THREE.BufferGeometry objects into a single BufferGeometry.
 * Ensures high performance and minimal draw calls.
 */
function mergeCanteenGeometries(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];

  for (const g of geoms) {
    const nonIdx = g.index ? g.toNonIndexed() : g;
    const pos = nonIdx.getAttribute('position');
    const norm = nonIdx.getAttribute('normal');
    if (pos) {
      for (let i = 0; i < pos.count; i++) {
        positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        if (norm) {
          normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
        } else {
          normals.push(0, 1, 0);
        }
      }
    }
    if (nonIdx !== g) nonIdx.dispose();
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return merged;
}

/**
 * Builds a modern Scandinavian cafeteria chair geometry at [x, y, z] rotated by yaw.
 */
function createChairParts(
  x: number,
  y: number,
  z: number,
  yaw = 0
): { seat: THREE.BufferGeometry; legs: THREE.BufferGeometry } {
  // Molded shell seat + backrest
  const seatGeoms: THREE.BufferGeometry[] = [];
  const seatBottom = new THREE.BoxGeometry(0.42, 0.04, 0.4);
  seatBottom.translate(0, 0.44, 0);
  seatGeoms.push(seatBottom);

  const backrest = new THREE.BoxGeometry(0.4, 0.38, 0.04);
  backrest.translate(0, 0.65, -0.18);
  seatGeoms.push(backrest);

  const seatMerged = mergeCanteenGeometries(seatGeoms);
  seatMerged.rotateY(yaw);
  seatMerged.translate(x, y, z);

  // Metal splayed legs + cross braces
  const legGeoms: THREE.BufferGeometry[] = [];
  const legCoords = [
    [-0.17, -0.16],
    [0.17, -0.16],
    [-0.17, 0.16],
    [0.17, 0.16],
  ];
  for (const [lx, lz] of legCoords) {
    const leg = new THREE.CylinderGeometry(0.014, 0.012, 0.44, 6);
    leg.translate(lx, 0.22, lz);
    legGeoms.push(leg);
  }

  const legsMerged = mergeCanteenGeometries(legGeoms);
  legsMerged.rotateY(yaw);
  legsMerged.translate(x, y, z);

  return { seat: seatMerged, legs: legsMerged };
}

/**
 * Builds a modern high barstool geometry at [x, y, z].
 */
function createBarstoolParts(
  x: number,
  y: number,
  z: number
): { seat: THREE.BufferGeometry; metal: THREE.BufferGeometry } {
  const seat = new THREE.CylinderGeometry(0.18, 0.18, 0.05, 16);
  seat.translate(x, y + 0.75, z);

  const metalParts: THREE.BufferGeometry[] = [];
  const centralPole = new THREE.CylinderGeometry(0.025, 0.025, 0.72, 8);
  centralPole.translate(0, 0.36, 0);
  metalParts.push(centralPole);

  const baseDisc = new THREE.CylinderGeometry(0.22, 0.22, 0.02, 16);
  baseDisc.translate(0, 0.01, 0);
  metalParts.push(baseDisc);

  const footrestRing = new THREE.TorusGeometry(0.16, 0.012, 8, 16);
  footrestRing.rotateX(Math.PI / 2);
  footrestRing.translate(0, 0.28, 0);
  metalParts.push(footrestRing);

  const metalMerged = mergeCanteenGeometries(metalParts);
  metalMerged.translate(x, y, z);

  return { seat, metal: metalMerged };
}

/**
 * 3D Architectural Canteen & Dining Hall Interior (Block C, Floor 1 South Wing).
 * Sized accurately to 19.0m x 2.6m x 27.2m directly from the campus ground-floor CAD plan.
 */
export function BlockCCanteenInterior3D({
  position,
  size,
  selected = false,
}: BlockCCanteenInterior3DProps) {
  const [widthX, heightY, lengthZ] = size;
  const woodPbr = useMemo(() => getInteriorWoodTextures(6, 8), []);

  const floorY = -heightY / 2;
  const ceilingY = heightY / 2;
  const halfW = widthX / 2;
  const halfL = lengthZ / 2;

  // Materials palette
  const materials = useMemo(() => {
    return {
      floorTile: new THREE.MeshStandardMaterial({
        color: '#e8e4dc',
        roughness: 0.28,
        metalness: 0.05,
      }),
      floorWood: new THREE.MeshStandardMaterial({
        color: '#b58450',
        map: woodPbr?.map ?? null,
        roughnessMap: woodPbr?.roughnessMap ?? null,
        roughness: 0.45,
        metalness: 0.05,
      }),
      wallPlaster: new THREE.MeshStandardMaterial({
        color: '#f8fafc',
        roughness: 0.85,
      }),
      counterBase: new THREE.MeshStandardMaterial({
        color: '#475569',
        roughness: 0.6,
      }),
      countertopDark: new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.3,
        metalness: 0.2,
      }),
      stainlessSteel: new THREE.MeshStandardMaterial({
        color: '#e2e8f0',
        roughness: 0.2,
        metalness: 0.9,
      }),
      glassSneeze: new THREE.MeshStandardMaterial({
        color: '#bfdbfe',
        transparent: true,
        opacity: 0.42,
        roughness: 0.1,
        metalness: 0.1,
      }),
      hotFood: new THREE.MeshStandardMaterial({
        color: '#d97706',
        emissive: '#b45309',
        emissiveIntensity: 0.35,
        roughness: 0.4,
      }),
      saladGreens: new THREE.MeshStandardMaterial({
        color: '#16a34a',
        roughness: 0.6,
      }),
      tableOak: new THREE.MeshStandardMaterial({
        color: '#c89658',
        map: woodPbr?.map ?? null,
        roughnessMap: woodPbr?.roughnessMap ?? null,
        roughness: 0.38,
      }),
      metalBlack: new THREE.MeshStandardMaterial({
        color: '#1e232a',
        roughness: 0.5,
        metalness: 0.65,
      }),
      chairNavy: new THREE.MeshStandardMaterial({
        color: '#1e3a8a',
        roughness: 0.45,
      }),
      chairMustard: new THREE.MeshStandardMaterial({
        color: '#d97706',
        roughness: 0.45,
      }),
      chairSage: new THREE.MeshStandardMaterial({
        color: '#047857',
        roughness: 0.45,
      }),
      chairTerracotta: new THREE.MeshStandardMaterial({
        color: '#c2410c',
        roughness: 0.45,
      }),
      boothLeather: new THREE.MeshStandardMaterial({
        color: '#854d0e',
        roughness: 0.55,
      }),
      traysCrimson: new THREE.MeshStandardMaterial({
        color: '#b91c1c',
        roughness: 0.4,
      }),
      menuScreen: new THREE.MeshStandardMaterial({
        color: '#090d16',
        emissive: '#1d4ed8',
        emissiveIntensity: 0.55,
        roughness: 0.2,
      }),
      lampWarm: new THREE.MeshStandardMaterial({
        color: '#fef08a',
        emissive: '#f59e0b',
        emissiveIntensity: 0.85,
        roughness: 0.2,
      }),
      planterWood: new THREE.MeshStandardMaterial({
        color: '#5c3818',
        roughness: 0.7,
      }),
      plantsFoliage: new THREE.MeshStandardMaterial({
        color: '#15803d',
        roughness: 0.55,
      }),
    };
  }, [woodPbr]);

  // Pre-merge all canteen elements into optimized single meshes
  const mergedGeometries = useMemo(() => {
    const wallParts: THREE.BufferGeometry[] = [];
    const tableOakParts: THREE.BufferGeometry[] = [];
    const metalBlackParts: THREE.BufferGeometry[] = [];
    const chairNavyParts: THREE.BufferGeometry[] = [];
    const chairMustardParts: THREE.BufferGeometry[] = [];
    const chairSageParts: THREE.BufferGeometry[] = [];
    const chairTerracottaParts: THREE.BufferGeometry[] = [];
    const boothLeatherParts: THREE.BufferGeometry[] = [];
    const stainlessParts: THREE.BufferGeometry[] = [];
    const counterBaseParts: THREE.BufferGeometry[] = [];
    const countertopParts: THREE.BufferGeometry[] = [];
    const glassParts: THREE.BufferGeometry[] = [];
    const hotFoodParts: THREE.BufferGeometry[] = [];
    const saladParts: THREE.BufferGeometry[] = [];
    const traysParts: THREE.BufferGeometry[] = [];
    const menuScreenParts: THREE.BufferGeometry[] = [];
    const lampWarmParts: THREE.BufferGeometry[] = [];
    const planterWoodParts: THREE.BufferGeometry[] = [];
    const foliageParts: THREE.BufferGeometry[] = [];

    // ========================================================
    // 1. DIVIDING WALL (North wall separating Canteen from Room 5 & WC)
    // ========================================================
    const wallThick = 0.22;
    const northWall = new THREE.BoxGeometry(widthX, heightY, wallThick);
    northWall.translate(0, 0, -halfL + wallThick / 2);
    wallParts.push(northWall);

    // ========================================================
    // 2. FLOOR ACCENT ZONES
    // ========================================================
    const woodFloorGeo = new THREE.BoxGeometry(6.6, 0.02, 9.0);
    woodFloorGeo.translate(-5.0, floorY + 0.015, 7.5);

    // ========================================================
    // 3. FOOD SERVERY COUNTER LINE (West side: X = -5.2, Z: -11.0 to +1.5)
    // ========================================================
    const serveryLen = 12.5;
    const serveryCenterZ = -4.5;
    const serveryWidth = 1.25;
    const serveryHeight = 0.9;
    const serveryX = -5.2;

    // Counter base
    const serveryBase = new THREE.BoxGeometry(serveryWidth, serveryHeight, serveryLen);
    serveryBase.translate(serveryX, floorY + serveryHeight / 2, serveryCenterZ);
    counterBaseParts.push(serveryBase);

    // Granite top with recessed inserts
    const serveryTop = new THREE.BoxGeometry(serveryWidth + 0.06, 0.06, serveryLen + 0.06);
    serveryTop.translate(serveryX, floorY + serveryHeight + 0.03, serveryCenterZ);
    countertopParts.push(serveryTop);

    // Tray slide rails (twin stainless pipes in front of counter)
    for (const railY of [0.78, 0.85]) {
      const rail = new THREE.CylinderGeometry(0.016, 0.016, serveryLen + 0.4, 8);
      rail.rotateX(Math.PI / 2);
      rail.translate(serveryX + serveryWidth / 2 + 0.22, floorY + railY, serveryCenterZ);
      stainlessParts.push(rail);
    }
    // Rail support brackets
    for (let rz = -9.5; rz <= 1.0; rz += 2.0) {
      const bracket = new THREE.BoxGeometry(0.24, 0.04, 0.04);
      bracket.translate(serveryX + serveryWidth / 2 + 0.12, floorY + 0.81, rz);
      stainlessParts.push(bracket);
    }

    // Bain-Marie Hot Food Wells
    for (let i = 0; i < 3; i++) {
      const wellZ = -9.0 + i * 1.5;
      const wellFrame = new THREE.BoxGeometry(0.7, 0.08, 0.95);
      wellFrame.translate(serveryX, floorY + serveryHeight + 0.05, wellZ);
      stainlessParts.push(wellFrame);

      const foodInsert = new THREE.BoxGeometry(0.62, 0.04, 0.85);
      foodInsert.translate(serveryX, floorY + serveryHeight + 0.08, wellZ);
      hotFoodParts.push(foodInsert);

      // Round stainless soup kettle on the side
      const soupKettle = new THREE.CylinderGeometry(0.18, 0.16, 0.28, 12);
      soupKettle.translate(serveryX - 0.2, floorY + serveryHeight + 0.18, wellZ + 0.55);
      stainlessParts.push(soupKettle);
    }

    // Cold Salad Bar & Fresh Fruits
    for (let i = 0; i < 2; i++) {
      const saladZ = -4.0 + i * 1.6;
      const saladWell = new THREE.BoxGeometry(0.7, 0.08, 1.1);
      saladWell.translate(serveryX, floorY + serveryHeight + 0.05, saladZ);
      stainlessParts.push(saladWell);

      const saladFood = new THREE.BoxGeometry(0.62, 0.05, 0.98);
      saladFood.translate(serveryX, floorY + serveryHeight + 0.08, saladZ);
      saladParts.push(saladFood);
    }

    // Glass Sneeze Guard
    const sneezeGuardLen = 9.5;
    const sneezeGuardZ = -5.0;
    const glassPane = new THREE.BoxGeometry(0.02, 0.45, sneezeGuardLen);
    glassPane.rotateZ(0.2);
    glassPane.translate(serveryX + serveryWidth / 2 + 0.02, floorY + serveryHeight + 0.32, sneezeGuardZ);
    glassParts.push(glassPane);

    // Tray Cart & Stacks at start of servery
    for (let t = 0; t < 12; t++) {
      const tray = new THREE.BoxGeometry(0.48, 0.016, 0.36);
      tray.translate(serveryX, floorY + serveryHeight + 0.05 + t * 0.02, -10.5);
      traysParts.push(tray);
    }

    // Digital Menu Screens suspended above servery
    for (let m = 0; m < 3; m++) {
      const menuZ = -8.0 + m * 3.2;
      const screen = new THREE.BoxGeometry(0.04, 0.65, 1.4);
      screen.rotateZ(-0.25);
      screen.translate(serveryX + 0.1, floorY + 2.15, menuZ);
      menuScreenParts.push(screen);

      for (const offset of [-0.5, 0.5]) {
        const rod = new THREE.CylinderGeometry(0.008, 0.008, ceilingY - (floorY + 2.25), 6);
        rod.translate(serveryX + 0.1, (ceilingY + floorY + 2.25) / 2, menuZ + offset);
        metalBlackParts.push(rod);
      }
    }

    // ========================================================
    // 4. CASHIER CHECKOUT STATIONS (Z = +2.4 and Z = +4.4)
    // ========================================================
    for (const cz of [2.4, 4.4]) {
      const cashDesk = new THREE.BoxGeometry(1.4, 0.9, 0.8);
      cashDesk.translate(serveryX, floorY + 0.45, cz);
      counterBaseParts.push(cashDesk);

      const cashTop = new THREE.BoxGeometry(1.46, 0.05, 0.86);
      cashTop.translate(serveryX, floorY + 0.92, cz);
      countertopParts.push(cashTop);

      const posBase = new THREE.CylinderGeometry(0.03, 0.04, 0.18, 8);
      posBase.translate(serveryX + 0.2, floorY + 1.02, cz);
      metalBlackParts.push(posBase);

      const posScreen = new THREE.BoxGeometry(0.03, 0.24, 0.32);
      posScreen.rotateZ(0.3);
      posScreen.translate(serveryX + 0.2, floorY + 1.18, cz);
      menuScreenParts.push(posScreen);

      const cStool = createBarstoolParts(serveryX - 0.4, floorY, cz);
      tableOakParts.push(cStool.seat);
      metalBlackParts.push(cStool.metal);
    }

    // ========================================================
    // 5. BEVERAGE & ESPRESSO BAR ISLAND (X = -5.2, Z = +7.0)
    // ========================================================
    const bevX = -5.2;
    const bevZ = 7.0;
    const bevCounter = new THREE.BoxGeometry(1.3, 0.9, 2.4);
    bevCounter.translate(bevX, floorY + 0.45, bevZ);
    counterBaseParts.push(bevCounter);

    const bevTop = new THREE.BoxGeometry(1.36, 0.05, 2.46);
    bevTop.translate(bevX, floorY + 0.92, bevZ);
    countertopParts.push(bevTop);

    const sodaMachine = new THREE.BoxGeometry(0.65, 0.72, 0.8);
    sodaMachine.translate(bevX, floorY + 1.3, bevZ - 0.55);
    stainlessParts.push(sodaMachine);

    const coffeeMachine = new THREE.BoxGeometry(0.58, 0.48, 0.7);
    coffeeMachine.translate(bevX, floorY + 1.18, bevZ + 0.55);
    stainlessParts.push(coffeeMachine);

    // ========================================================
    // 6. PANORAMIC WINDOW BAR COUNTER (East Wall: X = halfW - 0.5)
    // ========================================================
    const winBarX = halfW - 0.5;
    const winBarLen = lengthZ - 3.0;
    const winBarDepth = 0.6;
    const winBarHeight = 1.05;

    const winBarTop = new THREE.BoxGeometry(winBarDepth, 0.06, winBarLen);
    winBarTop.translate(winBarX, floorY + winBarHeight, 0);
    tableOakParts.push(winBarTop);

    for (let bz = -10.0; bz <= 10.0; bz += 3.0) {
      const leg = new THREE.BoxGeometry(0.05, winBarHeight, 0.05);
      leg.translate(winBarX - winBarDepth / 2 + 0.05, floorY + winBarHeight / 2, bz);
      metalBlackParts.push(leg);
    }

    for (let sz = -10.5; sz <= 10.5; sz += 1.8) {
      const stool = createBarstoolParts(winBarX - 0.65, floorY, sz);
      tableOakParts.push(stool.seat);
      metalBlackParts.push(stool.metal);
    }

    // ========================================================
    // 7. CENTRAL DINING TABLES & CHAIRS
    // ========================================================
    const chairPalettes = [
      chairNavyParts,
      chairMustardParts,
      chairSageParts,
      chairTerracottaParts,
    ];
    let paletteIdx = 0;

    // Square 4-seater tables (9 tables)
    const squareTableLayouts: [number, number][] = [
      [-0.8, -9.5],
      [2.2, -9.5],
      [5.2, -9.5],
      [-0.8, -6.0],
      [2.2, -6.0],
      [5.2, -6.0],
      [-0.8, -2.5],
      [2.2, -2.5],
      [5.2, -2.5],
    ];

    for (const [tx, tz] of squareTableLayouts) {
      const top = new THREE.BoxGeometry(0.95, 0.04, 0.95);
      top.translate(tx, floorY + 0.74, tz);
      tableOakParts.push(top);

      const leg = new THREE.CylinderGeometry(0.04, 0.04, 0.72, 8);
      leg.translate(tx, floorY + 0.36, tz);
      metalBlackParts.push(leg);

      const basePlate = new THREE.CylinderGeometry(0.28, 0.28, 0.02, 12);
      basePlate.translate(tx, floorY + 0.01, tz);
      metalBlackParts.push(basePlate);

      const curPalette = chairPalettes[paletteIdx % chairPalettes.length];
      paletteIdx++;

      const cNorth = createChairParts(tx, floorY, tz - 0.68, 0);
      curPalette.push(cNorth.seat);
      metalBlackParts.push(cNorth.legs);

      const cSouth = createChairParts(tx, floorY, tz + 0.68, Math.PI);
      curPalette.push(cSouth.seat);
      metalBlackParts.push(cSouth.legs);

      const cWest = createChairParts(tx - 0.68, floorY, tz, Math.PI / 2);
      curPalette.push(cWest.seat);
      metalBlackParts.push(cWest.legs);

      const cEast = createChairParts(tx + 0.68, floorY, tz, -Math.PI / 2);
      curPalette.push(cEast.seat);
      metalBlackParts.push(cEast.legs);

      const dome = new THREE.ConeGeometry(0.24, 0.16, 16, 1, true);
      dome.translate(tx, floorY + 2.05, tz);
      metalBlackParts.push(dome);

      const bulb = new THREE.SphereGeometry(0.06, 8, 8);
      bulb.translate(tx, floorY + 2.0, tz);
      lampWarmParts.push(bulb);

      const cord = new THREE.CylinderGeometry(0.005, 0.005, ceilingY - (floorY + 2.1), 4);
      cord.translate(tx, (ceilingY + floorY + 2.1) / 2, tz);
      metalBlackParts.push(cord);
    }

    // Rectangular 6-seater tables (6 tables)
    const rectTableLayouts: [number, number][] = [
      [0.2, 1.5],
      [3.8, 1.5],
      [0.2, 5.2],
      [3.8, 5.2],
      [0.2, 8.8],
      [3.8, 8.8],
    ];

    for (const [tx, tz] of rectTableLayouts) {
      const top = new THREE.BoxGeometry(0.85, 0.04, 1.65);
      top.translate(tx, floorY + 0.74, tz);
      tableOakParts.push(top);

      for (const dz of [-0.45, 0.45]) {
        const leg = new THREE.CylinderGeometry(0.04, 0.04, 0.72, 8);
        leg.translate(tx, floorY + 0.36, tz + dz);
        metalBlackParts.push(leg);

        const base = new THREE.CylinderGeometry(0.24, 0.24, 0.02, 10);
        base.translate(tx, floorY + 0.01, tz + dz);
        metalBlackParts.push(base);
      }

      const curPalette = chairPalettes[paletteIdx % chairPalettes.length];
      paletteIdx++;

      for (const cz of [tz - 0.52, tz, tz + 0.52]) {
        const cWest = createChairParts(tx - 0.62, floorY, cz, Math.PI / 2);
        curPalette.push(cWest.seat);
        metalBlackParts.push(cWest.legs);

        const cEast = createChairParts(tx + 0.62, floorY, cz, -Math.PI / 2);
        curPalette.push(cEast.seat);
        metalBlackParts.push(cEast.legs);
      }
    }

    // ========================================================
    // 8. BOOTH SEATING ALONG WEST WALL (Z = 5.0, 7.8, 10.6)
    // ========================================================
    for (let b = 0; b < 3; b++) {
      const bz = 5.0 + b * 2.8;
      const seat1 = new THREE.BoxGeometry(1.6, 0.44, 0.48);
      seat1.translate(-5.4, floorY + 0.22, bz - 0.85);
      boothLeatherParts.push(seat1);

      const back1 = new THREE.BoxGeometry(1.6, 0.75, 0.12);
      back1.translate(-5.4, floorY + 0.72, bz - 1.05);
      boothLeatherParts.push(back1);

      const seat2 = new THREE.BoxGeometry(1.6, 0.44, 0.48);
      seat2.translate(-5.4, floorY + 0.22, bz + 0.85);
      boothLeatherParts.push(seat2);

      const back2 = new THREE.BoxGeometry(1.6, 0.75, 0.12);
      back2.translate(-5.4, floorY + 0.72, bz + 1.05);
      boothLeatherParts.push(back2);

      const bTable = new THREE.BoxGeometry(1.4, 0.05, 0.85);
      bTable.translate(-5.4, floorY + 0.74, bz);
      tableOakParts.push(bTable);
    }

    // ========================================================
    // 9. PLANTERS & TRAY RETURN STATION
    // ========================================================
    const planterPositions: [number, number, number][] = [
      [-2.4, -8.0, Math.PI / 2],
      [-2.4, -4.0, Math.PI / 2],
      [-2.4, 0.0, Math.PI / 2],
      [-2.4, 4.0, Math.PI / 2],
      [-2.4, 8.0, Math.PI / 2],
    ];

    for (const [px, pz, pRot] of planterPositions) {
      const box = new THREE.BoxGeometry(0.42, 0.65, 1.8);
      box.rotateY(pRot);
      box.translate(px, floorY + 0.325, pz);
      planterWoodParts.push(box);

      const soil = new THREE.BoxGeometry(0.36, 0.04, 1.74);
      soil.rotateY(pRot);
      soil.translate(px, floorY + 0.63, pz);
      metalBlackParts.push(soil);

      for (let f = 0; f < 5; f++) {
        const fOffset = (f - 2) * 0.35;
        const bush = new THREE.DodecahedronGeometry(0.24, 1);
        bush.scale(1.0, 1.3, 0.9);
        if (pRot !== 0) bush.rotateY(pRot);
        bush.translate(
          px + (pRot !== 0 ? fOffset : 0),
          floorY + 0.88,
          pz + (pRot === 0 ? fOffset : 0)
        );
        foliageParts.push(bush);
      }
    }

    // Tray return station
    const retX = -halfW + 1.5;
    const retZ = halfL - 1.2;
    const retStation = new THREE.BoxGeometry(2.4, 1.8, 0.9);
    retStation.translate(retX, floorY + 0.9, retZ);
    stainlessParts.push(retStation);

    for (const sy of [0.4, 0.8, 1.2, 1.5]) {
      const slotShelf = new THREE.BoxGeometry(2.2, 0.03, 0.85);
      slotShelf.translate(retX, floorY + sy, retZ);
      stainlessParts.push(slotShelf);
    }

    return {
      wall: mergeCanteenGeometries(wallParts),
      tableOak: mergeCanteenGeometries(tableOakParts),
      metalBlack: mergeCanteenGeometries(metalBlackParts),
      chairNavy: mergeCanteenGeometries(chairNavyParts),
      chairMustard: mergeCanteenGeometries(chairMustardParts),
      chairSage: mergeCanteenGeometries(chairSageParts),
      chairTerracotta: mergeCanteenGeometries(chairTerracottaParts),
      boothLeather: mergeCanteenGeometries(boothLeatherParts),
      stainless: mergeCanteenGeometries(stainlessParts),
      counterBase: mergeCanteenGeometries(counterBaseParts),
      countertop: mergeCanteenGeometries(countertopParts),
      glass: mergeCanteenGeometries(glassParts),
      hotFood: mergeCanteenGeometries(hotFoodParts),
      salad: mergeCanteenGeometries(saladParts),
      trays: mergeCanteenGeometries(traysParts),
      menuScreen: mergeCanteenGeometries(menuScreenParts),
      lampWarm: mergeCanteenGeometries(lampWarmParts),
      planterWood: mergeCanteenGeometries(planterWoodParts),
      foliage: mergeCanteenGeometries(foliageParts),
      woodFloor: woodFloorGeo,
    };
  }, [widthX, heightY, lengthZ, floorY, ceilingY, halfW, halfL]);

  return (
    <group position={position}>
      {/* 1. Main Terrazzo / Tile Floor Slab */}
      <mesh position={[0, floorY + 0.01, 0]}>
        <boxGeometry args={[widthX - 0.04, 0.02, lengthZ - 0.04]} />
        <primitive object={materials.floorTile} attach="material" />
      </mesh>

      {/* 2. Parquet Wood Floor Inset for Booth Dining Zone */}
      <mesh geometry={mergedGeometries.woodFloor}>
        <primitive object={materials.floorWood} attach="material" />
      </mesh>

      {/* 3. Dividing Wall separating Canteen from Room 5 and Restrooms */}
      <mesh geometry={mergedGeometries.wall}>
        <primitive object={materials.wallPlaster} attach="material" />
      </mesh>

      {/* 4. Pre-merged Architectural Furniture & Servery Meshes */}
      <mesh geometry={mergedGeometries.counterBase}>
        <primitive object={materials.counterBase} attach="material" />
      </mesh>

      <mesh geometry={mergedGeometries.countertop}>
        <primitive object={materials.countertopDark} attach="material" />
      </mesh>

      <mesh geometry={mergedGeometries.stainless}>
        <primitive object={materials.stainlessSteel} attach="material" />
      </mesh>

      <mesh geometry={mergedGeometries.glass}>
        <primitive object={materials.glassSneeze} attach="material" />
      </mesh>

      <mesh geometry={mergedGeometries.hotFood}>
        <primitive object={materials.hotFood} attach="material" />
      </mesh>

      <mesh geometry={mergedGeometries.salad}>
        <primitive object={materials.saladGreens} attach="material" />
      </mesh>

      <mesh geometry={mergedGeometries.trays}>
        <primitive object={materials.traysCrimson} attach="material" />
      </mesh>

      <mesh geometry={mergedGeometries.menuScreen}>
        <primitive object={materials.menuScreen} attach="material" />
      </mesh>

      <mesh geometry={mergedGeometries.lampWarm}>
        <primitive object={materials.lampWarm} attach="material" />
      </mesh>

      <mesh geometry={mergedGeometries.tableOak}>
        <primitive object={materials.tableOak} attach="material" />
      </mesh>

      <mesh geometry={mergedGeometries.metalBlack}>
        <primitive object={materials.metalBlack} attach="material" />
      </mesh>

      <mesh geometry={mergedGeometries.boothLeather}>
        <primitive object={materials.boothLeather} attach="material" />
      </mesh>

      <mesh geometry={mergedGeometries.chairNavy}>
        <primitive object={materials.chairNavy} attach="material" />
      </mesh>

      <mesh geometry={mergedGeometries.chairMustard}>
        <primitive object={materials.chairMustard} attach="material" />
      </mesh>

      <mesh geometry={mergedGeometries.chairSage}>
        <primitive object={materials.chairSage} attach="material" />
      </mesh>

      <mesh geometry={mergedGeometries.chairTerracotta}>
        <primitive object={materials.chairTerracotta} attach="material" />
      </mesh>

      <mesh geometry={mergedGeometries.planterWood}>
        <primitive object={materials.planterWood} attach="material" />
      </mesh>

      <mesh geometry={mergedGeometries.foliage}>
        <primitive object={materials.plantsFoliage} attach="material" />
      </mesh>

      {/* 5. Selection Highlight Framing */}
      {selected && (
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={size} />
          <meshBasicMaterial visible={false} />
          <Edges color={mapConfig.colors.roomSelected} lineWidth={3} />
        </mesh>
      )}
    </group>
  );
}
