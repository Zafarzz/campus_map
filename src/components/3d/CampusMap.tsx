import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { mapConfig } from '../../config/mapConfig';
import { useMap } from '../../state/MapProvider';
import { CameraController, cameraFraming } from './CameraController';
import { Campus } from './Campus';
import { ContextLayer } from './ContextLayer';
import { ReferenceOverlay } from './ReferenceOverlay';

/** The 3D scene root. Composition only — no data logic. */
export function CampusMap() {
  const { geometry, selection, showReference } = useMap();
  const [initialPosition] = cameraFraming(geometry, {});

  return (
    <Canvas
      camera={{ position: initialPosition, fov: mapConfig.camera.fov, near: 1, far: 2000 }}
      dpr={[1, 2]}
    >
      <color attach="background" args={[mapConfig.colors.background]} />
      <ambientLight intensity={1.1} />
      <hemisphereLight args={['#ffffff', '#b9c4b0', 0.8]} />
      <directionalLight position={[80, 160, 60]} intensity={1.6} />
      <directionalLight position={[-60, 80, -100]} intensity={0.4} />

      <ContextLayer geometry={geometry} />
      {showReference && (
        <Suspense fallback={null}>
          <ReferenceOverlay />
        </Suspense>
      )}
      <Campus />
      <CameraController geometry={geometry} selection={selection} />
    </Canvas>
  );
}
