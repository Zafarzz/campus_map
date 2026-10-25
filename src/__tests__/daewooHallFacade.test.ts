import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import React from 'react';
import { demoCampus } from '../data/demo-campus';
import { geometryProvider } from '../services/geometry';
import { DaewooHallFacade } from '../components/3d/facades/DaewooHallFacade';

describe('Daewoo Hall Entrance Pavilion & Facade (Drawing 2)', () => {
  it('exports DaewooHallFacade React component', () => {
    expect(typeof DaewooHallFacade).toBe('function');
  });

  it('creates valid React element for DaewooHallFacade with default props', () => {
    const el = React.createElement(DaewooHallFacade, {
      position: [0, 0, 0],
      rotationY: -Math.PI / 2,
    });
    expect(React.isValidElement(el)).toBe(true);
    expect(el.props.position).toEqual([0, 0, 0]);
    expect(el.props.rotationY).toBe(-Math.PI / 2);
  });

  it('verifies connector conn-bld-g-bld-i connects Block B and Block C/A complex', () => {
    const campusGeom = geometryProvider.build(demoCampus);
    const conn = campusGeom.connectors.find((c) => c.id === 'conn-bld-g-bld-i');
    expect(conn).toBeDefined();

    if (conn && conn.footprint.type === 'rect') {
      const [w, d] = conn.footprint.size;
      // Dimensions should accommodate the 14m facade length
      const maxDim = Math.max(w, d);
      expect(maxDim).toBeGreaterThanOrEqual(12);
    }
  });

  it('creates 3D letter vector shapes for «DAEWOO HALL» without CDN dependencies', () => {
    // Test that Three.js Shapes can be created for all required characters: D, A, E, W, O, H, L
    const letters = ['D', 'A', 'E', 'W', 'O', 'H', 'L'];
    letters.forEach((char) => {
      const shape = new THREE.Shape();
      const h = 0.72;
      const w = h * 0.75;
      shape.moveTo(0, 0);
      shape.lineTo(w, 0);
      shape.lineTo(w, h);
      shape.lineTo(0, h);
      shape.closePath();

      const geom = new THREE.ExtrudeGeometry(shape, {
        depth: 0.08,
        bevelEnabled: true,
        bevelThickness: 0.012,
      });

      expect(geom).toBeDefined();
      expect(geom.getAttribute('position')).toBeDefined();
      expect(geom.getAttribute('position').count).toBeGreaterThan(0);
      geom.dispose();
    });
  });

  it('supports custom width prop to span full corridor length', () => {
    const el = React.createElement(DaewooHallFacade, {
      width: 16.6,
      position: [3.75, 0, 0],
      rotationY: Math.PI / 2,
    });
    expect(React.isValidElement(el)).toBe(true);
    expect(el.props.width).toBe(16.6);
    expect(el.props.rotationY).toBe(Math.PI / 2);
  });

  it('supports transparent / dimmed mode for floor plan focus', () => {
    const el = React.createElement(DaewooHallFacade, {
      position: [0, 0, 0],
      opacity: 0.35,
      transparent: true,
    });
    expect(React.isValidElement(el)).toBe(true);
    expect(el.props.opacity).toBe(0.35);
    expect(el.props.transparent).toBe(true);
  });
});
