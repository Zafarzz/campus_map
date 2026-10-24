import { useMemo } from 'react';
import * as THREE from 'three';

/**
 * Procedural canvas texture for interlocking architectural stone pavers.
 */
function createPaverTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Warm light grey-beige paver base
  ctx.fillStyle = '#e2dfd8';
  ctx.fillRect(0, 0, size, size);

  // Subtle natural color variation noise
  const tileSize = 64;
  for (let y = 0; y < size; y += tileSize) {
    for (let x = 0; x < size; x += tileSize) {
      // Stagger alternate rows (running bond pattern)
      const offsetX = (y / tileSize) % 2 === 1 ? tileSize / 2 : 0;
      const tileX = (x + offsetX) % size;

      const shade = 220 + Math.floor(Math.random() * 20 - 10);
      ctx.fillStyle = `rgb(${shade + 4}, ${shade + 2}, ${shade - 2})`;
      ctx.fillRect(tileX + 1.5, y + 1.5, tileSize - 3, tileSize - 3);

      // Chamfered stone joint groove
      ctx.strokeStyle = '#c4c0b6';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(tileX + 1.5, y + 1.5, tileSize - 3, tileSize - 3);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

export type WalkwaySegment = {
  center: [number, number]; // [x, z]
  size: [number, number];   // [width, depth]
};

export function CampusWalkways() {
  const { paverMat, curbMat, crosswalkWhiteMat } = useMemo(() => {
    let paverMap: THREE.CanvasTexture | null = null;
    try {
      if (typeof document !== 'undefined') {
        paverMap = createPaverTexture();
        paverMap.repeat.set(8, 8);
      }
    } catch {
      paverMap = null;
    }

    const paverMat = new THREE.MeshStandardMaterial({
      color: '#e7e5e0',
      map: paverMap,
      roughness: 0.88,
      metalness: 0.05,
    });

    const curbMat = new THREE.MeshStandardMaterial({
      color: '#94a3b8',
      roughness: 0.9,
    });

    const crosswalkWhiteMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
    });

    return { paverMat, curbMat, crosswalkWhiteMat };
  }, []);

  // Defined walkway segments across the campus
  const walkways: WalkwaySegment[] = useMemo(
    () => [
      // 1. Wide North-South Pedestrian Avenue (running east of Building F and Multi-Sport Court)
      { center: [88.5, -10.0], size: [29.0, 140.0] },
      // 2. Building F West Pedestrian Corridor (between extended lawn-sq and Building F)
      { center: [52.8, -54.0], size: [10.5, 36.0] },
      // 3. North Promenade flanking path (north of lawn-g1 towards Block D)
      { center: [50.0, -35.0], size: [60.0, 5.0] },
      // 4. Pathway between Football Pitch and Multi-Sport Court (aligned with west-shifted tennis court)
      { center: [35.8, 16.0], size: [3.5, 52.0] },
      // 4. Central North-South Promenade (between Sports Pitch and Sports Complex)
      { center: [13.0, 16.0], size: [8.0, 52.0] },
      // 5. Central Spine North Extension (towards Academic Block C & Block A)
      { center: [13.0, 64.0], size: [8.0, 44.0] },
      // 6. Amphitheater Gathering Plaza (West of Amphitheater Hall)
      { center: [27.0, 76.5], size: [14.0, 16.0] },
      // 7. Block A Front Pedestrian Avenue (along South face of Block A)
      { center: [8.0, 78.0], size: [44.0, 6.0] },
      // 8. Block C East Pedestrian Walkway (along Block C to South fence)
      { center: [82.0, 104.0], size: [6.0, 42.0] },
      // 9. North-South Pedestrian Avenue (east of Dormitory, west of Block A / Orchard)
      { center: [-14.0, 115.0], size: [8.0, 75.0] },
      // 10. Dormitory Courtyard Ground (between west & east wings, around 4 garden beds)
      { center: [-55.65, 103.5], size: [36.0, 19.5] },
      // 10b. Dormitory North Apron (north entrance & approach to courtyard)
      { center: [-55.65, 87.0], size: [36.0, 14.0] },
      // 10c. Dormitory South Promenade Terrace (along entire south facade between building & lawns)
      { center: [-55.65, 125.2], size: [63.6, 2.6] },
      // 10d. Dormitory West Flank Path (connecting west wing terrace to parking)
      { center: [-85.0, 129.5], size: [4.9, 6.0] },
      // 10e. Dormitory East Flank Path (connecting east terrace to North-South Avenue)
      { center: [-26.3, 129.5], size: [4.9, 6.0] },
      // 10f. Dormitory South Central Entrance Walkway
      { center: [-55.65, 128.8], size: [6.0, 4.6] },
      // 10g. Dormitory South Entrance Flared Plaza (curved circular widening before parking lot)
      { center: [-55.65, 132.2], size: [9.0, 2.8] },
      // 11. Walkway to Athletics Stadium (branching north-west)
      { center: [-32.0, -78.6], size: [36.0, 5.0] },
      // 12. Walkway along North Academic Block (between bld-a and bld-c)
      { center: [-14.0, -104.0], size: [36.0, 6.0] },
      // 13. East-West Promenade south of Block D / North of Square
      { center: [15.0, -68.0], size: [60.0, 6.0] },
    ],
    [],
  );

  // Crosswalk positions [centerX, centerZ, width, depth, rotationY]
  const crosswalks = useMemo(
    () => [
      // Crosswalk across East perimeter road outside Main Gate
      { pos: [109.0, 0.046, -23.1], size: [8.6, 6.0] },
    ],
    [],
  );

  return (
    <group>
      {/* Paved Walkway Ribbons & Plazas */}
      {walkways.map((w, idx) => (
        <group key={`walkway-${idx}`} position={[w.center[0], 0.038, w.center[1]]}>
          {/* Main paver surface */}
          <mesh receiveShadow>
            <boxGeometry args={[w.size[0], 0.02, w.size[1]]} />
            <primitive object={paverMat} attach="material" />
          </mesh>
          {/* Granite Edge Curbs */}
          <mesh position={[0, 0.025, -w.size[1] / 2 - 0.08]} castShadow receiveShadow>
            <boxGeometry args={[w.size[0], 0.05, 0.16]} />
            <primitive object={curbMat} attach="material" />
          </mesh>
          <mesh position={[0, 0.025, w.size[1] / 2 + 0.08]} castShadow receiveShadow>
            <boxGeometry args={[w.size[0], 0.05, 0.16]} />
            <primitive object={curbMat} attach="material" />
          </mesh>
        </group>
      ))}

      {/* Zebra Crosswalk Markings at Road Crossings */}
      {crosswalks.map((cw, cwIdx) => {
        const stripeCount = Math.floor(cw.size[1] / 1.0);
        const stripeSpacing = cw.size[1] / stripeCount;
        return (
          <group key={`cw-${cwIdx}`} position={cw.pos as [number, number, number]}>
            {Array.from({ length: stripeCount }).map((_, sIdx) => {
              if (sIdx % 2 === 1) return null; // White zebra bar followed by asphalt gap
              const sz = -cw.size[1] / 2 + (sIdx + 0.5) * stripeSpacing;
              return (
                <mesh key={`bar-${sIdx}`} position={[0, 0, sz]}>
                  <boxGeometry args={[cw.size[0], 0.002, stripeSpacing * 0.75]} />
                  <primitive object={crosswalkWhiteMat} attach="material" />
                </mesh>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}
