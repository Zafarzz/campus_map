import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import { mapConfig } from '../../config/mapConfig';
import { getInteriorWoodTextures } from './materials/pbrMaterials';

export type BlockCLectureHall3DProps = {
  position: [number, number, number];
  size: [number, number, number];
  roomNumber: string;
  selected?: boolean;
};

/**
 * 3D Architectural Tiered Lecture Hall (Block C, Floor 2: C-201 and C-202).
 * Designed with 5.0m high ceilings per user blueprint (media_1794086015357_8ef747bc.png):
 * - Stepped / tiered auditorium floor (3 elevated tiers).
 * - Curved / straight long oak lecture desks with ergonomic seminar seating.
 * - Keynote speaker rostrum with modern wooden lectern, microphone, and laptop.
 * - Giant 16:9 ultra-wide digital presentation video wall + dual dry-erase whiteboards.
 * - Acoustic warm oak slat wall paneling along side walls.
 * - High-ceiling linear LED pendant luminaire tracks suspended from ceiling cables at 4.2m.
 * - High clerestory architectural vertical windows.
 */
export function BlockCLectureHall3D({
  position,
  size,
  roomNumber,
  selected = false,
}: BlockCLectureHall3DProps) {
  const [widthX, heightY, lengthZ] = size;
  const woodPbr = useMemo(() => getInteriorWoodTextures(6, 6), []);

  const floorY = -heightY / 2;
  const ceilingY = heightY / 2;

  // Presentation screen texture
  const screenTexture = useMemo(() => {
    if (typeof document === 'undefined') return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Dark navy slate background
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, 1024, 512);

      // Top title bar
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(0, 0, 1024, 80);

      // Institution header
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px sans-serif';
      ctx.fillText(`AJOU UNIVERSITY IN TASHKENT · ${roomNumber}`, 40, 54);

      // Slide workspace
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(40, 104, 944, 376);

      // Main title
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 44px sans-serif';
      ctx.fillText('Large Tiered Lecture Auditorium', 70, 185);

      // Bullet points
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '26px sans-serif';
      ctx.fillText('• Academic Lecture Series & Digital Twin Systems', 70, 255);
      ctx.fillText('• High-Ceiling Acoustic Slatted Architecture (Clear Height: 5.0m)', 70, 310);
      ctx.fillText('• Department of Architecture & Civil Engineering', 70, 365);

      // Live status pill
      ctx.fillStyle = '#059669';
      ctx.beginPath();
      ctx.roundRect(70, 410, 240, 48, 8);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('● LECTURE ACTIVE', 92, 442);

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
      deskOak: new THREE.MeshStandardMaterial({
        color: '#d4a373',
        roughness: 0.3,
      }),
      chairFabric: new THREE.MeshStandardMaterial({
        color: '#334155',
        roughness: 0.7,
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
      wallLight: new THREE.MeshStandardMaterial({
        color: '#f1f5f9',
        roughness: 0.85,
      }),
      pendantLuminaire: new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.1,
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: 0.8,
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

  // Front presentation wall is at North (negative Z).
  // Seating steps rise toward South (positive Z).
  const tierCount = 3;
  const stepRise = 0.26; // 26cm rise per tier
  const tierDepth = (lengthZ * 0.6) / tierCount; // ~2.8m depth per tier
  const tierStartX = -widthX / 2 + 0.4;
  const tierWidth = widthX - 0.8;

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
        const tierZCenter = -lengthZ * 0.1 + (i + 0.5) * tierDepth;
        const tierHeight = tierElevation;

        return (
          <group key={i}>
            {/* Stepped platform */}
            <mesh position={[0, floorY + tierHeight / 2, tierZCenter]}>
              <boxGeometry args={[tierWidth, tierHeight, tierDepth - 0.05]} />
              <primitive object={materials.tierOak} attach="material" />
            </mesh>

            {/* Dark contrast riser front */}
            <mesh position={[0, floorY + tierHeight / 2, tierZCenter - tierDepth / 2 + 0.02]}>
              <boxGeometry args={[tierWidth, tierHeight, 0.04]} />
              <primitive object={materials.tierRiser} attach="material" />
            </mesh>

            {/* Long Continuous Oak Lecture Desk across the tier */}
            <mesh position={[0, floorY + tierElevation + 0.74, tierZCenter - 0.3]}>
              <boxGeometry args={[tierWidth - 0.8, 0.05, 0.55]} />
              <primitive object={materials.deskOak} attach="material" />
            </mesh>

            {/* Desk Metal Supports */}
            {[-tierWidth * 0.35, 0, tierWidth * 0.35].map((supportX, sIdx) => (
              <mesh key={sIdx} position={[supportX, floorY + tierElevation + 0.37, tierZCenter - 0.3]}>
                <boxGeometry args={[0.06, 0.74, 0.45]} />
                <primitive object={materials.metalLegs} attach="material" />
              </mesh>
            ))}

            {/* Row of Ergonomic Seminar Chairs along the tier */}
            {[-tierWidth * 0.38, -tierWidth * 0.23, -tierWidth * 0.08, tierWidth * 0.08, tierWidth * 0.23, tierWidth * 0.38].map(
              (chairX, cIdx) => (
                <group key={cIdx} position={[chairX, floorY + tierElevation, tierZCenter + 0.35]}>
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
              )
            )}
          </group>
        );
      })}

      {/* 3. Front Keynote Stage & Speaker Rostrum (North wall, Z = -lengthZ / 2 + 0.15) */}
      <group position={[0, floorY, -lengthZ / 2 + 0.2]}>
        {/* Presenter Podium / Lectern */}
        <group position={[-widthX * 0.25, 0, 1.6]}>
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

        {/* Giant Ultra-Wide Digital Presentation Video Wall */}
        <group position={[0, 2.6, 0.08]}>
          {/* Screen Outer Frame */}
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[widthX * 0.65 + 0.1, 2.8 + 0.1, 0.08]} />
            <primitive object={materials.screenFrame} attach="material" />
          </mesh>
          {/* Interactive Screen Display */}
          <mesh position={[0, 0, 0.05]}>
            <boxGeometry args={[widthX * 0.65, 2.8, 0.04]} />
            <primitive object={materials.screenBoard} attach="material" />
          </mesh>
        </group>

        {/* Flanking Dry-Erase Whiteboards on Left & Right */}
        <mesh position={[-widthX * 0.4, 2.4, 0.06]}>
          <boxGeometry args={[1.2, 2.2, 0.04]} />
          <primitive object={materials.whiteboard} attach="material" />
        </mesh>
        <mesh position={[widthX * 0.4, 2.4, 0.06]}>
          <boxGeometry args={[1.2, 2.2, 0.04]} />
          <primitive object={materials.whiteboard} attach="material" />
        </mesh>
      </group>

      {/* 4. Acoustic Wood Slat Wall Paneling along East & West Walls */}
      {[-widthX / 2 + 0.08, widthX / 2 - 0.08].map((wallX, sideIdx) => (
        <group key={sideIdx} position={[wallX, 0, 0]}>
          {/* Dark acoustic backing */}
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[0.04, heightY - 0.2, lengthZ - 0.4]} />
            <primitive object={materials.acousticBacking} attach="material" />
          </mesh>
          {/* Warm vertical oak slats */}
          {Array.from({ length: 14 }).map((_, s) => {
            const slatZ = -lengthZ / 2 + 1.2 + (s * (lengthZ - 2.4)) / 13;
            return (
              <mesh key={s} position={[sideIdx === 0 ? 0.03 : -0.03, 0, slatZ]}>
                <boxGeometry args={[0.03, heightY - 0.4, 0.12]} />
                <primitive object={materials.acousticSlat} attach="material" />
              </mesh>
            );
          })}
        </group>
      ))}

      {/* 5. High-Ceiling Suspended Linear LED Pendant Luminaires (Suspended at Y = ceilingY - 0.8m) */}
      {[-lengthZ * 0.25, 0, lengthZ * 0.25].map((lumZ, lIdx) => (
        <group key={lIdx} position={[0, ceilingY - 0.8, lumZ]}>
          {/* Linear LED fixture */}
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[widthX * 0.75, 0.08, 0.12]} />
            <primitive object={materials.pendantLuminaire} attach="material" />
          </mesh>
          {/* Suspension aircraft cables to ceiling */}
          {[-widthX * 0.32, widthX * 0.32].map((cx, cIdx) => (
            <mesh key={cIdx} position={[cx, 0.4, 0]}>
              <cylinderGeometry args={[0.005, 0.005, 0.8, 6]} />
              <primitive object={materials.cableSteel} attach="material" />
            </mesh>
          ))}
        </group>
      ))}

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
