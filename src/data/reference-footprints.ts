/**
 * APPROXIMATE footprints traced by eye from the Google Earth screenshot
 * (`public/reference/campus.jpg`, 703×1024 px).
 *
 * Coordinates are image pixels: [left, top, right, bottom]. Image top = north.
 * Converted to meters by the screenshot geometry provider.
 *
 * TODO: Replace with surveyed footprints / floor plans when available.
 */

export type PxRect = [left: number, top: number, right: number, bottom: number];

/** One or more rectangles per building (L-shapes = several rects). */
export const buildingFootprintsPx: Record<string, PxRect[]> = {
  'bld-a': [[207, 28, 410, 125]],
  'bld-b': [[468, 88, 655, 150]],
  'bld-c': [
    [307, 142, 540, 190],
    [307, 190, 500, 270],
    [500, 190, 540, 252],
  ],
  'bld-d': [[540, 183, 610, 352]],
  'bld-e': [
    [182, 482, 368, 610],
    [230, 610, 368, 655],
  ],
  'bld-f': [
    [160, 640, 265, 775],
    [142, 758, 162, 805],
  ],
  'bld-g': [[467, 705, 655, 758]],
  'bld-h': [
    [302, 790, 535, 880],
    [487, 758, 570, 790],
  ],
  'bld-i': [[535, 800, 612, 965]],
  'bld-j': [[60, 890, 262, 935],
    [60, 828, 105, 890],
    [217, 828, 262, 890]],
};

export type ContextFeaturePx = {
  id: string;
  kind: 'track' | 'pitch' | 'court' | 'lawn' | 'road' | 'structure';
  rect: PxRect;
  rounded?: boolean;
  label?: string;
};

/** Surroundings. Structures here were NOT marked as university buildings by the user. */
export const contextFeaturesPx: ContextFeaturePx[] = [
  { id: 'track', kind: 'track', rect: [15, 62, 172, 402], rounded: true, label: 'Running track' },
  { id: 'pitch', kind: 'pitch', rect: [386, 490, 460, 625], label: 'Football pitch' },
  { id: 'court', kind: 'court', rect: [472, 490, 592, 625], label: 'Courts' },
  { id: 'lawn-n', kind: 'lawn', rect: [285, 282, 482, 380] },
  { id: 'lawn-m', kind: 'lawn', rect: [278, 402, 610, 452] },
  { id: 'lawn-s', kind: 'lawn', rect: [278, 885, 480, 975] },
  { id: 'road-east', kind: 'road', rect: [615, 0, 672, 1024] },
  { id: 'walk-ns', kind: 'road', rect: [268, 130, 290, 1000] },
  { id: 'walk-ew', kind: 'road', rect: [268, 455, 615, 475] },
  // Unidentified structures (no floor info provided).
  { id: 'struct-w', kind: 'structure', rect: [90, 450, 165, 590] },
  { id: 'struct-sm', kind: 'structure', rect: [175, 395, 230, 430] },
];
