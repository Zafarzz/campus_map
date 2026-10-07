import { Environment, Sky, SoftShadows } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { mapConfig } from '../../config/mapConfig';
import { useMap } from '../../state/MapProvider';
import { CameraController, cameraFraming } from './CameraController';
import { Campus } from './Campus';
import { ContextLayer } from './ContextLayer';
import { ReferenceOverlay } from './ReferenceOverlay';
import { Vegetation } from './Vegetation';

/** The 3D scene root. Composition only — no data logic. */
export function CampusMap() {
  const { geometry, selection, showReference } = useMap();
  const [initialPosition] = cameraFraming(geometry, {});

  return (
    <Canvas
      shadows
      camera={{ position: initialPosition, fov: mapConfig.camera.fov, near: 1, far: 3000 }}
      dpr={[1, 2]}
    >
      <color attach="background" args={['#d6e4f0']} />
      
      {/* Soft stylized lighting */}
      <SoftShadows size={20} samples={16} focus={0.5} />
      <ambientLight intensity={0.6} color="#ffffff" />
      <hemisphereLight args={['#ffffff', '#8d99ae', 0.5]} />
      
      {/* Sun Light */}
      <directionalLight 
        castShadow
        position={[150, 200, 100]} 
        intensity={1.5} 
        color="#fff5e6"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-300}
        shadow-camera-right={300}
        shadow-camera-top={300}
        shadow-camera-bottom={-300}
        shadow-camera-far={1000}
        shadow-bias={-0.0001}
      />

      <Sky sunPosition={[150, 200, 100]} turbidity={0.3} rayleigh={0.5} />
      <Environment preset="city" environmentIntensity={0.4} />

      <ContextLayer geometry={geometry} />
      <Vegetation geometry={geometry} />
      
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
