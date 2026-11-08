import { Edges, Html, useCursor } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useMemo, useState } from 'react';
import { mapConfig } from '../../config/mapConfig';
import type { Room as RoomData } from '../../domain/campus/types';
import type { RoomGeometry } from '../../domain/geometry/types';
import type { RoomStatus } from '../../domain/schedule/types';
import { EXTRUDE_ROTATION, roomCenter, roomTop, useExtrudedGeometry } from './geometryUtils';
import { isClick } from './pointer';
import { BlockFLibraryInterior, LIBRARY_ROOM_ID } from './BlockFLibraryInterior';
import { BlockCSportsHallInterior, SPORTS_HALL_ROOM_ID } from './BlockCSportsHallInterior';
import { BlockCCanteenInterior3D, CANTEEN_ROOM_ID } from './BlockCCanteenInterior3D';
import { TennisHallInterior3D, EventHallInterior3D, TENNIS_HALL_ID, EVENT_HALL_1_ID, EVENT_HALL_2_ID } from './HallsBuildingInteriors';
import { ClassroomInterior3D } from './ClassroomInterior3D';
import { BlockCLectureHall3D } from './BlockCLectureHall3D';
import { LobbyInterior3D } from './LobbyInterior3D';
import {
  BlockCFoyerInterior3D,
  BlockCWCInterior3D,
  BlockCStairsInterior3D,
} from './BlockCFloor1Interiors';

type Props = {
  room: RoomData;
  geometry: RoomGeometry;
  status: RoomStatus;
  selected: boolean;
  onSelect: (roomId: string) => void;
};

/** Renders one room. Receives its status; knows nothing about the schedule. */
export function Room({ room, geometry, status, selected, onSelect }: Props) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  const color = mapConfig.colors.status[status];
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!isClick(e)) return;
    e.stopPropagation();
    onSelect(room.id);
  };
  const events = {
    onClick: handleClick,
    onPointerOver: (e: ThreeEvent<PointerEvent>) => (e.stopPropagation(), setHovered(true)),
    onPointerOut: () => setHovered(false),
  };
  const material = (
    <meshStandardMaterial color={color} emissive={selected ? color : '#000000'} emissiveIntensity={selected ? 0.35 : 0} />
  );
  const edges = <Edges color={selected ? mapConfig.colors.roomSelected : '#ffffff'} lineWidth={selected ? 3 : 1} />;

  const center = roomCenter(geometry);
  const labelY = roomTop(geometry) + 0.6;
  const isTennisHall =
    (room.id === TENNIS_HALL_ID || room.number === 'H-103' || room.name?.toLowerCase().includes('tennis')) &&
    geometry.type === 'box';
  const isEventHall =
    (room.id === EVENT_HALL_1_ID || room.id === EVENT_HALL_2_ID || room.id.startsWith('bld-e-f1-hall')) &&
    geometry.type === 'box';
  const isCFoyer =
    (room.id === 'bld-i-f1-foyer' || room.number === 'C-Foyer') &&
    geometry.type === 'box';
  const isCWC =
    (room.id === 'bld-i-f1-wc' || room.number === 'C-WC') &&
    geometry.type === 'box';
  const isCStairs =
    (room.id === 'bld-i-f1-stairs' || (room.number === 'Stairs' && room.id.startsWith('bld-i'))) &&
    geometry.type === 'box';
  const isSportsHall =
    (room.id === SPORTS_HALL_ROOM_ID || room.number === 'C-GYM' || room.id.includes('gym')) &&
    geometry.type === 'box';
  const isC201OrC202 =
    (room.id === 'bld-i-f2-c201' ||
      room.id === 'bld-i-f2-c202' ||
      room.number === 'C-201' ||
      room.number === 'C-202' ||
      room.id === 'bld-i-f2-r1' ||
      room.id === 'bld-i-f2-r2') &&
    geometry.type === 'box';
  const isLibraryRoom =
    (room.id === LIBRARY_ROOM_ID || room.number === 'F-101') && geometry.type === 'box';
  const isCanteen =
    (room.id === CANTEEN_ROOM_ID || room.number === 'Canteen' || room.name?.toLowerCase().includes('canteen')) &&
    geometry.type === 'box';
  const isLobby =
    (room.id.includes('lobby') ||
      room.number.toLowerCase().includes('lobby') ||
      room.name?.toLowerCase().includes('lobby') ||
      room.id === 'bld-g-f1-lobby' ||
      room.id === 'bld-g-f2-lobby' ||
      room.id === 'bld-b-f1-lobby' ||
      room.id === 'bld-b-f2-lobby' ||
      room.id === 'bld-b-f1-e105' ||
      room.id === 'bld-b-f2-e205') &&
    geometry.type === 'box';
  const isOpenStudyPlace =
    (room.id === 'room-open-study-ac' ||
      room.id === 'room-open-study-bc' ||
      room.number === 'OSP-AC' ||
      room.number === 'OSP-BC') &&
    geometry.type === 'box';

  return (
    <group>
      {isLibraryRoom ? (
        <group {...events}>
          <BlockFLibraryInterior
            position={geometry.position}
            size={geometry.size}
            selected={selected}
          />
        </group>
      ) : isOpenStudyPlace ? (
        <group {...events}>
          <mesh position={geometry.position} rotation={[0, geometry.rotation ?? 0, 0]}>
            <boxGeometry args={geometry.size} />
            <meshBasicMaterial visible={false} />
            {selected && <Edges color={mapConfig.colors.roomSelected} lineWidth={3} />}
          </mesh>
        </group>
      ) : isCFoyer ? (
        <group {...events}>
          <BlockCFoyerInterior3D
            position={geometry.position}
            size={geometry.size}
            selected={selected}
          />
        </group>
      ) : isCWC ? (
        <group {...events}>
          <BlockCWCInterior3D
            position={geometry.position}
            size={geometry.size}
            selected={selected}
          />
        </group>
      ) : isCStairs ? (
        <group {...events}>
          <BlockCStairsInterior3D
            position={geometry.position}
            size={geometry.size}
            selected={selected}
          />
        </group>
      ) : isCanteen ? (
        <group {...events}>
          <BlockCCanteenInterior3D
            position={geometry.position}
            size={geometry.size}
            selected={selected}
          />
        </group>
      ) : isSportsHall ? (
        <group {...events}>
          <BlockCSportsHallInterior
            position={geometry.position}
            size={geometry.size}
            selected={selected}
          />
        </group>
      ) : isC201OrC202 ? (
        <group {...events}>
          <BlockCLectureHall3D
            position={geometry.position}
            size={geometry.size}
            roomNumber={room.number}
            selected={selected}
          />
        </group>
      ) : isTennisHall ? (
        <group {...events}>
          <TennisHallInterior3D
            position={geometry.position}
            size={geometry.size}
            selected={selected}
          />
        </group>
      ) : isEventHall ? (
        <group {...events}>
          <EventHallInterior3D
            position={geometry.position}
            size={geometry.size}
            selected={selected}
          />
        </group>
      ) : isLobby ? (
        <group {...events}>
          <LobbyInterior3D
            position={geometry.position}
            size={geometry.size}
            selected={selected}
            label={room.number}
          />
        </group>
      ) : geometry.type === 'box' ? (
        <group {...events}>
          <ClassroomInterior3D
            position={geometry.position}
            size={geometry.size}
            capacity={room.capacity}
            roomNumber={room.number}
            isBigLecture={(room.capacity ?? 30) >= 60 || room.kind === 'hall'}
            selected={selected}
          />
          {/* Selection highlight frame when selected */}
          {selected && (
            <mesh position={geometry.position} rotation={[0, geometry.rotation ?? 0, 0]}>
              <boxGeometry args={geometry.size} />
              <meshBasicMaterial visible={false} />
              <Edges color={mapConfig.colors.roomSelected} lineWidth={3} />
            </mesh>
          )}
        </group>
      ) : (
        <PolygonRoomMesh geometry={geometry} events={events}>
          {material}
          {edges}
        </PolygonRoomMesh>
      )}
      <Html position={[center[0], labelY, center[2]]} center zIndexRange={[10, 0]}>
        <button
          type="button"
          className={`room-label${selected ? ' room-label--selected' : ''}`}
          onClick={() => onSelect(room.id)}
        >
          {isLibraryRoom
            ? '📚 F-101 · Library'
            : isOpenStudyPlace
              ? `📖 ${room.number} · Open Study`
              : isC201OrC202
                ? `🎓 ${room.number} · Lecture Hall`
                : isSportsHall
                  ? '🏐 C-GYM · Volleyball'
                  : isCanteen
                    ? '🍽️ Canteen · Dining Hall'
                    : isCFoyer
                      ? '🚪 C-Foyer · Corridor'
                      : isCWC
                        ? '🚻 C-WC · Restrooms'
                        : isCStairs
                          ? '🪜 Stairs · NW Staircase'
                          : room.number}
        </button>
      </Html>
    </group>
  );
}

function PolygonRoomMesh({
  geometry,
  events,
  children,
}: {
  geometry: Extract<RoomGeometry, { type: 'polygon' }>;
  events: object;
  children: React.ReactNode;
}) {
  const points = useMemo(() => geometry.points, [geometry.points]);
  const geom = useExtrudedGeometry(points, geometry.height);
  return (
    <mesh geometry={geom} rotation={EXTRUDE_ROTATION} position={[0, geometry.elevation, 0]} {...events}>
      {children}
    </mesh>
  );
}
