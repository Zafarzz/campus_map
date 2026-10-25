import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

/**
 * Конфигурация высокореалистичной симуляции воды (2200 частиц в 1 Draw Call):
 * - 2 центральных мощных гейзера (по 400 частиц = 800) с плотным ядром струи и куполом брызг (+5.800 м).
 * - 32 непрерывных веерных струи (по 20 частиц на струю = 640) с параболической гидродинамикой.
 * - 12 пенных форсунок вокруг эмблемы AUT (по 16 частиц = 192) с активным бурлением (+2.37 ... +2.85 м).
 * - Каскадные водопадные завесы (по 160 на сторону = 320) с переливом через каменные ступени.
 * - Всплески, брызговые короны и расходящиеся кольца ряби в бассейнах (248 частиц).
 */
export const WATER_ANIM_CONFIG = {
  gravity: 9.81,

  // Распределение плотности частиц
  geyserCountPerFountain: 400,
  circularFountainX: [-18.5, 18.5] as const,
  fanJetsPerFountain: 16,
  particlesPerFanJet: 20,
  foamNozzleCount: 12,
  particlesPerFoamNozzle: 16,
  cascadeCurtainParticles: 320,
  splashParticles: 248,

  // Общий бюджет частиц: 2200 частиц (< 27 КБ видеопамяти)
  get totalParticles(): number {
    return (
      this.geyserCountPerFountain * this.circularFountainX.length +
      this.fanJetsPerFountain * this.particlesPerFanJet * this.circularFountainX.length +
      this.foamNozzleCount * this.particlesPerFoamNozzle +
      this.cascadeCurtainParticles +
      this.splashParticles
    );
  },

  // Оптимизация для мобильных устройств
  distanceThrottlingSq: 480 * 480,
  particleSize: 0.52,
} as const;

/**
 * Высокодетализированная текстура капли воды (64x64) с зеркальным солнечным бликом,
 * прозрачным телом и аквамариновым преломлением.
 */
function createDropletTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    if (!canvas.getContext) return null;
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    // Горячий центральный блик солнца на воде
    gradient.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    // Искрящееся тело капли
    gradient.addColorStop(0.28, 'rgba(240, 249, 255, 0.98)');
    // Преломление лазурной воды
    gradient.addColorStop(0.58, 'rgba(186, 230, 253, 0.90)');
    // Мягкий аквамариновый ореол брызг
    gradient.addColorStop(0.85, 'rgba(125, 211, 252, 0.45)');
    // Плавное растворение границы
    gradient.addColorStop(1.0, 'rgba(56, 189, 248, 0.0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  } catch {
    return null;
  }
}

const enum ParticleKind {
  GeyserCore = 0,
  GeyserMist = 1,
  FanJet = 2,
  FoamNozzle = 3,
  CascadeCurtain = 4,
  SplashCrown = 5,
  BasinRipple = 6,
}

interface ParticleStaticData {
  positions: Float32Array;
  colors: Float32Array;
  origins: Float32Array;
  velocities: Float32Array;
  lifetimes: Float32Array;
  phases: Float32Array;
  kinds: Uint8Array;
  auxParams: Float32Array;
}

/**
 * Инициализирует статические массивы для 2200 частиц
 */
function initializeParticleBuffers(): ParticleStaticData {
  const count = WATER_ANIM_CONFIG.totalParticles;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const origins = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const lifetimes = new Float32Array(count);
  const phases = new Float32Array(count);
  const kinds = new Uint8Array(count);
  const auxParams = new Float32Array(count * 3);

  let pIdx = 0;

  // 1. Центральные гейзеры (+0.65 м -> +5.800 м): 800 частиц (по 400 на чашу)
  for (const cx of WATER_ANIM_CONFIG.circularFountainX) {
    for (let i = 0; i < WATER_ANIM_CONFIG.geyserCountPerFountain; i++) {
      const idx = pIdx++;
      const isCore = i % 2 === 0;

      kinds[idx] = isCore ? ParticleKind.GeyserCore : ParticleKind.GeyserMist;
      lifetimes[idx] = 2.05 + ((i % 11) - 5) * 0.02; // индивидуальный разброс полета
      phases[idx] = (i / WATER_ANIM_CONFIG.geyserCountPerFountain + ((i * 37) % 100) * 0.0001) % 1.0;

      // Источник: сопло гейзера на отметке +0.65 м
      origins[idx * 3 + 0] = cx;
      origins[idx * 3 + 1] = 0.65;
      origins[idx * 3 + 2] = 0.0;

      // Радиальный разлет по золотому углу
      const sprayAngle = ((i * 137.5) * Math.PI) / 180;
      if (isCore) {
        // Плотный восходящий столб (узкий угол разлета)
        const coreSpeed = 0.08 + (i % 7) * 0.025;
        velocities[idx * 3 + 0] = Math.cos(sprayAngle) * coreSpeed;
        velocities[idx * 3 + 1] = 10.05 + ((i % 9) - 4) * 0.08;
        velocities[idx * 3 + 2] = Math.sin(sprayAngle) * coreSpeed;

        // Яркая белая вспененная сердцевина
        colors[idx * 3 + 0] = 0.96;
        colors[idx * 3 + 1] = 0.99;
        colors[idx * 3 + 2] = 1.0;
      } else {
        // Наружный купол капель и тумана (более широкий разлет на вершине +5.80 м)
        const mistSpeed = 0.28 + (i % 13) * 0.05;
        velocities[idx * 3 + 0] = Math.cos(sprayAngle) * mistSpeed;
        velocities[idx * 3 + 1] = 9.95 + ((i % 7) - 3) * 0.07;
        velocities[idx * 3 + 2] = Math.sin(sprayAngle) * mistSpeed;

        // Лазурно-голубые полупрозрачные капли
        colors[idx * 3 + 0] = 0.82;
        colors[idx * 3 + 1] = 0.94;
        colors[idx * 3 + 2] = 1.0;
      }
    }
  }

  // 2. 32 непрерывные веерные наклонные струи: 640 частиц (по 20 на каждую струю)
  for (const cx of WATER_ANIM_CONFIG.circularFountainX) {
    for (let j = 0; j < WATER_ANIM_CONFIG.fanJetsPerFountain; j++) {
      const jetAngle = (j / WATER_ANIM_CONFIG.fanJetsPerFountain) * Math.PI * 2;
      const cosA = Math.cos(jetAngle);
      const sinA = Math.sin(jetAngle);

      const nozzleX = cx + cosA * 1.9;
      const nozzleY = 0.65;
      const nozzleZ = sinA * 1.9;

      for (let p = 0; p < WATER_ANIM_CONFIG.particlesPerFanJet; p++) {
        const idx = pIdx++;
        kinds[idx] = ParticleKind.FanJet;
        lifetimes[idx] = 0.96;
        phases[idx] = (p / WATER_ANIM_CONFIG.particlesPerFanJet + (j * 0.03)) % 1.0;

        origins[idx * 3 + 0] = nozzleX;
        origins[idx * 3 + 1] = nozzleY;
        origins[idx * 3 + 2] = nozzleZ;

        // Скорость внутрь к центру чаши (-cosA, -sinA) с органическим волновым смещением
        const inSpeed = 1.62 + ((p % 5) - 2) * 0.03;
        velocities[idx * 3 + 0] = -cosA * inSpeed;
        velocities[idx * 3 + 1] = 4.75 + ((p % 3) - 1) * 0.06;
        velocities[idx * 3 + 2] = -sinA * inSpeed;

        auxParams[idx * 3 + 0] = j; // индекс струи
        auxParams[idx * 3 + 1] = p; // номер капли

        // Кристально-чистый лазурный градиент
        colors[idx * 3 + 0] = 0.74;
        colors[idx * 3 + 1] = 0.92;
        colors[idx * 3 + 2] = 1.0;
      }
    }
  }

  // 3. 12 пенных форсунок вокруг золотой эмблемы AUT: 192 частицы (по 16 на форсунку)
  for (let k = 0; k < WATER_ANIM_CONFIG.foamNozzleCount; k++) {
    const foamAngle = (k / WATER_ANIM_CONFIG.foamNozzleCount) * Math.PI * 2;
    const fx = Math.cos(foamAngle) * 2.2;
    const fz = Math.sin(foamAngle) * 0.9;
    const fy = 2.57;

    for (let p = 0; p < WATER_ANIM_CONFIG.particlesPerFoamNozzle; p++) {
      const idx = pIdx++;
      kinds[idx] = ParticleKind.FoamNozzle;
      lifetimes[idx] = 0.62 + (p % 4) * 0.03;
      phases[idx] = (p / WATER_ANIM_CONFIG.particlesPerFoamNozzle + k * 0.08) % 1.0;

      origins[idx * 3 + 0] = fx;
      origins[idx * 3 + 1] = fy;
      origins[idx * 3 + 2] = fz;

      // Бурное кипение пены
      const swirl = ((p * 72 + k * 30) * Math.PI) / 180;
      const swirlRad = 0.06 + (p % 3) * 0.03;
      velocities[idx * 3 + 0] = Math.cos(swirl) * swirlRad;
      velocities[idx * 3 + 1] = 2.95 + ((p % 5) - 2) * 0.08;
      velocities[idx * 3 + 2] = Math.sin(swirl) * swirlRad;

      // Сверкающая белоснежная пена
      colors[idx * 3 + 0] = 0.98;
      colors[idx * 3 + 1] = 1.0;
      colors[idx * 3 + 2] = 1.0;
    }
  }

  // 4. Водопадные переливы ступенчатого каскада: 320 частиц (по 160 Север/Юг)
  const halfCurtain = WATER_ANIM_CONFIG.cascadeCurtainParticles / 2;
  const tiersY = [2.15, 1.70, 1.25, 0.80];
  for (let side = 0; side < 2; side++) {
    const wz = side === 0 ? -3.0 : 3.0;
    const signZ = side === 0 ? -1 : 1;

    for (let i = 0; i < halfCurtain; i++) {
      const idx = pIdx++;
      kinds[idx] = ParticleKind.CascadeCurtain;
      lifetimes[idx] = 0.78 + (i % 5) * 0.02;
      phases[idx] = (i / halfCurtain) % 1.0;

      const spreadX = -4.3 + (i / (halfCurtain - 1)) * 8.6;
      const startTierY = tiersY[i % tiersY.length];

      origins[idx * 3 + 0] = spreadX;
      origins[idx * 3 + 1] = startTierY;
      origins[idx * 3 + 2] = wz;

      velocities[idx * 3 + 0] = ((i % 5) - 2) * 0.04;
      velocities[idx * 3 + 1] = -0.4 - (i % 3) * 0.15;
      velocities[idx * 3 + 2] = signZ * (0.18 + (i % 4) * 0.04);

      colors[idx * 3 + 0] = 0.80;
      colors[idx * 3 + 1] = 0.94;
      colors[idx * 3 + 2] = 1.0;
    }
  }

  // 5. Всплески, короны брызг и круги ряби: 248 частиц
  // 5a. Брызговые короны вокруг оснований 2 гейзеров (120 частиц, по 60 на чашу)
  for (let s = 0; s < 2; s++) {
    const cx = WATER_ANIM_CONFIG.circularFountainX[s];
    for (let i = 0; i < 60; i++) {
      const idx = pIdx++;
      kinds[idx] = ParticleKind.SplashCrown;
      lifetimes[idx] = 0.45;
      phases[idx] = (i / 60) % 1.0;

      origins[idx * 3 + 0] = cx;
      origins[idx * 3 + 1] = 0.63;
      origins[idx * 3 + 2] = 0.0;

      const crownAngle = (i / 60) * Math.PI * 2;
      const crownSpeed = 0.85 + (i % 4) * 0.2;
      velocities[idx * 3 + 0] = Math.cos(crownAngle) * crownSpeed;
      velocities[idx * 3 + 1] = 1.85 + (i % 3) * 0.4; // всплеск вверх
      velocities[idx * 3 + 2] = Math.sin(crownAngle) * crownSpeed;

      colors[idx * 3 + 0] = 0.96;
      colors[idx * 3 + 1] = 0.99;
      colors[idx * 3 + 2] = 1.0;
    }
  }

  // 5b. Всплески при падении веерных струй (64 частицы, по 2 на каждую из 32 струй)
  for (let s = 0; s < 2; s++) {
    const cx = WATER_ANIM_CONFIG.circularFountainX[s];
    for (let j = 0; j < 32; j++) {
      const idx = pIdx++;
      kinds[idx] = ParticleKind.SplashCrown;
      lifetimes[idx] = 0.38;
      phases[idx] = (j / 32) % 1.0;

      const angle = (j / 16) * Math.PI * 2;
      origins[idx * 3 + 0] = cx - Math.cos(angle) * 0.35;
      origins[idx * 3 + 1] = 0.63;
      origins[idx * 3 + 2] = -Math.sin(angle) * 0.35;

      velocities[idx * 3 + 0] = Math.cos(angle) * 0.35;
      velocities[idx * 3 + 1] = 1.25;
      velocities[idx * 3 + 2] = Math.sin(angle) * 0.35;

      colors[idx * 3 + 0] = 0.92;
      colors[idx * 3 + 1] = 0.97;
      colors[idx * 3 + 2] = 1.0;
    }
  }

  // 5c. Расходящиеся кольца ряби на воде (64 частицы, по 32 на чашу)
  for (let s = 0; s < 2; s++) {
    const cx = WATER_ANIM_CONFIG.circularFountainX[s];
    for (let i = 0; i < 32; i++) {
      const idx = pIdx++;
      kinds[idx] = ParticleKind.BasinRipple;
      lifetimes[idx] = 1.35;
      phases[idx] = (i / 32) % 1.0;

      origins[idx * 3 + 0] = cx;
      origins[idx * 3 + 1] = 0.625;
      origins[idx * 3 + 2] = 0.0;

      const angle = (i / 32) * Math.PI * 2;
      auxParams[idx * 3 + 0] = angle;
      auxParams[idx * 3 + 1] = 1.85; // максимальный радиус круга ряби

      velocities[idx * 3 + 0] = 0;
      velocities[idx * 3 + 1] = 0;
      velocities[idx * 3 + 2] = 0;

      colors[idx * 3 + 0] = 0.85;
      colors[idx * 3 + 1] = 0.95;
      colors[idx * 3 + 2] = 1.0;
    }
  }

  return {
    positions,
    colors,
    origins,
    velocities,
    lifetimes,
    phases,
    kinds,
    auxParams,
  };
}

/**
 * Высокопроизводительный компонент процедурной анимации воды для CampusFountain:
 * - Ровно 1 Draw Call через THREE.Points (2200 частиц).
 * - Реалистичная физика: баллистика, аэродинамическое рассеяние, волновое колыхание струй.
 * - Нулевые аллокации в анимационном цикле useFrame.
 * - Дросселирование расчетов на больших расстояниях камеры.
 */
export function FountainWaterAnimation() {
  const pointsRef = useRef<THREE.Points>(null);
  const worldPosRef = useRef(new THREE.Vector3());
  const frameCountRef = useRef(0);
  const elapsedRef = useRef(0);

  // Статические буферы и данные частиц
  const staticData = useMemo(() => initializeParticleBuffers(), []);

  // Высокодетализированная текстура капель в памяти
  const dropletTexture = useMemo(() => createDropletTexture(), []);

  // Буферная геометрия Three.js с позициями и цветами вершин
  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(staticData.positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(staticData.colors, 3));
    return geom;
  }, [staticData]);

  // Материал частиц воды с мягкими круглыми каплями
  const material = useMemo(() => {
    const mat = new THREE.PointsMaterial({
      size: WATER_ANIM_CONFIG.particleSize,
      vertexColors: true,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      blending: THREE.NormalBlending,
      map: dropletTexture ?? undefined,
      sizeAttenuation: true,
    });
    return mat;
  }, [dropletTexture]);

  // Цикл покадровой симуляции
  useFrame(({ camera }, delta) => {
    const points = pointsRef.current;
    if (!points) return;

    const dt = Math.min(delta, 0.05);
    elapsedRef.current += dt;
    const time = elapsedRef.current;

    // Проверка дистанции камеры: адаптивное ступенчатое дросселирование симуляции
    frameCountRef.current++;
    points.getWorldPosition(worldPosRef.current);
    const camDistSq = camera.position.distanceToSquared(worldPosRef.current);

    if (camDistSq > WATER_ANIM_CONFIG.distanceThrottlingSq) {
      if (frameCountRef.current % 4 !== 0) return;
    } else if (camDistSq > 6400) { // > 80 м
      if (frameCountRef.current % 3 !== 0) return;
    } else if (camDistSq > 1600) { // > 40 м
      if (frameCountRef.current % 2 !== 0) return;
    } else {
      // Вблизи (< 40 м): частота обновления 30 Гц (через кадр) визуально неотличима
      // от 60 Гц для водных брызг, но снижает нагрузку на CPU и шину GPU в 2 раза
      if (frameCountRef.current % 2 !== 0) return;
    }

    const {
      positions,
      origins,
      velocities,
      lifetimes,
      phases,
      kinds,
      auxParams,
    } = staticData;

    const g = WATER_ANIM_CONFIG.gravity;
    const count = WATER_ANIM_CONFIG.totalParticles;

    // Обновление позиций частиц без аллокаций
    for (let i = 0; i < count; i++) {
      const idx3 = i * 3;
      const lt = lifetimes[i];
      const tau = ((time / lt) + phases[i]) % 1.0;
      const s = tau * lt;

      const kind = kinds[i];
      const x0 = origins[idx3 + 0];
      const y0 = origins[idx3 + 1];
      const z0 = origins[idx3 + 2];
      const vx = velocities[idx3 + 0];
      const vy = velocities[idx3 + 1];
      const vz = velocities[idx3 + 2];

      if (kind === ParticleKind.GeyserCore) {
        // Плотное восходящее ядро гейзера (+0.65 -> +5.80 м)
        positions[idx3 + 0] = x0 + vx * s;
        const curY = y0 + vy * s - 0.5 * g * s * s;
        positions[idx3 + 1] = Math.max(0.62, curY);
        positions[idx3 + 2] = z0 + vz * s;
      } else if (kind === ParticleKind.GeyserMist) {
        // Раскрывающийся купол капель и тумана (расширение в верхней фазе s > 0.7 с)
        const expansion = s > 0.7 ? 1.0 + (s - 0.7) * 1.8 : 1.0;
        positions[idx3 + 0] = x0 + vx * s * expansion;
        const curY = y0 + vy * s - 0.5 * g * s * s;
        positions[idx3 + 1] = Math.max(0.62, curY);
        positions[idx3 + 2] = z0 + vz * s * expansion;
      } else if (kind === ParticleKind.FanJet) {
        // Веерные струи: параболическая арка с естественным волновым колыханием струи
        const waveFlutter = Math.sin(s * 14.0 + auxParams[i * 3 + 0]) * 0.025;
        positions[idx3 + 0] = x0 + vx * s;
        const curY = y0 + vy * s - 0.5 * g * s * s + waveFlutter;
        positions[idx3 + 1] = Math.max(0.62, curY);
        positions[idx3 + 2] = z0 + vz * s;
      } else if (kind === ParticleKind.FoamNozzle) {
        // Пенные форсунки: активное бурление над соплом
        positions[idx3 + 0] = x0 + vx * s;
        const curY = y0 + vy * s - 0.5 * g * s * s;
        positions[idx3 + 1] = Math.max(2.37, curY);
        positions[idx3 + 2] = z0 + vz * s;
      } else if (kind === ParticleKind.CascadeCurtain) {
        // Водопадные переливы: падение капель по ступеням каскада
        positions[idx3 + 0] = x0 + vx * s;
        const curY = y0 + vy * s - 0.5 * g * s * s;
        positions[idx3 + 1] = Math.max(0.45, curY);
        positions[idx3 + 2] = z0 + vz * s;
      } else if (kind === ParticleKind.SplashCrown) {
        // Брызговая корона: всплески вверх и в стороны при ударе о воду
        positions[idx3 + 0] = x0 + vx * s;
        const curY = y0 + vy * s - 0.5 * g * s * s;
        positions[idx3 + 1] = Math.max(0.62, curY);
        positions[idx3 + 2] = z0 + vz * s;
      } else if (kind === ParticleKind.BasinRipple) {
        // Расходящиеся круги ряби на поверхности воды
        const angle = auxParams[i * 3 + 0];
        const maxR = auxParams[i * 3 + 1];
        const r = tau * maxR;
        positions[idx3 + 0] = x0 + Math.cos(angle) * r;
        positions[idx3 + 1] = y0;
        positions[idx3 + 2] = z0 + Math.sin(angle) * r;
      }
    }

    geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points
      ref={pointsRef}
      geometry={geometry}
      material={material}
      frustumCulled={false}
    />
  );
}
