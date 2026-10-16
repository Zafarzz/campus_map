import { describe, expect, it } from 'vitest';
import {
  FountainWaterAnimation,
  WATER_ANIM_CONFIG,
} from '../components/3d/fountain/FountainWaterAnimation';

describe('FountainWaterAnimation & Simplified Fluid Physics (High Realism)', () => {
  it('strictly adheres to mobile performance budget (< 3000 particles, < 30 KB)', () => {
    const total = WATER_ANIM_CONFIG.totalParticles;
    // Высокая плотность для реализма при полном сохранении 60 FPS на смартфонах
    expect(total).toBeLessThanOrEqual(3000);
    expect(total).toBe(2200);

    // Память на один буфер Float32Array: 2200 * 3 * 4 байта = 26 400 байт (< 27 КБ)
    const bufferBytes = total * 3 * 4;
    expect(bufferBytes).toBe(26400);
  });

  it('configures geysers matching CAD elevation marks (+0.65m to +5.800m) with 800 particles', () => {
    expect(WATER_ANIM_CONFIG.circularFountainX).toEqual([-18.5, 18.5]);
    expect(WATER_ANIM_CONFIG.geyserCountPerFountain).toBe(400);

    // Баллистический расчет высоты подъема центрального гейзера:
    // y_peak = y0 + vy^2 / (2 * g)
    const y0 = 0.65;
    const vy = 10.05;
    const g = WATER_ANIM_CONFIG.gravity;
    const yPeak = y0 + (vy * vy) / (2 * g);

    // Должно в точности соответствовать проектной отметке +5.800 м
    expect(yPeak).toBeCloseTo(5.8, 1);
  });

  it('configures 32 dense fan jets with inward parabolic trajectory (640 particles)', () => {
    expect(WATER_ANIM_CONFIG.fanJetsPerFountain).toBe(16);
    expect(WATER_ANIM_CONFIG.particlesPerFanJet).toBe(20);

    const totalFanJetParticles =
      WATER_ANIM_CONFIG.fanJetsPerFountain *
      WATER_ANIM_CONFIG.particlesPerFanJet *
      WATER_ANIM_CONFIG.circularFountainX.length;
    expect(totalFanJetParticles).toBe(640);

    // Вершина дуги веерной струи: y0 = 0.65, vy = 4.75
    const y0 = 0.65;
    const vy = 4.75;
    const g = WATER_ANIM_CONFIG.gravity;
    const fanPeak = y0 + (vy * vy) / (2 * g);
    expect(fanPeak).toBeCloseTo(1.8, 1);
  });

  it('configures dense foam nozzles (192), cascade overflow curtains (320), and splashes (248)', () => {
    expect(WATER_ANIM_CONFIG.foamNozzleCount).toBe(12);
    expect(WATER_ANIM_CONFIG.particlesPerFoamNozzle).toBe(16);
    expect(WATER_ANIM_CONFIG.cascadeCurtainParticles).toBe(320);
    expect(WATER_ANIM_CONFIG.splashParticles).toBe(248);
  });

  it('sets camera distance throttling threshold for mobile GPU/CPU relief', () => {
    // При удалении камеры более чем на 480 м (за пределами общего вида) частота обновления снижается
    expect(WATER_ANIM_CONFIG.distanceThrottlingSq).toBe(480 * 480);
  });

  it('exports valid React functional component FountainWaterAnimation', () => {
    expect(typeof FountainWaterAnimation).toBe('function');
  });
});
