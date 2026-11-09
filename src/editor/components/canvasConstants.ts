import type { RoomKind } from '../../domain/campus/types';
import type { EditorLayerId, IndoorElementType, OutdoorElementType } from '../domain/types';

export type HandleType = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const HANDLE_CURSORS: Record<HandleType, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
};

export const LAYER_BUTTON_ITEMS: readonly [EditorLayerId, string][] = [
  ['buildings', '🏢 Buildings'],
  ['paths', '🛣️ Paths & Roads'],
  ['greenery', '🌳 Greenery'],
  ['infrastructure', '⛲ Plazas & Fountain'],
  ['annotations', '💬 Labels & AI'],
];

export const INDOOR_STYLES: Record<
  string,
  { fill: string; border: string; text: string; badge: string }
> = {
  classroom: { fill: '#eff6ff', border: '#3b82f6', text: '#1e3a8a', badge: 'Room' },
  room: { fill: '#eff6ff', border: '#3b82f6', text: '#1e3a8a', badge: 'Room' },
  lab: { fill: '#ecfdf5', border: '#10b981', text: '#065f46', badge: 'Lab' },
  office: { fill: '#fffbeb', border: '#f59e0b', text: '#92400e', badge: 'Office' },
  hall: { fill: '#eef2ff', border: '#6366f1', text: '#312e81', badge: 'Hall' },
  lobby: { fill: '#f5f3ff', border: '#8b5cf6', text: '#4c1d95', badge: 'Lobby' },
  corridor: { fill: '#f1f5f9', border: '#64748b', text: '#334155', badge: 'Corridor' },
  stairs: { fill: '#fef3c7', border: '#d97706', text: '#78350f', badge: '🪜 Stairs' },
  elevator: { fill: '#fae8ff', border: '#c026d3', text: '#701a75', badge: '🛗 Lift' },
  door: { fill: '#dcfce7', border: '#16a34a', text: '#14532d', badge: '🚪 Door' },
  window: { fill: '#e0f2fe', border: '#0284c7', text: '#0c4a6e', badge: '🪟 Win' },
  entrance: { fill: '#bbf7d0', border: '#15803d', text: '#14532d', badge: '🚩 Entrance' },
  exit: { fill: '#fee2e2', border: '#dc2626', text: '#7f1d1d', badge: '🏃 Exit' },
  wall: { fill: '#475569', border: '#1e293b', text: '#ffffff', badge: 'Wall' },
  partition: { fill: '#94a3b8', border: '#475569', text: '#0f172a', badge: 'Partition' },
  custom: { fill: '#f3f4f6', border: '#4b5563', text: '#1f2937', badge: 'Custom' },
  other: { fill: '#f1f5f9', border: '#64748b', text: '#334155', badge: 'Space' },
};

export const OUTDOOR_STYLES: Record<
  string,
  { fill: string; border: string; text: string; icon: string }
> = {
  lawn: { fill: '#dcfce7', border: '#22c55e', text: '#14532d', icon: '🌿' },
  tree: { fill: '#bbf7d0', border: '#16a34a', text: '#14532d', icon: '🌳' },
  path: { fill: '#e2e8f0', border: '#64748b', text: '#1e293b', icon: '🚶' },
  walkway: { fill: '#ede9fe', border: '#7c3aed', text: '#4c1d95', icon: '🌉' },
  road: { fill: '#cbd5e1', border: '#475569', text: '#0f172a', icon: '🛣️' },
  plaza: { fill: '#fef3c7', border: '#d97706', text: '#78350f', icon: '🏟️' },
  fountain: { fill: '#e0f2fe', border: '#0284c7', text: '#0c4a6e', icon: '⛲' },
  entrance: { fill: '#f1f5f9', border: '#0f172a', text: '#0f172a', icon: '⛩️' },
  custom: { fill: '#f3f4f6', border: '#6b7280', text: '#1f2937', icon: '📍' },
};

export const INDOOR_ELEMENT_TYPES: { label: string; value: IndoorElementType }[] = [
  { label: '🏫 Room / Classroom', value: 'room' },
  { label: '🚶 Corridor / Passage', value: 'corridor' },
  { label: '🏛️ Hall / Auditorium', value: 'hall' },
  { label: '🛋️ Lobby / Foyer', value: 'lobby' },
  { label: '🚪 Door', value: 'door' },
  { label: '🪟 Window', value: 'window' },
  { label: '🪜 Stairs / Staircase', value: 'stairs' },
  { label: '🛗 Elevator', value: 'elevator' },
  { label: '🚩 Entrance', value: 'entrance' },
  { label: '🏃 Exit', value: 'exit' },
  { label: '🧱 Wall (Structural)', value: 'wall' },
  { label: '📏 Partition / Divider', value: 'partition' },
  { label: '📦 Custom Object', value: 'custom' },
];

export const ROOM_KINDS: { label: string; value: RoomKind }[] = [
  { label: 'Classroom (Аудитория)', value: 'classroom' },
  { label: 'Laboratory (Лаборатория)', value: 'lab' },
  { label: 'Office / Faculty (Офис)', value: 'office' },
  { label: 'Hall / Common Space (Зал)', value: 'hall' },
  { label: 'Library / Study Space (Коворкинг/Библиотека)', value: 'library' },
  { label: 'Other / Service (Прочее)', value: 'other' },
];

export const OUTDOOR_TYPES: { label: string; value: OutdoorElementType; layer: EditorLayerId }[] = [
  { label: '🚶 Pedestrian Path / Sidewalk', value: 'path', layer: 'paths' },
  { label: '🌉 Connecting Walkway', value: 'walkway', layer: 'paths' },
  { label: '🛣️ Road / Driveway', value: 'road', layer: 'paths' },
  { label: '🌿 Green Area / Lawn', value: 'lawn', layer: 'greenery' },
  { label: '🌳 Tree / Vegetation', value: 'tree', layer: 'greenery' },
  { label: '🏟️ Plaza / Open Space / Court', value: 'plaza', layer: 'infrastructure' },
  { label: '⛲ Fountain / Water Feature', value: 'fountain', layer: 'infrastructure' },
  { label: '⛩️ Campus Entrance / Gate', value: 'entrance', layer: 'infrastructure' },
  { label: '📍 Custom Outdoor Object', value: 'custom', layer: 'annotations' },
];
