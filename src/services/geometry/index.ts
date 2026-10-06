import { mapConfig } from '../../config/mapConfig';
import { buildingFootprintsPx, contextFeaturesPx } from '../../data/reference-footprints';
import type { CampusGeometryProvider } from '../../domain/geometry/types';
import { createScreenshotGeometryProvider } from './screenshotGeometryProvider';

/**
 * The ONE place that decides where geometry comes from.
 * Swap this for a floor-plan / GLTF provider when accurate data is available.
 */
export const geometryProvider: CampusGeometryProvider = createScreenshotGeometryProvider({
  buildingFootprintsPx,
  contextFeaturesPx,
  imageSizePx: mapConfig.reference.imageSizePx,
  metersPerPixel: mapConfig.reference.metersPerPixel,
  floorHeight: mapConfig.building.floorHeight,
  unknownStructureHeight: mapConfig.building.unknownStructureHeight,
  roomLayout: { ...mapConfig.roomLayout, slabThickness: mapConfig.building.slabThickness },
});
