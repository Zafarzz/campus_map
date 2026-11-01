# IMPLEMENTATION PLAN: Campus Simulation & 3D Walk

## 1. Overview

This implementation plan details the step-by-step rollout of the Campus Simulation environment for Ajou University in Tashkent.

---

## 2. Detailed Phases

### Phase 1: Dynamic Time & Lighting System (Direction #2)
- **Task 1.1**: Centralized Time & Lighting Store (`src/state/lightingState.ts`).
  - 24-hour cycle time tracking ($00:00$ to $23:59$).
  - Celestial sun position mathematical model:
    - $\text{SunAzimuth} = \text{time} \times 15^\circ$
    - $\text{SunElevation} = \sin((\text{time} - 6) / 12 \times \pi)$
  - Sun color, ambient intensity, hemisphere, fog, and exposure smooth interpolation.
  - Fountain lighting controller state: enabled, color (`#38bdf8`, etc.), intensity.
  - Night windows state: room night light randomness seed and probability.
- **Task 1.2**: Integrate Dynamic Lighting into Map View (`CampusMap.tsx`).
  - Connect sky, sun directional light, and ambient to dynamic time state.
- **Task 1.3**: Night Room Lighting on Facades and Windows.
  - Add emissive night-window illumination to buildings (`DetailedBuilding.tsx` / `Building.tsx`).
- **Task 1.4**: Fountain Lighting Controller.
  - Connect `CampusFountain` and `GameScene` to the fountain lighting state.

### Phase 2: First-Person 3D Walk & Interaction (Direction #1)
- **Task 2.1**: Player Controller & Physics Audit (`FirstPersonController.tsx`).
  - Verify 1.76m height capsule collider with 1.65m eye level.
  - Smooth slope and staircase stepping with gentle inclined colliders.
- **Task 2.2**: Interaction Framework (`src/game/interaction/`).
  - Create `InteractionSystem.tsx` using Three.js Raycaster centered on camera view.
  - Crosshair and interaction prompt HUD ("Press E to open/close").
  - Raycast distance check ($\le 3.5\text{ m}$).
- **Task 2.3**: Interactive Doors & Hinge Physics (`src/game/world/InteractiveDoor.tsx`).
  - Hinge rotation with smooth animation (damping).
  - Dynamic Rapier cuboid collider matching the rotated door leaf.
  - Place interactive doors at main entrance portals (Block F Library, Amphitheater, etc.).

### Phase 3: Player Character & NPC Navigation System (Direction #3)
- **Task 3.1**: Modular Low-Poly Procedural Human Model (`src/game/character/CharacterMesh.tsx`).
  - Stylized low-poly human with torso, head, hair, arms, and legs.
  - Parameterized colors (skin, shirt, trousers, hair).
  - Procedural walking and idle animation via harmonic rotation of limbs.
- **Task 3.2**: NPC Navigation & Waypoint System (`src/game/npc/NPCManager.tsx`).
  - Campus pedestrian graph connecting entrances, fountain, central promenade, sports field borders, and quads.
  - Waypoint steering behavior, pause/idle durations, velocity-driven animation.
  - Frustum/distance culling for performance.

### Phase 4: UI/UX & Mode Polish
- **Task 4.1**: HUD Time & Lighting Controls (`GameHUD.tsx`).
  - Time slider / preset selector (Morning, Midday, Sunset, Night).
  - Fountain lighting color and toggle.
  - NPC density controls.
  - Clean interaction indicator.
- **Task 4.2**: Map View Controls.
  - Time control panel integrated in main UI footer.

### Phase 5: Verification & Regression QA
- **Task 5.1**: Automated test suite (`vitest run`).
- **Task 5.2**: TypeScript verification (`tsc --noEmit`).
- **Task 5.3**: Production build verification (`vite build`).
- **Task 5.4**: Documentation updates (`PROGRESS.md`).
