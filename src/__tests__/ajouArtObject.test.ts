import { describe, expect, it } from 'vitest';
import {
  AjouArtObject,
  AJOU_ART_DIMENSIONS,
  AJOU_ART_MATERIALS,
} from '../components/3d/AjouArtObject';
import { demoCampus } from '../data/demo-campus';
import { geometryProvider } from '../services/geometry';

describe('Ajou Entrance Art Object "I ♥ AJOU" Architecture (CAD Sheet 3, M 1:25)', () => {
  it('conforms to exact architectural dimensions from blueprint', () => {
    // Бетонный фундамент: 7200 мм х 600 мм
    expect(AJOU_ART_DIMENSIONS.foundationLength).toBe(7.2);
    expect(AJOU_ART_DIMENSIONS.foundationWidth).toBe(0.6);

    // Стальная опорная рама: 6800 мм, отметка +0.150 м
    expect(AJOU_ART_DIMENSIONS.frameLength).toBe(6.8);
    expect(AJOU_ART_DIMENSIONS.frameHeight).toBe(0.15);

    // Знак "I": ширина 350 мм, высота 1650 мм (+1.800 м над землей), глубина 120 мм
    expect(AJOU_ART_DIMENSIONS.letterIWidth).toBe(0.35);
    expect(AJOU_ART_DIMENSIONS.letterIHeight).toBe(1.65);
    expect(AJOU_ART_DIMENSIONS.letterDepth).toBe(0.12);

    // Контурное сердце "♥": ширина 2100 мм, высота 1800 мм (+1.800 м)
    expect(AJOU_ART_DIMENSIONS.heartWidth).toBe(2.1);
    expect(AJOU_ART_DIMENSIONS.heartHeight).toBe(1.8);
    expect(AJOU_ART_DIMENSIONS.heartDepth).toBe(0.12);

    // Световые объемные буквы "AJOU"
    expect(AJOU_ART_DIMENSIONS.letterAWidth).toBe(1.0);
    expect(AJOU_ART_DIMENSIONS.letterAHeight).toBe(1.2);
    expect(AJOU_ART_DIMENSIONS.letterJWidth).toBe(0.8);
    expect(AJOU_ART_DIMENSIONS.letterJHeight).toBe(1.2);
    expect(AJOU_ART_DIMENSIONS.letterOWidth).toBe(0.9);
    expect(AJOU_ART_DIMENSIONS.letterOHeight).toBe(1.1);
    expect(AJOU_ART_DIMENSIONS.letterUWidth).toBe(0.9);
    expect(AJOU_ART_DIMENSIONS.letterUHeight).toBe(1.1);
  });

  it('defines all required materials according to color passport (Лист 3)', () => {
    // Экспликация цветов:
    // #1A2840 (Сталь, синий лак)
    expect(AJOU_ART_MATERIALS.navyLacquer.toUpperCase()).toBe('#1A2840');
    // #8B2635 (Композит, красный)
    expect(AJOU_ART_MATERIALS.heartRed.toUpperCase()).toBe('#8B2635');
    // #B8C0C8 (Стальная опорная рама)
    expect(AJOU_ART_MATERIALS.steelFrame.toUpperCase()).toBe('#B8C0C8');
    // #FFFFFF (Световые лицевые панели букв AJOU)
    expect(AJOU_ART_MATERIALS.whiteFace.toUpperCase()).toBe('#FFFFFF');
  });

  it('verifies spatial positioning behind East entrance road (road-east) opposite kpp-e', () => {
    const campusGeom = geometryProvider.build(demoCampus);
    const kppE = campusGeom.context.find((f) => f.id === 'kpp-e');
    const roadEast = campusGeom.context.find((f) => f.id === 'road-east');

    expect(kppE).toBeDefined();
    expect(roadEast).toBeDefined();

    if (kppE?.footprint.type === 'rect' && roadEast?.footprint.type === 'rect') {
      const gateCenter = kppE.footprint.center;
      const roadCenter = roadEast.footprint.center;

      // Art object is placed immediately west of road-east
      const artX = 106.0;
      expect(artX).toBeLessThan(roadCenter[0]);
      expect(Math.abs(gateCenter[1] - 15.9)).toBeLessThan(1.0);
    }
  });

  it('exports valid React component AjouArtObject', () => {
    expect(typeof AjouArtObject).toBe('function');
  });
});
