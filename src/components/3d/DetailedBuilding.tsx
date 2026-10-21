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
import { BlockBSouthFacade } from './facades/BlockBSouthFacade';
import { getArchitecturalWallTextures, getWindowGlassTexture } from './materials/pbrMaterials';

type Props = {
  building: BuildingData;
  geometry: BuildingGeometry;
  dimmed: boolean;
  tuning?: TuningMaterialOverrides & { pbrTexturesEnabled?: boolean };
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

function mergeBufferGeometries(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  for (const g of geoms) {
    const nonIndexed = g.index ? g.toNonIndexed() : g;
    const posAttr = nonIndexed.getAttribute('position');
    const normAttr = nonIndexed.getAttribute('normal');
    const uvAttr = nonIndexed.getAttribute('uv');
    for (let i = 0; i < posAttr.count; i++) {
      positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      if (normAttr) {
        normals.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
      } else {
        normals.push(0, 1, 0);
      }
      if (uvAttr) {
        uvs.push(uvAttr.getX(i), uvAttr.getY(i));
      } else {
        uvs.push(0, 0);
      }
    }
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return merged;
}

/**
 * Builds a true architectural hipped roof with a horizontal ridge along the longer building axis.
 */
function createTrueHipRoofGeometry(width: number, depth: number, height: number): THREE.BufferGeometry {
  const hw = width / 2;
  const hd = depth / 2;
  const h = height;

  // Ridge runs along the longer horizontal dimension
  const alongX = width >= depth;
  const ridgeHalf = alongX ? Math.max(0, (width - depth) * 0.5) : Math.max(0, (depth - width) * 0.5);

  // Base corners (y = 0)
  const bl = [-hw, 0, hd]; // Front-left (+Z)
  const br = [hw, 0, hd]; // Front-right (+Z)
  const tr = [hw, 0, -hd]; // Back-right (-Z)
  const tl = [-hw, 0, -hd]; // Back-left (-Z)

  // Ridge endpoints (y = h)
  const r1 = alongX ? [-ridgeHalf, h, 0] : [0, h, ridgeHalf];
  const r2 = alongX ? [ridgeHalf, h, 0] : [0, h, -ridgeHalf];

  const verts: number[] = [];
  const pushTri = (a: number[], b: number[], c: number[]) => {
    verts.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };

  if (alongX) {
    // Front slope (+Z): quad bl -> br -> r2 -> r1
    pushTri(bl, br, r2);
    pushTri(bl, r2, r1);
    // Back slope (-Z): quad tr -> tl -> r1 -> r2
    pushTri(tr, tl, r1);
    pushTri(tr, r1, r2);
    // Left hip (-X): triangle tl -> bl -> r1
    pushTri(tl, bl, r1);
    // Right hip (+X): triangle br -> tr -> r2
    pushTri(br, tr, r2);
  } else {
    // Right slope (+X): quad br -> tr -> r2 -> r1
    pushTri(br, tr, r2);
    pushTri(br, r2, r1);
    // Left slope (-X): quad tl -> bl -> r1 -> r2
    pushTri(tl, bl, r1);
    pushTri(tl, r1, r2);
    // Front hip (+Z): triangle bl -> br -> r1
    pushTri(bl, br, r1);
    // Back hip (-Z): triangle tr -> tl -> r2
    pushTri(tr, tl, r2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  return geo;
}

// Cached shared base geometries
const sharedPedimentGeo = new THREE.ConeGeometry(Math.sqrt(0.5), 1, 4);
sharedPedimentGeo.rotateY(Math.PI / 4);

/**
 * Compound architectural window frame + sill + lintel + mullion + transom geometry.
 */
const sharedWindowFrameGeo = (() => {
  const w = 1.35;
  const h = 1.85;
  // Outer perimeter backing box
  const backing = new THREE.BoxGeometry(w, h, 0.06);
  // Projecting stone sill at bottom
  const sill = new THREE.BoxGeometry(w + 0.22, 0.09, 0.16);
  sill.translate(0, -h / 2 - 0.04, 0.04);
  // Projecting stone lintel at top
  const lintel = new THREE.BoxGeometry(w + 0.16, 0.07, 0.12);
  lintel.translate(0, h / 2 + 0.035, 0.025);
  // Center vertical mullion in front of glass
  const mullion = new THREE.BoxGeometry(0.05, h - 0.12, 0.04);
  mullion.translate(0, 0, 0.045);
  // Upper horizontal transom bar in front of glass
  const transom = new THREE.BoxGeometry(w - 0.12, 0.045, 0.04);
  transom.translate(0, h * 0.22, 0.045);

  return mergeBufferGeometries([backing, sill, lintel, mullion, transom]);
})();

const sharedWindowGlassGeo = (() => {
  const g = new THREE.BoxGeometry(1.21, 1.71, 0.03);
  g.translate(0, 0, 0.025);
  return g;
})();

const sharedColumnGeo = new THREE.CylinderGeometry(0.35, 0.4, 1, 12);

/**
 * True architectural hip roof with eaves cornice and ridge cap.
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
  const roofGeo = useMemo(
    () => createTrueHipRoofGeometry(width, depth, height),
    [width, depth, height],
  );
  const alongX = width >= depth;
  const ridgeLen = Math.max(0.4, Math.abs(width - depth));

  return (
    <group position={[0, 0, 0]}>
      {/* Sloped Hip Roof */}
      <mesh
        position={[0, 0.28, 0]}
        castShadow
        receiveShadow
        geometry={roofGeo}
      >
        <meshStandardMaterial
          color={color}
          transparent={transparent}
          opacity={opacity}
          depthWrite={!transparent}
          roughness={roughness}
          metalness={0.08}
        />
      </mesh>

      {/* Ridge Cap Tile Beam */}
      <mesh position={[0, height + 0.28, 0]} castShadow>
        <boxGeometry args={alongX ? [ridgeLen, 0.14, 0.24] : [0.24, 0.14, ridgeLen]} />
        <meshStandardMaterial
          color={color}
          transparent={transparent}
          opacity={opacity}
          depthWrite={!transparent}
          roughness={Math.max(0.4, roughness - 0.1)}
          metalness={0.12}
        />
      </mesh>

      {/* Molded Eaves Cornice & Fascia */}
      <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.2, 0.28, depth + 0.2]} />
        <meshStandardMaterial
          color="#f5f0e6"
          transparent={transparent}
          opacity={opacity}
          depthWrite={!transparent}
          roughness={0.72}
        />
      </mesh>
    </group>
  );
}

/**
 * Procedural instanced windows along all 4 building faces with 3D frames, sills, mullions, and reflective glass.
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
  const windowW = 1.35;
  const windowH = 1.85;
  const marginX = 2.2;
  const marginY = 2.4;

  const numWindowsX = Math.max(0, Math.floor((width - marginX) / (windowW + 1.75)));
  const numWindowsZ = Math.max(0, Math.floor((depth - marginX) / (windowW + 1.75)));
  const numFloors = Math.max(1, Math.floor((height - marginY) / (windowH + 1.25)));

  const count = (numWindowsX * 2 + numWindowsZ * 2) * numFloors;
  const glassTex = useMemo(() => getWindowGlassTexture(), []);

  const meshes = useMemo(() => {
    if (count <= 0) return null;

    const frameMaterial = new THREE.MeshStandardMaterial({
      color: '#e2e8f0',
      metalness: 0.22,
      roughness: 0.45,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const glassMaterial = new THREE.MeshStandardMaterial({
      color: '#b8d8f0',
      map: glassTex ?? null,
      metalness: 0.28,
      roughness: 0.08,
      envMapIntensity: 1.35,
      transparent: true,
      opacity: transparent ? opacity * 0.8 : 0.94,
      depthWrite: !transparent,
    });

    const frameMesh = new THREE.InstancedMesh(sharedWindowFrameGeo, frameMaterial, count);
    const glassMesh = new THREE.InstancedMesh(sharedWindowGlassGeo, glassMaterial, count);
    frameMesh.castShadow = false;
    frameMesh.receiveShadow = true;
    glassMesh.castShadow = false;
    glassMesh.receiveShadow = false;

    const dummy = new THREE.Object3D();
    let idx = 0;

    const startY = 1.9;
    const spacingY = windowH + 1.25;

    for (let f = 0; f < numFloors; f++) {
      const y = startY + f * spacingY;

      // Front and Back faces
      if (numWindowsX > 0) {
        const spanX = (numWindowsX - 1) * (windowW + 1.75);
        const startX = -spanX / 2;
        for (let x = 0; x < numWindowsX; x++) {
          const px = startX + x * (windowW + 1.75);
          // Front (+Z)
          dummy.position.set(px, y, depth / 2 + 0.03);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          frameMesh.setMatrixAt(idx, dummy.matrix);
          glassMesh.setMatrixAt(idx, dummy.matrix);
          idx++;

          // Back (-Z)
          dummy.position.set(px, y, -depth / 2 - 0.03);
          dummy.rotation.set(0, Math.PI, 0);
          dummy.updateMatrix();
          frameMesh.setMatrixAt(idx, dummy.matrix);
          glassMesh.setMatrixAt(idx, dummy.matrix);
          idx++;
        }
      }

      // Left and Right faces
      if (numWindowsZ > 0) {
        const spanZ = (numWindowsZ - 1) * (windowW + 1.75);
        const startZ = -spanZ / 2;
        for (let z = 0; z < numWindowsZ; z++) {
          const pz = startZ + z * (windowW + 1.75);
          // Left (-X)
          dummy.position.set(-width / 2 - 0.03, y, pz);
          dummy.rotation.set(0, -Math.PI / 2, 0);
          dummy.updateMatrix();
          frameMesh.setMatrixAt(idx, dummy.matrix);
          glassMesh.setMatrixAt(idx, dummy.matrix);
          idx++;

          // Right (+X)
          dummy.position.set(width / 2 + 0.03, y, pz);
          dummy.rotation.set(0, Math.PI / 2, 0);
          dummy.updateMatrix();
          frameMesh.setMatrixAt(idx, dummy.matrix);
          glassMesh.setMatrixAt(idx, dummy.matrix);
          idx++;
        }
      }
    }

    frameMesh.instanceMatrix.needsUpdate = true;
    glassMesh.instanceMatrix.needsUpdate = true;
    return { frameMesh, glassMesh };
  }, [count, numWindowsX, numWindowsZ, numFloors, width, depth, windowColor, glassTex, opacity, transparent]);

  if (!meshes) return null;

  return (
    <group>
      <primitive object={meshes.frameMesh} />
      <primitive object={meshes.glassMesh} />
    </group>
  );
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
  const portalW = Math.min(5.2, width * 0.28);
  const portalH = 2.8;
  const glassTex = useMemo(() => getWindowGlassTexture(), []);

  return (
    <group position={[0, 0, depth / 2 + 0.06]}>
      {/* Entrance Surround Frame */}
      <mesh position={[0, portalH / 2, 0]}>
        <boxGeometry args={[portalW + 0.28, portalH + 0.14, 0.12]} />
        <meshStandardMaterial
          color="#e2e8f0"
          metalness={0.25}
          roughness={0.45}
          transparent={transparent}
          opacity={opacity}
          depthWrite={!transparent}
        />
      </mesh>

      {/* Glazed entrance doors */}
      <mesh position={[0, portalH / 2, 0.05]}>
        <boxGeometry args={[portalW, portalH - 0.1, 0.04]} />
        <meshStandardMaterial
          color="#b8d8f0"
          map={glassTex ?? null}
          metalness={0.3}
          roughness={0.08}
          envMapIntensity={1.4}
          transparent={transparent}
          opacity={opacity}
          depthWrite={!transparent}
        />
      </mesh>

      {/* Center Door Stile Divider */}
      <mesh position={[0, portalH / 2, 0.075]}>
        <boxGeometry args={[0.08, portalH - 0.1, 0.04]} />
        <meshStandardMaterial
          color="#cbd5e1"
          metalness={0.4}
          roughness={0.35}
          transparent={transparent}
          opacity={opacity}
          depthWrite={!transparent}
        />
      </mesh>

      {/* Modern architectural canopy overhead */}
      <mesh position={[0, portalH + 0.2, 0.75]} castShadow receiveShadow>
        <boxGeometry args={[portalW + 1.0, 0.22, 1.7]} />
        <meshStandardMaterial
          color="#f1f5f9"
          metalness={0.2}
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
        geometry={sharedPedimentGeo}
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
  const usePbr = tuning?.pbrTexturesEnabled !== false;
  const wallPbr = useMemo(() => (usePbr ? getArchitecturalWallTextures() : null), [usePbr]);
  const glassTex = useMemo(() => (usePbr ? getWindowGlassTexture() : null), [usePbr]);

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
                map={wallPbr?.map ?? null}
                normalMap={wallPbr?.normalMap ?? null}
                normalScale={[0.25, 0.25]}
                roughnessMap={wallPbr?.roughnessMap ?? null}
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
                  roughness={0.85}
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
                  windowColor={appearance.windowColor ?? '#4b779e'}
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

            {/* Dedicated Architectural Facades for Block B:
                - North Facade (facing courtyard/driveway): 13-bay rhythm with stair ribbons, dormers, gazebo & pipeline
                - South Facade (facing Block C): 8-bay rhythm with central glazed curtain wall (ВИТ-1) & pediment */}
            {appearance.customFacade === 'block-b' && i === 0 && (
              <group position={[worldX, 0, worldZ]}>
                <BlockBFacade
                  buildingWidth={width}
                  buildingDepth={depth}
                  facing="north"
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
                <BlockBSouthFacade
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
                  color={appearance.glassColor ?? '#7dd3fc'}
                  map={glassTex}
                  transparent={transparent}
                  opacity={opacity}
                  depthWrite={!transparent}
                  metalness={0.35}
                  roughness={0.08}
                  envMapIntensity={1.4}
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
