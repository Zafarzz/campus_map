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
  const isLibraryRoom =
    (room.id === LIBRARY_ROOM_ID || room.number === 'F-101') && geometry.type === 'box';

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
      ) : geometry.type === 'box' ? (
        <mesh position={geometry.position} rotation={[0, geometry.rotation ?? 0, 0]} {...events}>
          <boxGeometry args={geometry.size} />
          {material}
          {edges}
        </mesh>
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
          {isLibraryRoom ? '📚 F-101 · Library' : room.number}
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
