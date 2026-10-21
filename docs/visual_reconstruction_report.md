# Phase 2: Visual Reconstruction Report

## 1. Root-Cause Diagnosis

Inspecting the actual rendered application (`before_1_overview.png` – `before_4_fountain_plaza.png`) alongside the scene code revealed eight concrete technical causes behind the low-poly prototype appearance:

1. **Missing Image-Based Lighting (`scene.environment = null`)**:
   - Glass panes (`metalness: 0.85, roughness: 0.12`), window frames, lamp poles, and metal roofs had no environment map to reflect, causing them to render as flat black or dull gray rectangles.
2. **Window Glass Occluded Inside Opaque Frame Boxes**:
   - In [`BlockBFacade.tsx`](file:///home/zafargg/Рабочий%20стол/projects/campus-map/src/components/3d/facades/BlockBFacade.tsx), [`BlockBSouthFacade.tsx`](file:///home/zafargg/Рабочий%20стол/projects/campus-map/src/components/3d/facades/BlockBSouthFacade.tsx), and [`BlockCFacade.tsx`](file:///home/zafargg/Рабочий%20стол/projects/campus-map/src/components/3d/facades/BlockCFacade.tsx), the window glass box (`depth = 0.04`) was centered at the exact same Z/X coordinate as the solid opaque `frameMat` box (`depth = 0.08`), completely burying the glass inside the dark `#1e293b` frame box. The same bug hid Block B's 14m central curtain wall (`ВИТ-1`) and Block C's entrance pavilion glazing.
   - In [`DetailedBuilding.tsx`](file:///home/zafargg/Рабочий%20стол/projects/campus-map/src/components/3d/DetailedBuilding.tsx), `InstancedWindows` rendered a single unframed flat `boxGeometry(1.4, 1.6, 0.08)` with no frame, sill, or mullions.
3. **4-Sided Pyramid Cones Used as Building Roofs**:
   - `HipRoof` in [`DetailedBuilding.tsx`](file:///home/zafargg/Рабочий%20стол/projects/campus-map/src/components/3d/DetailedBuilding.tsx) used `<coneGeometry args={[1, 1, 4]} />` stretched non-uniformly by `[w, roofHeight, d]`, turning elongated rectangular academic wings into 4-sided pyramids meeting at a single point instead of true hipped roofs with a horizontal ridge.
4. **UV Scale Mismatch (`PlaneGeometry` `[0..1]` vs `ExtrudeGeometry` World Meters)**:
   - `getPromenadePavingTextures(36, 36)` on the `480m × 495m` ground plane made each 4×4 tile canvas span `13.3m × 13.3m` (`3.3m` per stone slab) with dark mortar joints (`rgb ~135`), creating a giant dark grid across the campus.
   - Conversely, `getLushGrassTextures(24, 24)` and `getArchitecturalWallTextures(8, 8)` were applied to `THREE.ExtrudeGeometry` footprints whose UVs are already in world meters (`1 UV = 1m`), repeating textures `24` times per meter (`4cm` micro-tiling noise) and double-darkening `material.color`.
5. **Single-Primitive Low-Poly Vegetation & Neon Mint Lawns**:
   - Deciduous trees were a single `<icosahedronGeometry args={[1.6, 1]} />`, conifers a single `<coneGeometry args={[1.4, 3.2, 7]} />`, shrubs a single `<dodecahedronGeometry args={[0.65, 1]} />`, and horizon trees were vertically stretched spheres floating above the ground.
   - Default lawn color in [`useVisualTuning.ts`](file:///home/zafargg/Рабочий%20стол/projects/campus-map/src/components/3d/tuning/useVisualTuning.ts) was `#6ee7b7` (neon mint).
6. **Palm Trunk Bark Rings Oriented Vertically & Flat Ribbon Fronds**:
   - In [`CampusFountain.tsx`](file:///home/zafargg/Рабочий%20стол/projects/campus-map/src/components/3d/CampusFountain.tsx), the 8 `<torusGeometry>` bark rings on every palm trunk lacked `rotation={[Math.PI / 2, 0, 0]}`, causing them to lie in the vertical XY plane and stick out sideways from the trunk like vertical handles.
7. **Environmental Props Submerged in the 1.5× Fountain Basin & Sports Courts**:
   - `isInsideBuildingMargin` in [`CampusEnvironmentDetail.tsx`](file:///home/zafargg/Рабочий%20стол/projects/campus-map/src/components/3d/environment/CampusEnvironmentDetail.tsx) checked the `1.0×` fountain bounds instead of the `1.5×` scaled fountain (`81m × 27m`), placing benches, bins, and lamps directly inside the water basin and on the blue multi-sport court.
8. **Overly Wide Directional Shadow Frustum (`±300m`)**:
   - A `600m × 600m` shadow frustum stretched the `2048²` shadow map to `~0.3m/texel`, softening building contact and facade shadow lines.

---

## 2. Before & After Visual Comparison

All four viewpoints below were captured from the exact same camera positions and angles before and after the reconstruction.

### View 1: Campus Overview (`/?cam=115,92,165,10,0,18`)
````carousel
![After — Campus Overview](/home/zafargg/.gemini/antigravity/brain/a7c80e00-ee4d-486c-b2d7-210ac791bee3/after_1_overview.png)
<!-- slide -->
![Before — Campus Overview](/home/zafargg/.gemini/antigravity/brain/a7c80e00-ee4d-486c-b2d7-210ac791bee3/before_1_overview.png)
````

### View 2: Academic Building Facade, Glazing & Courtyard Trees (`[45, 2.2, 48], yaw: 2.85`)
````carousel
![After — Building Facade & Courtyard](/home/zafargg/.gemini/antigravity/brain/a7c80e00-ee4d-486c-b2d7-210ac791bee3/after_2_facade.png)
<!-- slide -->
![Before — Building Facade & Courtyard](/home/zafargg/.gemini/antigravity/brain/a7c80e00-ee4d-486c-b2d7-210ac791bee3/before_2_facade.png)
````

### View 3: Ground Paving, Plaza Props & Approach (`[65, 2.2, 11.5], yaw: 1.85`)
````carousel
![After — Ground Paving & Approach](/home/zafargg/.gemini/antigravity/brain/a7c80e00-ee4d-486c-b2d7-210ac791bee3/after_3_ground_vegetation.png)
<!-- slide -->
![Before — Ground Paving & Approach](/home/zafargg/.gemini/antigravity/brain/a7c80e00-ee4d-486c-b2d7-210ac791bee3/before_3_ground_vegetation.png)
````

### View 4: Grand Fountain, Pinnate Palms & Water Basin (`[26, 2.2, 31], yaw: 0.72`)
````carousel
![After — Grand Fountain & Palms](/home/zafargg/.gemini/antigravity/brain/a7c80e00-ee4d-486c-b2d7-210ac791bee3/after_4_fountain_plaza.png)
<!-- slide -->
![Before — Grand Fountain & Palms](/home/zafargg/.gemini/antigravity/brain/a7c80e00-ee4d-486c-b2d7-210ac791bee3/before_4_fountain_plaza.png)
````

---

## 3. Performance & Quality Preset Telemetry

Measured at the Grand Fountain & Plaza viewpoint (`[26, 2.2, 31], yaw: 0.72`) via `gl.info`:

| Quality Preset | Draw Calls | Triangles (Main + Shadow Passes) | Geometries | Active Features |
|---|---:|---:|---:|---|
| **`high` (Ultra / RTX)** | 1,349 | 560,304 | 1,705 | 100% compound vegetation + tree shadow casting, `2048²` PCSS soft shadows, contact shadows, IBL reflections, 100% props & sky life |
| **`medium` (Balanced)** | 1,338 | 273,732 (`-51.1%`) | 1,705 | 70% compound vegetation (building-only shadow pass), `1536²` hardware PCF shadows, contact shadows, IBL reflections, 70% props |
| **`low` (Mobile / Low)** | 1,323 | 184,350 (`-67.1%`) | 1,694 | 35% compound vegetation, `1024²` shadows, no contact shadows, no wind shader, no secondary props/sky life, `dpr: [1, 1.25]` |
| **`original` (Baseline)** | 1,323 | 218,578 | 1,694 | Reference baseline without PBR maps, wind animation, contact shadows, or environmental props |
