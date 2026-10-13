import type { RoomKind } from '../../domain/campus/types';
import type { Vec2 } from '../../domain/geometry/types';

export type Rect2D = {
  center: Vec2;
  size: [width: number, depth: number];
  rotation?: number; // radians around Y (0 = axis aligned)
};

export type EditorRoom = {
  id: string;
  number: string;
  name?: string;
  kind: RoomKind;
  capacity?: number;
  /** Center [lx, lz] relative to parent building center */
  localCenter: Vec2;
  /** Size [width, depth] in meters */
  size: [width: number, depth: number];
  rotation?: number;
  provenance: 'confirmed' | 'demo';
};

export type EditorFloor = {
  id: string;
  level: number;
  name: string;
  rooms: EditorRoom[];
};

export type EditorBuilding = {
  id: string;
  name: string;
  shortName: string;
  description?: string;
  /** World center [x, z] and dimensions [width, depth] in meters */
  footprint: Rect2D;
  floors: EditorFloor[];
  floorCount: number;
  appearancePreset?: string;
  appearance?: any; // Partial<BuildingAppearance>
};

export type EditorDocument = {
  schemaVersion: 1;
  campusId: string;
  name: string;
  lastModified: string;
  buildings: EditorBuilding[];
};

export type VersionType = 'initial' | 'manual' | 'auto';

export type CampusVersion = {
  id: string;
  name: string;
  timestamp: string;
  type: VersionType;
  reason: string;
  document: EditorDocument;
};

export type EditorSelection = {
  type: 'none' | 'building' | 'floor' | 'room';
  buildingId?: string;
  floorId?: string;
  roomId?: string;
};

export type CanvasViewport = {
  pan: { x: number; y: number };
  zoom: number; // pixels per meter
};

export type EditorTool = 'select' | 'pan' | 'add-building' | 'add-room';

export type ValidationIssue = {
  id: string;
  targetId: string;
  targetType: 'building' | 'floor' | 'room';
  message: string;
  severity: 'error' | 'warning';
};
