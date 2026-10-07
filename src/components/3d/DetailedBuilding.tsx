import { useCursor } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useMemo, useState } from 'react';
import * as THREE from 'three';
import { mapConfig } from '../../config/mapConfig';
import type { Building as BuildingData } from '../../domain/campus/types';
import type { BuildingGeometry } from '../../domain/geometry/types';
import { EXTRUDE_ROTATION, footprintOutline, useExtrudedGeometry } from './geometryUtils';
import { isClick } from './pointer';

type Props = {
  building: BuildingData;
  geometry: BuildingGeometry;
  dimmed: boolean;
  onSelectBuilding: () => void;
};

export function DetailedBuilding({ building, geometry, dimmed, onSelectBuilding }: Props) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  // Configure style per building
  const style = useMemo(() => {
    switch (building.id) {
      case 'bld-h': // A Block
        return { roofColor: '#b91c1c', wallColor: '#f1f5f9', hasCornice: true, hasPortico: true };
      case 'bld-g': // B Block
        return { roofColor: '#b91c1c', wallColor: '#f8fafc', hasCornice: false, hasPortico: false };
      case 'bld-e': // C Block parts
      case 'bld-f':
      case 'bld-i':
        return { roofColor: '#b91c1c', wallColor: '#f8fafc', hasCornice: false, hasPortico: false, glassCenter: true };
      case 'bld-j': // Dormitory
        return { roofColor: '#b91c1c', wallColor: '#f8fafc', hasCornice: false, hasPortico: false, hasStripe: true };
      default:
        return { roofColor: '#94a3b8', wallColor: '#e2e8f0', hasCornice: false, hasPortico: false };
    }
  }, [building.id]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!isClick(e)) return;
    e.stopPropagation();
    onSelectBuilding();
  };

  const opacity = dimmed ? mapConfig.opacity.dimmedBuilding : 1;
  const transparent = dimmed;
  const hoverTint = hovered ? '#e2e8f0' : style.wallColor;

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
        
        // Calculate center for roof/portico placement
        // wallGeo in unrotated coordinates: X=worldX, Y=world-Z, Z=extrusionDepth
        const bb = new THREE.Box3().setFromObject(new THREE.Mesh(wallGeo));
        const c = new THREE.Vector3();
        bb.getCenter(c);
        const size = new THREE.Vector3();
        bb.getSize(size);
        
        // Correct world coordinates
        const worldX = c.x;
        const worldZ = -c.y;
        const width = size.x;
        const depth = size.y;

        return (
          <group key={i}>
            {/* Main Walls */}
            <mesh geometry={wallGeo} rotation={EXTRUDE_ROTATION} position={[0, 0, 0]}>
              <meshStandardMaterial color={hoverTint} transparent={transparent} opacity={opacity} depthWrite={!transparent} />
            </mesh>

            {/* Base Plinth */}
            <mesh position={[worldX, 0.5, worldZ]}>
              <boxGeometry args={[width + 0.2, 1, depth + 0.2]} />
              <meshStandardMaterial color="#334155" transparent={transparent} opacity={opacity} depthWrite={!transparent} />
            </mesh>

            {/* Dormitory Colored Stripes */}
            {style.hasStripe && (
              <>
                <mesh position={[worldX, wallHeight * 0.4, worldZ]}>
                  <boxGeometry args={[width + 0.1, 0.5, depth + 0.1]} />
                  <meshStandardMaterial color="#ef4444" transparent={transparent} opacity={opacity} depthWrite={!transparent} />
                </mesh>
                <mesh position={[worldX, wallHeight * 0.7, worldZ]}>
                  <boxGeometry args={[width + 0.1, 0.5, depth + 0.1]} />
                  <meshStandardMaterial color="#ef4444" transparent={transparent} opacity={opacity} depthWrite={!transparent} />
                </mesh>
              </>
            )}

            {/* C Block Glass Accents */}
            {style.glassCenter && (
              <mesh position={[worldX, wallHeight/2 + 0.5, worldZ]}>
                {/* Scale the glass block according to building width so it fits within the separate C structures */}
                <boxGeometry args={[Math.min(15, width - 2), wallHeight - 1, depth + 0.4]} />
                <meshStandardMaterial color="#0ea5e9" transparent={transparent} opacity={opacity} depthWrite={!transparent} metalness={0.8} roughness={0.2} />
              </mesh>
            )}

            {/* Cornice */}
            {style.hasCornice && (
              <mesh geometry={parapetGeo} rotation={EXTRUDE_ROTATION} position={[0, wallHeight, 0]}>
                <meshStandardMaterial color="#ffffff" transparent={transparent} opacity={opacity} depthWrite={!transparent} />
              </mesh>
            )}

            {/* Pitched Roof Box */}
            <mesh position={[worldX, wallHeight + (style.hasCornice ? 0 : 0.5), worldZ]}>
              <boxGeometry args={[width - 1, 1, depth - 1]} />
              <meshStandardMaterial color={style.roofColor} transparent={transparent} opacity={opacity} depthWrite={!transparent} />
            </mesh>

            {/* Portico for A Block */}
            {style.hasPortico && (
              <group position={[worldX, 0, worldZ + depth/2 + 2]}>
                <mesh position={[0, 0.5, 0]}>
                  <boxGeometry args={[12, 1, 6]} />
                  <meshStandardMaterial color="#0f172a" transparent={transparent} opacity={opacity} depthWrite={!transparent} />
                </mesh>
                <mesh position={[0, 4, 1]}>
                  <boxGeometry args={[14, 1, 6]} />
                  <meshStandardMaterial color="#ffffff" transparent={transparent} opacity={opacity} depthWrite={!transparent} />
                </mesh>
                <mesh position={[0, 2, 0]}>
                  <boxGeometry args={[8, 3, 2]} />
                  <meshStandardMaterial color="#fdfbf7" transparent={transparent} opacity={opacity} depthWrite={!transparent} />
                </mesh>
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
}
