export type PxRect = [left: number, top: number, right: number, bottom: number];

export const buildingFootprintsPx: Record<string, PxRect[]> = {
  // Top-Middle U-shape (Учебный корпус №1)
  // Calibrated to 2D reference: Horizontal base at South, wings extend North
  'bld-a': [
    [200, 85, 410, 138],  // South horizontal base
    [200, 25, 252, 85],   // Left vertical wing extending North
    [358, 25, 410, 85],   // Right vertical wing extending North
  ],
  // Top-Right Utility (Хозяйственные постройки / Корпус E)
  'bld-b': [
    [455, 82, 655, 148]
  ],
  // Middle horizontal (Учебный корпус №2 / Корпус D)
  'bld-c': [
    [305, 185, 500, 255]
  ],
  // East vertical block (Корпус F) and connector from Block D
  'bld-d': [
    [500, 185, 545, 255], // Horizontal connector from bld-c
    [545, 185, 610, 365]  // East vertical building
  ],
  // Center-Left Sports Complex (Спортивный комплекс)
  'bld-e': [
    [185, 490, 375, 615], // Main vaulted hall
    [235, 615, 375, 658]  // Southern attached annex
  ],
  // Below Sports Complex (Red buildings cluster)
  'bld-f': [
    [166, 640, 222, 765], // West vertical main block
    [232, 665, 268, 742], // East vertical block
    [237, 750, 268, 780]  // South attached square
  ],
  // Bottom-Right cluster (Учебные и жилые корпуса)
  // Top horizontal block (Block B - Academic Building No. 2, 55m x 15m calibrated to CAD elevation)
  'bld-g': [
    [490, 688.67, 673, 738.67]
  ],
  // Middle horizontal block (Block A - Main academic building, 66m x 18m)
  'bld-h': [
    [288, 795, 508, 855]
  ],
  // Bottom vertical block (Block C)
  'bld-i': [
    [552, 794, 632, 926]
  ],
  // Bottom-Left U-shape (Общежитие / Dormitory U-shape opening to North per CAD masterplan)
  'bld-j': [
    [60, 890, 272, 925],  // South horizontal wing
    [60, 825, 105, 890],  // West vertical wing extending North
    [227, 825, 272, 890], // East vertical wing extending North
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
  // Block B (bld-g) ↔ Block C Hall (bld-i). Two storeys.
  { id: 'conn-bld-g-bld-i', kind: 'enclosed-corridor', buildingIds: ['bld-g', 'bld-i'], rect: [557, 738.67, 582, 794], floorCount: 2 },
  // Block A (bld-h) ↔ Block C Hall (bld-i). Two storeys.
  { id: 'conn-bld-h-bld-i', kind: 'enclosed-corridor', buildingIds: ['bld-h', 'bld-i'], rect: [505, 809, 552, 832], floorCount: 2 },
];

export type ContextFeaturePx = {
  id: string;
  kind: 'track' | 'pitch' | 'court' | 'lawn' | 'road' | 'structure';
  rect: PxRect;
  rounded?: boolean;
  label?: string;
};

export const contextFeaturesPx: ContextFeaturePx[] = [
  { id: 'track', kind: 'track', rect: [35, 60, 245, 440], rounded: true, label: 'Беговая дорожка' },
  { id: 'pitch', kind: 'pitch', rect: [390, 480, 465, 650], label: 'Футбольное поле' },
  // Multi-Sport Court aligned with Sports Complex and Football Pitch (extended West per orange user markup)
  { id: 'court', kind: 'court', rect: [477, 480, 597, 650], label: 'Спортивная площадка' },
  { id: 'court-tennis', kind: 'court', rect: [515, 480, 597, 650], label: 'Теннисный корт' },
  // Lawns / Gardens
  { id: 'lawn-sq', kind: 'lawn', rect: [290, 275, 510, 390] }, // Сквер (extended eastward per user green markup)
  { id: 'lawn-g1', kind: 'lawn', rect: [200, 405, 612, 465] }, // Газоны (extended eastward per user green markup)
  { id: 'lawn-orchard1', kind: 'lawn', rect: [315, 680, 480, 790] }, // Сад / сквер между зданиями
  { id: 'lawn-orchard2', kind: 'lawn', rect: [310, 875, 540, 1000] }, // Сад (bottom)
  { id: 'lawn-n', kind: 'lawn', rect: [35, 40, 190, 200] },
  // Dormitory Inner Courtyard Lawn Beds (4 parcels in 2x2 grid per CAD masterplan)
  { id: 'lawn-dorm-nw', kind: 'lawn', rect: [112, 830, 162, 856] },
  { id: 'lawn-dorm-ne', kind: 'lawn', rect: [170, 830, 220, 856] },
  { id: 'lawn-dorm-sw', kind: 'lawn', rect: [112, 862, 162, 886] },
  { id: 'lawn-dorm-se', kind: 'lawn', rect: [170, 862, 220, 886] },
  // Dormitory South Front Lawn Beds (flanked by paved promenade, central path & curbs)
  { id: 'lawn-dorm-front-w', kind: 'lawn', rect: [76, 934, 155, 952] },
  { id: 'lawn-dorm-front-e', kind: 'lawn', rect: [177, 934, 256, 952] },
  // Amphitheater Hall plaza/court footprint from 2D editor (ADR-029)
  { id: 'out-plaza-mvijfubr', kind: 'court', rect: [487, 739, 553, 795], label: 'Зал амфитеатра' },
  // Roads: East perimeter road and Main Entrance Plaza
  { id: 'road-east', kind: 'road', rect: [680, 0, 750, 1050] },
  { id: 'road-entrance-main', kind: 'road', rect: [612, 405, 700, 465], label: 'Главная въездная площадь (вход)' },
  // Dormitory West Covered Shelter & Booth
  { id: 'dorm-shed-w', kind: 'structure', rect: [34, 825, 54, 890], label: 'Крытый навес общежития' },
  { id: 'dorm-booth-w', kind: 'structure', rect: [34, 895, 54, 925], label: 'Хозяйственный блок' },
  // Photovoltaic Solar Canopies south of Dormitory bld-j (2x2 grid)
  { id: 'solar-canopy-1', kind: 'structure', rect: [72, 964, 160, 986], label: 'Солнечный навес СЗ' },
  { id: 'solar-canopy-2', kind: 'structure', rect: [172, 964, 260, 986], label: 'Солнечный навес СВ' },
  { id: 'solar-canopy-3', kind: 'structure', rect: [72, 1004, 160, 1026], label: 'Солнечный навес ЮЗ' },
  { id: 'solar-canopy-4', kind: 'structure', rect: [172, 1004, 260, 1026], label: 'Солнечный навес ЮВ' },
  // South Utility Garages along fence (inside parking perimeter)
  { id: 'dorm-garage-1', kind: 'structure', rect: [90, 1046, 134, 1072], label: 'Гаражный блок 1' },
  { id: 'dorm-garage-2', kind: 'structure', rect: [138, 1056, 172, 1078], label: 'Гаражный блок 2' },
  { id: 'dorm-garage-3', kind: 'structure', rect: [174, 1064, 202, 1084], label: 'Гаражный блок 3' },
  // Entrance structures (КПП)
  { id: 'kpp-n', kind: 'structure', rect: [340, 10, 390, 30] },
  { id: 'kpp-w', kind: 'structure', rect: [130, 405, 180, 460] },
  { id: 'kpp-sw', kind: 'structure', rect: [248, 1102, 276, 1120], label: 'Юго-западное КПП' },
  { id: 'kpp-e', kind: 'structure', rect: [660, 405, 700, 465] }
];
