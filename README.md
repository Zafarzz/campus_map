# 🗺️ Ajou University in Tashkent - 3D Campus Map Prototype

**Notice to AI Agents / Developers:**  
This project is an interactive 3D map prototype of the Ajou University campus in Tashkent. It was built with a strict **data-first architecture** because the exact indoor architectural floor plans are not yet available.

## 🏗 Architecture & Stack
- **Stack**: Vite + React + TypeScript + `@react-three/fiber` + `@react-three/drei`.
- **Domain logic**: `src/domain/` contains pure TypeScript types (Campus, Building, Floor, Room, Schedule). It does *not* know about Three.js or rendering.
- **Geometry Injection**: The 3D geometry is fully decoupled from the business data. Currently, we use `ScreenshotGeometryProvider` which traces simple boxes from a Google Earth image. When real CAD/Blender floor plans arrive, write a new provider that conforms to `CampusGeometry` and inject it. The React components will not need to change!

## 📂 Key Files & Data Flow
1. `src/data/campus-structure.ts`: The authoritative list of known campus blocks (Block A, Block B, etc.).
2. `src/data/demo-campus.ts`: Maps the official schedule rooms (e.g., `A-102`, `C-conF`) onto the buildings. If a floor doesn't have known rooms, it generates a few placeholders. **Do not invent exact floor plans.**
3. `src/data/reference-footprints.ts`: The raw pixel coordinates traced from the Google Earth screenshot.
4. `src/data/demo-schedule.ts`: Generates a simulated schedule for whatever rooms exist in the campus data.
5. `src/state/MapProvider.tsx`: Wires the domain, the geometry provider, and the schedule together.

## 🔀 Branches & Campus Layout Context
The official campus maps define **A Block**, **B Block**, **C Block**, and the **Dormitory**. However, the provided schedule data also requires **D Block** and **E Block**. 

There are two primary branches in this repository representing different interpretations of the campus architecture:

* **`main` (Physical / Google Earth truth)**: 
  - Represents the buildings exactly as they appear from satellite imagery.
  - **C Block** is not a single building. It is a cluster of three structures (Indoor Courts, Conference Hall, Canteen).
  - D and E blocks are mapped to the 4-story northern buildings.
* **`experiment/detailed-buildings` (Architectural Concept)**:
  - An experimental branch where the geometry is overridden to match an idealized 3D architectural rendering provided by the user.
  - **C Block** is merged into a single massive 4-story building.
  - A, B, C, and the Dormitory feature custom 3D procedural textures (windows, colored walls, red pitched roofs, cornices, etc.) via `DetailedBuilding.tsx`.

## 🛠 Getting Started
```bash
npm install
npm run dev
```

## 🤖 Instructions for Future Agents
1. **Changing Building Shapes**: Modify `reference-footprints.ts` or replace the `GeometryProvider` entirely.
2. **Updating Rooms**: If the user provides a real room list, update `demo-campus.ts`. The schedule and search UI will automatically adapt.
3. **DO NOT** hardcode 3D coordinates into the React UI components. Always pass them through the geometry provider.
4. **DO NOT** rely on hover interactions as the only way to reveal information. Ensure full click/tap support.
