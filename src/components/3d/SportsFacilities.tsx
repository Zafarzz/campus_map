import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  StaticGeometryBatcher,
  disposeMergedMap,
  NO_RAYCAST,
} from './geometry/staticGeometryMerger';
import { getSportsMeshTexture } from './facades/facadeTextures';
import { CommemorativeStela } from './facades/SportsComplexFacade';

/**
 * Complete Real-World Sports Facilities Ensembles:
 * - Football / Soccer Pitch with regulation lines, 3D goals, and corner flags.
 * - Basketball Court with multi-colored acrylic, three-point/key lines, and 3D cantilever hoops.
 * - Athletics Stadium with FIFA pitch stripes, lines, and 3D goals.
 */
export function SportsFacilities() {
  const meshTexture = useMemo(() => {
    const tex = getSportsMeshTexture();
    if (tex) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1, 1);
    }
    return tex;
  }, []);

  const materials = useMemo(() => {
    const lineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const postMat = new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.4,
      metalness: 0.7,
    });
    const railMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.4,
      metalness: 0.8,
    });
    const wireMeshMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      map: meshTexture ?? undefined,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const goalPostMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.25,
      metalness: 0.8,
    });
    const netMat = new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      roughness: 0.9,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const backboardMat = new THREE.MeshStandardMaterial({
      color: '#e2e8f0',
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.65,
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: '#ea580c',
      roughness: 0.3,
      metalness: 0.6,
    });
    const flagMat = new THREE.MeshStandardMaterial({
      color: '#dc2626',
      roughness: 0.7,
    });
    const turfDarkMat = new THREE.MeshStandardMaterial({
      color: '#15803d',
      roughness: 0.84,
    });
    const turfLightMat = new THREE.MeshStandardMaterial({
      color: '#16a34a',
      roughness: 0.82,
    });
    const turfBufferMat = new THREE.MeshStandardMaterial({
      color: '#166534',
      roughness: 0.88,
    });
    const apronMat = new THREE.MeshStandardMaterial({
      color: '#3d5236',
      roughness: 0.9,
    });
    const concreteCourtMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      roughness: 0.78,
    });

    return {
      lineMat,
      postMat,
      railMat,
      wireMeshMat,
      goalPostMat,
      netMat,
      backboardMat,
      rimMat,
      flagMat,
      turfDarkMat,
      turfLightMat,
      turfBufferMat,
      apronMat,
      concreteCourtMat,
    };
  }, [meshTexture]);

  const pitchX = 21.55;
  const pitchZ = 13.4;
  const pitchW = 20.0;
  const pitchD = 40.0;

  const courtX = 52.65;
  const courtZ = 13.4;
  const apronW = 30.0;
  const apronD = 40.0;
  const courtW = 27.3;
  const courtD = 36.0;

  const stadiumX = -77.0;
  const stadiumZ = -78.6;
  const stadiumW = 54.0;
  const stadiumD = 104.0;
  const stadiumPitchW = 48.0;
  const stadiumPitchD = 96.0;

  const merged = useMemo(() => {
    const b = new StaticGeometryBatcher();

    const addEnclosure = (cx: number, cy: number, cz: number, w: number, d: number, h: number) => {
      const step = 3.5;
      const nx = Math.max(2, Math.round(w / step));
      for (let i = 0; i <= nx; i++) {
        const x = -w / 2 + (i * w) / nx;
        b.addCylinder('post', [0.045, 0.045, h, 8], [cx + x, cy + h / 2, cz - d / 2]);
        b.addCylinder('post', [0.045, 0.045, h, 8], [cx + x, cy + h / 2, cz + d / 2]);
      }
      const nz = Math.max(2, Math.round(d / step));
      for (let j = 1; j < nz; j++) {
        const z = -d / 2 + (j * d) / nz;
        b.addCylinder('post', [0.045, 0.045, h, 8], [cx - w / 2, cy + h / 2, cz + z]);
        b.addCylinder('post', [0.045, 0.045, h, 8], [cx + w / 2, cy + h / 2, cz + z]);
      }
      // Top & mid rails
      for (const [ry, r] of [
        [h, 0.035],
        [h / 2, 0.02],
      ] as const) {
        b.addCylinder('rail', [r, r, w, 8], [cx, cy + ry, cz - d / 2], [0, 0, Math.PI / 2]);
        b.addCylinder('rail', [r, r, w, 8], [cx, cy + ry, cz + d / 2], [0, 0, Math.PI / 2]);
        b.addCylinder('rail', [r, r, d, 8], [cx - w / 2, cy + ry, cz], [Math.PI / 2, 0, 0]);
        b.addCylinder('rail', [r, r, d, 8], [cx + w / 2, cy + ry, cz], [Math.PI / 2, 0, 0]);
      }
      // Wire mesh planes with UV repeats
      const repW = Math.max(1, w / 1.4);
      const repD = Math.max(1, d / 1.4);
      const repH = Math.max(1, h / 1.2);
      b.addPlane('wireMesh', [w, h], [cx, cy + h / 2, cz - d / 2], [0, 0, 0], [repW, repH]);
      b.addPlane('wireMesh', [w, h], [cx, cy + h / 2, cz + d / 2], [0, 0, 0], [repW, repH]);
      b.addPlane('wireMesh', [d, h], [cx - w / 2, cy + h / 2, cz], [0, Math.PI / 2, 0], [repD, repH]);
      b.addPlane('wireMesh', [d, h], [cx + w / 2, cy + h / 2, cz], [0, Math.PI / 2, 0], [repD, repH]);
    };

    const addSoccerGoal = (
      gx: number,
      gy: number,
      gz: number,
      rotY: number,
      gw = 5.0,
      gh = 2.1,
      gd = 1.6,
    ) => {
      const cos = Math.cos(rotY);
      const sin = Math.sin(rotY);
      const toW = (lx: number, ly: number, lz: number): [number, number, number] => [
        gx + lx * cos + lz * sin,
        gy + ly,
        gz - lx * sin + lz * cos,
      ];
      b.addCylinder('goalPost', [0.06, 0.06, gh, 10], toW(-gw / 2, gh / 2, 0));
      b.addCylinder('goalPost', [0.06, 0.06, gh, 10], toW(gw / 2, gh / 2, 0));
      b.addCylinder('goalPost', [0.06, 0.06, gw + 0.12, 10], toW(0, gh, 0), [0, rotY, Math.PI / 2]);
      b.addBox('goalPost', [0.06, 0.06, gd], toW(-gw / 2, 0.03, -gd / 2), [0, rotY, 0]);
      b.addBox('goalPost', [0.06, 0.06, gd], toW(gw / 2, 0.03, -gd / 2), [0, rotY, 0]);
      b.addBox('goalPost', [gw, 0.06, 0.06], toW(0, 0.03, -gd), [0, rotY, 0]);

      const diagLen = Math.hypot(gh, gd);
      const diagPitch = Math.atan2(gd, gh);
      const stayEuler = new THREE.Euler(0, rotY, 0, 'YXZ');
      stayEuler.x = diagPitch;
      b.addCylinder('goalPost', [0.04, 0.04, diagLen, 8], toW(-gw / 2, gh / 2, -gd / 2), [stayEuler.x, stayEuler.y, stayEuler.z]);
      b.addCylinder('goalPost', [0.04, 0.04, diagLen, 8], toW(gw / 2, gh / 2, -gd / 2), [stayEuler.x, stayEuler.y, stayEuler.z]);
      b.addPlane('net', [gw, diagLen], toW(0, gh / 2, -gd / 2), [stayEuler.x, stayEuler.y, stayEuler.z]);
      b.addBox('net', [0.01, gh, gd], toW(-gw / 2, gh / 2, -gd / 2), [0, rotY, 0]);
      b.addBox('net', [0.01, gh, gd], toW(gw / 2, gh / 2, -gd / 2), [0, rotY, 0]);
    };

    const addBasketballHoop = (hx: number, hy: number, hz: number, rotY: number) => {
      const cos = Math.cos(rotY);
      const sin = Math.sin(rotY);
      const toW = (lx: number, ly: number, lz: number): [number, number, number] => [
        hx + lx * cos + lz * sin,
        hy + ly,
        hz - lx * sin + lz * cos,
      ];
      b.addCylinder('rail', [0.09, 0.11, 3.8, 10], toW(0, 1.9, -1.2));
      const armEuler = new THREE.Euler(-Math.PI / 4, rotY, 0, 'YXZ');
      b.addBox('rail', [0.12, 0.12, 1.4], toW(0, 3.3, -0.6), [armEuler.x, armEuler.y, armEuler.z]);
      b.addBox('rail', [0.8, 0.1, 0.2], toW(0, 3.35, -0.1), [0, rotY, 0]);
      b.addBox('backboard', [1.8, 1.05, 0.04], toW(0, 3.4, 0), [0, rotY, 0]);
      b.addBox('line', [0.59, 0.45, 0.005], toW(0, 3.3, 0.022), [0, rotY, 0]);

      const torus = new THREE.TorusGeometry(0.225, 0.02, 8, 16);
      b.addGeometry('rim', torus, toW(0, 3.05, 0.3), [Math.PI / 2, 0, 0]);
      torus.dispose();

      const netCone = new THREE.CylinderGeometry(0.22, 0.12, 0.45, 10, 1, true);
      b.addGeometry('net', netCone, toW(0, 2.85, 0.3));
      netCone.dispose();
    };

    // ========================================================
    // 1. REGULATION FOOTBALL / SOCCER PITCH
    // ========================================================
    const py = 0.095;
    b.addBox('turfDark', [pitchW, 0.02, pitchD], [pitchX, py - 0.015, pitchZ]);
    b.addBox('line', [0.12, 0.002, pitchD - 1.0], [pitchX - pitchW / 2 + 0.5, py + 0.002, pitchZ]);
    b.addBox('line', [0.12, 0.002, pitchD - 1.0], [pitchX + pitchW / 2 - 0.5, py + 0.002, pitchZ]);
    b.addBox('line', [pitchW - 1.0, 0.002, 0.12], [pitchX, py + 0.002, pitchZ - pitchD / 2 + 0.5]);
    b.addBox('line', [pitchW - 1.0, 0.002, 0.12], [pitchX, py + 0.002, pitchZ + pitchD / 2 - 0.5]);
    b.addBox('line', [pitchW - 1.0, 0.002, 0.12], [pitchX, py + 0.002, pitchZ]);

    const pitchCircle = new THREE.RingGeometry(4.44, 4.56, 32);
    b.addGeometry('line', pitchCircle, [pitchX, py + 0.002, pitchZ], [-Math.PI / 2, 0, 0]);
    pitchCircle.dispose();
    const spot20 = new THREE.CircleGeometry(0.2, 16);
    b.addGeometry('line', spot20, [pitchX, py + 0.002, pitchZ], [-Math.PI / 2, 0, 0]);

    for (const s of [-1, 1]) {
      b.addBox('line', [13.0, 0.002, 0.12], [pitchX, py + 0.002, pitchZ + s * (pitchD / 2 - 3.5)]);
      b.addBox('line', [0.12, 0.002, 3.0], [pitchX - 6.5, py + 0.002, pitchZ + s * (pitchD / 2 - 2.0)]);
      b.addBox('line', [0.12, 0.002, 3.0], [pitchX + 6.5, py + 0.002, pitchZ + s * (pitchD / 2 - 2.0)]);
    }

    addSoccerGoal(pitchX, py, pitchZ - pitchD / 2 + 0.5, 0);
    addSoccerGoal(pitchX, py, pitchZ + pitchD / 2 - 0.5, Math.PI);

    for (const [cx, cz] of [
      [-pitchW / 2 + 0.5, -pitchD / 2 + 0.5],
      [pitchW / 2 - 0.5, -pitchD / 2 + 0.5],
      [-pitchW / 2 + 0.5, pitchD / 2 - 0.5],
      [pitchW / 2 - 0.5, pitchD / 2 - 0.5],
    ]) {
      b.addCylinder('goalPost', [0.02, 0.02, 1.5, 8], [pitchX + cx, py + 0.75, pitchZ + cz]);
      b.addBox('flag', [0.32, 0.22, 0.01], [pitchX + cx + 0.16, py + 1.35, pitchZ + cz]);
    }
    addEnclosure(pitchX, py, pitchZ, pitchW + 0.6, pitchD + 0.6, 5.8);

    // ========================================================
    // 2. MULTI-SPORT COURT
    // ========================================================
    const cy = 0.095;
    b.addBox('apron', [apronW, 0.018, apronD], [courtX, cy - 0.016, courtZ]);
    b.addBox('concreteCourt', [courtW, 0.016, courtD], [courtX, cy - 0.006, courtZ]);

    b.addBox('line', [0.08, 0.002, courtD], [courtX - courtW / 2, cy + 0.004, courtZ]);
    b.addBox('line', [0.08, 0.002, courtD], [courtX + courtW / 2, cy + 0.004, courtZ]);
    b.addBox('line', [courtW, 0.002, 0.08], [courtX, cy + 0.004, courtZ - courtD / 2]);
    b.addBox('line', [courtW, 0.002, 0.08], [courtX, cy + 0.004, courtZ + courtD / 2]);
    b.addBox('line', [courtW, 0.002, 0.08], [courtX, cy + 0.004, courtZ]);

    const courtCircle = new THREE.RingGeometry(1.75, 1.83, 32);
    b.addGeometry('line', courtCircle, [courtX, cy + 0.004, courtZ], [-Math.PI / 2, 0, 0]);
    courtCircle.dispose();

    for (const s of [-1, 1]) {
      b.addBox('line', [4.9, 0.002, 0.08], [courtX, cy + 0.004, courtZ + s * (courtD / 2 - 5.8)]);
      b.addBox('line', [0.08, 0.002, 5.8], [courtX - 2.45, cy + 0.004, courtZ + s * (courtD / 2 - 2.9)]);
      b.addBox('line', [0.08, 0.002, 5.8], [courtX + 2.45, cy + 0.004, courtZ + s * (courtD / 2 - 2.9)]);
    }

    // Tennis net & posts
    b.addBox('net', [courtW + 0.4, 0.85, 0.04], [courtX, cy + 0.45, courtZ]);
    b.addCylinder('rail', [0.05, 0.05, 1.05, 8], [courtX - courtW / 2 - 0.2, cy + 0.5, courtZ]);
    b.addCylinder('rail', [0.05, 0.05, 1.05, 8], [courtX + courtW / 2 + 0.2, cy + 0.5, courtZ]);

    b.addBox('line', [courtW - 4.0, 0.002, 0.06], [courtX, cy + 0.004, courtZ - 6.4]);
    b.addBox('line', [courtW - 4.0, 0.002, 0.06], [courtX, cy + 0.004, courtZ + 6.4]);
    b.addBox('line', [0.06, 0.002, 12.8], [courtX, cy + 0.004, courtZ]);

    addBasketballHoop(courtX, cy, courtZ - courtD / 2 - 0.2, 0);
    addBasketballHoop(courtX, cy, courtZ + courtD / 2 + 0.2, Math.PI);
    addEnclosure(courtX, cy, courtZ, apronW + 0.2, apronD + 0.2, 5.8);

    // ========================================================
    // 3. REGULATION GRAND FOOTBALL STADIUM
    // ========================================================
    const sy = 0.08;
    b.addBox('turfBuffer', [stadiumW, 0.02, stadiumD], [stadiumX, sy - 0.015, stadiumZ]);

    const stripeLen = stadiumPitchD / 10;
    for (let sIdx = 0; sIdx < 10; sIdx++) {
      const sz = stadiumZ - stadiumPitchD / 2 + (sIdx + 0.5) * stripeLen;
      const bucket = sIdx % 2 === 0 ? 'turfDark' : 'turfLight';
      b.addBox(bucket, [stadiumPitchW, 0.02, stripeLen], [stadiumX, sy - 0.005, sz]);
    }

    b.addBox('line', [0.12, 0.002, stadiumPitchD - 1.0], [stadiumX - stadiumPitchW / 2 + 0.5, sy + 0.006, stadiumZ]);
    b.addBox('line', [0.12, 0.002, stadiumPitchD - 1.0], [stadiumX + stadiumPitchW / 2 - 0.5, sy + 0.006, stadiumZ]);
    b.addBox('line', [stadiumPitchW - 1.0, 0.002, 0.12], [stadiumX, sy + 0.006, stadiumZ - stadiumPitchD / 2 + 0.5]);
    b.addBox('line', [stadiumPitchW - 1.0, 0.002, 0.12], [stadiumX, sy + 0.006, stadiumZ + stadiumPitchD / 2 - 0.5]);
    b.addBox('line', [stadiumPitchW - 1.0, 0.002, 0.12], [stadiumX, sy + 0.006, stadiumZ]);

    const stadiumCircle = new THREE.RingGeometry(9.09, 9.21, 48);
    b.addGeometry('line', stadiumCircle, [stadiumX, sy + 0.006, stadiumZ], [-Math.PI / 2, 0, 0]);
    stadiumCircle.dispose();
    b.addGeometry('line', spot20, [stadiumX, sy + 0.006, stadiumZ], [-Math.PI / 2, 0, 0]);

    for (const s of [-1, 1]) {
      // Penalty area (34.0m x 15.0m)
      b.addBox('line', [34.0, 0.002, 0.12], [stadiumX, sy + 0.006, stadiumZ + s * (stadiumPitchD / 2 - 15.0)]);
      b.addBox('line', [0.12, 0.002, 15.0], [stadiumX - 17.0, sy + 0.006, stadiumZ + s * (stadiumPitchD / 2 - 7.5)]);
      b.addBox('line', [0.12, 0.002, 15.0], [stadiumX + 17.0, sy + 0.006, stadiumZ + s * (stadiumPitchD / 2 - 7.5)]);
      // Goal area (16.5m x 5.5m)
      b.addBox('line', [16.5, 0.002, 0.12], [stadiumX, sy + 0.006, stadiumZ + s * (stadiumPitchD / 2 - 5.5)]);
      b.addBox('line', [0.12, 0.002, 5.5], [stadiumX - 8.25, sy + 0.006, stadiumZ + s * (stadiumPitchD / 2 - 2.75)]);
      b.addBox('line', [0.12, 0.002, 5.5], [stadiumX + 8.25, sy + 0.006, stadiumZ + s * (stadiumPitchD / 2 - 2.75)]);
      // Penalty spot
      b.addGeometry('line', spot20, [stadiumX, sy + 0.006, stadiumZ + s * (stadiumPitchD / 2 - 11.0)], [-Math.PI / 2, 0, 0]);
    }
    spot20.dispose();

    const northArc = new THREE.RingGeometry(9.09, 9.21, 24, 1, Math.PI * 0.28, Math.PI * 0.44);
    b.addGeometry('line', northArc, [stadiumX, sy + 0.006, stadiumZ - stadiumPitchD / 2 + 11.0], [-Math.PI / 2, 0, 0]);
    northArc.dispose();

    const southArc = new THREE.RingGeometry(9.09, 9.21, 24, 1, Math.PI * 1.28, Math.PI * 0.44);
    b.addGeometry('line', southArc, [stadiumX, sy + 0.006, stadiumZ + stadiumPitchD / 2 - 11.0], [-Math.PI / 2, 0, 0]);
    southArc.dispose();

    const cornerArc = new THREE.RingGeometry(0.94, 1.06, 12, 1, 0, Math.PI / 2);
    for (const [cx, cz, rot] of [
      [-stadiumPitchW / 2 + 0.5, -stadiumPitchD / 2 + 0.5, 0],
      [stadiumPitchW / 2 - 0.5, -stadiumPitchD / 2 + 0.5, Math.PI / 2],
      [stadiumPitchW / 2 - 0.5, stadiumPitchD / 2 - 0.5, Math.PI],
      [-stadiumPitchW / 2 + 0.5, stadiumPitchD / 2 - 0.5, -Math.PI / 2],
    ]) {
      b.addGeometry('line', cornerArc, [stadiumX + cx, sy + 0.006, stadiumZ + cz], [-Math.PI / 2, 0, rot]);
    }
    cornerArc.dispose();

    addSoccerGoal(stadiumX, sy, stadiumZ - stadiumPitchD / 2 + 0.5, 0, 7.32, 2.44, 2.0);
    addSoccerGoal(stadiumX, sy, stadiumZ + stadiumPitchD / 2 - 0.5, Math.PI, 7.32, 2.44, 2.0);

    return b.buildAll();
  }, []);

  useEffect(() => () => disposeMergedMap(merged), [merged]);

  return (
    <group>
      {merged.turfDark && <mesh geometry={merged.turfDark} material={materials.turfDarkMat} receiveShadow raycast={NO_RAYCAST} />}
      {merged.turfLight && <mesh geometry={merged.turfLight} material={materials.turfLightMat} receiveShadow raycast={NO_RAYCAST} />}
      {merged.turfBuffer && <mesh geometry={merged.turfBuffer} material={materials.turfBufferMat} receiveShadow raycast={NO_RAYCAST} />}
      {merged.apron && <mesh geometry={merged.apron} material={materials.apronMat} receiveShadow raycast={NO_RAYCAST} />}
      {merged.concreteCourt && <mesh geometry={merged.concreteCourt} material={materials.concreteCourtMat} receiveShadow raycast={NO_RAYCAST} />}
      {merged.line && <mesh geometry={merged.line} material={materials.lineMat} raycast={NO_RAYCAST} />}
      {merged.post && <mesh geometry={merged.post} material={materials.postMat} castShadow raycast={NO_RAYCAST} />}
      {merged.rail && <mesh geometry={merged.rail} material={materials.railMat} castShadow raycast={NO_RAYCAST} />}
      {merged.wireMesh && <mesh geometry={merged.wireMesh} material={materials.wireMeshMat} raycast={NO_RAYCAST} />}
      {merged.goalPost && <mesh geometry={merged.goalPost} material={materials.goalPostMat} castShadow raycast={NO_RAYCAST} />}
      {merged.net && <mesh geometry={merged.net} material={materials.netMat} raycast={NO_RAYCAST} />}
      {merged.backboard && <mesh geometry={merged.backboard} material={materials.backboardMat} castShadow raycast={NO_RAYCAST} />}
      {merged.rim && <mesh geometry={merged.rim} material={materials.rimMat} castShadow raycast={NO_RAYCAST} />}
      {merged.flag && <mesh geometry={merged.flag} material={materials.flagMat} raycast={NO_RAYCAST} />}

      {/* Commemorative Monument / Stela placed outside near tennis courts */}
      <CommemorativeStela position={[courtX - apronW / 2 - 1.8, 0, courtZ]} rotationY={Math.PI / 2} />
    </group>
  );
}
