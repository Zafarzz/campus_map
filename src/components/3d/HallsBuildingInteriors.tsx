import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import { getInteriorWoodTextures } from './materials/pbrMaterials';

export const HALLS_BUILDING_ID = 'bld-e';
export const EVENT_HALL_1_ID = 'bld-e-f1-hall-1';
export const EVENT_HALL_2_ID = 'bld-e-f1-hall-2';
export const TENNIS_HALL_ID = 'bld-e-f1-tennis';

export type HallInteriorProps = {
  position: [number, number, number];
  size: [number, number, number];
  selected?: boolean;
};

/**
 * 3D Indoor Regulation Tennis Court Hall (Halls Building, East Bay).
 *
 * Dimensions: 17.8m width × 34.0m length × 6.0m clear ceiling height.
 * Features:
 * - Tournament US Open two-tone acrylic hard court (navy perimeter, vibrant blue infield).
 * - Full regulation tennis court lines (baselines, singles/doubles sidelines, service boxes).
 * - Tournament tennis net with tension posts, top white headband, and center anchor strap.
 * - Elevated umpire chair, player benches, ball hopper cart, and overhead tennis floodlights.
 */
export function TennisHallInterior3D({
  position,
  size,
  selected = false,
}: HallInteriorProps) {
  const [widthX, heightY, lengthZ] = size;
  const floorY = -heightY / 2;

  const materials = useMemo(() => {
    return {
      perimeterCourt: new THREE.MeshStandardMaterial({
        color: '#1e3a8a', // Deep tournament navy blue run-off area
        roughness: 0.5,
      }),
      innerCourt: new THREE.MeshStandardMaterial({
        color: '#0284c7', // Vibrant tournament blue playing rectangle
        roughness: 0.45,
      }),
      courtLineWhite: new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.35,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
      tennisNet: new THREE.MeshStandardMaterial({
        color: '#0f172a',
        transparent: true,
        opacity: 0.65,
        roughness: 0.8,
      }),
      netTapeWhite: new THREE.MeshStandardMaterial({
        color: '#f8fafc',
        roughness: 0.4,
      }),
      postGreen: new THREE.MeshStandardMaterial({
        color: '#14532d', // Dark tournament green steel posts
        roughness: 0.3,
        metalness: 0.7,
      }),
      steelSilver: new THREE.MeshStandardMaterial({
        color: '#cbd5e1',
        roughness: 0.3,
        metalness: 0.8,
      }),
      umpireSeat: new THREE.MeshStandardMaterial({
        color: '#15803d',
        roughness: 0.5,
      }),
      woodBench: new THREE.MeshStandardMaterial({
        color: '#d97706',
        roughness: 0.45,
      }),
      tennisBallYellow: new THREE.MeshStandardMaterial({
        color: '#eab308', // High-vis optic yellow
        roughness: 0.8,
      }),
      floodlightEmissive: new THREE.MeshStandardMaterial({
        color: '#ffffff',
        emissive: '#f8fafc',
        emissiveIntensity: 1.2,
      }),
      wallAcoustic: new THREE.MeshStandardMaterial({
        color: '#334155',
        roughness: 0.85,
      }),
    };
  }, []);

  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);

  return (
    <group position={position}>
      {/* 1. Two-Tone Tennis Court Floor */}
      {/* Outer Navy Perimeter Run-off Area */}
      <mesh position={[0, floorY + 0.04, 0]}>
        <boxGeometry args={[widthX - 0.1, 0.08, lengthZ - 0.1]} />
        <primitive object={materials.perimeterCourt} attach="material" />
      </mesh>
      {/* Inner Tournament Blue Court (10.97m x 23.77m) */}
      <mesh position={[0, floorY + 0.082, 0]}>
        <boxGeometry args={[10.97, 0.005, 23.77]} />
        <primitive object={materials.innerCourt} attach="material" />
      </mesh>

      {/* 2. Regulation White Tennis Court Lines */}
      <group position={[0, floorY + 0.086, 0]}>
        {/* Baselines (at Z = -11.885m and +11.885m) */}
        <mesh position={[0, 0, -11.885]}>
          <boxGeometry args={[10.97, 0.004, 0.08]} />
          <primitive object={materials.courtLineWhite} attach="material" />
        </mesh>
        <mesh position={[0, 0, 11.885]}>
          <boxGeometry args={[10.97, 0.004, 0.08]} />
          <primitive object={materials.courtLineWhite} attach="material" />
        </mesh>

        {/* Doubles Sidelines (at X = -5.485m and +5.485m) */}
        <mesh position={[-5.485, 0, 0]}>
          <boxGeometry args={[0.06, 0.004, 23.77]} />
          <primitive object={materials.courtLineWhite} attach="material" />
        </mesh>
        <mesh position={[5.485, 0, 0]}>
          <boxGeometry args={[0.06, 0.004, 23.77]} />
          <primitive object={materials.courtLineWhite} attach="material" />
        </mesh>

        {/* Singles Sidelines (at X = -4.115m and +4.115m) */}
        <mesh position={[-4.115, 0, 0]}>
          <boxGeometry args={[0.05, 0.004, 23.77]} />
          <primitive object={materials.courtLineWhite} attach="material" />
        </mesh>
        <mesh position={[4.115, 0, 0]}>
          <boxGeometry args={[0.05, 0.004, 23.77]} />
          <primitive object={materials.courtLineWhite} attach="material" />
        </mesh>

        {/* Service Lines (at Z = -6.40m and +6.40m, between singles lines) */}
        <mesh position={[0, 0, -6.4]}>
          <boxGeometry args={[8.23, 0.004, 0.05]} />
          <primitive object={materials.courtLineWhite} attach="material" />
        </mesh>
        <mesh position={[0, 0, 6.4]}>
          <boxGeometry args={[8.23, 0.004, 0.05]} />
          <primitive object={materials.courtLineWhite} attach="material" />
        </mesh>

        {/* Center Service Line (at X = 0, between service lines) */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.05, 0.004, 12.8]} />
          <primitive object={materials.courtLineWhite} attach="material" />
        </mesh>

        {/* Center Baseline Marks */}
        <mesh position={[0, 0, -11.83]}>
          <boxGeometry args={[0.05, 0.004, 0.15]} />
          <primitive object={materials.courtLineWhite} attach="material" />
        </mesh>
        <mesh position={[0, 0, 11.83]}>
          <boxGeometry args={[0.05, 0.004, 0.15]} />
          <primitive object={materials.courtLineWhite} attach="material" />
        </mesh>
      </group>

      {/* 3. Tournament Tennis Net & Posts */}
      <group position={[0, floorY + 0.58, 0]}>
        {/* Steel Net Posts (at X = -6.0m and +6.0m) */}
        <mesh position={[-6.0, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 1.07, 16]} />
          <primitive object={materials.postGreen} attach="material" />
        </mesh>
        <mesh position={[6.0, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 1.07, 16]} />
          <primitive object={materials.postGreen} attach="material" />
        </mesh>

        {/* Dark Tennis Net Mesh spanning 12.0m */}
        <mesh position={[0, -0.06, 0]}>
          <planeGeometry args={[12.0, 0.95]} />
          <primitive object={materials.tennisNet} attach="material" />
        </mesh>

        {/* Top White Headband Tape */}
        <mesh position={[0, 0.42, 0]}>
          <boxGeometry args={[12.0, 0.06, 0.02]} />
          <primitive object={materials.netTapeWhite} attach="material" />
        </mesh>

        {/* Center Strap (anchoring net at 0.914m center height) */}
        <mesh position={[0, -0.05, 0]}>
          <boxGeometry args={[0.06, 0.95, 0.025]} />
          <primitive object={materials.netTapeWhite} attach="material" />
        </mesh>
      </group>

      {/* 4. High Umpire Chair (West Sideline at X = -6.8m) */}
      <group position={[-6.8, floorY, 0]}>
        {/* Angled ladder frame */}
        <mesh position={[0, 1.1, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 2.2, 8]} />
          <primitive object={materials.postGreen} attach="material" />
        </mesh>
        {/* Elevated umpire seat at 1.8m */}
        <mesh position={[0, 1.85, 0]}>
          <boxGeometry args={[0.55, 0.08, 0.5]} />
          <primitive object={materials.umpireSeat} attach="material" />
        </mesh>
        {/* Overhead canopy hood */}
        <mesh position={[0, 2.5, 0]}>
          <boxGeometry args={[0.75, 0.04, 0.7]} />
          <primitive object={materials.netTapeWhite} attach="material" />
        </mesh>
      </group>

      {/* 5. Player Benches & Ball Cart (East Sideline at X = +6.8m) */}
      <group position={[6.8, floorY, 0]}>
        {/* Player benches */}
        {[-3.0, 3.0].map((bz, bidx) => (
          <group key={bidx} position={[0, 0, bz]}>
            <mesh position={[0, 0.42, 0]}>
              <boxGeometry args={[0.45, 0.05, 2.2]} />
              <primitive object={materials.woodBench} attach="material" />
            </mesh>
            {[-0.8, 0.8].map((lz, lidx) => (
              <mesh key={lidx} position={[0, 0.2, lz]}>
                <boxGeometry args={[0.38, 0.4, 0.04]} />
                <primitive object={materials.steelSilver} attach="material" />
              </mesh>
            ))}
          </group>
        ))}
        {/* Rolling ball hopper cart with yellow tennis balls */}
        <group position={[0, 0.45, 0]}>
          <mesh>
            <boxGeometry args={[0.4, 0.5, 0.5]} />
            <primitive object={materials.steelSilver} attach="material" wireframe />
          </mesh>
          {[-0.1, 0, 0.1].map((bx, i) => (
            <mesh key={i} position={[bx, 0.1, 0]}>
              <sphereGeometry args={[0.045, 8, 8]} />
              <primitive object={materials.tennisBallYellow} attach="material" />
            </mesh>
          ))}
        </group>
      </group>

      {/* 6. Linear High-Bay LED Tennis Court Luminaires */}
      <group position={[0, heightY / 2 - 0.4, 0]}>
        {[-4.0, 4.0].map((lx, lidx) =>
          [-9.0, -3.0, 3.0, 9.0].map((lz, zidx) => (
            <mesh key={`${lidx}-${zidx}`} position={[lx, 0, lz]}>
              <boxGeometry args={[0.3, 0.12, 1.8]} />
              <primitive object={materials.floodlightEmissive} attach="material" />
            </mesh>
          ))
        )}
      </group>

      {/* 7. Selection Highlight */}
      {selected && (
        <mesh position={[0, floorY + 0.09, 0]}>
          <boxGeometry args={[widthX + 0.06, 0.02, lengthZ + 0.06]} />
          <meshBasicMaterial visible={false} />
          <Edges color="#38bdf8" lineWidth={2} />
        </mesh>
      )}
    </group>
  );
}

/**
 * 3D University Event & Conference Hall (Halls Building, West & Center Bays).
 *
 * Equipped for large conferences, ceremonial events, academic summits, and exhibitions:
 * - Raised presentation stage with wooden apron.
 * - Central multimedia presentation video wall & speaker podium.
 * - VIP presentation tables and conference audience seating.
 * - Stage spot lighting and acoustic ceiling luminaires.
 */
export function EventHallInterior3D({
  position,
  size,
  selected = false,
}: HallInteriorProps) {
  const [widthX, heightY, lengthZ] = size;
  const woodPbr = useMemo(() => getInteriorWoodTextures(6, 6), []);
  const floorY = -heightY / 2;

  const materials = useMemo(() => {
    return {
      carpetFloor: new THREE.MeshStandardMaterial({
        color: '#1e293b', // Deep slate commercial acoustic event carpeting
        roughness: 0.85,
      }),
      stageWood: new THREE.MeshStandardMaterial({
        color: '#78350f', // Polished dark walnut stage floor
        map: woodPbr?.map ?? null,
        roughnessMap: woodPbr?.roughnessMap ?? null,
        roughness: 0.35,
      }),
      videoWallScreen: new THREE.MeshStandardMaterial({
        color: '#0284c7', // Vibrant Ajou Blue presentation screen
        emissive: '#0369a1',
        emissiveIntensity: 0.85,
        roughness: 0.2,
      }),
      podiumDark: new THREE.MeshStandardMaterial({
        color: '#0f172a',
        roughness: 0.4,
        metalness: 0.3,
      }),
      chairFabric: new THREE.MeshStandardMaterial({
        color: '#1e40af', // Royal blue conference chairs
        roughness: 0.7,
      }),
      chairLegs: new THREE.MeshStandardMaterial({
        color: '#0f172a',
        roughness: 0.3,
        metalness: 0.7,
      }),
      tableWood: new THREE.MeshStandardMaterial({
        color: '#d97706',
        roughness: 0.4,
      }),
      lightEmissive: new THREE.MeshStandardMaterial({
        color: '#ffffff',
        emissive: '#fef3c7',
        emissiveIntensity: 1.1,
      }),
    };
  }, [woodPbr]);

  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);

  return (
    <group position={position}>
      {/* 1. Acoustic Carpeted Floor */}
      <mesh position={[0, floorY + 0.04, 0]}>
        <boxGeometry args={[widthX - 0.1, 0.08, lengthZ - 0.1]} />
        <primitive object={materials.carpetFloor} attach="material" />
      </mesh>

      {/* 2. Raised Presentation Stage (North end: Z = -11.0m, 12m wide x 5m deep x 0.6m high) */}
      <group position={[0, floorY, -lengthZ / 2 + 4.5]}>
        {/* Stage platform */}
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[12.5, 0.6, 5.5]} />
          <primitive object={materials.stageWood} attach="material" />
        </mesh>

        {/* Multimedia Video Wall / Backdrop Screen (8m wide x 3.2m high) */}
        <mesh position={[0, 2.4, -2.4]}>
          <boxGeometry args={[8.4, 3.2, 0.1]} />
          <primitive object={materials.videoWallScreen} attach="material" />
        </mesh>

        {/* Speaker Lectern / Podium */}
        <group position={[-2.8, 0.6, 1.2]}>
          <mesh position={[0, 0.55, 0]}>
            <boxGeometry args={[0.75, 1.1, 0.55]} />
            <primitive object={materials.podiumDark} attach="material" />
          </mesh>
          <mesh position={[0, 1.12, 0]} rotation={[0.2, 0, 0]}>
            <boxGeometry args={[0.78, 0.05, 0.45]} />
            <primitive object={materials.podiumDark} attach="material" />
          </mesh>
        </group>

        {/* VIP Panel Conference Desk on Stage */}
        <group position={[1.5, 0.6, 0.5]}>
          <mesh position={[0, 0.38, 0]}>
            <boxGeometry args={[4.2, 0.76, 0.85]} />
            <primitive object={materials.tableWood} attach="material" />
          </mesh>
          {[-1.4, 0, 1.4].map((px, pidx) => (
            <mesh key={pidx} position={[px, 0.45, -0.6]}>
              <boxGeometry args={[0.55, 0.9, 0.55]} />
              <primitive object={materials.chairFabric} attach="material" />
            </mesh>
          ))}
        </group>
      </group>

      {/* 3. Audience & Delegate Conference Seating (Multiple Rows) */}
      <group position={[0, floorY, 2.0]}>
        {[-4.0, -1.5, 1.0, 3.5, 6.0, 8.5].map((rowZ, rIdx) => (
          <group key={rIdx} position={[0, 0, rowZ]}>
            {/* Left seating block */}
            {[-5.0, -3.8, -2.6, -1.4].map((seatX, sIdx) => (
              <mesh key={`seat-l-${sIdx}`} position={[seatX, 0.42, 0]}>
                <boxGeometry args={[0.52, 0.84, 0.52]} />
                <primitive object={materials.chairFabric} attach="material" />
              </mesh>
            ))}
            {/* Right seating block */}
            {[1.4, 2.6, 3.8, 5.0].map((seatX, sIdx) => (
              <mesh key={`seat-r-${sIdx}`} position={[seatX, 0.42, 0]}>
                <boxGeometry args={[0.52, 0.84, 0.52]} />
                <primitive object={materials.chairFabric} attach="material" />
              </mesh>
            ))}
          </group>
        ))}
      </group>

      {/* 4. Overhead Stage & Hall Spotlights */}
      <group position={[0, heightY / 2 - 0.35, 0]}>
        {[-3.5, 0, 3.5].map((lx, lidx) => (
          <mesh key={lidx} position={[lx, 0, -lengthZ / 2 + 4.5]}>
            <cylinderGeometry args={[0.22, 0.35, 0.25, 12]} />
            <primitive object={materials.lightEmissive} attach="material" />
          </mesh>
        ))}
      </group>

      {/* 5. Selection Highlight */}
      {selected && (
        <mesh position={[0, floorY + 0.09, 0]}>
          <boxGeometry args={[widthX + 0.06, 0.02, lengthZ + 0.06]} />
          <meshBasicMaterial visible={false} />
          <Edges color="#38bdf8" lineWidth={2} />
        </mesh>
      )}
    </group>
  );
}
