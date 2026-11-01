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
  rotationY?: number;
  noCurbs?: boolean;
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
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
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
      // 7a. Block A North Pedestrian Avenue (between Block B and Block A)
      { center: [14.0, 78.0], size: [56.0, 6.0] },
      // 7b. Block A South Pedestrian Promenade (along South face of Block A connecting to Dormitory & Block C)
      { center: [14.0, 105.5], size: [66.0, 5.0] },
      // 8a. Block C West Pedestrian Promenade (along West facade of Block C per blue markup)
      { center: [57.55, 117.75], size: [5.15, 71.5] },
      // 8b. Block C East Pedestrian Promenade (along East facade of Block C per blue markup)
      { center: [86.75, 116.5], size: [5.15, 69.0] },
      // 9. Dormitory East North-South Avenue (running along east facade through gap to Block A per black markup)
      { center: [-21.35, 118.0], size: [5.0, 70.0] },
      // 10. Dormitory Courtyard Ground (between west & east wings, around 4 garden beds)
      { center: [-55.65, 103.5], size: [36.0, 19.5] },
      // 10b. Dormitory North Apron (north entrance & approach to courtyard)
      { center: [-55.65, 87.0], size: [36.0, 14.0] },
      // 10c. Dormitory South Promenade Terrace (along entire south facade between building & lawns)
      { center: [-55.65, 125.6], size: [63.6, 3.2] },
      // 10d. Dormitory West Flank Path (connecting west wing terrace to south buffer promenade)
      { center: [-85.75, 138.25], size: [4.5, 25.5] },
      // 10e. Dormitory East Flank Path (connecting east terrace to North-South Avenue)
      { center: [-20.15, 129.0], size: [6.3, 10.0] },
      // 10f. Dormitory South Central Entrance Walkway (leading south towards parking)
      { center: [-55.65, 138.3], size: [6.0, 25.4] },
      // 10g. Dormitory South Buffer Promenade (between front lawns & parking lot per CAD masterplan)
      { center: [-51.0, 151.0], size: [74.0, 4.0] },
      // 11. Walkway to Athletics Stadium (branching north-west)
      { center: [-32.0, -78.6], size: [36.0, 5.0] },
      // 12. Walkway along North Academic Block (between bld-a and bld-c)
      { center: [-14.0, -104.0], size: [36.0, 6.0] },
      // 13. East-West Promenade south of Block D / North of Square
      { center: [15.0, -68.0], size: [60.0, 6.0] },
      // 14. Diagonal Promenade Cut-Through (connecting Block B & booth to Main Court Plaza per blue markup media_1793548147922.jpg)
      { center: [92.25, 36.25], size: [4.5, 33.5], rotationY: 0.227 },
      // 15. Central East-West Park Promenade (connecting Block C plaza across park to Dormitory avenue per black markup media_1793556132349.png)
      { center: [7.0, 139.0], size: [102.0, 5.5] },
      // 16. Paved Courtyard Plaza between Block D, Connector & Block F (per reference photo media_1793558789621.jpg)
      { center: [44.0, -57.6], size: [28.0, 39.0], noCurbs: true },
    ],
    [],
  );

  // Crosswalk positions [centerX, centerZ, width, depth, rotationY]
  const crosswalks = useMemo(
    () => [
      // Crosswalk across East perimeter road outside Main Gate
      { pos: [109.0, 0.041, -23.1], size: [8.6, 6.0] },
    ],
    [],
  );

  return (
    <group>
      {/* Paved Walkway Ribbons & Plazas */}
      {walkways.map((w, idx) => {
        const isXLonger = w.size[0] > w.size[1];
        return (
          <group
            key={`walkway-${idx}`}
            position={[w.center[0], 0.055, w.center[1]]}
            rotation={[0, w.rotationY ?? 0, 0]}
          >
            {/* Main paver surface */}
            <mesh receiveShadow>
              <boxGeometry args={[w.size[0], 0.016, w.size[1]]} />
              <primitive object={paverMat} attach="material" />
            </mesh>
            {/* Granite Edge Curbs along the long flanks to prevent blocking walkway intersections */}
            {!w.noCurbs && (isXLonger ? (
              <>
                <mesh position={[0, 0.02, -w.size[1] / 2 - 0.08]} castShadow receiveShadow>
                  <boxGeometry args={[w.size[0], 0.045, 0.16]} />
                  <primitive object={curbMat} attach="material" />
                </mesh>
                <mesh position={[0, 0.02, w.size[1] / 2 + 0.08]} castShadow receiveShadow>
                  <boxGeometry args={[w.size[0], 0.045, 0.16]} />
                  <primitive object={curbMat} attach="material" />
                </mesh>
              </>
            ) : (
              <>
                <mesh position={[-w.size[0] / 2 - 0.08, 0.02, 0]} castShadow receiveShadow>
                  <boxGeometry args={[0.16, 0.045, w.size[1]]} />
                  <primitive object={curbMat} attach="material" />
                </mesh>
                <mesh position={[w.size[0] / 2 + 0.08, 0.02, 0]} castShadow receiveShadow>
                  <boxGeometry args={[0.16, 0.045, w.size[1]]} />
                  <primitive object={curbMat} attach="material" />
                </mesh>
              </>
            ))}
          </group>
        );
      })}

      {/* Central Entrance Flared Round Plaza Node (per CAD masterplan in media_1793556249989.png) */}
      <mesh position={[-55.65, 0.056, 137.0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[4.5, 32]} />
        <primitive object={paverMat} attach="material" />
      </mesh>

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
