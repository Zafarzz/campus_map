import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  StaticGeometryBatcher,
  disposeMergedMap,
  NO_RAYCAST,
} from '../geometry/staticGeometryMerger';
import {
  getArchitecturalWallTextures,
  getGranitePlinthTextures,
  getWindowGlassTexture,
} from '../materials/pbrMaterials';
import {
  applyArchitecturalGlassShader,
  applyTravertineWeatheringShader,
} from '../shaders/architecturalShaders';
import { getLibrarySignTexture } from './facadeTextures';

export type BlockFSouthFacadeProps = {
  /** Opacity for selection dimming */
  opacity?: number;
  /** Transparent flag */
  transparent?: boolean;
  /** Main travertine stone wall color (warm beige per architectural drawing) */
  wallColor?: string;
  /** Cornice / trim color */
  trimColor?: string;
  /** Foundation plinth color (dark granite) */
  plinthColor?: string;
  /** Window frame color (dark graphite architectural metal) */
  frameColor?: string;
  /** Parapet composite panel frieze color (crisp white per drawing) */
  friezeColor?: string;
  /** Entrance door panel color (dark navy blue) */
  doorColor?: string;
};

/**
 * Architectural 3D South Facade of Block F (Library / Hall Building) in Axes А–В.
 * Reconstructed with 100% CAD precision from architectural blueprint media_1794216793227_98a34af3.jpg:
 *
 * - Total facade width: 20 000 mm (20.0 m) in axes А–В.
 * - Left lowered volume (Axes А–Б, width 6 500 mm):
 *   - Plinth height: 600 mm (dark granite).
 *   - Travertine wall: 7 600 mm height (to +8.200 m).
 *   - Parapet frieze: 1 000 mm height (to +9.200 m) in white composite panels.
 *   - Side entrance: single-leaf door 1 000 × 2 200 mm with arched canopy, 4 900 mm from Axis A.
 * - Right main volume (Axes Б–В, width 13 500 mm):
 *   - Plinth height: 600 mm (dark granite).
 *   - Blank travertine wall: 8 100 mm height above windows (to +10.800 m).
 *   - Parapet frieze: 1 200 mm height (to +12.000 m) in white composite panels.
 *   - Main entrance: double-leaf door 1 600 × 2 400 mm with arched canopy, 500 mm from Axis Б.
 *   - «LIBRARY» commemorative brass plaque between main door and Window 1.
 *   - 3 first-floor windows: 900 × 1 600 mm with dark frames and upper transoms.
 *   - Distance from Window 3 to Axis В: exactly 3 100 mm.
 * - Vertical step reveal of 2 800 mm at Axis Б between left (9.2 m) and right (12.0 m) volumes.
 */
export function BlockFSouthFacade({
  opacity = 1,
  transparent = false,
  wallColor = '#ebdcc5',
  trimColor = '#f8fafc',
  plinthColor = '#334155',
  frameColor = '#1e293b',
  friezeColor = '#ffffff',
  doorColor = '#162d59',
}: BlockFSouthFacadeProps) {
  const wallTextures = useMemo(() => getArchitecturalWallTextures(), []);
  const plinthTextures = useMemo(() => getGranitePlinthTextures(4, 1), []);
  const glassTexture = useMemo(() => getWindowGlassTexture(), []);
  const librarySignTexture = useMemo(() => getLibrarySignTexture(), []);

  const materials = useMemo(() => {
    const wallMat = applyTravertineWeatheringShader(
      new THREE.MeshStandardMaterial({
        color: wallColor,
        map: wallTextures?.map ?? null,
        normalMap: wallTextures?.normalMap ?? null,
        normalScale: new THREE.Vector2(0.24, 0.24),
        roughnessMap: wallTextures?.roughnessMap ?? null,
        roughness: 0.82,
        metalness: 0.0,
        transparent,
        opacity,
        depthWrite: !transparent,
      }),
    );

    const plinthMat = new THREE.MeshStandardMaterial({
      color: plinthColor,
      map: plinthTextures?.map ?? null,
      normalMap: plinthTextures?.normalMap ?? null,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 0.68,
      metalness: 0.15,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const friezeMat = new THREE.MeshStandardMaterial({
      color: friezeColor,
      roughness: 0.36,
      metalness: 0.08,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: trimColor,
      roughness: 0.5,
      metalness: 0.05,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const frameMat = new THREE.MeshStandardMaterial({
      color: frameColor,
      roughness: 0.38,
      metalness: 0.75,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const glassMat = applyArchitecturalGlassShader(
      new THREE.MeshStandardMaterial({
        color: '#16283e',
        map: glassTexture ?? null,
        roughness: 0.06,
        metalness: 0.2,
        envMapIntensity: 1.6,
        transparent: true,
        opacity: transparent ? opacity * 0.9 : 0.94,
        depthWrite: !transparent,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );

    const cavityMat = new THREE.MeshBasicMaterial({
      color: '#020408',
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const jointMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(wallColor).multiplyScalar(0.78),
      roughness: 0.92,
      metalness: 0.0,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const friezeJointMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      roughness: 0.7,
      metalness: 0.1,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const doorLeafMat = new THREE.MeshStandardMaterial({
      color: doorColor,
      roughness: 0.38,
      metalness: 0.25,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const sideDoorMat = new THREE.MeshStandardMaterial({
      color: doorColor,
      roughness: 0.38,
      metalness: 0.25,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const handleMat = new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      roughness: 0.15,
      metalness: 0.95,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const canopyMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      roughness: 0.25,
      metalness: 0.65,
      transparent: true,
      opacity: transparent ? opacity * 0.8 : 0.85,
      depthWrite: !transparent,
    });

    const canopyFrameMat = new THREE.MeshStandardMaterial({
      color: '#090d16',
      roughness: 0.35,
      metalness: 0.85,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const librarySignMat = new THREE.MeshStandardMaterial({
      map: librarySignTexture,
      roughness: 0.25,
      metalness: 0.85,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    return {
      wallMat,
      plinthMat,
      friezeMat,
      trimMat,
      frameMat,
      glassMat,
      cavityMat,
      jointMat,
      friezeJointMat,
      doorLeafMat,
      sideDoorMat,
      handleMat,
      canopyMat,
      canopyFrameMat,
      librarySignMat,
    };
  }, [
    wallColor,
    trimColor,
    plinthColor,
    frameColor,
    friezeColor,
    doorColor,
    wallTextures,
    plinthTextures,
    glassTexture,
    librarySignTexture,
    transparent,
    opacity,
  ]);

  const merged = useMemo(() => {
    const b = new StaticGeometryBatcher();

    // Coordinate Anchors from Campus Grid
    const axisAX = 52.05; // Left edge (Axis A)
    const axisBX = 58.55; // Intermediate step axis (Axis Б, 6.5 m from Axis A)
    const axisVX = 72.05; // Right edge (Axis В, 13.5 m from Axis Б)
    const southEndZ = -49.2; // South building boundary

    const leftWidth = axisBX - axisAX; // 6.5 m
    const leftCenterX = (axisAX + axisBX) / 2; // 55.30 m
    const rightWidth = axisVX - axisBX; // 13.5 m
    const rightCenterX = (axisBX + axisVX) / 2; // 65.30 m

    const plinthH = 0.6; // Plinth height (+0.600 m)

    // Helper: builds an arched canopy over an entrance door
    const buildArchedCanopy = (
      canopyCenterX: number,
      canopyBaseY: number,
      canopyWidth: number,
      projection: number,
      wallZ: number,
    ) => {
      const archSegments = 7;
      const radius = canopyWidth / 2;
      const angleSpan = (Math.PI * 55) / 180; // Gentle barrel arch span (~55 degrees each side)
      const dAngle = (2 * angleSpan) / archSegments;
      const panelArcWidth = (radius * 2 * angleSpan) / archSegments;

      // Arched canopy barrel panels
      for (let s = 0; s < archSegments; s++) {
        const ang = -angleSpan + (s + 0.5) * dAngle;
        const px = canopyCenterX + Math.sin(ang) * radius;
        const py = canopyBaseY + (Math.cos(ang) - Math.cos(angleSpan)) * radius;
        const pz = wallZ + projection / 2;
        b.addBox('canopyGlass', [panelArcWidth + 0.015, 0.02, projection], [px, py, pz], [0, 0, -ang]);
      }

      // Arched front rib
      for (let s = 0; s < archSegments; s++) {
        const ang = -angleSpan + (s + 0.5) * dAngle;
        const px = canopyCenterX + Math.sin(ang) * radius;
        const py = canopyBaseY + (Math.cos(ang) - Math.cos(angleSpan)) * radius;
        const pz = wallZ + projection;
        b.addBox('canopyFrame', [panelArcWidth + 0.02, 0.04, 0.04], [px, py, pz], [0, 0, -ang]);
      }

      // Rear wall mounting bar
      b.addBox('canopyFrame', [canopyWidth + 0.08, 0.05, 0.04], [canopyCenterX, canopyBaseY, wallZ + 0.02]);

      // Left & right structural wall brackets
      b.addBox('canopyFrame', [0.04, 0.04, projection], [canopyCenterX - radius, canopyBaseY, wallZ + projection / 2]);
      b.addBox('canopyFrame', [0.04, 0.04, projection], [canopyCenterX + radius, canopyBaseY, wallZ + projection / 2]);
      b.addBox('canopyFrame', [0.04, 0.35, 0.04], [canopyCenterX - radius, canopyBaseY - 0.16, wallZ + 0.02]);
      b.addBox('canopyFrame', [0.04, 0.35, 0.04], [canopyCenterX + radius, canopyBaseY - 0.16, wallZ + 0.02]);

      // Diagonal stainless steel support tie-rods
      b.addCylinder(
        'handle',
        [0.012, 0.012, projection * 1.35, 8],
        [canopyCenterX - radius, canopyBaseY + 0.28, wallZ + projection * 0.45],
        [0.72, 0, 0],
      );
      b.addCylinder(
        'handle',
        [0.012, 0.012, projection * 1.35, 8],
        [canopyCenterX + radius, canopyBaseY + 0.28, wallZ + projection * 0.45],
        [0.72, 0, 0],
      );
    };

    // =========================================================================
    // 1. LEFT LOWERED VOLUME (Axes А–Б, width 6.5 m, total height 9.2 m)
    // =========================================================================
    const leftWallZ = southEndZ;

    // Dark granite plinth (0.0 to +0.600 m)
    b.addBox('plinth', [leftWidth + 0.08, plinthH, 0.22], [leftCenterX, plinthH / 2, leftWallZ + 0.08]);
    b.addBox('trim', [leftWidth + 0.1, 0.06, 0.2], [leftCenterX, plinthH + 0.03, leftWallZ + 0.1]);

    // Travertine wall (from +0.600 m to +8.200 m, height = 7.6 m)
    const leftWallH = 7.6;
    const leftWallCenterY = plinthH + leftWallH / 2; // 4.40 m
    b.addBox('wall', [leftWidth, leftWallH, 0.16], [leftCenterX, leftWallCenterY, leftWallZ]);

    // Horizontal travertine rustication joints
    for (const jy of [1.8, 3.0, 4.2, 5.4, 6.6, 7.8]) {
      b.addBox('joint', [leftWidth - 0.02, 0.025, 0.01], [leftCenterX, jy, leftWallZ + 0.082]);
    }

    // Parapet transition cornice trim (+8.200 m)
    b.addBox('trim', [leftWidth + 0.12, 0.18, 0.28], [leftCenterX, 8.2, leftWallZ + 0.12]);

    // White composite panel frieze (+8.200 m to +9.200 m, height = 1.0 m)
    const leftFriezeH = 1.0;
    const leftFriezeCenterY = 8.2 + leftFriezeH / 2; // 8.70 m
    b.addBox('frieze', [leftWidth + 0.06, leftFriezeH, 0.18], [leftCenterX, leftFriezeCenterY, leftWallZ + 0.09]);

    // Frieze panel seams (horizontal center line and 3 vertical panel joints)
    b.addBox('friezeJoint', [leftWidth, 0.02, 0.01], [leftCenterX, 8.7, leftWallZ + 0.182]);
    for (const fx of [axisAX + 1.625, axisAX + 3.25, axisAX + 4.875]) {
      b.addBox('friezeJoint', [0.02, leftFriezeH, 0.01], [fx, leftFriezeCenterY, leftWallZ + 0.182]);
    }

    // Parapet top capping ledge (+9.200 m)
    b.addBox('trim', [leftWidth + 0.15, 0.08, 0.32], [leftCenterX, 9.24, leftWallZ + 0.14]);

    // --- Side Entrance Door (4 900 mm from Axis A, 1 000 × 2 200 mm) ---
    const sideDoorWidth = 1.0;
    const sideDoorHeight = 2.2;
    const sideDoorCenterX = axisAX + 4.9 + sideDoorWidth / 2; // 57.45 m
    const sideDoorCenterY = plinthH + sideDoorHeight / 2; // 1.70 m

    // Granite entrance step
    b.addBox('plinth', [sideDoorWidth + 0.3, 0.18, 0.45], [sideDoorCenterX, 0.09, leftWallZ + 0.26]);

    // Outer door casing / architrave (perimeter surround: left jamb, right jamb, lintel header)
    const sideJambW = 0.08;
    b.addBox('trim', [sideJambW, sideDoorHeight, 0.06], [sideDoorCenterX - sideDoorWidth / 2 - sideJambW / 2, sideDoorCenterY, leftWallZ + 0.07]);
    b.addBox('trim', [sideJambW, sideDoorHeight, 0.06], [sideDoorCenterX + sideDoorWidth / 2 + sideJambW / 2, sideDoorCenterY, leftWallZ + 0.07]);
    b.addBox('trim', [sideDoorWidth + sideJambW * 2, 0.08, 0.08], [sideDoorCenterX, plinthH + sideDoorHeight + 0.04, leftWallZ + 0.08]);

    // Door recess cavity
    b.addBox('cavity', [sideDoorWidth, sideDoorHeight, 0.1], [sideDoorCenterX, sideDoorCenterY, leftWallZ + 0.02]);

    // Perimeter door frame
    const sFrameW = 0.04;
    b.addBox('frame', [sFrameW, sideDoorHeight, 0.05], [sideDoorCenterX - sideDoorWidth / 2 + sFrameW / 2, sideDoorCenterY, leftWallZ + 0.065]);
    b.addBox('frame', [sFrameW, sideDoorHeight, 0.05], [sideDoorCenterX + sideDoorWidth / 2 - sFrameW / 2, sideDoorCenterY, leftWallZ + 0.065]);
    b.addBox('frame', [sideDoorWidth, sFrameW, 0.05], [sideDoorCenterX, plinthH + sideDoorHeight - sFrameW / 2, leftWallZ + 0.065]);

    // Dark blue architectural door leaf
    const sideLeafW = sideDoorWidth - sFrameW * 2;
    const sideLeafH = sideDoorHeight - sFrameW;
    b.addBox('sideDoor', [sideLeafW, sideLeafH, 0.045], [sideDoorCenterX, plinthH + sideLeafH / 2, leftWallZ + 0.07]);

    // Slim vertical vision strip
    b.addBox('glass', [0.16, 1.4, 0.02], [sideDoorCenterX - 0.16, sideDoorCenterY + 0.1, leftWallZ + 0.088]);

    // Polished stainless steel vertical handle
    b.addCylinder('handle', [0.016, 0.016, 0.75, 10], [sideDoorCenterX + 0.28, 1.45, leftWallZ + 0.14]);
    b.addBox('handle', [0.03, 0.02, 0.04], [sideDoorCenterX + 0.28, 1.8, leftWallZ + 0.11]);
    b.addBox('handle', [0.03, 0.02, 0.04], [sideDoorCenterX + 0.28, 1.1, leftWallZ + 0.11]);

    // Side Door Arched Canopy
    buildArchedCanopy(sideDoorCenterX, plinthH + sideDoorHeight + 0.04, 1.25, 0.65, leftWallZ + 0.08);

    // =========================================================================
    // 2. RIGHT MAIN VOLUME (Axes Б–В, width 13.5 m, total height 12.0 m)
    // =========================================================================
    // Stepped forward slightly (0.06 m) for crisp architectural massing & shadow reveal at Axis Б
    const rightWallZ = southEndZ + 0.06;

    // Dark granite plinth (0.0 to +0.600 m)
    b.addBox('plinth', [rightWidth + 0.08, plinthH, 0.24], [rightCenterX, plinthH / 2, rightWallZ + 0.08]);
    b.addBox('trim', [rightWidth + 0.1, 0.06, 0.22], [rightCenterX, plinthH + 0.03, rightWallZ + 0.1]);

    // Blank travertine wall (from +0.600 m to +10.800 m, height = 10.2 m)
    const rightWallH = 10.2;
    const rightWallCenterY = plinthH + rightWallH / 2; // 5.70 m
    b.addBox('wall', [rightWidth, rightWallH, 0.18], [rightCenterX, rightWallCenterY, rightWallZ]);

    // Horizontal travertine rustication joints across entire 13.5 m width
    for (const jy of [1.8, 3.0, 4.2, 5.4, 6.6, 7.8, 9.0, 10.2]) {
      b.addBox('joint', [rightWidth - 0.02, 0.025, 0.01], [rightCenterX, jy, rightWallZ + 0.092]);
    }

    // Step reveal wall at Axis Б (vertical notch between left Y=9.2m and right Y=12.0m)
    const stepH = 12.0 - 9.2; // 2.80 m
    const stepCenterY = 9.2 + stepH / 2; // 10.60 m
    b.addBox('wall', [0.2, stepH, 0.28], [axisBX + 0.08, stepCenterY, rightWallZ - 0.06]);
    b.addBox('trim', [0.06, 12.0, 0.06], [axisBX, 6.0, rightWallZ + 0.09]);

    // Parapet transition cornice trim (+10.800 m)
    b.addBox('trim', [rightWidth + 0.14, 0.22, 0.32], [rightCenterX, 10.8, rightWallZ + 0.14]);

    // White composite panel parapet frieze (+10.800 m to +12.000 m, height = 1.2 m)
    const rightFriezeH = 1.2;
    const rightFriezeCenterY = 10.8 + rightFriezeH / 2; // 11.40 m
    b.addBox('frieze', [rightWidth + 0.08, rightFriezeH, 0.2], [rightCenterX, rightFriezeCenterY, rightWallZ + 0.1]);

    // Parapet composite panel joints (2 horizontal rows & vertical seams every ~1.6875 m)
    b.addBox('friezeJoint', [rightWidth, 0.02, 0.01], [rightCenterX, 11.4, rightWallZ + 0.202]);
    for (let i = 1; i < 8; i++) {
      const fx = axisBX + i * (rightWidth / 8);
      b.addBox('friezeJoint', [0.02, rightFriezeH, 0.01], [fx, rightFriezeCenterY, rightWallZ + 0.202]);
    }

    // Parapet top capping ledge (+12.000 m)
    b.addBox('trim', [rightWidth + 0.18, 0.1, 0.36], [rightCenterX, 12.05, rightWallZ + 0.16]);

    // --- Main Entrance: Double-leaf Door 1 600 × 2 400 mm (500 mm from Axis Б) ---
    const mainDoorWidth = 1.6;
    const mainDoorHeight = 2.4;
    const mainDoorCenterX = axisBX + 0.5 + mainDoorWidth / 2; // 59.85 m
    const mainDoorCenterY = plinthH + mainDoorHeight / 2; // 1.80 m

    // Granite entrance steps (two-tier flight)
    b.addBox('plinth', [mainDoorWidth + 0.7, 0.16, 0.85], [mainDoorCenterX, 0.08, rightWallZ + 0.48]);
    b.addBox('plinth', [mainDoorWidth + 0.45, 0.16, 0.55], [mainDoorCenterX, 0.24, rightWallZ + 0.33]);

    // Outer door portal surround / stone architrave (left jamb, right jamb, lintel header)
    const mainJambW = 0.10;
    b.addBox('trim', [mainJambW, mainDoorHeight, 0.08], [mainDoorCenterX - mainDoorWidth / 2 - mainJambW / 2, mainDoorCenterY, rightWallZ + 0.08]);
    b.addBox('trim', [mainJambW, mainDoorHeight, 0.08], [mainDoorCenterX + mainDoorWidth / 2 + mainJambW / 2, mainDoorCenterY, rightWallZ + 0.08]);
    b.addBox('trim', [mainDoorWidth + mainJambW * 2, 0.10, 0.09], [mainDoorCenterX, plinthH + mainDoorHeight + 0.05, rightWallZ + 0.085]);

    // Main door cavity
    b.addBox('cavity', [mainDoorWidth, mainDoorHeight, 0.12], [mainDoorCenterX, mainDoorCenterY, rightWallZ + 0.02]);

    // Perimeter door frame (dark graphite frame jambs & header)
    const mFrameW = 0.05;
    b.addBox('frame', [mFrameW, mainDoorHeight, 0.06], [mainDoorCenterX - mainDoorWidth / 2 + mFrameW / 2, mainDoorCenterY, rightWallZ + 0.07]);
    b.addBox('frame', [mFrameW, mainDoorHeight, 0.06], [mainDoorCenterX + mainDoorWidth / 2 - mFrameW / 2, mainDoorCenterY, rightWallZ + 0.07]);
    b.addBox('frame', [mainDoorWidth, mFrameW, 0.06], [mainDoorCenterX, plinthH + mainDoorHeight - mFrameW / 2, rightWallZ + 0.07]);

    // Center mullion dividing double leaves
    b.addBox('frame', [0.06, mainDoorHeight, 0.065], [mainDoorCenterX, mainDoorCenterY, rightWallZ + 0.075]);

    // Left and right dark blue door leaves
    const innerWidth = mainDoorWidth - mFrameW * 2 - 0.06;
    const leafWidth = innerWidth / 2;
    const leafHeight = mainDoorHeight - mFrameW;
    const leafCenterY = plinthH + leafHeight / 2;
    const leftLeafX = mainDoorCenterX - 0.03 - leafWidth / 2;
    const rightLeafX = mainDoorCenterX + 0.03 + leafWidth / 2;
    b.addBox('doorLeaf', [leafWidth, leafHeight, 0.045], [leftLeafX, leafCenterY, rightWallZ + 0.075]);
    b.addBox('doorLeaf', [leafWidth, leafHeight, 0.045], [rightLeafX, leafCenterY, rightWallZ + 0.075]);

    // Glass vision panels in double leaves
    const glassW = Math.min(0.24, leafWidth - 0.12);
    b.addBox('glass', [glassW, 1.3, 0.02], [leftLeafX, mainDoorCenterY + 0.15, rightWallZ + 0.092]);
    b.addBox('glass', [glassW, 1.3, 0.02], [rightLeafX, mainDoorCenterY + 0.15, rightWallZ + 0.092]);

    // Dual stainless steel vertical tubular pull handles
    b.addCylinder('handle', [0.018, 0.018, 0.85, 10], [mainDoorCenterX - 0.08, 1.5, rightWallZ + 0.15]);
    b.addCylinder('handle', [0.018, 0.018, 0.85, 10], [mainDoorCenterX + 0.08, 1.5, rightWallZ + 0.15]);
    for (const hx of [mainDoorCenterX - 0.08, mainDoorCenterX + 0.08]) {
      b.addBox('handle', [0.035, 0.02, 0.045], [hx, 1.9, rightWallZ + 0.12]);
      b.addBox('handle', [0.035, 0.02, 0.045], [hx, 1.1, rightWallZ + 0.12]);
    }

    // Main Entrance Arched Canopy (width 1.95 m, projection 0.85 m)
    buildArchedCanopy(mainDoorCenterX, plinthH + mainDoorHeight + 0.04, 1.95, 0.85, rightWallZ + 0.09);

    // --- «LIBRARY» Brass Plaque (between Main Entrance and Window 1) ---
    const plaqueCenterX = 61.55;
    const plaqueCenterY = 1.95;
    const plaqueWidth = 0.72;
    const plaqueHeight = 0.28;
    b.addBox('trim', [plaqueWidth + 0.04, plaqueHeight + 0.04, 0.03], [plaqueCenterX, plaqueCenterY, rightWallZ + 0.095]);
    b.addPlane('sign', [plaqueWidth, plaqueHeight], [plaqueCenterX, plaqueCenterY, rightWallZ + 0.112]);

    // --- 3 Windows 1st Floor (900 × 1 600 mm, Sill at +1.100 m, Head at +2.700 m) ---
    const winWidth = 0.9;
    const winHeight = 1.6;
    const winSillY = 1.1;
    const winCenterY = winSillY + winHeight / 2; // 1.90 m
    const transomY = winSillY + 1.15; // Upper transom bar at +2.250 m
    const lowerH = transomY - winSillY; // 1.15 m
    const upperH = winSillY + winHeight - transomY; // 0.45 m

    // Exact horizontal coordinates from CAD blueprint:
    // Window 1: 62.90 m | Window 2: 65.70 m | Window 3: 68.50 m
    // Distance from Window 3 right edge (68.95) to Axis В (72.05) is exactly 3 100 mm (3.1 m)!
    const windowCentersX = [62.9, 65.7, 68.5];

    for (const wx of windowCentersX) {
      const wz = rightWallZ + 0.08;

      // Projecting stone sill (+1.100 m)
      b.addBox('trim', [winWidth + 0.18, 0.08, 0.16], [wx, winSillY - 0.04, wz + 0.04]);

      // Stone lintel cap (+2.700 m)
      b.addBox('trim', [winWidth + 0.14, 0.08, 0.12], [wx, winSillY + winHeight + 0.04, wz + 0.02]);

      // Shadow cavity behind window
      b.addBox('cavity', [winWidth, winHeight, 0.1], [wx, winCenterY, wz - 0.04]);

      // Outer window frame casing
      b.addBox('frame', [winWidth, winHeight, 0.06], [wx, winCenterY, wz]);

      // Horizontal transom bar dividing lower and upper panes
      b.addBox('frame', [winWidth - 0.08, 0.045, 0.05], [wx, transomY, wz + 0.005]);

      // Lower pane vertical central mullion
      b.addBox('frame', [0.04, lowerH - 0.06, 0.045], [wx, winSillY + lowerH / 2, wz + 0.005]);

      // Glass panes (lower and upper)
      b.addBox('glass', [winWidth - 0.08, winHeight - 0.08, 0.02], [wx, winCenterY, wz + 0.008]);
    }

    return b.buildAll();
  }, []);

  useEffect(() => () => disposeMergedMap(merged), [merged]);

  return (
    <group>
      {merged.plinth && (
        <mesh geometry={merged.plinth} material={materials.plinthMat} receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.wall && (
        <mesh geometry={merged.wall} material={materials.wallMat} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.frieze && (
        <mesh geometry={merged.frieze} material={materials.friezeMat} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.trim && (
        <mesh geometry={merged.trim} material={materials.trimMat} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.frame && (
        <mesh geometry={merged.frame} material={materials.frameMat} raycast={NO_RAYCAST} />
      )}
      {merged.glass && (
        <mesh geometry={merged.glass} material={materials.glassMat} raycast={NO_RAYCAST} />
      )}
      {merged.cavity && (
        <mesh geometry={merged.cavity} material={materials.cavityMat} raycast={NO_RAYCAST} />
      )}
      {merged.joint && (
        <mesh geometry={merged.joint} material={materials.jointMat} raycast={NO_RAYCAST} />
      )}
      {merged.friezeJoint && (
        <mesh geometry={merged.friezeJoint} material={materials.friezeJointMat} raycast={NO_RAYCAST} />
      )}
      {merged.doorLeaf && (
        <mesh geometry={merged.doorLeaf} material={materials.doorLeafMat} castShadow raycast={NO_RAYCAST} />
      )}
      {merged.sideDoor && (
        <mesh geometry={merged.sideDoor} material={materials.sideDoorMat} castShadow raycast={NO_RAYCAST} />
      )}
      {merged.handle && (
        <mesh geometry={merged.handle} material={materials.handleMat} raycast={NO_RAYCAST} />
      )}
      {merged.canopyGlass && (
        <mesh geometry={merged.canopyGlass} material={materials.canopyMat} raycast={NO_RAYCAST} />
      )}
      {merged.canopyFrame && (
        <mesh geometry={merged.canopyFrame} material={materials.canopyFrameMat} castShadow raycast={NO_RAYCAST} />
      )}
      {merged.sign && (
        <mesh geometry={merged.sign} material={materials.librarySignMat} raycast={NO_RAYCAST} />
      )}
    </group>
  );
}
