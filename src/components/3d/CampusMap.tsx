import {
  AdaptiveDpr,
  BakeShadows,
  ContactShadows,
  Sky,
  SoftShadows,
  Stats,
} from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { Suspense, useEffect } from "react";
import * as THREE from "three";
import { mapConfig } from "../../config/mapConfig";
import { useLighting } from "../../state/LightingProvider";
import { useMap } from "../../state/MapProvider";
import { CameraPathEditor } from "../../cinematic/CameraPathEditor";
import { CinematicCameraController } from "../../cinematic/CinematicCameraController";
import { CameraController, cameraFraming } from "./CameraController";
import { Campus } from "./Campus";
import { ContextLayer } from "./ContextLayer";
import { ReferenceOverlay } from "./ReferenceOverlay";
import { Vegetation } from "./Vegetation";
import { CampusEnvironmentDetail } from "./environment/CampusEnvironmentDetail";
import { getProceduralEnvironmentTexture } from "./materials/pbrMaterials";
import { useVisualTuning } from "./tuning/useVisualTuning";

function RendererExposure({ exposure }: { exposure: number }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = exposure;
    scene.environment = getProceduralEnvironmentTexture();
    scene.environmentIntensity = 0.82;
    (
      window as unknown as { __getRenderStats?: () => unknown }
    ).__getRenderStats = () => ({
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    });
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
  const { atmosphere } = useLighting();

  const effectiveBgColor = atmosphere.backgroundColor;
  const effectiveFogColor = atmosphere.fogColor;
  const effectiveFogNear = Math.min(tuning.fogNear, atmosphere.fogNear);
  const effectiveFogFar = Math.min(tuning.fogFar, atmosphere.fogFar);
  const effectiveSunPos = atmosphere.sunPosition;
  const effectiveSunColor = atmosphere.sunColor;
  const effectiveSunIntensity =
    atmosphere.sunIntensity * (tuning.sunIntensity / 1.85);
  const effectiveAmbientColor = atmosphere.ambientColor;
  const effectiveAmbientIntensity =
    atmosphere.ambientIntensity * (tuning.ambientIntensity / 0.54);
  const effectiveHemiSkyColor = atmosphere.hemisphereSkyColor;
  const effectiveHemiGroundColor = atmosphere.hemisphereGroundColor;
  const effectiveHemiIntensity =
    atmosphere.hemisphereIntensity * (tuning.hemisphereIntensity / 0.5);
  const effectiveExposure =
    (tuning.toneMappingExposure ?? 1.0) * (atmosphere.exposure / 1.05);

  return (
    <Canvas
      shadows={{ type: THREE.PCFSoftShadowMap }}
      camera={{
        position: initialPosition,
        fov: mapConfig.camera.fov,
        near: 1,
        far: 3000,
      }}
      dpr={[1, 2]}
      gl={{ preserveDrawingBuffer: true }}
    >
      <Physics>
        <RendererExposure exposure={effectiveExposure} />

        <color attach="background" args={[effectiveBgColor]} />
        {tuning.fogEnabled && (
          <fog
            attach="fog"
            args={[effectiveFogColor, effectiveFogNear, effectiveFogFar]}
          />
        )}

        {/* Drei Selective Performance Helpers */}
        {tuning.adaptiveDpr && <AdaptiveDpr pixelated={false} />}
        {tuning.bakeShadows && <BakeShadows />}
        {tuning.showStats && <Stats />}

        {/* Soft contact shadow filter */}
        {tuning.shadowsEnabled && (
          <SoftShadows
            size={tuning.softShadowSize}
            samples={tuning.softShadowSamples}
            focus={0.5}
          />
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
        <ambientLight
          intensity={effectiveAmbientIntensity}
          color={effectiveAmbientColor}
        />
        <hemisphereLight
          args={[
            effectiveHemiSkyColor,
            effectiveHemiGroundColor,
            effectiveHemiIntensity,
          ]}
        />

        {/* Natural Directional Sun Light */}
        <directionalLight
          castShadow={tuning.shadowsEnabled}
          position={effectiveSunPos}
          intensity={effectiveSunIntensity}
          color={effectiveSunColor}
          shadow-mapSize={[tuning.shadowMapSize, tuning.shadowMapSize]}
          shadow-camera-left={-195}
          shadow-camera-right={195}
          shadow-camera-top={195}
          shadow-camera-bottom={-195}
          shadow-camera-near={10}
          shadow-camera-far={700}
          shadow-bias={tuning.shadowBias}
          shadow-normalBias={tuning.shadowNormalBias}
        />

        {/* Secondary subtle ground bounce / fill light */}
        <directionalLight
          position={[-120, 80, -100]}
          intensity={tuning.fillLightIntensity}
          color="#e2e8f0"
        />

        {/* Procedural Physical Sky (No external CDN network dependency) */}
        <Sky
          sunPosition={effectiveSunPos}
          turbidity={atmosphere.skyTurbidity}
          rayleigh={atmosphere.skyRayleigh}
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

        {/* Medium & Long-Range Environmental Detail with dynamic night street lamp lighting */}
        <CampusEnvironmentDetail
          geometry={geometry}
          enableNightLights={atmosphere.streetLampsActive}
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
      </Physics>
    </Canvas>
  );
}
