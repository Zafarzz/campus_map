import * as THREE from 'three';

let cachedAtticTexture: THREE.CanvasTexture | null = null;
let cachedCanopyTexture: THREE.CanvasTexture | null = null;
let cachedLogoTexture: THREE.Texture | null = null;

/**
 * Creates or retrieves the high-resolution texture for the top attic banner:
 * "TOSHKENT SHAHRIDAGI ADJU UNIVERSITETI"
 */
export function getAtticBannerTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (cachedAtticTexture) return cachedAtticTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Background travertine color matching the building wall
  ctx.fillStyle = '#eae2d3';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle stone joint borders
  ctx.strokeStyle = '#d5ccbc';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

  // Text setup
  ctx.fillStyle = '#2d2824';
  ctx.font = 'bold 82px "Montserrat", "Arial", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Crisp embossed shadow
  ctx.shadowColor = 'rgba(255, 255, 255, 0.7)';
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 2;
  ctx.shadowBlur = 0;

  const text = 'TOSHKENT SHAHRIDAGI ADJU UNIVERSITETI';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  cachedAtticTexture = texture;
  return texture;
}

/**
 * Creates or retrieves the high-resolution texture for the entrance canopy fascia:
 * "AJOU UNIVERSITY IN TASHKENT"
 */
export function getCanopySignTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (cachedCanopyTexture) return cachedCanopyTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Modern dark bronze / charcoal background
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // High-contrast clean architectural text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 96px "Montserrat", "Arial", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 3;
  ctx.shadowBlur = 4;

  const text = 'AJOU UNIVERSITY IN TASHKENT';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  cachedCanopyTexture = texture;
  return texture;
}

/**
 * Loads the official circular Ajou University in Tashkent emblem uploaded by the user.
 */
export function getAjouLogoTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  if (cachedLogoTexture) return cachedLogoTexture;

  const loader = new THREE.TextureLoader();
  const texture = loader.load('/assets/ajou-logo.png');
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  cachedLogoTexture = texture;
  return texture;
}
