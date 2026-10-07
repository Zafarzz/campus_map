import { useCursor } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useMemo, useState } from 'react';
import * as THREE from 'three';
import { mapConfig } from '../../config/mapConfig';
import type { Building as BuildingData } from '../../domain/campus/types';
import type { BuildingGeometry, Footprint } from '../../domain/geometry/types';
import { EXTRUDE_ROTATION, footprintOutline, useExtrudedGeometry } from './geometryUtils';
import { isClick } from './pointer';

type Props = {
  building: BuildingData;
  geometry: BuildingGeometry;
  dimmed: boolean;
  onSelectBuilding: () => void;
};

function getFootprintMetrics(fp: Footprint) {
  if (fp.type === 'rect') {
    return { worldX: fp.center[0], worldZ: fp.center[1], width: fp.size[0], depth: fp.size[1] };
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of fp.points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { worldX: (minX + maxX) / 2, worldZ: (minZ + maxZ) / 2, width: maxX - minX, depth: maxZ - minZ };
}

// Pre-calculate geometry so the base is exactly 1x1.
const roofGeo = new THREE.ConeGeometry(Math.sqrt(0.5), 1, 4);
roofGeo.rotateY(Math.PI / 4);

function HipRoof({ width, depth, height, color, opacity, transparent }: any) {
  return (
    <mesh position={[0, height / 2, 0]} scale={[width, height, depth]} castShadow receiveShadow geometry={roofGeo}>
      <meshStandardMaterial color={color} transparent={transparent} opacity={opacity} depthWrite={!transparent} roughness={0.9} />
    </mesh>
  );
}

// Windows for the four faces of a rectangular building
function Windows({ width, depth, height, opacity, transparent }: any) {
  // A simple grid of windows on the sides.
  // Front and Back faces (width long)
  const windowW = 1.2;
  const windowH = 2.0;
  const marginX = 2;
  const marginY = 3;
  
  const numWindowsX = Math.max(0, Math.floor((width - marginX) / (windowW + 2)));
  const numWindowsZ = Math.max(0, Math.floor((depth - marginX) / (windowW + 2)));
  const numFloors = Math.max(1, Math.floor((height - marginY) / (windowH + 1.5)));

  const material = new THREE.MeshStandardMaterial({ 
    color: '#1e293b', metalness: 0.8, roughness: 0.2, 
    transparent, opacity, depthWrite: !transparent 
  });
  
  const geo = new THREE.BoxGeometry(windowW, windowH, 0.2);
  
  const count = (numWindowsX * 2 + numWindowsZ * 2) * numFloors;
  if (count <= 0) return null;

  const mesh = new THREE.InstancedMesh(geo, material, count);
  const dummy = new THREE.Object3D();
  let idx = 0;

  const startY = 2;
  const spacingY = windowH + 1.5;

  for (let f = 0; f < numFloors; f++) {
    const y = startY + f * spacingY;
    
    // Front/Back
    const startX = -(numWindowsX * (windowW + 2)) / 2 + (windowW + 2) / 2;
    for (let x = 0; x < numWindowsX; x++) {
      const px = startX + x * (windowW + 2);
      // Front
      dummy.position.set(px, y, depth / 2 + 0.05);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx++, dummy.matrix);
      // Back
      dummy.position.set(px, y, -depth / 2 - 0.05);
      dummy.rotation.set(0, Math.PI, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx++, dummy.matrix);
    }
    
    // Left/Right
    const startZ = -(numWindowsZ * (windowW + 2)) / 2 + (windowW + 2) / 2;
    for (let z = 0; z < numWindowsZ; z++) {
      const pz = startZ + z * (windowW + 2);
      // Left
      dummy.position.set(-width / 2 - 0.05, y, pz);
      dummy.rotation.set(0, -Math.PI / 2, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx++, dummy.matrix);
      // Right
      dummy.position.set(width / 2 + 0.05, y, pz);
      dummy.rotation.set(0, Math.PI / 2, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx++, dummy.matrix);
    }
  }
  
  mesh.instanceMatrix.needsUpdate = true;
  
  return <primitive object={mesh} />;
}

export function DetailedBuilding({ building, geometry, dimmed, onSelectBuilding }: Props) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  const style = useMemo(() => {
    switch (building.id) {
      case 'bld-h': // A Block
        return { roofType: 'flat', roofColor: '#f1f5f9', wallColor: '#fdfbf7', hasCornice: true, hasPortico: true };
      case 'bld-g': // B Block
        return { roofType: 'hip', roofColor: '#b91c1c', wallColor: '#fdfbf7', hasCornice: false, hasPortico: false };
      case 'bld-e': // C Block parts
      case 'bld-f':
      case 'bld-i':
        return { roofType: 'hip', roofColor: '#b91c1c', wallColor: '#fdfbf7', hasCornice: false, hasPortico: false, glassCenter: true };
      case 'bld-j': // Dormitory
        return { roofType: 'hip', roofColor: '#b91c1c', wallColor: '#fdfbf7', hasCornice: false, hasPortico: false, hasStripe: true };
      default:
        return { roofType: 'flat', roofColor: '#94a3b8', wallColor: '#e2e8f0', hasCornice: false, hasPortico: false };
    }
  }, [building.id]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!isClick(e)) return;
    e.stopPropagation();
    onSelectBuilding();
  };

  const opacity = dimmed ? mapConfig.opacity.dimmedBuilding : 1;
  const transparent = dimmed;
  const hoverTint = hovered ? '#ffffff' : style.wallColor;

  return (
    <group 
      onClick={onClick}
      onPointerOver={(e) => (e.stopPropagation(), setHovered(true))}
      onPointerOut={() => setHovered(false)}
    >
      {geometry.parts.map((footprint, i) => {
        const outline = footprintOutline(footprint);
        const wallHeight = style.hasCornice ? geometry.height - 0.5 : geometry.height;
        const wallGeo = useExtrudedGeometry(outline, wallHeight);
        const parapetGeo = useExtrudedGeometry(outline, 1.0);
        
        const { worldX, worldZ, width, depth } = getFootprintMetrics(footprint);

        return (
          <group key={i}>
            {/* Main Walls */}
            <mesh geometry={wallGeo} rotation={EXTRUDE_ROTATION} position={[0, 0, 0]} castShadow receiveShadow>
              <meshStandardMaterial color={hoverTint} transparent={transparent} opacity={opacity} depthWrite={!transparent} roughness={0.9} />
            </mesh>

            {/* Base Plinth */}
            <mesh position={[worldX, 0.5, worldZ]} castShadow receiveShadow>
              <boxGeometry args={[width + 0.2, 1, depth + 0.2]} />
              <meshStandardMaterial color="#334155" transparent={transparent} opacity={opacity} depthWrite={!transparent} />
            </mesh>

            {/* Windows */}
            <group position={[worldX, 0, worldZ]}>
              <Windows width={width} depth={depth} height={wallHeight} opacity={opacity} transparent={transparent} />
            </group>

            {/* Dormitory Colored Stripes */}
            {style.hasStripe && (
              <group position={[worldX, 0, worldZ]}>
                <mesh position={[0, wallHeight * 0.4, 0]} castShadow>
                  <boxGeometry args={[width + 0.3, 0.5, depth + 0.3]} />
                  <meshStandardMaterial color="#a51c1c" transparent={transparent} opacity={opacity} depthWrite={!transparent} />
                </mesh>
                <mesh position={[0, wallHeight * 0.7, 0]} castShadow>
                  <boxGeometry args={[width + 0.3, 0.5, depth + 0.3]} />
                  <meshStandardMaterial color="#a51c1c" transparent={transparent} opacity={opacity} depthWrite={!transparent} />
                </mesh>
              </group>
            )}

            {/* C Block Glass Accents */}
            {style.glassCenter && (
              <mesh position={[worldX, wallHeight/2 + 0.5, worldZ]} castShadow>
                <boxGeometry args={[Math.min(15, width - 1), wallHeight - 1, depth + 0.4]} />
                <meshStandardMaterial color="#0ea5e9" transparent={transparent} opacity={opacity} depthWrite={!transparent} metalness={0.9} roughness={0.1} />
              </mesh>
            )}

            {/* Cornice for Flat Roofs */}
            {style.hasCornice && (
              <mesh geometry={parapetGeo} rotation={EXTRUDE_ROTATION} position={[0, wallHeight, 0]} castShadow>
                <meshStandardMaterial color="#e2e8f0" transparent={transparent} opacity={opacity} depthWrite={!transparent} />
              </mesh>
            )}

            {/* Roof */}
            {style.roofType === 'hip' ? (
              <group position={[worldX, wallHeight, worldZ]}>
                <HipRoof width={width + 1.5} depth={depth + 1.5} height={4} color={style.roofColor} opacity={opacity} transparent={transparent} />
                <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
                  <boxGeometry args={[width + 1.5, 0.4, depth + 1.5]} />
                  <meshStandardMaterial color="#ffffff" transparent={transparent} opacity={opacity} depthWrite={!transparent} />
                </mesh>
              </group>
            ) : (
              <mesh position={[worldX, wallHeight + (style.hasCornice ? 0 : 0.5), worldZ]} castShadow receiveShadow>
                <boxGeometry args={[width - 1, 1, depth - 1]} />
                <meshStandardMaterial color={style.roofColor} transparent={transparent} opacity={opacity} depthWrite={!transparent} roughness={0.8} />
              </mesh>
            )}

            {/* Portico for A Block */}
            {style.hasPortico && (
              <group position={[worldX, 0, worldZ + depth/2 + 2]}>
                <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
                  <boxGeometry args={[16, 1, 6]} />
                  <meshStandardMaterial color="#1e293b" transparent={transparent} opacity={opacity} depthWrite={!transparent} />
                </mesh>
                <mesh position={[0, 4, 1]} castShadow receiveShadow>
                  <boxGeometry args={[16, 1, 6]} />
                  <meshStandardMaterial color="#ffffff" transparent={transparent} opacity={opacity} depthWrite={!transparent} />
                </mesh>
                <mesh position={[0, 2, 0]} castShadow receiveShadow>
                  <boxGeometry args={[10, 3, 2]} />
                  <meshStandardMaterial color="#fdfbf7" transparent={transparent} opacity={opacity} depthWrite={!transparent} />
                </mesh>
                <mesh position={[-6, 2, 3]} castShadow>
                  <boxGeometry args={[1, 4, 1]} />
                  <meshStandardMaterial color="#f8fafc" />
                </mesh>
                <mesh position={[6, 2, 3]} castShadow>
                  <boxGeometry args={[1, 4, 1]} />
                  <meshStandardMaterial color="#f8fafc" />
                </mesh>
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
}
