import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  StaticGeometryBatcher,
  disposeMergedMap,
  NO_RAYCAST,
} from './geometry/staticGeometryMerger';
import {
  getAjouBannerTexture,
  getAjouSteleTexture,
  getAutGateLogoTexture,
} from './facades/facadeTextures';
import { sharedCampusAudio } from '../../game/audio/campusAudioEngine';

export const MAIN_ENTRANCE_WIDTH = 18.8;

export const MAIN_ENTRANCE_MATERIALS = {
  k1_roof: '#2B2E34',
  k2_fascia: '#F2F7F5',
  k3_glazing: '#8BB0AD',
  k4_marble: '#ECECE9',
  k5_plinth: '#4A4E54',
  k6_logo: '#BA6F27',
  k7_turnstiles: '#B8C0CB',
  k8_metal: '#1E2024',
  sv1_light: '#FFF3BD',
  sv2_indicator: '#FFAA00',
  z1_fenceMetal: '#363A42',
  z2_fenceConcrete: '#8C8982',
  p1_pavilionRoof: '#D8DDD6',
  p2_pavilionFrame: '#F7F7F5',
  sv4_mastLight: '#FFF3B0',
  steleStone: '#2B2E34',
  bannerNavy: '#172554',
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
 */
export function MainEntranceGate({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
}: MainEntranceGateProps) {
  const logoTexture = useMemo(() => getAutGateLogoTexture(), []);
  const steleTexture = useMemo(() => getAjouSteleTexture(), []);
  const bannerTexture = useMemo(() => getAjouBannerTexture(), []);

  const materials = useMemo(() => {
    const roofMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.k1_roof,
      roughness: 0.4,
      metalness: 0.2,
    });

    const fasciaMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.k2_fascia,
      roughness: 0.6,
      metalness: 0.05,
    });

    const glassMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.k3_glazing,
      roughness: 0.08,
      metalness: 0.1,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });

    const wallMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.k4_marble,
      roughness: 0.8,
      metalness: 0.02,
    });

    const plinthMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.k5_plinth,
      roughness: 0.8,
      metalness: 0.1,
    });

    const turnstileMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.k7_turnstiles,
      roughness: 0.15,
      metalness: 0.9,
    });

    const metalMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.k8_metal,
      roughness: 0.5,
      metalness: 0.6,
    });

    const spotLightMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.sv1_light,
      emissive: MAIN_ENTRANCE_MATERIALS.sv1_light,
      emissiveIntensity: 1.0,
      roughness: 0.2,
    });

    const cardReaderMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.sv2_indicator,
      emissive: MAIN_ENTRANCE_MATERIALS.sv2_indicator,
      emissiveIntensity: 0.8,
      roughness: 0.3,
    });

    const concreteMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.z2_fenceConcrete,
      roughness: 0.9,
      metalness: 0.05,
    });

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

    const steleBodyMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.steleStone,
      roughness: 0.6,
      metalness: 0.15,
    });

    const bannerBoardMat = new THREE.MeshStandardMaterial({
      color: MAIN_ENTRANCE_MATERIALS.bannerNavy,
      roughness: 0.5,
    });

    const logoPlaneMat = new THREE.MeshStandardMaterial({
      map: logoTexture ?? null,
      transparent: true,
      roughness: 0.2,
      metalness: 0.85,
      depthWrite: false,
    });

    const stelePlaneMat = new THREE.MeshStandardMaterial({
      map: steleTexture ?? null,
      roughness: 0.4,
      metalness: 0.2,
    });

    const bannerPlaneMat = new THREE.MeshStandardMaterial({
      map: bannerTexture ?? null,
      roughness: 0.5,
    });

    return {
      roofMat,
      fasciaMat,
      glassMat,
      wallMat,
      plinthMat,
      turnstileMat,
      metalMat,
      spotLightMat,
      cardReaderMat,
      concreteMat,
      pavilionRoofMat,
      pavilionFrameMat,
      mastPoleMat,
      mastLightMat,
      steleBodyMat,
      bannerBoardMat,
      logoPlaneMat,
      stelePlaneMat,
      bannerPlaneMat,
    };
  }, [logoTexture, steleTexture, bannerTexture]);

  const leftAngle = Math.atan2(-2.9, 12.8);
  const leftLength = Math.hypot(12.8, 2.9);
  const leftMidX = (-9.4 + 3.4) / 2;
  const leftMidY = (5.8 + 2.9) / 2;

  const rightAngle = Math.atan2(4.0, 6.0);
  const rightLength = Math.hypot(6.0, 4.0);
  const rightMidX = (3.4 + 9.4) / 2;
  const rightMidY = (4.8 + 8.8) / 2;

  const canopyDepth = 5.6;

  const merged = useMemo(() => {
    const b = new StaticGeometryBatcher();

    // 1. Ground base & paved entrance apron
    b.addBox('plinth', [19.6, 0.18, 7.6], [0, 0.09, 0]);
    b.addBox('wall', [19.4, 0.02, 7.4], [0, 0.19, 0]);

    // 2. Security cabin (offset [-4.5, 0.18, 0])
    const scX = -4.5;
    const scY = 0.18;
    b.addBox('plinth', [6.4, 0.2, 5.0], [scX, scY + 0.1, 0]);
    b.addBox('wall', [6.4, 3.5, 0.2], [scX, scY + 1.75, -2.4], [0, 0, leftAngle]);
    b.addBox('wall', [0.2, 4.0, 4.8], [scX - 3.1, scY + 2.0, 0]);
    b.addBox('wall', [0.2, 2.8, 4.8], [scX + 3.1, scY + 1.4, 0]);

    // Storefront glazing (offset [-1.75, 0, 2.4] inside cabin)
    const sfX = scX - 1.75;
    const sfZ = 2.4;
    b.addBox('metal', [2.9, 4.0, 0.08], [sfX, scY + 2.0, sfZ]);
    b.addBox('glass', [2.76, 3.88, 0.04], [sfX, scY + 2.0, sfZ + 0.02]);
    b.addBox('metal', [0.06, 3.88, 0.06], [sfX - 0.45, scY + 2.0, sfZ + 0.03]);
    b.addBox('metal', [2.76, 0.08, 0.06], [sfX, scY + 3.6, sfZ + 0.03]);
    b.addBox('metal', [2.76, 0.06, 0.06], [sfX, scY + 2.1, sfZ + 0.03]);
    b.addBox('metal', [0.9, 2.0, 0.04], [sfX + 0.65, scY + 1.05, sfZ + 0.04]);
    b.addBox('glass', [0.78, 1.86, 0.02], [sfX + 0.65, scY + 1.05, sfZ + 0.05]);
    b.addBox('turnstile', [0.03, 0.4, 0.03], [sfX + 0.25, scY + 1.0, sfZ + 0.08]);

    // Solid marble facade right section (offset [1.45, 0, 2.4] inside cabin)
    const mrX = scX + 1.45;
    b.addBox('wall', [3.5, 3.0, 0.2], [mrX, scY + 1.5, 2.4], [0, 0, leftAngle]);
    b.addBox('metal', [3.52, 0.08, 0.04], [mrX, scY + 2.1, 2.51]);
    b.addBox('cardReader', [0.15, 0.05, 0.04], [mrX, scY + 2.3, 2.52]);
    b.addBox('metal', [1.8, 0.75, 0.8], [scX - 2.0, scY + 0.85, 1.2]);

    // 3. Turnstile passage (offset [1.05, 0.18, 0])
    const tpX = 1.05;
    const tpY = 0.18;
    b.addBox('glass', [4.7, 0.06, 4.6], [tpX, tpY + 2.2, 0], [0, 0, leftAngle * 0.8]);
    b.addBox('metal', [4.75, 0.04, 0.08], [tpX, tpY + 2.23, 0], [0, 0, leftAngle * 0.8]);

    for (const tx of [-1.2, 0.0, 1.2]) {
      b.addBox('turnstile', [0.28, 1.0, 1.2], [tpX + tx, tpY + 0.5, 0.3]);
      b.addBox('metal', [0.26, 0.02, 1.16], [tpX + tx, tpY + 1.01, 0.3]);
    }

    // Outer side glass barriers (flanking turnstiles north & south)
    for (const gx of [-1.85, 1.85]) {
      b.addCylinder('turnstile', [0.025, 0.025, 0.9, 8], [tpX + gx, tpY + 0.45, -0.2]);
      b.addCylinder('turnstile', [0.025, 0.025, 0.9, 8], [tpX + gx, tpY + 0.45, 0.8]);
      b.addBox('turnstile', [0.03, 0.04, 1.0], [tpX + gx, tpY + 0.85, 0.3]);
      b.addBox('glass', [0.01, 0.7, 0.96], [tpX + gx, tpY + 0.45, 0.3]);
    }
    b.addBox('glass', [0.05, 3.4, 3.8], [tpX + 2.2, tpY + 1.8, 0.3], [0, 0, -0.22]);
    b.addBox('metal', [0.08, 3.45, 0.06], [tpX + 2.2, tpY + 1.8, 0.3], [0, 0, -0.22]);

    // 4. Central marble pylon (offset [4.65, 0.18, 0])
    const pyX = 4.65;
    const pyY = 0.18;
    b.addBox('wall', [2.5, 4.6, 4.0], [pyX, pyY + 2.3, 0]);
    b.addBox('plinth', [2.55, 0.2, 4.05], [pyX, pyY + 0.1, 0]);
    b.addBox('metal', [0.05, 0.25, 0.15], [pyX - 1.22, pyY + 1.2, 1.2]);
    b.addBox('cardReader', [0.02, 0.1, 0.08], [pyX - 1.24, pyY + 1.2, 1.2]);

    // 5. Vehicle transit lane & metal gate (offset [7.65, 0.18, 0])
    const vtX = 7.65;
    const vtY = 0.18;
    b.addCylinder('fascia', [0.22, 0.22, 8.8, 12], [vtX + 1.75, vtY + 4.4, 0]);
    b.addCylinder('metal', [0.15, 0.15, 1.2, 12], [vtX + 1.75, vtY + 9.1, 0]);

    const gxBase = vtX - 0.2;
    const gzBase = 0.2;
    b.addBox('metal', [2.9, 2.0, 0.08], [gxBase, vtY + 1.0, gzBase]);
    for (const gx of [-1.2, -0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9, 1.2]) {
      b.addBox('metal', [0.04, 1.84, 0.06], [gxBase + gx, vtY + 1.0, gzBase]);
    }
    b.addBox('metal', [2.85, 0.06, 0.07], [gxBase, vtY + 0.4, gzBase]);
    b.addBox('metal', [2.85, 0.06, 0.07], [gxBase, vtY + 1.6, gzBase]);
    b.addBox('plinth', [3.2, 0.06, 0.15], [gxBase, vtY + 0.03, gzBase]);

    // 6. Dynamic butterfly roof canopy
    // Helper for rotated wing items
    const addWing = (midX: number, midY: number, angle: number, len: number, spotXs: number[]) => {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const toWorld = (lx: number, ly: number): [number, number] => [
        midX + lx * cos - ly * sin,
        midY + lx * sin + ly * cos,
      ];
      b.addBox('fascia', [len, 0.65, canopyDepth], [midX, midY, 0], [0, 0, angle]);
      const [rx, ry] = toWorld(0, 0.36);
      b.addBox('roof', [len + 0.15, 0.1, canopyDepth + 0.15], [rx, ry, 0], [0, 0, angle]);
      for (const sx of spotXs) {
        const [spx, spy] = toWorld(sx, -0.33);
        b.addCylinder('metal', [0.12, 0.12, 0.03, 10], [spx, spy, 1.8], [0, 0, angle]);
        const [lpx, lpy] = toWorld(sx, -0.345);
        b.addCylinder('spotLight', [0.09, 0.09, 0.01, 10], [lpx, lpy, 1.8], [0, 0, angle]);
      }
    };
    addWing(leftMidX, leftMidY, leftAngle, leftLength, [-4.8, -2.4, 0.0, 2.4, 4.8]);
    addWing(rightMidX, rightMidY, rightAngle, rightLength, [-2.4, -0.8, 0.8, 2.4]);

    // 7. Monumental stele (offset [15.5, 0, 0.3])
    b.addBox('concrete', [11.1, 0.15, 0.75], [15.5, 0.075, 0.3]);
    b.addBox('steleBody', [11.0, 1.32, 0.65], [15.5, 0.81, 0.3]);
    b.addBox('metal', [11.08, 0.04, 0.7], [15.5, 1.48, 0.3]);

    // 8. Info banner (offset [-11.5, 0, 0])
    b.addBox('metal', [0.08, 2.2, 0.08], [-11.5 - 1.4, 1.1, 0]);
    b.addBox('metal', [0.08, 2.2, 0.08], [-11.5 + 1.4, 1.1, 0]);
    b.addBox('bannerBoard', [2.9, 1.6, 0.06], [-11.5, 1.25, 0]);

    // 9. Glazed pavilion (offset [-14.5, 0, -3.8])
    const pvX = -14.5;
    const pvZ = -3.8;
    b.addBox('concrete', [5.2, 0.2, 4.4], [pvX, 0.1, pvZ]);
    b.addBox('glass', [4.9, 2.2, 4.1], [pvX, 1.3, pvZ]);
    for (const px of [-2.45, 0, 2.45]) {
      b.addBox('pavilionFrame', [0.1, 2.2, 0.1], [pvX + px, 1.3, pvZ + 2.05]);
      b.addBox('pavilionFrame', [0.1, 2.2, 0.1], [pvX + px, 1.3, pvZ - 2.05]);
    }
    b.addBox('pavilionFrame', [5.2, 0.12, 4.4], [pvX, 2.45, pvZ]);
    const cone = new THREE.ConeGeometry(3.6, 1.3, 4);
    b.addGeometry('pavilionRoof', cone, [pvX, 3.15, pvZ], [0, Math.PI / 4, 0]);
    cone.dispose();
    b.addCylinder('metal', [0.03, 0.05, 0.4, 8], [pvX, 3.9, pvZ]);

    // 10. Lighting masts
    for (const mast of [
      { x: -8.5, z: 1.2 },
      { x: 9.6, z: 3.8 },
      { x: 15.5, z: 1.1 },
    ]) {
      b.addCylinder('mastPole', [0.06, 0.08, 4.1, 10], [mast.x, 2.05, mast.z]);
      b.addBox('mastPole', [0.22, 0.08, 0.7], [mast.x, 4.1, mast.z + 0.25], [-0.45, 0, 0]);
      const cosM = Math.cos(-0.45);
      const sinM = Math.sin(-0.45);
      for (const lz of [-0.24, -0.08, 0.08, 0.24]) {
        const wy = 4.1 + -0.045 * cosM - lz * sinM;
        const wz = mast.z + 0.25 + -0.045 * sinM + lz * cosM;
        b.addCylinder('mastLight', [0.04, 0.04, 0.02, 8], [mast.x, wy, wz], [-0.45, 0, 0]);
      }
    }

    return b.buildAll();
  }, [leftAngle, leftLength, leftMidX, leftMidY, rightAngle, rightLength, rightMidX, rightMidY, canopyDepth]);

  useEffect(() => () => disposeMergedMap(merged), [merged]);

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {merged.roof && <mesh geometry={merged.roof} material={materials.roofMat} castShadow raycast={NO_RAYCAST} />}
      {merged.fascia && <mesh geometry={merged.fascia} material={materials.fasciaMat} castShadow receiveShadow raycast={NO_RAYCAST} />}
      {merged.glass && <mesh geometry={merged.glass} material={materials.glassMat} raycast={NO_RAYCAST} />}
      {merged.wall && <mesh geometry={merged.wall} material={materials.wallMat} castShadow receiveShadow raycast={NO_RAYCAST} />}
      {merged.plinth && <mesh geometry={merged.plinth} material={materials.plinthMat} receiveShadow raycast={NO_RAYCAST} />}
      {merged.turnstile && <mesh geometry={merged.turnstile} material={materials.turnstileMat} castShadow raycast={NO_RAYCAST} />}
      {merged.metal && <mesh geometry={merged.metal} material={materials.metalMat} castShadow raycast={NO_RAYCAST} />}
      {merged.spotLight && <mesh geometry={merged.spotLight} material={materials.spotLightMat} raycast={NO_RAYCAST} />}
      {merged.cardReader && <mesh geometry={merged.cardReader} material={materials.cardReaderMat} raycast={NO_RAYCAST} />}
      {merged.concrete && <mesh geometry={merged.concrete} material={materials.concreteMat} receiveShadow raycast={NO_RAYCAST} />}
      {merged.pavilionRoof && <mesh geometry={merged.pavilionRoof} material={materials.pavilionRoofMat} castShadow raycast={NO_RAYCAST} />}
      {merged.pavilionFrame && <mesh geometry={merged.pavilionFrame} material={materials.pavilionFrameMat} raycast={NO_RAYCAST} />}
      {merged.mastPole && <mesh geometry={merged.mastPole} material={materials.mastPoleMat} raycast={NO_RAYCAST} />}
      {merged.mastLight && <mesh geometry={merged.mastLight} material={materials.mastLightMat} raycast={NO_RAYCAST} />}
      {merged.steleBody && <mesh geometry={merged.steleBody} material={materials.steleBodyMat} castShadow receiveShadow raycast={NO_RAYCAST} />}
      {merged.bannerBoard && <mesh geometry={merged.bannerBoard} material={materials.bannerBoardMat} castShadow raycast={NO_RAYCAST} />}

      {logoTexture && (
        <mesh position={[4.65, 0.18 + 2.7, 2.02]} material={materials.logoPlaneMat} raycast={NO_RAYCAST}>
          <planeGeometry args={[1.7, 1.7]} />
        </mesh>
      )}
      {steleTexture && (
        <mesh position={[15.5, 0.82, 0.63]} material={materials.stelePlaneMat} raycast={NO_RAYCAST}>
          <planeGeometry args={[10.8, 1.2]} />
        </mesh>
      )}
      {bannerTexture && (
        <mesh position={[-11.5, 1.25, 0.035]} material={materials.bannerPlaneMat} raycast={NO_RAYCAST}>
          <planeGeometry args={[2.8, 1.5]} />
        </mesh>
      )}

      {/* Interactive speed-gate turnstiles with animated glass flaps and RFID indicators */}
      <InteractiveTurnstiles tpX={1.05} tpY={0.18} />
    </group>
  );
}

export type InteractiveTurnstilesProps = {
  tpX?: number;
  tpY?: number;
};

/**
 * Interactive speed-gate turnstiles for the Main Entrance:
 * - 4 animated swinging tempered-glass wings (2 per lane) with stainless steel hinges
 * - 3 pedestals with dual-sided RFID readers and status LEDs (Red = standby, Emerald Green = access granted)
 * - Walk Mode proximity trigger (< 2.8m): plays RFID chime, flips LEDs to green, smoothly swings open 90°
 * - Exit proximity (> 3.8m): smoothly closes flaps and returns LEDs to standby red
 * - Interactive pointer click support with 5s auto-close
 */
export function InteractiveTurnstiles({
  tpX = 1.05,
  tpY = 0.18,
}: InteractiveTurnstilesProps) {
  const rootRef = useRef<THREE.Group>(null);
  const leftWing1Ref = useRef<THREE.Group>(null);
  const rightWing1Ref = useRef<THREE.Group>(null);
  const leftWing2Ref = useRef<THREE.Group>(null);
  const rightWing2Ref = useRef<THREE.Group>(null);

  const isOpenRef = useRef(false);
  const currentAngleRef = useRef(0);
  const openDirectionRef = useRef(1);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wingGlassMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#a7f3d0',
        roughness: 0.1,
        metalness: 0.1,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    [],
  );

  const hingeMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: MAIN_ENTRANCE_MATERIALS.k7_turnstiles,
        roughness: 0.2,
        metalness: 0.85,
      }),
    [],
  );

  const readerHousingMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.4,
        metalness: 0.6,
      }),
    [],
  );

  const ledMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ef4444',
        emissive: '#ef4444',
        emissiveIntensity: 0.8,
        roughness: 0.2,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      wingGlassMat.dispose();
      hingeMat.dispose();
      readerHousingMat.dispose();
      ledMat.dispose();
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
      }
    };
  }, [wingGlassMat, hingeMat, readerHousingMat, ledMat]);

  const worldPos = useMemo(() => new THREE.Vector3(), []);
  const camPos = useMemo(() => new THREE.Vector3(), []);

  const setGateState = (open: boolean, dir = 1) => {
    if (open !== isOpenRef.current) {
      isOpenRef.current = open;
      openDirectionRef.current = dir;
      if (open) {
        sharedCampusAudio.playTurnstileBeep();
        ledMat.color.set('#10b981');
        ledMat.emissive.set('#10b981');
        ledMat.emissiveIntensity = 2.0;
      } else {
        ledMat.color.set('#ef4444');
        ledMat.emissive.set('#ef4444');
        ledMat.emissiveIntensity = 0.8;
      }
    }
  };

  const handlePointerClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    const nextState = !isOpenRef.current;
    setGateState(nextState, 1);
    if (nextState) {
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = setTimeout(() => {
        setGateState(false, 1);
      }, 5000);
    }
  };

  useFrame((state, delta) => {
    if (!rootRef.current) return;

    rootRef.current.getWorldPosition(worldPos);
    state.camera.getWorldPosition(camPos);

    const dx = camPos.x - worldPos.x;
    const dz = camPos.z - worldPos.z;
    const dy = Math.abs(camPos.y - worldPos.y);
    const dist = Math.hypot(dx, dz);

    const isNear = dist < 2.8 && dy < 2.5;

    if (isNear && !isOpenRef.current) {
      const dir = dx > 0 ? 1 : -1;
      setGateState(true, dir);
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
    } else if (!isNear && dist > 3.8 && isOpenRef.current && !autoCloseTimerRef.current) {
      setGateState(false, openDirectionRef.current);
    }

    const targetAngle = isOpenRef.current ? (Math.PI / 2) * openDirectionRef.current : 0;
    currentAngleRef.current = THREE.MathUtils.damp(
      currentAngleRef.current,
      targetAngle,
      8.0,
      delta,
    );

    const a = currentAngleRef.current;
    if (leftWing1Ref.current) leftWing1Ref.current.rotation.y = a;
    if (rightWing1Ref.current) rightWing1Ref.current.rotation.y = -a;
    if (leftWing2Ref.current) leftWing2Ref.current.rotation.y = a;
    if (rightWing2Ref.current) rightWing2Ref.current.rotation.y = -a;
  });

  return (
    <group
      ref={rootRef}
      position={[tpX, tpY, 0.3]}
      onClick={handlePointerClick}
      onPointerOver={() => {
        if (typeof document !== 'undefined') {
          document.body.style.cursor = 'pointer';
        }
      }}
      onPointerOut={() => {
        if (typeof document !== 'undefined') {
          document.body.style.cursor = 'default';
        }
      }}
    >
      {/* Lane 1 Left Wing (Pedestal 0 inner face at x = -1.06) */}
      <group ref={leftWing1Ref} position={[-1.06, 0.55, 0]}>
        <mesh material={hingeMat} raycast={NO_RAYCAST}>
          <cylinderGeometry args={[0.016, 0.016, 0.65, 12]} />
        </mesh>
        <mesh position={[0.025, 0.18, 0]} material={hingeMat} raycast={NO_RAYCAST}>
          <boxGeometry args={[0.05, 0.06, 0.03]} />
        </mesh>
        <mesh position={[0.025, -0.18, 0]} material={hingeMat} raycast={NO_RAYCAST}>
          <boxGeometry args={[0.05, 0.06, 0.03]} />
        </mesh>
        <mesh position={[0.21, 0, 0]} material={wingGlassMat} raycast={NO_RAYCAST}>
          <boxGeometry args={[0.42, 0.65, 0.014]} />
        </mesh>
      </group>

      {/* Lane 1 Right Wing (Pedestal 1 left face at x = -0.14) */}
      <group ref={rightWing1Ref} position={[-0.14, 0.55, 0]}>
        <mesh material={hingeMat} raycast={NO_RAYCAST}>
          <cylinderGeometry args={[0.016, 0.016, 0.65, 12]} />
        </mesh>
        <mesh position={[-0.025, 0.18, 0]} material={hingeMat} raycast={NO_RAYCAST}>
          <boxGeometry args={[0.05, 0.06, 0.03]} />
        </mesh>
        <mesh position={[-0.025, -0.18, 0]} material={hingeMat} raycast={NO_RAYCAST}>
          <boxGeometry args={[0.05, 0.06, 0.03]} />
        </mesh>
        <mesh position={[-0.21, 0, 0]} material={wingGlassMat} raycast={NO_RAYCAST}>
          <boxGeometry args={[0.42, 0.65, 0.014]} />
        </mesh>
      </group>

      {/* Lane 2 Left Wing (Pedestal 1 right face at x = +0.14) */}
      <group ref={leftWing2Ref} position={[0.14, 0.55, 0]}>
        <mesh material={hingeMat} raycast={NO_RAYCAST}>
          <cylinderGeometry args={[0.016, 0.016, 0.65, 12]} />
        </mesh>
        <mesh position={[0.025, 0.18, 0]} material={hingeMat} raycast={NO_RAYCAST}>
          <boxGeometry args={[0.05, 0.06, 0.03]} />
        </mesh>
        <mesh position={[0.025, -0.18, 0]} material={hingeMat} raycast={NO_RAYCAST}>
          <boxGeometry args={[0.05, 0.06, 0.03]} />
        </mesh>
        <mesh position={[0.21, 0, 0]} material={wingGlassMat} raycast={NO_RAYCAST}>
          <boxGeometry args={[0.42, 0.65, 0.014]} />
        </mesh>
      </group>

      {/* Lane 2 Right Wing (Pedestal 2 left face at x = +1.06) */}
      <group ref={rightWing2Ref} position={[1.06, 0.55, 0]}>
        <mesh material={hingeMat} raycast={NO_RAYCAST}>
          <cylinderGeometry args={[0.016, 0.016, 0.65, 12]} />
        </mesh>
        <mesh position={[-0.025, 0.18, 0]} material={hingeMat} raycast={NO_RAYCAST}>
          <boxGeometry args={[0.05, 0.06, 0.03]} />
        </mesh>
        <mesh position={[-0.025, -0.18, 0]} material={hingeMat} raycast={NO_RAYCAST}>
          <boxGeometry args={[0.05, 0.06, 0.03]} />
        </mesh>
        <mesh position={[-0.21, 0, 0]} material={wingGlassMat} raycast={NO_RAYCAST}>
          <boxGeometry args={[0.42, 0.65, 0.014]} />
        </mesh>
      </group>

      {/* RFID Card Readers and LEDs on the 3 Pedestals */}
      {[-1.2, 0.0, 1.2].map((tx, idx) => (
        <group key={`turnstile-reader-${idx}`} position={[tx, 0, 0]}>
          {/* Entry side reader pad on pedestal top */}
          <mesh position={[0, 1.025, 0.42]} material={readerHousingMat} raycast={NO_RAYCAST}>
            <boxGeometry args={[0.14, 0.015, 0.14]} />
          </mesh>
          <mesh position={[0, 1.034, 0.42]} material={ledMat}>
            <boxGeometry args={[0.09, 0.005, 0.09]} />
          </mesh>

          {/* Exit side reader pad on pedestal top */}
          <mesh position={[0, 1.025, -0.42]} material={readerHousingMat} raycast={NO_RAYCAST}>
            <boxGeometry args={[0.14, 0.015, 0.14]} />
          </mesh>
          <mesh position={[0, 1.034, -0.42]} material={ledMat}>
            <boxGeometry args={[0.09, 0.005, 0.09]} />
          </mesh>

          {/* Front & back face passage status indicators */}
          <mesh position={[0, 0.72, 0.601]} material={ledMat} raycast={NO_RAYCAST}>
            <boxGeometry args={[0.08, 0.08, 0.005]} />
          </mesh>
          <mesh position={[0, 0.72, -0.601]} material={ledMat} raycast={NO_RAYCAST}>
            <boxGeometry args={[0.08, 0.08, 0.005]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
