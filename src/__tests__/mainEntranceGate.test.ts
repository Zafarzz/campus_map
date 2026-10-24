import { describe, expect, it } from 'vitest';
import {
  MAIN_ENTRANCE_MATERIALS,
  MAIN_ENTRANCE_WIDTH,
} from '../components/3d/MainEntranceGate';
import {
  getAjouBannerTexture,
  getAjouSteleTexture,
  getAutGateLogoTexture,
  getFenceTexture,
} from '../components/3d/facades/facadeTextures';
import { demoCampus } from '../data/demo-campus';
import { geometryProvider } from '../services/geometry';

describe('Main Entrance & Checkpoint (КПП AUT) Architecture', () => {
  it('conforms to 18.8m total width from CAD elevation blueprint', () => {
    expect(MAIN_ENTRANCE_WIDTH).toBe(18.8);
  });

  it('adheres to official Three.js color and lighting passport materials (К-1 through К-8, СВ-1, СВ-2, З-1, З-2, П-1, П-2, СВ-4)', () => {
    // К-1: Dark anthracite roof & drip edge (#2B2E34, RAL 7021)
    expect(MAIN_ENTRANCE_MATERIALS.k1_roof.toUpperCase()).toBe('#2B2E34');
    // К-2: Matte white fascia & soffit (#F2F7F5, RAL 9016)
    expect(MAIN_ENTRANCE_MATERIALS.k2_fascia.toUpperCase()).toBe('#F2F7F5');
    // К-3: Turquoise tinted glazing (#8BB0AD)
    expect(MAIN_ENTRANCE_MATERIALS.k3_glazing.toUpperCase()).toBe('#8BB0AD');
    // К-4: White marble walls (#ECECE9)
    expect(MAIN_ENTRANCE_MATERIALS.k4_marble.toUpperCase()).toBe('#ECECE9');
    // К-5: Graphite plinth (#4A4E54, RAL 7024)
    expect(MAIN_ENTRANCE_MATERIALS.k5_plinth.toUpperCase()).toBe('#4A4E54');
    // К-6: Bronze-gold AUT logo (#BA6F27, RAL 1036)
    expect(MAIN_ENTRANCE_MATERIALS.k6_logo.toUpperCase()).toBe('#BA6F27');
    // К-7: Brushed stainless steel turnstiles (#B8C0CB, RAL 9006)
    expect(MAIN_ENTRANCE_MATERIALS.k7_turnstiles.toUpperCase()).toBe('#B8C0CB');
    // К-8: Matte black metal gates & frame (#1E2024, RAL 9005)
    expect(MAIN_ENTRANCE_MATERIALS.k8_metal.toUpperCase()).toBe('#1E2024');
    // СВ-1: 4000K recessed LED downlight (#FFF3BD)
    expect(MAIN_ENTRANCE_MATERIALS.sv1_light.toUpperCase()).toBe('#FFF3BD');
    // СВ-2: Card reader amber indicator (#FFAA00)
    expect(MAIN_ENTRANCE_MATERIALS.sv2_indicator.toUpperCase()).toBe('#FFAA00');

    // З-1: Металлический забор RAL 7024 (#363A42)
    expect(MAIN_ENTRANCE_MATERIALS.z1_fenceMetal.toUpperCase()).toBe('#363A42');
    // З-2: Бетонный цоколь (#8C8982)
    expect(MAIN_ENTRANCE_MATERIALS.z2_fenceConcrete.toUpperCase()).toBe('#8C8982');
    // П-1: Шатровая кровля павильона RAL 9002 (#D8DDD6)
    expect(MAIN_ENTRANCE_MATERIALS.p1_pavilionRoof.toUpperCase()).toBe('#D8DDD6');
    // П-2: Белый профиль витража (#F7F7F5)
    expect(MAIN_ENTRANCE_MATERIALS.p2_pavilionFrame.toUpperCase()).toBe('#F7F7F5');
    // СВ-4: Мачта освещения LED 5000K (#FFF3B0)
    expect(MAIN_ENTRANCE_MATERIALS.sv4_mastLight.toUpperCase()).toBe('#FFF3B0');
    // Гранитная стела и инфо-баннер
    expect(MAIN_ENTRANCE_MATERIALS.steleStone.toUpperCase()).toBe('#2B2E34');
    expect(MAIN_ENTRANCE_MATERIALS.bannerNavy.toUpperCase()).toBe('#172554');
  });

  it('safely calls texture generators in node environment without throwing', () => {
    expect(() => getAutGateLogoTexture()).not.toThrow();
    expect(() => getAjouSteleTexture()).not.toThrow();
    expect(() => getAjouBannerTexture()).not.toThrow();
    expect(() => getFenceTexture()).not.toThrow();
  });

  it('verifies kpp-e footprint exists in context features along East perimeter', () => {
    const campusGeom = geometryProvider.build(demoCampus);
    const kppE = campusGeom.context.find((f) => f.id === 'kpp-e');
    expect(kppE).toBeDefined();
    expect(kppE?.kind).toBe('structure');

    if (kppE?.footprint.type === 'rect') {
      const [w, d] = kppE.footprint.size;
      expect(w).toBeGreaterThan(0);
      expect(d).toBeGreaterThan(0);
    }
  });

  it('aligns gate positioning with the central promenade lawn (lawn-g1) and East road', () => {
    const campusGeom = geometryProvider.build(demoCampus);
    const kppE = campusGeom.context.find((f) => f.id === 'kpp-e');
    const lawnG1 = campusGeom.context.find((f) => f.id === 'lawn-g1');
    const roadEast = campusGeom.context.find((f) => f.id === 'road-east');
    expect(kppE).toBeDefined();
    expect(lawnG1).toBeDefined();
    expect(roadEast).toBeDefined();

    if (kppE?.footprint.type === 'rect' && lawnG1?.footprint.type === 'rect') {
      // Main Entrance Gate is centered on the central lawn promenade along Z
      expect(kppE.footprint.center[1]).toBeCloseTo(lawnG1.footprint.center[1], 1);
    }

    if (kppE?.footprint.type === 'rect' && roadEast?.footprint.type === 'rect') {
      // Gate is adjacent to the eastern boundary road
      expect(Math.abs(kppE.footprint.center[0] - roadEast.footprint.center[0])).toBeLessThan(20);
    }
  });
});
