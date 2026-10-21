import type { TuningMaterialOverrides } from '../../domain/appearance';
import { useMemo } from 'react';
import { useMap } from '../../state/MapProvider';
import { Building, type BuildingMode } from './Building';
import { BuildingLabel } from './BuildingLabel';
import { CampusConnectors } from './CampusConnectors';
import { AmphitheaterHall } from './amphitheater/AmphitheaterHall';

/** All buildings + their labels + inter-building connectors. Pulls state from the map context and passes plain props down. */
export function Campus({ tuning }: { tuning?: TuningMaterialOverrides }) {
  const { campus, geometry, roomStates, selection, selectBuilding, selectRoom } = useMap();

  const liveCountByBuilding = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of campus.buildings) {
      let n = 0;
      for (const f of b.floors) for (const r of f.rooms) if (roomStates.get(r.id)?.status === 'CURRENT') n++;
      counts.set(b.id, n);
    }
    return counts;
  }, [campus, roomStates]);

  return (
    <group>
      <CampusConnectors connectors={geometry.connectors} selectedBuildingId={selection.buildingId} />
      <AmphitheaterHall selected={selection.buildingId === 'amph-hall'} />
      {campus.buildings.map((building) => {
        const g = geometry.buildings[building.id];
        if (!g) return null; // No geometry yet → building only appears in the UI list.
        const isSelected = selection.buildingId === building.id;
        const mode: BuildingMode = isSelected ? 'interior' : selection.buildingId ? 'dimmed' : 'normal';
        return (
          <group key={building.id}>
            <Building
              building={building}
              geometry={g}
              mode={mode}
              selectedFloorId={isSelected ? selection.floorId : undefined}
              selectedRoomId={isSelected ? selection.roomId : undefined}
              roomGeometries={geometry.rooms}
              roomStates={roomStates}
              tuning={tuning}
              onSelectBuilding={selectBuilding}
              onSelectRoom={selectRoom}
            />
            {!isSelected && (
              <BuildingLabel
                building={building}
                geometry={g}
                liveCount={liveCountByBuilding.get(building.id) ?? 0}
                muted={mode === 'dimmed'}
                onSelect={selectBuilding}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}
