export type PxRect = [left: number, top: number, right: number, bottom: number];

export const buildingFootprintsPx: Record<string, PxRect[]> = {
  // Top-Middle U-shape (Учебный корпус №1)
  'bld-a': [
    [250, 50, 480, 110],  // Bottom horizontal
    [250, 110, 300, 180], // Left vertical
    [430, 110, 480, 180], // Right vertical
  ],
  // Top-Right Utility (Хозяйственные постройки)
  'bld-b': [
    [520, 120, 720, 180]
  ],
  // Middle horizontal + vertical (Учебный корпус №2)
  'bld-c': [
    [300, 230, 560, 290]  // Horizontal
  ],
  'bld-d': [
    [560, 200, 620, 290], // Vertical connector
    [620, 250, 680, 420]  // Vertical warehouse
  ],
  // Center-Left Sports Complex (Спортивный комплекс)
  'bld-e': [
    [210, 480, 440, 650], // Main hall
    [330, 650, 440, 690]  // Admin block attached
  ],
  // Below Sports Complex (Red buildings)
  'bld-f': [
    [220, 672, 280, 800], // Vertical main facade wing (35.9m calibrated to CAD elevation)
    [280, 700, 320, 730], // Horizontal connection
    [320, 690, 360, 750]  // Right vertical
  ],
  // Bottom-Right cluster (Учебные и жилые корпуса)
  // Top horizontal block (Block B - Academic Building No. 2, 55m x 15m calibrated to CAD elevation)
  'bld-g': [
    [508, 720, 691, 770] // 183px × 50px (54.9m × 15.0m ≈ 55.0m × 15.0m)
  ],
  // Middle horizontal block (Block A - Main academic building, 66m x 18m)
  'bld-h': [
    [310, 795, 530, 855] // 220px × 60px (66.0m × 18.0m, calibrated to CAD)
  ],
  // Bottom vertical block (Block C, extended by +10% from 35.9m CAD facade to 39.6m)
  'bld-i': [
    [550, 790, 630, 922] // 80px × 132px (24.0m × 39.6m)
  ],
  // Bottom-Left U-shape (Учебный корпус №3)
  'bld-j': [
    [80, 900, 300, 960],  // Bottom horizontal
    [80, 850, 130, 900],  // Left vertical
    [250, 850, 300, 900]  // Right vertical
  ]
};

/**
 * Enclosed passages between buildings (ADR-020), same pixel frame as `buildingFootprintsPx`.
 * Each passage must touch both connected buildings (validated in tests).
 */
export type ConnectorPx = {
  id: string;
  kind: 'enclosed-corridor';
  buildingIds: [a: string, b: string];
  rect: PxRect;
  /** Number of storeys of the passage (ground level = 1). */
  floorCount: number;
};

export const connectorsPx: ConnectorPx[] = [
  // Block B (bld-g) ↔ Block C Hall (bld-i). Length: 6.0m (20px), Width: 3.0m (10px).
  { id: 'conn-bld-g-bld-i', kind: 'enclosed-corridor', buildingIds: ['bld-g', 'bld-i'], rect: [585, 770, 595, 790], floorCount: 1 },
  // Block A (bld-h) ↔ Block C Hall (bld-i). Length: 6.0m (20px), Width: 3.0m (10px).
  { id: 'conn-bld-h-bld-i', kind: 'enclosed-corridor', buildingIds: ['bld-h', 'bld-i'], rect: [530, 800, 550, 810], floorCount: 1 },
];

export type ContextFeaturePx = {
  id: string;
  kind: 'track' | 'pitch' | 'court' | 'lawn' | 'road' | 'structure';
  rect: PxRect;
  rounded?: boolean;
  label?: string;
};

export const contextFeaturesPx: ContextFeaturePx[] = [
  { id: 'track', kind: 'track', rect: [30, 60, 200, 430], rounded: true, label: 'Беговая дорожка' },
  { id: 'pitch', kind: 'pitch', rect: [460, 480, 560, 650], label: 'Футбольное поле' },
  { id: 'court', kind: 'court', rect: [580, 480, 710, 650], label: 'Спортивная площадка' },
  // Lawns / Gardens
  { id: 'lawn-sq', kind: 'lawn', rect: [300, 300, 550, 410] }, // Сквер
  { id: 'lawn-g1', kind: 'lawn', rect: [370, 420, 710, 460] }, // Газоны
  { id: 'lawn-orchard1', kind: 'lawn', rect: [370, 700, 480, 800] }, // Trees between red buildings
  { id: 'lawn-orchard2', kind: 'lawn', rect: [310, 890, 530, 1000] }, // Сад (bottom)
  { id: 'lawn-n', kind: 'lawn', rect: [50, 40, 240, 200] },
  // Roads
  { id: 'road-east', kind: 'road', rect: [720, 0, 750, 1050] },
  // Entrance structures (КПП)
  { id: 'kpp-n', kind: 'structure', rect: [400, 20, 450, 40] },
  { id: 'kpp-w', kind: 'structure', rect: [210, 410, 270, 460] },
  { id: 'kpp-sw', kind: 'structure', rect: [180, 790, 220, 830] },
  { id: 'kpp-e', kind: 'structure', rect: [700, 680, 740, 710] }
];
