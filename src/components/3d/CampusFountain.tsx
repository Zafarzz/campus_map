import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FountainWaterAnimation } from './fountain/FountainWaterAnimation';

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
};

/**
 * Создает реалистичную 3D-геометрию перистого пальмового листа (pinnate frond):
 * - Центральный дугообразный черешок (рахис).
 * - Отдельные заостренные листочки-перья (leaflets), веерообразно расходящиеся по обе стороны
 *   с естественным пониканием кончиков.
 */
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

    // Central rachis stem segment
    pushTri(-stemW0, y0, z0, stemW0, y0, z0, stemW1, y1, z1);
    pushTri(-stemW0, y0, z0, stemW1, y1, z1, -stemW1, y1, z1);

    // Individual pinnate leaflets on left and right (from t >= 0.1)
    if (i >= 1) {
      const tMid = (t0 + t1) * 0.5;
      const env = Math.sin(Math.pow(tMid, 0.85) * Math.PI);
      const leafSpan = maxWidth * env;
      const tipForward = (z1 - z0) * 1.45;
      const tipZ = z0 + tipForward;
      const tipY = y0 - leafSpan * 0.34 - tMid * 0.08;
      const midZ = (z0 + tipZ) * 0.5;
      const midY = (y0 + tipY) * 0.5 + 0.035;

      // Left leaflet (2-triangle V-folded blade)
      pushTri(-stemW0 * 0.5, y0, z0, -leafSpan * 0.55, midY, midZ, -leafSpan, tipY, tipZ);
      pushTri(-stemW0 * 0.5, y0, z0, -leafSpan, tipY, tipZ, -stemW1 * 0.5, y1, z1);

      // Right leaflet (2-triangle V-folded blade)
      pushTri(stemW0 * 0.5, y0, z0, leafSpan, tipY, tipZ, leafSpan * 0.55, midY, midZ);
      pushTri(stemW0 * 0.5, y0, z0, stemW1 * 0.5, y1, z1, leafSpan, tipY, tipZ);
    }
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return geom;
}

/**
 * 3D-модель Главного фонтана кампуса с двумя мостиками и каскадом:
 * - Увеличен масштаб: базовый 54x18 м, с коэффициентом scale=1.5x (эффективно 81x27 м).
 * - Ориентация поперек поля (Запад-Восток): длинная сторона идет вдоль оси X.
 * - Борт из ДПК H=550 мм (+0.550 м).
 * - 2 пешеходных мостика со смотровыми площадками, золотыми арками и ступенями.
 * - Центральный каскад с золотой скульптурой логотипа AUT (+3.20 м).
 * - 2 круглые чаши с веерными струями и высокими вертикальными гейзерами (+5.80 м).
 * - 14 архитектурных пальм (+3.5 – +4.5 м) вдоль северного и южного променадов.
 * - Мощеная площадь-променада вокруг чаши.
 */
export function CampusFountain({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = FOUNTAIN_DIMENSIONS.defaultScale,
}: CampusFountainProps) {
  const materials = useMemo(() => {
    // 1. Борт из ДПК
    const dpkBoardMat = new THREE.MeshStandardMaterial({
      color: '#4e3829',
      roughness: 0.65,
      metalness: 0.08,
    });
    const dpkCapMat = new THREE.MeshStandardMaterial({
      color: '#3b281c',
      roughness: 0.5,
      metalness: 0.12,
    });

    // 2. Чаша бассейна и вода
    const poolTileMat = new THREE.MeshStandardMaterial({
      color: FOUNTAIN_MATERIALS.poolTile,
      roughness: 0.3,
    });
    const poolWaterMat = new THREE.MeshStandardMaterial({
      color: FOUNTAIN_MATERIALS.poolWater,
      roughness: 0.08,
      metalness: 0.15,
      transparent: true,
      opacity: 0.85,
    });

    // 3. Ступенчатый каскад
    const cascadeStoneMat = new THREE.MeshStandardMaterial({
      color: FOUNTAIN_MATERIALS.cascadeStone,
      roughness: 0.75,
      metalness: 0.05,
    });
    const cascadeWaterMat = new THREE.MeshStandardMaterial({
      color: FOUNTAIN_MATERIALS.cascadeWater,
      roughness: 0.1,
      metalness: 0.2,
      transparent: true,
      opacity: 0.8,
    });

    // 4. Золотой логотип AUT и арки (полированное архитектурное золото с благородным теплым отблеском)
    const goldMat = new THREE.MeshStandardMaterial({
      color: FOUNTAIN_MATERIALS.goldAccent,
      roughness: 0.18,
      metalness: 0.85,
      emissive: '#B45309',
      emissiveIntensity: 0.2,
    });

    // 5. Мостики (настил и перила)
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

    // 6. Водные струи и гейзеры
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

    // 7. Пальмы (многоярусная ботаническая листва и фактурная кора)
    const palmTrunkMat = new THREE.MeshStandardMaterial({
      color: '#694b3c',
      roughness: 0.88,
    });
    const palmFrondMat = new THREE.MeshStandardMaterial({
      color: '#2e6f34',
      roughness: 0.55,
      side: THREE.DoubleSide,
    });
    const palmFrondYoungMat = new THREE.MeshStandardMaterial({
      color: '#3e8242',
      roughness: 0.5,
      side: THREE.DoubleSide,
    });
    const palmFrondMatureMat = new THREE.MeshStandardMaterial({
      color: '#2e6f34',
      roughness: 0.55,
      side: THREE.DoubleSide,
    });
    const palmFrondOldMat = new THREE.MeshStandardMaterial({
      color: '#235328',
      roughness: 0.65,
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
    const coconutMat = new THREE.MeshStandardMaterial({
      color: '#78350F',
      roughness: 0.8,
    });

    // 8. Мощение площади
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
      palmFrondYoungMat,
      palmFrondMatureMat,
      palmFrondOldMat,
      palmBarkRingMat,
      palmCrownShaftMat,
      coconutMat,
      plazaMat,
      plazaBorderMat,
    };
  }, []);

  // Векторная 3D-геометрия золотой эмблемы AUT (два переплетающихся объемных элемента с фаской)
  const emblemGeometries = useMemo(() => {
    function createShape(pts: readonly (readonly [number, number])[]) {
      const s = new THREE.Shape();
      s.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        s.lineTo(pts[i][0], pts[i][1]);
      }
      s.closePath();
      return s;
    }

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

    return { g0, g1 };
  }, []);

  // Кэшированные 3D-геометрии изогнутых пальмовых ветвей для многоярусной кроны
  const palmFrondGeometries = useMemo(() => {
    return {
      upper: createPalmFrondGeometry(2.1, 0.44, 6),
      middle: createPalmFrondGeometry(2.7, 0.58, 8),
      lower: createPalmFrondGeometry(2.4, 0.50, 7),
    };
  }, []);

  // Непрерывный поток и пульсация воды через существующие струи и зеркало бассейна
  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    // Легкая динамическая пульсация струй и гейзеров
    materials.waterJetMat.emissiveIntensity = 0.32 + Math.sin(t * 8.0) * 0.08;
    materials.geyserMat.emissiveIntensity = 0.50 + Math.sin(t * 6.0) * 0.12;
    // Тонкое естественное мерцание зеркала воды бассейна
    materials.poolWaterMat.opacity = 0.84 + Math.sin(t * 3.0) * 0.04;
  });

  const d = FOUNTAIN_DIMENSIONS;

  // Координаты мостиков вдоль длинной оси X (Запад-Восток, расстояние между ними 15.0 м)
  const bridgeX = [-(d.bridgeDistance / 2 + d.bridgeWalkwayWidth / 2), +(d.bridgeDistance / 2 + d.bridgeWalkwayWidth / 2)];

  // Координаты боковых круглых чаш (в центрах западного и восточного заливов)
  const circularFountainX = [-18.5, +18.5];

  // Координаты 7 пальм вдоль южного продольного борта чаши
  const palmXCoords = [-21.0, -14.0, -8.55, 0.0, 8.55, 14.0, 21.0];

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* ============================================================== */}
      {/* 1. ОКРУЖАЮЩАЯ ПЛОЩАДЬ-ПРОМЕНАДА (ОТМЕТКА 0.000)                */}
      {/* ============================================================== */}
      {/* Базовый настил площади вокруг фонтана */}
      <mesh position={[0, 0.02, 0]} material={materials.plazaMat} receiveShadow>
        <boxGeometry args={[d.outerLength + 6.0, 0.04, d.outerWidth + 6.0]} />
      </mesh>
      {/* Бордюр площадки */}
      <mesh position={[0, 0.03, 0]} material={materials.plazaBorderMat} receiveShadow>
        <boxGeometry args={[d.outerLength + 6.3, 0.02, d.outerWidth + 6.3]} />
      </mesh>

      {/* ============================================================== */}
      {/* 2. ГЛАВНАЯ ЧАША 54х18 М И БОРТ ИЗ ДПК (H = 550 ММ)              */}
      {/* ============================================================== */}
      <group position={[0, 0, 0]}>
        {/* Дно чаши (плитка) */}
        <mesh position={[0, 0.05, 0]} material={materials.poolTileMat} receiveShadow>
          <boxGeometry args={[d.basinLength, 0.06, d.basinWidth]} />
        </mesh>

        {/* Зеркало воды (+0.450 м) */}
        <mesh position={[0, d.waterLevel, 0]} material={materials.poolWaterMat} receiveShadow>
          <boxGeometry args={[d.basinLength - 0.1, 0.02, d.basinWidth - 0.1]} />
        </mesh>

        {/* Продольный северный борт из ДПК (Z = -9.35, H = 550 мм) */}
        <group position={[0, 0, -d.basinWidth / 2 - 0.35]}>
          <mesh position={[0, d.parapetHeight / 2, 0]} material={materials.dpkBoardMat} castShadow receiveShadow>
            <boxGeometry args={[d.outerLength, d.parapetHeight, 0.7]} />
          </mesh>
          <mesh position={[0, d.parapetHeight + 0.02, 0]} material={materials.dpkCapMat}>
            <boxGeometry args={[d.outerLength + 0.06, 0.04, 0.76]} />
          </mesh>
        </group>

        {/* Продольный южный борт из ДПК (Z = +9.35, H = 550 мм) */}
        <group position={[0, 0, d.basinWidth / 2 + 0.35]}>
          <mesh position={[0, d.parapetHeight / 2, 0]} material={materials.dpkBoardMat} castShadow receiveShadow>
            <boxGeometry args={[d.outerLength, d.parapetHeight, 0.7]} />
          </mesh>
          <mesh position={[0, d.parapetHeight + 0.02, 0]} material={materials.dpkCapMat}>
            <boxGeometry args={[d.outerLength + 0.06, 0.04, 0.76]} />
          </mesh>
        </group>

        {/* Торцевой западный борт из ДПК (X = -27.35, H = 550 мм) */}
        <group position={[-d.basinLength / 2 - 0.35, 0, 0]}>
          <mesh position={[0, d.parapetHeight / 2, 0]} material={materials.dpkBoardMat} castShadow receiveShadow>
            <boxGeometry args={[0.7, d.parapetHeight, d.basinWidth]} />
          </mesh>
          <mesh position={[0, d.parapetHeight + 0.02, 0]} material={materials.dpkCapMat}>
            <boxGeometry args={[0.76, 0.04, d.basinWidth]} />
          </mesh>
        </group>

        {/* Торцевой восточный борт из ДПК (X = +27.35, H = 550 мм) */}
        <group position={[d.basinLength / 2 + 0.35, 0, 0]}>
          <mesh position={[0, d.parapetHeight / 2, 0]} material={materials.dpkBoardMat} castShadow receiveShadow>
            <boxGeometry args={[0.7, d.parapetHeight, d.basinWidth]} />
          </mesh>
          <mesh position={[0, d.parapetHeight + 0.02, 0]} material={materials.dpkCapMat}>
            <boxGeometry args={[0.76, 0.04, d.basinWidth]} />
          </mesh>
        </group>
      </group>

      {/* ============================================================== */}
      {/* 3. ДВА ПЕШЕХОДНЫХ МОСТИКА С ЗОЛОТЫМИ АРКАМИ (ШИРИНА 18 М)       */}
      {/* ============================================================== */}
      {bridgeX.map((bx, bidx) => (
        <group key={`bridge-${bidx}`} position={[bx, 0, 0]}>
          {/* Основной настил мостика через всю ширину 18 м (+0.75 м) */}
          <mesh position={[0, d.bridgeDeckHeight, 0]} material={materials.bridgeDeckMat} castShadow receiveShadow>
            <boxGeometry args={[d.bridgeWalkwayWidth, 0.14, d.basinWidth + 1.2]} />
          </mesh>

          {/* Центральная расширенная смотровая площадка (3300 мм) */}
          <mesh position={[0, d.bridgeDeckHeight + 0.01, 0]} material={materials.bridgeDeckMat} castShadow>
            <boxGeometry args={[d.bridgePlatformWidth, 0.14, 4.8]} />
          </mesh>

          {/* Ступени с северной стороны (Z = -9.9, спуск на площадь 0.000) */}
          <group position={[0, 0, -d.basinWidth / 2 - 0.9]}>
            <mesh position={[0, 0.25, 0]} material={materials.bridgeDeckMat} castShadow>
              <boxGeometry args={[d.bridgeWalkwayWidth, 0.5, 0.5]} />
            </mesh>
            <mesh position={[0, 0.12, -0.35]} material={materials.bridgeDeckMat} castShadow>
              <boxGeometry args={[d.bridgeWalkwayWidth, 0.25, 0.4]} />
            </mesh>
          </group>

          {/* Ступени с южной стороны (Z = +9.9, спуск на площадь 0.000) */}
          <group position={[0, 0, d.basinWidth / 2 + 0.9]}>
            <mesh position={[0, 0.25, 0]} material={materials.bridgeDeckMat} castShadow>
              <boxGeometry args={[d.bridgeWalkwayWidth, 0.5, 0.5]} />
            </mesh>
            <mesh position={[0, 0.12, 0.35]} material={materials.bridgeDeckMat} castShadow>
              <boxGeometry args={[d.bridgeWalkwayWidth, 0.25, 0.4]} />
            </mesh>
          </group>

          {/* Перила мостика (высота 0.95 м) */}
          {[-1, 1].map((side, sidx) => {
            const rx = side * (d.bridgeWalkwayWidth / 2);
            return (
              <group key={`rail-${sidx}`}>
                {/* Поручни */}
                <mesh position={[rx, d.bridgeDeckHeight + 0.95, 0]} material={materials.bridgeRailingMat}>
                  <boxGeometry args={[0.04, 0.04, d.basinWidth + 1.2]} />
                </mesh>
                {/* Решетчатые стойки */}
                {[-7.5, -5.5, -3.5, 3.5, 5.5, 7.5].map((rz, ridx) => (
                  <mesh key={`baluster-${ridx}`} position={[rx, d.bridgeDeckHeight + 0.48, rz]} material={materials.bridgeRailingMat}>
                    <cylinderGeometry args={[0.025, 0.025, 0.95, 8]} />
                  </mesh>
                ))}
              </group>
            );
          })}

          {/* Золотые арочные порталы (+2.35 м / +3.20 м) над смотровой площадкой */}
          {[-2.4, 2.4].map((az, aidx) => (
            <group key={`arch-${aidx}`} position={[0, d.bridgeDeckHeight, az]}>
              {/* Вертикальные золотые пилоны арки */}
              <mesh position={[-d.bridgePlatformWidth / 2 + 0.15, 1.1, 0]} material={materials.goldMat}>
                <cylinderGeometry args={[0.045, 0.045, 2.2, 12]} />
              </mesh>
              <mesh position={[d.bridgePlatformWidth / 2 - 0.15, 1.1, 0]} material={materials.goldMat}>
                <cylinderGeometry args={[0.045, 0.045, 2.2, 12]} />
              </mesh>
              {/* Полукруглая золотая дуга арки на вершине */}
              <mesh position={[0, 2.2, 0]} rotation={[Math.PI / 2, 0, 0]} material={materials.goldMat}>
                <torusGeometry args={[d.bridgePlatformWidth / 2 - 0.15, 0.045, 10, 24, Math.PI]} />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* ============================================================== */}
      {/* 4. ЦЕНТРАЛЬНЫЙ СТУПЕНЧАТЫЙ КАСКАД 15х7.5 М СО СКУЛЬПТУРОЙ AUT   */}
      {/* ============================================================== */}
      <group position={[0, 0, 0]}>
        {/* Ярус 1: Базовый контур (отметка +0.60 м) */}
        <mesh position={[0, 0.35, 0]} material={materials.cascadeStoneMat} castShadow receiveShadow>
          <boxGeometry args={[14.4, 0.6, 7.2]} />
        </mesh>
        {/* Ярус 2: Вторая терраса (+1.05 м) */}
        <mesh position={[0, 0.8, 0]} material={materials.cascadeStoneMat} castShadow receiveShadow>
          <boxGeometry args={[12.3, 0.5, 6.0]} />
        </mesh>
        {/* Ярус 3: Третья терраса (+1.50 м) */}
        <mesh position={[0, 1.25, 0]} material={materials.cascadeStoneMat} castShadow receiveShadow>
          <boxGeometry args={[10.2, 0.5, 4.8]} />
        </mesh>
        {/* Ярус 4: Четвертая терраса (+1.95 м) */}
        <mesh position={[0, 1.7, 0]} material={materials.cascadeStoneMat} castShadow receiveShadow>
          <boxGeometry args={[8.1, 0.5, 3.6]} />
        </mesh>
        {/* Ярус 5: Верхняя чаша каскада (+2.35 м по чертежу) */}
        <mesh position={[0, 2.15, 0]} material={materials.cascadeStoneMat} castShadow receiveShadow>
          <boxGeometry args={[6.0, 0.4, 2.5]} />
        </mesh>

        {/* Водная гладь верхнего переливающегося бассейна (+2.35 м) */}
        <mesh position={[0, 2.36, 0]} material={materials.cascadeWaterMat}>
          <boxGeometry args={[5.7, 0.04, 2.2]} />
        </mesh>

        {/* Водные струи перелива каскада (водопадные пленки по ярусам) */}
        {[-3.0, 3.0].map((wz, widx) => (
          <mesh key={`casc-flow-${widx}`} position={[0, 1.1, wz]} material={materials.waterJetMat}>
            <boxGeometry args={[9.0, 1.8, 0.08]} />
          </mesh>
        ))}

        {/* ВЕРШИНА: ЗОЛОТАЯ ОБЪЕМНАЯ СКУЛЬПТУРА ЛОГОТИПА AUT (+3.200 М) */}
        <group position={[0, 2.37, 0]}>
          {/* Низкий постамент из травертина/гранита каскада */}
          <mesh position={[0, 0.03, 0]} material={materials.cascadeStoneMat} castShadow receiveShadow>
            <boxGeometry args={[1.05, 0.06, 0.32]} />
          </mesh>

          {/* Официальная золотая скульптура эмблемы AUT (отметка от +2.350 до +3.200 м, H = 0.85 м) */}
          <group position={[0, 0.47, 0]}>
            <mesh geometry={emblemGeometries.g0} material={materials.goldMat} castShadow receiveShadow />
            <mesh geometry={emblemGeometries.g1} material={materials.goldMat} castShadow receiveShadow />
          </group>

          {/* Кольцо пенных форсунок вокруг золотой эмблемы */}
          {Array.from({ length: 12 }).map((_, fidx) => {
            const angle = (fidx / 12) * Math.PI * 2;
            const fx = Math.cos(angle) * 2.2;
            const fz = Math.sin(angle) * 0.9;
            return (
              <mesh key={`foam-${fidx}`} position={[fx, 0.2, fz]} material={materials.waterJetMat}>
                <coneGeometry args={[0.1, 0.5, 8]} />
              </mesh>
            );
          })}
        </group>
      </group>

      {/* ============================================================== */}
      {/* 5. ДВЕ КРУГЛЫЕ ЧАШИ Ø 5400 ММ И ВЕРТИКАЛЬНЫЕ ГЕЙЗЕРЫ (+5.80 М)  */}
      {/* ============================================================== */}
      {circularFountainX.map((cx, cidx) => (
        <group key={`circ-fountain-${cidx}`} position={[cx, 0, 0]}>
          {/* Круглый каменный борт чаши Ø 5400 мм (R = 2.7 м) */}
          <mesh position={[0, 0.35, 0]} material={materials.cascadeStoneMat} receiveShadow>
            <cylinderGeometry args={[2.7, 2.75, 0.6, 32]} />
          </mesh>
          {/* Водное зеркало внутренней чаши */}
          <mesh position={[0, 0.62, 0]} material={materials.cascadeWaterMat}>
            <cylinderGeometry args={[2.5, 2.5, 0.08, 32]} />
          </mesh>

          {/* Центральный пенный гейзер бьет до +5.800 м */}
          <group position={[0, 0.65, 0]}>
            {/* Мощный центральный столб воды */}
            <mesh position={[0, 2.5, 0]} material={materials.geyserMat}>
              <cylinderGeometry args={[0.1, 0.28, 5.0, 16]} />
            </mesh>
            {/* Пенная шапка на вершине гейзера */}
            <mesh position={[0, 5.0, 0]} material={materials.geyserMat}>
              <sphereGeometry args={[0.35, 12, 12]} />
            </mesh>
          </group>

          {/* Круговое кольцо из 16 наклонных струй к центру */}
          {Array.from({ length: 16 }).map((_, jidx) => {
            const angle = (jidx / 16) * Math.PI * 2;
            const jx = Math.cos(angle) * 1.9;
            const jz = Math.sin(angle) * 1.9;
            return (
              <group key={`jet-${jidx}`} position={[jx, 0.65, jz]}>
                <mesh
                  position={[-jx * 0.35, 0.75, -jz * 0.35]}
                  rotation={[jz * 0.25, 0, -jx * 0.25]}
                  material={materials.waterJetMat}
                >
                  <cylinderGeometry args={[0.025, 0.045, 1.7, 8]} />
                </mesh>
              </group>
            );
          })}
        </group>
      ))}

      {/* ============================================================== */}
      {/* 6. ОЗЕЛЕНЕНИЕ: 14 АРХИТЕКТУРНЫХ ПАЛЬМ ВДОЛЬ СЕВЕРНОГО И ЮЖНОГО БОРТОВ */}
      {/* ============================================================== */}
      {[-1, 1].map((sideMultiplier, sIdx) => {
        const sideZ = sideMultiplier * (d.basinWidth / 2 + 1.25);
        const sidePrefix = sideMultiplier > 0 ? 'south' : 'north';

        return palmXCoords.map((px, pidx) => {
          const treeH = 3.8 + (((pidx * 3 + sIdx * 2) % 4) * 0.25);
          // Естественный наклон пальмы к водному зеркалу чаши
          const leanZ = -sideMultiplier * 0.065;
          const leanX = ((pidx % 2 === 0 ? 1 : -1) * 0.035);

          // Высоты сегментов ствола
          const seg1H = treeH * 0.38;
          const seg2H = treeH * 0.34;
          const seg3H = treeH * 0.28;

          return (
            <group key={`palm-${sidePrefix}-${pidx}`} position={[px, 0, sideZ]}>
              {/* Круглая мощеная клумба-приствольный круг */}
              <mesh position={[0, 0.05, 0]} material={materials.plazaBorderMat} receiveShadow>
                <cylinderGeometry args={[0.75, 0.82, 0.1, 16]} />
              </mesh>
              {/* Темный плодородный грунт/мульча */}
              <mesh position={[0, 0.1, 0]} material={materials.palmBarkRingMat} receiveShadow>
                <cylinderGeometry args={[0.7, 0.7, 0.03, 16]} />
              </mesh>

              {/* Утолщенное комлевое основание ствола */}
              <mesh position={[0, 0.25, 0]} material={materials.palmTrunkMat} castShadow receiveShadow>
                <cylinderGeometry args={[0.22, 0.32, 0.45, 12]} />
              </mesh>

              {/* Сегментированный ствол пальмы с естественным изгибом к воде */}
              <group position={[0, 0.45, 0]} rotation={[leanZ, 0, leanX]}>
                {/* Сегмент 1 (нижний) */}
                <mesh position={[0, seg1H / 2, 0]} material={materials.palmTrunkMat} castShadow>
                  <cylinderGeometry args={[0.19, 0.22, seg1H, 12]} />
                </mesh>
                {/* Кольца коры */}
                {[0.25, 0.5, 0.75].map((factor, rIdx) => (
                  <mesh
                    key={`ring1-${rIdx}`}
                    position={[0, seg1H * factor, 0]}
                    rotation={[Math.PI / 2, 0, 0]}
                    material={materials.palmBarkRingMat}
                  >
                    <torusGeometry args={[0.205, 0.022, 6, 16]} />
                  </mesh>
                ))}

                {/* Сегмент 2 (средний) с плавным изгибом */}
                <group position={[0, seg1H, 0]} rotation={[leanZ * 0.7, 0, -leanX * 0.5]}>
                  <mesh position={[0, seg2H / 2, 0]} material={materials.palmTrunkMat} castShadow>
                    <cylinderGeometry args={[0.16, 0.19, seg2H, 12]} />
                  </mesh>
                  {[0.3, 0.65].map((factor, rIdx) => (
                    <mesh
                      key={`ring2-${rIdx}`}
                      position={[0, seg2H * factor, 0]}
                      rotation={[Math.PI / 2, 0, 0]}
                      material={materials.palmBarkRingMat}
                    >
                      <torusGeometry args={[0.175, 0.02, 6, 16]} />
                    </mesh>
                  ))}

                  {/* Сегмент 3 (верхний) */}
                  <group position={[0, seg2H, 0]} rotation={[leanZ * 0.5, 0, leanX * 0.3]}>
                    <mesh position={[0, seg3H / 2, 0]} material={materials.palmTrunkMat} castShadow>
                      <cylinderGeometry args={[0.14, 0.16, seg3H, 12]} />
                    </mesh>
                    {[0.35, 0.7].map((factor, rIdx) => (
                      <mesh
                        key={`ring3-${rIdx}`}
                        position={[0, seg3H * factor, 0]}
                        rotation={[Math.PI / 2, 0, 0]}
                        material={materials.palmBarkRingMat}
                      >
                        <torusGeometry args={[0.15, 0.018, 6, 16]} />
                      </mesh>
                    ))}

                    {/* Шейка кроны (зеленый воротник) */}
                    <mesh position={[0, seg3H + 0.2, 0]} material={materials.palmCrownShaftMat}>
                      <cylinderGeometry args={[0.12, 0.15, 0.45, 12]} />
                    </mesh>

                    {/* Гроздья плодов/кокосов под кроной */}
                    {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((angle, cIdx) => (
                      <mesh
                        key={`fruit-${cIdx}`}
                        position={[Math.cos(angle) * 0.18, seg3H + 0.12, Math.sin(angle) * 0.18]}
                        material={materials.coconutMat}
                      >
                        <sphereGeometry args={[0.09, 8, 8]} />
                      </mesh>
                    ))}

                    {/* ============================================================== */}
                    {/* МНОГОЯРУСНАЯ ПЫШНАЯ КРОНА ИЗОГНУТЫХ ПАЛЬМОВЫХ ЛИСТЬЕВ          */}
                    {/* ============================================================== */}
                    <group position={[0, seg3H + 0.42, 0]}>
                      {/* Ярус 1 (верхний): 5 молодых побегов, устремленных вверх */}
                      {Array.from({ length: 5 }).map((_, fidx) => {
                        const fAngle = (fidx / 5) * Math.PI * 2;
                        return (
                          <group key={`ufrond-${fidx}`} rotation={[0, fAngle, 0]}>
                            <mesh
                              geometry={palmFrondGeometries.upper}
                              material={materials.palmFrondYoungMat}
                              rotation={[0.62, 0, 0]}
                              castShadow
                            />
                          </group>
                        );
                      })}

                      {/* Ярус 2 (средний): 8 зрелых листьев, пышно раскинувшихся в стороны */}
                      {Array.from({ length: 8 }).map((_, fidx) => {
                        const fAngle = (fidx / 8) * Math.PI * 2 + 0.35;
                        return (
                          <group key={`mfrond-${fidx}`} rotation={[0, fAngle, 0]}>
                            <mesh
                              geometry={palmFrondGeometries.middle}
                              material={materials.palmFrondMatureMat}
                              rotation={[0.22, 0, 0]}
                              castShadow
                            />
                          </group>
                        );
                      })}

                      {/* Ярус 3 (нижний): 6 зрелых поникающих ветвей */}
                      {Array.from({ length: 6 }).map((_, fidx) => {
                        const fAngle = (fidx / 6) * Math.PI * 2 + 0.7;
                        return (
                          <group key={`lfrond-${fidx}`} rotation={[0, fAngle, 0]}>
                            <mesh
                              geometry={palmFrondGeometries.lower}
                              material={materials.palmFrondOldMat}
                              rotation={[-0.45, 0, 0]}
                              castShadow
                            />
                          </group>
                        );
                      })}
                    </group>
                  </group>
                </group>
              </group>
            </group>
          );
        });
      })}

      {/* 7. Легковесная процедурная анимация воды и баллистическая физика струй */}
      <FountainWaterAnimation />
    </group>
  );
}
