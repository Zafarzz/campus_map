import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FountainWaterAnimation } from './fountain/FountainWaterAnimation';
import {
  disposeMergedMap,
  NO_RAYCAST,
  StaticGeometryBatcher,
} from './geometry/staticGeometryMerger';
import {
  applyAnimatedWaterShader,
  sharedWaterUniforms,
} from './shaders/architecturalShaders';

export const FOUNTAIN_DIMENSIONS = {
  // Габариты чаши бассейна, масштабированные в 1.5х по запросу пользователя (исходные 36х12 м)
  basinLength: 54.0, // 36 000 мм * 1.5 = 54 000 мм (зеркало воды вдоль оси Запад-Восток)
  basinWidth: 18.0, // 12 000 мм * 1.5 = 18 000 мм (ширина чаши вдоль оси Север-Юг)
  outerLength: 57.0, // 38 000 мм * 1.5 = 57 000 мм (внешний габарит с цоколем)
  outerWidth: 19.5, // 13 000 мм * 1.5 = 19 500 мм (внешняя ширина с бортами)
  parapetHeight: 0.55, // Борт из ДПК: H = 550 мм (+0.550 м)
  waterLevel: 0.45, // Уровень зеркала воды

  // Мостики (масштаб 1.5х, перекинуты поперек 18-метровой чаши)
  bridgeWalkwayWidth: 2.1, // 1400 мм * 1.5 = 2100 мм (ширина прохода)
  bridgePlatformWidth: 3.3, // 2200 мм * 1.5 = 3300 мм (смотровая площадка)
  bridgeDistance: 15.0, // 10 000 мм * 1.5 = 15 000 мм (расстояние между мостиками)
  bridgeDeckHeight: 0.75, // Высота настила мостика над землей
  bridgeArchHeight: 2.35, // Золотые арки мостиков (+2.35 м / +3.20 м)

  // Центральный ступенчатый каскад (масштаб 1.5х)
  cascadeLength: 15.0, // 10 000 мм * 1.5 = 15 000 мм
  cascadeWidth: 7.5, // 5000 мм * 1.5 = 7500 мм
  cascadeTopHeight: 2.35, // Верхняя терраса каскада (+2.35 м)
  autSculptureHeight: 3.2, // Вершина скульптуры AUT (+3.200 м)

  // Боковые круглые чаши (масштаб 1.5х)
  circularDiameter: 5.4, // Ø 3600 мм * 1.5 = Ø 5400 мм
  geyserJetHeight: 5.8, // Центральный гейзер бьет до +5.800 м

  // Пальмы
  palmTreeCount: 7,
  palmMinHeight: 3.5, // +3.5 м
  palmMaxHeight: 4.5, // +4.5 м

  // Дополнительный масштаб ансамбля (увеличен в 1.5х по запросу пользователя)
  defaultScale: 1.5,
  effectiveBasinLength: 81.0, // 54.0 * 1.5
  effectiveBasinWidth: 27.0, // 18.0 * 1.5
} as const;

export const FOUNTAIN_MATERIALS = {
  // ДПК (древесно-полимерный композит) для борта H=550 мм
  dpkBoard: '#2D251E', // Благородный орехово-терракотовый древесный композит
  dpkCap: '#1E1712', // Верхняя фасонная планка борта ДПК
  // Бассейн и чаша
  poolTile: '#0284c7', // Лазурная керамическая плитка дна и стенок
  poolWater: '#0ea5e9', // Зеркало воды
  // Ступенчатый каскад
  cascadeStone: '#C8C6BE', // Натуральный травертин / гранит ступеней
  cascadeWater: '#38bdf8', // Переливающаяся водная гладь каскада
  // Золотые акценты (Скульптура AUT и арки мостиков)
  goldAccent: '#BA6F27', // Полированное золото (RAL 1036)
  goldHighlight: '#E5A93C', // Золотые блики
  // Мостики
  bridgeDeck: '#3E2723', // Рифленый настил мостика
  bridgeRailing: '#1E2024', // Металлические перила с решеткой (RAL 9005)
  // Водные струи и гейзеры
  waterJet: '#E0F2FE', // Водные струи с легким свечением
  geyserFoam: '#F0F9FF', // Пенные центральные гейзеры
  // Пальмы
  palmTrunk: '#5D4037', // Кольчатый ствол пальмы
  palmFronds: '#15803D', // Ботанический зеленый веерных ветвей пальмы
  // Мощение площади
  plazaPaving: '#E2DFD7', // Мощение променада вокруг чаши
  plazaBorder: '#B5B2A8', // Бордюр площади
} as const;

/**
 * Точные векторные контуры двух переплетающихся элементов официальной эмблемы AUT
 * (Ajou University in Tashkent), извлеченные из брендбука и чертежа каскада (H = 0.85 м).
 */
const AUT_EMBLEM_POLY_0 = [
  [-0.113, 0.425],
  [-0.3934, 0.0136],
  [-0.416, -0.0452],
  [-0.416, -0.113],
  [-0.3934, -0.1718],
  [-0.2532, -0.3888],
  [-0.208, -0.425],
  [-0.0949, -0.4205],
  [-0.2713, -0.1537],
  [-0.2894, -0.0678],
  [-0.2713, -0.0136],
  [-0.113, 0.2215],
  [0.0769, -0.0678],
  [0.0723, -0.1085],
  [0.0271, -0.1221],
  [0.0814, -0.2035],
  [0.104, -0.2215],
  [0.1266, -0.217],
  [0.1944, -0.0995],
  [0.1763, -0.0181],
] as const;

const AUT_EMBLEM_POLY_1 = [
  [-0.0226, 0.425],
  [0.0949, 0.425],
  [0.1492, 0.3843],
  [0.4114, -0.0316],
  [0.416, -0.113],
  [0.3934, -0.1763],
  [0.2487, -0.3934],
  [0.208, -0.425],
  [0.0045, -0.416],
  [-0.1944, -0.104],
  [-0.1944, -0.0543],
  [-0.1402, 0.0407],
  [-0.1176, 0.0588],
  [-0.0949, 0.0543],
  [-0.0271, -0.0452],
  [-0.0497, -0.0407],
  [-0.0769, -0.0588],
  [-0.0769, -0.0995],
  [0.0543, -0.2984],
  [0.0859, -0.321],
  [0.1447, -0.321],
  [0.1809, -0.2894],
  [0.2848, -0.1085],
  [0.2894, -0.0633],
  [0.2622, 0.009],
] as const;

export type CampusFountainProps = {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  /** Whether to render decorative palms along fountain promenade (default: false per user request) */
  showPalms?: boolean;
};

function createPalmFrondGeometry(length = 2.6, maxWidth = 0.62, segments = 14): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  const positions: number[] = [];

  const pushTri = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
  ) => {
    positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  };

  const spineY = (t: number) => 0.28 * Math.sin(t * Math.PI * 0.78) - 0.68 * t * t;

  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const z0 = t0 * length;
    const z1 = t1 * length;
    const y0 = spineY(t0);
    const y1 = spineY(t1);
    const stemW0 = 0.032 * (1 - t0 * 0.75);
    const stemW1 = 0.032 * (1 - t1 * 0.75);

    pushTri(-stemW0, y0, z0, stemW0, y0, z0, stemW1, y1, z1);
    pushTri(-stemW0, y0, z0, stemW1, y1, z1, -stemW1, y1, z1);

    if (i >= 1) {
      const tMid = (t0 + t1) * 0.5;
      const env = Math.sin(Math.pow(tMid, 0.85) * Math.PI);
      const leafSpan = maxWidth * env;
      const tipForward = (z1 - z0) * 1.45;
      const tipZ = z0 + tipForward;
      const tipY = y0 - leafSpan * 0.34 - tMid * 0.08;
      const midZ = (z0 + tipZ) * 0.5;
      const midY = (y0 + tipY) * 0.5 + 0.035;

      pushTri(-stemW0 * 0.5, y0, z0, -leafSpan * 0.55, midY, midZ, -leafSpan, tipY, tipZ);
      pushTri(-stemW0 * 0.5, y0, z0, -leafSpan, tipY, tipZ, -stemW1 * 0.5, y1, z1);

      pushTri(stemW0 * 0.5, y0, z0, leafSpan, tipY, tipZ, leafSpan * 0.55, midY, midZ);
      pushTri(stemW0 * 0.5, y0, z0, stemW1 * 0.5, y1, z1, leafSpan, tipY, tipZ);
    }
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return geom;
}

function createMergedPalmCrownGeometry(): THREE.BufferGeometry {
  const upperGeo = createPalmFrondGeometry(2.1, 0.44, 6);
  const middleGeo = createPalmFrondGeometry(2.7, 0.58, 8);
  const lowerGeo = createPalmFrondGeometry(2.4, 0.50, 7);

  const mergedPositions: number[] = [];

  const addTransformedFrond = (geo: THREE.BufferGeometry, rotX: number, rotY: number) => {
    const pos = geo.getAttribute('position');
    const euler = new THREE.Euler(rotX, rotY, 0, 'YXZ');
    const matrix = new THREE.Matrix4().makeRotationFromEuler(euler);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      v.applyMatrix4(matrix);
      mergedPositions.push(v.x, v.y, v.z);
    }
  };

  for (let f = 0; f < 5; f++) {
    const fAngle = (f / 5) * Math.PI * 2;
    addTransformedFrond(upperGeo, 0.62, fAngle);
  }
  for (let f = 0; f < 8; f++) {
    const fAngle = (f / 8) * Math.PI * 2 + 0.35;
    addTransformedFrond(middleGeo, 0.22, fAngle);
  }
  for (let f = 0; f < 6; f++) {
    const fAngle = (f / 6) * Math.PI * 2 + 0.7;
    addTransformedFrond(lowerGeo, -0.45, fAngle);
  }

  upperGeo.dispose();
  middleGeo.dispose();
  lowerGeo.dispose();

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(mergedPositions, 3));
  merged.computeVertexNormals();
  return merged;
}

/**
 * 3D-модель Главного фонтана кампуса с двумя мостиками и каскадом.
 * Все ~130 статических мешей объединены по материалам в 11 батчей с NO_RAYCAST.
 */
export function CampusFountain({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = FOUNTAIN_DIMENSIONS.defaultScale,
  showPalms = false,
}: CampusFountainProps) {
  useFrame(({ clock }) => {
    sharedWaterUniforms.uTime.value = clock.getElapsedTime();
  });

  const materials = useMemo(() => {
    const dpkBoardMat = new THREE.MeshStandardMaterial({
      color: '#4e3829',
      roughness: 0.65,
      metalness: 0.0,
    });
    const dpkCapMat = new THREE.MeshStandardMaterial({
      color: '#3b281c',
      roughness: 0.5,
      metalness: 0.0,
    });
    const poolTileMat = new THREE.MeshStandardMaterial({
      color: FOUNTAIN_MATERIALS.poolTile,
      roughness: 0.28,
      metalness: 0.0,
    });
    const poolWaterMat = applyAnimatedWaterShader(
      new THREE.MeshStandardMaterial({
        color: FOUNTAIN_MATERIALS.poolWater,
        roughness: 0.06,
        metalness: 0.1,
        envMapIntensity: 1.5,
        transparent: true,
        opacity: 0.88,
      }),
      false,
    );
    const cascadeStoneMat = new THREE.MeshStandardMaterial({
      color: FOUNTAIN_MATERIALS.cascadeStone,
      roughness: 0.78,
      metalness: 0.0,
    });
    const cascadeWaterMat = applyAnimatedWaterShader(
      new THREE.MeshStandardMaterial({
        color: FOUNTAIN_MATERIALS.cascadeWater,
        roughness: 0.08,
        metalness: 0.12,
        envMapIntensity: 1.5,
        transparent: true,
        opacity: 0.85,
      }),
      true,
    );
    const goldMat = new THREE.MeshStandardMaterial({
      color: FOUNTAIN_MATERIALS.goldAccent,
      roughness: 0.18,
      metalness: 0.85,
      emissive: '#B45309',
      emissiveIntensity: 0.2,
    });
    const bridgeDeckMat = new THREE.MeshStandardMaterial({
      color: '#4A3228',
      roughness: 0.6,
      metalness: 0.08,
    });
    const bridgeRailingMat = new THREE.MeshStandardMaterial({
      color: FOUNTAIN_MATERIALS.bridgeRailing,
      roughness: 0.5,
      metalness: 0.5,
    });
    const waterJetMat = new THREE.MeshStandardMaterial({
      color: FOUNTAIN_MATERIALS.waterJet,
      emissive: FOUNTAIN_MATERIALS.waterJet,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.7,
      roughness: 0.1,
    });
    const geyserMat = new THREE.MeshStandardMaterial({
      color: FOUNTAIN_MATERIALS.geyserFoam,
      emissive: FOUNTAIN_MATERIALS.geyserFoam,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.8,
      roughness: 0.2,
    });
    const palmTrunkMat = new THREE.MeshStandardMaterial({
      color: '#694b3c',
      roughness: 0.88,
    });
    const palmFrondMat = new THREE.MeshStandardMaterial({
      color: '#2e6f34',
      roughness: 0.55,
      side: THREE.DoubleSide,
    });
    const palmBarkRingMat = new THREE.MeshStandardMaterial({
      color: '#4a3326',
      roughness: 0.92,
    });
    const palmCrownShaftMat = new THREE.MeshStandardMaterial({
      color: '#345e2e',
      roughness: 0.65,
    });
    const plazaMat = new THREE.MeshStandardMaterial({
      color: FOUNTAIN_MATERIALS.plazaPaving,
      roughness: 0.8,
    });
    const plazaBorderMat = new THREE.MeshStandardMaterial({
      color: FOUNTAIN_MATERIALS.plazaBorder,
      roughness: 0.85,
    });

    return {
      dpkBoardMat,
      dpkCapMat,
      poolTileMat,
      poolWaterMat,
      cascadeStoneMat,
      cascadeWaterMat,
      goldMat,
      bridgeDeckMat,
      bridgeRailingMat,
      waterJetMat,
      geyserMat,
      palmTrunkMat,
      palmFrondMat,
      palmBarkRingMat,
      palmCrownShaftMat,
      plazaMat,
      plazaBorderMat,
    };
  }, []);

  const merged = useMemo(() => {
    const batcher = new StaticGeometryBatcher();
    const d = FOUNTAIN_DIMENSIONS;

    // 1. Окружающая площадь-променада
    batcher.addBox('plaza', [d.outerLength + 6.0, 0.04, d.outerWidth + 6.0], [0, 0.02, 0]);
    batcher.addBox('plazaBorder', [d.outerLength + 6.3, 0.02, d.outerWidth + 6.3], [0, 0.03, 0]);

    // 2. Главная чаша 54x18 м и борт из ДПК
    batcher.addBox('poolTile', [d.basinLength, 0.06, d.basinWidth], [0, 0.05, 0]);
    batcher.addBox('poolWater', [d.basinLength - 0.1, 0.02, d.basinWidth - 0.1], [0, d.waterLevel, 0]);

    for (const sideZ of [-d.basinWidth / 2 - 0.35, d.basinWidth / 2 + 0.35]) {
      batcher.addBox('dpkBoard', [d.outerLength, d.parapetHeight, 0.7], [0, d.parapetHeight / 2, sideZ]);
      batcher.addBox('dpkCap', [d.outerLength + 0.06, 0.04, 0.76], [0, d.parapetHeight + 0.02, sideZ]);
    }
    for (const sideX of [-d.basinLength / 2 - 0.35, d.basinLength / 2 + 0.35]) {
      batcher.addBox('dpkBoard', [0.7, d.parapetHeight, d.basinWidth], [sideX, d.parapetHeight / 2, 0]);
      batcher.addBox('dpkCap', [0.76, 0.04, d.basinWidth], [sideX, d.parapetHeight + 0.02, 0]);
    }

    // 3. Два пешеходных мостика с золотыми арками
    const bridgeX = [
      -(d.bridgeDistance / 2 + d.bridgeWalkwayWidth / 2),
      +(d.bridgeDistance / 2 + d.bridgeWalkwayWidth / 2),
    ];
    for (const bx of bridgeX) {
      batcher.addBox('bridgeDeck', [d.bridgeWalkwayWidth, 0.14, d.basinWidth + 1.2], [bx, d.bridgeDeckHeight, 0]);
      batcher.addBox('bridgeDeck', [d.bridgePlatformWidth, 0.14, 4.8], [bx, d.bridgeDeckHeight + 0.01, 0]);

      // Северные ступени
      const nz = -d.basinWidth / 2 - 0.9;
      batcher.addBox('bridgeDeck', [d.bridgeWalkwayWidth, 0.5, 0.5], [bx, 0.25, nz]);
      batcher.addBox('bridgeDeck', [d.bridgeWalkwayWidth, 0.25, 0.4], [bx, 0.12, nz - 0.35]);

      // Южные ступени
      const sz = d.basinWidth / 2 + 0.9;
      batcher.addBox('bridgeDeck', [d.bridgeWalkwayWidth, 0.5, 0.5], [bx, 0.25, sz]);
      batcher.addBox('bridgeDeck', [d.bridgeWalkwayWidth, 0.25, 0.4], [bx, 0.12, sz + 0.35]);

      // Перила мостика
      for (const side of [-1, 1]) {
        const rx = bx + side * (d.bridgeWalkwayWidth / 2);
        batcher.addBox('bridgeRailing', [0.04, 0.04, d.basinWidth + 1.2], [rx, d.bridgeDeckHeight + 0.95, 0]);
        for (const rz of [-7.5, -5.5, -3.5, 3.5, 5.5, 7.5]) {
          batcher.addCylinder('bridgeRailing', [0.025, 0.025, 0.95, 8], [rx, d.bridgeDeckHeight + 0.48, rz]);
        }
      }


    }

    // 4. Центральный ступенчатый каскад со скульптурой AUT
    batcher.addBox('cascadeStone', [14.4, 0.6, 7.2], [0, 0.35, 0]);
    batcher.addBox('cascadeStone', [12.3, 0.5, 6.0], [0, 0.8, 0]);
    batcher.addBox('cascadeStone', [10.2, 0.5, 4.8], [0, 1.25, 0]);
    batcher.addBox('cascadeStone', [8.1, 0.5, 3.6], [0, 1.7, 0]);
    batcher.addBox('cascadeStone', [6.0, 0.4, 2.5], [0, 2.15, 0]);
    batcher.addBox('cascadeWater', [5.7, 0.04, 2.2], [0, 2.36, 0]);

    for (const wz of [-3.0, 3.0]) {
      batcher.addBox('waterJet', [9.0, 1.8, 0.08], [0, 1.1, wz]);
    }

    // Постамент и золотая эмблема AUT (отметка 2.37 + 0.47 = 2.84)
    batcher.addBox('cascadeStone', [1.05, 0.06, 0.32], [0, 2.4, 0]);

    const createShape = (pts: readonly (readonly [number, number])[]) => {
      const s = new THREE.Shape();
      s.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        s.lineTo(pts[i][0], pts[i][1]);
      }
      s.closePath();
      return s;
    };
    const depth = 0.14;
    const extrudeSettings = {
      depth,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.012,
      bevelThickness: 0.012,
    };
    const g0 = new THREE.ExtrudeGeometry(createShape(AUT_EMBLEM_POLY_0), extrudeSettings);
    const g1 = new THREE.ExtrudeGeometry(createShape(AUT_EMBLEM_POLY_1), extrudeSettings);
    g0.translate(0, 0, -depth / 2);
    g1.translate(0, 0, -depth / 2);
    batcher.addGeometry('gold', g0, [0, 2.84, 0]);
    batcher.addGeometry('gold', g1, [0, 2.84, 0]);
    g0.dispose();
    g1.dispose();

    // 12 пенных форсунок вокруг золотой эмблемы
    for (let fidx = 0; fidx < 12; fidx++) {
      const angle = (fidx / 12) * Math.PI * 2;
      const fx = Math.cos(angle) * 2.2;
      const fz = Math.sin(angle) * 0.9;
      batcher.addCone('waterJet', [0.1, 0.5, 8], [fx, 2.57, fz]);
    }

    // 5. Две круглые чаши и вертикальные гейзеры
    for (const cx of [-18.5, 18.5]) {
      batcher.addCylinder('cascadeStone', [2.7, 2.75, 0.6, 32], [cx, 0.35, 0]);
      batcher.addCylinder('cascadeWater', [2.5, 2.5, 0.08, 32], [cx, 0.62, 0]);
      batcher.addCylinder('geyser', [0.1, 0.28, 5.0, 16], [cx, 3.15, 0]);
      batcher.addSphere('geyser', [0.35, 12, 12], [cx, 5.65, 0]);

      for (let jidx = 0; jidx < 16; jidx++) {
        const angle = (jidx / 16) * Math.PI * 2;
        const jx = Math.cos(angle) * 1.9;
        const jz = Math.sin(angle) * 1.9;
        batcher.addCylinder(
          'waterJet',
          [0.025, 0.045, 1.7, 8],
          [cx + jx * 0.65, 1.4, jz * 0.65],
          [jz * 0.25, 0, -jx * 0.25],
        );
      }
    }

    // 6. Пальмы (только если showPalms = true)
    if (showPalms) {
      const palmCrownGeo = createMergedPalmCrownGeometry();
      const palmXCoords = [-21.0, -14.0, -8.55, 0.0, 8.55, 14.0, 21.0];
      const palmMat = new THREE.Matrix4();
      const subMat = new THREE.Matrix4();

      [-1, 1].forEach((sideMultiplier, sIdx) => {
        const sideZ = sideMultiplier * (d.basinWidth / 2 + 1.25);
        palmXCoords.forEach((px, pidx) => {
          const treeH = 3.8 + ((pidx * 3 + sIdx * 2) % 4) * 0.25;
          const leanZ = -sideMultiplier * 0.065;
          const leanX = (pidx % 2 === 0 ? 1 : -1) * 0.035;

          batcher.addCylinder('plazaBorder', [0.75, 0.82, 0.1, 16], [px, 0.05, sideZ]);
          batcher.addCylinder('palmBark', [0.7, 0.7, 0.03, 16], [px, 0.1, sideZ]);

          palmMat.makeRotationFromEuler(new THREE.Euler(leanZ, 0, leanX)).setPosition(px, 0.15, sideZ);

          const trunkG = new THREE.CylinderGeometry(0.15, 0.28, treeH, 12);
          trunkG.translate(0, treeH / 2, 0);
          trunkG.applyMatrix4(palmMat);
          batcher.addGeometry('palmTrunk', trunkG);
          trunkG.dispose();

          const shaftG = new THREE.CylinderGeometry(0.13, 0.16, 0.45, 10);
          shaftG.translate(0, treeH + 0.2, 0);
          shaftG.applyMatrix4(palmMat);
          batcher.addGeometry('palmShaft', shaftG);
          shaftG.dispose();

          const crownG = palmCrownGeo.clone();
          subMat.makeTranslation(0, treeH + 0.42, 0);
          crownG.applyMatrix4(subMat).applyMatrix4(palmMat);
          batcher.addGeometry('palmFrond', crownG);
          crownG.dispose();
        });
      });

      palmCrownGeo.dispose();
    }

    return batcher.buildAll();
  }, [showPalms]);

  useEffect(() => {
    return () => {
      disposeMergedMap(merged);
      Object.values(materials).forEach((m) => m.dispose());
    };
  }, [merged, materials]);

  // Непрерывный поток и пульсация воды (с мягким шагом кадра для экономии ресурсов CPU)
  const animFrameRef = useRef(0);
  useFrame((state) => {
    animFrameRef.current++;
    if (animFrameRef.current % 3 !== 0) return;
    const t = state.clock.getElapsedTime();
    materials.waterJetMat.emissiveIntensity = 0.32 + Math.sin(t * 8.0) * 0.08;
    materials.geyserMat.emissiveIntensity = 0.50 + Math.sin(t * 6.0) * 0.12;
    materials.poolWaterMat.opacity = 0.84 + Math.sin(t * 3.0) * 0.04;
  });

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {merged.plaza && (
        <mesh geometry={merged.plaza} material={materials.plazaMat} receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.plazaBorder && (
        <mesh geometry={merged.plazaBorder} material={materials.plazaBorderMat} receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.poolTile && (
        <mesh geometry={merged.poolTile} material={materials.poolTileMat} receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.poolWater && (
        <mesh geometry={merged.poolWater} material={materials.poolWaterMat} receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.dpkBoard && (
        <mesh geometry={merged.dpkBoard} material={materials.dpkBoardMat} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.dpkCap && (
        <mesh geometry={merged.dpkCap} material={materials.dpkCapMat} raycast={NO_RAYCAST} />
      )}
      {merged.bridgeDeck && (
        <mesh geometry={merged.bridgeDeck} material={materials.bridgeDeckMat} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.bridgeRailing && (
        <mesh geometry={merged.bridgeRailing} material={materials.bridgeRailingMat} raycast={NO_RAYCAST} />
      )}
      {merged.gold && (
        <mesh geometry={merged.gold} material={materials.goldMat} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.cascadeStone && (
        <mesh geometry={merged.cascadeStone} material={materials.cascadeStoneMat} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.cascadeWater && (
        <mesh geometry={merged.cascadeWater} material={materials.cascadeWaterMat} raycast={NO_RAYCAST} />
      )}
      {merged.waterJet && (
        <mesh geometry={merged.waterJet} material={materials.waterJetMat} raycast={NO_RAYCAST} />
      )}
      {merged.geyser && (
        <mesh geometry={merged.geyser} material={materials.geyserMat} raycast={NO_RAYCAST} />
      )}
      {merged.palmBark && (
        <mesh geometry={merged.palmBark} material={materials.palmBarkRingMat} receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.palmTrunk && (
        <mesh geometry={merged.palmTrunk} material={materials.palmTrunkMat} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.palmShaft && (
        <mesh geometry={merged.palmShaft} material={materials.palmCrownShaftMat} raycast={NO_RAYCAST} />
      )}
      {merged.palmFrond && (
        <mesh geometry={merged.palmFrond} material={materials.palmFrondMat} receiveShadow raycast={NO_RAYCAST} />
      )}

      {/* Легковесная процедурная анимация воды и баллистическая физика струй */}
      <FountainWaterAnimation />
    </group>
  );
}

