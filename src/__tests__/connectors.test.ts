import { describe, it, expect } from 'vitest';
import { demoCampus } from '../data/demo-campus';
import { connectorsPx } from '../data/reference-footprints';
import { geometryProvider } from '../services/geometry';
import { createCampusIndex } from '../domain/campus/campusIndex';
import { search } from '../services/search/searchService';

describe('Campus Building Connectors & Block C Hall (ADR-020)', () => {
  it('defines connectorsPx touching connected buildings in pixel space', () => {
    expect(connectorsPx.length).toBe(3);

    const bToC = connectorsPx.find((c) => c.id === 'conn-bld-g-bld-i');
    expect(bToC).toBeDefined();
    expect(bToC?.buildingIds).toEqual(['bld-g', 'bld-i']);
    expect(bToC?.floorCount).toBe(2); // Two storeys (ADR-029)
    expect(bToC?.kind).toBe('enclosed-corridor');

    const aToC = connectorsPx.find((c) => c.id === 'conn-bld-h-bld-i');
    expect(aToC).toBeDefined();
    expect(aToC?.buildingIds).toEqual(['bld-h', 'bld-i']);
    expect(aToC?.floorCount).toBe(2); // Two storeys (ADR-029)
    expect(aToC?.kind).toBe('enclosed-corridor');

    const fToE = connectorsPx.find((c) => c.id === 'conn-bld-d-bld-b');
    expect(fToE).toBeDefined();
    expect(fToE?.buildingIds).toEqual(['bld-d', 'bld-b']);
    expect(fToE?.floorCount).toBe(1); // One storey connector hall
    expect(fToE?.kind).toBe('enclosed-corridor');
  });

  it('generates ConnectorGeometry in CampusGeometry via geometryProvider', () => {
    const campusGeom = geometryProvider.build(demoCampus);
    expect(campusGeom.connectors).toBeDefined();
    expect(campusGeom.connectors.length).toBe(3);

    for (const conn of campusGeom.connectors) {
      expect(conn.kind).toBe('enclosed-corridor');
      expect(conn.elevation).toBe(0); // Ground level
      expect([3.6, 7.2]).toContain(conn.height);
      expect(conn.precision).toBe('approximate');
      expect(conn.footprint.type).toBe('rect');
      if (conn.footprint.type === 'rect') {
        const [w, d] = conn.footprint.size;
        const length = Math.max(w, d);
        const width = Math.min(w, d);
        expect(length).toBeGreaterThanOrEqual(14.0);
        expect(width).toBeGreaterThanOrEqual(6.8);
      }
    }
  });

  it('positions connector between Block B (bld-g) and Block C (bld-i) in world space (North-South)', () => {
    const campusGeom = geometryProvider.build(demoCampus);
    const connBToC = campusGeom.connectors.find((c) => c.id === 'conn-bld-g-bld-i')!;
    const bldG = campusGeom.buildings['bld-g'];
    const bldI = campusGeom.buildings['bld-i'];

    expect(bldG).toBeDefined();
    expect(bldI).toBeDefined();

    if (connBToC.footprint.type === 'rect') {
      const connCenterZ = connBToC.footprint.center[1];
      // In world coords: north is -Z, south is +Z.
      // bld-g is north (lower Z) of bld-i (higher Z).
      expect(connCenterZ).toBeGreaterThan(bldG.center[2]);
      expect(connCenterZ).toBeLessThan(bldI.center[2]);
    }
  });

  it('positions connector between Block A (bld-h) and Block C (bld-i) in world space (East-West)', () => {
    const campusGeom = geometryProvider.build(demoCampus);
    const connAToC = campusGeom.connectors.find((c) => c.id === 'conn-bld-h-bld-i')!;
    const bldH = campusGeom.buildings['bld-h'];
    const bldI = campusGeom.buildings['bld-i'];

    expect(bldH).toBeDefined();
    expect(bldI).toBeDefined();

    if (connAToC.footprint.type === 'rect') {
      const connCenterX = connAToC.footprint.center[0];
      // In world coords: west is -X, east is +X.
      // bld-h is west (lower X) of bld-i (higher X).
      expect(connCenterX).toBeGreaterThan(bldH.center[0]);
      expect(connCenterX).toBeLessThan(bldI.center[0]);
    }
  });

  it('verifies Block A has a single continuous wing without separate intersection', () => {
    const campusGeom = geometryProvider.build(demoCampus);
    const bldH = campusGeom.buildings['bld-h'];
    expect(bldH.parts).toHaveLength(1);
  });

  it('includes Hall inside Block C (C-conF) on 1F and allows searching it', () => {
    const bldC = demoCampus.buildings.find((b) => b.id === 'bld-i');
    expect(bldC).toBeDefined();
    const floor1 = bldC?.floors.find((f) => f.level === 1);
    expect(floor1).toBeDefined();

    const confHall = floor1?.rooms.find((r) => r.id === 'room-c-conf');
    expect(confHall).toBeDefined();
    expect(confHall?.kind).toBe('hall');
    expect(confHall?.name).toContain('Conference Hall');

    const index = createCampusIndex(demoCampus);
    const searchResults = search('Conference Hall', index, []);
    expect(searchResults.some((res) => res.roomId === 'room-c-conf')).toBe(true);

    const campusGeom = geometryProvider.build(demoCampus);
    const hallGeom = campusGeom.rooms['room-c-conf'];
    expect(hallGeom).toBeDefined();
    expect(hallGeom.type).toBe('box');
    expect(hallGeom.precision).toBe('surveyed');
  });

  it('matches all calibrated real-world building, hall, and sports dimensions at 0.3 m/px scale', () => {
    const campusGeom = geometryProvider.build(demoCampus);

    const expectRectSize = (part: { type: string; size?: [number, number] }, expW: number, expD: number) => {
      expect(part.type).toBe('rect');
      if (part.type === 'rect' && part.size) {
        expect(part.size[0]).toBeCloseTo(expW, 1);
        expect(part.size[1]).toBeCloseTo(expD, 1);
      }
    };

    // Academic buildings A–F
    expectRectSize(campusGeom.buildings['bld-h'].parts[0], 55.0, 24.0); // A: 55 × 24 m
    expectRectSize(campusGeom.buildings['bld-g'].parts[0], 55.0, 14.0); // B: 55 × 14 m
    expectRectSize(campusGeom.buildings['bld-i'].parts[0], 19.0, 48.0); // C: 48 × 19 m (vertical)
    expectRectSize(campusGeom.buildings['bld-c'].parts[0], 54.0, 20.0); // D: 54 × 20 m
    expectRectSize(campusGeom.buildings['bld-b'].parts[0], 55.0, 14.0); // E: 55 × 14 m

    // North Cluster D–F–E: D–F hall (12m span) + Block F (20 × 48 m vertical) + F–E hall (12m span, 1-storey)
    expectRectSize(campusGeom.buildings['bld-d'].parts[0], 12.0, 17.0); // D–F hall: 12m free span
    expectRectSize(campusGeom.buildings['bld-d'].parts[1], 20.0, 48.0); // F: 48 × 20 m (vertical)
    const connFE = campusGeom.connectors.find((c) => c.id === 'conn-bld-d-bld-b')!;
    expect(connFE.height).toBeCloseTo(3.6, 1); // 1-storey
    expectRectSize(connFE.footprint, 20.0, 12.0); // F–E hall: 12m free span

    // Sports Cluster
    expectRectSize(campusGeom.buildings['bld-e'].parts[0], 55.0, 35.0); // Sports Complex: 55 × 35 m
    const pitch = campusGeom.context.find((f) => f.id === 'pitch')!;
    const court = campusGeom.context.find((f) => f.id === 'court')!;
    const courtTennis = campusGeom.context.find((f) => f.id === 'court-tennis')!;
    expectRectSize(pitch.footprint, 20.0, 40.0); // Football pitch: 20 × 40 m
    expectRectSize(court.footprint, 30.0, 40.0); // Multi-sport court: 30 × 40 m
    expectRectSize(courtTennis.footprint, 27.3, 40.0); // Tennis section: ~27.3 × 40 m
  });
});

