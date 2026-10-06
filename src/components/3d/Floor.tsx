import { mapConfig } from '../../config/mapConfig';
import type { Floor as FloorData } from '../../domain/campus/types';
import type { Footprint, FloorGeometry, RoomGeometry } from '../../domain/geometry/types';
import type { RoomScheduleState } from '../../domain/schedule/types';
import { ExtrudedFootprint } from './ExtrudedFootprint';
import { Room } from './Room';

type Props = {
  floor: FloorData;
  floorGeometry: FloorGeometry;
  parts: Footprint[];
  variant: 'active' | 'ghost';
  roomGeometries: Record<string, RoomGeometry>;
  roomStates: Map<string, RoomScheduleState>;
  selectedRoomId?: string;
  onSelectRoom: (roomId: string) => void;
};

/** A floor slab, plus its rooms when it is the active floor. */
export function Floor({
  floor,
  floorGeometry,
  parts,
  variant,
  roomGeometries,
  roomStates,
  selectedRoomId,
  onSelectRoom,
}: Props) {
  const { slabThickness } = mapConfig.building;
  const active = variant === 'active';

  return (
    <group>
      {parts.map((part, i) => (
        <ExtrudedFootprint
          key={i}
          footprint={part}
          bottom={floorGeometry.elevation}
          height={slabThickness}
          color={active ? mapConfig.colors.floorSlab : mapConfig.colors.floorSlabGhost}
          opacity={active ? 1 : mapConfig.opacity.ghostSlab}
          edgeColor={active ? mapConfig.colors.buildingEdges : undefined}
          interactive={false}
        />
      ))}
      {active &&
        floor.rooms.map((room) => {
          const geometry = roomGeometries[room.id];
          if (!geometry) return null; // TODO: room without geometry — listed in UI only.
          return (
            <Room
              key={room.id}
              room={room}
              geometry={geometry}
              status={roomStates.get(room.id)?.status ?? 'AVAILABLE'}
              selected={room.id === selectedRoomId}
              onSelect={onSelectRoom}
            />
          );
        })}
    </group>
  );
}
