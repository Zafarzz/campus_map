import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CharacterMesh } from '../character/CharacterMesh';

export interface Waypoint {
  id: string;
  x: number;
  z: number;
  neighbors: string[];
}

export const CAMPUS_WAYPOINTS: Waypoint[] = [
  // Eastern entrance and main promenade
  { id: 'wp-gate-east', x: 88, z: 15.9, neighbors: ['wp-promenade-1', 'wp-promenade-f-south'] },
  { id: 'wp-promenade-1', x: 65, z: 15.9, neighbors: ['wp-gate-east', 'wp-promenade-2', 'wp-bld-b-approach'] },
  { id: 'wp-promenade-2', x: 42, z: 15.9, neighbors: ['wp-promenade-1', 'wp-fountain-east', 'wp-amph-approach'] },
  // Fountain plaza walkways
  { id: 'wp-fountain-east', x: 20, z: 15.9, neighbors: ['wp-promenade-2', 'wp-fountain-bridge-e', 'wp-spine-south'] },
  { id: 'wp-fountain-bridge-e', x: 12.8, z: -13.5, neighbors: ['wp-fountain-east', 'wp-fountain-north'] },
  { id: 'wp-fountain-bridge-w', x: -12.8, z: -13.5, neighbors: ['wp-fountain-west', 'wp-fountain-north'] },
  { id: 'wp-fountain-north', x: 0, z: -28.0, neighbors: ['wp-fountain-bridge-e', 'wp-fountain-bridge-w', 'wp-north-quad'] },
  { id: 'wp-fountain-west', x: -20, z: 15.9, neighbors: ['wp-fountain-bridge-w', 'wp-promenade-west'] },
  { id: 'wp-promenade-west', x: -45, z: 15.9, neighbors: ['wp-fountain-west', 'wp-dorm-approach'] },
  // Academic Spine (connecting Block C, B, A)
  { id: 'wp-bld-b-approach', x: 69, z: 35, neighbors: ['wp-promenade-1', 'wp-bld-a-spine'] },
  { id: 'wp-spine-south', x: 20, z: 45, neighbors: ['wp-fountain-east', 'wp-bld-a-spine', 'wp-amph-approach'] },
  { id: 'wp-bld-a-spine', x: 20.5, z: 65, neighbors: ['wp-spine-south', 'wp-amph-approach', 'wp-bld-b-approach'] },
  { id: 'wp-amph-approach', x: 40, z: 65, neighbors: ['wp-bld-a-spine', 'wp-promenade-2', 'wp-spine-south'] },
  // North courtyard & Library promenade
  { id: 'wp-promenade-f-south', x: 88, z: -25, neighbors: ['wp-gate-east', 'wp-library-entrance'] },
  { id: 'wp-library-entrance', x: 88, z: -53, neighbors: ['wp-promenade-f-south', 'wp-north-quad'] },
  { id: 'wp-north-quad', x: 30, z: -65, neighbors: ['wp-library-entrance', 'wp-fountain-north', 'wp-bld-n-approach'] },
  { id: 'wp-bld-n-approach', x: -14, z: -90, neighbors: ['wp-north-quad'] },
  // Dormitory quad
  { id: 'wp-dorm-approach', x: -55.5, z: 50, neighbors: ['wp-promenade-west', 'wp-dorm-quad'] },
  { id: 'wp-dorm-quad', x: -55.5, z: 95, neighbors: ['wp-dorm-approach'] },
];

const WAYPOINT_MAP = new Map<string, Waypoint>(CAMPUS_WAYPOINTS.map((w) => [w.id, w]));

interface NPCState {
  id: string;
  x: number;
  z: number;
  currentWaypointId: string;
  targetWaypointId: string;
  speed: number;
  pauseTimer: number;
  yaw: number;
  shirtColor: string;
  pantsColor: string;
  skinColor: string;
  hairColor: string;
  hairStyle: 'short' | 'medium' | 'long';
}

function createInitialNPCs(count: number): NPCState[] {
  const shirts = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#475569', '#be123c'];
  const pants = ['#1e293b', '#334155', '#475569', '#172554', '#1f2937'];
  const hairs = ['#1e1b4b', '#451a03', '#78350f', '#0f172a', '#a16207'];
  const styles: ('short' | 'medium' | 'long')[] = ['short', 'medium', 'long'];

  const npcs: NPCState[] = [];
  const waypoints = CAMPUS_WAYPOINTS;

  for (let i = 0; i < count; i++) {
    const startWp = waypoints[i % waypoints.length];
    const targetId = startWp.neighbors[0] ?? startWp.id;
    const targetWp = WAYPOINT_MAP.get(targetId) || startWp;

    const angle = Math.atan2(targetWp.x - startWp.x, targetWp.z - startWp.z);

    npcs.push({
      id: `npc-${i}`,
      x: startWp.x + (Math.random() - 0.5) * 1.5,
      z: startWp.z + (Math.random() - 0.5) * 1.5,
      currentWaypointId: startWp.id,
      targetWaypointId: targetId,
      speed: 1.8 + Math.random() * 0.8,
      pauseTimer: Math.random() * 4,
      yaw: angle,
      shirtColor: shirts[i % shirts.length],
      pantsColor: pants[i % pants.length],
      skinColor: '#fed7aa',
      hairColor: hairs[i % hairs.length],
      hairStyle: styles[i % styles.length],
    });
  }

  return npcs;
}

export function NPCManager({ count = 8, isPlaying = true }: { count?: number; isPlaying?: boolean }) {
  const npcsRef = useRef<NPCState[]>(createInitialNPCs(count));
  const groupsRef = useRef<(THREE.Group | null)[]>([]);

  // Keep NPC list matched to requested count
  if (npcsRef.current.length !== count) {
    npcsRef.current = createInitialNPCs(count);
  }

  useFrame((_, delta) => {
    if (!isPlaying) return;
    const dt = Math.min(delta, 0.1);

    npcsRef.current.forEach((npc, idx) => {
      const group = groupsRef.current[idx];
      if (!group) return;

      if (npc.pauseTimer > 0) {
        npc.pauseTimer -= dt;
        return;
      }

      const targetWp = WAYPOINT_MAP.get(npc.targetWaypointId);
      if (!targetWp) return;

      const dx = targetWp.x - npc.x;
      const dz = targetWp.z - npc.z;
      const dist = Math.hypot(dx, dz);

      if (dist < 1.0) {
        // Reached target waypoint, pick next neighbor
        npc.currentWaypointId = npc.targetWaypointId;
        const currentWp = targetWp;
        const neighbors = currentWp.neighbors;
        if (neighbors.length > 0) {
          const nextTarget = neighbors[Math.floor(Math.random() * neighbors.length)];
          npc.targetWaypointId = nextTarget;
        }
        // Random pause between stops
        if (Math.random() < 0.35) {
          npc.pauseTimer = 2.0 + Math.random() * 5.0;
        }
      } else {
        // Move towards target
        const dirX = dx / dist;
        const dirZ = dz / dist;
        npc.x += dirX * npc.speed * dt;
        npc.z += dirZ * npc.speed * dt;

        // Smooth rotation towards travel direction
        const targetYaw = Math.atan2(dirX, dirZ);
        npc.yaw = THREE.MathUtils.damp(npc.yaw, targetYaw, 6, dt);
      }

      group.position.set(npc.x, 0, npc.z);
      group.rotation.set(0, npc.yaw, 0);
    });
  });

  return (
    <group name="npc-manager">
      {npcsRef.current.map((npc, idx) => (
        <group
          key={npc.id}
          ref={(el) => {
            groupsRef.current[idx] = el;
          }}
          position={[npc.x, 0, npc.z]}
          rotation={[0, npc.yaw, 0]}
        >
          <CharacterMesh
            shirtColor={npc.shirtColor}
            pantsColor={npc.pantsColor}
            skinColor={npc.skinColor}
            hairColor={npc.hairColor}
            hairStyle={npc.hairStyle}
            isMoving={npc.pauseTimer <= 0}
            speed={npc.speed / 2.0}
            scale={0.96}
          />
        </group>
      ))}
    </group>
  );
}
