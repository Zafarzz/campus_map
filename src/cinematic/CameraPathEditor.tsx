import { Html, Line, TransformControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Vec3 } from '../domain/geometry/types';
import { cinematic, useCinematic } from './cinematicStore';
import { samplePolyline, type Keyframe } from './pathMath';

const PATH_COLOR = '#f59e0b';
const SELECTED_COLOR = '#38bdf8';

function Marker({ kf, index, selected }: { kf: Keyframe; index: number; selected: boolean }) {
  const group = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);

  // keep the marker a roughly constant size on screen
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const d = camera.position.distanceTo(g.position);
    g.scale.setScalar(THREE.MathUtils.clamp(d * 0.018, 0.8, 14));
  });

  useEffect(() => {
    group.current?.lookAt(...kf.target);
  }, [kf.position, kf.target]);

  return (
    <group
      ref={group}
      position={kf.position}
      onClick={(e) => {
        e.stopPropagation();
        cinematic.select(kf.id);
      }}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <mesh renderOrder={1000}>
        <sphereGeometry args={[1.1, 20, 14]} />
        <meshBasicMaterial color={selected ? SELECTED_COLOR : PATH_COLOR} depthTest={false} transparent opacity={0.95} />
      </mesh>
      {/* view direction */}
      <mesh position={[0, 0, 2.4]} rotation={[Math.PI / 2, 0, 0]} renderOrder={1000}>
        <coneGeometry args={[0.8, 2.2, 14]} />
        <meshBasicMaterial color={selected ? SELECTED_COLOR : PATH_COLOR} depthTest={false} transparent opacity={0.9} />
      </mesh>
      <Html center distanceFactor={undefined} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`cine-marker${selected ? ' cine-marker--sel' : ''}`}>{index + 1}</div>
      </Html>
    </group>
  );
}

function Gizmo({ kf, editTarget }: { kf: Keyframe; editTarget: boolean }) {
  const [obj, setObj] = useState<THREE.Object3D | null>(null);
  const point: Vec3 = editTarget ? kf.target : kf.position;
  const camera = useThree((s) => s.camera);
  const size = useRef<THREE.Group>(null);

  useFrame(() => {
    if (size.current) size.current.scale.setScalar(THREE.MathUtils.clamp(camera.position.distanceTo(size.current.position) * 0.012, 0.6, 10));
  });

  return (
    <>
      <group ref={size} position={point}>
        {editTarget && (
          <mesh renderOrder={1000}>
            <octahedronGeometry args={[1.3]} />
            <meshBasicMaterial color={SELECTED_COLOR} depthTest={false} wireframe />
          </mesh>
        )}
      </group>
      <object3D ref={setObj} position={point} />
      {obj && (
        <TransformControls
          object={obj}
          mode="translate"
          size={0.9}
          onObjectChange={() => {
            const p = obj.position.toArray() as Vec3;
            cinematic.updateKeyframe(kf.id, editTarget ? { target: p } : { position: p });
          }}
        />
      )}
    </>
  );
}

/**
 * In-scene visualisation + editing of the camera path: spline curve, keyframe markers (click to
 * select), view-direction line and a translate gizmo for the selected keyframe's position or target.
 * Hidden while playing / recording so it never ends up in footage.
 */
export function CameraPathEditor() {
  const open = useCinematic((s) => s.open);
  const status = useCinematic((s) => s.status);
  const free = useCinematic((s) => s.freeFlight);
  const recording = useCinematic((s) => s.rec.phase === 'recording');
  const showPath = useCinematic((s) => s.settings.showPath);
  const keyframes = useCinematic((s) => s.path.keyframes);
  const smoothness = useCinematic((s) => s.path.smoothness);
  const selectedId = useCinematic((s) => s.selectedId);
  const editTarget = useCinematic((s) => s.editTarget);
  const heightOffset = useCinematic((s) => s.settings.heightOffset);

  const points = useMemo(() => samplePolyline(keyframes, smoothness, 24), [keyframes, smoothness]);
  const selected = keyframes.find((k) => k.id === selectedId) ?? null;

  if (!open || !showPath || status === 'playing' || recording || free || keyframes.length === 0) return null;

  return (
    <group position={[0, heightOffset, 0]}>
      {points.length >= 2 && (
        <Line points={points} color={PATH_COLOR} lineWidth={3} depthTest={false} renderOrder={999} transparent opacity={0.9} />
      )}
      {keyframes.map((k, i) => (
        <Marker key={k.id} kf={k} index={i} selected={k.id === selectedId} />
      ))}
      {selected && (
        <>
          <Line
            points={[selected.position, selected.target]}
            color={SELECTED_COLOR}
            lineWidth={1.5}
            dashed
            dashSize={2}
            gapSize={1.5}
            depthTest={false}
            renderOrder={999}
          />
          <Gizmo key={`${selected.id}-${editTarget}`} kf={selected} editTarget={editTarget} />
        </>
      )}
    </group>
  );
}
