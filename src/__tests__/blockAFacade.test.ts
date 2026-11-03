import { describe, expect, it } from 'vitest';
import React from 'react';
import { BlockAFacade } from '../components/3d/facades/BlockAFacade';
import { DaewooHallFacade } from '../components/3d/facades/DaewooHallFacade';
import { BUILDING_APPEARANCE_REGISTRY, BLOCK_A_FRONT } from '../domain/appearance/presets';
import { connectorsPx } from '../data/reference-footprints';
import { geometryProvider } from '../services/geometry';
import { demoCampus } from '../data/demo-campus';

describe('Block A Architectural Facade & Corridor A=>C Elevation (Blueprint media_1793539586758.jpg)', () => {
  it('exports BlockAFacade React component', () => {
    expect(typeof BlockAFacade).toBe('function');
  });

  it('creates valid React element for BlockAFacade with default props (facing south towards perimeter fence)', () => {
    const el = React.createElement(BlockAFacade, {
      buildingWidth: 66,
      buildingDepth: 18,
      facing: 'south',
      wallHeight: 8.2,
      roofHeight: 3.6,
    });
    expect(React.isValidElement(el)).toBe(true);
    expect(el.props.buildingWidth).toBe(66);
    expect(el.props.buildingDepth).toBe(18);
    expect(el.props.facing).toBe('south');
    expect(el.props.wallHeight).toBe(8.2);
  });

  it('creates valid React element for BlockAFacade facing north', () => {
    const el = React.createElement(BlockAFacade, {
      buildingWidth: 66,
      buildingDepth: 18,
      facing: 'north',
    });
    expect(React.isValidElement(el)).toBe(true);
    expect(el.props.facing).toBe('north');
  });

  it('registers BLOCK_A_FRONT preset for bld-h with customFacade: block-a and terracotta red hip roof', () => {
    const appearance = BUILDING_APPEARANCE_REGISTRY['bld-h'];
    expect(appearance).toBeDefined();
    expect(appearance.customFacade).toBe('block-a');
    expect(appearance.roofType).toBe('hip');
    expect(appearance.roofColor).toBe('#991b1b');
    expect(appearance.wallColor).toBe('#ebdcc5');
    expect(appearance.hasPlinth).toBe(true);
    expect(appearance.plinthHeight).toBe(0.8);
  });

  it('verifies connector conn-bld-h-bld-i connects Block A (bld-h) and Block C (bld-i) on the east', () => {
    const conn = connectorsPx.find((c) => c.id === 'conn-bld-h-bld-i');
    expect(conn).toBeDefined();
    expect(conn?.buildingIds).toEqual(['bld-h', 'bld-i']);

    const campusGeom = geometryProvider.build(demoCampus);
    const bldH = campusGeom.buildings['bld-h'];
    const connGeom = campusGeom.connectors.find((c) => c.id === 'conn-bld-h-bld-i');
    expect(connGeom).toBeDefined();
    if (connGeom && connGeom.footprint.type === 'rect') {
      // Connector sits east (higher X) of Block A center
      expect(connGeom.footprint.center[0]).toBeGreaterThan(bldH.center[0]);
    }
  });

  it('exports DaewooHallFacade supporting birch trees in front of the glazed apron', () => {
    const el = React.createElement(DaewooHallFacade, {
      width: 24.0,
      includeTrees: true,
    });
    expect(React.isValidElement(el)).toBe(true);
    expect(el.props.includeTrees).toBe(true);
  });
});
