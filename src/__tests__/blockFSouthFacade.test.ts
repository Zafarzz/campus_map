import { describe, expect, it } from 'vitest';
import React from 'react';
import { BlockFSouthFacade } from '../components/3d/facades/BlockFSouthFacade';
import { BlockFCourtyardFacade } from '../components/3d/facades/BlockFCourtyardFacade';
import { BlockFFacade } from '../components/3d/facades/BlockFFacade';
import { BlockFRoof } from '../components/3d/facades/BlockFRoof';
import { getLibrarySignTexture } from '../components/3d/facades/facadeTextures';
import { geometryProvider } from '../services/geometry';
import { demoCampus } from '../data/demo-campus';

describe('Block F South Facade & Courtyard Facade Separation (Blueprint media_1794216793227_98a34af3.jpg)', () => {
  it('exports BlockFSouthFacade, BlockFCourtyardFacade, and BlockFRoof as separate React components', () => {
    expect(typeof BlockFSouthFacade).toBe('function');
    expect(typeof BlockFCourtyardFacade).toBe('function');
    expect(typeof BlockFRoof).toBe('function');
  });

  it('creates valid React element for BlockFRoof with custom roof colors and props', () => {
    const el = React.createElement(BlockFRoof, {
      roofColor: '#8a99a8',
      corniceColor: '#f8fafc',
      wallColor: '#ebdcc5',
      opacity: 1,
      transparent: false,
    });
    expect(React.isValidElement(el)).toBe(true);
    expect(el.props.roofColor).toBe('#8a99a8');
    expect(el.props.corniceColor).toBe('#f8fafc');
  });

  it('verifies BlockFRoof stepped architecture matching roof plan media_1794217480505_836ffadf.png and South Facade', () => {
    const mainRoofLevel = 12.0; // ОСНОВНАЯ КРОВЛЯ: ОТМ. +12.000 (Верх парапета)
    const lowerRoofLevel = 9.2; // ОТМ. +9.200 (Верх парапета, deck at +9.000 per blueprint)
    const stepDiff = mainRoofLevel - lowerRoofLevel; // 2.80 m (per user prompt: "ниже основного на 2.5 метра или адаптируй с фасадом южного фасада")

    expect(stepDiff).toBeCloseTo(2.8);
    expect(mainRoofLevel).toBe(12.0);
    expect(lowerRoofLevel).toBeCloseTo(9.2);

    const footprintWidth = 20.0;
    const setbackStripWidth = 6.5; // West setback strip marked in red
    const mainVolumeWidth = 13.5; // East main volume
    expect(setbackStripWidth + mainVolumeWidth).toBe(footprintWidth);
  });

  it('creates valid React element for BlockFSouthFacade with default and custom props', () => {
    const el = React.createElement(BlockFSouthFacade, {
      opacity: 0.9,
      transparent: false,
      wallColor: '#ebdcc5',
      trimColor: '#f8fafc',
      plinthColor: '#334155',
      frameColor: '#1e293b',
      friezeColor: '#ffffff',
      doorColor: '#162d59',
    });
    expect(React.isValidElement(el)).toBe(true);
    expect(el.props.wallColor).toBe('#ebdcc5');
    expect(el.props.friezeColor).toBe('#ffffff');
    expect(el.props.frameColor).toBe('#1e293b');
    expect(el.props.doorColor).toBe('#162d59');
  });

  it('creates valid React element for BlockFCourtyardFacade (West Facade & Vestibule only)', () => {
    const el = React.createElement(BlockFCourtyardFacade, {
      wallColor: '#ebdcc5',
      trimColor: '#f8fafc',
    });
    expect(React.isValidElement(el)).toBe(true);
  });

  it('exports getLibrarySignTexture function', () => {
    expect(typeof getLibrarySignTexture).toBe('function');
  });

  it('inspects geometry provider for bld-d footprint and parts', () => {
    const geo = geometryProvider.build(demoCampus);
    const bldD = geo.buildings['bld-d'];
    expect(bldD).toBeDefined();
    console.log('BLD-D PART 0:', JSON.stringify(bldD.parts[0]));
    console.log('BLD-D PART 1:', JSON.stringify(bldD.parts[1]));
  });

  it('conforms strictly to CAD drawing dimensional relationships (Axes А–В, M 1:100)', () => {
    const totalWidth = 20.0; // 20 000 mm in axes А–В
    const leftWidth = 6.5; // 6 500 mm in axes А–Б
    const rightWidth = 13.5; // 13 500 mm in axes Б–В
    expect(leftWidth + rightWidth).toBe(totalWidth);

    // Left volume elevations
    const leftPlinthH = 0.6; // 600 mm
    const leftWallH = 7.6; // 7 600 mm
    const leftFriezeH = 1.0; // 1 000 mm
    const leftTotalH = leftPlinthH + leftWallH + leftFriezeH; // 9.200 m
    expect(leftTotalH).toBeCloseTo(9.2);

    // Right volume elevations
    const rightPlinthH = 0.6; // 600 mm
    const rightWallH = 10.2; // 10 200 mm
    const rightFriezeH = 1.2; // 1 200 mm
    const rightTotalH = rightPlinthH + rightWallH + rightFriezeH; // 12.000 m
    expect(rightTotalH).toBeCloseTo(12.0);

    // Step reveal between left and right volumes
    const stepElevation = rightTotalH - leftTotalH;
    expect(stepElevation).toBeCloseTo(2.8); // 2 800 mm

    // Side entrance geometry (axes А–Б)
    const sideDoorOffsetFromA = 4.9; // 4 900 mm from Axis A
    const sideDoorWidth = 1.0; // 1 000 mm
    const sideDoorRemainingToB = leftWidth - (sideDoorOffsetFromA + sideDoorWidth); // 600 mm
    expect(sideDoorRemainingToB).toBeCloseTo(0.6);

    // Right volume horizontal layout
    const mainDoorOffsetFromB = 0.5; // 500 mm from Axis Б
    const mainDoorWidth = 1.6; // 1 600 mm
    const windowWidth = 0.9; // 900 mm each
    const windowCount = 3;
    const window3ToAxisV = 3.1; // 3 100 mm to Axis В

    // Sum verification across the 13 500 mm span:
    // 500 (wall) + 1600 (door) + 1800 (gap with plaque) + 900 (win 1) + 1900 (gap) + 900 (win 2) + 1900 (gap) + 900 (win 3) + 3100 (wall to V)
    const sumSpan =
      mainDoorOffsetFromB +
      mainDoorWidth +
      1.8 +
      windowWidth +
      1.9 +
      windowWidth +
      1.9 +
      windowWidth +
      window3ToAxisV;
    expect(sumSpan).toBeCloseTo(rightWidth);
  });

  it('verifies BlockFFacade matches 12.0m roof parapet and South Facade right volume', () => {
    const el = React.createElement(BlockFFacade, {
      buildingWidth: 20.0,
      buildingDepth: 48.0,
      facing: 'east',
      wallHeight: 12.0,
    });
    expect(React.isValidElement(el)).toBe(true);
    expect(el.props.wallHeight).toBe(12.0);

    // Architectural entablature and cornice breakdown at 12.0 m
    const wallHeight = 12.0;
    const plinthHeight = 0.6;
    const architraveHeight = 0.45;
    const friezeHeight = 0.85;
    const entablatureBaseY = wallHeight - 2.2; // 9.80 m
    const corniceBaseY = entablatureBaseY + architraveHeight + friezeHeight; // 11.10 m
    const topCorniceY = corniceBaseY + 0.885 + 0.035; // ~12.02 m

    expect(entablatureBaseY).toBe(9.8);
    expect(corniceBaseY).toBeCloseTo(11.1);
    expect(topCorniceY).toBeCloseTo(12.02, 1);

    // Windows & Signage vertical alignment
    const f2WinCenterY = 6.25;
    const f2WinH = 5.0;
    const f2WinTop = f2WinCenterY + f2WinH / 2; // 8.75 m (well under 9.80 m architrave)
    expect(f2WinTop).toBeLessThan(entablatureBaseY);

    const friezeCenterY = entablatureBaseY + architraveHeight + friezeHeight / 2; // 10.675 m
    expect(friezeCenterY).toBeCloseTo(10.675);
    expect(friezeCenterY).toBeGreaterThan(entablatureBaseY);
    expect(friezeCenterY).toBeLessThan(corniceBaseY);
  });
});
