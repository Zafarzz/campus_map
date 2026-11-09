import type { CampusIndex } from './campusIndex';
import type { Building, Campus } from './types';

export const DEFAULT_BUILDING_LABELS: Record<string, string> = {
  'bld-h': 'Block A (Main Academic)',
  'bld-g': 'Block B (Seminar & Exhibition)',
  'bld-i': 'Block C (Lecture Halls & Arena)',
  'bld-c': 'Block D (Engineering Labs)',
  'bld-b': 'Block E (Architecture Studios)',
  'bld-d': 'Block F (Amphitheatres & Library)',
  'bld-e': 'Halls Building (Events & Tennis)',
  'bld-j': 'Student Dormitory',
};

export function formatBuildingDisplayLabel(building: Building): string {
  if (DEFAULT_BUILDING_LABELS[building.id] && building.name.startsWith('Building ')) {
    return DEFAULT_BUILDING_LABELS[building.id];
  }
  if (building.shortName && !building.name.includes(`Block ${building.shortName}`)) {
    return `Block ${building.shortName} (${building.name})`;
  }
  return building.name;
}

export function getBuildingDisplayLabel(
  buildingId: string | null | undefined,
  index?: CampusIndex,
): string {
  if (!buildingId) return 'Campus Grounds';
  const normalizedId = buildingId === 'bld-f' ? 'bld-d' : buildingId;
  const fromIndex = index?.buildings.get(normalizedId);
  if (fromIndex) {
    return DEFAULT_BUILDING_LABELS[normalizedId] ?? formatBuildingDisplayLabel(fromIndex);
  }
  return DEFAULT_BUILDING_LABELS[normalizedId] ?? buildingId;
}

export function buildBuildingLabelsMap(campus?: Campus): Record<string, string> {
  const map: Record<string, string> = { ...DEFAULT_BUILDING_LABELS };
  if (campus?.buildings) {
    for (const b of campus.buildings) {
      if (!map[b.id]) {
        map[b.id] = formatBuildingDisplayLabel(b);
      }
    }
  }
  return map;
}
