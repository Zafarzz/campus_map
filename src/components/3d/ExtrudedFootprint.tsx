import { Edges } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useMemo } from 'react';
import type * as THREE from 'three';
import type { Footprint } from '../../domain/geometry/types';
import { EXTRUDE_ROTATION, footprintOutline, useExtrudedGeometry } from './geometryUtils';

type Props = {
  footprint: Footprint;
  bottom: number;
  height: number;
  color: string;
  opacity?: number;
  edgeColor?: string;
  roughness?: number;
  metalness?: number;
  map?: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  normalScale?: [number, number];
  roughnessMap?: THREE.Texture | null;
  /** Disable raycasting so the mesh never steals clicks. */
  interactive?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
};

const noRaycast = () => null;

/** A footprint extruded vertically. Generic building block for buildings, slabs, context. */
export function ExtrudedFootprint({
  footprint,
  bottom,
  height,
  color,
  opacity = 1,
  edgeColor,
  roughness = 0.85,
  metalness = 0.04,
  map,
  normalMap,
  normalScale,
  roughnessMap,
  interactive = true,
  castShadow,
  receiveShadow,
  ...events
}: Props) {
  const outline = useMemo(() => footprintOutline(footprint), [footprint]);
  const geometry = useExtrudedGeometry(outline, height);
  const transparent = opacity < 1;

  return (
    <mesh
      geometry={geometry}
      rotation={EXTRUDE_ROTATION}
      position={[0, bottom, 0]}
      raycast={interactive ? undefined : noRaycast}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      {...events}
    >
      <meshStandardMaterial
        color={color}
        map={map ?? null}
        normalMap={normalMap ?? null}
        normalScale={normalScale}
        roughnessMap={roughnessMap ?? null}
        roughness={roughness}
        metalness={metalness}
        transparent={transparent}
        opacity={opacity}
        depthWrite={!transparent}
      />
      {edgeColor && (
        <Edges
          color={edgeColor}
          threshold={20}
          transparent
          opacity={transparent ? 0.5 : 0.65}
        />
      )}
    </mesh>
  );
}
