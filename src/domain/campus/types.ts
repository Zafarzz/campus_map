/**
 * Campus business data.
 *
 * IMPORTANT: nothing in this file knows about 3D geometry. Positions/sizes live in
 * `domain/geometry` and are produced by a geometry provider, keyed by these IDs.
 */

export type DataProvenance =
  /** Confirmed by the user / official source. */
  | 'confirmed'
  /** Placeholder generated for the prototype. Must be replaced. */
  | 'demo';

export type RoomKind = 'classroom' | 'lab' | 'office' | 'hall' | 'other';

export type Room = {
  id: string;
  number: string;
  name?: string;
  kind: RoomKind;
  capacity?: number;
  provenance: DataProvenance;
};

export type Floor = {
  id: string;
  /** 1 = ground floor. Basements may use 0 / negative values. */
  level: number;
  name: string;
  rooms: Room[];
};

export type Building = {
  id: string;
  name: string;
  shortName: string;
  description?: string;
  floors: Floor[];
  provenance: DataProvenance;
  appearancePreset?: string;
  appearance?: any; // Partial<BuildingAppearance>
};

export type Campus = {
  id: string;
  name: string;
  buildings: Building[];
};
