import type { GeometryPrecision, RoomGeometry, Vec2 } from '../../domain/geometry/types';

export type RectArea = { center: Vec2; size: Vec2 };

export type RoomLayoutOptions = {
  roomHeight: number;
  slabThickness: number;
  wallInset: number;
  corridorWidth: number;
  gap: number;
  minRoomDepth: number;
};

/**
 * PROCEDURAL placeholder layout: splits a rectangle into a corridor with rooms on
 * one or both sides. Used only because real floor plans are unavailable.
 *
 * TODO: Replace approximate room geometry when official floor plans are provided.
 */
export function layoutRoomsInRect(
  area: RectArea,
  count: number,
  elevation: number,
  opts: RoomLayoutOptions,
  precision: GeometryPrecision = 'approximate',
): RoomGeometry[] {
  if (count <= 0) return [];
  const [w, d] = area.size;
  const alongX = w >= d;
  const longInner = Math.max(1, Math.max(w, d) - 2 * opts.wallInset);
  const shortInner = Math.max(1, Math.min(w, d) - 2 * opts.wallInset);

  const twoRows = count >= 4 && shortInner >= 2 * opts.minRoomDepth + opts.corridorWidth;
  const rows = twoRows ? 2 : 1;
  const cols = Math.ceil(count / rows);
  const rowDepth = twoRows ? (shortInner - opts.corridorWidth) / 2 : shortInner;
  const cellLength = longInner / cols;
  const y = elevation + opts.slabThickness + opts.roomHeight / 2;

  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const along = -longInner / 2 + cellLength * (col + 0.5);
    const across = twoRows ? (row === 0 ? -1 : 1) * (opts.corridorWidth / 2 + rowDepth / 2) : 0;
    const lenSize = Math.max(0.5, cellLength - opts.gap);
    const depthSize = Math.max(0.5, rowDepth - opts.gap);

    const [cx, cz] = area.center;
    return {
      type: 'box',
      position: alongX ? [cx + along, y, cz + across] : [cx + across, y, cz + along],
      size: alongX ? [lenSize, opts.roomHeight, depthSize] : [depthSize, opts.roomHeight, lenSize],
      precision,
    } satisfies RoomGeometry;
  });
}
