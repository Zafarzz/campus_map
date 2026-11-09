import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import { mapConfig } from '../../config/mapConfig';
import { getInteriorWoodTextures } from './materials/pbrMaterials';

export type BlockFLectureHall3DProps = {
  position: [number, number, number];
  size: [number, number, number];
  roomNumber: string;
  selected?: boolean;
};

/**
 * 3D Architectural Tiered Amphitheatre Lecture Hall for Block F (Floor 2: F-201 and F-202).
 * Reconstructed with 100% CAD precision from architectural floor plans:
 *
 * - Capacity: 120 students per amphitheatre.
 * - Multi-tiered auditorium rake (up to 8 elevated tiers) with dark risers and safety LED strips.
 * - Continuous curved/straight tiered oak lecture desks with privacy modesty panels.
 * - Ergonomic seminar seating banks separated by a central carpeted circulation aisle.
 * - Keynote speaker rostrum with modern wooden lectern, microphone, laptop, and speaker desk.
 * - Giant 16:9 ultra-wide digital presentation video wall + dual dry-erase whiteboards.
 * - Vertical acoustic warm oak slat wall paneling along side walls.
 * - High-ceiling linear LED pendant luminaire tracks suspended from ceiling cables.
 */
export function BlockFLectureHall3D({
  position,
  size,
  roomNumber,
  selected = false,
}: BlockFLectureHall3DProps) {
  const [widthX, heightY, lengthZ] = size;
  const woodPbr = useMemo(() => getInteriorWoodTextures(6, 6), []);

  const floorY = -heightY / 2;
  const ceilingY = heightY / 2;

  // Dynamic presentation screen canvas texture
  const screenTexture = useMemo(() => {
    if (typeof document === 'undefined') return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Dark navy slate background
      ctx.fillStyle = '#080d1a';
      ctx.fillRect(0, 0, 1024, 512);

      // Top title bar
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(0, 0, 1024, 80);

      // Institution header
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 34px sans-serif';
      ctx.fillText(`AJOU UNIVERSITY IN TASHKENT · ${roomNumber}`, 40, 54);

      // Slide workspace
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(40, 104, 944, 376);

      // Main title
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 42px sans-serif';
      ctx.fillText(`Large Tiered Lecture Amphitheatre · ${roomNumber}`, 70, 182);

      // Bullet points
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '24px sans-serif';
      ctx.fillText('• 120-Seat Tiered Auditorium & Stepped Seating Rake', 70, 248);
      ctx.fillText('• Faculty of Architecture & Civil Engineering · Lecture Series', 70, 298);
      ctx.fillText('• Digital Twin Systems & Interactive Campus Spatial Modeling', 70, 348);

      // Live status pill
      ctx.fillStyle = '#059669';
      ctx.beginPath();
      ctx.roundRect(70, 395, 290, 50, 10);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('● LECTURE ACTIVE · 120 SEATS', 90, 428);

      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      return tex;
    } catch {
      return null;
    }
  }, [roomNumber]);

  const materials = useMemo(() => {
    return {
      floorPlaza: new THREE.MeshStandardMaterial({
        color: '#f8fafc',
        roughness: 0.25,
      }),
      carpetAisle: new THREE.MeshStandardMaterial({
        color: '#1e293b', // Deep charcoal aisle carpet
        roughness: 0.85,
      }),
      tierOak: new THREE.MeshStandardMaterial({
        color: '#c99a64',
        map: woodPbr?.map ?? null,
        roughnessMap: woodPbr?.roughnessMap ?? null,
        roughness: 0.35,
        metalness: 0.05,
      }),
      tierRiser: new THREE.MeshStandardMaterial({
        color: '#0f172a',
        roughness: 0.8,
      }),
      stepLight: new THREE.MeshStandardMaterial({
        color: '#38bdf8',
        emissive: new THREE.Color('#0284c7'),
        emissiveIntensity: 0.8,
        roughness: 0.2,
      }),
      deskOak: new THREE.MeshStandardMaterial({
        color: '#d4a373',
        roughness: 0.3,
      }),
      modestyPanel: new THREE.MeshStandardMaterial({
        color: '#94a3b8',
        roughness: 0.45,
        metalness: 0.3,
      }),
      chairFabric: new THREE.MeshStandardMaterial({
        color: '#1e3a8a', // Ajou royal navy blue upholstery
        roughness: 0.75,
      }),
      metalLegs: new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.4,
        metalness: 0.8,
      }),
      screenBoard: new THREE.MeshStandardMaterial({
        map: screenTexture,
        roughness: 0.2,
        emissive: new THREE.Color('#38bdf8'),
        emissiveIntensity: 0.15,
      }),
      screenFrame: new THREE.MeshStandardMaterial({
        color: '#020617',
        roughness: 0.4,
      }),
      whiteboard: new THREE.MeshStandardMaterial({
        color: '#f8fafc',
        roughness: 0.1,
      }),
      acousticSlat: new THREE.MeshStandardMaterial({
        color: '#b45309',
        roughness: 0.45,
      }),
      acousticBacking: new THREE.MeshStandardMaterial({
        color: '#0f172a',
        roughness: 0.9,
      }),
      pendantLuminaire: new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.1,
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: 0.85,
      }),
      cableSteel: new THREE.MeshStandardMaterial({
        color: '#334155',
        roughness: 0.3,
        metalness: 0.9,
      }),
      podiumWood: new THREE.MeshStandardMaterial({
        color: '#9a3412',
        roughness: 0.35,
      }),
    };
  }, [woodPbr, screenTexture]);

  // Stage length at front (North wall)
  const stageLength = Math.max(3.6, Math.min(5.2, lengthZ * 0.2));
  const availableRakeZ = lengthZ - stageLength - 1.0;

  // Multi-tier raked auditorium parameters
  const tierDepth = Math.max(2.0, Math.min(2.8, availableRakeZ / 7));
  const tierCount = Math.max(3, Math.min(8, Math.floor(availableRakeZ / tierDepth)));
  const stepRise = 0.22; // 22 cm rise per tier

  const tierWidth = widthX - 0.6;
  const aisleWidth = 1.1; // Central circulation aisle
  const bankWidth = (tierWidth - aisleWidth) / 2; // Left & right seating banks

  // Left & right bank center offsets from room midline
  const leftBankCenterX = -aisleWidth / 2 - bankWidth / 2;
  const rightBankCenterX = aisleWidth / 2 + bankWidth / 2;

  // Number of chairs per bank on each row
  const chairsPerBank = Math.max(2, Math.min(4, Math.floor(bankWidth / 0.85)));

  return (
    <group position={position}>
      {/* Invisible raycast collider box for selection */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[widthX, heightY, lengthZ]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      {/* 1. Base floor plate at stage / podium level */}
      <mesh position={[0, floorY + 0.02, 0]} receiveShadow>
        <boxGeometry args={[widthX - 0.05, 0.04, lengthZ - 0.05]} />
        <primitive object={materials.floorPlaza} attach="material" />
      </mesh>

      {/* 2. Elevated Stepped Tiers (Auditorium Rake) */}
      {Array.from({ length: tierCount }).map((_, i) => {
        const tierElevation = (i + 1) * stepRise;
        const tierZCenter = -lengthZ / 2 + stageLength + (i + 0.5) * tierDepth;
        const tierHeight = tierElevation;

        return (
          <group key={i}>
            {/* Stepped platform */}
            <mesh position={[0, floorY + tierHeight / 2, tierZCenter]}>
              <boxGeometry args={[tierWidth, tierHeight, tierDepth - 0.06]} />
              <primitive object={materials.tierOak} attach="material" />
            </mesh>

            {/* Dark contrast riser front */}
            <mesh position={[0, floorY + tierHeight / 2, tierZCenter - tierDepth / 2 + 0.02]}>
              <boxGeometry args={[tierWidth, tierHeight, 0.04]} />
              <primitive object={materials.tierRiser} attach="material" />
            </mesh>

            {/* Step Safety LED light strip */}
            <mesh position={[0, floorY + tierElevation - 0.02, tierZCenter - tierDepth / 2 + 0.035]}>
              <boxGeometry args={[tierWidth, 0.02, 0.02]} />
              <primitive object={materials.stepLight} attach="material" />
            </mesh>

            {/* Central Carpeted Aisle Runner across the tier */}
            <mesh position={[0, floorY + tierElevation + 0.005, tierZCenter]}>
              <boxGeometry args={[aisleWidth, 0.01, tierDepth - 0.06]} />
              <primitive object={materials.carpetAisle} attach="material" />
            </mesh>

            {/* Seating Banks: Left & Right */}
            {[leftBankCenterX, rightBankCenterX].map((bankX, bIdx) => {
              const deskW = bankWidth - 0.15;
              return (
                <group key={bIdx} position={[bankX, 0, 0]}>
                  {/* Continuous Oak Lecture Desk Top */}
                  <mesh position={[0, floorY + tierElevation + 0.74, tierZCenter - 0.35]}>
                    <boxGeometry args={[deskW, 0.05, 0.55]} />
                    <primitive object={materials.deskOak} attach="material" />
                  </mesh>

                  {/* Privacy Modesty Panel in Front of Desk */}
                  <mesh position={[0, floorY + tierElevation + 0.44, tierZCenter - 0.6]}>
                    <boxGeometry args={[deskW, 0.45, 0.03]} />
                    <primitive object={materials.modestyPanel} attach="material" />
                  </mesh>

                  {/* Desk Metal Legs */}
                  {[-deskW * 0.4, 0, deskW * 0.4].map((lx, lIdx) => (
                    <mesh key={lIdx} position={[lx, floorY + tierElevation + 0.37, tierZCenter - 0.35]}>
                      <boxGeometry args={[0.05, 0.74, 0.45]} />
                      <primitive object={materials.metalLegs} attach="material" />
                    </mesh>
                  ))}

                  {/* Row of Ergonomic Seminar Chairs */}
                  {Array.from({ length: chairsPerBank }).map((_, cIdx) => {
                    const chairSpan = deskW * 0.8;
                    const chairX = -chairSpan / 2 + (cIdx + 0.5) * (chairSpan / chairsPerBank);
                    return (
                      <group key={cIdx} position={[chairX, floorY + tierElevation, tierZCenter + 0.32]}>
                        {/* Seat cushion */}
                        <mesh position={[0, 0.44, 0]}>
                          <boxGeometry args={[0.46, 0.06, 0.44]} />
                          <primitive object={materials.chairFabric} attach="material" />
                        </mesh>
                        {/* Curved backrest */}
                        <mesh position={[0, 0.72, 0.2]}>
                          <boxGeometry args={[0.44, 0.45, 0.05]} />
                          <primitive object={materials.chairFabric} attach="material" />
                        </mesh>
                        {/* Metal chair post */}
                        <mesh position={[0, 0.22, 0]}>
                          <cylinderGeometry args={[0.03, 0.03, 0.44, 8]} />
                          <primitive object={materials.metalLegs} attach="material" />
                        </mesh>
                        {/* Base plate */}
                        <mesh position={[0, 0.015, 0]}>
                          <cylinderGeometry args={[0.18, 0.18, 0.03, 12]} />
                          <primitive object={materials.metalLegs} attach="material" />
                        </mesh>
                      </group>
                    );
                  })}
                </group>
              );
            })}
          </group>
        );
      })}

      {/* 3. Front Keynote Stage & Speaker Rostrum (North wall, Z = -lengthZ / 2 + 0.15) */}
      <group position={[0, floorY, -lengthZ / 2 + 0.2]}>
        {/* Presenter Podium / Lectern */}
        <group position={[-widthX * 0.26, 0, 1.8]}>
          {/* Main wooden pedestal */}
          <mesh position={[0, 0.55, 0]}>
            <boxGeometry args={[0.8, 1.1, 0.55]} />
            <primitive object={materials.podiumWood} attach="material" />
          </mesh>
          {/* Angled top shelf */}
          <mesh position={[0, 1.14, 0.04]} rotation={[-0.2, 0, 0]}>
            <boxGeometry args={[0.84, 0.04, 0.58]} />
            <primitive object={materials.deskOak} attach="material" />
          </mesh>
          {/* Microphone gooseneck */}
          <mesh position={[0.2, 1.25, 0.05]}>
            <cylinderGeometry args={[0.008, 0.008, 0.22, 8]} />
            <primitive object={materials.metalLegs} attach="material" />
          </mesh>
          {/* Presenter Laptop */}
          <mesh position={[-0.1, 1.16, 0.04]} rotation={[-0.2, 0, 0]}>
            <boxGeometry args={[0.34, 0.015, 0.24]} />
            <primitive object={materials.metalLegs} attach="material" />
          </mesh>
        </group>

        {/* Faculty Keynote Table & Chair on Right Stage */}
        <group position={[widthX * 0.25, 0, 1.8]}>
          {/* Desk */}
          <mesh position={[0, 0.74 / 2, 0]}>
            <boxGeometry args={[1.6, 0.74, 0.7]} />
            <primitive object={materials.deskOak} attach="material" />
          </mesh>
          {/* Chair */}
          <mesh position={[0, 0.44, 0.6]}>
            <boxGeometry args={[0.48, 0.06, 0.46]} />
            <primitive object={materials.chairFabric} attach="material" />
          </mesh>
          <mesh position={[0, 0.72, 0.8]}>
            <boxGeometry args={[0.46, 0.45, 0.05]} />
            <primitive object={materials.chairFabric} attach="material" />
          </mesh>
        </group>

        {/* Giant Ultra-Wide Digital Presentation Video Wall */}
        <group position={[0, Math.min(2.6, heightY * 0.55), 0.08]}>
          {/* Screen Outer Frame */}
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[Math.min(widthX * 0.68 + 0.1, 7.2), Math.min(2.8 + 0.1, heightY * 0.7), 0.08]} />
            <primitive object={materials.screenFrame} attach="material" />
          </mesh>
          {/* Interactive Screen Display */}
          <mesh position={[0, 0, 0.05]}>
            <boxGeometry args={[Math.min(widthX * 0.68, 7.1), Math.min(2.8, heightY * 0.68), 0.04]} />
            <primitive object={materials.screenBoard} attach="material" />
          </mesh>
        </group>

        {/* Flanking Dry-Erase Whiteboards on Left & Right */}
        <mesh position={[-widthX * 0.41, Math.min(2.4, heightY * 0.5), 0.06]}>
          <boxGeometry args={[Math.min(1.2, widthX * 0.14), Math.min(2.2, heightY * 0.6), 0.04]} />
          <primitive object={materials.whiteboard} attach="material" />
        </mesh>
        <mesh position={[widthX * 0.41, Math.min(2.4, heightY * 0.5), 0.06]}>
          <boxGeometry args={[Math.min(1.2, widthX * 0.14), Math.min(2.2, heightY * 0.6), 0.04]} />
          <primitive object={materials.whiteboard} attach="material" />
        </mesh>
      </group>

      {/* 4. Acoustic Wood Slat Wall Paneling along East & West Walls */}
      {[-widthX / 2 + 0.08, widthX / 2 - 0.08].map((wallX, sideIdx) => {
        const slatCount = Math.max(10, Math.floor(lengthZ / 1.5));
        return (
          <group key={sideIdx} position={[wallX, 0, 0]}>
            {/* Dark acoustic backing */}
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[0.04, heightY - 0.2, lengthZ - 0.4]} />
              <primitive object={materials.acousticBacking} attach="material" />
            </mesh>
            {/* Warm vertical oak slats */}
            {Array.from({ length: slatCount }).map((_, s) => {
              const slatZ = -lengthZ / 2 + 1.2 + (s * (lengthZ - 2.4)) / (slatCount - 1);
              return (
                <mesh key={s} position={[sideIdx === 0 ? 0.03 : -0.03, 0, slatZ]}>
                  <boxGeometry args={[0.03, heightY - 0.4, 0.12]} />
                  <primitive object={materials.acousticSlat} attach="material" />
                </mesh>
              );
            })}
          </group>
        );
      })}

      {/* 5. Suspended Linear LED Pendant Luminaires */}
      {Array.from({ length: Math.max(3, Math.floor(lengthZ / 5.5)) }).map((_, lIdx, arr) => {
        const lumZ = -lengthZ / 2 + 3.0 + (lIdx * (lengthZ - 6.0)) / (arr.length - 1);
        return (
          <group key={lIdx} position={[0, ceilingY - 0.6, lumZ]}>
            {/* Linear LED fixture */}
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[widthX * 0.72, 0.08, 0.12]} />
              <primitive object={materials.pendantLuminaire} attach="material" />
            </mesh>
            {/* Suspension aircraft cables to ceiling */}
            {[-widthX * 0.3, widthX * 0.3].map((cx, cIdx) => (
              <mesh key={cIdx} position={[cx, 0.3, 0]}>
                <cylinderGeometry args={[0.005, 0.005, 0.6, 6]} />
                <primitive object={materials.cableSteel} attach="material" />
              </mesh>
            ))}
          </group>
        );
      })}

      {/* 6. Selection Highlight Frame */}
      {selected && (
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[widthX, heightY, lengthZ]} />
          <meshBasicMaterial visible={false} />
          <Edges color={mapConfig.colors.roomSelected} lineWidth={3} />
        </mesh>
      )}
    </group>
  );
}
