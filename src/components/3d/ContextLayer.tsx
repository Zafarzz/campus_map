import { mapConfig } from '../../config/mapConfig';
import type { CampusGeometry, ContextFeatureKind } from '../../domain/geometry/types';
import { ExtrudedFootprint } from './ExtrudedFootprint';

/** Small vertical offsets avoid z-fighting between overlapping flat features. */
const flatLayer: Record<ContextFeatureKind, number> = {
  road: 0.02,
  lawn: 0.04,
  track: 0.06,
  pitch: 0.08,
  court: 0.08,
  structure: 0,
};

/** Ground plane + non-interactive surroundings. */
export function ContextLayer({ geometry }: { geometry: CampusGeometry }) {
  const { min, max } = geometry.bounds;
  const margin = 100;
  const width = max[0] - min[0] + margin * 2;
  const depth = max[1] - min[1] + margin * 2;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(min[0] + max[0]) / 2, -0.1, (min[1] + max[1]) / 2]} receiveShadow raycast={() => null}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#cbd5e1" roughness={1} />
      </mesh>
      {geometry.context.map((f) =>
        f.kind === 'structure' ? (
          <ExtrudedFootprint
            key={f.id}
            footprint={f.footprint}
            bottom={0}
            height={f.height ?? mapConfig.building.unknownStructureHeight}
            color="#94a3b8"
            opacity={1}
            interactive={false}
            castShadow
            receiveShadow
          />
        ) : (
          <ExtrudedFootprint
            key={f.id}
            footprint={f.footprint}
            bottom={flatLayer[f.kind]}
            height={0.02}
            color={mapConfig.colors.context[f.kind]}
            interactive={false}
            receiveShadow
          />
        ),
      )}
    </group>
  );
}
