import { describe, expect, it } from 'vitest';
import {
  CampusFountain,
  FOUNTAIN_DIMENSIONS,
  FOUNTAIN_MATERIALS,
} from '../components/3d/CampusFountain';
import { demoCampus } from '../data/demo-campus';
import { geometryProvider } from '../services/geometry';

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

  it('verifies spatial positioning shifted 50m further from the East Main Entrance', () => {
    const campusGeom = geometryProvider.build(demoCampus);
    const pitch = campusGeom.context.find((f) => f.id === 'pitch');
    const court = campusGeom.context.find((f) => f.id === 'court');
    const kppE = campusGeom.context.find((f) => f.id === 'kpp-e');

    expect(pitch).toBeDefined();
    expect(court).toBeDefined();
    expect(kppE).toBeDefined();

    if (pitch?.footprint.type === 'rect' && kppE?.footprint.type === 'rect') {
      const [w, d] = pitch.footprint.size;
      expect(w).toBe(30.0);
      expect(d).toBe(51.0);

      const fountainX = pitch.footprint.center[0] - 50.0;
      expect(fountainX).toBeCloseTo(-2.45, 2);
      expect(kppE.footprint.center[0] - fountainX).toBeCloseTo(113.0, 1);
    }
  });

  it('exports valid React component CampusFountain', () => {
    expect(typeof CampusFountain).toBe('function');
  });
});
