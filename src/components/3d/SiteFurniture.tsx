import { useMemo } from 'react';
import * as THREE from 'three';

/**
 * Modern minimalist campus LED street light pole (6.0m height for roadways / 4.5m for pathways).
 */
function LightPole({
  position,
  rotationY = 0,
  height = 6.0,
}: {
  position: [number, number, number];
  rotationY?: number;
  height?: number;
}) {
  const steelMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.4,
        metalness: 0.8,
      }),
    [],
  );

  const baseMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#64748b',
        roughness: 0.9,
      }),
    [],
  );

  const ledMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#fef08a',
        emissive: '#fef08a',
        emissiveIntensity: 0.8,
        roughness: 0.2,
      }),
    [],
  );

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Concrete Base Footing */}
      <mesh position={[0, 0.15, 0]} material={baseMat}>
        <cylinderGeometry args={[0.22, 0.25, 0.3, 8]} />
      </mesh>
      {/* Vertical Steel Pole */}
      <mesh position={[0, height / 2, 0]} material={steelMat} castShadow>
        <cylinderGeometry args={[0.07, 0.11, height, 10]} />
      </mesh>
      {/* Cantilever Horizontal Luminaire Arm */}
      <mesh position={[0.45, height - 0.05, 0]} material={steelMat} castShadow>
        <boxGeometry args={[0.9, 0.08, 0.08]} />
      </mesh>
      {/* Luminaire Fixture Head */}
      <mesh position={[0.85, height - 0.08, 0]} material={steelMat} castShadow>
        <boxGeometry args={[0.5, 0.1, 0.22]} />
      </mesh>
      {/* Downward LED Emissive Diffuser Panel */}
      <mesh position={[0.85, height - 0.13, 0]}>
        <boxGeometry args={[0.44, 0.01, 0.18]} />
        <primitive object={ledMat} attach="material" />
      </mesh>
    </group>
  );
}

/**
 * High-Mast Sports Court Floodlight Tower (12m height with 6 LED floodlight heads).
 */
function SportsFloodlightTower({
  position,
  rotationY = 0,
}: {
  position: [number, number, number];
  rotationY?: number;
}) {
  const mastMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#334155',
        roughness: 0.45,
        metalness: 0.75,
      }),
    [],
  );

  const headMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#f8fafc',
        emissive: '#f8fafc',
        emissiveIntensity: 0.9,
      }),
    [],
  );

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Heavy Base Footing */}
      <mesh position={[0, 0.3, 0]} material={mastMat}>
        <cylinderGeometry args={[0.45, 0.55, 0.6, 10]} />
      </mesh>
      {/* 12m Tapered Mast */}
      <mesh position={[0, 6.0, 0]} material={mastMat} castShadow>
        <cylinderGeometry args={[0.16, 0.32, 12.0, 12]} />
      </mesh>
      {/* Crossbar Head Frame */}
      <mesh position={[0, 12.1, 0]} material={mastMat} castShadow>
        <boxGeometry args={[2.8, 0.18, 0.25]} />
      </mesh>
      {/* 6 Floodlight Projector Heads */}
      {[-1.0, -0.6, -0.2, 0.2, 0.6, 1.0].map((fx, idx) => (
        <group key={`lamp-${idx}`} position={[fx, 12.15, 0.25]} rotation={[0.45, 0, 0]}>
          <mesh material={mastMat} castShadow>
            <boxGeometry args={[0.32, 0.28, 0.18]} />
          </mesh>
          <mesh position={[0, 0, 0.1]}>
            <planeGeometry args={[0.28, 0.24]} />
            <primitive object={headMat} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Modern Teak Wood Park Bench with powder-coated steel legs.
 */
function ParkBench({
  position,
  rotationY = 0,
}: {
  position: [number, number, number];
  rotationY?: number;
}) {
  const woodMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#92400e', // Warm teak wood
        roughness: 0.65,
      }),
    [],
  );

  const metalMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.5,
        metalness: 0.8,
      }),
    [],
  );

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Steel End Legs */}
      {[-0.85, 0.85].map((lx, idx) => (
        <group key={`leg-${idx}`} position={[lx, 0.25, 0]}>
          <mesh material={metalMat} castShadow>
            <boxGeometry args={[0.06, 0.5, 0.5]} />
          </mesh>
        </group>
      ))}
      {/* Wood Seat Slats */}
      {[-0.15, -0.05, 0.05, 0.15].map((sz, idx) => (
        <mesh key={`seat-${idx}`} position={[0, 0.46, sz]} material={woodMat} castShadow>
          <boxGeometry args={[1.9, 0.035, 0.08]} />
        </mesh>
      ))}
      {/* Wood Backrest Slats */}
      {[0.62, 0.74].map((by, idx) => (
        <mesh key={`back-${idx}`} position={[0, by, -0.22]} material={woodMat} castShadow>
          <boxGeometry args={[1.9, 0.08, 0.035]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Stainless Steel Litter & Recycling Receptacle.
 */
function TrashBin({ position }: { position: [number, number, number] }) {
  const binMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#334155',
        roughness: 0.35,
        metalness: 0.8,
      }),
    [],
  );

  return (
    <group position={position}>
      <mesh position={[0, 0.45, 0]} material={binMat} castShadow>
        <cylinderGeometry args={[0.22, 0.22, 0.9, 14]} />
      </mesh>
      <mesh position={[0, 0.92, 0]} material={binMat}>
        <cylinderGeometry args={[0.24, 0.24, 0.04, 14]} />
      </mesh>
    </group>
  );
}

/**
 * Campus Directory Map Totem Kiosk with university graphics and illumination.
 */
function WayfindingTotem({
  position,
  rotationY = 0,
}: {
  position: [number, number, number];
  rotationY?: number;
}) {
  const frameMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#0f172a',
        roughness: 0.3,
        metalness: 0.7,
      }),
    [],
  );

  const displayMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#0284c7', // Bright cyan / university blue map display
        roughness: 0.1,
        emissive: '#0369a1',
        emissiveIntensity: 0.3,
      }),
    [],
  );

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Base Plinth */}
      <mesh position={[0, 0.1, 0]} material={frameMat}>
        <boxGeometry args={[1.2, 0.2, 0.4]} />
      </mesh>
      {/* Main Totem Monolith Body */}
      <mesh position={[0, 1.25, 0]} material={frameMat} castShadow>
        <boxGeometry args={[1.1, 2.3, 0.2]} />
      </mesh>
      {/* Front Illuminated Map Graphic Display */}
      <mesh position={[0, 1.25, 0.105]} material={displayMat}>
        <boxGeometry args={[0.95, 1.8, 0.01]} />
      </mesh>
      {/* Header Accent Band (AUT Gold) */}
      <mesh position={[0, 2.25, 0.106]}>
        <boxGeometry args={[0.95, 0.1, 0.01]} />
        <meshStandardMaterial color="#ba6f27" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  );
}

/**
 * Stainless Steel Bicycle Parking Racks (Inverted U-hoops).
 */
function BicycleRacks({
  position,
  rotationY = 0,
  count = 5,
}: {
  position: [number, number, number];
  rotationY?: number;
  count?: number;
}) {
  const rackMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#94a3b8',
        roughness: 0.25,
        metalness: 0.9,
      }),
    [],
  );

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {Array.from({ length: count }).map((_, idx) => {
        const rx = -((count - 1) * 0.85) / 2 + idx * 0.85;
        return (
          <group key={`bike-hoop-${idx}`} position={[rx, 0.45, 0]}>
            {/* Left vertical post */}
            <mesh position={[-0.32, 0, 0]} material={rackMat}>
              <cylinderGeometry args={[0.03, 0.03, 0.9, 8]} />
            </mesh>
            {/* Right vertical post */}
            <mesh position={[0.32, 0, 0]} material={rackMat}>
              <cylinderGeometry args={[0.03, 0.03, 0.9, 8]} />
            </mesh>
            {/* Top horizontal hoop bar */}
            <mesh position={[0, 0.45, 0]} rotation={[0, 0, Math.PI / 2]} material={rackMat}>
              <cylinderGeometry args={[0.03, 0.03, 0.64, 8]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/**
 * Campus Outdoor Infrastructure & Site Furniture:
 * - LED Street Light Poles along roads and promenades.
 * - High-Mast Sports Floodlights around athletic courts.
 * - Park Benches & Trash Receptacles in gathering plazas.
 * - Campus Wayfinding Map Totem near main gate.
 * - Bicycle Parking Racks near building portals.
 */
export function SiteFurniture() {
  // Roadway and promenade light pole coordinates [x, y, z, rotationY, height]
  const lightPoles = useMemo<[number, number, number, number, number][]>(
    () => [
      // 20m Entrance Road (North side curbside, facing south towards road)
      [64.0, 0, 5.0, Math.PI, 6.0],
      [76.0, 0, 5.0, Math.PI, 6.0],
      [88.0, 0, 5.0, Math.PI, 6.0],
      [98.0, 0, 5.0, Math.PI, 6.0],
      // 20m Entrance Road (South side curbside, facing north towards road)
      [64.0, 0, 26.8, 0, 6.0],
      [76.0, 0, 26.8, 0, 6.0],
      [88.0, 0, 26.8, 0, 6.0],
      [98.0, 0, 26.8, 0, 6.0],
      // East Perimeter Road (flanking east road)
      [104.5, 0, -20.0, -Math.PI / 2, 6.0],
      [104.5, 0, -45.0, -Math.PI / 2, 6.0],
      [104.5, 0, 45.0, -Math.PI / 2, 6.0],
      [102.0, 0, 70.0, -Math.PI / 2, 6.0],
      [104.5, 0, 95.0, -Math.PI / 2, 6.0],
      [104.5, 0, 120.0, -Math.PI / 2, 6.0],
      // Central Pedestrian Promenade (outside sports courts)
      [17.5, 0, 55.0, -Math.PI / 2, 4.5],
      // Block A & Amphitheater Front Promenades
      [22.0, 0, 78.0, 0, 4.5],
      [36.0, 0, 78.0, 0, 4.5],
      [0.0, 0, 78.0, 0, 4.5],
      [-15.0, 0, 78.0, 0, 4.5],
    ],
    [],
  );

  // Sports floodlight masts around court & soccer pitch
  const sportsFloodlights = useMemo<[number, number, number, number][]>(
    () => [
      // Soccer pitch corners (pitchW = 22.5, pitchX = 22.8)
      [10.8, 0, -10.5, Math.PI / 4],
      [34.8, 0, -10.5, (3 * Math.PI) / 4],
      [10.8, 0, 42.5, -Math.PI / 4],
      [34.8, 0, 42.5, -(3 * Math.PI) / 4],
      // Tennis / Basketball court corners (apronW = 36.0, courtX = 55.5)
      [37.0, 0, -10.5, Math.PI / 4],
      [74.0, 0, -10.5, (3 * Math.PI) / 4],
      [37.0, 0, 42.5, -Math.PI / 4],
      [74.0, 0, 42.5, -(3 * Math.PI) / 4],
    ],
    [],
  );

  // Park Benches and Trash bins (benches near main gate removed per user request)
  const benches = useMemo<[number, number, number, number][]>(
    () => [
      // Amphitheater Gathering Plaza
      [22.0, 0, 83.5, 0],
      [32.0, 0, 83.5, 0],
      // Dormitory Quadrangle
      [-55.5, 0, 104.0, 0],
      [-55.5, 0, 114.0, Math.PI],
    ],
    [],
  );

  return (
    <group>
      {/* Street & Pathway LED Lighting */}
      {lightPoles.map(([x, y, z, rotY, h], idx) => (
        <LightPole
          key={`pole-${idx}`}
          position={[x, y, z]}
          rotationY={rotY}
          height={h}
        />
      ))}

      {/* Sports Arena Floodlights */}
      {sportsFloodlights.map(([x, y, z, rotY], idx) => (
        <SportsFloodlightTower
          key={`floodlight-${idx}`}
          position={[x, y, z]}
          rotationY={rotY}
        />
      ))}

      {/* Park Benches & Trash Receptacles */}
      {benches.map(([x, y, z, rotY], idx) => (
        <group key={`bench-group-${idx}`}>
          <ParkBench position={[x, y, z]} rotationY={rotY} />
          <TrashBin position={[x + (rotY === 0 ? 1.4 : -1.4), y, z]} />
        </group>
      ))}

      {/* Campus Wayfinding Directory Totem near Entrance */}
      <WayfindingTotem position={[99.5, 0, -14.0]} rotationY={-Math.PI / 2} />

      {/* Bicycle Parking Racks near Key Buildings */}
      {/* Block B portal */}
      <BicycleRacks position={[63.0, 0, 52.0]} rotationY={0} count={5} />
      {/* Block C portal */}
      <BicycleRacks position={[79.0, 0, 92.0]} rotationY={Math.PI / 2} count={5} />
      {/* Dormitory bld-j */}
      <BicycleRacks position={[-42.0, 0, 108.9]} rotationY={Math.PI / 2} count={6} />
    </group>
  );
}
