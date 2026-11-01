import { InteractiveDoor } from './InteractiveDoor';

/**
 * Interactive Doors positioned across main campus entrance portals and interiors:
 * - Block F (Library main entrance)
 * - Amphitheater Hall main double portal
 * - Block A Entrance
 * - Block B Academic Entrance
 */
export function CampusInteractiveDoors() {
  return (
    <group name="campus-interactive-doors">
      {/* 1. Block F Library West Entrance Portal (X = 92.2, Z = -53.1) */}
      <InteractiveDoor
        id="door-block-f-library"
        position={[92.2, 0.25, -53.1]}
        rotationY={-Math.PI / 2}
        width={2.2}
        height={2.3}
        doubleDoor={true}
      />

      {/* 2. Amphitheater Hall West Entrance Double Portal (X = 40.55, Z = 77.0) */}
      <InteractiveDoor
        id="door-amphitheater-west"
        position={[40.55, 1.35, 77.0]}
        rotationY={-Math.PI / 2}
        width={2.4}
        height={2.4}
        doubleDoor={true}
      />

      {/* 3. Amphitheater Hall East Gallery Double Portal (X = 61.65, Z = 77.0) */}
      <InteractiveDoor
        id="door-amphitheater-east"
        position={[61.65, 1.35, 77.0]}
        rotationY={Math.PI / 2}
        width={2.2}
        height={2.4}
        doubleDoor={true}
      />

      {/* 4. Block A Academic Entrance (X = 20.5, Z = 73.0) */}
      <InteractiveDoor
        id="door-block-a-main"
        position={[20.5, 0.0, 73.0]}
        rotationY={0}
        width={1.8}
        height={2.3}
        doubleDoor={true}
      />

      {/* 5. Block B Academic Entrance (X = 69.0, Z = 44.5) */}
      <InteractiveDoor
        id="door-block-b-main"
        position={[69.0, 0.0, 44.5]}
        rotationY={0}
        width={1.8}
        height={2.3}
        doubleDoor={true}
      />
    </group>
  );
}
