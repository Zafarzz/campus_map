import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useInteraction, type InteractableTarget } from './InteractionContext';

export interface RegisteredInteractable {
  id: string;
  type: 'door' | 'window' | 'fountain' | 'switch' | 'generic';
  prompt: (isOpen?: boolean) => string;
  position: [number, number, number];
  maxDistance?: number;
  isOpen?: boolean;
  onInteract: () => void;
}

// Global registry of interactables within Walk Mode
const interactableRegistry = new Map<string, RegisteredInteractable>();

export function registerInteractable(item: RegisteredInteractable) {
  interactableRegistry.set(item.id, item);
}

export function unregisterInteractable(id: string) {
  interactableRegistry.delete(id);
}

export function InteractionRaycaster({ isPlaying }: { isPlaying: boolean }) {
  const { camera } = useThree();
  const { setActiveTarget } = useInteraction();
  const raycaster = useRef(new THREE.Raycaster());
  const cameraDir = useRef(new THREE.Vector3());
  const targetPos = useRef(new THREE.Vector3());
  const toTarget = useRef(new THREE.Vector3());

  useFrame(() => {
    if (!isPlaying) {
      setActiveTarget(null);
      return;
    }

    camera.getWorldDirection(cameraDir.current);
    const camPos = camera.position;

    let closest: RegisteredInteractable | null = null;
    let closestDist = Infinity;

    for (const item of interactableRegistry.values()) {
      targetPos.current.set(...item.position);
      const dist = camPos.distanceTo(targetPos.current);
      const maxDist = item.maxDistance ?? 3.5;

      if (dist <= maxDist) {
        toTarget.current.subVectors(targetPos.current, camPos).normalize();
        const dot = cameraDir.current.dot(toTarget.current);
        // Field of view dot product check: looking roughly towards object (> 0.75, ~40deg cone)
        if (dot > 0.72 && dist < closestDist) {
          closestDist = dist;
          closest = item;
        }
      }
    }

    if (closest) {
      const target: InteractableTarget = {
        id: closest.id,
        type: closest.type,
        prompt: closest.prompt(closest.isOpen),
        distance: closestDist,
        onInteract: closest.onInteract,
      };
      setActiveTarget(target);
    } else {
      setActiveTarget(null);
    }
  });

  useEffect(() => {
    return () => {
      interactableRegistry.clear();
      setActiveTarget(null);
    };
  }, [setActiveTarget]);

  return null;
}
