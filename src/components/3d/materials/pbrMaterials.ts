import * as THREE from 'three';
import {
  applyArchitecturalGlassShader,
  applyTravertineWeatheringShader,
} from '../shaders/architecturalShaders';

export interface ProceduralPBRTextureSet {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

const textureCache = new Map<string, ProceduralPBRTextureSet>();

function isBrowserCanvasAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    return Boolean(c && typeof c.getContext === 'function');
  } catch {
    return false;
  }
}

function createCanvas(size: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
} {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }
  return { canvas, ctx };
}

function configureRepeatingTexture(
  canvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  isColor: boolean,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a tileable travertine/granite promenade paving texture set (diffuse, normal, roughness).
 * Designed for the 480m x 480m ground plane: repeat 120x120 = 4m x 4m per tile (8x8 slabs = 0.5m slabs).
 */
export function getPromenadePavingTextures(
  repeatX = 120,
  repeatY = 120,
): ProceduralPBRTextureSet | null {
  if (!isBrowserCanvasAvailable()) return null;
  const cacheKey = `paving_${repeatX}_${repeatY}`;
  const existing = textureCache.get(cacheKey);
  if (existing) return existing;

  const size = 512;
  const { canvas: diffC, ctx: diffCtx } = createCanvas(size);
  const { canvas: normC, ctx: normCtx } = createCanvas(size);
  const { canvas: roughC, ctx: roughCtx } = createCanvas(size);
  if (!diffCtx || !normCtx || !roughCtx) return null;

  // Base warm limestone/granite
  diffCtx.fillStyle = '#ddd9d1';
  diffCtx.fillRect(0, 0, size, size);

  // Neutral normal map (128, 128, 255)
  normCtx.fillStyle = 'rgb(128, 128, 255)';
  normCtx.fillRect(0, 0, size, size);

  // Base roughness (~0.82)
  roughCtx.fillStyle = 'rgb(208, 208, 208)';
  roughCtx.fillRect(0, 0, size, size);

  // Running bond ashlar paving slabs (8 rows x 8 columns -> 0.5m x 0.5m pavers)
  const rows = 8;
  const cols = 8;
  const rowH = size / rows;
  const colW = size / cols;

  let seed = 104729;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Subtle macro stone clouding so large plazas feel natural
  for (let i = 0; i < 60; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const rad = 30 + rand() * 70;
    diffCtx.fillStyle =
      rand() > 0.5 ? 'rgba(248, 245, 238, 0.14)' : 'rgba(185, 178, 168, 0.12)';
    diffCtx.beginPath();
    diffCtx.arc(cx, cy, rad, 0, Math.PI * 2);
    diffCtx.fill();
  }

  for (let r = 0; r < rows; r++) {
    const offsetX = r % 2 === 1 ? colW * 0.5 : 0;
    for (let c = -1; c <= cols; c++) {
      const x = c * colW + offsetX;
      const y = r * rowH;

      // Subtle per-slab warm/cool stone tone variation
      const delta = Math.floor((rand() - 0.5) * 9);
      const baseR = 221 + delta;
      const baseG = 217 + delta;
      const baseB = 209 + delta;
      diffCtx.fillStyle = `rgba(${baseR}, ${baseG}, ${baseB}, 0.82)`;
      diffCtx.fillRect(x + 1, y + 1, colW - 2, rowH - 2);

      // Roughness variation per slab
      const rVal = 195 + Math.floor(rand() * 32);
      roughCtx.fillStyle = `rgb(${rVal}, ${rVal}, ${rVal})`;
      roughCtx.fillRect(x + 1, y + 1, colW - 2, rowH - 2);

      // Hairline joint mortar lines in diffuse (subtle warm grey, never dark cartoon lines)
      diffCtx.strokeStyle = 'rgba(168, 162, 153, 0.42)';
      diffCtx.lineWidth = 1;
      diffCtx.strokeRect(x + 0.5, y + 0.5, colW - 1, rowH - 1);

      // Gentle normal map bevels for subtle 3D stone joints
      normCtx.fillStyle = 'rgb(128, 112, 255)';
      normCtx.fillRect(x + 1, y, colW - 2, 1.5);
      normCtx.fillStyle = 'rgb(128, 144, 255)';
      normCtx.fillRect(x + 1, y + rowH - 1.5, colW - 2, 1.5);
      normCtx.fillStyle = 'rgb(112, 128, 255)';
      normCtx.fillRect(x, y + 1, 1.5, rowH - 2);
      normCtx.fillStyle = 'rgb(144, 128, 255)';
      normCtx.fillRect(x + colW - 1.5, y + 1, 1.5, rowH - 2);
    }
  }

  // Subtle mineral grain mottling without high-frequency single-pixel noise
  for (let i = 0; i < 240; i++) {
    const gx = Math.floor(rand() * size);
    const gy = Math.floor(rand() * size);
    const bright = rand() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(70,65,58,0.035)';
    diffCtx.fillStyle = bright;
    diffCtx.fillRect(gx, gy, 4, 4);
  }

  const set: ProceduralPBRTextureSet = {
    map: configureRepeatingTexture(diffC, repeatX, repeatY, true),
    normalMap: configureRepeatingTexture(normC, repeatX, repeatY, false),
    roughnessMap: configureRepeatingTexture(roughC, repeatX, repeatY, false),
  };
  textureCache.set(cacheKey, set);
  return set;
}

/**
 * Generates a realistic weathered asphalt surface texture set with aggregate grain.
 * Default repeat (0.22, 0.22) is calibrated for ExtrudeGeometry where 1 UV unit = 1 world meter.
 */
export function getAsphaltRoadTextures(
  repeatX = 0.22,
  repeatY = 0.22,
): ProceduralPBRTextureSet | null {
  if (!isBrowserCanvasAvailable()) return null;
  const cacheKey = `asphalt_${repeatX}_${repeatY}`;
  const existing = textureCache.get(cacheKey);
  if (existing) return existing;

  const size = 256;
  const { canvas: diffC, ctx: diffCtx } = createCanvas(size);
  const { canvas: normC, ctx: normCtx } = createCanvas(size);
  const { canvas: roughC, ctx: roughCtx } = createCanvas(size);
  if (!diffCtx || !normCtx || !roughCtx) return null;

  // High-albedo neutral aggregate base so material.color (#3b4654) controls final road brightness without double-darkening
  diffCtx.fillStyle = '#d8dee6';
  diffCtx.fillRect(0, 0, size, size);

  normCtx.fillStyle = 'rgb(128, 128, 255)';
  normCtx.fillRect(0, 0, size, size);

  roughCtx.fillStyle = 'rgb(222, 222, 222)';
  roughCtx.fillRect(0, 0, size, size);

  let seed = 99371;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Subtle macro asphalt wear patches
  for (let i = 0; i < 45; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 16 + rand() * 36;
    diffCtx.fillStyle =
      rand() > 0.5 ? 'rgba(248, 250, 252, 0.18)' : 'rgba(148, 163, 184, 0.18)';
    diffCtx.beginPath();
    diffCtx.arc(x, y, r, 0, Math.PI * 2);
    diffCtx.fill();
  }

  for (let i = 0; i < 1200; i++) {
    const x = Math.floor(rand() * size);
    const y = Math.floor(rand() * size);
    const v = 185 + Math.floor(rand() * 55);
    diffCtx.fillStyle = `rgb(${v}, ${v + 2}, ${v + 5})`;
    diffCtx.fillRect(x, y, 3, 3);

    const nx = 116 + Math.floor(rand() * 24);
    const ny = 116 + Math.floor(rand() * 24);
    normCtx.fillStyle = `rgb(${nx}, ${ny}, 255)`;
    normCtx.fillRect(x, y, 3, 3);

    const rv = 205 + Math.floor(rand() * 40);
    roughCtx.fillStyle = `rgb(${rv}, ${rv}, ${rv})`;
    roughCtx.fillRect(x, y, 3, 3);
  }

  const set: ProceduralPBRTextureSet = {
    map: configureRepeatingTexture(diffC, repeatX, repeatY, true),
    normalMap: configureRepeatingTexture(normC, repeatX, repeatY, false),
    roughnessMap: configureRepeatingTexture(roughC, repeatX, repeatY, false),
  };
  textureCache.set(cacheKey, set);
  return set;
}

/**
 * Generates an organic multi-toned lush botanical lawn turf texture set.
 * Default repeat (0.16, 0.16) is calibrated for ExtrudeGeometry where 1 UV unit = 1 world meter (~6m patches).
 */
export function getLushGrassTextures(
  repeatX = 0.16,
  repeatY = 0.16,
): ProceduralPBRTextureSet | null {
  if (!isBrowserCanvasAvailable()) return null;
  const cacheKey = `grass_${repeatX}_${repeatY}`;
  const existing = textureCache.get(cacheKey);
  if (existing) return existing;

  const size = 256;
  const { canvas: diffC, ctx: diffCtx } = createCanvas(size);
  const { canvas: normC, ctx: normCtx } = createCanvas(size);
  const { canvas: roughC, ctx: roughCtx } = createCanvas(size);
  if (!diffCtx || !normCtx || !roughCtx) return null;

  // High-albedo botanical turf base so multiplying by material.color (#6d964b) yields rich sunlit grass
  diffCtx.fillStyle = '#dce8cf';
  diffCtx.fillRect(0, 0, size, size);

  normCtx.fillStyle = 'rgb(128, 128, 255)';
  normCtx.fillRect(0, 0, size, size);

  roughCtx.fillStyle = 'rgb(218, 218, 218)';
  roughCtx.fillRect(0, 0, size, size);

  let seed = 55109;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Organic dappled lawn patches (warm golden-olive highlights + deeper clover tones)
  for (let i = 0; i < 140; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const radius = 12 + rand() * 28;
    diffCtx.fillStyle =
      rand() > 0.48 ? 'rgba(242, 249, 226, 0.28)' : 'rgba(168, 196, 144, 0.26)';
    diffCtx.beginPath();
    diffCtx.arc(x, y, radius, 0, Math.PI * 2);
    diffCtx.fill();
  }

  // Soft organic turf blade tufts and smooth surface normal gradients
  for (let i = 0; i < 350; i++) {
    const x = Math.floor(rand() * size);
    const y = Math.floor(rand() * size);
    diffCtx.fillStyle =
      rand() > 0.5 ? 'rgba(145, 175, 120, 0.22)' : 'rgba(245, 252, 232, 0.22)';
    diffCtx.fillRect(x, y, 4, 5);
  }

  // Smooth organic sod clumps for subtle, non-shimmering depth
  for (let i = 0; i < 60; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const radius = 8 + rand() * 16;
    const grad = normCtx.createRadialGradient(x, y, 0, x, y, radius);
    const nx = Math.floor(122 + (rand() - 0.5) * 12);
    const ny = Math.floor(122 + (rand() - 0.5) * 12);
    grad.addColorStop(0, `rgb(${nx}, ${ny}, 255)`);
    grad.addColorStop(1, 'rgb(128, 128, 255)');
    normCtx.fillStyle = grad;
    normCtx.beginPath();
    normCtx.arc(x, y, radius, 0, Math.PI * 2);
    normCtx.fill();
  }

  const set: ProceduralPBRTextureSet = {
    map: configureRepeatingTexture(diffC, repeatX, repeatY, true),
    normalMap: configureRepeatingTexture(normC, repeatX, repeatY, false),
    roughnessMap: configureRepeatingTexture(roughC, repeatX, repeatY, false),
  };
  textureCache.set(cacheKey, set);
  return set;
}

/**
 * Generates an architectural honed travertine / limestone ashlar facade normal & roughness texture set
 * with horizontal mineral veining, subtle porous cavities, and beveled mortar joints.
 */
export function getArchitecturalWallTextures(
  repeatX = 0.25,
  repeatY = 0.25,
): ProceduralPBRTextureSet | null {
  if (!isBrowserCanvasAvailable()) return null;
  // Consolidate box-UV callers (repeatX >= 4) into a single shared facade texture set to save VRAM
  const normRepeatX = repeatX >= 4 ? 10 : repeatX;
  const normRepeatY = repeatY >= 1 ? 3 : repeatY;
  const cacheKey = `wall_${normRepeatX}_${normRepeatY}`;
  const existing = textureCache.get(cacheKey);
  if (existing) return existing;

  const size = 256;
  const { canvas: diffC, ctx: diffCtx } = createCanvas(size);
  const { canvas: normC, ctx: normCtx } = createCanvas(size);
  const { canvas: roughC, ctx: roughCtx } = createCanvas(size);
  if (!diffCtx || !normCtx || !roughCtx) return null;

  diffCtx.fillStyle = '#faf8f5';
  diffCtx.fillRect(0, 0, size, size);

  normCtx.fillStyle = 'rgb(128, 128, 255)';
  normCtx.fillRect(0, 0, size, size);

  roughCtx.fillStyle = 'rgb(204, 204, 204)';
  roughCtx.fillRect(0, 0, size, size);

  const rows = 8;
  const cols = 4;
  const rowH = size / rows;
  const colW = size / cols;

  let seed = 77312;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let r = 0; r < rows; r++) {
    const ox = r % 2 === 1 ? colW * 0.5 : 0;
    for (let c = -1; c <= cols; c++) {
      const x = c * colW + ox;
      const y = r * rowH;
      const shade = 246 + Math.floor((rand() - 0.5) * 12);
      diffCtx.fillStyle = `rgb(${shade}, ${shade - 1}, ${shade - 4})`;
      diffCtx.fillRect(x + 1, y + 1, colW - 2, rowH - 2);

      // Horizontal travertine sedimentary striation veins inside each ashlar block
      for (let v = 0; v < 5; v++) {
        const vy = y + 3 + rand() * (rowH - 6);
        const vw = 12 + rand() * (colW - 18);
        const vx = x + 2 + rand() * (colW - vw - 4);
        diffCtx.fillStyle =
          rand() > 0.45 ? 'rgba(218, 208, 194, 0.35)' : 'rgba(255, 253, 249, 0.38)';
        diffCtx.fillRect(vx, vy, vw, 1.5);
        normCtx.fillStyle = 'rgb(128, 121, 255)';
        normCtx.fillRect(vx, vy, vw, 1);
      }

      const rVal = 185 + Math.floor(rand() * 35);
      roughCtx.fillStyle = `rgb(${rVal}, ${rVal}, ${rVal})`;
      roughCtx.fillRect(x + 1, y + 1, colW - 2, rowH - 2);

      diffCtx.strokeStyle = 'rgba(148, 142, 134, 0.28)';
      diffCtx.lineWidth = 1;
      diffCtx.strokeRect(x + 0.5, y + 0.5, colW - 1, rowH - 1);

      normCtx.fillStyle = 'rgb(128, 110, 255)';
      normCtx.fillRect(x + 1, y, colW - 2, 1.5);
      normCtx.fillStyle = 'rgb(128, 146, 255)';
      normCtx.fillRect(x + 1, y + rowH - 1.5, colW - 2, 1.5);
      normCtx.fillStyle = 'rgb(110, 128, 255)';
      normCtx.fillRect(x, y + 1, 1.5, rowH - 2);
      normCtx.fillStyle = 'rgb(146, 128, 255)';
      normCtx.fillRect(x + colW - 1.5, y + 1, 1.5, rowH - 2);
    }
  }

  const set: ProceduralPBRTextureSet = {
    map: configureRepeatingTexture(diffC, normRepeatX, normRepeatY, true),
    normalMap: configureRepeatingTexture(normC, normRepeatX, normRepeatY, false),
    roughnessMap: configureRepeatingTexture(roughC, normRepeatX, normRepeatY, false),
  };
  textureCache.set(cacheKey, set);
  return set;
}

/**
 * Generates a flamed dark basalt / granite ashlar PBR texture set for building plinths and steps.
 */
export function getGranitePlinthTextures(
  repeatX = 4,
  repeatY = 1,
): ProceduralPBRTextureSet | null {
  if (!isBrowserCanvasAvailable()) return null;
  const normRepeatX = repeatX >= 1 ? 4 : repeatX;
  const normRepeatY = repeatY >= 1 ? 1 : repeatY;
  const cacheKey = `granite_plinth_${normRepeatX}_${normRepeatY}`;
  const existing = textureCache.get(cacheKey);
  if (existing) return existing;

  const size = 256;
  const { canvas: diffC, ctx: diffCtx } = createCanvas(size);
  const { canvas: normC, ctx: normCtx } = createCanvas(size);
  const { canvas: roughC, ctx: roughCtx } = createCanvas(size);
  if (!diffCtx || !normCtx || !roughCtx) return null;

  diffCtx.fillStyle = '#e2e8f0';
  diffCtx.fillRect(0, 0, size, size);
  normCtx.fillStyle = 'rgb(128, 128, 255)';
  normCtx.fillRect(0, 0, size, size);
  roughCtx.fillStyle = 'rgb(212, 212, 212)';
  roughCtx.fillRect(0, 0, size, size);

  let seed = 31991;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Crystalline granite mineral speckles & micro-normals
  for (let i = 0; i < 800; i++) {
    const x = Math.floor(rand() * size);
    const y = Math.floor(rand() * size);
    const v = 195 + Math.floor(rand() * 52);
    diffCtx.fillStyle = `rgb(${v}, ${v}, ${v + 3})`;
    diffCtx.fillRect(x, y, 3, 3);

    const nx = 118 + Math.floor(rand() * 20);
    const ny = 118 + Math.floor(rand() * 20);
    normCtx.fillStyle = `rgb(${nx}, ${ny}, 255)`;
    normCtx.fillRect(x, y, 3, 3);
  }

  // Heavy rusticated plinth courses (4 rows x 2 cols)
  const rows = 4;
  const cols = 2;
  const rowH = size / rows;
  const colW = size / cols;
  for (let r = 0; r < rows; r++) {
    const ox = r % 2 === 1 ? colW * 0.5 : 0;
    for (let c = -1; c <= cols; c++) {
      const x = c * colW + ox;
      const y = r * rowH;
      diffCtx.strokeStyle = 'rgba(71, 85, 105, 0.45)';
      diffCtx.lineWidth = 2;
      diffCtx.strokeRect(x + 1, y + 1, colW - 2, rowH - 2);

      normCtx.fillStyle = 'rgb(128, 104, 255)';
      normCtx.fillRect(x + 1, y, colW - 2, 2);
      normCtx.fillStyle = 'rgb(128, 152, 255)';
      normCtx.fillRect(x + 1, y + rowH - 2, colW - 2, 2);
    }
  }

  const set: ProceduralPBRTextureSet = {
    map: configureRepeatingTexture(diffC, normRepeatX, normRepeatY, true),
    normalMap: configureRepeatingTexture(normC, normRepeatX, normRepeatY, false),
    roughnessMap: configureRepeatingTexture(roughC, normRepeatX, normRepeatY, false),
  };
  textureCache.set(cacheKey, set);
  return set;
}

/**
 * Generates a profiled metal-tile / standing-seam roof PBR texture set (diffuse shadow ribs, normal bevels, roughness).
 * Default repeat (0.5, 0.5) is calibrated for world-space roof UVs where 1 UV unit = 1 meter.
 */
export function getRoofTileTextures(
  repeatX = 0.5,
  repeatY = 0.5,
): ProceduralPBRTextureSet | null {
  if (!isBrowserCanvasAvailable()) return null;
  const cacheKey = `roof_${repeatX}_${repeatY}`;
  const existing = textureCache.get(cacheKey);
  if (existing) return existing;

  const size = 256;
  const { canvas: diffC, ctx: diffCtx } = createCanvas(size);
  const { canvas: normC, ctx: normCtx } = createCanvas(size);
  const { canvas: roughC, ctx: roughCtx } = createCanvas(size);
  if (!diffCtx || !normCtx || !roughCtx) return null;

  diffCtx.fillStyle = '#f8fafc';
  diffCtx.fillRect(0, 0, size, size);
  normCtx.fillStyle = 'rgb(128, 128, 255)';
  normCtx.fillRect(0, 0, size, size);
  roughCtx.fillStyle = 'rgb(172, 172, 172)';
  roughCtx.fillRect(0, 0, size, size);

  // Vertical standing seams / corrugation ribs (16 ribs across tile)
  const ribs = 16;
  const ribW = size / ribs;
  for (let i = 0; i < ribs; i++) {
    const x = i * ribW;
    // Soft sinusoidal highlight/shadow across corrugation wave
    diffCtx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    diffCtx.fillRect(x, 0, ribW * 0.45, size);
    diffCtx.fillStyle = 'rgba(15, 23, 42, 0.16)';
    diffCtx.fillRect(x + ribW * 0.55, 0, ribW * 0.45, size);

    // Normal X tilt for 3D corrugated rib lighting
    normCtx.fillStyle = 'rgb(154, 128, 250)';
    normCtx.fillRect(x, 0, ribW * 0.45, size);
    normCtx.fillStyle = 'rgb(102, 128, 250)';
    normCtx.fillRect(x + ribW * 0.55, 0, ribW * 0.45, size);
  }

  // Horizontal overlapping tile steps (8 courses)
  const courses = 8;
  const courseH = size / courses;
  for (let r = 0; r < courses; r++) {
    const y = r * courseH;
    diffCtx.fillStyle = 'rgba(15, 23, 42, 0.22)';
    diffCtx.fillRect(0, y, size, 2.5);
    normCtx.fillStyle = 'rgb(128, 98, 248)';
    normCtx.fillRect(0, y, size, 3);
    roughCtx.fillStyle = 'rgb(210, 210, 210)';
    roughCtx.fillRect(0, y, size, 3);
  }

  const set: ProceduralPBRTextureSet = {
    map: configureRepeatingTexture(diffC, repeatX, repeatY, true),
    normalMap: configureRepeatingTexture(normC, repeatX, repeatY, false),
    roughnessMap: configureRepeatingTexture(roughC, repeatX, repeatY, false),
  };
  textureCache.set(cacheKey, set);
  return set;
}

/**
 * Generates an architectural warm oak / walnut wood grain PBR texture set for interior floors,
 * lecture desks, library bookcases, and amphitheater timber tiers.
 */
export function getInteriorWoodTextures(
  repeatX = 2,
  repeatY = 2,
): ProceduralPBRTextureSet | null {
  if (!isBrowserCanvasAvailable()) return null;
  // Consolidate interior wood callers into a single shared PBR texture set to save VRAM and canvas work
  const normRepeatX = repeatX >= 1 ? 4 : repeatX;
  const normRepeatY = repeatY >= 1 ? 4 : repeatY;
  const cacheKey = `wood_${normRepeatX}_${normRepeatY}`;
  const existing = textureCache.get(cacheKey);
  if (existing) return existing;

  const size = 256;
  const { canvas: diffC, ctx: diffCtx } = createCanvas(size);
  const { canvas: normC, ctx: normCtx } = createCanvas(size);
  const { canvas: roughC, ctx: roughCtx } = createCanvas(size);
  if (!diffCtx || !normCtx || !roughCtx) return null;

  diffCtx.fillStyle = '#f5ebe0';
  diffCtx.fillRect(0, 0, size, size);
  normCtx.fillStyle = 'rgb(128, 128, 255)';
  normCtx.fillRect(0, 0, size, size);
  roughCtx.fillStyle = 'rgb(148, 148, 148)';
  roughCtx.fillRect(0, 0, size, size);

  let seed = 41883;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Parquet planks (8 strips) with fine longitudinal wood fibers
  const planks = 8;
  const plankH = size / planks;
  for (let p = 0; p < planks; p++) {
    const y = p * plankH;
    const tone = 236 + Math.floor((rand() - 0.5) * 18);
    diffCtx.fillStyle = `rgb(${tone}, ${tone - 6}, ${tone - 14})`;
    diffCtx.fillRect(0, y + 1, size, plankH - 1);

    const rTone = 135 + Math.floor(rand() * 28);
    roughCtx.fillStyle = `rgb(${rTone}, ${rTone}, ${rTone})`;
    roughCtx.fillRect(0, y + 1, size, plankH - 1);

    // Wood grain fibers
    for (let f = 0; f < 14; f++) {
      const fy = y + 2 + rand() * (plankH - 4);
      diffCtx.fillStyle =
        rand() > 0.5 ? 'rgba(180, 145, 110, 0.18)' : 'rgba(255, 250, 242, 0.18)';
      diffCtx.fillRect(0, fy, size, 1.2);
    }

    // Plank seam bevel
    diffCtx.fillStyle = 'rgba(120, 95, 72, 0.35)';
    diffCtx.fillRect(0, y, size, 1);
    normCtx.fillStyle = 'rgb(128, 114, 255)';
    normCtx.fillRect(0, y, size, 1.5);
  }

  const set: ProceduralPBRTextureSet = {
    map: configureRepeatingTexture(diffC, normRepeatX, normRepeatY, true),
    normalMap: configureRepeatingTexture(normC, normRepeatX, normRepeatY, false),
    roughnessMap: configureRepeatingTexture(roughC, normRepeatX, normRepeatY, false),
  };
  textureCache.set(cacheKey, set);
  return set;
}

/**
 * Generates a honed porcelain tile PBR texture set for interior corridors and lobbies.
 */
export function getPolishedTileTextures(
  repeatX = 12,
  repeatY = 4,
): ProceduralPBRTextureSet | null {
  if (!isBrowserCanvasAvailable()) return null;
  const cacheKey = `tile_${repeatX}_${repeatY}`;
  const existing = textureCache.get(cacheKey);
  if (existing) return existing;

  const size = 256;
  const { canvas: diffC, ctx: diffCtx } = createCanvas(size);
  const { canvas: normC, ctx: normCtx } = createCanvas(size);
  const { canvas: roughC, ctx: roughCtx } = createCanvas(size);
  if (!diffCtx || !normCtx || !roughCtx) return null;

  diffCtx.fillStyle = '#f8fafc';
  diffCtx.fillRect(0, 0, size, size);
  normCtx.fillStyle = 'rgb(128, 128, 255)';
  normCtx.fillRect(0, 0, size, size);
  roughCtx.fillStyle = 'rgb(112, 112, 112)';
  roughCtx.fillRect(0, 0, size, size);

  const grid = 4;
  const step = size / grid;
  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      const x = c * step;
      const y = r * step;
      diffCtx.strokeStyle = 'rgba(148, 163, 184, 0.38)';
      diffCtx.lineWidth = 1.5;
      diffCtx.strokeRect(x + 0.75, y + 0.75, step - 1.5, step - 1.5);

      normCtx.fillStyle = 'rgb(128, 114, 255)';
      normCtx.fillRect(x, y, step, 1.5);
      normCtx.fillStyle = 'rgb(114, 128, 255)';
      normCtx.fillRect(x, y, 1.5, step);
    }
  }

  const set: ProceduralPBRTextureSet = {
    map: configureRepeatingTexture(diffC, repeatX, repeatY, true),
    normalMap: configureRepeatingTexture(normC, repeatX, repeatY, false),
    roughnessMap: configureRepeatingTexture(roughC, repeatX, repeatY, false),
  };
  textureCache.set(cacheKey, set);
  return set;
}

/**
 * Procedural dark marble (Nero Marquina / Graphite) texture set with white/silver veins.
 * Conforms to reference furniture drawing (Image 1: МДФ з імітацією мармуру).
 */
export function getDarkMarbleTextures(
  repeatX = 1,
  repeatY = 1,
): ProceduralPBRTextureSet | null {
  if (!isBrowserCanvasAvailable()) return null;
  const cacheKey = `dark_marble_${repeatX}_${repeatY}`;
  const existing = textureCache.get(cacheKey);
  if (existing) return existing;

  const size = 512;
  const { canvas: diffC, ctx: diffCtx } = createCanvas(size);
  const { canvas: normC, ctx: normCtx } = createCanvas(size);
  const { canvas: roughC, ctx: roughCtx } = createCanvas(size);
  if (!diffCtx || !normCtx || !roughCtx) return null;

  // Dark graphite/charcoal stone base
  diffCtx.fillStyle = '#18181b';
  diffCtx.fillRect(0, 0, size, size);
  normCtx.fillStyle = 'rgb(128, 128, 255)';
  normCtx.fillRect(0, 0, size, size);
  roughCtx.fillStyle = 'rgb(45, 45, 45)'; // High gloss polished stone (~0.18 roughness)
  roughCtx.fillRect(0, 0, size, size);

  // Subtle dark stone mottling
  let seed = 91823;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < 300; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 10 + rand() * 35;
    diffCtx.fillStyle = rand() > 0.5 ? 'rgba(30, 41, 59, 0.18)' : 'rgba(9, 9, 11, 0.22)';
    diffCtx.beginPath();
    diffCtx.arc(x, y, r, 0, Math.PI * 2);
    diffCtx.fill();
  }

  // Organic marble veins using bezier curves
  const drawVein = (
    sx: number, sy: number, ex: number, ey: number,
    c1x: number, c1y: number, c2x: number, c2y: number,
    w: number, a: number,
  ) => {
    diffCtx.strokeStyle = `rgba(248, 250, 252, ${a})`;
    diffCtx.lineWidth = w;
    diffCtx.beginPath();
    diffCtx.moveTo(sx, sy);
    diffCtx.bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey);
    diffCtx.stroke();

    normCtx.strokeStyle = `rgba(138, 120, 255, ${a * 0.35})`;
    normCtx.lineWidth = w * 1.4;
    normCtx.beginPath();
    normCtx.moveTo(sx, sy);
    normCtx.bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey);
    normCtx.stroke();
  };

  // Primary diagonal sweeping veins
  drawVein(0, 80, 512, 420, 160, 260, 320, 240, 2.5, 0.65);
  drawVein(0, 60, 512, 390, 140, 240, 310, 220, 1.2, 0.45);
  drawVein(60, 0, 480, 512, 220, 160, 340, 380, 2.0, 0.55);
  drawVein(120, 512, 512, 120, 280, 380, 410, 220, 1.8, 0.5);

  // Secondary fine branches
  drawVein(180, 210, 280, 120, 220, 170, 260, 140, 0.9, 0.4);
  drawVein(320, 280, 440, 350, 360, 320, 400, 330, 0.8, 0.35);
  drawVein(140, 300, 80, 420, 120, 350, 90, 390, 0.9, 0.35);

  const set: ProceduralPBRTextureSet = {
    map: configureRepeatingTexture(diffC, repeatX, repeatY, true),
    normalMap: configureRepeatingTexture(normC, repeatX, repeatY, false),
    roughnessMap: configureRepeatingTexture(roughC, repeatX, repeatY, false),
  };
  textureCache.set(cacheKey, set);
  return set;
}

let cachedWindowGlassTexture: THREE.CanvasTexture | null = null;

/**
 * Generates an architectural glass reflection & interior depth texture so windows
 * never appear as flat black or opaque blue rectangles.
 */
export function getWindowGlassTexture(): THREE.CanvasTexture | null {
  if (!isBrowserCanvasAvailable()) return null;
  if (cachedWindowGlassTexture) return cachedWindowGlassTexture;

  const size = 256;
  const { canvas, ctx } = createCanvas(size);
  if (!ctx) return null;

  // Vertical sky-to-campus reflection gradient (Low-E architectural glazing)
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0.0, '#334e68'); // Upper sky reflection
  grad.addColorStop(0.32, '#243b53'); // Low-E cool slate-blue glazing
  grad.addColorStop(0.58, '#16283a'); // Horizon transition
  grad.addColorStop(0.82, '#0f1c2a'); // Deep interior absorption
  grad.addColorStop(1.0, '#1e293b'); // Warm interior floor rebound
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Subtle interior Venetian blind / ceiling soffit louvers in upper third
  ctx.fillStyle = 'rgba(15, 23, 42, 0.38)';
  ctx.fillRect(0, 0, size, size * 0.25);
  for (let y = 6; y < size * 0.25; y += 7) {
    ctx.fillStyle = 'rgba(203, 213, 225, 0.11)';
    ctx.fillRect(8, y, size - 16, 2.5);
  }

  // Diagonal architectural specular reflection sheen across the glass pane
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(size * 0.1, 0);
  ctx.lineTo(size * 0.42, 0);
  ctx.lineTo(size * 0.16, size);
  ctx.lineTo(0, size);
  ctx.closePath();
  const sheen = ctx.createLinearGradient(0, 0, size * 0.45, size);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
  sheen.addColorStop(0.5, 'rgba(186, 230, 253, 0.10)');
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0.02)');
  ctx.fillStyle = sheen;
  ctx.fill();
  ctx.restore();

  // Subtle dark perimeter gasket AO inside the mullion rebate
  ctx.strokeStyle = 'rgba(2, 6, 23, 0.55)';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, size - 10, size - 10);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  cachedWindowGlassTexture = tex;
  return tex;
}

/**
 * Helper to create a physically accurate dielectric travertine / stone facade material
 * (`metalness: 0.0`) enhanced with normal/roughness maps and world-space weathering GLSL shader.
 */
export function createTravertineWallMaterial(params: {
  color: string;
  roughness?: number;
  transparent?: boolean;
  opacity?: number;
  polygonOffset?: boolean;
}): THREE.MeshStandardMaterial {
  const pbr = getArchitecturalWallTextures(0.25, 0.25);
  const mat = new THREE.MeshStandardMaterial({
    color: params.color,
    map: pbr?.map ?? null,
    normalMap: pbr?.normalMap ?? null,
    normalScale: new THREE.Vector2(0.22, 0.22),
    roughnessMap: pbr?.roughnessMap ?? null,
    roughness: params.roughness ?? 0.82,
    metalness: 0.0, // Stone/travertine is strictly a dielectric (non-metal)
    transparent: params.transparent ?? false,
    opacity: params.opacity ?? 1,
    depthWrite: !(params.transparent ?? false),
    polygonOffset: params.polygonOffset ?? false,
    polygonOffsetFactor: params.polygonOffset ? 1 : 0,
    polygonOffsetUnits: params.polygonOffset ? 1 : 0,
  });
  return applyTravertineWeatheringShader(mat);
}

/**
 * Helper to create a physically accurate architectural Low-E glass material with Fresnel shader.
 */
export function createArchitecturalGlassMaterial(params: {
  color?: string;
  transparent?: boolean;
  opacity?: number;
  fresnelStrength?: number;
}): THREE.MeshStandardMaterial {
  const glassTex = getWindowGlassTexture();
  const isDimmed = Boolean(params.transparent && (params.opacity ?? 1) < 0.9);
  const mat = new THREE.MeshStandardMaterial({
    color: params.color ?? '#1e3a5f',
    map: glassTex ?? null,
    roughness: 0.08,
    metalness: 0.15, // Low dielectric metallic tint; Fresnel shader drives grazing sky reflection
    envMapIntensity: 1.6,
    transparent: true,
    opacity: isDimmed ? (params.opacity ?? 1) * 0.75 : 0.92,
    depthWrite: !isDimmed,
  });
  return applyArchitecturalGlassShader(mat, {
    fresnelStrength: params.fresnelStrength ?? 0.72,
  });
}

let cachedEnvTexture: THREE.CanvasTexture | null = null;

/**
 * Generates an equirectangular procedural sky + sun + warm limestone ground environment map
 * for Image-Based Lighting (IBL). Attaching this to `scene.environment` makes all metallic
 * and glossy materials (windows, mullions, gold arches, lamp posts) reflect realistic sky & ground
 * instead of pitch black.
 */
export function getProceduralEnvironmentTexture(): THREE.CanvasTexture | null {
  if (!isBrowserCanvasAvailable()) return null;
  if (cachedEnvTexture) return cachedEnvTexture;

  const width = 512;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx) return null;

  // Equirectangular vertical gradient: zenith (y=0) -> horizon (y=128) -> nadir ground (y=256)
  const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
  skyGrad.addColorStop(0.0, '#1d4ed8'); // Deep clear zenith blue
  skyGrad.addColorStop(0.28, '#60a5fa'); // Mid sky blue
  skyGrad.addColorStop(0.47, '#dbeafe'); // Bright atmospheric horizon
  skyGrad.addColorStop(0.5, '#f8fafc'); // Horizon glow
  skyGrad.addColorStop(0.53, '#ddd4c4'); // Warm sunlit travertine plaza bounce
  skyGrad.addColorStop(0.75, '#8c857b'); // Mid ground bounce
  skyGrad.addColorStop(1.0, '#475569'); // Deep nadir shadow
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, width, height);

  // Warm solar disc glow in the upper hemisphere
  const sunX = width * 0.68;
  const sunY = height * 0.24;
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 95);
  sunGrad.addColorStop(0.0, 'rgba(255, 253, 240, 1.0)');
  sunGrad.addColorStop(0.25, 'rgba(254, 243, 199, 0.65)');
  sunGrad.addColorStop(0.6, 'rgba(186, 230, 253, 0.25)');
  sunGrad.addColorStop(1.0, 'rgba(186, 230, 253, 0.0)');
  ctx.fillStyle = sunGrad;
  ctx.fillRect(0, 0, width, height * 0.55);

  // Soft sunlit cloud reflections along the upper horizon
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  for (let i = 0; i < 8; i++) {
    const cx = (i * 67 + 25) % width;
    const cy = height * (0.34 + (i % 3) * 0.04);
    ctx.beginPath();
    ctx.ellipse(cx, cy, 38, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  cachedEnvTexture = tex;
  return tex;
}
