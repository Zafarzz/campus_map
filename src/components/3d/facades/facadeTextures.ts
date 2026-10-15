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

let cachedAutGateLogo: THREE.CanvasTexture | null = null;

/**
 * Creates high-resolution bronze-gold logo texture for the Main Entrance (КПП) pylon:
 * Stylized diamond emblem, "2020", and "AUT" (Ajou University in Tashkent).
 */
export function getAutGateLogoTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (cachedAutGateLogo) return cachedAutGateLogo;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const goldColor = '#BA6F27'; // RAL 1036 Bronze gold from color passport
  const darkGold = '#8c5018';

  // Draw stylized rhombus logo emblem (concentric geometric diamonds)
  ctx.save();
  ctx.translate(256, 170);

  // Outer diamond
  ctx.strokeStyle = goldColor;
  ctx.lineWidth = 22;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -90);
  ctx.lineTo(80, 0);
  ctx.lineTo(0, 90);
  ctx.lineTo(-80, 0);
  ctx.closePath();
  ctx.stroke();

  // Inner interlocking loop / ribbon
  ctx.strokeStyle = darkGold;
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(0, -55);
  ctx.lineTo(50, 0);
  ctx.lineTo(0, 55);
  ctx.lineTo(-50, 0);
  ctx.closePath();
  ctx.stroke();

  ctx.restore();

  // "2020"
  ctx.fillStyle = goldColor;
  ctx.font = 'bold 36px "Montserrat", "Arial", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('2020', 256, 305);

  // "AUT"
  ctx.font = 'bold 84px "Montserrat", "Arial", sans-serif';
  ctx.fillText('AUT', 256, 385);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  cachedAutGateLogo = texture;
  return texture;
}

let cachedSteleTexture: THREE.CanvasTexture | null = null;

/**
 * Creates high-resolution texture for the monumental entrance stele "AJOU UNIVERSITY" (11m x 1.47m):
 * Dark graphite stone with orange circular emblem and bold white lettering.
 */
export function getAjouSteleTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (cachedSteleTexture) return cachedSteleTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Dark graphite stone background (#2B2E34)
  ctx.fillStyle = '#2B2E34';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle border highlight
  ctx.strokeStyle = '#3E424B';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);

  // Ajou Orange Emblem (sun circle) on the left
  ctx.save();
  ctx.fillStyle = '#EA580C';
  ctx.beginPath();
  ctx.arc(140, 128, 52, 0, Math.PI * 2);
  ctx.fill();

  // Inner stylized detail
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(140, 128, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // "AJOU UNIVERSITY" text
  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 76px "Montserrat", "Arial", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('AJOU UNIVERSITY', 230, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  cachedSteleTexture = texture;
  return texture;
}

let cachedBannerTexture: THREE.CanvasTexture | null = null;

/**
 * Creates texture for the "AJOU UNIVERSITY INFO BANNER" board mounted along the fence.
 */
export function getAjouBannerTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (cachedBannerTexture) return cachedBannerTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Deep navy background (#172554)
  ctx.fillStyle = '#172554';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // White border
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

  // "AJOU UNIVERSITY"
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 38px "Montserrat", "Arial", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AJOU UNIVERSITY', 256, 100);

  // "INFO BANNER"
  ctx.font = '600 24px "Montserrat", "Arial", sans-serif';
  ctx.fillStyle = '#93C5FD';
  ctx.fillText('INFO BANNER', 256, 160);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  cachedBannerTexture = texture;
  return texture;
}

let cachedFenceTexture: THREE.CanvasTexture | null = null;

/**
 * Creates high-detail transparent picket fence texture based on CAD Sheet 1:
 * - 3-1: RAL 7024 metal (#363A42), vertical profile 20x20 with open space between pickets
 * - Top spear tips and decorative diamond frieze (300mm)
 * - Horizontal structural rails and 3m spacing posts
 * Used with alphaTest for high-performance transparent picket rendering.
 */
export function getFenceTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (cachedFenceTexture) return cachedFenceTexture;

  const width = 768;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);

  const metalColor = '#3A3F47'; // RAL 7024
  const highlightColor = '#646D7D';

  const numBays = 20; // 20 pickets per 3m section
  const step = width / numBays;

  // 1. Spear tips at the very top (protruding above top rail)
  ctx.fillStyle = metalColor;
  for (let i = 0; i < numBays; i++) {
    const x = (i + 0.5) * step;
    ctx.beginPath();
    ctx.moveTo(x, 2);
    ctx.lineTo(x + 7, 34);
    ctx.lineTo(x - 7, 34);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = highlightColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, 4);
    ctx.lineTo(x, 32);
    ctx.stroke();
  }

  // 2. Top Rail (Y = 34 to 46)
  ctx.fillStyle = metalColor;
  ctx.fillRect(0, 34, width, 12);
  ctx.fillStyle = highlightColor;
  ctx.fillRect(0, 34, width, 2);

  // 3. Diamond frieze band (Y = 46 to 124)
  ctx.strokeStyle = metalColor;
  ctx.lineWidth = 5;
  for (let i = 0; i < numBays; i++) {
    const x1 = i * step;
    const x2 = (i + 1) * step;
    const midX = (x1 + x2) / 2;
    // Criss-cross diagonals forming diamonds
    ctx.beginPath();
    ctx.moveTo(x1, 46);
    ctx.lineTo(midX, 124);
    ctx.lineTo(x2, 46);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x1, 124);
    ctx.lineTo(midX, 46);
    ctx.lineTo(x2, 124);
    ctx.stroke();
  }

  // 4. Middle Rail (Y = 124 to 136)
  ctx.fillStyle = metalColor;
  ctx.fillRect(0, 124, width, 12);
  ctx.fillStyle = highlightColor;
  ctx.fillRect(0, 124, width, 2);

  // 5. Vertical pickets (Y = 136 to 494) with transparent gaps in between!
  ctx.fillStyle = metalColor;
  for (let i = 0; i < numBays; i++) {
    const x = (i + 0.5) * step - 4;
    ctx.fillRect(x, 136, 8, 358);
    // Vertical highlight stripe
    ctx.fillStyle = highlightColor;
    ctx.fillRect(x + 1, 136, 2, 358);
    ctx.fillStyle = metalColor;
  }

  // 6. Bottom Rail (Y = 494 to 510)
  ctx.fillStyle = metalColor;
  ctx.fillRect(0, 494, width, 16);
  ctx.fillStyle = highlightColor;
  ctx.fillRect(0, 494, width, 2);

  // 7. Structural Posts every 3m (at left and right ends)
  ctx.fillStyle = metalColor;
  ctx.fillRect(0, 16, 16, 494);
  ctx.fillRect(width - 16, 16, 16, 494);
  ctx.fillStyle = highlightColor;
  ctx.fillRect(2, 16, 2, 494);
  ctx.fillRect(width - 14, 16, 2, 494);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  cachedFenceTexture = texture;
  return texture;
}


