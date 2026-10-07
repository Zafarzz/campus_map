import { useCursor } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useState } from 'react';
import { mapConfig } from '../../config/mapConfig';
import { sortedFloors } from '../../domain/campus/campusIndex';
import type { Building as BuildingData } from '../../domain/campus/types';
import type { BuildingGeometry, RoomGeometry } from '../../domain/geometry/types';
import type { RoomScheduleState } from '../../domain/schedule/types';
import { DetailedBuilding } from './DetailedBuilding';
import { ExtrudedFootprint } from './ExtrudedFootprint';
import { Floor } from './Floor';
import { isClick } from './pointer';

export type BuildingMode = 'normal' | 'dimmed' | 'interior';

type Props = {
  building: BuildingData;
  geometry: BuildingGeometry;
  mode: BuildingMode;
  selectedFloorId?: string;
  selectedRoomId?: string;
  roomGeometries: Record<string, RoomGeometry>;
  roomStates: Map<string, RoomScheduleState>;
  onSelectBuilding: (buildingId: string) => void;
  onSelectRoom: (roomId: string) => void;
};

/**
 * normal   – solid massing block
 * dimmed   – translucent (another building is selected)
 * interior – translucent shell + floors below the selected one + active floor with rooms
 */
export function Building(props: Props) {
  return props.mode === 'interior' ? <BuildingInterior {...props} /> : <BuildingMass {...props} />;
}

function BuildingMass({ building, geometry, mode, onSelectBuilding }: Props) {
  if (['bld-h', 'bld-g', 'bld-e', 'bld-f', 'bld-i', 'bld-j'].includes(building.id)) {
    return <DetailedBuilding building={building} geometry={geometry} dimmed={mode === 'dimmed'} onSelectBuilding={() => onSelectBuilding(building.id)} />;
  }

  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const dimmed = mode === 'dimmed';

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!isClick(e)) return;
    e.stopPropagation();
    onSelectBuilding(building.id);
  };

  return (
    <group>
      {geometry.parts.map((part, i) => (
        <ExtrudedFootprint
          key={i}
          footprint={part}
          bottom={0}
          height={geometry.height}
          color={hovered ? mapConfig.colors.buildingSelected : mapConfig.colors.building}
          opacity={dimmed ? mapConfig.opacity.dimmedBuilding : 1}
          edgeColor={mapConfig.colors.buildingEdges}
          onClick={onClick}
          onPointerOver={(e) => (e.stopPropagation(), setHovered(true))}
          onPointerOut={() => setHovered(false)}
        />
      ))}
    </group>
  );
}

function BuildingInterior({
  building,
  geometry,
  selectedFloorId,
  selectedRoomId,
  roomGeometries,
  roomStates,
  onSelectRoom,
}: Props) {
  const floors = sortedFloors(building);
  const selected = floors.find((f) => f.id === selectedFloorId) ?? floors[0];

  return (
    <group>
      {/* Translucent shell for context; never intercepts clicks. */}
      {geometry.parts.map((part, i) => (
        <ExtrudedFootprint
          key={i}
          footprint={part}
          bottom={0}
          height={geometry.height}
          color={mapConfig.colors.buildingSelected}
          opacity={mapConfig.opacity.selectedShell}
          edgeColor={mapConfig.colors.buildingEdges}
          interactive={false}
        />
      ))}
      {floors
        .filter((f) => selected && f.level <= selected.level)
        .map((floor) => {
          const floorGeometry = geometry.floors[floor.id];
          if (!floorGeometry) return null;
          return (
            <Floor
              key={floor.id}
              floor={floor}
              floorGeometry={floorGeometry}
              parts={geometry.parts}
              variant={floor.id === selected?.id ? 'active' : 'ghost'}
              roomGeometries={roomGeometries}
              roomStates={roomStates}
              selectedRoomId={selectedRoomId}
              onSelectRoom={onSelectRoom}
            />
          );
        })}
    </group>
  );
}
