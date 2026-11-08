import { useState, useMemo } from 'react';
import {
  navigateToPlaceOnMap,
  resolvePlaceNavigationTarget,
  useBackendLive,
  type BusynessPlace,
} from '../../hooks/useBackendLive';
import { useMap } from '../../state/MapProvider';
import { TimeControl } from '../ui/MapControls';
import {
  UsersIcon,
  CampusIcon,
  MapNavIcon,
  ClockIcon,
} from '../auth/AuthIcons';

interface CrowdedPlacesViewProps {
  onNavigateToMap?: () => void;
}

const LEVEL_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  empty: { bg: '#ecfdf5', text: '#059669', label: 'Empty' },
  quiet: { bg: '#ecfdf5', text: '#059669', label: 'Quiet' },
  moderate: { bg: '#fffbeb', text: '#d97706', label: 'Moderate' },
  busy: { bg: '#fff7ed', text: '#ea580c', label: 'Busy' },
  full: { bg: '#fef2f2', text: '#dc2626', label: 'Full Capacity' },
};

const DEMO_FALLBACK_PLACES: BusynessPlace[] = [
  {
    place_id: 'place-library',
    name: 'Central Campus Library',
    kind: 'library',
    building_id: 'bld-d',
    floor_id: 'bld-d-f1',
    room_id: 'bld-d-f1-f101',
    level: 'moderate',
    percentage_of_capacity: 48,
    capacity: 250,
    headcount_likely: 120,
    provenance: 'sensor',
    confidence: 0.9,
  },
  {
    place_id: 'place-study-a',
    name: 'Block A Open Study Lounge',
    kind: 'study_area',
    building_id: 'bld-i',
    floor_id: 'bld-i-f2',
    room_id: 'room-open-study-ac',
    level: 'moderate',
    percentage_of_capacity: 39,
    capacity: 48,
    headcount_likely: 19,
    provenance: 'sensor',
    confidence: 0.85,
  },
  {
    place_id: 'place-canteen',
    name: 'Campus Cafeteria & Food Court',
    kind: 'canteen',
    building_id: 'bld-i',
    floor_id: 'bld-i-f1',
    room_id: 'room-canteen',
    level: 'busy',
    percentage_of_capacity: 76,
    capacity: 180,
    headcount_likely: 137,
    provenance: 'sensor',
    confidence: 0.88,
  },
  {
    place_id: 'place-corridor-main',
    name: 'Block B Main Hall & Lobby',
    kind: 'study_area',
    building_id: 'bld-g',
    floor_id: 'bld-g-f1',
    room_id: 'bld-g-f1-lobby',
    level: 'quiet',
    percentage_of_capacity: 22,
    capacity: 80,
    headcount_likely: 18,
    provenance: 'sensor',
    confidence: 0.92,
  },
  {
    place_id: 'place-sports-hall',
    name: 'Main Sports Hall',
    kind: 'sports_hall',
    building_id: 'bld-i',
    floor_id: 'bld-i-f2',
    room_id: 'bld-i-f2-gym',
    level: 'moderate',
    percentage_of_capacity: 45,
    capacity: 60,
    headcount_likely: 27,
    provenance: 'sensor',
    confidence: 0.86,
  },
  {
    place_id: 'place-gym',
    name: 'Indoor Tennis Hall (H-103)',
    kind: 'gym',
    building_id: 'bld-e',
    floor_id: 'bld-e-f1',
    room_id: 'bld-e-f1-tennis',
    level: 'quiet',
    percentage_of_capacity: 25,
    capacity: 60,
    headcount_likely: 15,
    provenance: 'sensor',
    confidence: 0.84,
  },
];

export function CrowdedPlacesView({ onNavigateToMap }: CrowdedPlacesViewProps) {
  const { now, index, selection, selectBuilding, selectFloor, selectRoom } = useMap();
  const live = useBackendLive(now);

  const [selectedFilter, setSelectedFilter] = useState<string>('all');

  const dotColor =
    live.status === 'online' ? '#22c55e' : live.status === 'connecting' ? '#f59e0b' : '#ef4444';
  const connectionLabel =
    live.status === 'online'
      ? 'Backend Live'
      : live.status === 'connecting'
      ? 'Connecting…'
      : 'Offline (Demo Simulation)';

  const places = useMemo(() => {
    let list = live.places.length > 0 ? [...live.places] : DEMO_FALLBACK_PLACES;
    if (selectedFilter !== 'all') {
      list = list.filter((p) => {
        if (selectedFilter === 'sports_hall') {
          return p.kind === 'sports_hall' || p.kind === 'gym';
        }
        if (selectedFilter === 'study_area') {
          return p.kind === 'study_area' || p.kind === 'corridor';
        }
        return p.kind === selectedFilter;
      });
    }
    return list.sort((a, b) => (b.percentage_of_capacity ?? 0) - (a.percentage_of_capacity ?? 0));
  }, [live.places, selectedFilter]);

  const handleLocatePlace = (p: BusynessPlace) => {
    navigateToPlaceOnMap(p, {
      hasRoom: (id) => index.rooms.has(id),
      hasFloor: (id) => index.floors.has(id),
      hasBuilding: (id) => index.buildings.has(id),
      selectRoom,
      selectFloor,
      selectBuilding,
    });
    if (onNavigateToMap) {
      onNavigateToMap();
    }
  };

  return (
    <div className="crowds-view" role="region" aria-label="Campus Busyness and Crowded Places">
      {/* Real-time Status Card */}
      <div className="crowds-view__status-card">
        <div className="crowds-view__status-top">
          <div className="crowds-view__status-indicator">
            <span className="crowds-view__status-dot" style={{ background: dotColor }} />
            <strong className="crowds-view__status-label">{connectionLabel}</strong>
            {live.status === 'online' && (
              <span className="crowds-view__status-meta">
                v{live.version} · {live.latencyMs}ms
              </span>
            )}
          </div>
          <span className="crowds-view__time-tag">
            <ClockIcon size={13} />
            <span>
              {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
          </span>
        </div>

        {/* Integrated Time Scrubbing */}
        <div className="crowds-view__time-control">
          <TimeControl />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="crowds-view__filters" role="group" aria-label="Filter locations">
        <button
          type="button"
          className={`crowds-view__filter-chip${selectedFilter === 'all' ? ' is-active' : ''}`}
          onClick={() => setSelectedFilter('all')}
        >
          All Locations ({places.length})
        </button>
        <button
          type="button"
          className={`crowds-view__filter-chip${selectedFilter === 'library' ? ' is-active' : ''}`}
          onClick={() => setSelectedFilter('library')}
        >
          Library
        </button>
        <button
          type="button"
          className={`crowds-view__filter-chip${selectedFilter === 'study_area' ? ' is-active' : ''}`}
          onClick={() => setSelectedFilter('study_area')}
        >
          Study Lounges
        </button>
        <button
          type="button"
          className={`crowds-view__filter-chip${selectedFilter === 'canteen' ? ' is-active' : ''}`}
          onClick={() => setSelectedFilter('canteen')}
        >
          Cafeteria
        </button>
        <button
          type="button"
          className={`crowds-view__filter-chip${selectedFilter === 'sports_hall' || selectedFilter === 'gym' ? ' is-active' : ''}`}
          onClick={() => setSelectedFilter('sports_hall')}
        >
          Sports
        </button>
      </div>

      {/* Places List */}
      <div className="crowds-view__list">
        {places.length === 0 ? (
          <div className="crowds-view__empty">
            <UsersIcon size={24} />
            <p>No locations found matching this filter.</p>
          </div>
        ) : (
          places.map((place) => {
            const target = resolvePlaceNavigationTarget(place);
            const isSelected = Boolean(
              target &&
                ((target.roomId && selection.roomId === target.roomId) ||
                  (!target.roomId && selection.buildingId === target.buildingId)),
            );

            const pct = place.percentage_of_capacity ?? 0;
            const levelStyle = LEVEL_COLORS[place.level] || LEVEL_COLORS.moderate;

            return (
              <div
                key={place.place_id}
                className={`crowd-hub-card${isSelected ? ' is-selected' : ''}`}
                role="button"
                tabIndex={0}
                style={{ cursor: 'pointer' }}
                onClick={() => handleLocatePlace(place)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleLocatePlace(place);
                  }
                }}
              >
                <div className="crowd-hub-card__header">
                  <div className="crowd-hub-card__title-box">
                    <h3 className="crowd-hub-card__title">{place.name}</h3>
                    {target && (
                      <span className="crowd-hub-card__location">
                        <CampusIcon size={12} />
                        <span>{target.locationBadge}</span>
                      </span>
                    )}
                  </div>

                  <span
                    className="crowd-hub-card__level-badge"
                    style={{ background: levelStyle.bg, color: levelStyle.text }}
                  >
                    {levelStyle.label} · {pct}%
                  </span>
                </div>

                {/* Visual Capacity Bar */}
                <div className="crowd-hub-card__progress-wrap">
                  <div
                    className="crowd-hub-card__progress-bar"
                    style={{
                      width: `${Math.min(100, Math.max(5, pct))}%`,
                      background: levelStyle.text,
                    }}
                  />
                </div>

                <div className="crowd-hub-card__meta">
                  {place.capacity && (
                    <span className="crowd-hub-card__meta-item">
                      Cap: <strong>{place.capacity}</strong>
                    </span>
                  )}
                  {place.headcount_likely !== null && (
                    <span className="crowd-hub-card__meta-item">
                      Occupancy: ~{place.headcount_likely} people
                    </span>
                  )}
                  {place.note && (
                    <span className="crowd-hub-card__note">{place.note}</span>
                  )}
                </div>

                <div className="crowd-hub-card__footer">
                  <button
                    type="button"
                    className="crowd-hub-card__locate-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLocatePlace(place);
                    }}
                    title={`Center 3D map on ${place.name}`}
                  >
                    <MapNavIcon size={13} />
                    <span>Locate in 3D</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
