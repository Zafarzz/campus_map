import { AdaptiveDpr, BakeShadows, Sky, SoftShadows, Stats } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import * as THREE from 'three';
import { mapConfig } from '../../config/mapConfig';
import { useMap } from '../../state/MapProvider';
import { CameraController, cameraFraming } from './CameraController';
import { Campus } from './Campus';
import { ContextLayer } from './ContextLayer';
import { ReferenceOverlay } from './ReferenceOverlay';
import { Vegetation } from './Vegetation';
import { useVisualTuning } from './tuning/useVisualTuning';

/**
 * The 3D scene root.
 * Integrated with Leva real-time visual tuning and selective Drei helpers
 * (SoftShadows, Sky, AdaptiveDpr, BakeShadows, Stats).
 */
export function CampusMap() {
  const { geometry, selection, showReference } = useMap();
  const [initialPosition] = cameraFraming(geometry, {});
  const tuning = useVisualTuning();

  return (
    <Canvas
      shadows={{ type: THREE.PCFSoftShadowMap }}
      camera={{ position: initialPosition, fov: mapConfig.camera.fov, near: 1, far: 3000 }}
      dpr={[1, 2]}
    >
      <color attach="background" args={[tuning.backgroundColor]} />
      {tuning.fogEnabled && (
        <fog attach="fog" args={[tuning.fogColor, tuning.fogNear, tuning.fogFar]} />
      )}

      {/* Drei Selective Performance Helpers */}
      {tuning.adaptiveDpr && <AdaptiveDpr pixelated={false} />}
      {tuning.bakeShadows && <BakeShadows />}
      {tuning.showStats && <Stats />}

      {/* Soft contact shadow filter */}
      {tuning.shadowsEnabled && (
        <SoftShadows size={tuning.softShadowSize} samples={tuning.softShadowSamples} focus={0.5} />
      )}

      {/* Atmospheric Ambient and Hemisphere Fill */}
      <ambientLight intensity={tuning.ambientIntensity} color={tuning.ambientColor} />
      <hemisphereLight
        args={[tuning.hemisphereSkyColor, tuning.hemisphereGroundColor, tuning.hemisphereIntensity]}
      />

      {/* Natural Directional Sun Light */}
      <directionalLight
        castShadow={tuning.shadowsEnabled}
        position={tuning.sunPosition}
        intensity={tuning.sunIntensity}
        color={tuning.sunColor}
        shadow-mapSize={[tuning.shadowMapSize, tuning.shadowMapSize]}
        shadow-camera-left={-300}
        shadow-camera-right={300}
        shadow-camera-top={300}
        shadow-camera-bottom={-300}
        shadow-camera-near={10}
        shadow-camera-far={1000}
        shadow-bias={tuning.shadowBias}
        shadow-normalBias={tuning.shadowNormalBias}
      />

      {/* Secondary subtle ground bounce / fill light */}
      <directionalLight position={[-120, 80, -100]} intensity={tuning.fillLightIntensity} color="#e2e8f0" />

      {/* Procedural Physical Sky (No external CDN network dependency) */}
      <Sky
        sunPosition={tuning.sunPosition}
        turbidity={tuning.skyTurbidity}
        rayleigh={tuning.skyRayleigh}
        mieCoefficient={tuning.skyMieCoefficient}
        mieDirectionalG={tuning.skyMieDirectionalG}
      />

      {/* Campus Context (Terrain, roads, pitches, perimeter gate) */}
      <ContextLayer geometry={geometry} tuning={tuning} />

      {/* Deterministic Campus Vegetation (Trees, shrubs, collision-free) */}
      <Vegetation geometry={geometry} />

      {showReference && (
        <Suspense fallback={null}>
          <ReferenceOverlay />
        </Suspense>
      )}

      {/* Buildings & Interiors */}
      <Campus tuning={tuning} />

      {/* Camera Navigation Controller */}
      <CameraController geometry={geometry} selection={selection} />
    </Canvas>
  );
}
