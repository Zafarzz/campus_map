import {
  AdaptiveDpr,
  BakeShadows,
  ContactShadows,
  Sky,
  SoftShadows,
  Stats,
} from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Suspense, useEffect } from 'react';
import * as THREE from 'three';
import { mapConfig } from '../../config/mapConfig';
import { useMap } from '../../state/MapProvider';
import { CameraPathEditor } from '../../cinematic/CameraPathEditor';
import { CinematicCameraController } from '../../cinematic/CinematicCameraController';
import { CameraController, cameraFraming } from './CameraController';
import { Campus } from './Campus';
import { ContextLayer } from './ContextLayer';
import { ReferenceOverlay } from './ReferenceOverlay';
import { Vegetation } from './Vegetation';
import { CampusEnvironmentDetail } from './environment/CampusEnvironmentDetail';
import { getProceduralEnvironmentTexture } from './materials/pbrMaterials';
import { useVisualTuning } from './tuning/useVisualTuning';

function RendererExposure({ exposure }: { exposure: number }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = exposure;
    scene.environment = getProceduralEnvironmentTexture();
    scene.environmentIntensity = 0.82;
    (window as unknown as { __getRenderStats?: () => unknown }).__getRenderStats = () => {
      let activeMeshes = 0;
      let instancedMeshes = 0;
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();

      scene.traverseVisible((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          activeMeshes++;
          if ((obj as THREE.InstancedMesh).isInstancedMesh) {
            instancedMeshes++;
          }
          const mat = (obj as THREE.Mesh).material;
          const matList = Array.isArray(mat) ? mat : mat ? [mat] : [];
          for (const m of matList) {
            materials.add(m);
            const rec = m as unknown as Record<string, unknown>;
            for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap']) {
              const tex = rec[key] as THREE.Texture | undefined;
              if (tex && tex.isTexture) textures.add(tex);
            }
          }
        }
      });

      let textureBytes = 0;
      for (const tex of textures) {
        const img = tex.image as { width?: number; height?: number } | undefined;
        if (img && typeof img.width === 'number' && typeof img.height === 'number') {
          const mipFactor = tex.generateMipmaps !== false ? 1.333 : 1.0;
          textureBytes += img.width * img.height * 4 * mipFactor;
        }
      }

      return {
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        activeMeshes,
        instancedMeshes,
        materials: materials.size,
        textureMemoryMB: +(textureBytes / (1024 * 1024)).toFixed(2),
      };
    };
  }, [gl, scene, exposure]);
  return null;
}

/**
 * The 3D scene root.
 * Integrated with Leva real-time visual tuning and selective Drei helpers
 * (SoftShadows, ContactShadows, Sky, AdaptiveDpr, BakeShadows, Stats),
 * plus CampusEnvironmentDetail (street lamps, benches, bins, totems, horizon ring, sky life).
 */
export function CampusMap() {
  const { geometry, selection, showReference } = useMap();
  const [initialPosition] = cameraFraming(geometry, {});
  const tuning = useVisualTuning();

  return (
    <Canvas
      shadows={{ type: THREE.PCFSoftShadowMap }}
      camera={{ position: initialPosition, fov: mapConfig.camera.fov, near: 0.2, far: 2000 }}
      dpr={[1, 1.5]}
      gl={{
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
        logarithmicDepthBuffer: true,
        antialias: true,
      }}
    >
      <RendererExposure exposure={tuning.toneMappingExposure ?? 1.0} />

      <color attach="background" args={[tuning.backgroundColor]} />
      {tuning.fogEnabled && (
        <fog attach="fog" args={[tuning.fogColor, tuning.fogNear, tuning.fogFar]} />
      )}

      {/* Drei Selective Performance Helpers */}
      {tuning.adaptiveDpr && <AdaptiveDpr pixelated={false} />}
      {tuning.bakeShadows && <BakeShadows />}
      {tuning.showStats && <Stats />}

      {/* Soft contact shadow filter — Drei PCSS screen-space jitter is disabled by default to prevent shimmering; Three.js PCFSoftShadowMap is stable */}
      {tuning.shadowsEnabled && tuning.softShadowsEnabled && (
        <SoftShadows size={tuning.softShadowSize} samples={tuning.softShadowSamples} focus={0.5} />
      )}

      {tuning.contactShadowsEnabled && (
        <ContactShadows
          position={[0, 0.04, 25]}
          opacity={tuning.contactShadowOpacity}
          scale={240}
          blur={2.2}
          far={24}
          resolution={512}
          frames={1}
          color="#0f172a"
        />
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
        shadow-camera-left={-165}
        shadow-camera-right={165}
        shadow-camera-top={165}
        shadow-camera-bottom={-165}
        shadow-camera-near={30}
        shadow-camera-far={480}
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

      {/* Deterministic Campus Vegetation (Trees, shrubs, wind sway, collision-free) */}
      <Vegetation
        geometry={geometry}
        windEnabled={tuning.windEnabled}
        windSpeed={tuning.windSpeed}
        windStrength={tuning.windStrength}
      />

      {/* Medium & Long-Range Environmental Detail */}
      <CampusEnvironmentDetail
        geometry={geometry}
        campusPropsEnabled={tuning.campusPropsEnabled}
        skyLifeEnabled={tuning.skyLifeEnabled}
        windEnabled={tuning.windEnabled}
        windSpeed={tuning.windSpeed}
        windStrength={tuning.windStrength}
      />

      {showReference && (
        <Suspense fallback={null}>
          <ReferenceOverlay />
        </Suspense>
      )}

      {/* Buildings & Interiors */}
      <Campus tuning={tuning} />

      {/* Camera Navigation Controller */}
      <CameraController geometry={geometry} selection={selection} />

      {/* Cinematic mode: drives the same CameraControls; inert while the mode is closed */}
      <CinematicCameraController geometry={geometry} />
      <CameraPathEditor />
    </Canvas>
  );
}
