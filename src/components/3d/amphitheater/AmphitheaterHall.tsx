import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { AMPHITHEATER_HALL } from '../../../data/amphitheater-hall';
import {
  disposeMergedMap,
  NO_RAYCAST,
  StaticGeometryBatcher,
} from '../geometry/staticGeometryMerger';
import {
  getAmphitheaterFloorLogoTexture,
  getAmphitheaterScreenTexture,
  getBookshelfTexture,
  getGrilyatoTexture,
  getParquetFloorTexture,
  getSlateRoofTexture,
} from './amphitheaterTextures';

/**
 * Creates a 4-pitched hip roof geometry for the Amphitheater Hall,
 * matching the red pitched roofs ("шифер") of Block B and Block A.
 */
function createAmphitheaterHipRoofGeometry(
  width: number,
  depth: number,
  height: number,
): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  const hw = width / 2;
  const hd = depth / 2;
  const ridgeLen = Math.max(0, width - depth * 0.7);
  const hr = ridgeLen / 2;

  const positions: number[] = [
    // South face (Z > 0)
    -hw, 0, hd,   hw, 0, hd,   hr, height, 0,
    -hw, 0, hd,   hr, height, 0,  -hr, height, 0,

    // North face (Z < 0)
    hw, 0, -hd,  -hw, 0, -hd,  -hr, height, 0,
    hw, 0, -hd,  -hr, height, 0,   hr, height, 0,

    // West hip (X < 0)
    -hw, 0, -hd, -hw, 0, hd,   -hr, height, 0,

    // East hip (X > 0)
    hw, 0, hd,    hw, 0, -hd,   hr, height, 0,
  ];

  const uvs: number[] = [
    0, 0,  1, 0,  0.8, 1,
    0, 0,  0.8, 1, 0.2, 1,
    0, 0,  1, 0,  0.8, 1,
    0, 0,  0.8, 1, 0.2, 1,
    0, 0,  1, 0,  0.5, 1,
    0, 0,  1, 0,  0.5, 1,
  ];

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Creates an 8-point 2D octagon polygon contour centered at (0, 0).
 */
function createOctagonShape(rx: number, ry: number, ch: number): THREE.Shape {
  const shape = new THREE.Shape();
  if (ch <= 0.001) {
    shape.moveTo(-rx, ry);
    shape.lineTo(rx, ry);
    shape.lineTo(rx, -ry);
    shape.lineTo(-rx, -ry);
    shape.closePath();
    return shape;
  }
  const pts = [
    [-rx + ch, ry],
    [rx - ch, ry],
    [rx, ry - ch],
    [rx, -ry + ch],
    [rx - ch, -ry],
    [-rx + ch, -ry],
    [-rx, -ry + ch],
    [-rx, ry - ch],
  ];
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    shape.lineTo(pts[i][0], pts[i][1]);
  }
  shape.closePath();
  return shape;
}

/**
 * Creates a tier ring geometry between an inner octagon and an outer octagon/polygon.
 */
function createTierRingGeometry(
  outerRx: number,
  outerRy: number,
  outerCh: number,
  innerRx: number,
  innerRy: number,
  innerCh: number,
  height: number,
): THREE.BufferGeometry {
  const shape = createOctagonShape(outerRx, outerRy, outerCh);
  const hole = createOctagonShape(innerRx, innerRy, innerCh);
  shape.holes.push(hole);

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
  });
  geom.rotateX(Math.PI / 2);
  return geom;
}

/**
 * 3D Architectural Model of «Зал амфитеатра» (Amphitheater Hall).
 * Built to the CAD drawings and specifications in ADR-029 (Center [50.5, 76.5], Size 20m × 17m).
 * All ~190 static sub-meshes are merged by material into 20 draw calls.
 */
export function AmphitheaterHall({
  selected = false,
  onSelect,
}: {
  selected?: boolean;
  onSelect?: () => void;
}) {
  const spec = AMPHITHEATER_HALL;
  const [worldCenterX, worldCenterZ] = spec.center;

  const floorLogoTex = useMemo(() => getAmphitheaterFloorLogoTexture(), []);
  const parquetTex = useMemo(() => getParquetFloorTexture(), []);
  const screenTex = useMemo(() => getAmphitheaterScreenTexture(), []);
  const bookshelfTex = useMemo(() => getBookshelfTexture(), []);
  const grilyatoTex = useMemo(() => getGrilyatoTexture(), []);
  const slateRoofTex = useMemo(() => getSlateRoofTexture(), []);

  const materials = useMemo(() => {
    return {
      wall: new THREE.MeshStandardMaterial({
        color: '#eae3d2',
        roughness: 0.85,
        metalness: 0.05,
      }),
      plinth: new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.8,
        metalness: 0.2,
      }),
      tier: new THREE.MeshStandardMaterial({
        color: '#2d3748',
        roughness: 0.75,
      }),
      stairDark: new THREE.MeshStandardMaterial({
        color: '#334155',
        roughness: 0.8,
      }),
      stairNosing: new THREE.MeshStandardMaterial({
        color: '#cbd5e1',
        roughness: 0.4,
      }),
      wood: new THREE.MeshStandardMaterial({
        color: '#78350f',
        roughness: 0.65,
      }),
      darkWood: new THREE.MeshStandardMaterial({
        color: '#381c0d',
        roughness: 0.7,
      }),
      glass: new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.12,
        metalness: 0.75,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      }),
      darkGlaze: new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.15,
        metalness: 0.3,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      }),
      metalFrame: new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.5,
        metalness: 0.6,
      }),
      goldAccent: new THREE.MeshStandardMaterial({
        color: '#d97706',
        roughness: 0.3,
        metalness: 0.7,
      }),
      screen: new THREE.MeshStandardMaterial({
        map: screenTex ?? undefined,
        color: screenTex ? '#ffffff' : '#030712',
        roughness: 0.2,
        metalness: 0.1,
        emissive: '#1e293b',
        emissiveIntensity: 0.4,
      }),
      bookshelf: new THREE.MeshStandardMaterial({
        map: bookshelfTex ?? undefined,
        color: bookshelfTex ? '#ffffff' : '#3d2010',
        roughness: 0.7,
      }),
      floorLogo: new THREE.MeshStandardMaterial({
        map: floorLogoTex ?? undefined,
        color: floorLogoTex ? '#ffffff' : '#1d4ed8',
        roughness: 0.4,
        metalness: 0.2,
      }),
      parquet: new THREE.MeshStandardMaterial({
        map: parquetTex ?? undefined,
        color: parquetTex ? '#ffffff' : '#d7cbb5',
        roughness: 0.5,
      }),
      grilyato: new THREE.MeshStandardMaterial({
        map: grilyatoTex ?? undefined,
        color: grilyatoTex ? '#ffffff' : '#090d16',
        roughness: 0.9,
        metalness: 0.3,
      }),
      redCushion: new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.7 }),
      blueCushion: new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.7 }),
      whiteCol: new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.35 }),
      roof: new THREE.MeshStandardMaterial({
        map: slateRoofTex ?? undefined,
        color: slateRoofTex ? '#ffffff' : '#991b1b',
        roughness: 0.65,
        metalness: 0.2,
      }),
      fascia: new THREE.MeshStandardMaterial({
        color: '#f1e6cf',
        roughness: 0.7,
      }),
      warmLed: new THREE.MeshStandardMaterial({
        color: '#fef08a',
        emissive: '#fef08a',
        emissiveIntensity: 0.8,
      }),
      cyanFrame: new THREE.MeshStandardMaterial({ color: '#38bdf8' }),
      whiteLed: new THREE.MeshStandardMaterial({
        color: '#ffffff',
        emissive: '#ffffff',
        emissiveIntensity: 1.2,
      }),
    };
  }, [screenTex, bookshelfTex, floorLogoTex, parquetTex, grilyatoTex, slateRoofTex]);

  const merged = useMemo(() => {
    const batcher = new StaticGeometryBatcher();

    const toWorld = (
      ox: number,
      oy: number,
      oz: number,
      rotY: number,
      lx: number,
      ly: number,
      lz: number,
    ): [number, number, number] => {
      const c = Math.cos(rotY);
      const s = Math.sin(rotY);
      return [ox + lx * c + lz * s, oy + ly, oz - lx * s + lz * c];
    };

    // 1. Foundation, Sunken Bowl & Floor Logo
    batcher.addBox('plinth', [20.5, 0.3, 17.5], [0, -0.15, 0.25]);

    const floorBowlShape = createOctagonShape(
      spec.floor.bowl.rx,
      spec.floor.bowl.ry,
      spec.floor.bowl.chamfer,
    );
    const floorBowlGeo = new THREE.ShapeGeometry(floorBowlShape);
    floorBowlGeo.rotateX(Math.PI / 2);
    batcher.addGeometry('parquet', floorBowlGeo, [0, 0.002, 0]);
    floorBowlGeo.dispose();

    const logoGeo = new THREE.CircleGeometry(spec.floor.logoDiameter / 2, 48);
    logoGeo.rotateX(-Math.PI / 2);
    batcher.addGeometry('floorLogo', logoGeo, [0, 0.006, 0]);
    logoGeo.dispose();

    // 2. Amphitheater Tiers (3 steps)
    for (const t of spec.tiers) {
      const tGeo = createTierRingGeometry(
        t.outer.rx,
        t.outer.ry,
        t.outer.chamfer,
        t.inner.rx,
        t.inner.ry,
        t.inner.chamfer,
        t.top,
      );
      batcher.addGeometry('tier', tGeo, [0, 0, 0]);
      tGeo.dispose();
    }

    // 3. Cushions on Tiers 1 & 2
    const rCush = spec.cushions.radius;
    for (const y of spec.cushions.alongY) {
      batcher.addCylinder('redCushion', [rCush, rCush, 0.08, 16], [8.0, 0.49, -y]);
      batcher.addCylinder('redCushion', [rCush, rCush, 0.08, 16], [8.8, 0.94, -y]);
      batcher.addCylinder('blueCushion', [rCush, rCush, 0.08, 16], [-8.0, 0.49, -y]);
      batcher.addCylinder('blueCushion', [rCush, rCush, 0.08, 16], [-8.8, 0.94, -y]);
    }
    for (const x of spec.cushions.alongX) {
      batcher.addCylinder('blueCushion', [rCush, rCush, 0.08, 16], [x, 0.49, 6.9]);
      batcher.addCylinder('blueCushion', [rCush, rCush, 0.08, 16], [x, 0.94, 7.7]);
    }

    // 4. 3 Central Staircases (East, West, South)
    const stW = spec.stairs.width;
    const stD = spec.stairs.depth;
    const stSteps = spec.stairs.steps;
    const stepRise = 1.35 / stSteps;
    const stepTread = stD / stSteps;
    const stairFlights: [number, number, number, number][] = [
      [8.8, 0, 0, Math.PI / 2],
      [-8.8, 0, 0, -Math.PI / 2],
      [0, 0, 7.3, 0],
    ];
    for (const [sx, sy, sz, rotY] of stairFlights) {
      for (let i = 0; i < stSteps; i++) {
        const stepH = (i + 1) * stepRise;
        const zPos = -stD / 2 + (i + 0.5) * stepTread;
        batcher.addBox(
          'stairDark',
          [stW, stepH, stepTread],
          toWorld(sx, sy, sz, rotY, 0, stepH / 2, zPos),
          [0, rotY, 0],
        );
        batcher.addBox(
          'stairNosing',
          [stW - 0.04, 0.03, 0.06],
          toWorld(sx, sy, sz, rotY, 0, stepH - 0.015, zPos + stepTread / 2 - 0.03),
          [0, rotY, 0],
        );
      }
    }

    // 5. North Wall (Stage, Screen & Bookshelves)
    batcher.addBox('wood', [6.4, 1.35, 2.4], [0, 1.35 / 2, -7.3]);
    batcher.addBox('metalFrame', [6.0, 0.04, 0.04], [0, 1.35 + 0.85, -6.1]);
    batcher.addBox('metalFrame', [6.0, 0.02, 0.02], [0, 1.35 + 0.45, -6.1]);
    for (const rx of [-2.8, -1.7, -0.6, 0.6, 1.7, 2.8]) {
      batcher.addBox('metalFrame', [0.04, 0.85, 0.04], [rx, 1.35 + 0.425, -6.1]);
    }
    for (const sx of [-2.575, 2.575]) {
      batcher.addBox('metalFrame', [0.45, 0.7, 0.45], [sx, 1.35 + 0.35, -6.6]);
      batcher.addBox('goldAccent', [0.4, 0.65, 0.02], [sx, 1.35 + 0.35, -6.6 + 0.23]);
    }
    batcher.addBox('wall', [20, 7.2, 0.2], [0, 3.6, -8.4]);
    batcher.addBox('screen', [6.4, 3.5, 0.1], [0, (2.6 + 6.1) / 2, -8.25]);
    batcher.addBox('metalFrame', [6.55, 3.65, 0.08], [0, (2.6 + 6.1) / 2, -8.27]);
    for (const px of [-3.35, 3.35]) {
      batcher.addBox('darkWood', [0.3, 5.75, 0.18], [px, 4.225, -8.22]);
    }
    for (const bx of [(-9.6 - 3.5) / 2, (3.5 + 9.6) / 2]) {
      batcher.addBox('wood', [6.1, 0.95, 0.35], [bx, (1.35 + 2.3) / 2, -8.2]);
      batcher.addBox('bookshelf', [6.1, 4.8, 0.35], [bx, (2.3 + 7.1) / 2, -8.2]);
    }
    batcher.addBox('bookshelf', [6.4, 0.9, 0.35], [0, (6.2 + 7.1) / 2, -8.2]);

    // 6. East Wall (Entrance, 4 Columns & 2nd Floor Balcony)
    for (const y of spec.east.columns.at) {
      batcher.addBox('whiteCol', [0.6, 3.15, 0.6], [9.7, (1.35 + 4.5) / 2, -y]);
      batcher.addBox('metalFrame', [0.15, 3.15, 0.6], [9.9, (1.35 + 4.5) / 2, -y - 0.4]);
      batcher.addBox('darkWood', [0.5, 2.35, 0.5], [9.75, (4.85 + 7.2) / 2, -y]);
    }
    batcher.addBox('wood', [0.5, 0.35, 12.0], [9.75, (4.5 + 4.85) / 2, 0]);
    batcher.addBox('glass', [0.04, 1.0, 12.0], [9.65, (4.85 + 5.85) / 2, 0]);
    batcher.addBox('metalFrame', [0.08, 0.05, 12.0], [9.65, 5.85, 0]);
    for (const by of [-7.2, 7.2]) {
      batcher.addBox('bookshelf', [0.4, 5.85, 2.5], [9.7, (1.35 + 7.2) / 2, -by]);
    }
    batcher.addBox('plinth', [1.15, 1.35, 12.0], [10.575, 1.35 / 2, 0]);
    batcher.addBox('wood', [1.15, 0.25, 12.0], [10.575, 4.65, 0]);
    batcher.addBox('darkWood', [1.15, 0.3, 12.0], [10.575, 7.2, 0]);
    batcher.addBox('darkGlaze', [0.08, 5.85, 12.0], [10.575 + 1.15 / 2, (1.35 + 7.2) / 2, 0]);
    batcher.addBox('glass', [0.1, 2.85, 2.6], [10.575 + 1.15 / 2 + 0.02, (1.35 + 4.2) / 2, 0]);
    batcher.addBox('metalFrame', [0.12, 2.95, 2.75], [10.575 + 1.15 / 2 + 0.04, (1.35 + 4.2) / 2, 0]);

    // 7. West Wall (Exterior Cladding, Panoramic Windows & Entrance)
    batcher.addBox('wall', [0.26, 8.9 - 1.35, 2.5], [-10.02, (1.35 + 8.9) / 2, -7.25]);
    batcher.addBox('wall', [0.26, 8.9 - 1.35, 2.5], [-10.02, (1.35 + 8.9) / 2, 7.25]);
    batcher.addBox('wall', [0.26, 8.9 - 7.2, 12.0], [-10.02, (7.2 + 8.9) / 2, 0]);
    batcher.addBox('plinth', [0.26, 1.35, 7.2], [-10.02, 1.35 / 2, -4.9]);
    batcher.addBox('plinth', [0.26, 1.35, 7.2], [-10.02, 1.35 / 2, 4.9]);

    for (const by of [-7.25, 7.25]) {
      batcher.addBox('bookshelf', [0.35, 5.85, 2.45], [-9.65, (1.35 + 7.2) / 2, -by]);
    }
    batcher.addBox('glass', [0.06, 5.85, 4.7], [-9.95, (1.35 + 7.2) / 2, -3.65]);
    batcher.addBox('glass', [0.06, 5.85, 4.7], [-9.95, (1.35 + 7.2) / 2, 3.65]);
    batcher.addBox('glass', [0.06, 7.2 - 4.2, 2.8], [-9.95, (4.2 + 7.2) / 2, 0]);

    for (const wy of [-6.0, -4.0, -2.0, -1.4, 1.4, 2.0, 4.0, 6.0]) {
      batcher.addBox('metalFrame', [0.12, 5.85, 0.08], [-9.95, (1.35 + 7.2) / 2, -wy]);
    }
    batcher.addBox('metalFrame', [0.1, 0.08, 4.7], [-9.95, 2.1, -3.65]);
    batcher.addBox('metalFrame', [0.1, 0.08, 4.7], [-9.95, 5.4, -3.65]);
    batcher.addBox('metalFrame', [0.1, 0.08, 4.7], [-9.95, 2.1, 3.65]);
    batcher.addBox('metalFrame', [0.1, 0.08, 4.7], [-9.95, 5.4, 3.65]);

    for (const ry of spec.west.radiators.at) {
      batcher.addBox('whiteCol', [0.18, 0.55, spec.west.radiators.width], [-9.78, (1.35 + 1.9) / 2, -ry]);
    }

    // Walkable West Entrance Portal
    batcher.addBox('metalFrame', [0.16, 0.1, 2.8], [-9.95, 4.2, 0]);
    batcher.addBox('metalFrame', [0.16, 2.85, 0.1], [-9.95, (1.35 + 4.2) / 2, -1.4]);
    batcher.addBox('metalFrame', [0.16, 2.85, 0.1], [-9.95, (1.35 + 4.2) / 2, 1.4]);

    // Left & Right swung open door leaves
    const doorY = (1.35 + 4.15) / 2;
    batcher.addBox(
      'glass',
      [0.04, 2.7, 1.2],
      toWorld(-9.75, doorY, -1.35, 1.35, 0, 0, 0.6),
      [0, 1.35, 0],
    );
    batcher.addBox(
      'goldAccent',
      [0.04, 0.7, 0.04],
      toWorld(-9.75, doorY, -1.35, 1.35, 0.06, -0.2, 1.15),
      [0, 1.35, 0],
    );
    batcher.addBox(
      'glass',
      [0.04, 2.7, 1.2],
      toWorld(-9.75, doorY, 1.35, -1.35, 0, 0, -0.6),
      [0, -1.35, 0],
    );
    batcher.addBox(
      'goldAccent',
      [0.04, 0.7, 0.04],
      toWorld(-9.75, doorY, 1.35, -1.35, 0.06, -0.2, -1.15),
      [0, -1.35, 0],
    );

    batcher.addBox('metalFrame', [2.2, 0.08, 4.0], [-11.2, 4.28, 0]);
    batcher.addBox('glass', [2.1, 0.02, 3.9], [-11.2, 4.32, 0]);
    batcher.addBox('plinth', [1.3, 1.35, 4.4], [-10.55, 1.35 / 2, 0]);

    for (let i = 0; i < 6; i++) {
      const extRise = 1.35 / 6;
      const extTread = 3.0 / 6;
      const stepH = (6 - i) * extRise;
      const stepX = -11.2 - (i + 0.5) * extTread;
      batcher.addBox('plinth', [extTread, stepH, 4.4], [stepX, stepH / 2, 0]);
      batcher.addBox('whiteCol', [0.08, 0.03, 4.36], [stepX - extTread / 2 + 0.04, stepH - 0.015, 0]);
    }
    for (const sideZ of [-2.25, 2.25]) {
      batcher.addBox('wall', [1.3, 2.25 - 1.35, 0.25], [-10.55, (1.35 + 2.25) / 2, sideZ]);
      batcher.addBox(
        'wall',
        [3.3, 0.9, 0.25],
        [-12.7, (1.35 + 0.9) / 2, sideZ],
        [0, 0, Math.atan2(1.35, 3.0)],
      );
    }
    batcher.addBox('tier', [1.0, 1.35, 2.8], [-9.4, 1.35 / 2, 0]);

    // 8. South Wall (Open Colonnade, Steel Truss & Lounge)
    for (const px of spec.south.pillars.at) {
      batcher.addBox('wood', [0.5, 5.85, 0.5], [px, (1.35 + 7.2) / 2, 8.25]);
    }
    batcher.addBox('metalFrame', [14.0, 0.55, 0.25], [0, (4.4 + 4.95) / 2, 8.3]);
    for (let i = 0; i < 20; i++) {
      const tx = -6.65 + i * 0.7;
      batcher.addBox('metalFrame', [0.65, 0.04, 0.04], [tx, 4.675, 8.35], [0, 0, Math.PI / 4]);
    }
    for (const dx of spec.south.drapes) {
      batcher.addBox('metalFrame', [0.8, 3.05, 0.15], [dx, (1.35 + 4.4) / 2, 8.15]);
    }
    batcher.addBox('glass', [14.0, 0.9, 0.04], [0, (1.35 + 2.25) / 2, 8.1]);
    for (const bx of [-8.5, 8.5]) {
      batcher.addBox('bookshelf', [3.0, 5.85, 0.4], [bx, (1.35 + 7.2) / 2, 8.2]);
    }

    // 9. Ceiling & Lighting
    const soffitAngle = Math.atan2(1.3, 2.0);
    batcher.addBox('darkWood', [20.0, 0.15, 2.38], [0, 7.85, -7.5], [soffitAngle, 0, 0]);
    batcher.addBox('darkWood', [20.0, 0.15, 2.38], [0, 7.85, 7.5], [-soffitAngle, 0, 0]);
    batcher.addBox('darkWood', [2.38, 0.15, 17.0], [-9.0, 7.85, 0], [0, 0, -soffitAngle]);
    batcher.addBox('darkWood', [2.38, 0.15, 17.0], [9.0, 7.85, 0], [0, 0, soffitAngle]);

    for (const c of spec.ceiling.linearLedCenters) {
      batcher.addBox('warmLed', [spec.ceiling.linearLedLength, 0.04, 0.08], [c, 7.85, -7.5]);
      batcher.addBox('warmLed', [spec.ceiling.linearLedLength, 0.04, 0.08], [c, 7.85, 7.5]);
      batcher.addBox('warmLed', [0.08, 0.04, spec.ceiling.linearLedLength * 0.75], [-9.0, 7.85, c * 0.75]);
      batcher.addBox('warmLed', [0.08, 0.04, spec.ceiling.linearLedLength * 0.75], [9.0, 7.85, c * 0.75]);
    }

    batcher.addPlane('grilyato', [16.0, 13.0], [0, 8.5, 0], [-Math.PI / 2, 0, 0]);

    for (const lx of spec.ceiling.ledCoordsX) {
      for (const ly of spec.ceiling.ledCoordsY) {
        batcher.addBox('cyanFrame', [0.7, 0.02, 0.7], [lx, 8.51, -ly]);
        batcher.addBox('whiteLed', [0.6, 0.02, 0.6], [lx, 8.5, -ly]);
      }
    }

    // 10. Exterior Parapets
    batcher.addBox('wall', [20.5, 0.8, 0.25], [0, (8.9 + 9.7) / 2, -8.375]);
    batcher.addBox('wall', [20.5, 0.8, 0.35], [0, (8.9 + 9.7) / 2, 8.55]);
    batcher.addBox('wall', [0.35, 0.8, 17.5], [-10.05, (8.9 + 9.7) / 2, 0]);
    batcher.addBox('wall', [0.35, 0.8, 12.4], [11.2, (8.9 + 9.7) / 2, 0]);

    // Roof geometries (rendered when !selected)
    const hipRoofGeo = createAmphitheaterHipRoofGeometry(20.4, 17.0, 3.4);
    batcher.addGeometry('roof', hipRoofGeo, [0, 9.2, 0]);
    hipRoofGeo.dispose();
    batcher.addBox('roof', [1.25, 0.25, 12.2], [10.6, 8.9 - 1.55, 0]);
    batcher.addBox('fascia', [20.5, 0.3, 17.3], [0, 9.05, 0.15]);
    batcher.addBox('roofRidge', [8.4, 0.08, 0.25], [0, 8.9 + 3.72, 0]);

    return batcher.buildAll();
  }, [spec]);

  useEffect(() => {
    return () => {
      disposeMergedMap(merged);
      Object.values(materials).forEach((m) => m.dispose());
    };
  }, [merged, materials]);

  return (
    <group
      name="amphitheater-hall"
      position={[worldCenterX, 0, worldCenterZ]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
    >
      {merged.wall && (
        <mesh geometry={merged.wall} material={materials.wall} castShadow receiveShadow />
      )}
      {merged.plinth && (
        <mesh geometry={merged.plinth} material={materials.plinth} receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.parquet && (
        <mesh geometry={merged.parquet} material={materials.parquet} receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.floorLogo && (
        <mesh geometry={merged.floorLogo} material={materials.floorLogo} receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.tier && (
        <mesh geometry={merged.tier} material={materials.tier} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.stairDark && (
        <mesh geometry={merged.stairDark} material={materials.stairDark} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.stairNosing && (
        <mesh geometry={merged.stairNosing} material={materials.stairNosing} raycast={NO_RAYCAST} />
      )}
      {merged.redCushion && (
        <mesh geometry={merged.redCushion} material={materials.redCushion} castShadow raycast={NO_RAYCAST} />
      )}
      {merged.blueCushion && (
        <mesh geometry={merged.blueCushion} material={materials.blueCushion} castShadow raycast={NO_RAYCAST} />
      )}
      {merged.wood && (
        <mesh geometry={merged.wood} material={materials.wood} castShadow receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.darkWood && (
        <mesh geometry={merged.darkWood} material={materials.darkWood} castShadow raycast={NO_RAYCAST} />
      )}
      {merged.metalFrame && (
        <mesh geometry={merged.metalFrame} material={materials.metalFrame} raycast={NO_RAYCAST} />
      )}
      {merged.goldAccent && (
        <mesh geometry={merged.goldAccent} material={materials.goldAccent} raycast={NO_RAYCAST} />
      )}
      {merged.screen && (
        <mesh geometry={merged.screen} material={materials.screen} raycast={NO_RAYCAST} />
      )}
      {merged.bookshelf && (
        <mesh geometry={merged.bookshelf} material={materials.bookshelf} receiveShadow raycast={NO_RAYCAST} />
      )}
      {merged.whiteCol && (
        <mesh geometry={merged.whiteCol} material={materials.whiteCol} castShadow raycast={NO_RAYCAST} />
      )}
      {merged.glass && (
        <mesh geometry={merged.glass} material={materials.glass} raycast={NO_RAYCAST} />
      )}
      {merged.darkGlaze && (
        <mesh geometry={merged.darkGlaze} material={materials.darkGlaze} raycast={NO_RAYCAST} />
      )}
      {merged.grilyato && (
        <mesh geometry={merged.grilyato} material={materials.grilyato} raycast={NO_RAYCAST} />
      )}
      {merged.warmLed && (
        <mesh geometry={merged.warmLed} material={materials.warmLed} raycast={NO_RAYCAST} />
      )}
      {merged.cyanFrame && (
        <mesh geometry={merged.cyanFrame} material={materials.cyanFrame} raycast={NO_RAYCAST} />
      )}
      {merged.whiteLed && (
        <mesh geometry={merged.whiteLed} material={materials.whiteLed} raycast={NO_RAYCAST} />
      )}
      {!selected && (
        <group>
          {merged.fascia && (
            <mesh geometry={merged.fascia} material={materials.fascia} castShadow receiveShadow raycast={NO_RAYCAST} />
          )}
          {merged.roof && (
            <mesh geometry={merged.roof} material={materials.roof} castShadow receiveShadow />
          )}
          {merged.roofRidge && (
            <mesh geometry={merged.roofRidge} material={materials.metalFrame} raycast={NO_RAYCAST} />
          )}
        </group>
      )}
    </group>
  );
}

