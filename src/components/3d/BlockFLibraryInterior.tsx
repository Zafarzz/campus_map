import { useMemo } from 'react';
import * as THREE from 'three';

export const LIBRARY_ROOM_ID = 'bld-d-f1-f101';

/**
 * Local-space layout constants for Room F-101 (Campus Library & Reading Hall)
 * inside Block F (bld-d, Floor 1).
 * Room center in world space: [92.97, 0.25, -53.1], size: [9.52, 2.6, 46.72].
 */
export const LIBRARY_LAYOUT = {
  roomWidthX: 9.52,
  roomHeightY: 2.6,
  roomLengthZ: 46.72,
  portalHalfWidthZ: 2.8,

  bookcaseRowsZ: [-19.5, -16.8, -14.1, -11.4, -8.7] as const,
  bookcaseColsX: [-2.2, 2.2] as const,
  bookcaseSize: [3.1, 2.25, 0.62] as const,

  receptionPos: [-1.3, 0, -4.4] as const,
  receptionSize: [2.8, 1.05, 0.9] as const,

  readingTableRowsZ: [5.2, 8.6, 12.0, 15.4] as const,
  readingTableColsX: [-2.15, 2.15] as const,
  readingTableSize: [2.3, 0.76, 1.15] as const,

  digitalDeskPos: [0, 0, 20.4] as const,
  digitalDeskSize: [6.6, 0.78, 0.9] as const,
} as const;

type Props = {
  /** World-space center of the F-101 room box. */
  position: [number, number, number];
  /** World-space size [widthX, heightY, lengthZ] of the F-101 room box. */
  size: [number, number, number];
  selected?: boolean;
};

const BOOK_PALETTE = [
  '#991b1b', // Deep crimson
  '#1e3a8a', // Oxford navy
  '#065f46', // Emerald green
  '#92400e', // Leather amber
  '#3730a3', // Indigo
  '#115e59', // Deep teal
  '#831843', // Burgundy
  '#d97706', // Gold spine
];

/**
 * Full 3D architectural interior of the Block F Ground-Floor Library (Room F-101):
 * - Warm oak parquet flooring & acoustic reading rugs
 * - Glazed west corridor partition with an open 5.6m entrance portal
 * - Librarian reception & circulation desk with dual monitors
 * - 10 double-sided tall oak bookcases with 3D multi-colored book rows
 * - Central reading lounge with armchairs, coffee table & indoor plants
 * - 8 4-seat reading hall study tables with classic green banker's lamps & laptops
 * - 5-station Digital Media & E-Library computer bar
 * - Warm suspended ceiling luminaires
 */
export function BlockFLibraryInterior({ position, size, selected = false }: Props) {
  const [cx, cy, cz] = position;
  const [w, h, d] = size;
  const floorY = cy - h / 2;
  const hw = w / 2;
  const hd = d / 2;

  const materials = useMemo(() => {
    const oakFloor = new THREE.MeshStandardMaterial({
      color: '#7c4a24',
      roughness: 0.65,
      metalness: 0.05,
    });
    const carpetNavy = new THREE.MeshStandardMaterial({
      color: selected ? '#1d4ed8' : '#1e3a5f',
      roughness: 0.9,
    });
    const walnutWood = new THREE.MeshStandardMaterial({
      color: '#452615',
      roughness: 0.55,
      metalness: 0.08,
    });
    const warmOakFurniture = new THREE.MeshStandardMaterial({
      color: '#9a5b2d',
      roughness: 0.5,
      metalness: 0.05,
    });
    const creamWall = new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      roughness: 0.8,
    });
    const partitionGlass = new THREE.MeshStandardMaterial({
      color: '#bae6fd',
      transparent: true,
      opacity: 0.32,
      roughness: 0.1,
      metalness: 0.2,
      depthWrite: false,
    });
    const darkMetal = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.4,
      metalness: 0.7,
    });
    const brassGold = new THREE.MeshStandardMaterial({
      color: '#d97706',
      roughness: 0.25,
      metalness: 0.85,
    });
    const marbleTop = new THREE.MeshStandardMaterial({
      color: '#f1f5f9',
      roughness: 0.25,
      metalness: 0.05,
    });
    const chairFabric = new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.8,
    });
    const loungeBlue = new THREE.MeshStandardMaterial({
      color: '#1d4ed8',
      roughness: 0.75,
    });
    const bankerShadeGreen = new THREE.MeshStandardMaterial({
      color: '#15803d',
      emissive: '#22c55e',
      emissiveIntensity: 0.45,
      roughness: 0.25,
    });
    const warmLightEmissive = new THREE.MeshStandardMaterial({
      color: '#fef9c3',
      emissive: '#fde047',
      emissiveIntensity: 0.95,
      roughness: 0.2,
    });
    const screenGlow = new THREE.MeshStandardMaterial({
      color: '#e0f2fe',
      emissive: '#38bdf8',
      emissiveIntensity: 0.65,
      roughness: 0.15,
    });
    const paperWhite = new THREE.MeshStandardMaterial({
      color: '#fefce8',
      roughness: 0.7,
    });
    const foliageGreen = new THREE.MeshStandardMaterial({
      color: '#16a34a',
      roughness: 0.65,
    });
    const bookMats = BOOK_PALETTE.map(
      (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
    );

    return {
      oakFloor,
      carpetNavy,
      walnutWood,
      warmOakFurniture,
      creamWall,
      partitionGlass,
      darkMetal,
      brassGold,
      marbleTop,
      chairFabric,
      loungeBlue,
      bankerShadeGreen,
      warmLightEmissive,
      screenGlow,
      paperWhite,
      foliageGreen,
      bookMats,
    };
  }, [selected]);

  const portalHalfZ = LIBRARY_LAYOUT.portalHalfWidthZ;
  const sideWallLenZ = hd - portalHalfZ;

  return (
    <group position={[cx, floorY, cz]}>
      {/* ============================================================== */}
      {/* 1. HARDWOOD PARQUET FLOOR & ACOUSTIC READING RUNNERS           */}
      {/* ============================================================== */}
      <mesh position={[0, 0.015, 0]} material={materials.oakFloor} receiveShadow>
        <boxGeometry args={[w - 0.1, 0.03, d - 0.1]} />
      </mesh>
      {/* North Stacks Carpet */}
      <mesh position={[0, 0.035, -14.1]} material={materials.carpetNavy} receiveShadow>
        <boxGeometry args={[w - 1.4, 0.01, 13.6]} />
      </mesh>
      {/* Central Lounge Carpet */}
      <mesh position={[1.8, 0.035, 0]} material={materials.carpetNavy} receiveShadow>
        <boxGeometry args={[4.6, 0.01, 5.4]} />
      </mesh>
      {/* South Reading Hall Carpet */}
      <mesh position={[0, 0.035, 10.3]} material={materials.carpetNavy} receiveShadow>
        <boxGeometry args={[w - 1.4, 0.01, 13.2]} />
      </mesh>

      {/* ============================================================== */}
      {/* 2. GLAZED CORRIDOR PARTITION & OPEN ENTRANCE PORTAL (X = -hw)  */}
      {/* ============================================================== */}
      {/* North-West Partition Segment */}
      <group position={[-hw + 0.08, 0, -(portalHalfZ + sideWallLenZ / 2)]}>
        <mesh position={[0, 0.45, 0]} material={materials.walnutWood} castShadow receiveShadow>
          <boxGeometry args={[0.14, 0.9, sideWallLenZ]} />
        </mesh>
        <mesh position={[0, 1.7, 0]} material={materials.partitionGlass}>
          <boxGeometry args={[0.06, 1.6, sideWallLenZ - 0.1]} />
        </mesh>
        <mesh position={[0, 2.52, 0]} material={materials.darkMetal}>
          <boxGeometry args={[0.16, 0.08, sideWallLenZ]} />
        </mesh>
      </group>

      {/* South-West Partition Segment */}
      <group position={[-hw + 0.08, 0, portalHalfZ + sideWallLenZ / 2]}>
        <mesh position={[0, 0.45, 0]} material={materials.walnutWood} castShadow receiveShadow>
          <boxGeometry args={[0.14, 0.9, sideWallLenZ]} />
        </mesh>
        <mesh position={[0, 1.7, 0]} material={materials.partitionGlass}>
          <boxGeometry args={[0.06, 1.6, sideWallLenZ - 0.1]} />
        </mesh>
        <mesh position={[0, 2.52, 0]} material={materials.darkMetal}>
          <boxGeometry args={[0.16, 0.08, sideWallLenZ]} />
        </mesh>
      </group>

      {/* Entrance Portal Columns & Illuminated Library Header Sign */}
      <group position={[-hw + 0.08, 0, 0]}>
        <mesh position={[0, 1.28, -portalHalfZ]} material={materials.walnutWood} castShadow>
          <boxGeometry args={[0.24, 2.56, 0.24]} />
        </mesh>
        <mesh position={[0, 1.28, portalHalfZ]} material={materials.walnutWood} castShadow>
          <boxGeometry args={[0.24, 2.56, 0.24]} />
        </mesh>
        {/* Header Transom & Brass Plaque */}
        <mesh position={[0, 2.42, 0]} material={materials.darkMetal} castShadow>
          <boxGeometry args={[0.26, 0.28, portalHalfZ * 2 + 0.2]} />
        </mesh>
        <mesh position={[-0.14, 2.42, 0]} material={materials.brassGold}>
          <boxGeometry args={[0.02, 0.16, 3.6]} />
        </mesh>
        <mesh position={[0.14, 2.42, 0]} material={materials.brassGold}>
          <boxGeometry args={[0.02, 0.16, 3.6]} />
        </mesh>
      </group>

      {/* North & South End Accent Walls */}
      <mesh position={[0, 1.28, -hd + 0.08]} material={materials.creamWall} receiveShadow>
        <boxGeometry args={[w - 0.1, 2.56, 0.14]} />
      </mesh>
      <mesh position={[0, 1.28, hd - 0.08]} material={materials.creamWall} receiveShadow>
        <boxGeometry args={[w - 0.1, 2.56, 0.14]} />
      </mesh>

      {/* ============================================================== */}
      {/* 3. LIBRARIAN RECEPTION & CIRCULATION DESK                      */}
      {/* ============================================================== */}
      <group position={[-1.3, 0, -4.4]}>
        {/* Main Front Counter */}
        <mesh position={[0, 0.5, 0]} material={materials.walnutWood} castShadow receiveShadow>
          <boxGeometry args={[2.8, 1.0, 0.85]} />
        </mesh>
        <mesh position={[0, 1.03, 0]} material={materials.marbleTop} receiveShadow>
          <boxGeometry args={[2.92, 0.06, 0.95]} />
        </mesh>
        {/* Side L-Wing */}
        <mesh position={[-1.05, 0.5, -0.85]} material={materials.walnutWood} castShadow>
          <boxGeometry args={[0.7, 1.0, 1.0]} />
        </mesh>
        <mesh position={[-1.05, 1.03, -0.85]} material={materials.marbleTop}>
          <boxGeometry args={[0.78, 0.06, 1.08]} />
        </mesh>
        {/* Dual Librarian All-in-One Monitors */}
        {[-0.55, 0.55].map((mx, idx) => (
          <group key={`rec-mon-${idx}`} position={[mx, 1.06, -0.1]}>
            <mesh position={[0, 0.12, 0]} material={materials.darkMetal}>
              <boxGeometry args={[0.08, 0.24, 0.08]} />
            </mesh>
            <mesh position={[0, 0.28, 0]} material={materials.darkMetal}>
              <boxGeometry args={[0.52, 0.32, 0.03]} />
            </mesh>
            <mesh position={[0, 0.28, 0.018]} material={materials.screenGlow}>
              <boxGeometry args={[0.48, 0.28, 0.01]} />
            </mesh>
          </group>
        ))}
        {/* Librarian Chairs */}
        {[-0.55, 0.55].map((cxPos, idx) => (
          <group key={`rec-chair-${idx}`} position={[cxPos, 0, -0.85]}>
            <mesh position={[0, 0.45, 0]} material={materials.chairFabric} castShadow>
              <boxGeometry args={[0.48, 0.08, 0.48]} />
            </mesh>
            <mesh position={[0, 0.78, -0.2]} material={materials.chairFabric} castShadow>
              <boxGeometry args={[0.46, 0.58, 0.08]} />
            </mesh>
            <mesh position={[0, 0.22, 0]} material={materials.darkMetal}>
              <cylinderGeometry args={[0.04, 0.22, 0.44, 8]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* ============================================================== */}
      {/* 4. NORTH BOOK STACK AISLES (10 DOUBLE-SIDED OAK BOOKCASES)     */}
      {/* ============================================================== */}
      {LIBRARY_LAYOUT.bookcaseRowsZ.map((rowZ, rIdx) =>
        LIBRARY_LAYOUT.bookcaseColsX.map((colX, cIdx) => {
          const [bw, bh, bd] = LIBRARY_LAYOUT.bookcaseSize;
          return (
            <group key={`bookcase-${rIdx}-${cIdx}`} position={[colX, 0, rowZ]}>
              {/* Central Spine & Side Panels */}
              <mesh position={[0, bh / 2, 0]} material={materials.warmOakFurniture} castShadow receiveShadow>
                <boxGeometry args={[bw, bh, 0.06]} />
              </mesh>
              <mesh position={[-bw / 2 + 0.03, bh / 2, 0]} material={materials.warmOakFurniture} castShadow>
                <boxGeometry args={[0.06, bh, bd]} />
              </mesh>
              <mesh position={[bw / 2 - 0.03, bh / 2, 0]} material={materials.warmOakFurniture} castShadow>
                <boxGeometry args={[0.06, bh, bd]} />
              </mesh>

              {/* 5 Horizontal Shelves + Colorful Book Clusters on Both Sides */}
              {[0.12, 0.56, 1.0, 1.44, 1.88, 2.22].map((sy, sIdx) => (
                <group key={`shelf-${sIdx}`}>
                  <mesh position={[0, sy, 0]} material={materials.warmOakFurniture} receiveShadow>
                    <boxGeometry args={[bw - 0.04, 0.04, bd]} />
                  </mesh>
                  {sIdx < 5 &&
                    [-0.4, -0.1, 0.22, 0.55, 0.88, -0.75, -1.08, 1.15].map((bx, bIdx) => {
                      const mat =
                        materials.bookMats[(rIdx * 3 + cIdx * 5 + sIdx * 2 + bIdx) % materials.bookMats.length];
                      const bookH = 0.26 + ((sIdx + bIdx) % 3) * 0.04;
                      return (
                        <group key={`books-${sIdx}-${bIdx}`}>
                          {/* North-facing shelf row */}
                          <mesh
                            position={[bx, sy + 0.02 + bookH / 2, -bd / 4]}
                            material={mat}
                            castShadow
                          >
                            <boxGeometry args={[0.24, bookH, 0.22]} />
                          </mesh>
                          {/* South-facing shelf row */}
                          <mesh
                            position={[-bx, sy + 0.02 + bookH / 2, bd / 4]}
                            material={mat}
                            castShadow
                          >
                            <boxGeometry args={[0.24, bookH, 0.22]} />
                          </mesh>
                        </group>
                      );
                    })}
                </group>
              ))}
            </group>
          );
        }),
      )}

      {/* ============================================================== */}
      {/* 5. CENTRAL READING LOUNGE & PLANTERS (Z = 0, X = +1.8)         */}
      {/* ============================================================== */}
      <group position={[1.8, 0, 0]}>
        {/* Low Marble Coffee Table */}
        <mesh position={[0, 0.38, 0]} material={materials.marbleTop} castShadow receiveShadow>
          <boxGeometry args={[1.5, 0.05, 0.95]} />
        </mesh>
        <mesh position={[0, 0.19, 0]} material={materials.darkMetal}>
          <boxGeometry args={[1.2, 0.36, 0.7]} />
        </mesh>
        {/* Featured Open Art Book on Coffee Table */}
        <mesh position={[0, 0.42, 0]} material={materials.paperWhite}>
          <boxGeometry args={[0.42, 0.03, 0.3]} />
        </mesh>

        {/* 4 Plush Lounge Armchairs */}
        {[
          { x: -1.35, z: -0.65, rotY: Math.PI / 3 },
          { x: -1.35, z: 0.65, rotY: (2 * Math.PI) / 3 },
          { x: 1.35, z: -0.65, rotY: -Math.PI / 3 },
          { x: 1.35, z: 0.65, rotY: -(2 * Math.PI) / 3 },
        ].map((chair, idx) => (
          <group key={`lounge-chair-${idx}`} position={[chair.x, 0, chair.z]} rotation={[0, chair.rotY, 0]}>
            <mesh position={[0, 0.32, 0]} material={materials.loungeBlue} castShadow>
              <boxGeometry args={[0.72, 0.28, 0.72]} />
            </mesh>
            <mesh position={[0, 0.62, -0.26]} material={materials.loungeBlue} castShadow>
              <boxGeometry args={[0.72, 0.48, 0.18]} />
            </mesh>
            <mesh position={[-0.3, 0.48, 0]} material={materials.loungeBlue}>
              <boxGeometry args={[0.12, 0.24, 0.68]} />
            </mesh>
            <mesh position={[0.3, 0.48, 0]} material={materials.loungeBlue}>
              <boxGeometry args={[0.12, 0.24, 0.68]} />
            </mesh>
          </group>
        ))}

        {/* Decorative Indoor Ficus Planters */}
        {[-2.3, 2.3].map((pz, idx) => (
          <group key={`planter-${idx}`} position={[1.8, 0, pz]}>
            <mesh position={[0, 0.3, 0]} material={materials.walnutWood} castShadow>
              <cylinderGeometry args={[0.32, 0.24, 0.6, 12]} />
            </mesh>
            <mesh position={[0, 0.85, 0]} material={materials.warmOakFurniture}>
              <cylinderGeometry args={[0.05, 0.07, 0.7, 8]} />
            </mesh>
            <mesh position={[0, 1.35, 0]} material={materials.foliageGreen} castShadow>
              <dodecahedronGeometry args={[0.48, 1]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* ============================================================== */}
      {/* 6. SOUTH MAIN READING HALL (8 4-SEAT STUDY TABLES & LAMPS)     */}
      {/* ============================================================== */}
      {LIBRARY_LAYOUT.readingTableRowsZ.map((tz, rIdx) =>
        LIBRARY_LAYOUT.readingTableColsX.map((tx, cIdx) => {
          const [tw, th, td] = LIBRARY_LAYOUT.readingTableSize;
          return (
            <group key={`reading-table-${rIdx}-${cIdx}`} position={[tx, 0, tz]}>
              {/* Oak Tabletop */}
              <mesh position={[0, th, 0]} material={materials.warmOakFurniture} castShadow receiveShadow>
                <boxGeometry args={[tw, 0.06, td]} />
              </mesh>
              {/* 4 Table Legs */}
              {[
                [-tw / 2 + 0.12, -td / 2 + 0.12],
                [tw / 2 - 0.12, -td / 2 + 0.12],
                [-tw / 2 + 0.12, td / 2 - 0.12],
                [tw / 2 - 0.12, td / 2 - 0.12],
              ].map(([lx, lz], lIdx) => (
                <mesh key={`leg-${lIdx}`} position={[lx, th / 2, lz]} material={materials.darkMetal} castShadow>
                  <boxGeometry args={[0.07, th, 0.07]} />
                </mesh>
              ))}

              {/* Classic Library Green Banker's Lamp in Table Center */}
              <group position={[0, th + 0.03, 0]}>
                <mesh position={[0, 0.02, 0]} material={materials.brassGold}>
                  <cylinderGeometry args={[0.11, 0.13, 0.04, 12]} />
                </mesh>
                <mesh position={[0, 0.18, 0]} material={materials.brassGold}>
                  <cylinderGeometry args={[0.02, 0.02, 0.32, 8]} />
                </mesh>
                <mesh position={[0, 0.34, 0]} material={materials.bankerShadeGreen}>
                  <boxGeometry args={[0.34, 0.1, 0.2]} />
                </mesh>
              </group>

              {/* Open Study Books on Tabletop */}
              {[-0.58, 0.58].map((bx, bIdx) => (
                <mesh key={`study-book-${bIdx}`} position={[bx, th + 0.04, bIdx === 0 ? -0.28 : 0.28]} material={materials.paperWhite}>
                  <boxGeometry args={[0.32, 0.02, 0.24]} />
                </mesh>
              ))}

              {/* 4 Study Chairs per Table */}
              {[
                { x: -0.58, z: -td / 2 - 0.32, backZ: -0.2 },
                { x: 0.58, z: -td / 2 - 0.32, backZ: -0.2 },
                { x: -0.58, z: td / 2 + 0.32, backZ: 0.2 },
                { x: 0.58, z: td / 2 + 0.32, backZ: 0.2 },
              ].map((ch, chIdx) => (
                <group key={`study-chair-${chIdx}`} position={[ch.x, 0, ch.z]}>
                  <mesh position={[0, 0.44, 0]} material={materials.chairFabric} castShadow>
                    <boxGeometry args={[0.44, 0.06, 0.44]} />
                  </mesh>
                  <mesh position={[0, 0.72, ch.backZ]} material={materials.warmOakFurniture} castShadow>
                    <boxGeometry args={[0.44, 0.5, 0.06]} />
                  </mesh>
                  <mesh position={[0, 0.22, 0]} material={materials.darkMetal}>
                    <cylinderGeometry args={[0.035, 0.18, 0.44, 8]} />
                  </mesh>
                </group>
              ))}
            </group>
          );
        }),
      )}

      {/* ============================================================== */}
      {/* 7. DIGITAL MEDIA & E-LIBRARY WORKSTATIONS (Z = +20.4)          */}
      {/* ============================================================== */}
      <group position={[0, 0, 20.4]}>
        <mesh position={[0, 0.76, 0]} material={materials.marbleTop} castShadow receiveShadow>
          <boxGeometry args={[6.6, 0.06, 0.9]} />
        </mesh>
        <mesh position={[-3.1, 0.38, 0]} material={materials.walnutWood} castShadow>
          <boxGeometry args={[0.16, 0.76, 0.82]} />
        </mesh>
        <mesh position={[3.1, 0.38, 0]} material={materials.walnutWood} castShadow>
          <boxGeometry args={[0.16, 0.76, 0.82]} />
        </mesh>
        <mesh position={[0, 0.38, 0.35]} material={materials.walnutWood}>
          <boxGeometry args={[6.2, 0.72, 0.08]} />
        </mesh>

        {/* 5 Computer Workstations & Chairs */}
        {[-2.4, -1.2, 0, 1.2, 2.4].map((wx, wIdx) => (
          <group key={`pc-station-${wIdx}`} position={[wx, 0, 0]}>
            <mesh position={[0, 0.92, 0.12]} material={materials.darkMetal}>
              <boxGeometry args={[0.08, 0.26, 0.08]} />
            </mesh>
            <mesh position={[0, 1.1, 0.1]} material={materials.darkMetal} castShadow>
              <boxGeometry args={[0.62, 0.38, 0.04]} />
            </mesh>
            <mesh position={[0, 1.1, 0.075]} material={materials.screenGlow}>
              <boxGeometry args={[0.56, 0.32, 0.01]} />
            </mesh>
            {/* Keyboard */}
            <mesh position={[0, 0.8, -0.18]} material={materials.darkMetal}>
              <boxGeometry args={[0.38, 0.02, 0.14]} />
            </mesh>
            {/* Chair */}
            <group position={[0, 0, -0.78]}>
              <mesh position={[0, 0.45, 0]} material={materials.loungeBlue} castShadow>
                <boxGeometry args={[0.46, 0.07, 0.46]} />
              </mesh>
              <mesh position={[0, 0.76, -0.2]} material={materials.loungeBlue} castShadow>
                <boxGeometry args={[0.44, 0.55, 0.07]} />
              </mesh>
              <mesh position={[0, 0.22, 0]} material={materials.darkMetal}>
                <cylinderGeometry args={[0.04, 0.2, 0.44, 8]} />
              </mesh>
            </group>
          </group>
        ))}
      </group>

      {/* ============================================================== */}
      {/* 8. OVERHEAD SUSPENDED ARCHITECTURAL LUMINAIRES & WARM LIGHTS   */}
      {/* ============================================================== */}
      {[-16.8, -11.4, -4.4, 0, 6.9, 13.7, 20.4].map((lz, lIdx) => (
        <group key={`ceiling-light-${lIdx}`} position={[0, 2.48, lz]}>
          <mesh material={materials.warmLightEmissive}>
            <boxGeometry args={[5.2, 0.05, 0.22]} />
          </mesh>
        </group>
      ))}

      {/* Warm interior illumination for first-person walkthrough */}
      <pointLight position={[0, 2.35, -13.0]} intensity={14} distance={22} color="#fef3c7" />
      <pointLight position={[0, 2.35, 9.5]} intensity={14} distance={22} color="#fef3c7" />
    </group>
  );
}
