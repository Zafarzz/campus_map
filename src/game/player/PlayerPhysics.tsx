import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import type { RefObject } from 'react';
import { gameConfig } from '../config/gameConfig';

type Props = {
  bodyRef: RefObject<RapierRigidBody | null>;
};

/**
 * Dynamic capsule RigidBody for the first-person player.
 * Rotations are locked so the capsule remains upright on collisions.
 */
export function PlayerPhysics({ bodyRef }: Props) {
  const { spawnPosition, capsuleHalfHeight, capsuleRadius } = gameConfig.player;

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      colliders={false}
      position={spawnPosition}
      enabledRotations={[false, false, false]}
      ccd={true}
      linearDamping={0.2}
      canSleep={false}
    >
      <CapsuleCollider
        args={[capsuleHalfHeight, capsuleRadius]}
        friction={0}
        restitution={0}
      />
    </RigidBody>
  );
}
