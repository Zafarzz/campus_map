import { useMemo } from 'react';
import * as THREE from 'three';

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
  dpkBoard: '#2D251E', // Темный благородный шоколадно-графитовый композит
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
  palmFronds: '#15803d', // Сочные веерные ветви пальмы
  // Мощение площади
  plazaPaving: '#E2DFD7', // Мощение променада вокруг чаши
  plazaBorder: '#B5B2A8', // Бордюр площади
} as const;

export type CampusFountainProps = {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
};

/**
 * 3D-модель Главного фонтана кампуса с двумя мостиками и каскадом:
 * - Увеличен масштаб: базовый 54x18 м, с коэффициентом scale=1.5x (эффективно 81x27 м).
 * - Ориентация поперек поля (Запад-Восток): длинная сторона идет вдоль оси X.
 * - Борт из ДПК H=550 мм (+0.550 м).
 * - 2 пешеходных мостика со смотровыми площадками, золотыми арками и ступенями.
 * - Центральный каскад с золотой скульптурой логотипа AUT (+3.20 м).
 * - 2 круглые чаши с веерными струями и высокими вертикальными гейзерами (+5.80 м).
 * - 7 пальм (+3.5 – +4.5 м) вдоль южного борта.
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
      color: FOUNTAIN_MATERIALS.dpkBoard,
      roughness: 0.65,
      metalness: 0.1,
    });
    const dpkCapMat = new THREE.MeshStandardMaterial({
      color: FOUNTAIN_MATERIALS.dpkCap,
      roughness: 0.5,
      metalness: 0.15,
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

    // 4. Золотой логотип AUT и арки
    const goldMat = new THREE.MeshStandardMaterial({
      color: FOUNTAIN_MATERIALS.goldAccent,
      roughness: 0.25,
      metalness: 0.85,
    });

    // 5. Мостики (настил и перила)
    const bridgeDeckMat = new THREE.MeshStandardMaterial({
      color: FOUNTAIN_MATERIALS.bridgeDeck,
      roughness: 0.6,
      metalness: 0.1,
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

    // 7. Пальмы
    const palmTrunkMat = new THREE.MeshStandardMaterial({
      color: FOUNTAIN_MATERIALS.palmTrunk,
      roughness: 0.9,
    });
    const palmFrondMat = new THREE.MeshStandardMaterial({
      color: FOUNTAIN_MATERIALS.palmFronds,
      roughness: 0.5,
      side: THREE.DoubleSide,
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
      plazaMat,
      plazaBorderMat,
    };
  }, []);

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
        <group position={[0, 2.38, 0]}>
          {/* Золотой постамент эмблемы */}
          <mesh position={[0, 0.1, 0]} material={materials.goldMat}>
            <cylinderGeometry args={[0.65, 0.8, 0.2, 16]} />
          </mesh>

          {/* Скульптурные витки золотого знака AUT (H = 3.200 - 2.35 = 0.85 м) */}
          <group position={[0, 0.48, 0]}>
            {/* Внешнее золотое кольцо-ромб */}
            <mesh material={materials.goldMat} castShadow>
              <torusGeometry args={[0.42, 0.07, 12, 32]} />
            </mesh>
            {/* Внутренняя витая золотая лента Мебиуса */}
            <mesh rotation={[Math.PI / 3, 0, 0]} material={materials.goldMat} castShadow>
              <torusGeometry args={[0.28, 0.05, 10, 24]} />
            </mesh>
            {/* Объемные золотые буквы AUT */}
            <mesh position={[0, -0.48, 0.12]} material={materials.goldMat}>
              <boxGeometry args={[0.6, 0.16, 0.08]} />
            </mesh>
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
      {/* 6. ОЗЕЛЕНЕНИЕ: 7 ПАЛЬМ (+3.5 – +4.5 М) ВДОЛЬ ЮЖНОГО БОРТА       */}
      {/* ============================================================== */}
      {palmXCoords.map((px, pidx) => {
        const treeH = 3.8 + ((pidx * 3) % 4) * 0.25;
        const trunkTilt = ((pidx % 2 === 0 ? 1 : -1) * 0.08);

        return (
          <group key={`palm-${pidx}`} position={[px, 0, d.basinWidth / 2 + 1.2]}>
            {/* Круглая клумба-приствольный круг */}
            <mesh position={[0, 0.05, 0]} material={materials.plazaBorderMat}>
              <cylinderGeometry args={[0.7, 0.75, 0.1, 16]} />
            </mesh>
            <mesh position={[0, 0.1, 0]} material={materials.palmTrunkMat}>
              <cylinderGeometry args={[0.6, 0.6, 0.04, 16]} />
            </mesh>

            {/* Кольчатый изогнутый ствол пальмы */}
            <group position={[0, 0, 0]} rotation={[trunkTilt, 0, 0]}>
              <mesh position={[0, treeH / 2, 0]} material={materials.palmTrunkMat} castShadow>
                <cylinderGeometry args={[0.15, 0.24, treeH, 10]} />
              </mesh>

              {/* Крона веерных пальмовых ветвей на вершине */}
              <group position={[0, treeH, 0]}>
                {Array.from({ length: 9 }).map((_, fidx) => {
                  const fAngle = (fidx / 9) * Math.PI * 2;
                  const droopAngle = 0.55 + (fidx % 3) * 0.1;
                  return (
                    <group key={`frond-${fidx}`} rotation={[0, fAngle, 0]}>
                      <mesh
                        position={[1.0, -0.35, 0]}
                        rotation={[0, 0, -droopAngle]}
                        material={materials.palmFrondMat}
                        castShadow
                      >
                        <boxGeometry args={[2.0, 0.02, 0.5]} />
                      </mesh>
                    </group>
                  );
                })}
              </group>
            </group>
          </group>
        );
      })}
    </group>
  );
}
