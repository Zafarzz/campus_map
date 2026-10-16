import { useMemo, useState } from 'react';
import { roomCenter } from '../../components/3d/geometryUtils';
import type { CampusIndex } from '../../domain/campus/campusIndex';
import type { CampusGeometry } from '../../domain/geometry/types';
import type { Lesson } from '../../domain/schedule/types';
import { search } from '../../services/search/searchService';
import {
  TELEPORT_LOCATIONS,
  TIME_OF_DAY_PRESETS,
  type TeleportDestination,
  type TimeOfDayPresetId,
} from '../config/gameConfig';
import type { WayfindingTarget } from './Minimap';

type Props = {
  mode: 'start' | 'paused';
  isMobile: boolean;
  index: CampusIndex;
  geometry: CampusGeometry;
  lessons: Lesson[];
  timeOfDay: TimeOfDayPresetId;
  onChangeTimeOfDay: (preset: TimeOfDayPresetId) => void;
  onTeleport: (dest: TeleportDestination) => void;
  onSelectWayfindingTarget: (target: WayfindingTarget) => void;
  onStartOrResume: () => void;
  onRespawn: () => void;
  onReturnToMap: () => void;
};

/**
 * Start and Pause menu overlay featuring:
 * - Room / Lesson search with 3D Wayfinding path activation
 * - Quick Teleport buttons to campus buildings and landmarks
 * - Time-of-Day atmosphere selector (Day / Sunset / Evening)
 */
export function GameMenu({
  mode,
  isMobile,
  index,
  geometry,
  lessons,
  timeOfDay,
  onChangeTimeOfDay,
  onTeleport,
  onSelectWayfindingTarget,
  onStartOrResume,
  onRespawn,
  onReturnToMap,
}: Props) {
  const isPaused = mode === 'paused';
  const [query, setQuery] = useState('');

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    return search(query, index, lessons, 6);
  }, [query, index, lessons]);

  const handleSelectRoomResult = (roomId: string, title: string) => {
    const loc = index.rooms.get(roomId);
    if (!loc) return;
    const rg = geometry.rooms[roomId];
    const bldGeo = geometry.buildings[loc.building.id];
    const pos: [number, number, number] = rg
      ? roomCenter(rg)
      : bldGeo
      ? bldGeo.center
      : [0, 0, 0];

    onSelectWayfindingTarget({
      id: roomId,
      label: `${loc.building.shortName} · ${title}`,
      buildingId: loc.building.id,
      floorId: loc.floor.id,
      roomId,
      position: pos,
    });
  };

  return (
    <div
      data-game-ui="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 30,
        background: 'rgba(15, 23, 42, 0.58)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 14,
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          maxHeight: '92dvh',
          overflowY: 'auto',
          background: 'rgba(15, 23, 42, 0.94)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          borderRadius: 16,
          padding: '22px 20px',
          color: '#f8fafc',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.45)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'inline-block',
            background: 'rgba(37, 99, 235, 0.25)',
            color: '#93c5fd',
            border: '1px solid rgba(59, 130, 246, 0.4)',
            borderRadius: 999,
            padding: '4px 12px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          First-Person Mode
        </div>

        <h2 style={{ margin: '0 0 6px 0', fontSize: 21, fontWeight: 700 }}>
          {isPaused ? 'Game Paused & Navigation' : 'Explore Campus in 3D'}
        </h2>

        <p style={{ margin: '0 0 14px 0', fontSize: 13, color: '#cbd5e1', lineHeight: 1.45 }}>
          {isMobile
            ? 'Walk across the fountain bridges, teleport to buildings, or set a 3D route to any room.'
            : 'Walk around campus, cross the fountain bridges, press E near buildings to inspect floors, or set a 3D route.'}
        </p>

        {/* Primary Play / Resume Button */}
        <button
          type="button"
          onClick={onStartOrResume}
          style={{
            width: '100%',
            background: '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: 10,
            padding: '12px 18px',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.4)',
            marginBottom: 14,
          }}
        >
          {isPaused ? '▶ Resume Exploration' : '▶ Start Game'}
        </button>

        {/* 3D Wayfinding Room Search */}
        <div
          style={{
            background: 'rgba(30, 41, 59, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 10,
            padding: '10px 12px',
            marginBottom: 12,
            textAlign: 'left',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: '#93c5fd', marginBottom: 6 }}>
            🧭 3D Wayfinding (Search Room or Subject)
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. 101, C-103, Lecture, Math..."
            style={{
              width: '100%',
              background: 'rgba(15, 23, 42, 0.85)',
              color: '#f8fafc',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: 8,
              padding: '8px 10px',
              fontSize: 13,
              outline: 'none',
            }}
          />
          {searchResults.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
              {searchResults.map((res) => (
                <button
                  key={res.key}
                  type="button"
                  onClick={() => handleSelectRoomResult(res.roomId, res.title)}
                  style={{
                    background: 'rgba(15, 23, 42, 0.75)',
                    color: '#f1f5f9',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: 7,
                    padding: '6px 10px',
                    textAlign: 'left',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 12,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{res.title}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{res.subtitle}</div>
                  </div>
                  <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: 11 }}>
                    Route →
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick Teleport Locations */}
        <div
          style={{
            background: 'rgba(30, 41, 59, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 10,
            padding: '10px 12px',
            marginBottom: 12,
            textAlign: 'left',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6ee7b7', marginBottom: 8 }}>
            ⚡ Quick Teleport
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(195px, 1fr))',
              gap: 6,
            }}
          >
            {TELEPORT_LOCATIONS.map((dest) => (
              <button
                key={dest.id}
                type="button"
                onClick={() => onTeleport(dest)}
                style={{
                  background: 'rgba(15, 23, 42, 0.8)',
                  color: '#e2e8f0',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: 7,
                  padding: '7px 9px',
                  fontSize: 12,
                  fontWeight: 500,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                {dest.label}
              </button>
            ))}
          </div>
        </div>

        {/* Time of Day Selector */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            justifyContent: 'center',
            marginBottom: 14,
          }}
        >
          {(Object.keys(TIME_OF_DAY_PRESETS) as TimeOfDayPresetId[]).map((presetId) => {
            const active = timeOfDay === presetId;
            return (
              <button
                key={presetId}
                type="button"
                onClick={() => onChangeTimeOfDay(presetId)}
                style={{
                  flex: 1,
                  background: active ? '#0284c7' : 'rgba(30, 41, 59, 0.8)',
                  color: '#ffffff',
                  border: active
                    ? '1px solid rgba(125, 211, 252, 0.7)'
                    : '1px solid rgba(255, 255, 255, 0.14)',
                  borderRadius: 8,
                  padding: '7px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {TIME_OF_DAY_PRESETS[presetId].label}
              </button>
            );
          })}
        </div>

        {/* Secondary Action Buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          {isPaused && (
            <button
              type="button"
              onClick={onRespawn}
              style={{
                flex: 1,
                background: 'rgba(51, 65, 85, 0.85)',
                color: '#f1f5f9',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 10,
                padding: '9px 12px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ↺ Entrance Spawn
            </button>
          )}

          <button
            type="button"
            onClick={onReturnToMap}
            style={{
              flex: 1,
              background: 'transparent',
              color: '#cbd5e1',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: 10,
              padding: '9px 12px',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            ← Return to Campus Map
          </button>
        </div>
      </div>
    </div>
  );
}
