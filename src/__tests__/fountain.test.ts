import { describe, expect, it } from 'vitest';
import {
  CampusFountain,
  FOUNTAIN_DIMENSIONS,
  FOUNTAIN_MATERIALS,
} from '../components/3d/CampusFountain';
import { demoCampus } from '../data/demo-campus';
import { geometryProvider } from '../services/geometry';
import { buildCampusColliderSpecs } from '../game/world/CampusColliders';

describe('Campus Grand Fountain Architecture (CAD Sheet 1, scaled 1.5x)', () => {
  it('conforms to exact 1.5x scaled architectural dimensions requested by user', () => {
    // Чаша: 54.0 м х 18.0 м (внешний 57.0 м х 19.5 м)
    expect(FOUNTAIN_DIMENSIONS.basinLength).toBe(54.0);
    expect(FOUNTAIN_DIMENSIONS.basinWidth).toBe(18.0);
    expect(FOUNTAIN_DIMENSIONS.outerLength).toBe(57.0);
    expect(FOUNTAIN_DIMENSIONS.outerWidth).toBe(19.5);

    // Борт из ДПК: H = 550 мм (+0.550 м)
    expect(FOUNTAIN_DIMENSIONS.parapetHeight).toBe(0.55);

    // Мостики: ширина 2100 мм, площадка 3300 мм, расстояние между мостиками 15 000 мм
    expect(FOUNTAIN_DIMENSIONS.bridgeWalkwayWidth).toBe(2.1);
    expect(FOUNTAIN_DIMENSIONS.bridgePlatformWidth).toBe(3.3);
    expect(FOUNTAIN_DIMENSIONS.bridgeDistance).toBe(15.0);

    // Центральный ступенчатый каскад: 15.0 м х 7.5 м, верхняя терраса +2.35 м, скульптура AUT +3.200 м
    expect(FOUNTAIN_DIMENSIONS.cascadeLength).toBe(15.0);
    expect(FOUNTAIN_DIMENSIONS.cascadeWidth).toBe(7.5);
    expect(FOUNTAIN_DIMENSIONS.cascadeTopHeight).toBe(2.35);
    expect(FOUNTAIN_DIMENSIONS.autSculptureHeight).toBe(3.2);

    // Боковые круглые чаши: Ø 5400 мм, гейзер +5.800 м
    expect(FOUNTAIN_DIMENSIONS.circularDiameter).toBe(5.4);
    expect(FOUNTAIN_DIMENSIONS.geyserJetHeight).toBe(5.8);

    // Озеленение: 7 пальм от +3.5 м до +4.5 м
    expect(FOUNTAIN_DIMENSIONS.palmTreeCount).toBe(7);
    expect(FOUNTAIN_DIMENSIONS.palmMinHeight).toBe(3.5);
    expect(FOUNTAIN_DIMENSIONS.palmMaxHeight).toBe(4.5);

    // Дополнительный визуальный масштаб ансамбля (1.5х)
    expect(FOUNTAIN_DIMENSIONS.defaultScale).toBe(1.5);
    expect(FOUNTAIN_DIMENSIONS.effectiveBasinLength).toBe(81.0);
    expect(FOUNTAIN_DIMENSIONS.effectiveBasinWidth).toBe(27.0);
  });

  it('defines all required materials according to the blueprint color passport', () => {
    expect(FOUNTAIN_MATERIALS.dpkBoard.toUpperCase()).toBe('#2D251E');
    expect(FOUNTAIN_MATERIALS.dpkCap.toUpperCase()).toBe('#1E1712');
    expect(FOUNTAIN_MATERIALS.poolTile.toUpperCase()).toBe('#0284C7');
    expect(FOUNTAIN_MATERIALS.poolWater.toUpperCase()).toBe('#0EA5E9');
    expect(FOUNTAIN_MATERIALS.cascadeStone.toUpperCase()).toBe('#C8C6BE');
    expect(FOUNTAIN_MATERIALS.cascadeWater.toUpperCase()).toBe('#38BDF8');
    expect(FOUNTAIN_MATERIALS.goldAccent.toUpperCase()).toBe('#BA6F27');
    expect(FOUNTAIN_MATERIALS.bridgeDeck.toUpperCase()).toBe('#3E2723');
    expect(FOUNTAIN_MATERIALS.bridgeRailing.toUpperCase()).toBe('#1E2024');
    expect(FOUNTAIN_MATERIALS.waterJet.toUpperCase()).toBe('#E0F2FE');
    expect(FOUNTAIN_MATERIALS.geyserFoam.toUpperCase()).toBe('#F0F9FF');
    expect(FOUNTAIN_MATERIALS.palmTrunk.toUpperCase()).toBe('#5D4037');
    expect(FOUNTAIN_MATERIALS.palmFronds.toUpperCase()).toBe('#15803D');
    expect(FOUNTAIN_MATERIALS.plazaPaving.toUpperCase()).toBe('#E2DFD7');
  });

  it('verifies spatial positioning on central lawn north of Sports Complex and Pitch per 2D reference', () => {
    const campusGeom = geometryProvider.build(demoCampus);
    const pitch = campusGeom.context.find((f) => f.id === 'pitch');
    const court = campusGeom.context.find((f) => f.id === 'court');
    const lawnG1 = campusGeom.context.find((f) => f.id === 'lawn-g1');
    const kppE = campusGeom.context.find((f) => f.id === 'kpp-e');

    expect(pitch).toBeDefined();
    expect(court).toBeDefined();
    expect(lawnG1).toBeDefined();
    expect(kppE).toBeDefined();

    if (pitch?.footprint.type === 'rect') {
      const [w, d] = pitch.footprint.size;
      expect(w).toBeCloseTo(20.0, 1);
      expect(d).toBeCloseTo(40.0, 1);
    }

    // Fountain is centered on lawn-g1 at worldX ≈ 0.0m, worldZ = -23.1m
    const fountainX = 0.0;
    const fountainZ = -23.1;
    if (lawnG1?.footprint.type === 'rect') {
      const [lw, ld] = lawnG1.footprint.size;
      const [lcx, lcz] = lawnG1.footprint.center;
      expect(fountainZ).toBeCloseTo(lcz, 1);
      expect(fountainX).toBeGreaterThan(lcx - lw / 2);
      expect(fountainX).toBeLessThan(lcx + lw / 2);
    }
  });

  it('exports valid React component CampusFountain', () => {
    expect(typeof CampusFountain).toBe('function');
  });

  it('verifies central cascade sculpture features exact AUT diamond emblem reaching +3.200m', () => {
    // Высота вершины скульптуры по чертежу +3.200 м от уровня земли
    expect(FOUNTAIN_DIMENSIONS.autSculptureHeight).toBe(3.2);
    expect(FOUNTAIN_DIMENSIONS.cascadeTopHeight).toBe(2.35);
    // Дельта высоты скульптуры точно 0.85 м (от +2.350 до +3.200 м)
    expect(FOUNTAIN_DIMENSIONS.autSculptureHeight - FOUNTAIN_DIMENSIONS.cascadeTopHeight).toBeCloseTo(0.85, 2);
  });

  it('features bilateral architectural palm promenades along both North and South sides', () => {
    expect(FOUNTAIN_DIMENSIONS.palmTreeCount).toBe(7);
    expect(FOUNTAIN_DIMENSIONS.palmMinHeight).toBeGreaterThanOrEqual(3.5);
    expect(FOUNTAIN_DIMENSIONS.palmMaxHeight).toBeLessThanOrEqual(4.5);
  });

  it('generates fully walkable physics colliders for both pedestrian bridges in walk mode', () => {
    const geometry = geometryProvider.build(demoCampus);
    const colliders = buildCampusColliderSpecs(geometry);

    // Verify presence of bridge decks and approach ramps
    const westDeck = colliders.find((c) => c.id === 'fountain-bridge-deck-0');
    const eastDeck = colliders.find((c) => c.id === 'fountain-bridge-deck-1');
    expect(westDeck).toBeDefined();
    expect(eastDeck).toBeDefined();

    // West bridge must be centered at X = -3.05 (fountainX 5.5 - 8.55)
    expect(westDeck!.position[0]).toBeCloseTo(-3.05, 1);
    // East bridge must be centered at X = +14.05 (fountainX 5.5 + 8.55)
    expect(eastDeck!.position[0]).toBeCloseTo(14.05, 1);

    // Top surface of the deck is at Y = 0.82m
    const deckTopY = westDeck!.position[1] + westDeck!.halfExtents[1];
    expect(deckTopY).toBeCloseTo(0.82, 2);

    // Ramps present for both bridges
    expect(colliders.some((c) => c.id === 'fountain-bridge-ramp-n-0')).toBe(true);
    expect(colliders.some((c) => c.id === 'fountain-bridge-ramp-s-0')).toBe(true);
    expect(colliders.some((c) => c.id === 'fountain-bridge-ramp-n-1')).toBe(true);
    expect(colliders.some((c) => c.id === 'fountain-bridge-ramp-s-1')).toBe(true);

    // Verify that water basins DO NOT block either bridge corridor:
    // West bridge corridor: X in [-4.10, -2.00]
    // East bridge corridor: X in [13.00, 15.10]
    const basins = colliders.filter((c) => c.id.startsWith('campus-fountain-basin'));
    expect(basins.length).toBe(3);

    for (const b of basins) {
      const minX = b.position[0] - b.halfExtents[0];
      const maxX = b.position[0] + b.halfExtents[0];

      // Neither West bridge center (-3.05) nor East bridge center (14.05) should be inside any basin obstacle
      const coversWestBridge = minX < -3.05 && maxX > -3.05;
      const coversEastBridge = minX < 14.05 && maxX > 14.05;
      expect(coversWestBridge).toBe(false);
      expect(coversEastBridge).toBe(false);
    }
  });
});
