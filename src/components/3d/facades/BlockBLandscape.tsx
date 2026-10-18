import { useMemo } from 'react';
import * as THREE from 'three';

export type BlockBLandscapeProps = {
  scaleX?: number;
  sign?: number; // 1 if facing south, -1 if facing north
  signX?: number; // 1 if facing south, -1 if facing north
  opacity?: number;
  transparent?: boolean;
};

/**
 * Creates a 4-pitched hip/pyramidal roof geometry for the Gazebo (Беседка).
 */
function createGazeboHipRoofGeometry(width: number, depth: number, height: number): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  const hw = width / 2;
  const hd = depth / 2;
  const ridgeLen = Math.max(0, width - depth * 0.8);
  const hr = ridgeLen / 2;

  // 4 corners at eaves, 2 ridge top vertices
  const vertices = [
    // Front slope (Z > 0): V3, V2, T1, T0
    -hw, 0, hd,   hw, 0, hd,   hr, height, 0,
    -hw, 0, hd,   hr, height, 0, -hr, height, 0,
    // Back slope (Z < 0): V1, V0, T0, T1
    hw, 0, -hd,  -hw, 0, -hd,  -hr, height, 0,
    hw, 0, -hd,  -hr, height, 0,  hr, height, 0,
    // Left hip: V0, V3, T0
    -hw, 0, -hd, -hw, 0, hd,   -hr, height, 0,
    // Right hip: V2, V1, T1
    hw, 0, hd,    hw, 0, -hd,   hr, height, 0,
  ];

  geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Creates a canvas texture for the "Беседка" wooden plaque.
 */
function createGazeboPlaqueTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 256, 64);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(4, 4, 248, 56);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Беседка', 128, 32);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Architectural landscape elements in front of Block B:
 * 1. Беседка (Gazebo):
 *    - 4-pitched hip roof with "Беседка" plaque
 *    - Raised paved patio terrace
 *    - 6 timber columns and perimeter balustrades
 *    - Central picnic table and benches
 *    - Decorative tied corner curtains
 *    - Paved connection walkway to the driveway
 * 2. Надземная теплотрасса (Elevated Heating Pipeline):
 *    - Twin insulated steel pipes on welded steel T-supports
 *    - П-образный компенсатор (overhead pipe loop bridge portal)
 *    - Utility distribution cabinet on twin stanchions
 *    - Metal waste bin (урна) on twin legs
 */
export function BlockBLandscape({
  scaleX = 1,
  sign = -1,
  signX = -1,
  opacity = 1,
  transparent = false,
}: BlockBLandscapeProps) {
  const sX = signX ?? sign;

  // Materials
  const timberMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#8b5a2b', // Natural rich pine/oak
        roughness: 0.75,
        metalness: 0.05,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [transparent, opacity]
  );

  const patioMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#e2e8f0', // Light grey paving tiles
        roughness: 0.9,
        metalness: 0.05,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [transparent, opacity]
  );

  const gazeboRoofMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#7f1d1d', // Matching campus terracotta / dark red shingle
        roughness: 0.65,
        metalness: 0.1,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [transparent, opacity]
  );

  const curtainMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#f8fafc', // White/cream outdoor drapery
        roughness: 0.95,
        metalness: 0.0,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: transparent ? opacity * 0.8 : 0.92,
        depthWrite: !transparent,
      }),
    [transparent, opacity]
  );

  const pipeMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#cbd5e1', // Galvanized silver / light metallic insulation casing
        roughness: 0.35,
        metalness: 0.7,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [transparent, opacity]
  );

  const steelRackMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#475569', // Dark slate structural steel
        roughness: 0.6,
        metalness: 0.5,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [transparent, opacity]
  );

  const cabinetMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#64748b', // Industrial equipment grey
        roughness: 0.5,
        metalness: 0.4,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [transparent, opacity]
  );

  const plaqueTexture = useMemo(() => createGazeboPlaqueTexture(), []);
  const plaqueMat = useMemo(
    () =>
      plaqueTexture
        ? new THREE.MeshBasicMaterial({
            map: plaqueTexture,
            transparent: true,
          })
        : new THREE.MeshStandardMaterial({
            color: '#f8fafc',
            roughness: 0.8,
          }),
    [plaqueTexture]
  );

  // Gazebo Dimensions
  const gw = 5.2; // Width along X
  const gd = 4.0; // Depth along Z
  const eaveH = 2.6; // Height to eave beam
  const roofH = 1.1; // Additional height to roof ridge

  const gazeboRoofGeo = useMemo(() => createGazeboHipRoofGeometry(gw + 0.6, gd + 0.6, roofH), [gw, gd, roofH]);

  // Gazebo Center Position in front of Section 3 (axes 18–22)
  const gzX = 18.0 * scaleX * sX;
  const gzZ = sign * 9.0;

  // Pipeline Coordinates
  // Runs along X, offset Z in front of facade along driveway
  const pipeZ = sign * 6.8;
  const pipeRadius = 0.11; // 220mm outer insulated diameter
  const pipeSpacing = 0.32; // Center-to-center distance between twin pipes

  // Low pipe span coordinates along X
  const pLowX1 = Math.min(12.0 * scaleX * sX, 27.5 * scaleX * sX);
  const pLowX2 = Math.max(12.0 * scaleX * sX, 27.5 * scaleX * sX);
  const runLength = pLowX2 - pLowX1;
  const runCenterX = (pLowX1 + pLowX2) / 2;

  // Loop portal coordinates
  const px1 = 8.5 * scaleX * sX;
  const px2 = 12.0 * scaleX * sX;
  const archW = Math.abs(px2 - px1);
  const archH = 3.0; // from y=0.85 to y=3.85
  const topY = 3.85;

  return (
    <group>
      {/* ============================================================== */}
      {/* 1. БЕСЕДКА (GAZEBO) IN FRONT OF SECTION 3                      */}
      {/* ============================================================== */}
      <group position={[gzX, 0, gzZ]}>
        {/* Raised Paved Patio Deck */}
        <mesh position={[0, 0.12, 0]} material={patioMat} receiveShadow castShadow>
          <boxGeometry args={[gw + 0.8, 0.24, gd + 0.8]} />
        </mesh>
        {/* Curb edge around patio */}
        <mesh position={[0, 0.14, 0]} material={steelRackMat}>
          <boxGeometry args={[gw + 0.9, 0.06, gd + 0.9]} />
        </mesh>

        {/* Paved Walkway connecting Gazebo to the Driveway Curb */}
        <mesh position={[(-gw / 2 - 1.2) * sX, 0.04, 0]} material={patioMat} receiveShadow>
          <boxGeometry args={[1.8, 0.08, 1.6]} />
        </mesh>

        {/* 6 Timber Perimeter Columns (4 corners + 2 center posts on long sides) */}
        {[
          [-gw / 2 + 0.15, -gd / 2 + 0.15],
          [0, -gd / 2 + 0.15],
          [gw / 2 - 0.15, -gd / 2 + 0.15],
          [-gw / 2 + 0.15, gd / 2 - 0.15],
          [0, gd / 2 - 0.15],
          [gw / 2 - 0.15, gd / 2 - 0.15],
        ].map(([cx, cz], idx) => (
          <mesh
            key={`col-${idx}`}
            position={[cx, 0.24 + eaveH / 2, cz]}
            material={timberMat}
            castShadow
          >
            <boxGeometry args={[0.16, eaveH, 0.16]} />
          </mesh>
        ))}

        {/* Perimeter Eaves Beams (Lintel frame holding the roof) */}
        <mesh position={[0, 0.24 + eaveH - 0.08, -gd / 2 + 0.15]} material={timberMat} castShadow>
          <boxGeometry args={[gw, 0.16, 0.16]} />
        </mesh>
        <mesh position={[0, 0.24 + eaveH - 0.08, gd / 2 - 0.15]} material={timberMat} castShadow>
          <boxGeometry args={[gw, 0.16, 0.16]} />
        </mesh>
        <mesh position={[-gw / 2 + 0.15, 0.24 + eaveH - 0.08, 0]} material={timberMat} castShadow>
          <boxGeometry args={[0.16, 0.16, gd]} />
        </mesh>
        <mesh position={[gw / 2 - 0.15, 0.24 + eaveH - 0.08, 0]} material={timberMat} castShadow>
          <boxGeometry args={[0.16, 0.16, gd]} />
        </mesh>

        {/* 4-Pitched Hip Roof */}
        <mesh
          position={[0, 0.24 + eaveH, 0]}
          geometry={gazeboRoofGeo}
          material={gazeboRoofMat}
          castShadow
          receiveShadow
        />

        {/* "Беседка" Sign Plaque on Front Fascia Beam facing outwards */}
        <mesh
          position={[0, 0.24 + eaveH + 0.28, sign * (gd / 2 + 0.18)]}
          rotation={[0, sign === 1 ? 0 : Math.PI, 0]}
          material={plaqueMat}
        >
          <planeGeometry args={[1.6, 0.4]} />
        </mesh>

        {/* Perimeter Balustrades / Railings (~0.9m high with balusters) */}
        {/* Back Railing */}
        <group position={[0, 0.24 + 0.45, -sign * (gd / 2 - 0.15)]}>
          <mesh position={[0, 0.42, 0]} material={timberMat}>
            <boxGeometry args={[gw - 0.3, 0.06, 0.08]} />
          </mesh>
          <mesh position={[0, -0.42, 0]} material={timberMat}>
            <boxGeometry args={[gw - 0.3, 0.06, 0.08]} />
          </mesh>
          {[-2.0, -1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5, 2.0].map((bx, idx) => (
            <mesh key={`b-bal-${idx}`} position={[bx, 0, 0]} material={timberMat}>
              <boxGeometry args={[0.04, 0.8, 0.04]} />
            </mesh>
          ))}
        </group>

        {/* Front Railing */}
        <group position={[0, 0.24 + 0.45, sign * (gd / 2 - 0.15)]}>
          <mesh position={[0, 0.42, 0]} material={timberMat}>
            <boxGeometry args={[gw - 0.3, 0.06, 0.08]} />
          </mesh>
          <mesh position={[0, -0.42, 0]} material={timberMat}>
            <boxGeometry args={[gw - 0.3, 0.06, 0.08]} />
          </mesh>
          {[-2.0, -1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5, 2.0].map((bx, idx) => (
            <mesh key={`f-bal-${idx}`} position={[bx, 0, 0]} material={timberMat}>
              <boxGeometry args={[0.04, 0.8, 0.04]} />
            </mesh>
          ))}
        </group>

        {/* Closed Side Railing (opposite to walkway) */}
        <group position={[(gw / 2 - 0.15) * sX, 0.24 + 0.45, 0]}>
          <mesh position={[0, 0.42, 0]} material={timberMat}>
            <boxGeometry args={[0.08, 0.06, gd - 0.3]} />
          </mesh>
          <mesh position={[0, -0.42, 0]} material={timberMat}>
            <boxGeometry args={[0.08, 0.06, gd - 0.3]} />
          </mesh>
          {[-1.4, -0.7, 0, 0.7, 1.4].map((bz, idx) => (
            <mesh key={`r-bal-${idx}`} position={[0, 0, bz]} material={timberMat}>
              <boxGeometry args={[0.04, 0.8, 0.04]} />
            </mesh>
          ))}
        </group>

        {/* Walkway Side Railing (With central opening for walkway) */}
        <group position={[(-gw / 2 + 0.15) * sX, 0.24 + 0.45, 0]}>
          {[-1.2, 1.2].map((segZ, idx) => (
            <group key={`l-seg-${idx}`} position={[0, 0, segZ]}>
              <mesh position={[0, 0.42, 0]} material={timberMat}>
                <boxGeometry args={[0.08, 0.06, 1.1]} />
              </mesh>
              <mesh position={[0, -0.42, 0]} material={timberMat}>
                <boxGeometry args={[0.08, 0.06, 1.1]} />
              </mesh>
              {[-0.35, 0, 0.35].map((bz, bIdx) => (
                <mesh key={`l-bal-${idx}-${bIdx}`} position={[0, 0, bz]} material={timberMat}>
                  <boxGeometry args={[0.04, 0.8, 0.04]} />
                </mesh>
              ))}
            </group>
          ))}
        </group>

        {/* Interior Furniture: Central Picnic Table & 2 Long Wooden Benches */}
        <group position={[0, 0.24, 0]}>
          {/* Table Top */}
          <mesh position={[0, 0.76, 0]} material={timberMat} castShadow>
            <boxGeometry args={[3.2, 0.06, 1.0]} />
          </mesh>
          {/* Table Legs */}
          {[-1.2, 1.2].map((tx, idx) => (
            <mesh key={`tbl-leg-${idx}`} position={[tx, 0.38, 0]} material={timberMat}>
              <boxGeometry args={[0.1, 0.74, 0.8]} />
            </mesh>
          ))}

          {/* North Bench */}
          <mesh position={[0, 0.46, -0.9]} material={timberMat} castShadow>
            <boxGeometry args={[3.2, 0.05, 0.35]} />
          </mesh>
          {[-1.2, 1.2].map((bx, idx) => (
            <mesh key={`bn-leg-${idx}`} position={[bx, 0.23, -0.9]} material={timberMat}>
              <boxGeometry args={[0.08, 0.45, 0.28]} />
            </mesh>
          ))}

          {/* South Bench */}
          <mesh position={[0, 0.46, 0.9]} material={timberMat} castShadow>
            <boxGeometry args={[3.2, 0.05, 0.35]} />
          </mesh>
          {[-1.2, 1.2].map((bx, idx) => (
            <mesh key={`bs-leg-${idx}`} position={[bx, 0.23, 0.9]} material={timberMat}>
              <boxGeometry args={[0.08, 0.45, 0.28]} />
            </mesh>
          ))}
        </group>

        {/* Decorative Corner Fabric Curtains / Drapes (Tied to corner columns) */}
        {[
          [-gw / 2 + 0.3, -gd / 2 + 0.3],
          [gw / 2 - 0.3, -gd / 2 + 0.3],
          [-gw / 2 + 0.3, gd / 2 - 0.3],
          [gw / 2 - 0.3, gd / 2 - 0.3],
        ].map(([cx, cz], idx) => (
          <group key={`curt-${idx}`} position={[cx, 0.24, cz]}>
            {/* Upper drape flare */}
            <mesh position={[0, eaveH * 0.72, 0]} material={curtainMat}>
              <coneGeometry args={[0.28, eaveH * 0.55, 8]} />
            </mesh>
            {/* Tied knot / cinch */}
            <mesh position={[0, eaveH * 0.42, 0]} material={timberMat}>
              <torusGeometry args={[0.12, 0.03, 8, 16]} />
            </mesh>
            {/* Lower hanging tail */}
            <mesh position={[0, eaveH * 0.2, 0]} material={curtainMat}>
              <cylinderGeometry args={[0.14, 0.22, eaveH * 0.4, 8]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* ============================================================== */}
      {/* 2. НАДЗЕМНАЯ ТЕПЛОТРАССА (ELEVATED HEATING PIPELINE)           */}
      {/* ============================================================== */}
      <group position={[0, 0, pipeZ]}>
        {/* Low horizontal pipe run */}
        {[-pipeSpacing / 2, pipeSpacing / 2].map((offsetZ, pIdx) => {
          const lowPipeY = 0.85;

          return (
            <group key={`low-pipe-${pIdx}`}>
              <mesh
                position={[runCenterX, lowPipeY, offsetZ]}
                rotation={[0, 0, Math.PI / 2]}
                material={pipeMat}
                castShadow
              >
                <cylinderGeometry args={[pipeRadius, pipeRadius, runLength, 16]} />
              </mesh>
            </group>
          );
        })}

        {/* Steel T-Supports along the low pipe run (every 4.5m) */}
        {[14.0, 18.5, 23.0, 27.0].map((rx, idx) => {
          const rackX = rx * scaleX * sX;
          return (
            <group key={`t-rack-${idx}`} position={[rackX, 0, 0]}>
              {/* Vertical steel column */}
              <mesh position={[0, 0.4, 0]} material={steelRackMat}>
                <cylinderGeometry args={[0.045, 0.045, 0.8, 8]} />
              </mesh>
              {/* Horizontal crossbar cradle */}
              <mesh position={[0, 0.74, 0]} material={steelRackMat}>
                <boxGeometry args={[0.08, 0.05, pipeSpacing + 0.3]} />
              </mesh>
              {/* Concrete foundation pier */}
              <mesh position={[0, 0.05, 0]} material={patioMat}>
                <boxGeometry args={[0.25, 0.1, 0.5]} />
              </mesh>
            </group>
          );
        })}

        {/* ============================================================ */}
        {/* П-ОБРАЗНЫЙ КОМПЕНСАТОР (EXPANSION LOOP OVER DRIVEWAY ACCESS) */}
        {/* ============================================================ */}
        {[-pipeSpacing / 2, pipeSpacing / 2].map((offsetZ, pIdx) => {
          return (
            <group key={`p-loop-${pIdx}`}>
              {/* First Vertical Riser at px1 */}
              <mesh position={[px1, 0.85 + archH / 2, offsetZ]} material={pipeMat} castShadow>
                <cylinderGeometry args={[pipeRadius, pipeRadius, archH, 16]} />
              </mesh>
              {/* First Top 90-degree Elbow */}
              <mesh position={[px1 + Math.sign(px2 - px1) * pipeRadius * 0.7, topY - pipeRadius * 0.7, offsetZ]} material={pipeMat}>
                <sphereGeometry args={[pipeRadius * 1.15, 12, 12]} />
              </mesh>

              {/* Horizontal Top Overhead Span */}
              <mesh
                position={[(px1 + px2) / 2, topY, offsetZ]}
                rotation={[0, 0, Math.PI / 2]}
                material={pipeMat}
                castShadow
              >
                <cylinderGeometry args={[pipeRadius, pipeRadius, archW, 16]} />
              </mesh>

              {/* Second Top 90-degree Elbow */}
              <mesh position={[px2 - Math.sign(px2 - px1) * pipeRadius * 0.7, topY - pipeRadius * 0.7, offsetZ]} material={pipeMat}>
                <sphereGeometry args={[pipeRadius * 1.15, 12, 12]} />
              </mesh>
              {/* Second Vertical Riser at px2 */}
              <mesh position={[px2, 0.85 + archH / 2, offsetZ]} material={pipeMat} castShadow>
                <cylinderGeometry args={[pipeRadius, pipeRadius, archH, 16]} />
              </mesh>
            </group>
          );
        })}

        {/* Structural Steel Tower Frame for the П-образный loop */}
        {[px1, px2].map((frameX, fIdx) => (
          <group key={`p-frame-${fIdx}`} position={[frameX, 0, 0]}>
            {/* Twin upright steel columns */}
            {[-pipeSpacing / 2 - 0.12, pipeSpacing / 2 + 0.12].map((colZ, cIdx) => (
              <mesh key={`p-col-${cIdx}`} position={[0, 1.9, colZ]} material={steelRackMat}>
                <boxGeometry args={[0.07, 3.8, 0.07]} />
              </mesh>
            ))}
            {/* Horizontal cross ties */}
            {[1.2, 2.4, 3.6].map((tieY, tIdx) => (
              <mesh key={`p-tie-${tIdx}`} position={[0, tieY, 0]} material={steelRackMat}>
                <boxGeometry args={[0.08, 0.05, pipeSpacing + 0.3]} />
              </mesh>
            ))}
          </group>
        ))}

        {/* ============================================================ */}
        {/* UTILITY CONTROL CABINET (ШКАФ УПРАВЛЕНИЯ ТЕПЛОПУНКТОМ)       */}
        {/* Located at base of Riser                                     */}
        {/* ============================================================ */}
        <group position={[px1, 0, sign * 0.8]}>
          {/* Twin support legs */}
          {[-0.3, 0.3].map((lx, idx) => (
            <mesh key={`cab-leg-${idx}`} position={[lx, 0.35, 0]} material={steelRackMat}>
              <cylinderGeometry args={[0.03, 0.03, 0.7, 8]} />
            </mesh>
          ))}
          {/* Main Metal Cabinet Box */}
          <mesh position={[0, 1.15, 0]} material={cabinetMat} castShadow>
            <boxGeometry args={[0.85, 0.95, 0.45]} />
          </mesh>
          {/* Cabinet Door Seam & Handle */}
          <mesh position={[0, 1.15, sign * 0.23]} material={steelRackMat}>
            <boxGeometry args={[0.02, 0.85, 0.02]} />
          </mesh>
          <mesh position={[0.2 * sX, 1.15, sign * 0.24]} material={timberMat}>
            <boxGeometry args={[0.03, 0.12, 0.03]} />
          </mesh>
          {/* Sloped protective rain hood on top */}
          <mesh position={[0, 1.65, 0]} material={steelRackMat}>
            <boxGeometry args={[0.92, 0.05, 0.52]} />
          </mesh>
        </group>

        {/* ============================================================ */}
        {/* OUTDOOR METAL WASTE BIN (УРНА) AS IN PERSPECTIVE             */}
        {/* Standing near curb between Walkway and Pipe Riser            */}
        {/* ============================================================ */}
        <group position={[9.8 * scaleX * sX, 0, sign * 1.1]}>
          {/* Twin steel support posts */}
          {[-0.18, 0.18].map((px, idx) => (
            <mesh key={`bin-leg-${idx}`} position={[px, 0.4, 0]} material={steelRackMat}>
              <boxGeometry args={[0.03, 0.8, 0.03]} />
            </mesh>
          ))}
          {/* Bottom feet */}
          {[-0.18, 0.18].map((px, idx) => (
            <mesh key={`bin-foot-${idx}`} position={[px, 0.02, 0]} material={steelRackMat}>
              <boxGeometry args={[0.03, 0.04, 0.26]} />
            </mesh>
          ))}
          {/* Receptacle container */}
          <mesh position={[0, 0.45, 0]} material={cabinetMat} castShadow>
            <boxGeometry args={[0.32, 0.45, 0.24]} />
          </mesh>
          {/* Rain cap over bin */}
          <mesh position={[0, 0.78, 0]} material={steelRackMat}>
            <boxGeometry args={[0.38, 0.03, 0.3]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
