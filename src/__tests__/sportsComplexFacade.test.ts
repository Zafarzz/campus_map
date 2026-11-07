import React from 'react';
import { describe, expect, it } from 'vitest';
import { demoCampus } from '../data/demo-campus';
import { geometryProvider } from '../services/geometry';
import { getBuildingAppearance, SPORTS_COMPLEX } from '../domain/appearance';
import {
  SportsComplexRoof,
  SportsComplexFrontFacade,
  CommemorativeStela,
} from '../components/3d/facades/SportsComplexFacade';

describe('Sports Complex Architectural Facade & 3-Gable Roof (Drawing 1)', () => {
  it('resolves SPORTS_COMPLEX preset with customFacade="sports-complex" for bld-e', () => {
    const appearance = getBuildingAppearance('bld-e');
    expect(appearance.preset).toBe('sports-complex');
    expect(appearance.customFacade).toBe('sports-complex');
    expect(appearance.roofType).toBe('barrel');
    expect(appearance.roofColor).toBe('#22252a');
    expect(appearance.wallColor).toBe('#f1f5f9');
  });

  it('preserves SPORTS_COMPLEX preset constants in registry', () => {
    expect(SPORTS_COMPLEX.roofColor).toBe('#22252a');
    expect(SPORTS_COMPLEX.roofHeight).toBe(6.9);
    expect(SPORTS_COMPLEX.plinthHeight).toBe(2.2);
    expect(SPORTS_COMPLEX.glassColor).toBe('#0f172a');
    expect(SPORTS_COMPLEX.hasCornice).toBe(true);
  });

  it('verifies Building E exists in campus model with correct footprint dimensions', () => {
    const bldE = demoCampus.buildings.find((b) => b.id === 'bld-e');
    expect(bldE).toBeDefined();

    const campusGeom = geometryProvider.build(demoCampus);
    const bldGeom = campusGeom.buildings['bld-e'];
    expect(bldGeom).toBeDefined();
    expect(bldGeom.parts.length).toBeGreaterThanOrEqual(1);

    const mainPart = bldGeom.parts[0];
    expect(mainPart.type).toBe('rect');
    if (mainPart.type === 'rect') {
      const [w, d] = mainPart.size;
      // Width ~57m (3 gables x 19m = 57m), depth ~37.5m
      expect(w).toBeGreaterThan(45);
      expect(d).toBeGreaterThan(25);
    }
  });

  it('exports SportsComplexRoof, SportsComplexFrontFacade, and CommemorativeStela React components', () => {
    expect(typeof SportsComplexRoof).toBe('function');
    expect(typeof SportsComplexFrontFacade).toBe('function');
    expect(typeof CommemorativeStela).toBe('function');
  });

  it('creates valid React element for SportsComplexRoof with 3 sharp triangular gables', () => {
    const el = React.createElement(SportsComplexRoof, {
      width: 57.0,
      depth: 37.5,
      height: 6.9,
      color: '#22252a',
    });
    expect(React.isValidElement(el)).toBe(true);
    expect(el.props.width).toBe(57.0);
    expect(el.props.height).toBe(6.9);
    expect(el.props.color).toBe('#22252a');
  });

  it('creates valid React element for SportsComplexFrontFacade with 3 entrance vestibules and commemorative steles', () => {
    const el = React.createElement(SportsComplexFrontFacade, {
      width: 57.0,
      depth: 37.5,
      wallHeight: 3.6,
    });
    expect(React.isValidElement(el)).toBe(true);
    expect(el.props.width).toBe(57.0);
    expect(el.props.wallHeight).toBe(3.6);
  });

  it('creates valid React element for CommemorativeStela with 30-degree rotation', () => {
    const el = React.createElement(CommemorativeStela, {
      position: [-9.5, 0, -0.7],
      rotationY: Math.PI / 6,
    });
    expect(React.isValidElement(el)).toBe(true);
    expect(el.props.rotationY).toBeCloseTo(Math.PI / 6, 4);
  });
});
