import { mapConfig } from '../../config/mapConfig';
import { accurateRoomOverrides } from '../../data/floor-plans';
import { buildingFootprintsPx, connectorsPx, contextFeaturesPx } from '../../data/reference-footprints';
import type { Campus } from '../../domain/campus/types';
import type { CampusGeometry, CampusGeometryProvider } from '../../domain/geometry/types';
import { getActiveEditorOverrides } from '../campus/campusService';
import { createScreenshotGeometryProvider } from './screenshotGeometryProvider';

const baseProvider = createScreenshotGeometryProvider({
  buildingFootprintsPx,
  contextFeaturesPx,
  connectorsPx,
  imageSizePx: mapConfig.reference.imageSizePx,
  metersPerPixel: mapConfig.reference.metersPerPixel,
  floorHeight: mapConfig.building.floorHeight,
  unknownStructureHeight: mapConfig.building.unknownStructureHeight,
  roomLayout: { ...mapConfig.roomLayout, slabThickness: mapConfig.building.slabThickness },
  roomOverrides: accurateRoomOverrides,
});

/**
 * The ONE place that decides where geometry comes from.
 * Uses exact CAD-derived room geometry overrides for confirmed buildings and procedural fallback.
 * Dynamically incorporates user modifications from the 2D editor if present.
 */
export const geometryProvider: CampusGeometryProvider = {
  name: 'screenshot-trace',
  build(campus: Campus): CampusGeometry {
    const overrides = getActiveEditorOverrides();
    if (overrides.buildingFootprintsPx && Object.keys(overrides.buildingFootprintsPx).length > 0) {
      const dynamicProvider = createScreenshotGeometryProvider({
        buildingFootprintsPx: { ...buildingFootprintsPx, ...overrides.buildingFootprintsPx },
        contextFeaturesPx: overrides.contextFeaturesPx ?? contextFeaturesPx,
        connectorsPx,
        imageSizePx: mapConfig.reference.imageSizePx,
        metersPerPixel: mapConfig.reference.metersPerPixel,
        floorHeight: mapConfig.building.floorHeight,
        unknownStructureHeight: mapConfig.building.unknownStructureHeight,
        roomLayout: { ...mapConfig.roomLayout, slabThickness: mapConfig.building.slabThickness },
        roomOverrides: { ...accurateRoomOverrides, ...(overrides.roomOverrides || {}) },
      });
      return dynamicProvider.build(campus);
    }
    return baseProvider.build(campus);
  },
};

