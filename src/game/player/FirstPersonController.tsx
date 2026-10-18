import { useFrame, useThree } from '@react-three/fiber';
import { useRapier, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { CampusGeometry } from '../../domain/geometry/types';
import {
  findNearestBuildingInRange,
  gameConfig,
  type PlayerTransformState,
} from '../config/gameConfig';
import type { PlayerInputState } from '../controls/DesktopControls';
import { PlayerPhysics } from './PlayerPhysics';

export type TeleportRequest = {
  position: [number, number, number];
  yaw: number;
  seq: number;
};

type Props = {
  inputRef: MutableRefObject<PlayerInputState>;
  playerTransformRef: MutableRefObject<PlayerTransformState>;
  geometry: CampusGeometry;
  isPlaying: boolean;
  teleportRequest: TeleportRequest;
  onNearestBuildingChange: (buildingId: string | null) => void;
};

/**
 * Frame-driven first-person controller:
 * - Smooth velocity acceleration/deceleration
 * - Dynamic sprint FOV transition & subtle ground head-bob
 * - Rapier ground raycast for responsive jumping
 * - Live playerTransformRef updates for Minimap & Wayfinding without per-frame React state updates
 */
export function FirstPersonController({
  inputRef,
  playerTransformRef,
  geometry,
  isPlaying,
  teleportRequest,
  onNearestBuildingChange,
}: Props) {
  const bodyRef = useRef<RapierRigidBody | null>(null);
  const { camera } = useThree();
  const { rapier, world } = useRapier();

  const yawRef = useRef<number>(gameConfig.player.spawnYaw);
  const pitchRef = useRef<number>(gameConfig.player.spawnPitch);
  const lastJumpTimeRef = useRef<number>(0);
  const headBobTimerRef = useRef<number>(0);
  const currentVelXZRef = useRef<{ x: number; z: number }>({ x: 0, z: 0 });
  const lastNearestBuildingRef = useRef<string | null>(null);
  const proximityCheckAccumRef = useRef<number>(0);
  const eulerRef = useRef<THREE.Euler>(new THREE.Euler(0, 0, 0, 'YXZ'));

  // Set initial camera orientation on mount
  useEffect(() => {
    eulerRef.current.set(pitchRef.current, yawRef.current, 0, 'YXZ');
    camera.quaternion.setFromEuler(eulerRef.current);
    const [sx, sy, sz] = gameConfig.player.spawnPosition;
    camera.position.set(sx, sy + gameConfig.player.eyeOffset, sz);
    playerTransformRef.current = { x: sx, y: sy, z: sz, yaw: yawRef.current };
  }, [camera, playerTransformRef]);

  // Handle explicit respawn / teleport requests from the UI
  useEffect(() => {
    if (teleportRequest.seq === 0) return;
    const body = bodyRef.current;
    const [tx, ty, tz] = teleportRequest.position;
    yawRef.current = teleportRequest.yaw;
    pitchRef.current = 0;
    currentVelXZRef.current = { x: 0, z: 0 };
    eulerRef.current.set(0, yawRef.current, 0, 'YXZ');
    camera.quaternion.setFromEuler(eulerRef.current);
    if (body) {
      body.setTranslation({ x: tx, y: ty, z: tz }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
    camera.position.set(tx, ty + gameConfig.player.eyeOffset, tz);
    playerTransformRef.current = { x: tx, y: ty, z: tz, yaw: yawRef.current };
  }, [teleportRequest, camera, playerTransformRef]);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body) return;

    const dt = Math.min(delta, 0.1);
    const input = inputRef.current;

    // 1. Apply accumulated camera look deltas
    if (isPlaying && (input.lookDeltaX !== 0 || input.lookDeltaY !== 0)) {
      yawRef.current += input.lookDeltaX;
      pitchRef.current = THREE.MathUtils.clamp(
        pitchRef.current + input.lookDeltaY,
        -gameConfig.camera.maxPitch,
        gameConfig.camera.maxPitch,
      );
      input.lookDeltaX = 0;
      input.lookDeltaY = 0;

      eulerRef.current.set(pitchRef.current, yawRef.current, 0, 'YXZ');
      camera.quaternion.setFromEuler(eulerRef.current);
    } else {
      input.lookDeltaX = 0;
      input.lookDeltaY = 0;
    }

    const pos = body.translation();
    const vel = body.linvel();

    // Safety respawn if player ever falls below terrain
    if (pos.y < gameConfig.player.minYRespawn) {
      const [sx, sy, sz] = gameConfig.player.spawnPosition;
      body.setTranslation({ x: sx, y: sy, z: sz }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      currentVelXZRef.current = { x: 0, z: 0 };
      camera.position.set(sx, sy + gameConfig.player.eyeOffset, sz);
      playerTransformRef.current = { x: sx, y: sy, z: sz, yaw: yawRef.current };
      return;
    }

    if (!isPlaying) {
      body.setLinvel({ x: 0, y: vel.y, z: 0 }, true);
      currentVelXZRef.current = { x: 0, z: 0 };
      camera.position.set(pos.x, pos.y + gameConfig.player.eyeOffset, pos.z);
      playerTransformRef.current = { x: pos.x, y: pos.y, z: pos.z, yaw: yawRef.current };
      return;
    }

    // 2. Combine keyboard and mobile joystick axes
    const keyFwd = (input.moveForward ? 1 : 0) - (input.moveBackward ? 1 : 0);
    const keyRight = (input.moveRight ? 1 : 0) - (input.moveLeft ? 1 : 0);

    let forwardAxis = keyFwd + input.touchForward;
    let rightAxis = keyRight + input.touchRight;

    const inputMag = Math.hypot(forwardAxis, rightAxis);
    if (inputMag > 1) {
      forwardAxis /= inputMag;
      rightAxis /= inputMag;
    }

    const isMoving = inputMag > 0.05;
    const isSprinting = isMoving && (input.keySprint || input.touchSprint);
    const speed = isSprinting ? gameConfig.player.sprintSpeed : gameConfig.player.walkSpeed;

    // Forward in Three.js for yaw around Y is (-sin(yaw), 0, -cos(yaw))
    const sinY = Math.sin(yawRef.current);
    const cosY = Math.cos(yawRef.current);
    const forwardX = -sinY;
    const forwardZ = -cosY;
    const rightX = cosY;
    const rightZ = -sinY;

    const desiredVelX = (forwardX * forwardAxis + rightX * rightAxis) * speed;
    const desiredVelZ = (forwardZ * forwardAxis + rightZ * rightAxis) * speed;

    // Smooth horizontal velocity acceleration/deceleration
    const lerpFactor = Math.min(1, dt * gameConfig.player.velocityLerpSpeed);
    currentVelXZRef.current.x = THREE.MathUtils.lerp(
      currentVelXZRef.current.x,
      desiredVelX,
      lerpFactor,
    );
    currentVelXZRef.current.z = THREE.MathUtils.lerp(
      currentVelXZRef.current.z,
      desiredVelZ,
      lerpFactor,
    );

    // 3. Ground detection & Jump
    const capsuleBottomOffset =
      gameConfig.player.capsuleHalfHeight + gameConfig.player.capsuleRadius;
    const ray = new rapier.Ray(
      { x: pos.x, y: pos.y, z: pos.z },
      { x: 0, y: -1, z: 0 },
    );
    const hit = world.castRay(
      ray,
      capsuleBottomOffset + 0.2,
      true,
      undefined,
      undefined,
      undefined,
      body,
    );
    const isGrounded =
      hit !== null || (Math.abs(vel.y) < 0.08 && pos.y <= capsuleBottomOffset + 0.15);

    let nextVelY = vel.y;
    const wantsJump = input.keyJump || input.touchJump;
    if (wantsJump && isGrounded) {
      const now = performance.now();
      if (now - lastJumpTimeRef.current >= gameConfig.player.jumpCooldownMs) {
        nextVelY = gameConfig.player.jumpVelocity;
        lastJumpTimeRef.current = now;
      }
    }

    body.setLinvel(
      { x: currentVelXZRef.current.x, y: nextVelY, z: currentVelXZRef.current.z },
      true,
    );

    // 4. Dynamic FOV transition during sprint
    if (camera instanceof THREE.PerspectiveCamera) {
      const targetFov = isSprinting ? gameConfig.camera.sprintFov : gameConfig.camera.fov;
      if (Math.abs(camera.fov - targetFov) > 0.05) {
        camera.fov = THREE.MathUtils.lerp(
          camera.fov,
          targetFov,
          Math.min(1, dt * gameConfig.camera.fovLerpSpeed),
        );
        camera.updateProjectionMatrix();
      }
    }

    // 5. Subtle camera head-bob while walking/running on ground
    let bobOffsetY = 0;
    const horizontalSpeed = Math.hypot(currentVelXZRef.current.x, currentVelXZRef.current.z);
    if (isGrounded && horizontalSpeed > 0.6) {
      const freqMult = isSprinting ? 1.35 : 1.0;
      headBobTimerRef.current += dt * gameConfig.player.headBobFrequency * freqMult;
      const speedRatio = Math.min(1, horizontalSpeed / gameConfig.player.walkSpeed);
      bobOffsetY =
        Math.sin(headBobTimerRef.current) * gameConfig.player.headBobAmplitude * speedRatio;
    } else {
      headBobTimerRef.current = 0;
    }

    // 6. Sync camera and live playerTransformRef
    const updatedPos = body.translation();
    camera.position.set(
      updatedPos.x,
      updatedPos.y + gameConfig.player.eyeOffset + bobOffsetY,
      updatedPos.z,
    );

    playerTransformRef.current.x = updatedPos.x;
    playerTransformRef.current.y = updatedPos.y;
    playerTransformRef.current.z = updatedPos.z;
    playerTransformRef.current.yaw = yawRef.current;

    // 7. Throttled building proximity check (runs 5 times/sec, updates React state only on change)
    proximityCheckAccumRef.current += dt;
    if (proximityCheckAccumRef.current >= 0.2) {
      proximityCheckAccumRef.current = 0;
      const nearest = findNearestBuildingInRange(updatedPos.x, updatedPos.z, geometry);
      const nextId = nearest ? nearest.buildingId : null;
      if (nextId !== lastNearestBuildingRef.current) {
        lastNearestBuildingRef.current = nextId;
        onNearestBuildingChange(nextId);
      }
    }
  });

  return <PlayerPhysics bodyRef={bodyRef} />;
}
