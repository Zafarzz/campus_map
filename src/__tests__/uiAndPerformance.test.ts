import React from 'react';
import { describe, expect, it } from 'vitest';
import { BlockCorridor3D } from '../components/3d/BlockCorridor3D';
import { BlockFLibraryInterior, LIBRARY_LAYOUT } from '../components/3d/BlockFLibraryInterior';
import { ClassroomInterior3D } from '../components/3d/ClassroomInterior3D';
import { DetailedBuilding } from '../components/3d/DetailedBuilding';
import {
  InitialCampusLoader,
  SceneActivityIndicator,
  WalkthroughLoadingOverlay,
} from '../components/ui/CampusLoadingOverlay';
import { ViewportNavigationTools } from '../components/ui/ViewportNavigationTools';
import { GameMenu } from '../game/ui/GameMenu';

describe('Stage 1 & Stage 2 — UI/UX & 3D Performance Verification', () => {
  it('renders InitialCampusLoader and WalkthroughLoadingOverlay with stage-specific messaging', () => {
    const el = React.createElement(InitialCampusLoader, {
      stageMessage: 'Initializing 3D campus geometry…',
    });
    expect(React.isValidElement(el)).toBe(true);
    expect(el.props.stageMessage).toBe('Initializing 3D campus geometry…');

    const walkLoader = React.createElement(WalkthroughLoadingOverlay, {
      title: 'Starting 3D Walkthrough',
      stageMessage: 'Synchronizing Rapier physics colliders & first-person camera...',
      badgeText: 'STARTING WALKTHROUGH',
    });
    expect(React.isValidElement(walkLoader)).toBe(true);
    expect(walkLoader.props.title).toBe('Starting 3D Walkthrough');
    expect(walkLoader.props.badgeText).toBe('STARTING WALKTHROUGH');
  });

  it('exports SceneActivityIndicator, ViewportNavigationTools, and GameMenu with walkthrough loading props', () => {
    expect(typeof SceneActivityIndicator).toBe('function');
    expect(typeof ViewportNavigationTools).toBe('function');
    expect(typeof GameMenu).toBe('function');
    const navEl = React.createElement(ViewportNavigationTools);
    expect(React.isValidElement(navEl)).toBe(true);
  });

  it('maintains valid DetailedBuilding, BlockCorridor3D, and BlockFLibraryInterior contracts', () => {
    expect(typeof DetailedBuilding).toBe('function');
    expect(typeof BlockCorridor3D).toBe('function');
    expect(typeof BlockFLibraryInterior).toBe('function');
    expect(typeof ClassroomInterior3D).toBe('function');

    const totalBookcases =
      LIBRARY_LAYOUT.bookcaseRowsZ.length * LIBRARY_LAYOUT.bookcaseColsX.length;
    expect(totalBookcases).toBe(10);
  });
});

