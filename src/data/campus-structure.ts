export type BuildingStructure = {
  id: string;
  name: string;
  shortName: string;
  floorCount: number;
  description: string;
};

export const campusInfo = {
  id: 'ajou-tashkent',
  name: 'Ajou University in Tashkent',
};

export const knownBuildings: BuildingStructure[] = [
  { id: 'bld-a', shortName: 'N', name: 'North Building', floorCount: 4, description: 'North building (brown roof)' },
  { id: 'bld-b', shortName: 'E', name: 'Block E', floorCount: 4, description: 'North-east long building' },
  { id: 'bld-c', shortName: 'D', name: 'Block D', floorCount: 2, description: 'Central-north building (2 floors)' },
  { id: 'bld-d', shortName: 'F', name: 'Block F', floorCount: 2, description: 'East grey-roof building' },
  { id: 'bld-g', shortName: 'B', name: 'Block B', floorCount: 4, description: 'Long red-roof building north of the main building' },
  { id: 'bld-h', shortName: 'A', name: 'Block A', floorCount: 2, description: 'Main building (map pin location, 2 floors)' },
  { id: 'bld-i', shortName: 'C', name: 'Block C', floorCount: 2, description: 'Block C (Conference hall, canteen, classrooms)' },
  { id: 'bld-j', shortName: 'Dorm', name: 'Dormitory', floorCount: 4, description: 'C-shaped dormitory building' },
];
