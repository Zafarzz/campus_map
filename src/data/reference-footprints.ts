export type PxRect = [left: number, top: number, right: number, bottom: number];

export const buildingFootprintsPx: Record<string, PxRect[]> = {
  // Top-Middle U-shape (Учебный корпус №1)
  // Calibrated to 2D reference: Horizontal base at South, wings extend North
  'bld-a': [
    [200, 85, 410, 138],  // South horizontal base
    [200, 25, 252, 85],   // Left vertical wing extending North
    [358, 25, 410, 85],   // Right vertical wing extending North
  ],
  // Top-Right Academic Block (Корпус E: 55 × 14 м -> 183.33 × 46.67 px)
  'bld-b': [
    [455, 101.33, 638.33, 148]
  ],
  // Middle horizontal (Корпус D: 54 × 20 м -> 180 × 66.67 px)
  'bld-c': [
    [305, 185, 485, 251.67]
  ],
  // East vertical block (Корпус F: 48 × 20 м -> 66.67 × 160 px) and 1-storey D–F hall (12 м free span -> 40 px)
  'bld-d': [
    [485, 188, 525, 244.67],  // D–F hall: 1-storey, 12m span (40px)
    [525, 188, 591.67, 348]   // Корпус F: vertical 20m width × 48m length
  ],
  // Center-Left Sports Complex (Спортивный комплекс: 55 × 35 м -> 183.33 × 116.67 px)
  'bld-e': [
    [191.67, 490, 375, 606.67], // Main vaulted hall (55 × 35 м)
    [235, 606.67, 375, 646.67]  // Southern attached annex
  ],
  // Below Sports Complex (Red buildings cluster)
  'bld-f': [
    [166, 640, 222, 765], // West vertical main block
    [232, 665, 268, 742], // East vertical block
    [237, 750, 268, 780]  // South attached square
  ],
  // Bottom-Right cluster (Учебные и жилые корпуса)
  // Top horizontal block (Корпус B: 55 × 14 м -> 183.33 × 46.67 px)
  'bld-g': [
    [490, 692, 673.33, 738.67]
  ],
  // Middle horizontal block (Корпус A: 55 × 24 м -> 183.33 × 80 px)
  'bld-h': [
    [324.67, 795, 508, 875]
  ],
  // Bottom vertical block (Корпус C: 48 × 19 м -> 63.33 × 160 px)
  'bld-i': [
    [552, 795, 615.33, 955]
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
  { id: 'conn-bld-g-bld-i', kind: 'enclosed-corridor', buildingIds: ['bld-g', 'bld-i'], rect: [557, 738.67, 582, 795], floorCount: 2 },
  // Block A (bld-h) ↔ Block C Hall (bld-i). Two storeys.
  { id: 'conn-bld-h-bld-i', kind: 'enclosed-corridor', buildingIds: ['bld-h', 'bld-i'], rect: [505, 795, 555, 855], floorCount: 2 },
  // F–E hall: 1-storey connector hall between Block F (bld-d) and Block E (bld-b), 12m free span (40px).
  { id: 'conn-bld-d-bld-b', kind: 'enclosed-corridor', buildingIds: ['bld-d', 'bld-b'], rect: [525, 148, 591.67, 188], floorCount: 1 },
];

export type ContextFeaturePx = {
  id: string;
  kind: 'track' | 'pitch' | 'court' | 'lawn' | 'road' | 'structure';
  rect: PxRect;
  rounded?: boolean;
  label?: string;
};

export const contextFeaturesPx: ContextFeaturePx[] = [
  { id: 'track', kind: 'track', rect: [5, 76, 185, 424], rounded: true, label: 'Беговая дорожка' },
  // Футбольное поле: 20 × 40 м (66.67 × 133.33 px)
  { id: 'pitch', kind: 'pitch', rect: [390, 490, 456.67, 623.33], label: 'Футбольное поле' },
  // Мультиспортивная площадка: 30 × 40 м (100 × 133.33 px)
  { id: 'court', kind: 'court', rect: [477, 490, 577, 623.33], label: 'Спортивная площадка' },
  // Теннисная часть: ~27,3 × 40 м (91 × 133.33 px)
  { id: 'court-tennis', kind: 'court', rect: [486, 490, 577, 623.33], label: 'Теннисный корт' },
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
  // Dormitory South Front Lawn Beds (expanded to fully cover forecourt per CAD blueprint in media_1793556249989.png)
  { id: 'lawn-dorm-front-w', kind: 'lawn', rect: [73, 936, 157, 1009] },
  { id: 'lawn-dorm-front-e', kind: 'lawn', rect: [175, 936, 272, 1009] },
  // Tree-Free Green Zones per user markup (media_1793549361565.png)
  { id: 'lawn-east-block-c', kind: 'lawn', rect: [683, 820, 698, 1007], label: 'Зеленая зона вдоль восточного забора у корпуса C' },
  { id: 'lawn-east-block-b', kind: 'lawn', rect: [582, 739, 673.33, 749], label: 'Зеленая полоса у южного фасада корпуса B' },
  { id: 'lawn-west-orchard', kind: 'lawn', rect: [245, 900, 310, 1007], label: 'Зеленая зона западнее сада вдоль забора' },
  { id: 'lawn-front-block-b', kind: 'lawn', rect: [490, 676, 673.33, 690], label: 'Зеленая зона перед корпусом B' },
  { id: 'lawn-fence-checkpoint-bld-b', kind: 'lawn', rect: [650, 465, 698, 578], label: 'Зеленая зона вдоль восточного забора у КПП' },
  { id: 'lawn-fence-north', kind: 'lawn', rect: [668, 195, 698, 395], label: 'Зеленая зона вдоль северо-восточного забора' },
  { id: 'lawn-front-block-f', kind: 'lawn', rect: [596, 188, 612, 348], label: 'Зеленая зона перед корпусом F' },
  // Amphitheater Hall plaza/court footprint from 2D editor (ADR-029)
  { id: 'out-plaza-mvijfubr', kind: 'court', rect: [487, 739, 553, 795], label: 'Зал амфитеатра' },
  // Roads: East perimeter road (aligned outside straight fence at X = 104.0m / Xpx = 698) and Main Entrance Plaza
  { id: 'road-east', kind: 'road', rect: [698, 0, 788, 1050] },
  { id: 'road-entrance-main', kind: 'road', rect: [612, 405, 700, 465], label: 'Главная въездная площадь (вход)' },
  // Dormitory West Covered Shelter & Booth
  { id: 'dorm-shed-w', kind: 'structure', rect: [34, 825, 54, 890], label: 'Крытый навес общежития' },
  { id: 'dorm-booth-w', kind: 'structure', rect: [34, 895, 54, 925], label: 'Хозяйственный блок' },
  // Photovoltaic Solar Canopies south of Dormitory bld-j (relocated to southern parking per user markup media_1793556132349.png)
  { id: 'solar-canopy-1', kind: 'structure', rect: [90, 1048, 173, 1070], label: 'Солнечный навес СЗ' },
  { id: 'solar-canopy-3', kind: 'structure', rect: [90, 1100, 173, 1122], label: 'Солнечный навес ЮЗ' },
  // South Utility Garages along fence (inside parking perimeter per CAD masterplan)
  { id: 'dorm-garage-1', kind: 'structure', rect: [105, 1144, 145, 1166], label: 'Гаражный блок 1' },
  { id: 'dorm-garage-2', kind: 'structure', rect: [171, 1133, 199, 1151], label: 'Гаражный блок 2' },
  { id: 'dorm-garage-3', kind: 'structure', rect: [217, 1124, 239, 1140], label: 'Гаражный блок 3' },
  // Entrance structures (КПП)
  { id: 'kpp-n', kind: 'structure', rect: [340, 10, 390, 30] },
  { id: 'kpp-w', kind: 'structure', rect: [192, 415, 230, 455] },
  { id: 'kpp-sw', kind: 'structure', rect: [255, 1129, 282, 1142], label: 'Юго-западное КПП' },
  { id: 'kpp-e', kind: 'structure', rect: [660, 405, 700, 465] }
];
