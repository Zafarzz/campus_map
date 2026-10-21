import { useEffect, useState, type MutableRefObject } from 'react';
import { sortedFloors } from '../../domain/campus/campusIndex';
import type { Building, Campus } from '../../domain/campus/types';
import type { CampusGeometry } from '../../domain/geometry/types';
import {
  GRAPHICS_QUALITY_PRESETS,
  TIME_OF_DAY_PRESETS,
  type GraphicsQualityPresetId,
  type PlayerTransformState,
  type TimeOfDayPresetId,
} from '../config/gameConfig';
import { Minimap, type WayfindingTarget } from './Minimap';

type Props = {
  isMobile: boolean;
  campus: Campus;
  geometry: CampusGeometry;
  playerTransformRef: MutableRefObject<PlayerTransformState>;
  timeOfDay: TimeOfDayPresetId;
  onChangeTimeOfDay: (preset: TimeOfDayPresetId) => void;
  qualityPreset: GraphicsQualityPresetId;
  onChangeQualityPreset: (preset: GraphicsQualityPresetId) => void;
  audioMuted: boolean;
  onToggleAudioMute: () => void;
  showTuning: boolean;
  onToggleTuning: () => void;
  nearbyBuilding: Building | null;
  nearbyBuildingLiveCount: number;
  enteredBuildingId: string | null;
  activeFloorId: string | undefined;
  onToggleEnterBuilding: (buildingId: string) => void;
  onSelectFloor: (floorId: string) => void;
  wayfindingTarget: WayfindingTarget | null;
  onClearWayfinding: () => void;
  onPause: () => void;
  onRespawn: () => void;
  onReturnToMap: () => void;
};

/**
 * In-game HUD with:
 * - Center crosshair
 * - Top-left navigation bar, Time-of-Day, Quality/Baseline comparison, Audio mute, & 2D radar Minimap
 * - Proximity building card with Indoor Floor Walkthrough toggle (E)
 * - Active 3D wayfinding distance banner
 */
export function GameHUD({
  isMobile,
  campus,
  geometry,
  playerTransformRef,
  timeOfDay,
  onChangeTimeOfDay,
  qualityPreset,
  onChangeQualityPreset,
  audioMuted,
  onToggleAudioMute,
  showTuning,
  onToggleTuning,
  nearbyBuilding,
  nearbyBuildingLiveCount,
  enteredBuildingId,
  activeFloorId,
  onToggleEnterBuilding,
  onSelectFloor,
  wayfindingTarget,
  onClearWayfinding,
  onPause,
  onRespawn,
  onReturnToMap,
}: Props) {
  const [targetDistance, setTargetDistance] = useState<number | null>(null);

  useEffect(() => {
    if (!wayfindingTarget) {
      setTargetDistance(null);
      return;
    }
    const updateDist = () => {
      const { x, z } = playerTransformRef.current;
      const d = Math.hypot(
        wayfindingTarget.position[0] - x,
        wayfindingTarget.position[2] - z,
      );
      setTargetDistance(Math.round(d));
    };
    updateDist();
    const id = window.setInterval(updateDist, 250);
    return () => window.clearInterval(id);
  }, [wayfindingTarget, playerTransformRef]);

  const enteredBuilding = enteredBuildingId
    ? campus.buildings.find((b) => b.id === enteredBuildingId) ?? null
    : null;
  const activeBuilding = enteredBuilding ?? nearbyBuilding;

  const isInsideActiveBuilding =
    Boolean(activeBuilding) && enteredBuildingId === activeBuilding?.id;

  const floors = activeBuilding ? sortedFloors(activeBuilding) : [];

  const cycleTimeOfDay = () => {
    const order: TimeOfDayPresetId[] = ['morning', 'day', 'sunset', 'night'];
    const next = order[(order.indexOf(timeOfDay) + 1) % order.length];
    onChangeTimeOfDay(next);
  };

  const cycleQualityPreset = () => {
    const order: GraphicsQualityPresetId[] = ['high', 'medium', 'low', 'original'];
    const next = order[(order.indexOf(qualityPreset) + 1) % order.length];
    onChangeQualityPreset(next);
  };

  return (
    <div
      data-game-ui="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 20,
        userSelect: 'none',
      }}
    >
      {/* Center Crosshair */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 14,
          height: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: 12,
            height: 2,
            background: 'rgba(255, 255, 255, 0.85)',
            boxShadow: '0 0 3px rgba(0, 0, 0, 0.8)',
            borderRadius: 1,
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 2,
            height: 12,
            background: 'rgba(255, 255, 255, 0.85)',
            boxShadow: '0 0 3px rgba(0, 0, 0, 0.8)',
            borderRadius: 1,
          }}
        />
      </div>

      {/* Top Navigation & Pause Bar */}
      <div
        style={{
          position: 'absolute',
          top: 'max(12px, env(safe-area-inset-top, 12px))',
          left: 'max(12px, env(safe-area-inset-left, 12px))',
          right: 'max(12px, env(safe-area-inset-right, 12px))',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 8,
        }}
      >
        {/* Top-Left Controls + Radar Minimap */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', pointerEvents: 'auto' }}>
            <button
              type="button"
              onClick={onReturnToMap}
              style={{
                background: 'rgba(15, 23, 42, 0.78)',
                color: '#f8fafc',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                borderRadius: 8,
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 600,
                backdropFilter: 'blur(6px)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
              }}
            >
              ← Map
            </button>

            <button
              type="button"
              onClick={onRespawn}
              style={{
                background: 'rgba(15, 23, 42, 0.68)',
                color: '#e2e8f0',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 8,
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 500,
                backdropFilter: 'blur(6px)',
              }}
            >
              ↺ Spawn
            </button>

            <button
              type="button"
              onClick={cycleTimeOfDay}
              title="Switch lighting time of day (Morning / Midday / Golden Hour / Evening)"
              style={{
                background: 'rgba(15, 23, 42, 0.68)',
                color: '#fde68a',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 8,
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 600,
                backdropFilter: 'blur(6px)',
              }}
            >
              {TIME_OF_DAY_PRESETS[timeOfDay].label}
            </button>

            <button
              type="button"
              onClick={cycleQualityPreset}
              title="Switch Graphics Quality or compare with Original Baseline"
              style={{
                background:
                  qualityPreset === 'original'
                    ? 'rgba(180, 83, 9, 0.82)'
                    : 'rgba(15, 23, 42, 0.68)',
                color: '#bae6fd',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 8,
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 600,
                backdropFilter: 'blur(6px)',
              }}
            >
              {GRAPHICS_QUALITY_PRESETS[qualityPreset].label}
            </button>

            <button
              type="button"
              onClick={onToggleAudioMute}
              title="Toggle ambient soundscape & footsteps"
              style={{
                background: audioMuted
                  ? 'rgba(15, 23, 42, 0.55)'
                  : 'rgba(14, 116, 144, 0.78)',
                color: '#f8fafc',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 8,
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 600,
                backdropFilter: 'blur(6px)',
              }}
            >
              {audioMuted ? '🔇 Muted' : '🔊 Audio'}
            </button>

            {!isMobile && (
              <button
                type="button"
                onClick={onToggleTuning}
                title="Toggle live 3D visual & shader tuning panel"
                style={{
                  background: showTuning
                    ? 'rgba(37, 99, 235, 0.85)'
                    : 'rgba(15, 23, 42, 0.68)',
                  color: '#e2e8f0',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 8,
                  padding: '7px 11px',
                  fontSize: 12,
                  fontWeight: 600,
                  backdropFilter: 'blur(6px)',
                }}
              >
                🎛️ Tuning
              </button>
            )}
          </div>

          <Minimap
            campus={campus}
            geometry={geometry}
            playerTransformRef={playerTransformRef}
            wayfindingTarget={wayfindingTarget}
            enteredBuildingId={enteredBuildingId}
          />
        </div>

        {/* Top-Right Pause / Teleport / Search Button */}
        <button
          type="button"
          onClick={onPause}
          style={{
            pointerEvents: 'auto',
            background: 'rgba(15, 23, 42, 0.78)',
            color: '#f8fafc',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            borderRadius: 8,
            padding: '8px 13px',
            fontSize: 12,
            fontWeight: 600,
            backdropFilter: 'blur(6px)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
          }}
        >
          🧭 Menu / Teleport {isMobile ? '' : '(Esc)'}
        </button>
      </div>

      {/* Top-Center Context Banners (Wayfinding + Building Proximity / Indoor Mode) */}
      <div
        style={{
          position: 'absolute',
          top: 'max(14px, env(safe-area-inset-top, 14px))',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          maxWidth: '90vw',
        }}
      >
        {wayfindingTarget && (
          <div
            style={{
              pointerEvents: 'auto',
              background: 'rgba(14, 116, 144, 0.88)',
              color: '#f0f9ff',
              border: '1px solid rgba(56, 189, 248, 0.5)',
              borderRadius: 999,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              backdropFilter: 'blur(6px)',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)',
            }}
          >
            <span>
              🧭 <strong>{wayfindingTarget.label}</strong>
              {targetDistance !== null ? ` · ${targetDistance} m` : ''}
            </span>
            <button
              type="button"
              onClick={onClearWayfinding}
              style={{
                background: 'rgba(15, 23, 42, 0.45)',
                color: '#ffffff',
                borderRadius: 999,
                padding: '2px 8px',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              ✕
            </button>
          </div>
        )}

        {activeBuilding && (
          <div
            style={{
              pointerEvents: 'auto',
              background: 'rgba(15, 23, 42, 0.86)',
              color: '#f8fafc',
              border: isInsideActiveBuilding
                ? '1px solid rgba(16, 185, 129, 0.65)'
                : '1px solid rgba(255, 255, 255, 0.22)',
              borderRadius: 12,
              padding: '10px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              alignItems: 'center',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span
                style={{
                  background: isInsideActiveBuilding ? '#059669' : '#2563eb',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: 12,
                  padding: '2px 8px',
                  borderRadius: 6,
                }}
              >
                {activeBuilding.shortName}
              </span>
              <strong style={{ fontSize: 13 }}>{activeBuilding.name}</strong>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                {activeBuilding.floors.length}F
              </span>
              {nearbyBuildingLiveCount > 0 && (
                <span
                  style={{
                    background: '#e5534b',
                    color: '#ffffff',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: 999,
                  }}
                >
                  {nearbyBuildingLiveCount} live
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => onToggleEnterBuilding(activeBuilding.id)}
                style={{
                  background: isInsideActiveBuilding ? '#dc2626' : '#059669',
                  color: '#ffffff',
                  borderRadius: 8,
                  padding: '5px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {isInsideActiveBuilding
                  ? `🚪 Exit Interior${isMobile ? '' : ' (E)'}`
                  : `🚪 Enter / Inspect Floors${isMobile ? '' : ' (E)'}`}
              </button>

              {isInsideActiveBuilding && floors.length > 1 && (
                <div style={{ display: 'flex', gap: 4 }}>
                  {floors.map((f) => {
                    const isActive = f.id === activeFloorId;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => onSelectFloor(f.id)}
                        style={{
                          background: isActive ? '#2563eb' : 'rgba(51, 65, 85, 0.85)',
                          color: '#ffffff',
                          borderRadius: 6,
                          padding: '4px 8px',
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {f.level}F
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Desktop Movement Instructions */}
      {!isMobile && (
        <div
          style={{
            position: 'absolute',
            bottom: 18,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.68)',
            color: '#f1f5f9',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            borderRadius: 999,
            padding: '6px 16px',
            fontSize: 12,
            fontWeight: 500,
            backdropFilter: 'blur(6px)',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.25)',
          }}
        >
          <strong>WASD</strong> Move &nbsp;·&nbsp; <strong>Mouse</strong> Look &nbsp;·&nbsp;{' '}
          <strong>Shift</strong> Sprint &nbsp;·&nbsp; <strong>Space</strong> Jump &nbsp;·&nbsp;{' '}
          <strong>E</strong> Enter Building &nbsp;·&nbsp; <strong>Esc</strong> Menu / Settings
        </div>
      )}
    </div>
  );
}
