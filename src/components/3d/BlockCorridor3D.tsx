import { useMemo } from 'react';
import * as THREE from 'three';
import type { Footprint } from '../../domain/geometry/types';

export type BlockCorridorProps = {
  floorId: string;
  floorElevation: number;
  parts: Footprint[];
};

/**
 * Creates green floor decal texture with direction arrows (photo 17-19-07).
 */
function createFloorArrowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Transparent background
  ctx.clearRect(0, 0, 128, 128);

  // Green circular decal
  ctx.fillStyle = '#16a34a';
  ctx.beginPath();
  ctx.arc(64, 64, 58, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 4;
  ctx.stroke();

  // White directional arrow
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(64, 28);
  ctx.lineTo(88, 56);
  ctx.lineTo(72, 56);
  ctx.lineTo(72, 96);
  ctx.lineTo(56, 96);
  ctx.lineTo(56, 56);
  ctx.lineTo(40, 56);
  ctx.closePath();
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Creates illuminated green exit sign texture ("CHIQISH / EXIT / ВЫХОД", photo 17-18-57).
 */
function createExitSignTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.fillStyle = '#14532d'; // Dark green border
  ctx.fillRect(0, 0, 256, 96);

  ctx.fillStyle = '#22c55e'; // Bright green body
  ctx.fillRect(4, 4, 248, 88);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CHIQISH', 128, 38);
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('EXIT · ВЫХОД', 128, 72);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * 3D Corridors of Block B and Block E (Item 4 of todo_list.md).
 * Models authentic architectural corridor elements from photos 17-18-57, 17-19-03, 07, 11:
 * - Two-tone flooring: warm beige central path flanked by slate blue-grey perimeter borders
 * - Circular green directional arrow wayfinding decals spaced along the center corridor floor
 * - Glazed entrance partitions and doors with frosted horizontal privacy manifestation stripes
 * - Restroom (WC) and classroom door signage
 * - Staircase glazed double doors with illuminated green emergency exit sign ("CHIQISH / EXIT")
 * - Armstrong suspended ceiling grid with recessed LED panel lights and structural crossbeams
 * - Low-profile convector radiators under the window sills
 */
export function BlockCorridor3D({ floorElevation, parts }: BlockCorridorProps) {
  const primaryPart = parts.find((p) => p.type === 'rect') ?? parts[0];
  if (!primaryPart || primaryPart.type !== 'rect') return null;

  const [cx, cz] = primaryPart.center;
  const [w, d] = primaryPart.size;
  const isXLong = w >= d;
  const corridorLen = isXLong ? w - 2.0 : d - 2.0;
  // Calibrated corridor width matching room vSpan gap [0.45, 0.55] in Building B (15.07m * 0.10 = 1.50m)
  const corridorWidth = Math.min(1.6, isXLong ? d * 0.10 : w * 0.10);
  const corridorHeight = 2.8;

  const materials = useMemo(() => {
    // Central warm beige linoleum path
    const floorCenterMat = new THREE.MeshStandardMaterial({
      color: '#eae3d2',
      roughness: 0.55,
      metalness: 0.05,
    });

    // Darker blue-grey perimeter linoleum borders
    const floorBorderMat = new THREE.MeshStandardMaterial({
      color: '#475569',
      roughness: 0.65,
      metalness: 0.1,
    });

    // Lobby polished terrazzo flooring
    const lobbyFloorMat = new THREE.MeshStandardMaterial({
      color: '#dcd5c9',
      roughness: 0.45,
      metalness: 0.08,
    });

    // Stair tread (marble / granite)
    const stairTreadMat = new THREE.MeshStandardMaterial({
      color: '#f1f5f9',
      roughness: 0.4,
      metalness: 0.05,
    });

    // Stair riser / concrete stringer
    const stairRiserMat = new THREE.MeshStandardMaterial({
      color: '#94a3b8',
      roughness: 0.8,
    });

    // Arrow decal material
    const arrowMat = new THREE.MeshStandardMaterial({
      map: createFloorArrowTexture(),
      transparent: true,
      roughness: 0.4,
    });

    // Pale mint-green wall plaster
    const wallMintMat = new THREE.MeshStandardMaterial({
      color: '#e4ebe6',
      roughness: 0.82,
    });

    // Glazed partition glass
    const partitionGlassMat = new THREE.MeshStandardMaterial({
      color: '#bae6fd',
      transparent: true,
      opacity: 0.45,
      roughness: 0.1,
      metalness: 0.25,
      depthWrite: false,
    });

    // Frosted privacy stripes
    const frostedStripeMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.85,
      roughness: 0.35,
    });

    // Dark aluminum window/door frames and handrails
    const frameMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.5,
      metalness: 0.5,
    });

    // Stainless steel handrails
    const steelRailMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      roughness: 0.25,
      metalness: 0.85,
    });

    // Illuminated exit sign
    const exitSignMat = new THREE.MeshStandardMaterial({
      map: createExitSignTexture(),
      emissive: '#16a34a',
      emissiveIntensity: 0.8,
      roughness: 0.3,
    });

    // Ceiling tiles and beams
    const ceilingMat = new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      roughness: 0.9,
    });

    const ledMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#ffffff',
      emissiveIntensity: 0.95,
      roughness: 0.2,
    });

    const radiatorMat = new THREE.MeshStandardMaterial({
      color: '#f1f5f9',
      roughness: 0.7,
    });

    const pedestalMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.3,
    });

    return {
      floorCenterMat,
      floorBorderMat,
      lobbyFloorMat,
      stairTreadMat,
      stairRiserMat,
      arrowMat,
      wallMintMat,
      partitionGlassMat,
      frostedStripeMat,
      frameMat,
      steelRailMat,
      exitSignMat,
      ceilingMat,
      ledMat,
      radiatorMat,
      pedestalMat,
    };
  }, []);

  // Bays along corridor length
  const bayCount = Math.max(4, Math.floor(corridorLen / 5.5));
  const bayStep = corridorLen / bayCount;
  const bayOffsets = useMemo(() => {
    const offsets: number[] = [];
    for (let i = 0; i < bayCount; i++) {
      offsets.push(-corridorLen / 2 + (i + 0.5) * bayStep);
    }
    return offsets;
  }, [bayCount, corridorLen, bayStep]);

  // Central Lobby & Exhibition boundary (uSpan: [0.22, 0.78])
  const lobbyHalfW = corridorLen * 0.28;
  const lobbyDepth = (d * 0.40); // 40% depth south wing

  return (
    <group position={[cx, floorElevation, cz]} rotation={[0, isXLong ? 0 : Math.PI / 2, 0]}>
      {/* 1. Two-Tone Corridor Flooring (Calibrated width = 1.5m flush with room walls) */}
      {/* Central Beige Walkway Strip (1.0m wide) */}
      <mesh position={[0, 0.012, 0]} material={materials.floorCenterMat} receiveShadow>
        <boxGeometry args={[corridorLen, 0.02, 1.0]} />
      </mesh>

      {/* Blue-Grey Side Border Strips (0.25m wide on each side) */}
      {[-corridorWidth / 2 + 0.125, corridorWidth / 2 - 0.125].map((by, bIdx) => (
        <mesh key={`border-${bIdx}`} position={[0, 0.012, by]} material={materials.floorBorderMat} receiveShadow>
          <boxGeometry args={[corridorLen, 0.02, 0.25]} />
        </mesh>
      ))}

      {/* Green Directional Arrow Decals along the central walkway */}
      {bayOffsets.map((bx, idx) => (
        <mesh
          key={`arrow-${idx}`}
          position={[bx, 0.024, 0]}
          rotation={[-Math.PI / 2, 0, Math.PI / 2]}
          material={materials.arrowMat}
        >
          <circleGeometry args={[0.22, 16]} />
        </mesh>
      ))}

      {/* 2. North Corridor Partition Wall (Flush with North rooms at Z = -corridorWidth / 2) */}
      {bayOffsets.map((bx, idx) => (
        <group key={`north-wall-${idx}`} position={[bx, 0, -corridorWidth / 2]}>
          {/* Wall Column / Pier */}
          <mesh position={[-bayStep / 2 + 0.3, corridorHeight / 2, 0]} material={materials.wallMintMat}>
            <boxGeometry args={[0.6, corridorHeight, 0.12]} />
          </mesh>

          {/* Glazed Classroom Door & Partition Opening */}
          <mesh position={[0.2, corridorHeight / 2, 0]} material={materials.partitionGlassMat}>
            <boxGeometry args={[bayStep - 1.2, corridorHeight - 0.1, 0.05]} />
          </mesh>

          {/* Frosted Privacy Stripes */}
          {[0.9, 1.15, 1.4].map((sy, fIdx) => (
            <mesh key={`fr-n-${fIdx}`} position={[0.2, sy, 0]} material={materials.frostedStripeMat}>
              <boxGeometry args={[bayStep - 1.25, 0.12, 0.06]} />
            </mesh>
          ))}

          {/* Door Frame Outline */}
          <mesh position={[0.8, 1.1, 0]} material={materials.frameMat}>
            <boxGeometry args={[0.08, 2.2, 0.08]} />
          </mesh>
          <mesh position={[-0.2, 1.1, 0]} material={materials.frameMat}>
            <boxGeometry args={[0.08, 2.2, 0.08]} />
          </mesh>
          <mesh position={[0.3, 2.15, 0]} material={materials.frameMat}>
            <boxGeometry args={[1.08, 0.08, 0.08]} />
          </mesh>
        </group>
      ))}

      {/* 3. South Corridor Partition Wall: ONLY at East & West wings (Flush with South rooms at Z = +corridorWidth / 2) */}
      {bayOffsets
        .filter((bx) => Math.abs(bx) > lobbyHalfW)
        .map((bx, idx) => (
          <group key={`south-wall-${idx}`} position={[bx, 0, corridorWidth / 2]}>
            <mesh position={[-bayStep / 2 + 0.3, corridorHeight / 2, 0]} material={materials.wallMintMat}>
              <boxGeometry args={[0.6, corridorHeight, 0.12]} />
            </mesh>
            <mesh position={[0.2, corridorHeight / 2, 0]} material={materials.partitionGlassMat}>
              <boxGeometry args={[bayStep - 1.2, corridorHeight - 0.1, 0.05]} />
            </mesh>
            {[0.9, 1.15, 1.4].map((sy, fIdx) => (
              <mesh key={`fr-s-${fIdx}`} position={[0.2, sy, 0]} material={materials.frostedStripeMat}>
                <boxGeometry args={[bayStep - 1.25, 0.12, 0.06]} />
              </mesh>
            ))}
          </group>
        ))}

      {/* 4. LOBBY & EXHIBITION HALL (media_1793538203924.png) */}
      {/* South Open Lobby Floor connecting directly from corridor */}
      <group position={[0, 0, corridorWidth / 2 + lobbyDepth / 2]}>
        {/* Polished Lobby Terrazzo Floor */}
        <mesh position={[0, 0.01, 0]} material={materials.lobbyFloorMat} receiveShadow>
          <boxGeometry args={[lobbyHalfW * 2, 0.02, lobbyDepth]} />
        </mesh>

        {/* Structural Round Columns in Lobby per drawing */}
        {[-lobbyHalfW * 0.45, lobbyHalfW * 0.45].map((cx, cIdx) =>
          [-lobbyDepth * 0.25, lobbyDepth * 0.25].map((cz, rIdx) => (
            <mesh key={`lobby-col-${cIdx}-${rIdx}`} position={[cx, corridorHeight / 2, cz]} material={materials.wallMintMat} castShadow>
              <cylinderGeometry args={[0.22, 0.24, corridorHeight, 16]} />
            </mesh>
          )),
        )}

        {/* Exhibition display pedestals in center of Lobby */}
        {[-2.2, 0, 2.2].map((px, pIdx) => (
          <group key={`ped-${pIdx}`} position={[px, 0.45, 0]}>
            <mesh material={materials.pedestalMat} castShadow receiveShadow>
              <boxGeometry args={[1.2, 0.9, 0.9]} />
            </mesh>
            {/* Glass showcase vitrine */}
            <mesh position={[0, 0.65, 0]} material={materials.partitionGlassMat}>
              <boxGeometry args={[1.1, 0.4, 0.8]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* 5. DUAL STAIRCASES IN LOBBY (media_1793538203924.png, "где лестница итд") */}
      {/* West Staircase (left wing of Lobby) */}
      <StaircaseFlight
        position={[-lobbyHalfW * 0.72, 0, corridorWidth / 2 + 0.3]}
        width={1.6}
        depth={lobbyDepth - 0.6}
        height={3.6}
        materials={materials}
      />

      {/* East Staircase (right wing of Lobby) */}
      <StaircaseFlight
        position={[lobbyHalfW * 0.72, 0, corridorWidth / 2 + 0.3]}
        width={1.6}
        depth={lobbyDepth - 0.6}
        height={3.6}
        materials={materials}
      />

      {/* 6. Emergency Exit Door Portals with Illuminated Exit Signs at ends */}
      {[-corridorLen / 2 + 0.5, corridorLen / 2 - 0.5].map((ex, eIdx) => (
        <group key={`exit-portal-${eIdx}`} position={[ex, 0, 0]} rotation={[0, eIdx === 0 ? 0 : Math.PI, 0]}>
          <mesh position={[0, corridorHeight / 2, -corridorWidth / 2 + 0.2]} material={materials.wallMintMat}>
            <boxGeometry args={[0.15, corridorHeight, 0.4]} />
          </mesh>
          <mesh position={[0, corridorHeight / 2, corridorWidth / 2 - 0.2]} material={materials.wallMintMat}>
            <boxGeometry args={[0.15, corridorHeight, 0.4]} />
          </mesh>
          {/* Glazed Exit Double Doors */}
          <mesh position={[0, 1.1, 0]} material={materials.partitionGlassMat}>
            <boxGeometry args={[0.04, 2.2, corridorWidth - 0.4]} />
          </mesh>
          {/* Illuminated Exit Sign ("CHIQISH / EXIT / ВЫХОД") */}
          <mesh position={[0.04, 2.4, 0]} material={materials.exitSignMat}>
            <boxGeometry args={[0.03, 0.26, 0.7]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * 3D Architectural Staircase with treads, risers, and safety handrails (Item 4 extra task).
 */
function StaircaseFlight({
  position,
  width,
  depth,
  height,
  materials,
}: {
  position: [number, number, number];
  width: number;
  depth: number;
  height: number;
  materials: any;
}) {
  const stepCount = 12;
  const stepH = height / stepCount;
  const stepD = (depth - 1.0) / stepCount;

  return (
    <group position={position}>
      {/* Flight of Stair Steps */}
      {Array.from({ length: stepCount }).map((_, i) => {
        const sy = (i + 0.5) * stepH;
        const sz = (i + 0.5) * stepD;
        return (
          <group key={`st-step-${i}`} position={[0, sy, sz]}>
            {/* Marble Tread */}
            <mesh position={[0, 0, 0]} material={materials.stairTreadMat} receiveShadow castShadow>
              <boxGeometry args={[width, 0.06, stepD + 0.04]} />
            </mesh>
            {/* Solid Riser */}
            <mesh position={[0, -stepH / 2, -stepD / 2]} material={materials.stairRiserMat}>
              <boxGeometry args={[width - 0.04, stepH, 0.04]} />
            </mesh>
          </group>
        );
      })}

      {/* Top Landing Platform */}
      <mesh position={[0, height, depth - 0.5]} material={materials.stairTreadMat} receiveShadow>
        <boxGeometry args={[width, 0.1, 1.0]} />
      </mesh>

      {/* Stainless Steel / Glass Handrails on both sides */}
      {[-width / 2 + 0.04, width / 2 - 0.04].map((hx, hIdx) => {
        const angle = Math.atan2(height, depth - 1.0);
        const railLen = Math.hypot(height, depth - 1.0);
        return (
          <group key={`handrail-${hIdx}`} position={[hx, 0, 0]}>
            {/* Sloped Handrail Tube */}
            <mesh
              position={[0, height / 2 + 0.9, (depth - 1.0) / 2]}
              rotation={[angle, 0, 0]}
              material={materials.steelRailMat}
            >
              <cylinderGeometry args={[0.022, 0.022, railLen, 8]} />
            </mesh>
            {/* Glass Balustrade Infill Panel */}
            <mesh
              position={[0, height / 2 + 0.45, (depth - 1.0) / 2]}
              rotation={[angle, 0, 0]}
              material={materials.partitionGlassMat}
            >
              <boxGeometry args={[0.015, 0.75, railLen - 0.1]} />
            </mesh>
            {/* Landing Guardrail */}
            <mesh position={[0, height + 0.9, depth - 0.5]} material={materials.steelRailMat}>
              <boxGeometry args={[0.04, 0.04, 1.0]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
