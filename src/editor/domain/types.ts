import type { RoomKind } from '../../domain/campus/types';
import type { Vec2 } from '../../domain/geometry/types';

export type Rect2D = {
  center: Vec2;
  size: [width: number, depth: number];
  rotation?: number; // radians around Y (0 = axis aligned)
};

export type IndoorElementType =
  | 'room'
  | 'corridor'
  | 'hall'
  | 'lobby'
  | 'entrance'
  | 'exit'
  | 'door'
  | 'window'
  | 'stairs'
  | 'elevator'
  | 'wall'
  | 'partition'
  | 'custom';

export type OutdoorElementType =
  | 'path'
  | 'walkway'
  | 'road'
  | 'lawn'
  | 'tree'
  | 'plaza'
  | 'fountain'
  | 'entrance'
  | 'custom';

export type EditorLayerId =
  | 'buildings'
  | 'paths'
  | 'greenery'
  | 'infrastructure'
  | 'annotations';

export type ShapeKind = 'rect' | 'polygon' | 'polyline' | 'point';

export type ExportReferenceScope = 'all' | 'changed-only';

/**
 * Metadata for an attached reference photograph.
 * Binary image bytes are stored separately by `fileId` in attachmentStorage,
 * keeping `EditorDocument` and `geometry.json` free of base64 image bloat.
 */
export type PhotoAttachment = {
  /** Unique attachment record ID */
  id: string;
  /** Stable binary file key in attachmentStorage */
  fileId: string;
  /** Display or user-edited filename (e.g. "hall_reference_01.jpg") */
  fileName: string;
  /** MIME type ("image/jpeg", "image/png", "image/webp", etc.) */
  mimeType: string;
  /** Original file byte size */
  byteSize: number;
  /** Optional pixel width */
  width?: number;
  /** Optional pixel height */
  height?: number;
  /** Optional short title */
  title?: string;
  /** Optional description of what the photo shows */
  caption?: string;
  /** Optional instruction or note for the AI */
  aiInstruction?: string;
  /** Optional photographed direction or viewpoint (e.g. "From main entrance looking North") */
  direction?: string;
  /** ISO timestamp when attached */
  createdAt: string;
  /** Display order index (0-based) */
  order: number;
};

export type EditorRoom = {
  id: string;
  number: string;
  name?: string;
  kind: RoomKind;
  /** Detailed semantic type for visual floor editing (defaults to 'room' or inferred from kind) */
  elementType?: IndoorElementType;
  /** Shape representation: 'rect' (default), 'polygon', or 'polyline' (for walls/partitions) */
  shape?: ShapeKind;
  capacity?: number;
  description?: string;
  /** Natural-language instruction for AI describing intended layout adjustments */
  aiComment?: string;
  customMetadata?: Record<string, string>;
  /** Reference photographs attached to this indoor element */
  photos?: PhotoAttachment[];
  /** Center [lx, lz] relative to parent building center */
  localCenter: Vec2;
  /** Size [width, depth] in meters */
  size: [width: number, depth: number];
  rotation?: number;
  /** Local polygon or polyline vertices [[lx, lz], ...] relative to parent building center */
  polygon?: Vec2[];
  /** Optional stroke/wall thickness in meters (used for walls, partitions, doors, windows) */
  thickness?: number;
  provenance: 'confirmed' | 'demo';
};

export type EditorFloor = {
  id: string;
  level: number;
  name: string;
  description?: string;
  aiComment?: string;
  /** Reference photographs attached to this floor */
  photos?: PhotoAttachment[];
  rooms: EditorRoom[];
};

export type EditorBuilding = {
  id: string;
  name: string;
  shortName: string;
  description?: string;
  aiComment?: string;
  customMetadata?: Record<string, string>;
  /** Reference photographs attached to this building */
  photos?: PhotoAttachment[];
  /** World center [x, z] and dimensions [width, depth] in meters (primary footprint) */
  footprint: Rect2D;
  /** Additional or full multi-wing footprints in world meters (preserves U-shapes and complex wings) */
  parts?: Rect2D[];
  /** Optional polygon outline in world coordinates if reshaped as a polygon */
  polygon?: Vec2[];
  floors: EditorFloor[];
  floorCount: number;
  appearancePreset?: string;
  appearance?: any; // Partial<BuildingAppearance>
};

export type EditorOutdoorElement = {
  id: string;
  type: OutdoorElementType;
  name: string;
  description?: string;
  aiComment?: string;
  customMetadata?: Record<string, string>;
  /** Reference photographs attached to this outdoor element */
  photos?: PhotoAttachment[];
  layer: EditorLayerId;
  shape: ShapeKind;
  /** World center [x, z] in meters */
  center: Vec2;
  /** Bounding size [width, depth] in meters */
  size: [width: number, depth: number];
  rotation?: number;
  /** World vertices for polygon areas or polyline paths [[wx, wz], ...] */
  points?: Vec2[];
  /** Line width in meters for polylines (paths, sidewalks, roads, walkways) */
  width?: number;
  /** Optional visual color override */
  color?: string;
  /** Original context feature kind if mapped from reference-footprints */
  contextKind?: 'track' | 'pitch' | 'court' | 'lawn' | 'road' | 'structure';
  /** Connected building IDs if this is a connecting walkway */
  connectedBuildingIds?: [string, string];
};

export type EditorDocument = {
  schemaVersion: 1;
  campusId: string;
  name: string;
  description?: string;
  aiComment?: string;
  /** Reference photographs attached to the overall campus */
  photos?: PhotoAttachment[];
  lastModified: string;
  buildings: EditorBuilding[];
  outdoorElements?: EditorOutdoorElement[];
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
  type: 'none' | 'building' | 'floor' | 'room' | 'outdoor' | 'multi';
  buildingId?: string;
  floorId?: string;
  roomId?: string;
  outdoorId?: string;
  /** Selected IDs when multiple objects are selected on the current view */
  selectedIds?: string[];
};

export type CanvasViewport = {
  pan: { x: number; y: number };
  zoom: number; // pixels per meter
};

export type EditorTool =
  | 'select'
  | 'pan'
  | 'add-building'
  | 'add-room'
  | 'add-corridor'
  | 'add-hall'
  | 'add-wall'
  | 'add-door'
  | 'add-window'
  | 'add-stairs'
  | 'add-elevator'
  | 'add-entrance'
  | 'add-polygon-room'
  | 'add-path'
  | 'add-road'
  | 'add-lawn'
  | 'add-tree'
  | 'add-plaza'
  | 'add-fountain'
  | 'add-outdoor-entrance'
  | 'add-outdoor-custom';

export type ChangeCategory =
  | 'added'
  | 'modified'
  | 'moved'
  | 'resized'
  | 'renamed'
  | 'deleted';

export type SemanticChange = {
  id: string;
  targetId: string;
  targetType: 'campus' | 'building' | 'floor' | 'room' | 'outdoor';
  buildingId?: string;
  floorId?: string;
  name: string;
  semanticLabel: string;
  locationLabel: string;
  primaryCategory: ChangeCategory;
  categories: ChangeCategory[];
  summary: string;
  aiComment?: string;
  before: any | null;
  after: any | null;
};

export type ValidationIssue = {
  id: string;
  targetId: string;
  targetType: 'campus' | 'building' | 'floor' | 'room' | 'outdoor';
  message: string;
  severity: 'error' | 'warning';
};


