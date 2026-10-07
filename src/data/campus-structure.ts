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
  { id: 'bld-c', shortName: 'D', name: 'Block D', floorCount: 4, description: 'Central-north building' },
  { id: 'bld-d', shortName: 'F', name: 'Block F', floorCount: 2, description: 'East grey-roof building' },
  { id: 'bld-e', shortName: 'C', name: 'Block C (Sports Hall)', floorCount: 2, description: 'Indoor hall (three tennis courts)' },
  { id: 'bld-f', shortName: 'C', name: 'Block C (Conference Hall)', floorCount: 2, description: 'Conference facility' },
  { id: 'bld-g', shortName: 'B', name: 'Block B', floorCount: 4, description: 'Long red-roof building north of the main building' },
  { id: 'bld-h', shortName: 'A', name: 'Block A', floorCount: 4, description: 'Main building (map pin location)' },
  { id: 'bld-i', shortName: 'C', name: 'Block C (Canteen)', floorCount: 2, description: 'Dining hall' },
  { id: 'bld-j', shortName: 'Dorm', name: 'Dormitory', floorCount: 4, description: 'C-shaped dormitory building' },
];
