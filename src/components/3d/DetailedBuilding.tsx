import { useCursor } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useMemo, useState } from 'react';
import * as THREE from 'three';
import { mapConfig } from '../../config/mapConfig';
import {
  getBuildingAppearance,
  type BuildingAppearance,
  type TuningMaterialOverrides,
} from '../../domain/appearance';
import type { Building as BuildingData } from '../../domain/campus/types';
import type { BuildingGeometry, Footprint } from '../../domain/geometry/types';
import { EXTRUDE_ROTATION, footprintOutline, useExtrudedGeometry } from './geometryUtils';
import { isClick } from './pointer';
import { BlockCFacade } from './facades/BlockCFacade';
import { BlockBFacade } from './facades/BlockBFacade';

type Props = {
  building: BuildingData;
  geometry: BuildingGeometry;
  dimmed: boolean;
  tuning?: TuningMaterialOverrides;
  onSelectBuilding: () => void;
};

function getFootprintMetrics(fp: Footprint) {
  if (fp.type === 'rect') {
    return { worldX: fp.center[0], worldZ: fp.center[1], width: fp.size[0], depth: fp.size[1] };
  }
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const [x, z] of fp.points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { worldX: (minX + maxX) / 2, worldZ: (minZ + maxZ) / 2, width: maxX - minX, depth: maxZ - minZ };
}

// Cached shared base geometries
const sharedRoofHipGeo = new THREE.ConeGeometry(Math.sqrt(0.5), 1, 4);
sharedRoofHipGeo.rotateY(Math.PI / 4);

const sharedWindowGeo = new THREE.BoxGeometry(1.2, 1.8, 0.15);
const sharedColumnGeo = new THREE.CylinderGeometry(0.35, 0.4, 1, 10);

/**
 * Hip roof with eaves and fascia board.
 */
function HipRoof({
  width,
  depth,
  height,
  color,
  opacity,
  transparent,
  roughness,
}: {
  width: number;
  depth: number;
  height: number;
  color: string;
  opacity: number;
  transparent: boolean;
  roughness: number;
}) {
  return (
    <group position={[0, 0, 0]}>
      {/* Sloped Roof */}
      <mesh
        position={[0, height / 2, 0]}
        scale={[width, height, depth]}
        castShadow
        receiveShadow
        geometry={sharedRoofHipGeo}
      >
        <meshStandardMaterial
          color={color}
          transparent={transparent}
          opacity={opacity}
          depthWrite={!transparent}
          roughness={roughness}
        />
      </mesh>

      {/* Fascia & Eaves board */}
      <mesh position={[0, 0.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, 0.3, depth]} />
        <meshStandardMaterial
          color="#ffffff"
          transparent={transparent}
          opacity={opacity}
          depthWrite={!transparent}
          roughness={0.8}
        />
      </mesh>
    </group>
  );
}

/**
 * Procedural instanced windows along all 4 building faces.
 */
function InstancedWindows({
  width,
  depth,
  height,
  opacity,
  transparent,
  windowColor,
}: {
  width: number;
  depth: number;
  height: number;
  opacity: number;
  transparent: boolean;
  windowColor: string;
}) {
  const windowW = 1.2;
  const windowH = 1.8;
  const marginX = 2.0;
  const marginY = 2.5;

  const numWindowsX = Math.max(0, Math.floor((width - marginX) / (windowW + 1.8)));
  const numWindowsZ = Math.max(0, Math.floor((depth - marginX) / (windowW + 1.8)));
  const numFloors = Math.max(1, Math.floor((height - marginY) / (windowH + 1.2)));

  const count = (numWindowsX * 2 + numWindowsZ * 2) * numFloors;

  const instancedMesh = useMemo(() => {
    if (count <= 0) return null;

    const material = new THREE.MeshStandardMaterial({
      color: windowColor,
      metalness: 0.85,
      roughness: 0.15,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const mesh = new THREE.InstancedMesh(sharedWindowGeo, material, count);
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    const dummy = new THREE.Object3D();
    let idx = 0;

    const startY = 1.8;
    const spacingY = windowH + 1.2;

    for (let f = 0; f < numFloors; f++) {
      const y = startY + f * spacingY;

      // Front and Back faces
      if (numWindowsX > 0) {
        const spanX = (numWindowsX - 1) * (windowW + 1.8);
        const startX = -spanX / 2;
        for (let x = 0; x < numWindowsX; x++) {
          const px = startX + x * (windowW + 1.8);
          // Front (+Z)
          dummy.position.set(px, y, depth / 2 + 0.05);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          mesh.setMatrixAt(idx++, dummy.matrix);

          // Back (-Z)
          dummy.position.set(px, y, -depth / 2 - 0.05);
          dummy.rotation.set(0, Math.PI, 0);
          dummy.updateMatrix();
          mesh.setMatrixAt(idx++, dummy.matrix);
        }
      }

      // Left and Right faces
      if (numWindowsZ > 0) {
        const spanZ = (numWindowsZ - 1) * (windowW + 1.8);
        const startZ = -spanZ / 2;
        for (let z = 0; z < numWindowsZ; z++) {
          const pz = startZ + z * (windowW + 1.8);
          // Left (-X)
          dummy.position.set(-width / 2 - 0.05, y, pz);
          dummy.rotation.set(0, -Math.PI / 2, 0);
          dummy.updateMatrix();
          mesh.setMatrixAt(idx++, dummy.matrix);

          // Right (+X)
          dummy.position.set(width / 2 + 0.05, y, pz);
          dummy.rotation.set(0, Math.PI / 2, 0);
          dummy.updateMatrix();
          mesh.setMatrixAt(idx++, dummy.matrix);
        }
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [count, numWindowsX, numWindowsZ, numFloors, width, depth, windowColor, opacity, transparent]);

  if (!instancedMesh) return null;

  return <primitive object={instancedMesh} />;
}

/**
 * Main entrance portal and canopy at the front face.
 */
function EntrancePortal({
  width,
  depth,
  opacity,
  transparent,
}: {
  width: number;
  depth: number;
  opacity: number;
  transparent: boolean;
}) {
  const portalW = Math.min(6, width * 0.3);
  const portalH = 2.8;

  return (
    <group position={[0, 0, depth / 2 + 0.1]}>
      {/* Glazed entrance doors */}
      <mesh position={[0, portalH / 2, 0]}>
        <boxGeometry args={[portalW, portalH, 0.1]} />
        <meshStandardMaterial
          color="#0f172a"
          metalness={0.9}
          roughness={0.1}
          transparent={transparent}
          opacity={opacity}
          depthWrite={!transparent}
        />
      </mesh>

      {/* Modern canopy overhead */}
      <mesh position={[0, portalH + 0.15, 0.8]} castShadow receiveShadow>
        <boxGeometry args={[portalW + 0.8, 0.2, 1.8]} />
        <meshStandardMaterial
          color="#334155"
          metalness={0.5}
          roughness={0.5}
          transparent={transparent}
          opacity={opacity}
          depthWrite={!transparent}
        />
      </mesh>
    </group>
  );
}

/**
 * Classical portico with pediment and columns (e.g. for Academic Classic / Administration).
 */
function ClassicalPortico({
  width,
  depth,
  wallHeight,
  color,
  opacity,
  transparent,
}: {
  width: number;
  depth: number;
  wallHeight: number;
  color: string;
  opacity: number;
  transparent: boolean;
}) {
  const porticoW = Math.min(14, width * 0.5);
  const porticoD = 3.5;
  const colHeight = Math.min(wallHeight * 0.7, 5.5);

  return (
    <group position={[0, 0, depth / 2 + porticoD / 2]}>
      {/* Plinth Steps */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[porticoW + 1.2, 0.6, porticoD + 0.8]} />
        <meshStandardMaterial
          color="#334155"
          roughness={0.9}
          transparent={transparent}
          opacity={opacity}
          depthWrite={!transparent}
        />
      </mesh>

      {/* Columns */}
      {[-porticoW / 2 + 0.8, -porticoW / 6, porticoW / 6, porticoW / 2 - 0.8].map((cx, idx) => (
        <mesh
          key={idx}
          position={[cx, 0.6 + colHeight / 2, porticoD / 2 - 0.4]}
          scale={[1, colHeight, 1]}
          geometry={sharedColumnGeo}
          castShadow
        >
          <meshStandardMaterial
            color={color}
            roughness={0.7}
            transparent={transparent}
            opacity={opacity}
            depthWrite={!transparent}
          />
        </mesh>
      ))}

      {/* Entablature beam */}
      <mesh position={[0, 0.6 + colHeight + 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[porticoW + 0.8, 0.6, porticoD]} />
        <meshStandardMaterial
          color={color}
          roughness={0.7}
          transparent={transparent}
          opacity={opacity}
          depthWrite={!transparent}
        />
      </mesh>

      {/* Triangular Pediment */}
      <mesh
        position={[0, 0.6 + colHeight + 1.1, porticoD / 2 - 0.2]}
        rotation={[0, 0, 0]}
        scale={[porticoW + 0.8, 1.2, 0.6]}
        geometry={sharedRoofHipGeo}
        castShadow
      >
        <meshStandardMaterial
          color={color}
          roughness={0.8}
          transparent={transparent}
          opacity={opacity}
          depthWrite={!transparent}
        />
      </mesh>
    </group>
  );
}

export function DetailedBuilding({ building, geometry, dimmed, tuning, onSelectBuilding }: Props) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  // Architectural style resolved declaratively via appearance presets and configurations
  const appearance: BuildingAppearance = useMemo(() => {
    return getBuildingAppearance(building, tuning);
  }, [building, tuning]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!isClick(e)) return;
    e.stopPropagation();
    onSelectBuilding();
  };

  const opacity = dimmed ? mapConfig.opacity.dimmedBuilding : 1;
  const transparent = dimmed;

  const wallColor = hovered ? '#ffffff' : appearance.wallColor;

  return (
    <group
      onClick={onClick}
      onPointerOver={(e) => (e.stopPropagation(), setHovered(true))}
      onPointerOut={() => setHovered(false)}
    >
      {geometry.parts.map((footprint, i) => {
        const outline = footprintOutline(footprint);
        const isCustomFacade =
          (appearance.customFacade === 'block-c' || appearance.customFacade === 'block-b') && i === 0;
        const wallHeight =
          appearance.customFacade === 'block-c' && i === 0
            ? 10.8
            : appearance.customFacade === 'block-b' && i === 0
            ? 14.4
            : appearance.hasCornice
            ? geometry.height - 0.5
            : geometry.height;
        const parapetHeight = appearance.customFacade === 'block-c' ? 2.7 : 0.8;
        const wallGeo = useExtrudedGeometry(outline, wallHeight);
        const parapetGeo = useExtrudedGeometry(outline, parapetHeight);

        const { worldX, worldZ, width, depth } = getFootprintMetrics(footprint);

        return (
          <group key={i}>
            {/* 1. Main Facade Walls */}
            <mesh geometry={wallGeo} rotation={EXTRUDE_ROTATION} position={[0, 0, 0]} castShadow receiveShadow>
              <meshStandardMaterial
                color={wallColor}
                transparent={transparent}
                opacity={opacity}
                depthWrite={!transparent}
                roughness={appearance.wallRoughness}
                metalness={appearance.wallMetalness}
              />
            </mesh>

            {/* 2. Base Plinth */}
            {appearance.hasPlinth && !isCustomFacade && (
              <mesh position={[worldX, (appearance.plinthHeight ?? 0.6) / 2, worldZ]} castShadow receiveShadow>
                <boxGeometry args={[width + 0.25, appearance.plinthHeight ?? 0.6, depth + 0.25]} />
                <meshStandardMaterial
                  color={appearance.plinthColor ?? '#334155'}
                  transparent={transparent}
                  opacity={opacity}
                  depthWrite={!transparent}
                  roughness={0.9}
                />
              </mesh>
            )}

            {/* 3. Exterior Windows */}
            {appearance.hasWindows && !isCustomFacade && (
              <group position={[worldX, 0, worldZ]}>
                <InstancedWindows
                  width={width}
                  depth={depth}
                  height={wallHeight}
                  opacity={opacity}
                  transparent={transparent}
                  windowColor={appearance.windowColor ?? '#1e293b'}
                />
              </group>
            )}

            {/* 4. Ground Entrance Portal */}
            {!isCustomFacade && (
              <group position={[worldX, 0, worldZ]}>
                <EntrancePortal width={width} depth={depth} opacity={opacity} transparent={transparent} />
              </group>
            )}

            {/* Dedicated Architectural Front Facade (Block C) */}
            {appearance.customFacade === 'block-c' && i === 0 && (
              <group position={[worldX, 0, worldZ]}>
                <BlockCFacade
                  buildingWidth={width}
                  buildingDepth={depth}
                  facing="east"
                  wallHeight={10.8}
                  totalHeight={13.5}
                  opacity={opacity}
                  transparent={transparent}
                  wallColor={wallColor}
                  trimColor={appearance.corniceColor}
                  plinthColor={appearance.plinthColor}
                  frameColor={appearance.windowColor}
                />
              </group>
            )}

            {/* Dedicated Architectural Front Facade (Block B, facing South towards Block C) */}
            {appearance.customFacade === 'block-b' && i === 0 && (
              <group position={[worldX, 0, worldZ]}>
                <BlockBFacade
                  buildingWidth={width}
                  buildingDepth={depth}
                  facing="south"
                  wallHeight={14.4}
                  roofHeight={appearance.roofHeight ?? 3.6}
                  opacity={opacity}
                  transparent={transparent}
                  wallColor={wallColor}
                  trimColor={appearance.corniceColor}
                  plinthColor={appearance.plinthColor}
                  frameColor={appearance.windowColor}
                  roofColor={appearance.roofColor}
                />
              </group>
            )}

            {/* 5. Horizontal Decorative Stripes (e.g. Dormitory bands) */}
            {appearance.accentStripe && (
              <group position={[worldX, 0, worldZ]}>
                <mesh position={[0, wallHeight * 0.4, 0]} castShadow>
                  <boxGeometry args={[width + 0.15, 0.4, depth + 0.15]} />
                  <meshStandardMaterial
                    color={appearance.accentStripeColor ?? '#991b1b'}
                    transparent={transparent}
                    opacity={opacity}
                    depthWrite={!transparent}
                  />
                </mesh>
                <mesh position={[0, wallHeight * 0.7, 0]} castShadow>
                  <boxGeometry args={[width + 0.15, 0.4, depth + 0.15]} />
                  <meshStandardMaterial
                    color={appearance.accentStripeColor ?? '#991b1b'}
                    transparent={transparent}
                    opacity={opacity}
                    depthWrite={!transparent}
                  />
                </mesh>
              </group>
            )}

            {/* 6. Central Glazed Curtain Wall (e.g. Modern academic block) */}
            {appearance.glassAccent && (
              <mesh position={[worldX, wallHeight / 2 + 0.2, worldZ]} castShadow>
                <boxGeometry args={[Math.min(16, width * 0.5), wallHeight - 1, depth + 0.35]} />
                <meshStandardMaterial
                  color={appearance.glassColor ?? '#0284c7'}
                  transparent={transparent}
                  opacity={opacity}
                  depthWrite={!transparent}
                  metalness={0.9}
                  roughness={0.1}
                />
              </mesh>
            )}

            {/* 7. Parapet / Cornice */}
            {appearance.hasCornice && (
              <mesh geometry={parapetGeo} rotation={EXTRUDE_ROTATION} position={[0, wallHeight, 0]} castShadow>
                <meshStandardMaterial
                  color={appearance.corniceColor ?? '#e2e8f0'}
                  transparent={transparent}
                  opacity={opacity}
                  depthWrite={!transparent}
                  roughness={0.8}
                />
              </mesh>
            )}

            {/* 8. Roof Structure */}
            {appearance.roofType === 'hip' ? (
              <group position={[worldX, wallHeight, worldZ]}>
                <HipRoof
                  width={width + (appearance.roofOverhang ?? 1.2)}
                  depth={depth + (appearance.roofOverhang ?? 1.2)}
                  height={appearance.roofHeight ?? 4.0}
                  color={appearance.roofColor}
                  opacity={opacity}
                  transparent={transparent}
                  roughness={appearance.roofRoughness}
                />
              </group>
            ) : (
              <mesh
                position={[worldX, wallHeight + (appearance.hasCornice ? 0.2 : 0.5), worldZ]}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[width - 0.8, 0.6, depth - 0.8]} />
                <meshStandardMaterial
                  color={appearance.roofColor}
                  transparent={transparent}
                  opacity={opacity}
                  depthWrite={!transparent}
                  roughness={appearance.roofRoughness}
                />
              </mesh>
            )}

            {/* 9. Classical Portico Entrance */}
            {appearance.hasPortico && (
              <group position={[worldX, 0, worldZ]}>
                <ClassicalPortico
                  width={width}
                  depth={depth}
                  wallHeight={wallHeight}
                  color={appearance.porticoColor ?? '#ffffff'}
                  opacity={opacity}
                  transparent={transparent}
                />
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
}
