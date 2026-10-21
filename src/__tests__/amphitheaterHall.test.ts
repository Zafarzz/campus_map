import { describe, it, expect } from 'vitest';
import { AMPHITHEATER_HALL } from '../data/amphitheater-hall';
import { buildingFootprintsPx, connectorsPx } from '../data/reference-footprints';
import { pxRectToMeters } from '../editor/domain/adapter';
import {
  getAmphitheaterFloorLogoTexture,
  getAmphitheaterScreenTexture,
  getBookshelfTexture,
  getGrilyatoTexture,
  getParquetFloorTexture,
  getSlateRoofTexture,
} from '../components/3d/amphitheater/amphitheaterTextures';

describe('Amphitheater Hall Architectural Specification (ADR-029)', () => {
  it('defines 20x17m hall dimensions matching 2D editor contour and CAD interior', () => {
    expect(AMPHITHEATER_HALL.size).toEqual([20, 17]);
    expect(AMPHITHEATER_HALL.wallThickness).toBe(0.25);
    expect(AMPHITHEATER_HALL.ceiling.grilyatoHalfX * 2).toBe(16.0); // 16m Grilyato field along X
    expect(AMPHITHEATER_HALL.ceiling.grilyatoHalfY * 2).toBe(13.0); // 13m Grilyato field along Y
    expect(AMPHITHEATER_HALL.ceiling.soffitHigh).toBe(8.5); // +8.50m ceiling elevation
  });

  it('fits between Block B and Block A in world space without collision', () => {
    const bldG = pxRectToMeters(buildingFootprintsPx['bld-g'][0]);
    const bldH = pxRectToMeters(buildingFootprintsPx['bld-h'][0]);
    const hall = AMPHITHEATER_HALL;

    const bldGSouthEdge = bldG.center[1] + bldG.size[1] / 2; // South face of Block B (~66.9m)
    const bldHNorthEdge = bldH.center[1] - bldH.size[1] / 2; // North face of Block A (~84.9m)

    const hallNorthEdge = hall.center[1] - hall.size[1] / 2; // 76.5 - 8.5 = 68.0m
    const hallSouthEdge = hall.center[1] + hall.size[1] / 2; // 76.5 + 8.5 = 85.0m

    // Hall North edge meets Block B's south face flush with zero gap (ADR-029)
    expect(hallNorthEdge).toBeCloseTo(bldGSouthEdge, 1);
    // Hall South edge must meet Block A's north face
    expect(hallSouthEdge).toBeCloseTo(bldHNorthEdge, 0);
  });

  it('aligns East gallery annex with the Block B <-> Block C walkway', () => {
    const connBToC = connectorsPx.find((c) => c.id === 'conn-bld-g-bld-i');
    expect(connBToC).toBeDefined();

    const connMeters = pxRectToMeters(connBToC!.rect);
    const connWestEdge = connMeters.center[0] - connMeters.size[0] / 2;

    const hallEastAnnexEdge = AMPHITHEATER_HALL.center[0] + AMPHITHEATER_HALL.east.gallery.x1;
    // The east gallery extension (x1 = +12.2m from hall center) touches the walkway
    expect(hallEastAnnexEdge).toBeCloseTo(connWestEdge, 0);
  });

  it('models octagonal floor bowl and 3 amphitheater tiers matching CAD sheet 1', () => {
    const bowl = AMPHITHEATER_HALL.floor.bowl;
    expect(bowl.rx).toBe(7.6);
    expect(bowl.ry).toBe(6.1);
    expect(bowl.chamfer).toBe(2.6);
    // Straight side along X: 2 * (rx - chamfer) = 2 * (7.6 - 2.6) = 10.0m
    const straightSideX = 2 * (bowl.rx - bowl.chamfer);
    expect(straightSideX).toBeCloseTo(10.0, 2);

    expect(AMPHITHEATER_HALL.tiers).toHaveLength(3);
    expect(AMPHITHEATER_HALL.tiers[0].top).toBe(0.45);
    expect(AMPHITHEATER_HALL.tiers[1].top).toBe(0.90);
    expect(AMPHITHEATER_HALL.tiers[2].top).toBe(1.35);

    // Tier 3 outer contour is a 20x17m rectangle (chamfer 0.0)
    expect(AMPHITHEATER_HALL.tiers[2].outer.rx).toBe(10.0);
    expect(AMPHITHEATER_HALL.tiers[2].outer.ry).toBe(8.5);
    expect(AMPHITHEATER_HALL.tiers[2].outer.chamfer).toBe(0.0);
  });

  it('configures 3 central staircases of width 2.80m, depth 2.40m, 6 steps', () => {
    const stairs = AMPHITHEATER_HALL.stairs;
    expect(stairs.width).toBe(2.8);
    expect(stairs.depth).toBe(2.4);
    expect(stairs.steps).toBe(6);
    expect(stairs.rise * stairs.steps).toBeCloseTo(1.35, 2);
    expect(stairs.flights).toHaveLength(3);
    const ids = stairs.flights.map((f) => f.id);
    expect(ids).toContain('east');
    expect(ids).toContain('west');
    expect(ids).toContain('south');
  });

  it('specifies giant North stage and LED screen matching CAD sheet 2', () => {
    const stage = AMPHITHEATER_HALL.stage;
    expect(stage.rect[2] - stage.rect[0]).toBeCloseTo(6.4, 2); // 6.40m width
    expect(stage.top).toBe(1.35);

    const screen = AMPHITHEATER_HALL.north.screen;
    expect(screen.x1 - screen.x0).toBeCloseTo(6.4, 2); // 6.40m width
    expect(screen.z1 - screen.z0).toBeCloseTo(3.5, 2); // 3.50m height
    expect(screen.z0).toBe(2.6); // Bottom at +2.60m
    expect(screen.z1).toBe(6.1); // Top at +6.10m
  });

  it('specifies 5x5 LED ceiling matrix on regular grid', () => {
    const led = AMPHITHEATER_HALL.ceiling;
    expect(led.ledCoordsX).toEqual([-6.4, -3.2, 0.0, 3.2, 6.4]);
    expect(led.ledCoordsY).toEqual([-4.8, -2.4, 0.0, 2.4, 4.8]);
    // Spacing between panels along X is 3.20m
    for (let i = 1; i < led.ledCoordsX.length; i++) {
      expect(led.ledCoordsX[i] - led.ledCoordsX[i - 1]).toBeCloseTo(3.2, 2);
    }
  });

  it('generates procedural canvas textures safely in Node / jsdom / browser environments', () => {
    // In headless Node without document, these return null gracefully without crashing.
    // In browser/jsdom, they return THREE.CanvasTexture.
    expect(() => {
      getAmphitheaterFloorLogoTexture();
      getBookshelfTexture();
      getAmphitheaterScreenTexture();
      getGrilyatoTexture();
      getParquetFloorTexture();
      getSlateRoofTexture();
    }).not.toThrow();
  });
});
