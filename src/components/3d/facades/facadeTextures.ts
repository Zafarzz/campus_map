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

let cachedDualFriezeTexture: THREE.CanvasTexture | null = null;
let cachedEnglishFriezeTexture: THREE.CanvasTexture | null = null;
let cachedKoreanFriezeTexture: THREE.CanvasTexture | null = null;

/**
 * High-resolution dedicated texture for English signage frieze panel (Bays 2–3 / Axes 2–4):
 * "AJOU UNIVERSITY IN TASHKENT"
 * Reconstructed directly from 2D Blueprint Photo 2 («ФАСАД КОРПУСА В ОСЯХ 1–7»).
 */
export function getAjouEnglishFriezeTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (cachedEnglishFriezeTexture) return cachedEnglishFriezeTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 4096;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Background light travertine matching classical wall frieze
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Architectural panel border
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

  // Horizontal reveal shadow lines top and bottom
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(6, 12, canvas.width - 12, 4);
  ctx.fillRect(6, canvas.height - 16, canvas.width - 12, 4);

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  // Volumetric English text: "AJOU UNIVERSITY IN TASHKENT" (calibrated height to fit cleanly below cornice)
  ctx.font = '900 160px "Montserrat", "Arial Black", "Arial", sans-serif';
  if ('letterSpacing' in ctx) {
    ctx.letterSpacing = '6px';
  }
  ctx.shadowColor = 'rgba(0, 43, 102, 0.35)';
  ctx.shadowOffsetX = 4;
  ctx.shadowOffsetY = 6;
  ctx.shadowBlur = 5;

  // Dark navy stroke outline + rich cobalt/navy fill
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#001433';
  ctx.strokeText('AJOU UNIVERSITY IN TASHKENT', canvas.width / 2, canvas.height / 2 + 4);
  ctx.fillStyle = '#002b66';
  ctx.fillText('AJOU UNIVERSITY IN TASHKENT', canvas.width / 2, canvas.height / 2 + 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 16;
  texture.needsUpdate = true;
  cachedEnglishFriezeTexture = texture;
  return texture;
}

/**
 * High-resolution dedicated texture for Korean signage frieze panel (Bay 5 / Axes 5–6):
 * "아주대학교 타슈켄트"
 * Reconstructed directly from 2D Blueprint Photo 2 («ФАСАД КОРПУСА В ОСЯХ 1–7»).
 */
export function getAjouKoreanFriezeTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (cachedKoreanFriezeTexture) return cachedKoreanFriezeTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 3072;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Background light travertine matching classical wall frieze
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Architectural panel border
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

  // Horizontal reveal shadow lines top and bottom
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(6, 12, canvas.width - 12, 4);
  ctx.fillRect(6, canvas.height - 16, canvas.width - 12, 4);

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  // Volumetric Korean CJK typography using installed Noto Sans CJK KR: "아주대학교 타슈켄트"
  ctx.font = '900 170px "Noto Sans CJK KR", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  if ('letterSpacing' in ctx) {
    ctx.letterSpacing = '8px';
  }
  ctx.shadowColor = 'rgba(0, 43, 102, 0.35)';
  ctx.shadowOffsetX = 4;
  ctx.shadowOffsetY = 6;
  ctx.shadowBlur = 5;

  // Dual-pass stroke + fill for razor-sharp legibility
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#001433';
  ctx.strokeText('아주대학교 타슈켄트', canvas.width / 2, canvas.height / 2 + 4);
  ctx.fillStyle = '#002b66';
  ctx.fillText('아주대학교 타슈켄트', canvas.width / 2, canvas.height / 2 + 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 16;
  texture.needsUpdate = true;
  cachedKoreanFriezeTexture = texture;
  return texture;
}

/**
 * Creates high-resolution texture for Block F entablature frieze:
 * English: "AJOU UNIVERSITY IN TASHKENT" on the left,
 * Korean: "아주대학교 타슈켄트" on the right.
 * Reconstructed from blueprint: "ФАСАД КОРПУСА «AJOU UNIVERSITY IN TASHKENT» В ОСЯХ 1–7".
 */
export function getAjouDualFriezeTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (cachedDualFriezeTexture) return cachedDualFriezeTexture;

  const canvas = document.createElement('canvas');
  // High-density 8K canvas for ultra-sharp letterforms at steep oblique viewing angles
  canvas.width = 8192;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Background light travertine / white frieze matching the classical building wall
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Architectural architrave panel border
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

  // Subtle horizontal reveal shadow line along top and bottom
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(8, 16, canvas.width - 16, 6);
  ctx.fillRect(8, canvas.height - 22, canvas.width - 16, 6);

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  // 1. English text centered over Bays 2–3 (Axes 2–4, center at 2730 px):
  ctx.font = '900 190px "Montserrat", "Arial Black", "Arial", sans-serif';
  if ('letterSpacing' in ctx) {
    ctx.letterSpacing = '4px';
  }
  ctx.shadowColor = 'rgba(0, 43, 102, 0.4)';
  ctx.shadowOffsetX = 5;
  ctx.shadowOffsetY = 8;
  ctx.shadowBlur = 6;
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#001433';
  ctx.strokeText('AJOU UNIVERSITY IN TASHKENT', 2730, canvas.height / 2);
  ctx.fillStyle = '#002b66';
  ctx.fillText('AJOU UNIVERSITY IN TASHKENT', 2730, canvas.height / 2);

  // 2. Korean text centered over Bay 5 (Axes 5–6, center at 6144 px):
  ctx.font = '900 200px "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", "NanumGothic", "Arial Unicode MS", sans-serif';
  if ('letterSpacing' in ctx) {
    ctx.letterSpacing = '8px';
  }
  ctx.shadowColor = 'rgba(0, 43, 102, 0.45)';
  ctx.shadowOffsetX = 5;
  ctx.shadowOffsetY = 8;
  ctx.shadowBlur = 6;
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#001433';
  ctx.strokeText('아주대학교 타슈켄트', 6144, canvas.height / 2);
  ctx.fillStyle = '#002b66';
  ctx.fillText('아주대학교 타슈켄트', 6144, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 16;
  texture.needsUpdate = true;
  cachedDualFriezeTexture = texture;
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

  const width = 1024;
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
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  cachedFenceTexture = texture;
  return texture;
}

let cachedSportsMeshTexture: THREE.CanvasTexture | null = null;

/**
 * Procedural chain-link diamond wire mesh texture for sports court fences (4-6m height).
 */
export function getSportsMeshTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (cachedSportsMeshTexture) return cachedSportsMeshTexture;

  const width = 256;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, width, height);

  // Dense diamond chain-link wire netting
  ctx.strokeStyle = '#475569'; // High-tensile steel galvanized slate wire
  ctx.lineWidth = 1.4;

  const step = 12;
  for (let x = -width; x < width * 2; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + height, height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, height);
    ctx.lineTo(x + height, 0);
    ctx.stroke();
  }

  // Top & bottom steel framing bands
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, width, 6);
  ctx.fillRect(0, height - 6, width, 6);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  cachedSportsMeshTexture = texture;
  return texture;
}


