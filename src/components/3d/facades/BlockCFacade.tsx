import { useMemo } from 'react';
import * as THREE from 'three';
import { getArchitecturalWallTextures, getWindowGlassTexture } from '../materials/pbrMaterials';
import {
  getAjouLogoTexture,
  getAtticBannerTexture,
  getCanopySignTexture,
} from './facadeTextures';

type BlockCFacadeProps = {
  /** Width of the building mass along X (m) */
  buildingWidth: number;
  /** Depth of the building mass along Z (m) */
  buildingDepth: number;
  /** Direction the facade faces (default: 'east' facing perimeter fence and main gate) */
  facing?: 'east' | 'west';
  /** Height up to cornice line (m), default 10.8 */
  wallHeight?: number;
  /** Total height including attic/parapet (m), default 13.5 */
  totalHeight?: number;
  /** Opacity for selection dimming */
  opacity?: number;
  /** Transparent flag */
  transparent?: boolean;
  /** Main wall color (sand travertine) */
  wallColor?: string;
  /** Pilasters / cornice / attic color */
  trimColor?: string;
  /** Granite plinth color */
  plinthColor?: string;
  /** Window frame color */
  frameColor?: string;
};

/**
 * Highly accurate 3D architectural facade for Block C, facing the perimeter fence.
 * Reconstructed directly from CAD blueprint "Фасады и оконные блоки. Чертеж 2D. Лист 1 (1:100)".
 * Mirrored so the entrance doors and pavilion are on the right, matching the perspective view.
 */
export function BlockCFacade({
  buildingWidth,
  buildingDepth,
  facing = 'east',
  wallHeight = 10.8,
  totalHeight = 13.5,
  opacity = 1,
  transparent = false,
  wallColor = '#e2c391',
  trimColor = '#f1e6cf',
  plinthColor = '#7b4a3a',
  frameColor = '#4a5561',
}: BlockCFacadeProps) {
  const BASE_CAD_LENGTH = 35.9;
  const facadeLength = Math.max(BASE_CAD_LENGTH, buildingDepth);
  const scaleZ = facadeLength / BASE_CAD_LENGTH;
  const isEast = facing === 'east';
  const sign = isEast ? 1 : -1;
  const wallX = sign * (buildingWidth / 2);
  const rotY = sign * (Math.PI / 2);

  const plinthHeight = 1.1; // -1.100 to 0.000
  const darkFrameColor = frameColor;
  // Architectural sky-reflective glazing tint
  const glassColor = '#b8d8f0';

  // Textures
  const atticTexture = useMemo(() => getAtticBannerTexture(), []);
  const canopyTexture = useMemo(() => getCanopySignTexture(), []);
  const logoTexture = useMemo(() => getAjouLogoTexture(), []);
  const wallTextures = useMemo(() => getArchitecturalWallTextures(10, 3), []);
  const glassTexture = useMemo(() => getWindowGlassTexture(), []);

  // Shared reusable materials
  const wallMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: wallColor,
        map: wallTextures?.map ?? null,
        normalMap: wallTextures?.normalMap ?? null,
        normalScale: new THREE.Vector2(0.25, 0.25),
        roughnessMap: wallTextures?.roughnessMap ?? null,
        roughness: 0.78,
        metalness: 0.03,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [wallColor, wallTextures, transparent, opacity]
  );

  const plinthMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: plinthColor,
        roughness: 0.85,
        metalness: 0.08,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [plinthColor, transparent, opacity]
  );

  const trimMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: trimColor,
        roughness: 0.7,
        metalness: 0.05,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [trimColor, transparent, opacity]
  );

  const frameMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#dde3ea',
        roughness: 0.38,
        metalness: 0.3,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [darkFrameColor, transparent, opacity]
  );

  const glassMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: glassColor,
        map: glassTexture ?? null,
        roughness: 0.08,
        metalness: 0.28,
        envMapIntensity: 1.35,
        transparent: true,
        opacity: transparent ? opacity * 0.78 : 0.94,
        depthWrite: !transparent,
      }),
    [glassColor, glassTexture, transparent, opacity]
  );

  // Horizontal travertine slab joints: a slightly darker shade of the wall color
  const jointMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(wallColor).multiplyScalar(0.84),
        roughness: 0.9,
        metalness: 0,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    [wallColor, transparent, opacity]
  );

  // Mirrored coordinate mapping:
  // pz = +facadeLength / 2 - offset
  // Puts Axis 1 on the left, and axes 12-15 (entrance pavilion & logo) on the RIGHT!
  const pilasterAxes = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27];
  // Bays 1..8 (axes 1–9): every bay has OK-1 on the ground floor and ONE tall
  // double-height window on the 2nd floor (building is 2-storey; the upper
  // storey is double height +3.600…+10.800).
  const tallWindowBays = [1.5, 4.5, 7.5, 10.5, 13.5, 16.5, 19.5, 22.5];
  const jointRows = Array.from({ length: 23 }, (_, i) => 0.45 + i * 0.45);

  const toZ = (offset: number) => facadeLength / 2 - offset * scaleZ;

  return (
    <group position={[wallX, 0, 0]}>
      {/* ============================================================== */}
      {/* 1. DARK GRANITE PLINTH (-1.100 to 0.000)                       */}
      {/* ============================================================== */}
      <mesh
        position={[sign * 0.08, -plinthHeight / 2, 0]}
        castShadow
        receiveShadow
        material={plinthMat}
      >
        <boxGeometry args={[0.22, plinthHeight, facadeLength + 0.1]} />
      </mesh>
      {/* Plinth top drip edge molding at y = 0.000 */}
      <mesh position={[sign * 0.12, 0.04, 0]} material={trimMat} castShadow>
        <boxGeometry args={[0.16, 0.08, facadeLength + 0.15]} />
      </mesh>

      {/* ============================================================== */}
      {/* 2. MAIN TRAVERTINE FACADE WALL                                 */}
      {/* ============================================================== */}
      <mesh position={[0, wallHeight / 2, 0]} material={wallMat} castShadow receiveShadow>
        <boxGeometry args={[0.15, wallHeight, facadeLength]} />
      </mesh>

      {/* Horizontal slab joints along the wall (every 0.45 m) */}
      {jointRows.map((yVal, idx) => (
        <mesh key={`rust-${idx}`} position={[sign * 0.078, yVal, 0]} material={jointMat}>
          <boxGeometry args={[0.01, 0.035, facadeLength]} />
        </mesh>
      ))}

      {/* ============================================================== */}
      {/* 3. 10 VERTICAL CLASSICAL PILASTERS (Axes 1 to 11)              */}
      {/* ============================================================== */}
      {pilasterAxes.map((axisOffset, idx) => {
        const pz = toZ(axisOffset);
        return (
          <group key={`pilaster-${idx}`} position={[sign * 0.15, 0, pz]}>
            {/* Pilaster Shaft (0.0 to 9.8m) */}
            <mesh position={[0, 4.9, 0]} material={trimMat} castShadow>
              <boxGeometry args={[0.22, 9.8, 0.45 * scaleZ]} />
            </mesh>

            {/* Vertical Fluted Grooves in Pilaster Shaft */}
            <mesh position={[sign * 0.11, 4.9, -0.1 * scaleZ]} material={wallMat}>
              <boxGeometry args={[0.03, 9.0, 0.06 * scaleZ]} />
            </mesh>
            <mesh position={[sign * 0.11, 4.9, 0.1 * scaleZ]} material={wallMat}>
              <boxGeometry args={[0.03, 9.0, 0.06 * scaleZ]} />
            </mesh>

            {/* Classical Fluted Capital (9.8m to 10.8m) */}
            <mesh position={[0, 10.3, 0]} material={trimMat} castShadow>
              <boxGeometry args={[0.3, 1.0, 0.65 * scaleZ]} />
            </mesh>
            {/* Capital fluted necking */}
            <mesh position={[sign * 0.15, 10.2, 0]} material={wallMat}>
              <boxGeometry args={[0.04, 0.7, 0.55 * scaleZ]} />
            </mesh>
            {/* Capital abacus upper molding */}
            <mesh position={[sign * 0.05, 10.75, 0]} material={trimMat}>
              <boxGeometry args={[0.36, 0.15, 0.75 * scaleZ]} />
            </mesh>
          </group>
        );
      })}

      {/* ============================================================== */}
      {/* ============================================================== */}
      {/* 4. WINDOWS: 1ST FLOOR (0.000 to +3.600)                        */}
      {/* ============================================================== */}
      {/* Bays 1 to 8: OK-1 (1800 x 1800 mm, center Y = 1.8m) */}
      {tallWindowBays.map((bayOffset, idx) => {
        const wz = toZ(bayOffset);
        return (
          <group key={`ok1-${idx}`} position={[sign * 0.08, 1.8, wz]}>
            {/* Frame perimeter */}
            <mesh material={frameMat}>
              <boxGeometry args={[0.06, 1.8, 1.8 * scaleZ]} />
            </mesh>
            {/* Glass casement (2 panes with center mullion) */}
            <mesh position={[sign * 0.025, 0, 0]} material={glassMat}>
              <boxGeometry args={[0.03, 1.64, 1.64 * scaleZ]} />
            </mesh>
            <mesh position={[sign * 0.045, 0, 0]} material={frameMat}>
              <boxGeometry args={[0.04, 1.64, 0.06 * scaleZ]} />
            </mesh>
            {/* Window stone sill & lintel */}
            <mesh position={[sign * 0.08, -0.95, 0]} material={trimMat}>
              <boxGeometry args={[0.15, 0.12, 2.0 * scaleZ]} />
            </mesh>
            <mesh position={[sign * 0.08, 0.95, 0]} material={trimMat}>
              <boxGeometry args={[0.12, 0.1, 2.0 * scaleZ]} />
            </mesh>
          </group>
        );
      })}

      {/* Bay 9: OK-4 (1200 x 1200 mm, center Y = 1.8m, between axes 10 and 11) */}
      <group position={[sign * 0.08, 1.8, toZ(25.5)]}>
        <mesh material={frameMat}>
          <boxGeometry args={[0.06, 1.2, 1.2 * scaleZ]} />
        </mesh>
        <mesh position={[sign * 0.025, 0, 0]} material={glassMat}>
          <boxGeometry args={[0.03, 1.08, 1.08 * scaleZ]} />
        </mesh>
        <mesh position={[sign * 0.08, -0.65, 0]} material={trimMat}>
          <boxGeometry args={[0.15, 0.1, 1.4 * scaleZ]} />
        </mesh>
      </group>

      {/* ============================================================== */}
      {/* 5. WINDOWS: 2ND FLOOR — ONE TALL WINDOW PER BAY                */}
      {/* Building is 2-storey: the upper storey is double height, so    */}
      {/* every bay (including bays 1–2, drawn as two small windows on   */}
      {/* the sheet) has a single continuous tall window.                */}
      {/* ============================================================== */}
      {[
        ...tallWindowBays.map((offset) => ({ offset, width: 1.8 * scaleZ, bottom: 4.0, top: 10.3 })),
        // Bay 9 (axes 10–11): narrow tall window
        { offset: 25.5, width: 1.2 * scaleZ, bottom: 4.0, top: 10.3 },
        // Above the entrance pavilion (axes 12–14): two narrow tall windows
        { offset: 28.8, width: 1.2 * scaleZ, bottom: 5.3, top: 10.3 },
        { offset: 30.8, width: 1.2 * scaleZ, bottom: 5.3, top: 10.3 },
      ].map(({ offset, width, bottom, top }, idx) => {
        const h = top - bottom;
        const wz = toZ(offset);
        const mullions = width > 1.5 * scaleZ ? [-width / 6, width / 6] : [0];
        // Transoms: fanlight in the upper part + mid-rail
        const transoms = [h / 2 - h * 0.22, -h / 2 + h * 0.4];
        return (
          <group key={`tall-window-${idx}`} position={[sign * 0.08, bottom + h / 2, wz]}>
            <mesh material={frameMat} castShadow>
              <boxGeometry args={[0.06, h, width]} />
            </mesh>
            <mesh position={[sign * 0.025, 0, 0]} material={glassMat}>
              <boxGeometry args={[0.03, h - 0.14, width - 0.14 * scaleZ]} />
            </mesh>
            {mullions.map((mz, i) => (
              <mesh key={`m-${i}`} position={[sign * 0.045, 0, mz]} material={frameMat}>
                <boxGeometry args={[0.04, h - 0.14, 0.06]} />
              </mesh>
            ))}
            {transoms.map((ty, i) => (
              <mesh key={`t-${i}`} position={[sign * 0.045, ty, 0]} material={frameMat}>
                <boxGeometry args={[0.04, 0.06, width - 0.14 * scaleZ]} />
              </mesh>
            ))}
            {/* Stone sill & lintel */}
            <mesh position={[sign * 0.1, -h / 2 - 0.06, 0]} material={trimMat}>
              <boxGeometry args={[0.16, 0.12, width + 0.2 * scaleZ]} />
            </mesh>
            <mesh position={[sign * 0.08, h / 2 + 0.06, 0]} material={trimMat}>
              <boxGeometry args={[0.12, 0.1, width + 0.2 * scaleZ]} />
            </mesh>
          </group>
        );
      })}

      {/* ============================================================== */}
      {/* 6. ENTRANCE PAVILION ON THE RIGHT (Axes 12 to 15, width = 8.4m)*/}
      {/* ============================================================== */}
      {(() => {
        const pavilionZ = toZ(31.7);
        const pavWidth = 8.4 * scaleZ;
        const pavDepth = 2.8; // Protrusion forward
        const pavHeight = 4.1;

        return (
          <group position={[sign * (pavDepth / 2), 0, pavilionZ]}>
            {/* Entrance Steps Podium (Granite steps down to ground) */}
            <mesh position={[sign * (pavDepth / 2 + 0.7), 0.22, 0.4 * scaleZ]} material={plinthMat} castShadow receiveShadow>
              <boxGeometry args={[1.4, 0.44, 4.0 * scaleZ]} />
            </mesh>
            {/* Intermediate step riser */}
            <mesh position={[sign * (pavDepth / 2 + 1.1), 0.12, 0.4 * scaleZ]} material={plinthMat} receiveShadow>
              <boxGeometry args={[0.6, 0.24, 4.2 * scaleZ]} />
            </mesh>

            {/* Disability Access Ramp on Right Outer Edge with Stainless Steel Railing */}
            <group position={[sign * (pavDepth / 2 + 0.6), 0.2, -2.6 * scaleZ]}>
              <mesh material={plinthMat} receiveShadow>
                <boxGeometry args={[1.6, 0.4, 1.8 * scaleZ]} />
              </mesh>
              {/* Stainless Steel Handrail */}
              <mesh position={[0, 0.6, 0.8 * scaleZ]} material={frameMat}>
                <boxGeometry args={[1.6, 0.05, 0.05]} />
              </mesh>
              <mesh position={[sign * -0.7, 0.3, 0.8 * scaleZ]} material={frameMat}>
                <boxGeometry args={[0.05, 0.6, 0.05]} />
              </mesh>
              <mesh position={[sign * 0.7, 0.3, 0.8 * scaleZ]} material={frameMat}>
                <boxGeometry args={[0.05, 0.6, 0.05]} />
              </mesh>
            </group>

            {/* Glass Curtain Wall Box */}
            <mesh position={[0, pavHeight / 2, 0]} material={glassMat}>
              <boxGeometry args={[pavDepth, pavHeight, pavWidth]} />
            </mesh>

            {/* Mullions Grid on Front Face */}
            <group position={[sign * (pavDepth / 2 + 0.02), pavHeight / 2, 0]}>
              {/* Vertical Mullion Divs including outer corner posts */}
              {[-4.2, -3.5, -2.1, -0.7, 0.7, 2.1, 3.5, 4.2].map((mx, idx) => (
                <mesh key={`mull-${idx}`} position={[sign * 0.02, 0, mx * scaleZ]} material={frameMat}>
                  <boxGeometry args={[0.08, pavHeight, 0.08]} />
                </mesh>
              ))}
              {/* Top & Bottom Horizontal Frame Rails */}
              <mesh position={[sign * 0.02, pavHeight / 2 - 0.05, 0]} material={frameMat}>
                <boxGeometry args={[0.08, 0.1, pavWidth + 0.1 * scaleZ]} />
              </mesh>
              <mesh position={[sign * 0.02, -pavHeight / 2 + 0.05, 0]} material={frameMat}>
                <boxGeometry args={[0.08, 0.1, pavWidth + 0.1 * scaleZ]} />
              </mesh>
              {/* Horizontal Transom Beam at door head (y = 2.7m) */}
              <mesh position={[sign * 0.02, -pavHeight / 2 + 2.7, 0]} material={frameMat}>
                <boxGeometry args={[0.08, 0.1, pavWidth]} />
              </mesh>
              {/* Double Glazed Entrance Doors in Center */}
              <mesh position={[sign * 0.04, -pavHeight / 2 + 1.35, 0.4 * scaleZ]} material={glassMat}>
                <boxGeometry args={[0.04, 2.6, 2.2 * scaleZ]} />
              </mesh>
              {/* Door Frame & Handles */}
              <mesh position={[sign * 0.06, -pavHeight / 2 + 1.35, 0.4 * scaleZ]} material={frameMat}>
                <boxGeometry args={[0.05, 2.6, 0.08]} />
              </mesh>
              <mesh position={[sign * 0.1, -pavHeight / 2 + 1.2, 0.28 * scaleZ]} material={frameMat}>
                <boxGeometry args={[0.04, 0.8, 0.04]} />
              </mesh>
              <mesh position={[sign * 0.1, -pavHeight / 2 + 1.2, 0.52 * scaleZ]} material={frameMat}>
                <boxGeometry args={[0.04, 0.8, 0.04]} />
              </mesh>
            </group>

            {/* Entrance Canopy Roof Slab (cream, same as cornice) */}
            <mesh position={[0, pavHeight + 0.3, 0]} material={trimMat} castShadow receiveShadow>
              <boxGeometry args={[pavDepth + 0.8, 0.6, pavWidth + 0.6 * scaleZ]} />
            </mesh>

            {/* Canopy Fascia Sign: "AJOU UNIVERSITY IN TASHKENT" */}
            {canopyTexture && (
              <mesh position={[sign * (pavDepth / 2 + 0.45), pavHeight + 0.3, 0]} rotation={[0, rotY, 0]}>
                <planeGeometry args={[pavWidth + 0.4 * scaleZ, 0.52]} />
                <meshStandardMaterial
                  map={canopyTexture}
                  roughness={0.4}
                  metalness={0.2}
                  transparent={transparent}
                  opacity={opacity}
                />
              </mesh>
            )}
          </group>
        );
      })()}

      {/* ============================================================== */}
      {/* 7. OFFICIAL CIRCULAR UNIVERSITY MEDALLION LOGO ON RIGHT        */}
      {/* ============================================================== */}
      {logoTexture && (
        <mesh
          position={[sign * 0.14, 8.0, toZ(33.9)]}
          rotation={[0, rotY, 0]}
        >
          <circleGeometry args={[1.2, 36]} />
          <meshStandardMaterial
            map={logoTexture}
            roughness={0.2}
            metalness={0.05}
            transparent
            opacity={opacity}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* ============================================================== */}
      {/* 8. CORNICE, ATTIC & PARAPET (+10.800 to +13.500)               */}
      {/* ============================================================== */}
      {/* Lower Molded Cornice Beam (+10.800 to +11.700, 0.9m) */}
      <mesh position={[sign * 0.18, wallHeight + 0.45, 0]} material={trimMat} castShadow>
        <boxGeometry args={[0.35, 0.9, facadeLength + 0.2]} />
      </mesh>
      {/* Cornice decorative dentil band */}
      <mesh position={[sign * 0.24, wallHeight + 0.15, 0]} material={wallMat}>
        <boxGeometry args={[0.1, 0.15, facadeLength + 0.1]} />
      </mesh>

      {/* Attic Wall Band (+11.700 to +13.300, 1.6m) */}
      <mesh position={[sign * 0.05, wallHeight + 1.7, 0]} material={wallMat} castShadow>
        <boxGeometry args={[0.15, 1.6, facadeLength]} />
      </mesh>

      {/* Attic Signboard: "TOSHKENT SHAHRIDAGI ADJU UNIVERSITETI" */}
      {atticTexture && (
        <mesh
          position={[sign * 0.14, wallHeight + 1.7, toZ(16.5)]}
          rotation={[0, rotY, 0]}
        >
          <planeGeometry args={[15.0 * scaleZ, 1.35]} />
          <meshStandardMaterial
            map={atticTexture}
            roughness={0.6}
            metalness={0.05}
            transparent={transparent}
            opacity={opacity}
          />
        </mesh>
      )}

      {/* Top Parapet Coping & Drip Cap (+13.300 to +13.500, 0.2m) */}
      <mesh position={[sign * 0.2, totalHeight - 0.1, 0]} material={trimMat} castShadow receiveShadow>
        <boxGeometry args={[0.42, 0.2, facadeLength + 0.3]} />
      </mesh>
    </group>
  );
}
