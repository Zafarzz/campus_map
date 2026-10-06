import { Html } from '@react-three/drei';
import type { Building } from '../../domain/campus/types';
import type { BuildingGeometry } from '../../domain/geometry/types';

type Props = {
  building: Building;
  geometry: BuildingGeometry;
  liveCount: number;
  muted: boolean;
  onSelect: (buildingId: string) => void;
};

/** Clickable building name tag floating above the roof. */
export function BuildingLabel({ building, geometry, liveCount, muted, onSelect }: Props) {
  const [x, , z] = geometry.center;
  return (
    <Html position={[x, geometry.height + 3, z]} center zIndexRange={[10, 0]}>
      <button
        type="button"
        className={`building-label${muted ? ' building-label--muted' : ''}`}
        onClick={() => onSelect(building.id)}
        title={building.name}
      >
        <strong>{building.shortName}</strong>
        <span>{building.floors.length}F</span>
        {liveCount > 0 && <span className="building-label__live">{liveCount} live</span>}
      </button>
    </Html>
  );
}
