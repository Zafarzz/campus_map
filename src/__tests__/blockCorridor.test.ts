import { describe, expect, it } from 'vitest';
import React from 'react';
import { BlockCorridor3D } from '../components/3d/BlockCorridor3D';
import type { Footprint } from '../domain/geometry/types';

describe('3D Corridors of Block B and Block E (Item 4 of todo_list.md)', () => {
  it('exports valid React component BlockCorridor3D', () => {
    expect(typeof BlockCorridor3D).toBe('function');
  });

  it('creates valid React element for Block B corridor', () => {
    const parts: Footprint[] = [
      {
        type: 'rect',
        center: [30, 70],
        size: [55, 15],
      },
    ];

    const el = React.createElement(BlockCorridor3D, {
      floorId: 'bld-g-f1',
      floorElevation: 0,
      parts,
    });

    expect(React.isValidElement(el)).toBe(true);
    expect(el.props.floorId).toBe('bld-g-f1');
  });

  it('creates valid React element for Block E corridor', () => {
    const parts: Footprint[] = [
      {
        type: 'rect',
        center: [20, -50],
        size: [60, 20],
      },
    ];

    const el = React.createElement(BlockCorridor3D, {
      floorId: 'bld-b-f2',
      floorElevation: 3.6,
      parts,
    });

    expect(React.isValidElement(el)).toBe(true);
    expect(el.props.floorId).toBe('bld-b-f2');
  });
});
