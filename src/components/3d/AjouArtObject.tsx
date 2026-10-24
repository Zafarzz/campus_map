import { useMemo } from 'react';
import * as THREE from 'three';

/**
 * Точные архитектурные параметры арт-объекта "I ♥ AJOU" согласно официальному чертежу:
 * "Арт-объект 'I ♥ AJOU' Чертеж общего вида" (Лист 3, М 1:25).
 */
export const AJOU_ART_DIMENSIONS = {
  // Бетонный фундамент
  foundationLength: 7.2, // 7200 мм
  foundationWidth: 0.6, // 600 мм
  foundationHeight: 0.15,

  // Стальная опорная рама
  frameLength: 6.8, // 6800 мм
  frameWidth: 0.35, // 350 мм
  frameHeight: 0.15, // Отметка верха рамы +0.150 м

  // Символ "I" (Сталь, синий лак #1A2840)
  letterIWidth: 0.35, // 350 мм
  letterIHeight: 1.65, // Отметка верха +1.800 м над землей (+1.65 м над рамой)
  letterDepth: 0.12, // 120 мм (объемная глубина букв)

  // Объемное контурное сердце "♥" (Композит, красный #8B2635)
  heartWidth: 2.1, // 2100 мм
  heartHeight: 1.8, // 1800 мм (отметка верха +1.800 м)
  heartDepth: 0.12, // 120 мм

  // Световые объемные буквы "AJOU" (Белый акрил #FFFFFF, борта синий лак #1A2840)
  letterAWidth: 1.0, // 1000 мм
  letterAHeight: 1.2, // 1200 мм (отметка верха +1.350 м)

  letterJWidth: 0.8, // 800 мм
  letterJHeight: 1.2, // 1200 мм (отметка верха +1.350 м)

  letterOWidth: 0.9, // 900 мм
  letterOHeight: 1.1, // 1100 мм (отметка верха +1.250 м)

  letterUWidth: 0.9, // 900 мм
  letterUHeight: 1.1, // 1100 мм (отметка верха +1.250 м)
} as const;

export const AJOU_ART_MATERIALS = {
  // Колор-паспорт из чертежа:
  navyLacquer: '#1A2840', // Символ "I" и борта световых букв
  heartRed: '#8B2635', // Объемное сердце (композит, красный)
  steelFrame: '#B8C0C8', // Стальная опорная рама (RAL 9006 светло-серый металлик)
  whiteFace: '#FFFFFF', // Лицевые световые панели букв "AJOU"
  concrete: '#94A3B8', // Бетонный фундамент
} as const;

export type AjouArtObjectProps = {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
};

/**
 * Высокоточная 3D-модель арт-объекта "I ♥ AJOU" у главного входа кампуса:
 * - Все глифы ("I", "♥", "A", "J", "O", "U") построены через векторные Three.js ExtrudeGeometry.
 * - Двухцветные материалы для букв AJOU: светящийся белый акрил на фасаде (#FFFFFF) и темно-синий стальной лак на боковинах (#1A2840).
 * - Гладкие радиусы скругления сердца, букв O, J и U без ломаных полигонов.
 * - Полное соответствие чертежу Лист 3, М 1:25.
 */
export function AjouArtObject({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
}: AjouArtObjectProps) {
  const materials = useMemo(() => {
    // 1. Темно-синий лак (#1A2840) для "I" и боковин букв
    const navyMat = new THREE.MeshStandardMaterial({
      color: AJOU_ART_MATERIALS.navyLacquer,
      roughness: 0.35,
      metalness: 0.3,
    });

    // 2. Красный композит сердца (#8B2635)
    const heartMat = new THREE.MeshStandardMaterial({
      color: AJOU_ART_MATERIALS.heartRed,
      roughness: 0.3,
      metalness: 0.15,
    });

    // 3. Стальная рама металлик (#B8C0C8)
    const frameMat = new THREE.MeshStandardMaterial({
      color: AJOU_ART_MATERIALS.steelFrame,
      roughness: 0.45,
      metalness: 0.7,
    });

    // 4. Световая белая панель букв "AJOU"
    const whiteMat = new THREE.MeshStandardMaterial({
      color: AJOU_ART_MATERIALS.whiteFace,
      emissive: AJOU_ART_MATERIALS.whiteFace,
      emissiveIntensity: 0.25,
      roughness: 0.2,
      metalness: 0.05,
    });

    // 5. Бетонный цоколь
    const concreteMat = new THREE.MeshStandardMaterial({
      color: AJOU_ART_MATERIALS.concrete,
      roughness: 0.9,
      metalness: 0.05,
    });

    return { navyMat, heartMat, frameMat, whiteMat, concreteMat };
  }, []);

  // 1. Векторная геометрия символа "I" (с засечками на концах)
  const letterIGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.175, 0);
    shape.lineTo(0.175, 0);
    shape.lineTo(0.175, 0.1);
    shape.lineTo(0.11, 0.1);
    shape.lineTo(0.11, 1.55);
    shape.lineTo(0.175, 1.55);
    shape.lineTo(0.175, 1.65);
    shape.lineTo(-0.175, 1.65);
    shape.lineTo(-0.175, 1.55);
    shape.lineTo(-0.11, 1.55);
    shape.lineTo(-0.11, 0.1);
    shape.lineTo(-0.175, 0.1);
    shape.closePath();

    return new THREE.ExtrudeGeometry(shape, {
      depth: AJOU_ART_DIMENSIONS.letterDepth,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.008,
      bevelThickness: 0.008,
    });
  }, []);

  // 2. Векторная геометрия объемного полого сердца "♥"
  // Реалистичный асимметричный силуэт по натурным фото: правая половина крупнее левой,
  // острие заглубляется в фундамент и грунт (ниже нулевой отметки)
  const heartGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    // Острие начинается с заглублением y = -0.35м (проникает сквозь раму в грунт до -0.20м)
    shape.moveTo(0, -0.35);
    // Левая половина: более компактная (ширина ~0.85м, верхняя точка +1.65м)
    shape.bezierCurveTo(-0.35, -0.05, -0.85, 0.55, -0.85, 1.15);
    shape.bezierCurveTo(-0.85, 1.50, -0.55, 1.68, -0.35, 1.68);
    shape.bezierCurveTo(-0.15, 1.68, 0, 1.42, 0.04, 1.25);
    // Правая половина: существенно крупнее и выше (ширина ~1.25м, верхняя точка +1.85м)
    shape.bezierCurveTo(0.08, 1.48, 0.25, 1.85, 0.60, 1.85);
    shape.bezierCurveTo(0.95, 1.85, 1.25, 1.65, 1.25, 1.28);
    shape.bezierCurveTo(1.25, 0.75, 0.50, 0.10, 0, -0.35);

    // Внутреннее отверстие контурного сердца (соответственно асимметричное)
    const hole = new THREE.Path();
    hole.moveTo(0.02, 0.05);
    // Правая внутренняя дуга (более просторная)
    hole.bezierCurveTo(0.35, 0.35, 0.95, 0.85, 0.95, 1.25);
    hole.bezierCurveTo(0.95, 1.55, 0.72, 1.66, 0.52, 1.66);
    hole.bezierCurveTo(0.24, 1.66, 0.08, 1.38, 0.04, 1.15);
    // Левая внутренняя дуга (более компактная)
    hole.bezierCurveTo(0, 1.35, -0.15, 1.50, -0.32, 1.50);
    hole.bezierCurveTo(-0.48, 1.50, -0.65, 1.38, -0.65, 1.15);
    hole.bezierCurveTo(-0.65, 0.75, -0.22, 0.25, 0.02, 0.05);
    shape.holes.push(hole);

    return new THREE.ExtrudeGeometry(shape, {
      depth: AJOU_ART_DIMENSIONS.heartDepth,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.015,
      bevelThickness: 0.015,
    });
  }, []);

  // 3. Векторная геометрия буквы "A"
  const letterAGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    // Внешний контур буквы A (ширина 1.0м, высота 1.2м)
    shape.moveTo(-0.5, 0);
    shape.lineTo(-0.12, 1.2);
    shape.lineTo(0.12, 1.2);
    shape.lineTo(0.5, 0);
    shape.lineTo(0.32, 0);
    shape.lineTo(0.17, 0.4);
    shape.lineTo(-0.17, 0.4);
    shape.lineTo(-0.32, 0);
    shape.closePath();

    // Внутренний треугольный вырез над перемычкой
    const hole = new THREE.Path();
    hole.moveTo(-0.13, 0.58);
    hole.lineTo(0.13, 0.58);
    hole.lineTo(0, 0.98);
    hole.closePath();
    shape.holes.push(hole);

    return new THREE.ExtrudeGeometry(shape, {
      depth: AJOU_ART_DIMENSIONS.letterDepth,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.008,
      bevelThickness: 0.008,
    });
  }, []);

  // 4. Векторная геометрия буквы "J"
  const letterJGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.1, 1.2);
    shape.lineTo(0.4, 1.2);
    shape.lineTo(0.4, 0.35);
    shape.bezierCurveTo(0.4, 0.0, 0.2, 0.0, 0.05, 0.0);
    shape.bezierCurveTo(-0.25, 0.0, -0.4, 0.15, -0.4, 0.42);
    shape.lineTo(-0.22, 0.42);
    shape.bezierCurveTo(-0.22, 0.22, -0.1, 0.18, 0.05, 0.18);
    shape.bezierCurveTo(0.18, 0.18, 0.22, 0.22, 0.22, 0.35);
    shape.lineTo(0.22, 1.05);
    shape.lineTo(-0.1, 1.05);
    shape.closePath();

    return new THREE.ExtrudeGeometry(shape, {
      depth: AJOU_ART_DIMENSIONS.letterDepth,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.008,
      bevelThickness: 0.008,
    });
  }, []);

  // 5. Векторная геометрия буквы "O"
  const letterOGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    const rx = AJOU_ART_DIMENSIONS.letterOWidth / 2;
    const ry = AJOU_ART_DIMENSIONS.letterOHeight / 2;
    shape.absellipse(0, ry, rx, ry, 0, Math.PI * 2, false, 0);

    const hole = new THREE.Path();
    hole.absellipse(0, ry, rx - 0.18, ry - 0.18, 0, Math.PI * 2, true, 0);
    shape.holes.push(hole);

    return new THREE.ExtrudeGeometry(shape, {
      depth: AJOU_ART_DIMENSIONS.letterDepth,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.008,
      bevelThickness: 0.008,
    });
  }, []);

  // 6. Векторная геометрия буквы "U"
  const letterUGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.45, 1.1);
    shape.lineTo(-0.27, 1.1);
    shape.lineTo(-0.27, 0.4);
    shape.bezierCurveTo(-0.27, 0.18, -0.15, 0.18, 0, 0.18);
    shape.bezierCurveTo(0.15, 0.18, 0.27, 0.18, 0.27, 0.4);
    shape.lineTo(0.27, 1.1);
    shape.lineTo(0.45, 1.1);
    shape.lineTo(0.45, 0.4);
    shape.bezierCurveTo(0.45, 0.0, 0.25, 0.0, 0, 0.0);
    shape.bezierCurveTo(-0.25, 0.0, -0.45, 0.0, -0.45, 0.4);
    shape.closePath();

    return new THREE.ExtrudeGeometry(shape, {
      depth: AJOU_ART_DIMENSIONS.letterDepth,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.008,
      bevelThickness: 0.008,
    });
  }, []);

  const d = AJOU_ART_DIMENSIONS;
  const frameY = d.frameHeight; // +0.150 м над землей
  const zOffset = -d.letterDepth / 2; // Центрирование на раме по глубине

  // Распределение элементов по чертежу (Лист 3):
  const posI = -3.075; // Символ "I"
  const posHeart = -1.7; // Контурное сердце "♥"
  const posA = 0.0; // Буква "A"
  const posJ = 1.0; // Буква "J"
  const posO = 1.95; // Буква "O"
  const posU = 2.95; // Буква "U"

  // Двухцветный массив материалов для световых букв AJOU (0: фасад белый, 1: борта синие)
  const illuminatedLetterMats = [materials.whiteMat, materials.navyMat];

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* ============================================================== */}
      {/* 1. БЕТОННЫЙ ФУНДАМЕНТ (7200 х 600 мм)                          */}
      {/* ============================================================== */}
      <mesh position={[0, 0.06, 0]} material={materials.concreteMat} receiveShadow>
        <boxGeometry args={[d.foundationLength, 0.12, d.foundationWidth]} />
      </mesh>

      {/* ============================================================== */}
      {/* 2. СТАЛЬНАЯ ОПОРНАЯ РАМА (6800 мм, ОТМЕТКА +0.150 М)           */}
      {/* ============================================================== */}
      {/* Продольная опорная балка */}
      <mesh position={[0, frameY - 0.03, 0]} material={materials.frameMat} castShadow receiveShadow>
        <boxGeometry args={[d.frameLength, 0.06, d.frameWidth]} />
      </mesh>
      {/* 4 опорные анкерные стойки со шпильками */}
      {[-2.5, -0.85, 0.85, 2.5].map((xPost, idx) => (
        <group key={`post-${idx}`} position={[xPost, 0.06, 0]}>
          <mesh material={materials.frameMat} castShadow>
            <cylinderGeometry args={[0.045, 0.045, 0.12, 12]} />
          </mesh>
          <mesh position={[0, 0.05, 0]} material={materials.frameMat}>
            <boxGeometry args={[0.16, 0.02, 0.16]} />
          </mesh>
        </group>
      ))}

      {/* ============================================================== */}
      {/* 3. СИМВОЛ "I" (СТАЛЬ, СИНИЙ ЛАК #1A2840, ВЫСОТА +1.800 М)       */}
      {/* ============================================================== */}
      <group position={[posI, frameY, zOffset]}>
        <mesh geometry={letterIGeometry} material={materials.navyMat} castShadow receiveShadow />
      </group>

      {/* ============================================================== */}
      {/* 4. ОБЪЕМНОЕ КОНТУРНОЕ СЕРДЦЕ "♥" (КРАСНЫЙ КОМПОЗИТ #8B2635)    */}
      {/* ============================================================== */}
      <group position={[posHeart, frameY, zOffset]}>
        <mesh geometry={heartGeometry} material={materials.heartMat} castShadow receiveShadow />
      </group>

      {/* ============================================================== */}
      {/* 5. СВЕТОВАЯ БУКВА "A" (ШИРИНА 1000 ММ, ВЫСОТА 1200 ММ)         */}
      {/* ============================================================== */}
      <group position={[posA, frameY, zOffset]}>
        <mesh
          geometry={letterAGeometry}
          material={illuminatedLetterMats}
          castShadow
          receiveShadow
        />
      </group>

      {/* ============================================================== */}
      {/* 6. СВЕТОВАЯ БУКВА "J" (ШИРИНА 800 ММ, ВЫСОТА 1200 ММ)          */}
      {/* ============================================================== */}
      <group position={[posJ, frameY, zOffset]}>
        <mesh
          geometry={letterJGeometry}
          material={illuminatedLetterMats}
          castShadow
          receiveShadow
        />
      </group>

      {/* ============================================================== */}
      {/* 7. СВЕТОВАЯ БУКВА "O" (ШИРИНА 900 ММ, ВЫСОТА 1100 ММ)          */}
      {/* ============================================================== */}
      <group position={[posO, frameY, zOffset]}>
        <mesh
          geometry={letterOGeometry}
          material={illuminatedLetterMats}
          castShadow
          receiveShadow
        />
      </group>

      {/* ============================================================== */}
      {/* 8. СВЕТОВАЯ БУКВА "U" (ШИРИНА 900 ММ, ВЫСОТА 1100 ММ)          */}
      {/* ============================================================== */}
      <group position={[posU, frameY, zOffset]}>
        <mesh
          geometry={letterUGeometry}
          material={illuminatedLetterMats}
          castShadow
          receiveShadow
        />
      </group>
    </group>
  );
}
