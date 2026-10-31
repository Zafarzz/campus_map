import type { CameraControls } from '@react-three/drei';
import { addAfterEffect, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, type ComponentRef } from 'react';
import * as THREE from 'three';
import type { CampusGeometry, Vec3 } from '../domain/geometry/types';
import { cinematic, runtime, useCinematic } from './cinematicStore';
import { samplePathAtTime, totalDuration, type Pose } from './pathMath';
import { resolveLockPoint } from './presets';
import { recorderEngine } from './recorder';

type Controls = ComponentRef<typeof CameraControls>;

/** Seconds for the smooth hand-over from the user's camera into the path when playback starts. */
const BLEND_SECONDS = 1.1;
const MAX_BANK = THREE.MathUtils.degToRad(14);
const FREE_BASE_SPEED = 28; // m/s
const smoothstep = (x: number) => x * x * (3 - 2 * x);

type SavedCamera = {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  minDistance: number;
  maxDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  enabled: boolean;
};

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

/**
 * Drives the *existing* drei CameraControls (single camera controller — no duplicates).
 *
 *  - While Cinematic Mode is open the controls' distance / polar limits are lifted and restored on close.
 *  - While a shot plays (or in free flight) user input to the controls is disabled; the pose is pushed
 *    through `controls.setLookAt(..., false)` in a `useFrame` loop using delta time.
 *  - Everything per-frame lives in refs / `runtime` so playback causes no React re-renders.
 */
export function CinematicCameraController({ geometry }: { geometry: CampusGeometry }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as Controls | null;
  const open = useCinematic((s) => s.open);

  const saved = useRef<SavedCamera | null>(null);
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;

  // per-frame scratch state
  const f = useRef({
    driving: false,
    freeActive: false,
    blend: null as null | { t: number; fromPos: THREE.Vector3; fromTarget: THREE.Vector3 },
    prevPos: null as THREE.Vector3 | null,
    prevHeading: null as number | null,
    turnRate: 0,
    bank: 0,
    look: null as null | { target: THREE.Vector3; roll: number },
    // free flight
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    yawT: 0,
    pitchT: 0,
    speedMul: 1,
    keys: new Set<string>(),
    drag: false,
    prevYaw: 0,
  });

  // ---- recording bridge: copy the WebGL frame right after every render -------------------
  useEffect(() => {
    recorderEngine.setSource(gl.domElement);
    const off = addAfterEffect(() => {
      if (recorderEngine.active) recorderEngine.capture();
    });
    return () => {
      off();
      recorderEngine.setSource(null);
    };
  }, [gl]);

  // ---- save / restore the user's camera when cinematic mode opens / closes ----------------
  useEffect(() => {
    if (!controls || !open) return;
    const target = controls.getTarget(new THREE.Vector3());
    saved.current = {
      position: camera.position.clone(),
      target,
      fov: camera.fov,
      minDistance: controls.minDistance,
      maxDistance: controls.maxDistance,
      minPolarAngle: controls.minPolarAngle,
      maxPolarAngle: controls.maxPolarAngle,
      enabled: controls.enabled,
    };
    // Lift the map-navigation limits so shots (top-down, low tracking, far flyovers) are not clamped.
    controls.minDistance = 0.5;
    controls.maxDistance = 5000;
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;

    runtime.api = {
      getPose: () => {
        const st = f.current;
        if (st.freeActive) {
          const fwd = camera.getWorldDirection(new THREE.Vector3());
          const t = camera.position.clone().addScaledVector(fwd, 40);
          return { position: camera.position.toArray() as Vec3, target: t.toArray() as Vec3, fov: camera.fov };
        }
        return {
          position: camera.position.toArray() as Vec3,
          target: controls.getTarget(new THREE.Vector3()).toArray() as Vec3,
          fov: camera.fov,
        };
      },
      flyTo: (p, t, smooth) => {
        void controls.setLookAt(p[0], p[1], p[2], t[0], t[1], t[2], smooth);
      },
      defaultFov: () => saved.current?.fov ?? camera.fov,
    };

    return () => {
      const s = saved.current;
      saved.current = null;
      runtime.api = null;
      f.current.driving = false;
      f.current.freeActive = false;
      f.current.blend = null;
      f.current.look = null;
      if (!s) return;
      controls.minDistance = s.minDistance;
      controls.maxDistance = s.maxDistance;
      controls.minPolarAngle = s.minPolarAngle;
      controls.maxPolarAngle = s.maxPolarAngle;
      controls.enabled = true;
      camera.fov = s.fov;
      camera.updateProjectionMatrix();
      camera.lookAt(controls.getTarget(new THREE.Vector3()));
      void controls.setLookAt(
        s.position.x, s.position.y, s.position.z, s.target.x, s.target.y, s.target.z, true,
      );
    };
  }, [controls, open, camera]);

  // ---- interruption: any manual mouse / wheel input on the canvas pauses playback ---------
  useEffect(() => {
    if (!open) return;
    const el = gl.domElement;
    const interrupt = () => {
      if (cinematic.getState().status === 'playing') cinematic.pause();
    };
    el.addEventListener('pointerdown', interrupt);
    el.addEventListener('wheel', interrupt, { passive: true });
    return () => {
      el.removeEventListener('pointerdown', interrupt);
      el.removeEventListener('wheel', interrupt);
    };
  }, [open, gl]);

  // ---- free flight input -------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    const el = gl.domElement;
    const st = f.current;
    const down = (e: KeyboardEvent) => {
      if (!cinematic.getState().freeFlight || isTyping(e.target)) return;
      if (e.code.startsWith('Key') || e.code.startsWith('Shift') || e.code.startsWith('Arrow')) {
        st.keys.add(e.code);
        if (e.code.startsWith('Arrow')) e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => void st.keys.delete(e.code);
    const blur = () => st.keys.clear();
    const pdown = (e: PointerEvent) => {
      if (!cinematic.getState().freeFlight) return;
      st.drag = true;
      el.setPointerCapture(e.pointerId);
    };
    const pmove = (e: PointerEvent) => {
      if (!st.drag) return;
      st.yawT += e.movementX * 0.0035;
      st.pitchT = THREE.MathUtils.clamp(st.pitchT - e.movementY * 0.0035, -1.5, 1.5);
    };
    const pup = (e: PointerEvent) => {
      st.drag = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    const wheel = (e: WheelEvent) => {
      if (!cinematic.getState().freeFlight) return;
      st.speedMul = THREE.MathUtils.clamp(st.speedMul * Math.exp(-e.deltaY * 0.001), 0.1, 10);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    el.addEventListener('pointerdown', pdown);
    el.addEventListener('pointermove', pmove);
    el.addEventListener('pointerup', pup);
    el.addEventListener('pointercancel', pup);
    el.addEventListener('wheel', wheel, { passive: true });
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      el.removeEventListener('pointerdown', pdown);
      el.removeEventListener('pointermove', pmove);
      el.removeEventListener('pointerup', pup);
      el.removeEventListener('pointercancel', pup);
      el.removeEventListener('wheel', wheel);
      st.keys.clear();
    };
  }, [open, gl]);

  // ---- main loop (before CameraControls.update, priority -1) ------------------------------
  useFrame((_, delta) => {
    const c = controls;
    const s = cinematic.getState();
    if (!c || !s.open) return;
    const dt = Math.min(delta, 0.1);
    const st = f.current;

    if (Math.abs(camera.fov - s.path.fov) > 1e-3) {
      camera.fov = s.path.fov;
      camera.updateProjectionMatrix();
    }

    const free = s.freeFlight;
    const playing = s.status === 'playing' && !free;
    const wantsLock = playing || free;

    // hand input over / back to the navigation controls exactly on transitions
    if (wantsLock !== (st.driving || st.freeActive)) {
      c.enabled = !wantsLock;
      if (!wantsLock) {
        // leaving a driven state: drop banking so the horizon is level again
        if (st.driving) st.look = { target: c.getTarget(new THREE.Vector3()), roll: 0 };
        st.bank = 0;
      }
    }
    st.driving = playing;

    if (free) {
      if (!st.freeActive) {
        st.freeActive = true;
        camera.getWorldDirection(st.vel); // reuse as scratch
        st.yaw = st.yawT = Math.atan2(st.vel.x, -st.vel.z);
        st.pitch = st.pitchT = Math.asin(THREE.MathUtils.clamp(st.vel.y, -1, 1));
        st.prevYaw = st.yaw;
        st.pos.copy(camera.position);
        st.vel.set(0, 0, 0);
      }
      freeFlightStep(c, dt, s.settings.speed);
      return;
    }
    if (st.freeActive) {
      st.freeActive = false;
      // continue user navigation from where the flight ended
      const fwd = camera.getWorldDirection(new THREE.Vector3());
      const t = camera.position.clone().addScaledVector(fwd, 60);
      void c.setLookAt(camera.position.x, camera.position.y, camera.position.z, t.x, t.y, t.z, false);
      st.look = { target: t, roll: 0 };
    }

    if (playing) {
      const total = totalDuration(s.path.keyframes);
      if (runtime.blendIn) {
        runtime.blendIn = false;
        st.blend = { t: 0, fromPos: camera.position.clone(), fromTarget: c.getTarget(new THREE.Vector3()) };
        st.prevPos = null;
      }
      if (runtime.discontinuity) {
        runtime.discontinuity = false;
        st.prevPos = null;
        st.prevHeading = null;
        st.turnRate = 0;
        runtime.applyPending = null;
      }
      runtime.time += dt * s.settings.speed;
      let ended = false;
      if (runtime.time >= total) {
        if (s.path.loop && total > 0) {
          runtime.time %= total;
          st.prevPos = null;
          st.prevHeading = null;
        } else {
          runtime.time = total;
          ended = true;
        }
      }
      const pose = poseAt(runtime.time);
      if (pose) {
        const pos = new THREE.Vector3(...pose.position);
        const tgt = new THREE.Vector3(...pose.target);
        if (st.blend) {
          st.blend.t += dt / BLEND_SECONDS;
          const k = smoothstep(Math.min(1, st.blend.t));
          pos.lerpVectors(st.blend.fromPos, pos, k);
          tgt.lerpVectors(st.blend.fromTarget, tgt, k);
          if (st.blend.t >= 1) st.blend = null;
        }
        // subtle banking from the turn rate of the flight direction
        let roll = THREE.MathUtils.degToRad(pose.roll);
        if (s.settings.banking && st.prevPos && dt > 0) {
          const vx = pos.x - st.prevPos.x;
          const vz = pos.z - st.prevPos.z;
          if (Math.hypot(vx, vz) / dt > 0.8) {
            const heading = Math.atan2(vx, vz);
            if (st.prevHeading !== null) {
              let dh = heading - st.prevHeading;
              dh = Math.atan2(Math.sin(dh), Math.cos(dh));
              st.turnRate = THREE.MathUtils.damp(st.turnRate, dh / dt, 6, dt);
            }
            st.prevHeading = heading;
          }
        }
        const bankTarget = s.settings.banking
          ? THREE.MathUtils.clamp(st.turnRate * 0.35, -MAX_BANK, MAX_BANK)
          : 0;
        st.bank = THREE.MathUtils.damp(st.bank, bankTarget, 3, dt);
        roll += st.bank;
        st.prevPos = pos.clone();
        void c.setLookAt(pos.x, pos.y, pos.z, tgt.x, tgt.y, tgt.z, false);
        st.look = { target: tgt, roll };
      }
      if (ended) cinematic.playbackEnded();
      return;
    }

    // not playing: apply one-shot requests (scrub / go-to-start after Stop)
    const req = runtime.applyPending;
    if (req) {
      runtime.applyPending = null;
      const pose = poseAt(runtime.time);
      if (pose) {
        const [px, py, pz] = pose.position;
        const [tx, ty, tz] = pose.target;
        void c.setLookAt(px, py, pz, tx, ty, tz, req === 'smooth');
        st.look = { target: new THREE.Vector3(tx, ty, tz), roll: req === 'snap' ? THREE.MathUtils.degToRad(pose.roll) : 0 };
      }
    }
  }, -2);

  /** Pose for the playhead including height offset and look-at lock. */
  function poseAt(t: number): Pose | null {
    const s = cinematic.getState();
    const pose = samplePathAtTime(s.path, t);
    if (!pose) return null;
    const lock = resolveLockPoint(geometryRef.current, s.path.lockTarget);
    return {
      position: [pose.position[0], pose.position[1] + s.settings.heightOffset, pose.position[2]],
      target: lock ?? pose.target,
      roll: pose.roll,
    };
  }

  function freeFlightStep(c: Controls, dt: number, speedSetting: number) {
    const st = f.current;
    st.yaw = THREE.MathUtils.damp(st.yaw, st.yawT, 12, dt);
    st.pitch = THREE.MathUtils.damp(st.pitch, st.pitchT, 12, dt);
    const cp = Math.cos(st.pitch);
    const fwd = new THREE.Vector3(Math.sin(st.yaw) * cp, Math.sin(st.pitch), -Math.cos(st.yaw) * cp);
    const right = new THREE.Vector3(Math.cos(st.yaw), 0, Math.sin(st.yaw));
    const k = st.keys;
    const axis = (pos: string, neg: string) => (k.has(pos) ? 1 : 0) - (k.has(neg) ? 1 : 0);
    const desired = new THREE.Vector3()
      .addScaledVector(fwd, axis('KeyW', 'KeyS') + axis('ArrowUp', 'ArrowDown'))
      .addScaledVector(right, axis('KeyD', 'KeyA') + axis('ArrowRight', 'ArrowLeft'))
      .addScaledVector(new THREE.Vector3(0, 1, 0), axis('KeyE', 'KeyQ'));
    if (desired.lengthSq() > 0) desired.normalize();
    const fast = k.has('ShiftLeft') || k.has('ShiftRight') ? 3 : 1;
    desired.multiplyScalar(FREE_BASE_SPEED * st.speedMul * speedSetting * fast);
    // exponential smoothing = natural acceleration / deceleration, frame-rate independent
    st.vel.x = THREE.MathUtils.damp(st.vel.x, desired.x, 3, dt);
    st.vel.y = THREE.MathUtils.damp(st.vel.y, desired.y, 3, dt);
    st.vel.z = THREE.MathUtils.damp(st.vel.z, desired.z, 3, dt);
    st.pos.addScaledVector(st.vel, dt);
    st.pos.y = Math.max(st.pos.y, 1);
    const yawRate = dt > 0 ? (st.yaw - st.prevYaw) / dt : 0;
    st.prevYaw = st.yaw;
    st.turnRate = THREE.MathUtils.damp(st.turnRate, yawRate, 6, dt);
    const bankTarget = cinematic.getState().settings.banking
      ? THREE.MathUtils.clamp(-st.turnRate * 0.18, -MAX_BANK, MAX_BANK)
      : 0;
    st.bank = THREE.MathUtils.damp(st.bank, bankTarget, 3, dt);
    const tgt = st.pos.clone().addScaledVector(fwd, 50);
    void c.setLookAt(st.pos.x, st.pos.y, st.pos.z, tgt.x, tgt.y, tgt.z, false);
    st.look = { target: tgt, roll: st.bank };
  }

  // ---- after CameraControls.update (priority -1): orientation incl. roll ------------------
  useFrame(() => {
    const st = f.current;
    if (!st.look) return;
    camera.lookAt(st.look.target);
    if (st.look.roll) camera.rotateZ(st.look.roll);
    // keep re-applying only while we own the camera; one-shot otherwise
    if (!st.driving && !st.freeActive) st.look = null;
  }, 0);

  return null;
}
