import { AdaptiveDpr, BakeShadows, Sky, SoftShadows, Stats } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Building, type BuildingMode } from '../components/3d/Building';
import { CampusConnectors } from '../components/3d/CampusConnectors';
import { AmphitheaterHall } from '../components/3d/amphitheater/AmphitheaterHall';
import { AMPHITHEATER_BUILDING } from '../data/amphitheater-hall';
import { ContextLayer } from '../components/3d/ContextLayer';
import { Vegetation } from '../components/3d/Vegetation';
import { useVisualTuning } from '../components/3d/tuning/useVisualTuning';
import { defaultFloor } from '../domain/campus/campusIndex';
import { useMap } from '../state/MapProvider';
import {
  TIME_OF_DAY_PRESETS,
  gameConfig,
  navigateToMap,
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

/**
 * First-person campus exploration scene.
 * Reuses the existing Campus geometry, ContextLayer, Vegetation, Building, and visual tuning,
 * while adding Rapier physics, walkable fountain bridges, tree colliders, 2D radar minimap,
 * 3D room wayfinding, building interior walkthrough mode, and time-of-day atmosphere presets.
 */
export function GameScene() {
  const { campus, index, geometry, lessons, roomStates } = useMap();
  const tuning = useVisualTuning();

  const [status, setStatus] = useState<GameStatus>('start');
  const [isMobile, setIsMobile] = useState<boolean>(detectMobileOrTouch);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDayPresetId>('day');
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
      setEnteredBuildingId((prev) => {
        if (prev === buildingId) {
          setActiveFloorId(undefined);
          return null;
        }
        if (buildingId === 'amph-hall') {
          setActiveFloorId('amph-floor-1');
          return 'amph-hall';
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
    resetInputState(inputRef.current);
    setStatus('playing');
    requestCanvasPointerLock();
  }, []);

  const handleRespawn = useCallback(() => {
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
      resetInputState(inputRef.current);
      if (dest.enterBuildingId) {
        if (dest.enterBuildingId === 'amph-hall') {
          setEnteredBuildingId('amph-hall');
          setActiveFloorId('amph-floor-1');
        } else {
          const bld = index.buildings.get(dest.enterBuildingId);
          setEnteredBuildingId(dest.enterBuildingId);
          setActiveFloorId(bld ? defaultFloor(bld)?.id : undefined);
        }
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

  const handleNearestBuildingChange = useCallback((id: string | null) => {
    setNearbyBuildingId(id);
    if (id === 'amph-hall') {
      const px = playerTransformRef.current.x;
      const pz = playerTransformRef.current.z;
      // Auto-enter when player physically walks inside the hall [41.0, 60.0] x [69.0, 84.0]
      if (px >= 41.0 && px <= 60.0 && pz >= 69.0 && pz <= 84.0) {
        if (enteredBuildingIdRef.current !== 'amph-hall') {
          setEnteredBuildingId('amph-hall');
          setActiveFloorId('amph-floor-1');
        }
      }
    } else if (enteredBuildingIdRef.current === 'amph-hall' && id !== 'amph-hall') {
      // Auto-exit when player walks outside away from the hall
      setEnteredBuildingId(null);
      setActiveFloorId(undefined);
    }
  }, []);

  const atmosphere = TIME_OF_DAY_PRESETS[timeOfDay];
  const nearbyBuilding = nearbyBuildingId
    ? nearbyBuildingId === 'amph-hall'
      ? AMPHITHEATER_BUILDING
      : index.buildings.get(nearbyBuildingId) ?? null
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
      <Canvas
        shadows={{ type: THREE.PCFSoftShadowMap }}
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
        dpr={[1, 2]}
      >
        <color attach="background" args={[atmosphere.backgroundColor]} />
        {tuning.fogEnabled && (
          <fog attach="fog" args={[atmosphere.fogColor, tuning.fogNear, tuning.fogFar]} />
        )}

        {/* Drei Performance & Shadow Helpers */}
        {tuning.adaptiveDpr && <AdaptiveDpr pixelated={false} />}
        {tuning.bakeShadows && <BakeShadows />}
        {tuning.showStats && <Stats />}
        {tuning.shadowsEnabled && (
          <SoftShadows
            size={tuning.softShadowSize}
            samples={tuning.softShadowSamples}
            focus={0.5}
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
        <ContextLayer geometry={geometry} tuning={tuning} />
        <Vegetation geometry={geometry} />

        {/* 3D Wayfinding Trail & Destination Beacon */}
        <WayfindingPath playerTransformRef={playerTransformRef} target={wayfindingTarget} />

        {/* Reused Campus Buildings & Inter-building Connectors */}
        <group>
          <CampusConnectors
            connectors={geometry.connectors}
            selectedBuildingId={enteredBuildingId ?? undefined}
          />
          <AmphitheaterHall selected={enteredBuildingId === 'amph-hall'} />
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
                tuning={tuning}
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
              onNearestBuildingChange={handleNearestBuildingChange}
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
