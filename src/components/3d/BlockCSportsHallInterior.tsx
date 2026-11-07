import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import { mapConfig } from '../../config/mapConfig';
import { getInteriorWoodTextures } from './materials/pbrMaterials';

export const SPORTS_HALL_ROOM_ID = 'bld-i-f2-gym';

export const SPORTS_HALL_LAYOUT = {
  widthX: 9.6,
  heightY: 5.0,
  lengthZ: 18.2,
  worldPosition: [74.15, 6.40, 123.65] as const,
  worldSize: [9.6, 5.0, 18.2] as const,
} as const;

export type BlockCSportsHallInteriorProps = {
  /** World-space center of the sports hall box. */
  position: [number, number, number];
  /** World-space size [widthX, heightY, lengthZ] of the sports hall box. */
  size: [number, number, number];
  selected?: boolean;
};

/**
 * 3D Architectural Volleyball Hall (Block C, Floor 2).
 * Dedicated indoor tournament volleyball court per user blueprint:
 * - Clear 5.0m ceiling height with structural steel trusses & suspended high-bay LED sports lights.
 * - Tournament Taraflex two-tone volleyball court (competition orange/maple infield + Olympic blue free zone).
 * - Official competition volleyball net with red/white antennas, safety padded stanchion posts, and umpire stand.
 * - Mobile volleyball ball trolley with official Mikasa tournament volleyballs.
 * - Wall-mounted digital LED Volleyball Scoreboard (SETS 2:1, POINTS 25:23).
 * - Blue acoustic wall impact padding and Swedish gymnastics wall bars (шведская стенка).
 */
export function BlockCSportsHallInterior({
  position,
  size,
  selected = false,
}: BlockCSportsHallInteriorProps) {
  const [widthX, heightY, lengthZ] = size;
  const woodPbr = useMemo(() => getInteriorWoodTextures(6, 8), []);

  const floorY = -heightY / 2;
  const ceilingY = heightY / 2;

  // Shared athletic materials
  const materials = useMemo(() => {
    return {
      courtSurround: new THREE.MeshStandardMaterial({
        color: '#1d4ed8', // Olympic competition blue free zone surround
        roughness: 0.45,
      }),
      courtInfield: new THREE.MeshStandardMaterial({
        color: '#e5a358', // Warm competition maple volleyball court
        map: woodPbr?.map ?? null,
        roughnessMap: woodPbr?.roughnessMap ?? null,
        roughness: 0.35,
        metalness: 0.05,
      }),
      courtLineWhite: new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.3,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
      courtLineBlue: new THREE.MeshStandardMaterial({
        color: '#0284c7',
        roughness: 0.3,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
      safetyPad: new THREE.MeshStandardMaterial({
        color: '#1e40af', // High-density vinyl wall safety mat
        roughness: 0.6,
      }),
      steelDark: new THREE.MeshStandardMaterial({
        color: '#334155', // Structural dark charcoal steel
        roughness: 0.45,
        metalness: 0.75,
      }),
      steelSilver: new THREE.MeshStandardMaterial({
        color: '#cbd5e1',
        roughness: 0.3,
        metalness: 0.85,
      }),
      netWhite: new THREE.MeshStandardMaterial({
        color: '#f8fafc',
        roughness: 0.9,
      }),
      netMeshDark: new THREE.MeshStandardMaterial({
        color: '#0f172a',
        transparent: true,
        opacity: 0.65,
        roughness: 0.85,
      }),
      antennaRedWhite: new THREE.MeshStandardMaterial({
        color: '#ef4444',
        roughness: 0.3,
      }),
      postPad: new THREE.MeshStandardMaterial({
        color: '#2563eb', // Royal blue thick protective post sleeve
        roughness: 0.5,
      }),
      scoreboardBlack: new THREE.MeshStandardMaterial({
        color: '#0f172a',
        roughness: 0.7,
      }),
      ledAmber: new THREE.MeshStandardMaterial({
        color: '#f59e0b',
        emissive: '#f59e0b',
        emissiveIntensity: 1.4,
      }),
      ledRed: new THREE.MeshStandardMaterial({
        color: '#ef4444',
        emissive: '#ef4444',
        emissiveIntensity: 1.4,
      }),
      ledGreen: new THREE.MeshStandardMaterial({
        color: '#22c55e',
        emissive: '#22c55e',
        emissiveIntensity: 1.4,
      }),
      highBayLight: new THREE.MeshStandardMaterial({
        color: '#ffffff',
        emissive: '#fef3c7',
        emissiveIntensity: 1.0,
      }),
      woodGym: new THREE.MeshStandardMaterial({
        color: '#d97706',
        roughness: 0.5,
      }),
      ballBlue: new THREE.MeshStandardMaterial({
        color: '#0284c7',
        roughness: 0.5,
      }),
      ballYellow: new THREE.MeshStandardMaterial({
        color: '#facc15',
        roughness: 0.5,
      }),
      wallLower: new THREE.MeshStandardMaterial({
        color: '#1e3a8a',
        roughness: 0.8,
        metalness: 0.1,
      }),
      wallUpper: new THREE.MeshStandardMaterial({
        color: '#f1f5f9',
        roughness: 0.9,
      }),
      windowGlass: new THREE.MeshStandardMaterial({
        color: '#bae6fd',
        transparent: true,
        opacity: 0.35,
        roughness: 0.1,
      }),
    };
  }, [woodPbr]);

  // Volleyball court dimensions scaled to hall
  const courtW = Math.min(7.2, widthX - 2.0);
  const courtL = Math.min(14.4, lengthZ - 2.8);
  const halfCourtL = courtL / 2;
  const attackDist = (3.0 / 9.0) * halfCourtL; // ~2.4m from center net

  return (
    <group position={position}>
      {/* Invisible raycast volume */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[widthX, heightY, lengthZ]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      {/* 1. Olympic Blue Surround Free-Zone Floor */}
      <mesh position={[0, floorY + 0.02, 0]} receiveShadow>
        <boxGeometry args={[widthX - 0.06, 0.04, lengthZ - 0.06]} />
        <primitive object={materials.courtSurround} attach="material" />
      </mesh>

      {/* 2. Warm Maple Infield Playing Court (9m x 18m scaled) */}
      <mesh position={[0, floorY + 0.03, 0]} receiveShadow>
        <boxGeometry args={[courtW, 0.02, courtL]} />
        <primitive object={materials.courtInfield} attach="material" />
      </mesh>

      {/* 3. Official Tournament Volleyball Court Markings */}
      <group position={[0, floorY + 0.045, 0]}>
        {/* Endlines (North & South) */}
        <mesh position={[0, 0, -halfCourtL]}>
          <boxGeometry args={[courtW, 0.005, 0.06]} />
          <primitive object={materials.courtLineWhite} attach="material" />
        </mesh>
        <mesh position={[0, 0, halfCourtL]}>
          <boxGeometry args={[courtW, 0.005, 0.06]} />
          <primitive object={materials.courtLineWhite} attach="material" />
        </mesh>

        {/* Sidelines (West & East) */}
        <mesh position={[-courtW / 2, 0, 0]}>
          <boxGeometry args={[0.06, 0.005, courtL]} />
          <primitive object={materials.courtLineWhite} attach="material" />
        </mesh>
        <mesh position={[courtW / 2, 0, 0]}>
          <boxGeometry args={[0.06, 0.005, courtL]} />
          <primitive object={materials.courtLineWhite} attach="material" />
        </mesh>

        {/* Center line directly under the net */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[courtW, 0.005, 0.06]} />
          <primitive object={materials.courtLineWhite} attach="material" />
        </mesh>

        {/* 3-Meter Attack Lines (Blue) */}
        <mesh position={[0, 0, -attackDist]}>
          <boxGeometry args={[courtW, 0.005, 0.05]} />
          <primitive object={materials.courtLineBlue} attach="material" />
        </mesh>
        <mesh position={[0, 0, attackDist]}>
          <boxGeometry args={[courtW, 0.005, 0.05]} />
          <primitive object={materials.courtLineBlue} attach="material" />
        </mesh>

        {/* Service zone boundary ticks (20cm marks behind baselines) */}
        {[-halfCourtL - 0.2, halfCourtL + 0.2].map((sz, sIdx) => (
          <group key={sIdx}>
            <mesh position={[-courtW / 2 + 0.4, 0, sz]}>
              <boxGeometry args={[0.05, 0.005, 0.2]} />
              <primitive object={materials.courtLineWhite} attach="material" />
            </mesh>
            <mesh position={[courtW / 2 - 0.4, 0, sz]}>
              <boxGeometry args={[0.05, 0.005, 0.2]} />
              <primitive object={materials.courtLineWhite} attach="material" />
            </mesh>
          </group>
        ))}
      </group>

      {/* 4. Official Tournament Volleyball Net & Padded Stanchions */}
      <group position={[0, 0, 0]}>
        {/* West Upright Stanchion Post & Safety Padding */}
        <group position={[-courtW / 2 - 0.5, floorY + 1.3, 0]}>
          <mesh>
            <cylinderGeometry args={[0.045, 0.045, 2.6, 16]} />
            <primitive object={materials.steelSilver} attach="material" />
          </mesh>
          {/* Thick blue protective post sleeve */}
          <mesh position={[0, -0.35, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 1.8, 16]} />
            <primitive object={materials.postPad} attach="material" />
          </mesh>
          {/* Tension winch */}
          <mesh position={[0.08, 0.2, 0]}>
            <boxGeometry args={[0.12, 0.18, 0.12]} />
            <primitive object={materials.steelDark} attach="material" />
          </mesh>
        </group>

        {/* East Upright Stanchion Post & Safety Padding */}
        <group position={[courtW / 2 + 0.5, floorY + 1.3, 0]}>
          <mesh>
            <cylinderGeometry args={[0.045, 0.045, 2.6, 16]} />
            <primitive object={materials.steelSilver} attach="material" />
          </mesh>
          <mesh position={[0, -0.35, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 1.8, 16]} />
            <primitive object={materials.postPad} attach="material" />
          </mesh>
          <mesh position={[-0.08, 0.2, 0]}>
            <boxGeometry args={[0.12, 0.18, 0.12]} />
            <primitive object={materials.steelDark} attach="material" />
          </mesh>
        </group>

        {/* Regulation Volleyball Net (Top at 2.43m, Net 1.0m height, spanning across court) */}
        <group position={[0, floorY + 1.93, 0]}>
          {/* Net dark mesh */}
          <mesh>
            <planeGeometry args={[courtW + 0.8, 1.0]} />
            <primitive object={materials.netMeshDark} attach="material" />
          </mesh>
          {/* Top white vinyl headband */}
          <mesh position={[0, 0.52, 0]}>
            <boxGeometry args={[courtW + 1.0, 0.08, 0.02]} />
            <primitive object={materials.netWhite} attach="material" />
          </mesh>
          {/* Bottom cable band */}
          <mesh position={[0, -0.52, 0]}>
            <boxGeometry args={[courtW + 1.0, 0.05, 0.02]} />
            <primitive object={materials.netWhite} attach="material" />
          </mesh>

          {/* Red/White Striped Fiberglass Antennas on both sidelines */}
          {[-courtW / 2, courtW / 2].map((antennaX, aIdx) => (
            <group key={aIdx} position={[antennaX, 0.4, 0.02]}>
              <mesh position={[0, -0.4, 0]}>
                <boxGeometry args={[0.06, 1.0, 0.01]} />
                <primitive object={materials.courtLineWhite} attach="material" />
              </mesh>
              <mesh position={[0, 0.5, 0]}>
                <cylinderGeometry args={[0.01, 0.01, 1.8, 8]} />
                <primitive object={materials.antennaRedWhite} attach="material" />
              </mesh>
            </group>
          ))}
        </group>

        {/* Elevated Umpire / Referee Stand (West sideline) */}
        <group position={[-courtW / 2 - 0.75, floorY, 0]}>
          {/* Tubular structural frame */}
          <mesh position={[-0.2, 1.0, 0]} rotation={[0, 0, 0.12]}>
            <cylinderGeometry args={[0.025, 0.025, 2.0, 8]} />
            <primitive object={materials.steelDark} attach="material" />
          </mesh>
          <mesh position={[0.2, 1.0, 0]} rotation={[0, 0, -0.12]}>
            <cylinderGeometry args={[0.025, 0.025, 2.0, 8]} />
            <primitive object={materials.steelDark} attach="material" />
          </mesh>
          {/* Ladder rungs */}
          {[0.35, 0.7, 1.05, 1.4].map((stepY, idx) => (
            <mesh key={idx} position={[0, stepY, 0]}>
              <boxGeometry args={[0.42, 0.03, 0.15]} />
              <primitive object={materials.steelSilver} attach="material" />
            </mesh>
          ))}
          {/* Umpire platform at 1.65m */}
          <mesh position={[0, 1.65, 0.05]}>
            <boxGeometry args={[0.55, 0.04, 0.48]} />
            <primitive object={materials.steelDark} attach="material" />
          </mesh>
          {/* Padded chest safety bar */}
          <mesh position={[0, 2.3, 0.25]}>
            <boxGeometry args={[0.55, 0.08, 0.12]} />
            <primitive object={materials.safetyPad} attach="material" />
          </mesh>
        </group>
      </group>

      {/* 5. Mobile Volleyball Ball Trolleys & Mikasa Volleyballs */}
      <group position={[courtW / 2 + 0.9, floorY, -2.5]}>
        {/* Trolley chrome basket */}
        <mesh position={[0, 0.65, 0]}>
          <boxGeometry args={[0.7, 0.45, 0.7]} />
          <primitive object={materials.steelSilver} attach="material" />
        </mesh>
        <mesh position={[0, 0.25, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.5, 8]} />
          <primitive object={materials.steelDark} attach="material" />
        </mesh>
        {/* Volleyballs in cart (blue & yellow Mikasa style) */}
        {[-0.18, 0.18].map((vx, i) =>
          [-0.18, 0.18].map((vz, j) => (
            <group key={`${i}-${j}`} position={[vx, 0.75, vz]}>
              <mesh>
                <sphereGeometry args={[0.11, 16, 16]} />
                <primitive object={(i + j) % 2 === 0 ? materials.ballYellow : materials.ballBlue} attach="material" />
              </mesh>
            </group>
          ))
        )}
      </group>

      {/* 6. Digital LED Volleyball Scoreboard on North End Wall */}
      <group position={[0, floorY + 3.4, -lengthZ / 2 + 0.12]}>
        {/* Matte black housing */}
        <mesh>
          <boxGeometry args={[3.2, 1.3, 0.1]} />
          <primitive object={materials.scoreboardBlack} attach="material" />
        </mesh>
        {/* Header bar */}
        <mesh position={[0, 0.42, 0.06]}>
          <boxGeometry args={[3.0, 0.25, 0.01]} />
          <primitive object={materials.wallLower} attach="material" />
        </mesh>
        {/* Sets score display (Amber LEDs) */}
        <mesh position={[-0.8, 0, 0.06]}>
          <boxGeometry args={[0.9, 0.45, 0.02]} />
          <primitive object={materials.ledAmber} attach="material" />
        </mesh>
        <mesh position={[0.8, 0, 0.06]}>
          <boxGeometry args={[0.9, 0.45, 0.02]} />
          <primitive object={materials.ledAmber} attach="material" />
        </mesh>
        {/* Current set points (Red LEDs: 25 vs 23) */}
        <mesh position={[-0.8, -0.4, 0.06]}>
          <boxGeometry args={[0.9, 0.25, 0.02]} />
          <primitive object={materials.ledRed} attach="material" />
        </mesh>
        <mesh position={[0.8, -0.4, 0.06]}>
          <boxGeometry args={[0.9, 0.25, 0.02]} />
          <primitive object={materials.ledGreen} attach="material" />
        </mesh>
      </group>

      {/* 7. Safety End Wall Padding Mats (Impact Protection along North & South) */}
      {[-lengthZ / 2 + 0.08, lengthZ / 2 - 0.08].map((padZ, pIdx) => (
        <mesh key={pIdx} position={[0, floorY + 1.2, padZ]}>
          <boxGeometry args={[widthX - 0.4, 2.2, 0.08]} />
          <primitive object={materials.safetyPad} attach="material" />
        </mesh>
      ))}

      {/* 8. Swedish Gymnastics Wall Bars (шведская стенка) along West Wall */}
      <group position={[-widthX / 2 + 0.12, floorY + 1.5, 3.2]}>
        {/* Vertical wooden uprights */}
        <mesh position={[0, 0, -1.0]}>
          <boxGeometry args={[0.05, 3.0, 0.1]} />
          <primitive object={materials.woodGym} attach="material" />
        </mesh>
        <mesh position={[0, 0, 1.0]}>
          <boxGeometry args={[0.05, 3.0, 0.1]} />
          <primitive object={materials.woodGym} attach="material" />
        </mesh>
        {/* Wooden rungs */}
        {Array.from({ length: 10 }).map((_, rIdx) => (
          <mesh key={rIdx} position={[0, -1.3 + rIdx * 0.28, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 2.0, 8]} />
            <primitive object={materials.woodGym} attach="material" />
          </mesh>
        ))}
      </group>

      {/* 9. High-Bay Suspended Sports Luminaires at High Ceiling (Y = ceilingY - 0.4) */}
      {[-lengthZ * 0.3, 0, lengthZ * 0.3].map((lumZ, lIdx) => (
        <group key={lIdx} position={[0, ceilingY - 0.4, lumZ]}>
          <mesh>
            <cylinderGeometry args={[0.4, 0.3, 0.2, 16]} />
            <primitive object={materials.highBayLight} attach="material" />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.4, 8]} />
            <primitive object={materials.steelDark} attach="material" />
          </mesh>
        </group>
      ))}

      {/* 10. Selection Highlight Frame */}
      {selected && (
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[widthX, heightY, lengthZ]} />
          <meshBasicMaterial visible={false} />
          <Edges color={mapConfig.colors.roomSelected} lineWidth={3} />
        </mesh>
      )}
    </group>
  );
}
