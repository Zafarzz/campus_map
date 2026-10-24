import { useMemo } from 'react';
import * as THREE from 'three';

export type SolarCanopiesProps = {
  positions?: [number, number, number][];
};

type CanopySpec = {
  pos: [number, number, number];
  length: number;
  width: number;
};

/**
 * Photovoltaic (PV) Carport Canopy Structures & Dormitory Parking Ensemble:
 * Calibrated directly to CAD reference masterplan (media_1792882021253.png):
 * - 4 Solar Canopy segments in a 2x2 grid (North-West, North-East, South-West, South-East).
 * - Central pedestrian aisle connecting Dormitory south entrance to parking & south gate.
 * - Central vehicle driving aisle between canopy rows.
 * - High-spec structural steel T-frames, tilted monocrystalline solar arrays (#0f172a / #1e3a8a).
 * - Asphalt parking lot with white stall striping and parked EV campus vehicles.
 * - South utility garages/sheds along the perimeter fence.
 * - West covered shelter & utility structure along the west wing.
 */
export function SolarCanopies({ positions }: SolarCanopiesProps) {
  const materials = useMemo(() => {
    // 1. Steel structural frame (galvanized steel / dark anthracite RAL 7024)
    const steelMat = new THREE.MeshStandardMaterial({
      color: '#334155',
      metalness: 0.8,
      roughness: 0.35,
    });

    // 2. Photovoltaic solar panel surface (deep blue monocrystalline silicon with solar cell sheen)
    const solarMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.22,
      metalness: 0.75,
    });

    // 3. Aluminum frame edge trim
    const trimMat = new THREE.MeshStandardMaterial({
      color: '#94a3b8',
      metalness: 0.9,
      roughness: 0.25,
    });

    // 4. White parking stall lines
    const lineMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
    });

    // 5. Asphalt parking bay surface (soft neutral slate grey per CAD reference)
    const asphaltMat = new THREE.MeshStandardMaterial({
      color: '#475569',
      roughness: 0.88,
    });

    // 6. Concrete curb / footing material
    const curbMat = new THREE.MeshStandardMaterial({
      color: '#94a3b8',
      roughness: 0.85,
    });

    // 7. Garages / utility shed materials (warm terracotta/brown roofs & light plastered walls)
    const garageWallMat = new THREE.MeshStandardMaterial({
      color: '#e2e8f0',
      roughness: 0.85,
    });
    const garageRoofMat = new THREE.MeshStandardMaterial({
      color: '#78350f', // Deep brown/terracotta tile
      roughness: 0.65,
    });
    const corrugatedMat = new THREE.MeshStandardMaterial({
      color: '#94a3b8',
      metalness: 0.7,
      roughness: 0.4,
    });

    // 8. Stylized campus EV vehicle colors
    const carColors = ['#f8fafc', '#0284c7', '#334155', '#b91c1c', '#e2e8f0', '#059669'];
    const carMats = carColors.map(
      (c) =>
        new THREE.MeshStandardMaterial({
          color: c,
          metalness: 0.6,
          roughness: 0.3,
        }),
    );

    return {
      steelMat,
      solarMat,
      trimMat,
      lineMat,
      asphaltMat,
      curbMat,
      garageWallMat,
      garageRoofMat,
      corrugatedMat,
      carMats,
    };
  }, []);

  // 4 Solar canopies in 2x2 grid matching media_1792882021253.png
  const canopies: CanopySpec[] = useMemo(() => {
    if (positions && positions.length >= 4) {
      return positions.map((p) => ({ pos: p, length: 25.0, width: 6.0 }));
    }
    return [
      // Row 1 (North row)
      { pos: [-68.5, 0, 137.5], length: 25.0, width: 6.0 }, // NW
      { pos: [-40.0, 0, 137.5], length: 25.0, width: 6.0 }, // NE
      // Row 2 (South row)
      { pos: [-68.5, 0, 149.5], length: 25.0, width: 6.0 }, // SW
      { pos: [-40.0, 0, 149.5], length: 25.0, width: 6.0 }, // SE
    ];
  }, [positions]);

  // Custom polygon geometry for parking slab perfectly bounded by the diagonal fence & curbs
  const parkingGeo = useMemo(() => {
    const shape = new THREE.Shape();
    // Counter-clockwise winding in (X, -Z) plane so normal points up (+Y)
    shape.moveTo(-88.0, -165.5);
    shape.lineTo(-32.0, -180.0);
    shape.lineTo(-25.0, -181.8);
    shape.lineTo(-17.5, -182.5);
    shape.lineTo(-17.5, -133.5);
    shape.lineTo(-88.0, -133.5);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, []);

  return (
    <group>
      {/* ============================================================== */}
      {/* 1. MAIN DORMITORY ASPHALT PARKING LOT BASE SLAB               */}
      {/* ============================================================== */}
      <mesh
        geometry={parkingGeo}
        material={materials.asphaltMat}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.015, 0]}
        receiveShadow
      />
      {/* Surrounding Concrete Curbs */}
      <mesh position={[-52.75, 0.04, 133.5]} material={materials.curbMat} receiveShadow>
        <boxGeometry args={[70.5, 0.06, 0.2]} />
      </mesh>
      <mesh position={[-88.0, 0.04, 149.5]} material={materials.curbMat} receiveShadow>
        <boxGeometry args={[0.2, 0.06, 32.0]} />
      </mesh>

      {/* Decorative Manicured Hedge Border along North Parking Edge */}
      <mesh position={[-71.0, 0.25, 133.0]} castShadow receiveShadow>
        <boxGeometry args={[28.0, 0.5, 0.8]} />
        <meshStandardMaterial color="#2d5a27" roughness={0.8} />
      </mesh>
      <mesh position={[-35.0, 0.25, 133.0]} castShadow receiveShadow>
        <boxGeometry args={[28.0, 0.5, 0.8]} />
        <meshStandardMaterial color="#2d5a27" roughness={0.8} />
      </mesh>

      {/* ============================================================== */}
      {/* 2. 4 PHOTOVOLTAIC SOLAR CANOPIES (2x2 GRID)                    */}
      {/* ============================================================== */}
      {canopies.map((canopy, cIdx) => {
        const { pos, length: cLen, width: cW } = canopy;
        const columnCount = 5;
        const colSpacing = cLen / (columnCount - 1);
        const stallCount = 8;
        const stallW = cLen / stallCount;

        return (
          <group key={`canopy-${cIdx}`} position={pos}>
            {/* White Parking Bay Markings */}
            <group position={[0, 0.026, 0]}>
              {Array.from({ length: stallCount + 1 }).map((_, sIdx) => {
                const sx = -cLen / 2 + sIdx * stallW;
                return (
                  <mesh key={`stall-line-${sIdx}`} position={[sx, 0, 0]}>
                    <boxGeometry args={[0.1, 0.002, cW]} />
                    <primitive object={materials.lineMat} attach="material" />
                  </mesh>
                );
              })}
            </group>

            {/* Steel Support T-Frames */}
            {Array.from({ length: columnCount }).map((_, colIdx) => {
              const colX = -cLen / 2 + colIdx * colSpacing;
              return (
                <group key={`col-${colIdx}`} position={[colX, 0, 0]}>
                  {/* Concrete Footing Pier */}
                  <mesh position={[0, 0.15, 0]} material={materials.curbMat}>
                    <cylinderGeometry args={[0.22, 0.28, 0.3, 12]} />
                  </mesh>
                  {/* Vertical Steel Column */}
                  <mesh position={[0, 1.6, 0]} material={materials.steelMat} castShadow>
                    <cylinderGeometry args={[0.11, 0.13, 3.2, 12]} />
                  </mesh>
                  {/* Horizontal T-cantilever Crossbeam */}
                  <mesh position={[0, 3.2, 0]} material={materials.steelMat} castShadow>
                    <boxGeometry args={[0.18, 0.22, cW - 0.4]} />
                  </mesh>
                </group>
              );
            })}

            {/* Longitudinal Purlin Beams */}
            {[-1.8, 0, 1.8].map((pz, pIdx) => (
              <mesh key={`purlin-${pIdx}`} position={[0, 3.32, pz]} material={materials.steelMat} castShadow>
                <boxGeometry args={[cLen, 0.1, 0.1]} />
              </mesh>
            ))}

            {/* Photovoltaic Solar Panel Array (tilted 11 degrees South for sun capture) */}
            <group position={[0, 3.42, 0]} rotation={[0.19, 0, 0]}>
              {/* PV Silicon surface */}
              <mesh material={materials.solarMat} castShadow receiveShadow>
                <boxGeometry args={[cLen, 0.04, cW]} />
              </mesh>
              {/* Aluminum edge trim */}
              <mesh material={materials.trimMat}>
                <boxGeometry args={[cLen + 0.06, 0.05, cW + 0.06]} />
              </mesh>
            </group>

            {/* Parked EV Vehicles under each canopy */}
            {[0, 2, 4, 6].map((stallIdx, vIdx) => {
              const carX = -cLen / 2 + (stallIdx + 0.5) * stallW;
              const carMat = materials.carMats[(cIdx * 2 + vIdx) % materials.carMats.length];
              return (
                <group key={`car-${vIdx}`} position={[carX, 0.75, 0.1]}>
                  {/* Car Body */}
                  <mesh position={[0, 0, 0]} material={carMat} castShadow receiveShadow>
                    <boxGeometry args={[1.9, 0.7, 4.0]} />
                  </mesh>
                  {/* Car Greenhouse / Cabin */}
                  <mesh position={[0, 0.52, -0.2]} material={materials.steelMat} castShadow>
                    <boxGeometry args={[1.6, 0.5, 2.3]} />
                  </mesh>
                  {/* Wheels */}
                  {[-0.92, 0.92].map((wx, wxi) =>
                    [-1.25, 1.25].map((wz, wzi) => (
                      <mesh
                        key={`w-${wxi}-${wzi}`}
                        position={[wx, -0.38, wz]}
                        rotation={[0, 0, Math.PI / 2]}
                        material={materials.steelMat}
                      >
                        <cylinderGeometry args={[0.3, 0.3, 0.2, 12]} />
                      </mesh>
                    )),
                  )}
                </group>
              );
            })}
          </group>
        );
      })}

      {/* ============================================================== */}
      {/* 3. SOUTH UTILITY GARAGES / SHEDS ALONG SOUTHERN FENCE          */}
      {/* ============================================================== */}
      <group position={[-74.0, 0, 163.5]} rotation={[0, -0.25, 0]}>
        {/* Garage 1: 12m x 6.5m (largest western garage with hipped roof) */}
        <mesh position={[0, 1.6, 0]} material={materials.garageWallMat} castShadow receiveShadow>
          <boxGeometry args={[12.0, 3.2, 6.5]} />
        </mesh>
        <mesh position={[0, 3.8, 0]} material={materials.garageRoofMat} castShadow>
          <boxGeometry args={[12.6, 1.2, 7.1]} />
        </mesh>
      </group>

      <group position={[-60.0, 0, 166.5]} rotation={[0, -0.25, 0]}>
        {/* Garage 2: 8.5m x 5.5m (middle garage) */}
        <mesh position={[0, 1.4, 0]} material={materials.garageWallMat} castShadow receiveShadow>
          <boxGeometry args={[8.5, 2.8, 5.5]} />
        </mesh>
        <mesh position={[0, 3.3, 0]} material={materials.garageRoofMat} castShadow>
          <boxGeometry args={[9.1, 1.0, 6.1]} />
        </mesh>
      </group>

      <group position={[-49.5, 0, 169.0]} rotation={[0, -0.25, 0]}>
        {/* Garage 3: 6.5m x 5m (eastern utility shed) */}
        <mesh position={[0, 1.3, 0]} material={materials.garageWallMat} castShadow receiveShadow>
          <boxGeometry args={[6.5, 2.6, 5.0]} />
        </mesh>
        <mesh position={[0, 3.05, 0]} material={materials.garageRoofMat} castShadow>
          <boxGeometry args={[7.1, 0.9, 5.6]} />
        </mesh>
      </group>

      {/* ============================================================== */}
      {/* 4. WEST COVERED SHELTER & UTILITY STRUCTURE (ALONG WEST WING)  */}
      {/* ============================================================== */}
      {/* Long narrow covered shelter / bike canopy (6m x 19.5m) */}
      <group position={[-94.5, 0, 103.5]}>
        {/* Concrete Base Slab */}
        <mesh position={[0, 0.05, 0]} material={materials.curbMat} receiveShadow>
          <boxGeometry args={[6.0, 0.1, 19.5]} />
        </mesh>
        {/* Steel Posts */}
        {[-8.5, -4.25, 0, 4.25, 8.5].map((pz, idx) => (
          <group key={`sh-post-${idx}`} position={[0, 0, pz]}>
            <mesh position={[-2.7, 1.5, 0]} material={materials.steelMat} castShadow>
              <cylinderGeometry args={[0.06, 0.06, 3.0, 8]} />
            </mesh>
            <mesh position={[2.7, 1.5, 0]} material={materials.steelMat} castShadow>
              <cylinderGeometry args={[0.06, 0.06, 3.0, 8]} />
            </mesh>
          </group>
        ))}
        {/* Corrugated Canopy Roof */}
        <mesh position={[0, 3.1, 0]} material={materials.corrugatedMat} castShadow>
          <boxGeometry args={[6.4, 0.15, 20.0]} />
        </mesh>
      </group>

      {/* Small Utility Booth below shelter (6m x 7.5m, H=3.4m) */}
      <group position={[-94.5, 0, 118.5]}>
        <mesh position={[0, 1.6, 0]} material={materials.garageWallMat} castShadow receiveShadow>
          <boxGeometry args={[6.0, 3.2, 7.5]} />
        </mesh>
        <mesh position={[0, 3.5, 0]} material={materials.garageRoofMat} castShadow>
          <boxGeometry args={[6.6, 0.7, 8.1]} />
        </mesh>
      </group>
    </group>
  );
}
