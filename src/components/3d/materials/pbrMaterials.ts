import * as THREE from 'three';

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
  tex.anisotropy = 8;
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
      normCtx.fillStyle = 'rgb(128, 116, 255)';
      normCtx.fillRect(x + 1, y, colW - 2, 1.5);
      normCtx.fillStyle = 'rgb(128, 140, 255)';
      normCtx.fillRect(x + 1, y + rowH - 1.5, colW - 2, 1.5);
      normCtx.fillStyle = 'rgb(116, 128, 255)';
      normCtx.fillRect(x, y + 1, 1.5, rowH - 2);
      normCtx.fillStyle = 'rgb(140, 128, 255)';
      normCtx.fillRect(x + colW - 1.5, y + 1, 1.5, rowH - 2);
    }
  }

  // Fine mineral grain speckles
  for (let i = 0; i < 2200; i++) {
    const gx = Math.floor(rand() * size);
    const gy = Math.floor(rand() * size);
    const bright = rand() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(60,55,50,0.05)';
    diffCtx.fillStyle = bright;
    diffCtx.fillRect(gx, gy, 2, 2);
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

  for (let i = 0; i < 3600; i++) {
    const x = Math.floor(rand() * size);
    const y = Math.floor(rand() * size);
    const v = 185 + Math.floor(rand() * 55);
    diffCtx.fillStyle = `rgb(${v}, ${v + 2}, ${v + 5})`;
    diffCtx.fillRect(x, y, 2, 2);

    const nx = 118 + Math.floor(rand() * 20);
    const ny = 118 + Math.floor(rand() * 20);
    normCtx.fillStyle = `rgb(${nx}, ${ny}, 255)`;
    normCtx.fillRect(x, y, 2, 2);

    const rv = 205 + Math.floor(rand() * 40);
    roughCtx.fillStyle = `rgb(${rv}, ${rv}, ${rv})`;
    roughCtx.fillRect(x, y, 2, 2);
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

  // Fine blade strokes
  for (let i = 0; i < 2800; i++) {
    const x = Math.floor(rand() * size);
    const y = Math.floor(rand() * size);
    diffCtx.fillStyle =
      rand() > 0.5 ? 'rgba(145, 175, 120, 0.25)' : 'rgba(245, 252, 232, 0.25)';
    diffCtx.fillRect(x, y, 2, 3);

    const nx = 118 + Math.floor(rand() * 20);
    const ny = 116 + Math.floor(rand() * 24);
    normCtx.fillStyle = `rgb(${nx}, ${ny}, 255)`;
    normCtx.fillRect(x, y, 2, 2);
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
 * Generates an architectural travertine / plaster facade normal & roughness texture set
 * so building walls catch sunlight with subtle stone ashlar joints and weathered plaster depth.
 * Default repeat (0.25, 0.25) is calibrated for ExtrudeGeometry where 1 UV unit = 1 world meter.
 */
export function getArchitecturalWallTextures(
  repeatX = 0.25,
  repeatY = 0.25,
): ProceduralPBRTextureSet | null {
  if (!isBrowserCanvasAvailable()) return null;
  const cacheKey = `wall_${repeatX}_${repeatY}`;
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

  roughCtx.fillStyle = 'rgb(200, 200, 200)';
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

      const rVal = 185 + Math.floor(rand() * 35);
      roughCtx.fillStyle = `rgb(${rVal}, ${rVal}, ${rVal})`;
      roughCtx.fillRect(x + 1, y + 1, colW - 2, rowH - 2);

      diffCtx.strokeStyle = 'rgba(148, 142, 134, 0.24)';
      diffCtx.lineWidth = 1;
      diffCtx.strokeRect(x + 0.5, y + 0.5, colW - 1, rowH - 1);

      normCtx.fillStyle = 'rgb(128, 114, 255)';
      normCtx.fillRect(x + 1, y, colW - 2, 1.5);
      normCtx.fillStyle = 'rgb(114, 128, 255)';
      normCtx.fillRect(x, y + 1, 1.5, rowH - 2);
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

let cachedWindowGlassTexture: THREE.CanvasTexture | null = null;

/**
 * Generates an architectural glass reflection & interior depth texture so windows
 * never appear as flat black rectangles.
 */
export function getWindowGlassTexture(): THREE.CanvasTexture | null {
  if (!isBrowserCanvasAvailable()) return null;
  if (cachedWindowGlassTexture) return cachedWindowGlassTexture;

  const size = 256;
  const { canvas, ctx } = createCanvas(size);
  if (!ctx) return null;

  // Vertical sky-to-campus reflection gradient
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0.0, '#7dd3fc'); // Upper sky reflection
  grad.addColorStop(0.38, '#5b9bd5'); // Mid sky reflection
  grad.addColorStop(0.58, '#3b6e9c'); // Horizon reflection
  grad.addColorStop(0.78, '#2c4c6e'); // Lower interior depth
  grad.addColorStop(1.0, '#38597a'); // Warm ground bounce on lower sill
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Subtle upper interior Venetian blind / ceiling depth bands
  ctx.fillStyle = 'rgba(240, 249, 255, 0.14)';
  ctx.fillRect(0, 0, size, size * 0.24);
  for (let y = 6; y < size * 0.24; y += 8) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.fillRect(8, y, size - 16, 3);
  }

  // Diagonal architectural specular reflection streak across the pane
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(size * 0.12, 0);
  ctx.lineTo(size * 0.44, 0);
  ctx.lineTo(size * 0.16, size);
  ctx.lineTo(0, size);
  ctx.closePath();
  const sheen = ctx.createLinearGradient(0, 0, size * 0.45, size);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
  sheen.addColorStop(0.5, 'rgba(224, 242, 254, 0.16)');
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0.04)');
  ctx.fillStyle = sheen;
  ctx.fill();
  ctx.restore();

  // Subtle dark perimeter AO inside the frame rebate
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, size - 10, size - 10);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  cachedWindowGlassTexture = tex;
  return tex;
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
  skyGrad.addColorStop(0.0, '#2563eb'); // Deep clear zenith blue
  skyGrad.addColorStop(0.28, '#60a5fa'); // Mid sky blue
  skyGrad.addColorStop(0.47, '#dbeafe'); // Bright atmospheric horizon
  skyGrad.addColorStop(0.5, '#f8fafc'); // Horizon glow
  skyGrad.addColorStop(0.53, '#d6d0c4'); // Warm sunlit travertine plaza bounce
  skyGrad.addColorStop(0.75, '#8c857B'); // Mid ground bounce
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
    const cx = ((i * 67 + 25) % width);
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

