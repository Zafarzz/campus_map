import { useMemo } from 'react';
import * as THREE from 'three';
import {
  getAjouBannerTexture,
  getAjouSteleTexture,
  getAutGateLogoTexture,
} from './facades/facadeTextures';

export const MAIN_ENTRANCE_WIDTH = 18.8;

export const MAIN_ENTRANCE_MATERIALS = {
  // КПП (Паспорт цветового решения)
  k1_roof: '#2B2E34', // RAL 7021 dark anthracite
  k2_fascia: '#F2F7F5', // RAL 9016 matte white
  k3_glazing: '#8BB0AD', // turquoise tinted glass
  k4_marble: '#ECECE9', // white marble
  k5_plinth: '#4A4E54', // RAL 7024 graphite gray
  k6_logo: '#BA6F27', // RAL 1036 bronze gold AUT logo
  k7_turnstiles: '#B8C0CB', // RAL 9006 brushed stainless steel
  k8_metal: '#1E2024', // RAL 9005 matte black metal
  sv1_light: '#FFF3BD', // LED 4000K soffit downlights
  sv2_indicator: '#FFAA00', // Amber card reader indicator

  // Ограждение, павильон, стела и фонари (Чертеж ограждения и генплан)
  z1_fenceMetal: '#363A42', // RAL 7024 металлический забор
  z2_fenceConcrete: '#8C8982', // Бетонный цоколь ограждения
  p1_pavilionRoof: '#D8DDD6', // RAL 9002 шатровая кровля павильона
  p2_pavilionFrame: '#F7F7F5', // Белый профиль витража павильона
  sv4_mastLight: '#FFF3B0', // Мачта освещения LED 5000K
  steleStone: '#2B2E34', // Гранитная стела
  bannerNavy: '#172554', // Инфо-баннер
} as const;

export type MainEntranceGateProps = {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
};

/**
 * Architectural 3D model of the Main Entrance & Checkpoint (КПП AUT),
 * pylon with bronze-gold AUT 2020 logo, turnstiles, sliding gate,
 * monumental stele, gazebo pavilion, info banner and lighting masts.
 *
 * Fully conforms to official CAD elevation sheets and color passport.
 * Walls terminate strictly under roof soffits with zero roof penetration.
 */
export function MainEntranceGate({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
}: MainEntranceGateProps) {
  const materials = useMemo(() => {
    // К-1: Roof & drip edge (#2B2E34, RAL 7021 dark anthracite)
    const roofMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.k1_roof,
      roughness: 0.4,
      metalness: 0.2,
    });

    // К-2: Fascia & soffits (#F2F7F5, RAL 9016 matte white)
    const fasciaMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.k2_fascia,
      roughness: 0.6,
      metalness: 0.05,
    });

    // К-3: Glazing (#8BB0AD, turquoise tinted glass)
    const glassMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.k3_glazing,
      roughness: 0.08,
      metalness: 0.1,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });

    // К-4: Marble walls (#ECECE9, white marble)
    const wallMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.k4_marble,
      roughness: 0.8,
      metalness: 0.02,
    });

    // К-5: Plinth (#4A4E54, RAL 7024 graphite gray)
    const plinthMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.k5_plinth,
      roughness: 0.8,
      metalness: 0.1,
    });

    // К-6: Bronze gold AUT logo (#BA6F27, RAL 1036)
    const goldLogoMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.k6_logo,
      roughness: 0.2,
      metalness: 0.85,
    });

    // К-7: Turnstiles (#B8C0CB, RAL 9006 brushed stainless steel)
    const turnstileMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.k7_turnstiles,
      roughness: 0.15,
      metalness: 0.9,
    });

    // К-8: Matte black metal for gates and window frames (#1E2024, RAL 9005)
    const metalMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.k8_metal,
      roughness: 0.5,
      metalness: 0.6,
    });

    // СВ-1: Recessed LED 4000K spotlights (#FFF3BD)
    const spotLightMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.sv1_light,
      emissive: MAIN_ENTRANCE_MATERIALS.sv1_light,
      emissiveIntensity: 1.0,
      roughness: 0.2,
    });

    // СВ-2: Card reader amber glow (#FFAA00)
    const cardReaderMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.sv2_indicator,
      emissive: MAIN_ENTRANCE_MATERIALS.sv2_indicator,
      emissiveIntensity: 0.8,
      roughness: 0.3,
    });

    // З-1 / З-2: Забор и бетон
    const fenceMetalMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.z1_fenceMetal,
      roughness: 0.5,
      metalness: 0.5,
    });
    const concreteMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.z2_fenceConcrete,
      roughness: 0.9,
      metalness: 0.05,
    });

    // П-1 / П-2: Павильон (беседка)
    const pavilionRoofMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.p1_pavilionRoof,
      roughness: 0.5,
      metalness: 0.1,
    });
    const pavilionFrameMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.p2_pavilionFrame,
      roughness: 0.4,
      metalness: 0.05,
    });

    // СВ-4: Фонари освещения H=4100
    const mastPoleMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.k1_roof,
      roughness: 0.5,
      metalness: 0.6,
    });
    const mastLightMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.sv4_mastLight,
      emissive: MAIN_ENTRANCE_MATERIALS.sv4_mastLight,
      emissiveIntensity: 1.5,
      roughness: 0.2,
    });

    // Стела «AJOU UNIVERSITY» (11000x650, H=1470)
    const steleBodyMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.steleStone,
      roughness: 0.6,
      metalness: 0.15,
    });

    // Инфо-баннер
    const bannerBoardMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.bannerNavy,
      roughness: 0.5,
    });

    return {
      roofMat,
      fasciaMat,
      glassMat,
      wallMat,
      plinthMat,
      goldLogoMat,
      turnstileMat,
      metalMat,
      spotLightMat,
      cardReaderMat,
      fenceMetalMat,
      concreteMat,
      pavilionRoofMat,
      pavilionFrameMat,
      mastPoleMat,
      mastLightMat,
      steleBodyMat,
      bannerBoardMat,
    };
  }, []);

  const logoTexture = useMemo(() => getAutGateLogoTexture(), []);
  const steleTexture = useMemo(() => getAjouSteleTexture(), []);
  const bannerTexture = useMemo(() => getAjouBannerTexture(), []);

  // Geometry calculations:
  // Left Wing: from X = -9.4 to X = +3.4 (dx = 12.8m)
  // Height: left edge = +5.80m, valley = +2.90m (dy = -2.90m)
  const leftAngle = Math.atan2(-2.9, 12.8); // ~ -12.76 deg
  const leftLength = Math.hypot(12.8, 2.9); // ~ 13.12m
  const leftMidX = (-9.4 + 3.4) / 2; // -3.0m
  const leftMidY = (5.8 + 2.9) / 2; // 4.35m

  // Right Wing: from X = +3.4 to X = +9.4 (dx = 6.0m)
  // Height: pylon junction = +4.80m, outer right tip = +8.80m (dy = +4.00m)
  const rightAngle = Math.atan2(4.0, 6.0); // ~ +33.69 deg
  const rightLength = Math.hypot(6.0, 4.0); // ~ 7.21m
  const rightMidX = (3.4 + 9.4) / 2; // +6.4m
  const rightMidY = (4.8 + 8.8) / 2; // 6.80m

  const canopyDepth = 5.6; // Контур вылета консоли кровли 5600 мм из генплана

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* ============================================================== */}
      {/* 1. GROUND BASE & PAVED ENTRANCE APRON                          */}
      {/* ============================================================== */}
      <mesh position={[0, 0.09, 0]} material={materials.plinthMat} receiveShadow>
        <boxGeometry args={[19.6, 0.18, 7.6]} />
      </mesh>
      <mesh position={[0, 0.19, 0]} material={materials.wallMat} receiveShadow>
        <boxGeometry args={[19.4, 0.02, 7.4]} />
      </mesh>

      {/* ============================================================== */}
      {/* 2. SECURITY CABIN (Пост охраны, X: -7.7 to -1.3, W: 6.4m)       */}
      {/* ============================================================== */}
      <group position={[-4.5, 0.18, 0]}>
        {/* Plinth */}
        <mesh position={[0, 0.1, 0]} material={materials.plinthMat} castShadow receiveShadow>
          <boxGeometry args={[6.4, 0.2, 5.0]} />
        </mesh>

        {/* Back solid marble wall - angled with left roof slope to prevent roof penetration */}
        <mesh
          position={[0, 1.75, -2.4]}
          rotation={[0, 0, leftAngle]}
          material={materials.wallMat}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[6.4, 3.5, 0.2]} />
        </mesh>
        {/* Outer Left solid marble wall (X = -3.1 relative to cabin center) */}
        <mesh position={[-3.1, 2.0, 0]} material={materials.wallMat} castShadow receiveShadow>
          <boxGeometry args={[0.2, 4.0, 4.8]} />
        </mesh>
        {/* Inner Right partition wall towards turnstiles (X = +3.1) */}
        <mesh position={[3.1, 1.4, 0]} material={materials.wallMat} castShadow receiveShadow>
          <boxGeometry args={[0.2, 2.8, 4.8]} />
        </mesh>

        {/* A) Left Section: Storefront Panoramic Glazing (X: -3.2 to -0.3, W: 2.9m) */}
        <group position={[-1.75, 0, 2.4]}>
          <mesh position={[0, 2.0, 0]} material={materials.metalMat}>
            <boxGeometry args={[2.9, 4.0, 0.08]} />
          </mesh>
          <mesh position={[0, 2.0, 0.02]} material={materials.glassMat}>
            <boxGeometry args={[2.76, 3.88, 0.04]} />
          </mesh>
          <mesh position={[-0.45, 2.0, 0.03]} material={materials.metalMat}>
            <boxGeometry args={[0.06, 3.88, 0.06]} />
          </mesh>
          <mesh position={[0, 3.6, 0.03]} material={materials.metalMat}>
            <boxGeometry args={[2.76, 0.08, 0.06]} />
          </mesh>
          <mesh position={[0, 2.1, 0.03]} material={materials.metalMat}>
            <boxGeometry args={[2.76, 0.06, 0.06]} />
          </mesh>

          {/* Glazed Entry Door */}
          <mesh position={[0.65, 1.05, 0.04]} material={materials.metalMat}>
            <boxGeometry args={[0.9, 2.0, 0.04]} />
          </mesh>
          <mesh position={[0.65, 1.05, 0.05]} material={materials.glassMat}>
            <boxGeometry args={[0.78, 1.86, 0.02]} />
          </mesh>
          <mesh position={[0.25, 1.0, 0.08]} material={materials.turnstileMat}>
            <boxGeometry args={[0.03, 0.4, 0.03]} />
          </mesh>
        </group>

        {/* B) Right Section: Solid Marble Facade (X: -0.3 to +3.2, W: 3.5m) */}
        <group position={[1.45, 0, 2.4]}>
          {/* Solid Marble Front Wall - angled with left roof slope */}
          <mesh
            position={[0, 1.5, 0]}
            rotation={[0, 0, leftAngle]}
            material={materials.wallMat}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[3.5, 3.0, 0.2]} />
          </mesh>
          <mesh position={[0, 2.1, 0.11]} material={materials.metalMat}>
            <boxGeometry args={[3.52, 0.08, 0.04]} />
          </mesh>
          <mesh position={[0, 2.3, 0.12]} material={materials.cardReaderMat}>
            <boxGeometry args={[0.15, 0.05, 0.04]} />
          </mesh>
        </group>

        {/* Security Officer's Desk Console (visible through glass) */}
        <mesh position={[-2.0, 0.85, 1.2]} material={materials.metalMat}>
          <boxGeometry args={[1.8, 0.75, 0.8]} />
        </mesh>
      </group>

      {/* ============================================================== */}
      {/* 3. TURNSTILE PASSAGE (Проходная с турникетами, X: -1.3 to +3.4) */}
      {/* ============================================================== */}
      <group position={[1.05, 0.18, 0]}>
        <mesh position={[0, 2.2, 0]} rotation={[0, 0, leftAngle * 0.8]} material={materials.glassMat}>
          <boxGeometry args={[4.7, 0.06, 4.6]} />
        </mesh>
        <mesh position={[0, 2.23, 0]} rotation={[0, 0, leftAngle * 0.8]} material={materials.metalMat}>
          <boxGeometry args={[4.75, 0.04, 0.08]} />
        </mesh>

        {/* 3 Optical Stainless Steel Turnstiles (К-7: #B8C0CB) */}
        {[-1.2, 0.0, 1.2].map((tx, idx) => (
          <group key={`turnstile-${idx}`} position={[tx, 0, 0.3]}>
            <mesh position={[0, 0.5, 0]} material={materials.turnstileMat} castShadow>
              <boxGeometry args={[0.28, 1.0, 1.2]} />
            </mesh>
            <mesh position={[0, 1.01, 0]} material={materials.metalMat}>
              <boxGeometry args={[0.26, 0.02, 1.16]} />
            </mesh>
            <mesh position={[0, 1.02, 0.42]} material={materials.cardReaderMat}>
              <boxGeometry args={[0.12, 0.015, 0.12]} />
            </mesh>
            <mesh position={[0.25, 0.55, 0]} material={materials.glassMat}>
              <boxGeometry args={[0.24, 0.65, 0.02]} />
            </mesh>
          </group>
        ))}

        {/* Guide Railings between turnstiles */}
        {[-1.85, -0.6, 0.6, 1.85].map((gx, idx) => (
          <group key={`guide-rail-${idx}`} position={[gx, 0, 0.3]}>
            <mesh position={[0, 0.45, -0.5]} material={materials.turnstileMat}>
              <cylinderGeometry args={[0.025, 0.025, 0.9, 10]} />
            </mesh>
            <mesh position={[0, 0.45, 0.5]} material={materials.turnstileMat}>
              <cylinderGeometry args={[0.025, 0.025, 0.9, 10]} />
            </mesh>
            <mesh position={[0, 0.85, 0]} material={materials.turnstileMat}>
              <boxGeometry args={[0.03, 0.04, 1.0]} />
            </mesh>
            <mesh position={[0, 0.45, 0]} material={materials.glassMat}>
              <boxGeometry args={[0.01, 0.7, 0.96]} />
            </mesh>
          </group>
        ))}

        <mesh position={[2.2, 1.8, 0.3]} rotation={[0, 0, -0.22]} material={materials.glassMat}>
          <boxGeometry args={[0.05, 3.4, 3.8]} />
        </mesh>
        <mesh position={[2.2, 1.8, 0.3]} rotation={[0, 0, -0.22]} material={materials.metalMat}>
          <boxGeometry args={[0.08, 3.45, 0.06]} />
        </mesh>
      </group>

      {/* ============================================================== */}
      {/* 4. CENTRAL MARBLE PYLON & AUT LOGO (X: +3.4 to +5.9, W: 2.5m)   */}
      {/* ============================================================== */}
      <group position={[4.65, 0.18, 0]}>
        <mesh position={[0, 2.3, 0]} material={materials.wallMat} castShadow receiveShadow>
          <boxGeometry args={[2.5, 4.6, 4.0]} />
        </mesh>
        <mesh position={[0, 0.1, 0]} material={materials.plinthMat}>
          <boxGeometry args={[2.55, 0.2, 4.05]} />
        </mesh>

        {/* Bronze-Gold 3D AUT Logo on Front Face (Z = +2.02) */}
        {logoTexture && (
          <mesh position={[0, 2.7, 2.02]}>
            <planeGeometry args={[1.7, 1.7]} />
            <meshStandardMaterial
              map={logoTexture}
              transparent
              roughness={0.2}
              metalness={0.85}
              depthWrite={false}
            />
          </mesh>
        )}

        <mesh position={[-1.22, 1.2, 1.2]} material={materials.metalMat}>
          <boxGeometry args={[0.05, 0.25, 0.15]} />
        </mesh>
        <mesh position={[-1.24, 1.2, 1.2]} material={materials.cardReaderMat}>
          <boxGeometry args={[0.02, 0.1, 0.08]} />
        </mesh>
      </group>

      {/* ============================================================== */}
      {/* 5. VEHICLE TRANSIT LANE & METAL GATE (X: +5.9 to +9.4, W: 3.5m) */}
      {/* ============================================================== */}
      <group position={[7.65, 0.18, 0]}>
        <mesh position={[1.75, 4.4, 0]} material={materials.fasciaMat} castShadow>
          <cylinderGeometry args={[0.22, 0.22, 8.8, 16]} />
        </mesh>
        <mesh position={[1.75, 9.1, 0]} material={materials.metalMat}>
          <cylinderGeometry args={[0.15, 0.15, 1.2, 16]} />
        </mesh>

        <group position={[-0.2, 0, 0.2]}>
          <mesh position={[0, 1.0, 0]} material={materials.metalMat} castShadow>
            <boxGeometry args={[2.9, 2.0, 0.08]} />
          </mesh>
          {[-1.2, -0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9, 1.2].map((gx, idx) => (
            <mesh key={`picket-${idx}`} position={[gx, 1.0, 0]} material={materials.metalMat}>
              <boxGeometry args={[0.04, 1.84, 0.06]} />
            </mesh>
          ))}
          <mesh position={[0, 0.4, 0]} material={materials.metalMat}>
            <boxGeometry args={[2.85, 0.06, 0.07]} />
          </mesh>
          <mesh position={[0, 1.6, 0]} material={materials.metalMat}>
            <boxGeometry args={[2.85, 0.06, 0.07]} />
          </mesh>
          <mesh position={[0, 0.03, 0]} material={materials.plinthMat}>
            <boxGeometry args={[3.2, 0.06, 0.15]} />
          </mesh>
        </group>
      </group>

      {/* ============================================================== */}
      {/* 6. DYNAMIC BUTTERFLY ROOF CANOPY (Крылья кровли)               */}
      {/* ============================================================== */}
      {/* A) LEFT WING: Slopes DOWN from +5.80m (left) to +2.90m (valley) */}
      <group position={[leftMidX, leftMidY, 0]} rotation={[0, 0, leftAngle]}>
        <mesh position={[0, 0, 0]} material={materials.fasciaMat} castShadow receiveShadow>
          <boxGeometry args={[leftLength, 0.65, canopyDepth]} />
        </mesh>
        <mesh position={[0, 0.36, 0]} material={materials.roofMat} castShadow>
          <boxGeometry args={[leftLength + 0.15, 0.1, canopyDepth + 0.15]} />
        </mesh>
        {[-4.8, -2.4, 0.0, 2.4, 4.8].map((lx, idx) => (
          <group key={`spot-left-${idx}`} position={[lx, -0.33, 1.8]}>
            <mesh material={materials.metalMat}>
              <cylinderGeometry args={[0.12, 0.12, 0.03, 12]} />
            </mesh>
            <mesh position={[0, -0.015, 0]} material={materials.spotLightMat}>
              <cylinderGeometry args={[0.09, 0.09, 0.01, 12]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* B) RIGHT WING: Slopes UP from +4.80m (pylon) to +8.80m (outer tip) */}
      <group position={[rightMidX, rightMidY, 0]} rotation={[0, 0, rightAngle]}>
        <mesh position={[0, 0, 0]} material={materials.fasciaMat} castShadow receiveShadow>
          <boxGeometry args={[rightLength, 0.65, canopyDepth]} />
        </mesh>
        <mesh position={[0, 0.36, 0]} material={materials.roofMat} castShadow>
          <boxGeometry args={[rightLength + 0.15, 0.1, canopyDepth + 0.15]} />
        </mesh>
        {[-2.4, -0.8, 0.8, 2.4].map((rx, idx) => (
          <group key={`spot-right-${idx}`} position={[rx, -0.33, 1.8]}>
            <mesh material={materials.metalMat}>
              <cylinderGeometry args={[0.12, 0.12, 0.03, 12]} />
            </mesh>
            <mesh position={[0, -0.015, 0]} material={materials.spotLightMat}>
              <cylinderGeometry args={[0.09, 0.09, 0.01, 12]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* ============================================================== */}
      {/* 7. МОНУМЕНТАЛЬНАЯ СТЕЛА «AJOU UNIVERSITY» (11000x650, H=1470)   */}
      {/* ============================================================== */}
      <group position={[15.5, 0, 0.3]}>
        <mesh position={[0, 0.075, 0]} material={materials.concreteMat} receiveShadow>
          <boxGeometry args={[11.1, 0.15, 0.75]} />
        </mesh>
        <mesh position={[0, 0.81, 0]} material={materials.steleBodyMat} castShadow receiveShadow>
          <boxGeometry args={[11.0, 1.32, 0.65]} />
        </mesh>
        <mesh position={[0, 1.48, 0]} material={materials.metalMat}>
          <boxGeometry args={[11.08, 0.04, 0.7]} />
        </mesh>
        {steleTexture && (
          <mesh position={[0, 0.82, 0.33]}>
            <planeGeometry args={[10.8, 1.2]} />
            <meshStandardMaterial
              map={steleTexture}
              roughness={0.4}
              metalness={0.2}
            />
          </mesh>
        )}
      </group>

      {/* ============================================================== */}
      {/* 8. ИНФО-БАННЕР «AJOU UNIVERSITY INFO BANNER»                   */}
      {/* ============================================================== */}
      <group position={[-11.5, 0, 0]}>
        <mesh position={[-1.4, 1.1, 0]} material={materials.metalMat}>
          <boxGeometry args={[0.08, 2.2, 0.08]} />
        </mesh>
        <mesh position={[1.4, 1.1, 0]} material={materials.metalMat}>
          <boxGeometry args={[0.08, 2.2, 0.08]} />
        </mesh>
        <mesh position={[0, 1.25, 0]} material={materials.bannerBoardMat} castShadow>
          <boxGeometry args={[2.9, 1.6, 0.06]} />
        </mesh>
        {bannerTexture && (
          <mesh position={[0, 1.25, 0.035]}>
            <planeGeometry args={[2.8, 1.5]} />
            <meshStandardMaterial map={bannerTexture} roughness={0.5} />
          </mesh>
        )}
      </group>

      {/* ============================================================== */}
      {/* 9. ОСТЕКЛЕННЫЙ ПАВИЛЬОН (БЕСЕДКА) У ОГРАЖДЕНИЯ                 */}
      {/* ============================================================== */}
      <group position={[-14.5, 0, -3.8]}>
        <mesh position={[0, 0.1, 0]} material={materials.concreteMat} receiveShadow>
          <boxGeometry args={[5.2, 0.2, 4.4]} />
        </mesh>
        <mesh position={[0, 1.3, 0]} material={materials.glassMat}>
          <boxGeometry args={[4.9, 2.2, 4.1]} />
        </mesh>
        {[-2.45, 0, 2.45].map((px, idx) => (
          <mesh key={`pav-post-f-${idx}`} position={[px, 1.3, 2.05]} material={materials.pavilionFrameMat}>
            <boxGeometry args={[0.1, 2.2, 0.1]} />
          </mesh>
        ))}
        {[-2.45, 0, 2.45].map((px, idx) => (
          <mesh key={`pav-post-b-${idx}`} position={[px, 1.3, -2.05]} material={materials.pavilionFrameMat}>
            <boxGeometry args={[0.1, 2.2, 0.1]} />
          </mesh>
        ))}
        <mesh position={[0, 2.45, 0]} material={materials.pavilionFrameMat}>
          <boxGeometry args={[5.2, 0.12, 4.4]} />
        </mesh>
        <mesh position={[0, 3.15, 0]} rotation={[0, Math.PI / 4, 0]} material={materials.pavilionRoofMat} castShadow>
          <coneGeometry args={[3.6, 1.3, 4]} />
        </mesh>
        <mesh position={[0, 3.9, 0]} material={materials.metalMat}>
          <cylinderGeometry args={[0.03, 0.05, 0.4, 8]} />
        </mesh>
      </group>

      {/* ============================================================== */}
      {/* 10. МАЧТЫ ОСВЕЩЕНИЯ СВ-4 (H=4100 мм, 4 линзы LED 5000K)        */}
      {/* ============================================================== */}
      {[
        { x: -8.5, z: 1.2, rotY: 0 },
        { x: 9.6, z: 3.8, rotY: 0 },
        { x: 15.5, z: 1.1, rotY: 0 },
      ].map((mast, idx) => (
        <group key={`light-mast-${idx}`} position={[mast.x, 0, mast.z]} rotation={[0, mast.rotY, 0]}>
          <mesh position={[0, 2.05, 0]} material={materials.mastPoleMat}>
            <cylinderGeometry args={[0.06, 0.08, 4.1, 12]} />
          </mesh>
          <group position={[0, 4.1, 0.25]} rotation={[-0.45, 0, 0]}>
            <mesh position={[0, 0, 0]} material={materials.mastPoleMat}>
              <boxGeometry args={[0.22, 0.08, 0.7]} />
            </mesh>
            {[-0.24, -0.08, 0.08, 0.24].map((ly, lidx) => (
              <mesh key={`lens-${lidx}`} position={[0, -0.045, ly]} material={materials.mastLightMat}>
                <cylinderGeometry args={[0.04, 0.04, 0.02, 12]} />
              </mesh>
            ))}
          </group>
        </group>
      ))}
    </group>
  );
}
