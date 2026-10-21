import {
  AdaptiveDpr,
  BakeShadows,
  ContactShadows,
  Sky,
  SoftShadows,
  Stats,
} from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Leva } from 'leva';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Building, type BuildingMode } from '../components/3d/Building';
import { CampusConnectors } from '../components/3d/CampusConnectors';
import { ContextLayer } from '../components/3d/ContextLayer';
import { Vegetation } from '../components/3d/Vegetation';
import { CampusEnvironmentDetail } from '../components/3d/environment/CampusEnvironmentDetail';
import { getProceduralEnvironmentTexture } from '../components/3d/materials/pbrMaterials';
import { useVisualTuning } from '../components/3d/tuning/useVisualTuning';
import { defaultFloor } from '../domain/campus/campusIndex';
import { useMap } from '../state/MapProvider';
import { sharedCampusAudio } from './audio/campusAudioEngine';
import {
  GRAPHICS_QUALITY_PRESETS,
  TIME_OF_DAY_PRESETS,
  gameConfig,
  navigateToMap,
  type GraphicsQualityPresetId,
  type PlayerTransformState,
  type TeleportDestination,
  type TimeOfDayPresetId,
} from './config/gameConfig';
import {
  attachDesktopControls,
  createInitialInputState,
  detectMobileOrTouch,
  requestCanvasPointerLock,
  resetInputState,
  type PlayerInputState,
} from './controls/DesktopControls';
import { MobileControls } from './controls/MobileControls';
import { FirstPersonController, type TeleportRequest } from './player/FirstPersonController';
import { GameHUD } from './ui/GameHUD';
import { GameMenu } from './ui/GameMenu';
import type { WayfindingTarget } from './ui/Minimap';
import { CampusColliders } from './world/CampusColliders';
import { WayfindingPath } from './world/WayfindingPath';

type GameStatus = 'start' | 'playing' | 'paused';

const noop = () => {};

function RendererToneMapping({ exposure }: { exposure: number }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = exposure;
    const envTex = getProceduralEnvironmentTexture();
    if (envTex) {
      scene.environment = envTex;
      scene.environmentIntensity = 0.82;
    }
    (window as unknown as { __getRenderStats?: () => unknown }).__getRenderStats = () => ({
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    });
  }, [gl, scene, exposure]);
  return null;
}

/**
 * First-person campus exploration scene.
 * Reuses the existing Campus geometry, ContextLayer, Vegetation, Building, and visual tuning,
 * while adding Rapier physics, walkable fountain bridges, tree colliders, 2D radar minimap,
 * 3D room wayfinding, building interior walkthrough mode, time-of-day atmosphere presets,
 * scalable graphics quality presets (including Original Baseline), instanced environmental props,
 * wind-animated foliage, and spatial Web Audio soundscape.
 */
export function GameScene() {
  const { campus, index, geometry, lessons, roomStates } = useMap();
  const tuning = useVisualTuning();

  const [status, setStatus] = useState<GameStatus>('start');
  const [isMobile, setIsMobile] = useState<boolean>(detectMobileOrTouch);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDayPresetId>('day');
  const [qualityPreset, setQualityPreset] = useState<GraphicsQualityPresetId>(() =>
    detectMobileOrTouch() ? 'medium' : 'high',
  );
  const [audioMuted, setAudioMuted] = useState<boolean>(false);
  const [audioVolume, setAudioVolume] = useState<number>(0.65);
  const [showTuning, setShowTuning] = useState<boolean>(false);
  const [nearbyBuildingId, setNearbyBuildingId] = useState<string | null>(null);
  const [enteredBuildingId, setEnteredBuildingId] = useState<string | null>(null);
  const [activeFloorId, setActiveFloorId] = useState<string | undefined>(undefined);
  const [wayfindingTarget, setWayfindingTarget] = useState<WayfindingTarget | null>(null);

  const [teleportRequest, setTeleportRequest] = useState<TeleportRequest>({
    position: [
      gameConfig.player.spawnPosition[0],
      gameConfig.player.spawnPosition[1],
      gameConfig.player.spawnPosition[2],
    ],
    yaw: gameConfig.player.spawnYaw,
    seq: 0,
  });

  const inputRef = useRef<PlayerInputState>(createInitialInputState());
  const playerTransformRef = useRef<PlayerTransformState>({
    x: gameConfig.player.spawnPosition[0],
    y: gameConfig.player.spawnPosition[1],
    z: gameConfig.player.spawnPosition[2],
    yaw: gameConfig.player.spawnYaw,
  });

  const isPlayingRef = useRef<boolean>(false);
  isPlayingRef.current = status === 'playing';

  const nearbyBuildingIdRef = useRef<string | null>(null);
  nearbyBuildingIdRef.current = nearbyBuildingId;

  const enteredBuildingIdRef = useRef<string | null>(null);
  enteredBuildingIdRef.current = enteredBuildingId;

  // Synchronize audio engine with UI and Leva tuning
  useEffect(() => {
    const effectivelyMuted = audioMuted || tuning.audioEnabled === false;
    sharedCampusAudio.setMuted(effectivelyMuted);
    sharedCampusAudio.setVolume(audioVolume * (tuning.audioVolume ?? 0.65));
  }, [audioMuted, audioVolume, tuning.audioEnabled, tuning.audioVolume]);

  // Compute live lesson counts per building
  const liveCountByBuilding = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of campus.buildings) {
      let n = 0;
      for (const f of b.floors) {
        for (const r of f.rooms) {
          if (roomStates.get(r.id)?.status === 'CURRENT') n++;
        }
      }
      counts.set(b.id, n);
    }
    return counts;
  }, [campus, roomStates]);

  // Keep mobile/touch detection responsive on resize or first touch
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(detectMobileOrTouch());
    };
    const handleFirstTouch = () => {
      setIsMobile(true);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    window.addEventListener('touchstart', handleFirstTouch, { passive: true });
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      window.removeEventListener('touchstart', handleFirstTouch);
    };
  }, []);

  const handleToggleEnterBuilding = useCallback(
    (buildingId: string) => {
      sharedCampusAudio.resumeFromUserGesture();
      setEnteredBuildingId((prev) => {
        if (prev === buildingId) {
          setActiveFloorId(undefined);
          return null;
        }
        const bld = index.buildings.get(buildingId);
        setActiveFloorId(bld ? defaultFloor(bld)?.id : undefined);
        return buildingId;
      });
    },
    [index],
  );

  const handleInteractKey = useCallback(() => {
    const targetBldId = enteredBuildingIdRef.current ?? nearbyBuildingIdRef.current;
    if (targetBldId) {
      handleToggleEnterBuilding(targetBldId);
    }
  }, [handleToggleEnterBuilding]);

  const handlePause = useCallback(() => {
    resetInputState(inputRef.current);
    if (typeof document !== 'undefined' && document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    setStatus((prev) => (prev === 'playing' ? 'paused' : prev));
  }, []);

  const handleStartOrResume = useCallback(() => {
    sharedCampusAudio.resumeFromUserGesture();
    resetInputState(inputRef.current);
    setStatus('playing');
    requestCanvasPointerLock();
  }, []);

  const handleRespawn = useCallback(() => {
    sharedCampusAudio.resumeFromUserGesture();
    resetInputState(inputRef.current);
    setEnteredBuildingId(null);
    setTeleportRequest((prev) => ({
      position: [
        gameConfig.player.spawnPosition[0],
        gameConfig.player.spawnPosition[1],
        gameConfig.player.spawnPosition[2],
      ],
      yaw: gameConfig.player.spawnYaw,
      seq: prev.seq + 1,
    }));
    setStatus('playing');
    requestCanvasPointerLock();
  }, []);

  const handleTeleport = useCallback(
    (dest: TeleportDestination) => {
      sharedCampusAudio.resumeFromUserGesture();
      resetInputState(inputRef.current);
      if (dest.enterBuildingId) {
        const bld = index.buildings.get(dest.enterBuildingId);
        setEnteredBuildingId(dest.enterBuildingId);
        setActiveFloorId(bld ? defaultFloor(bld)?.id : undefined);
      } else {
        setEnteredBuildingId(null);
        setActiveFloorId(undefined);
      }
      setTeleportRequest((prev) => ({
        position: [dest.position[0], dest.position[1], dest.position[2]],
        yaw: dest.yaw,
        seq: prev.seq + 1,
      }));
      setStatus('playing');
      requestCanvasPointerLock();
    },
    [index],
  );

  const handleSelectWayfindingTarget = useCallback(
    (target: WayfindingTarget) => {
      sharedCampusAudio.resumeFromUserGesture();
      setWayfindingTarget(target);
      setEnteredBuildingId(target.buildingId);
      if (target.floorId) {
        setActiveFloorId(target.floorId);
      }
      resetInputState(inputRef.current);
      setStatus('playing');
      requestCanvasPointerLock();
    },
    [],
  );

  const handleToggleAudioMute = useCallback(() => {
    sharedCampusAudio.resumeFromUserGesture();
    setAudioMuted((prev) => !prev);
  }, []);

  const handleChangeAudioVolume = useCallback((vol: number) => {
    sharedCampusAudio.resumeFromUserGesture();
    setAudioVolume(vol);
    if (vol > 0) setAudioMuted(false);
  }, []);

  const handleReturnToMap = useCallback(() => {
    resetInputState(inputRef.current);
    navigateToMap();
  }, []);

  useEffect(() => {
    return attachDesktopControls({
      input: inputRef.current,
      isPlayingRef,
      onPauseRequest: handlePause,
      onInteractRequest: handleInteractKey,
    });
  }, [handlePause, handleInteractKey]);

  useEffect(() => {
    const win = window as unknown as {
      __setGameView?: (opts: {
        position?: [number, number, number];
        yaw?: number;
        timeOfDay?: TimeOfDayPresetId;
        qualityPreset?: GraphicsQualityPresetId;
        status?: GameStatus;
      }) => void;
    };
    win.__setGameView = (opts) => {
      if (opts.timeOfDay) setTimeOfDay(opts.timeOfDay);
      if (opts.qualityPreset) setQualityPreset(opts.qualityPreset);
      if (opts.status) setStatus(opts.status);
      if (opts.position) {
        setTeleportRequest((prev) => ({
          position: opts.position!,
          yaw: opts.yaw ?? prev.yaw,
          seq: prev.seq + 1,
        }));
      }
    };
    return () => {
      delete win.__setGameView;
    };
  }, []);

  const atmosphere = TIME_OF_DAY_PRESETS[timeOfDay];
  const quality = GRAPHICS_QUALITY_PRESETS[qualityPreset];
  const isOriginalBaseline = qualityPreset === 'original';

  const effectiveTuning = useMemo(
    () => ({
      ...tuning,
      pbrTexturesEnabled:
        !isOriginalBaseline && quality.enablePbrTextures && tuning.pbrTexturesEnabled !== false,
    }),
    [tuning, isOriginalBaseline, quality.enablePbrTextures],
  );

  const effectiveShadowMapSize = Math.min(tuning.shadowMapSize, quality.shadowMapSize);
  const effectiveSoftSamples = Math.min(tuning.softShadowSamples, quality.softShadowSamples);
  const effectiveExposure = atmosphere.exposure * (tuning.toneMappingExposure ?? 1.0);

  const nearbyBuilding = nearbyBuildingId
    ? index.buildings.get(nearbyBuildingId) ?? null
    : null;
  const activeCountBuildingId = enteredBuildingId ?? nearbyBuildingId;
  const nearbyBuildingLiveCount = activeCountBuildingId
    ? liveCountByBuilding.get(activeCountBuildingId) ?? 0
    : 0;

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100dvh',
        overflow: 'hidden',
        background: atmosphere.backgroundColor,
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <Leva hidden={!showTuning} collapsed={false} titleBar={{ title: '🎛️ Campus 3D Tuning' }} />

      <Canvas
        shadows={tuning.shadowsEnabled ? { type: THREE.PCFSoftShadowMap } : false}
        camera={{
          position: [
            gameConfig.player.spawnPosition[0],
            gameConfig.player.spawnPosition[1] + gameConfig.player.eyeOffset,
            gameConfig.player.spawnPosition[2],
          ],
          fov: gameConfig.camera.fov,
          near: gameConfig.camera.near,
          far: gameConfig.camera.far,
        }}
        dpr={quality.dpr}
      >
        <RendererToneMapping exposure={effectiveExposure} />

        <color attach="background" args={[atmosphere.backgroundColor]} />
        {tuning.fogEnabled && (
          <fog
            attach="fog"
            args={[
              atmosphere.fogColor,
              isOriginalBaseline ? tuning.fogNear : atmosphere.fogNear,
              isOriginalBaseline ? tuning.fogFar : atmosphere.fogFar,
            ]}
          />
        )}

        {/* Drei Performance & Shadow Helpers */}
        {tuning.adaptiveDpr && <AdaptiveDpr pixelated={false} />}
        {tuning.bakeShadows && <BakeShadows />}
        {tuning.showStats && <Stats />}
        {tuning.shadowsEnabled && effectiveSoftSamples > 0 && (
          <SoftShadows
            size={tuning.softShadowSize}
            samples={effectiveSoftSamples}
            focus={0.5}
          />
        )}

        {/* Ground Contact Shadows for Architectural Depth */}
        {!isOriginalBaseline &&
          quality.enableContactShadows &&
          tuning.contactShadowsEnabled !== false && (
            <ContactShadows
              position={[0, 0.04, 25]}
              opacity={tuning.contactShadowOpacity ?? 0.36}
              scale={240}
              blur={2.2}
              far={24}
              resolution={512}
              frames={1}
              color="#0f172a"
            />
          )}

        {/* Atmospheric & Directional Sun Lighting (driven by Time-of-Day preset) */}
        <ambientLight intensity={atmosphere.ambientIntensity} color={atmosphere.ambientColor} />
        <hemisphereLight
          args={[
            atmosphere.hemisphereSkyColor,
            atmosphere.hemisphereGroundColor,
            atmosphere.hemisphereIntensity,
          ]}
        />
        <directionalLight
          castShadow={tuning.shadowsEnabled}
          position={atmosphere.sunPosition}
          intensity={atmosphere.sunIntensity}
          color={atmosphere.sunColor}
          shadow-mapSize={[effectiveShadowMapSize, effectiveShadowMapSize]}
          shadow-camera-left={-195}
          shadow-camera-right={195}
          shadow-camera-top={195}
          shadow-camera-bottom={-195}
          shadow-camera-near={10}
          shadow-camera-far={700}
          shadow-bias={tuning.shadowBias}
          shadow-normalBias={tuning.shadowNormalBias}
        />
        <directionalLight
          position={[-120, 80, -100]}
          intensity={atmosphere.fillLightIntensity}
          color="#e2e8f0"
        />

        {/* Evening / Sunset architectural accent lights on Fountain, Art Object, and Entrance Gate */}
        {atmosphere.enableNightLights && (
          <group>
            <pointLight position={[-2.45, 5.5, 15.9]} intensity={45} distance={75} color="#38bdf8" />
            <pointLight position={[106.5, 3.2, 15.9]} intensity={25} distance={35} color="#fde047" />
            <pointLight position={[130.0, 5.0, 15.9]} intensity={35} distance={45} color="#fef08a" />
          </group>
        )}

        {/* Procedural Physical Sky */}
        <Sky
          sunPosition={atmosphere.sunPosition}
          turbidity={atmosphere.skyTurbidity}
          rayleigh={atmosphere.skyRayleigh}
          mieCoefficient={tuning.skyMieCoefficient}
          mieDirectionalG={tuning.skyMieDirectionalG}
        />

        {/* Reused Campus Context, Landmarks, and Vegetation */}
        <ContextLayer geometry={geometry} tuning={effectiveTuning} />
        <Vegetation
          key={`veg-${qualityPreset}`}
          geometry={geometry}
          windEnabled={
            !isOriginalBaseline && quality.enableWindAnimation && tuning.windEnabled !== false
          }
          windSpeed={tuning.windSpeed}
          windStrength={tuning.windStrength}
          densityMultiplier={quality.vegetationDensity}
          castShadows={quality.vegetationCastShadows}
        />

        {/* Medium & Long Range Environmental Detail (Street Lamps, Benches, Bins, Totems, Horizon, Sky Life) */}
        <CampusEnvironmentDetail
          key={`env-${qualityPreset}`}
          geometry={geometry}
          enableNightLights={atmosphere.enableNightLights}
          campusPropsEnabled={quality.enableCampusProps && tuning.campusPropsEnabled !== false}
          skyLifeEnabled={quality.enableSkyLife && tuning.skyLifeEnabled !== false}
          windEnabled={quality.enableWindAnimation && tuning.windEnabled !== false}
          windSpeed={tuning.windSpeed}
          windStrength={tuning.windStrength}
          quality={qualityPreset}
        />

        {/* 3D Wayfinding Trail & Destination Beacon */}
        <WayfindingPath playerTransformRef={playerTransformRef} target={wayfindingTarget} />

        {/* Reused Campus Buildings & Inter-building Connectors */}
        <group>
          <CampusConnectors
            connectors={geometry.connectors}
            selectedBuildingId={enteredBuildingId ?? undefined}
          />
          {campus.buildings.map((building) => {
            const g = geometry.buildings[building.id];
            if (!g) return null;
            const isEntered = enteredBuildingId === building.id;
            const mode: BuildingMode = isEntered ? 'interior' : 'normal';
            return (
              <Building
                key={building.id}
                building={building}
                geometry={g}
                mode={mode}
                selectedFloorId={isEntered ? activeFloorId : undefined}
                selectedRoomId={
                  isEntered && wayfindingTarget?.buildingId === building.id
                    ? wayfindingTarget.roomId
                    : undefined
                }
                roomGeometries={geometry.rooms}
                roomStates={roomStates}
                tuning={effectiveTuning}
                onSelectBuilding={noop}
                onSelectRoom={noop}
              />
            );
          })}
        </group>

        {/* Physics World & First-Person Controller */}
        <Suspense fallback={null}>
          <Physics gravity={gameConfig.physics.gravity} paused={status !== 'playing'}>
            <CampusColliders geometry={geometry} enteredBuildingId={enteredBuildingId} />
            <FirstPersonController
              inputRef={inputRef}
              playerTransformRef={playerTransformRef}
              geometry={geometry}
              isPlaying={status === 'playing'}
              teleportRequest={teleportRequest}
              enteredBuildingId={enteredBuildingId}
              timeOfDay={timeOfDay}
              onNearestBuildingChange={setNearbyBuildingId}
            />
          </Physics>
        </Suspense>
      </Canvas>

      {/* In-Game HUD & Touch Controls */}
      {status === 'playing' && (
        <>
          <GameHUD
            isMobile={isMobile}
            campus={campus}
            geometry={geometry}
            playerTransformRef={playerTransformRef}
            timeOfDay={timeOfDay}
            onChangeTimeOfDay={setTimeOfDay}
            qualityPreset={qualityPreset}
            onChangeQualityPreset={setQualityPreset}
            audioMuted={audioMuted}
            onToggleAudioMute={handleToggleAudioMute}
            showTuning={showTuning}
            onToggleTuning={() => setShowTuning((prev) => !prev)}
            nearbyBuilding={nearbyBuilding}
            nearbyBuildingLiveCount={nearbyBuildingLiveCount}
            enteredBuildingId={enteredBuildingId}
            activeFloorId={activeFloorId}
            onToggleEnterBuilding={handleToggleEnterBuilding}
            onSelectFloor={setActiveFloorId}
            wayfindingTarget={wayfindingTarget}
            onClearWayfinding={() => setWayfindingTarget(null)}
            onPause={handlePause}
            onRespawn={handleRespawn}
            onReturnToMap={handleReturnToMap}
          />
          {isMobile && <MobileControls inputRef={inputRef} active={true} />}
        </>
      )}

      {/* Start / Pause Menu Overlay */}
      {status !== 'playing' && (
        <GameMenu
          mode={status === 'paused' ? 'paused' : 'start'}
          isMobile={isMobile}
          index={index}
          geometry={geometry}
          lessons={lessons}
          timeOfDay={timeOfDay}
          onChangeTimeOfDay={setTimeOfDay}
          qualityPreset={qualityPreset}
          onChangeQualityPreset={setQualityPreset}
          audioMuted={audioMuted}
          audioVolume={audioVolume}
          onToggleAudioMute={handleToggleAudioMute}
          onChangeAudioVolume={handleChangeAudioVolume}
          onTeleport={handleTeleport}
          onSelectWayfindingTarget={handleSelectWayfindingTarget}
          onStartOrResume={handleStartOrResume}
          onRespawn={handleRespawn}
          onReturnToMap={handleReturnToMap}
        />
      )}
    </div>
  );
}

export default GameScene;
