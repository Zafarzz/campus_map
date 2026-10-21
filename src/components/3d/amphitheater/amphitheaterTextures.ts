import * as THREE from 'three';

let cachedFloorLogo: THREE.CanvasTexture | null = null;
let cachedBookshelf: THREE.CanvasTexture | null = null;
let cachedScreen: THREE.CanvasTexture | null = null;
let cachedGrilyato: THREE.CanvasTexture | null = null;
let cachedParquet: THREE.CanvasTexture | null = null;

/**
 * Creates the high-resolution circular floor emblem (AUT 2020)
 * matching the CAD drawing "ЛОГОТИП В ПОЛУ AJOU 2020 Ø 3.20 м".
 */
export function getAmphitheaterFloorLogoTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (cachedFloorLogo) return cachedFloorLogo;

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const cx = 512;
  const cy = 512;

  // Outer circle (Ø 3.20m)
  ctx.beginPath();
  ctx.arc(cx, cy, 500, 0, Math.PI * 2);
  ctx.fillStyle = '#1d4ed8';
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#f8fafc';
  ctx.stroke();

  // Inner circle (Ø 2.20m)
  ctx.beginPath();
  ctx.arc(cx, cy, 350, 0, Math.PI * 2);
  ctx.fillStyle = '#0b1329';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#38bdf8';
  ctx.stroke();

  // Decorative ring of dots
  ctx.fillStyle = '#fde047';
  for (let i = 0; i < 36; i++) {
    const angle = (i * Math.PI * 2) / 36;
    const rx = cx + Math.cos(angle) * 425;
    const ry = cy + Math.sin(angle) * 425;
    ctx.beginPath();
    ctx.arc(rx, ry, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Circular Text on Ring
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px "Montserrat", "Arial", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const textTop = 'AJOU UNIVERSITY IN TASHKENT';
  const radiusText = 430;
  for (let i = 0; i < textTop.length; i++) {
    const angle = -Math.PI / 2 + ((i - textTop.length / 2 + 0.5) * 0.08);
    ctx.save();
    ctx.translate(cx + Math.cos(angle) * radiusText, cy + Math.sin(angle) * radiusText);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillText(textTop[i], 0, 0);
    ctx.restore();
  }

  // Center Emblem & Year
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 72px "Montserrat", "Arial", sans-serif';
  ctx.fillText('AJOU', cx, cy - 70);

  ctx.fillStyle = '#fde047';
  ctx.font = 'bold 44px "Montserrat", "Arial", sans-serif';
  ctx.fillText('★ 2020 ★', cx, cy);

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 26px "Montserrat", "Arial", sans-serif';
  ctx.fillText('AMPHITHEATER HALL', cx, cy + 60);

  // Stylized open book / wings
  ctx.beginPath();
  ctx.moveTo(cx - 80, cy + 110);
  ctx.quadraticCurveTo(cx, cy + 90, cx + 80, cy + 110);
  ctx.quadraticCurveTo(cx, cy + 130, cx - 80, cy + 110);
  ctx.fillStyle = '#38bdf8';
  ctx.fill();

  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  cachedFloorLogo = texture;
  return texture;
}

/**
 * Creates the high-resolution Bookshelf texture with realistic book spines,
 * wood shelf horizontal bands, and book colors.
 */
export function getBookshelfTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (cachedBookshelf) return cachedBookshelf;

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Dark walnut cabinet backing
  ctx.fillStyle = '#261408';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const shelfCount = 8;
  const shelfH = canvas.height / shelfCount;
  const bookColors = ['#1e3a8a', '#991b1b', '#065f46', '#78350f', '#4c1d95', '#0f766e', '#854d0e', '#334155'];

  for (let s = 0; s < shelfCount; s++) {
    const yShelf = s * shelfH;

    // Books
    let curX = 16;
    while (curX < canvas.width - 24) {
      const bookW = 10 + Math.floor((Math.sin(s * 10 + curX) + 1) * 8);
      const bookH = shelfH * 0.72 + (Math.cos(curX * 3) * 12);
      const color = bookColors[Math.abs(Math.floor(Math.sin(curX + s) * bookColors.length)) % bookColors.length];

      ctx.fillStyle = color;
      ctx.fillRect(curX, yShelf + shelfH - 12 - bookH, bookW, bookH);

      // Book spine highlight & gold leaf embossing
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fillRect(curX + 2, yShelf + shelfH - 12 - bookH, 2, bookH);

      if (bookW > 14) {
        ctx.fillStyle = '#fde047';
        ctx.fillRect(curX + 4, yShelf + shelfH - 12 - bookH + 10, bookW - 8, 2);
        ctx.fillRect(curX + 4, yShelf + shelfH - 12 - 16, bookW - 8, 2);
      }

      curX += bookW + 2;
    }

    // Wooden shelf board
    ctx.fillStyle = '#78350f';
    ctx.fillRect(0, yShelf + shelfH - 12, canvas.width, 12);
    ctx.fillStyle = '#92400e';
    ctx.fillRect(0, yShelf + shelfH - 12, canvas.width, 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, yShelf + shelfH, canvas.width, 6);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  cachedBookshelf = texture;
  return texture;
}

/**
 * Creates the giant North LED screen display graphic.
 */
export function getAmphitheaterScreenTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (cachedScreen) return cachedScreen;

  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 700;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Dark cyber-blue background with gradient
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#030712');
  grad.addColorStop(1, '#0f172a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Digital grid mesh
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Header Bar
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(40, 30, canvas.width - 80, 60);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 30, canvas.width - 80, 60);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 24px "Montserrat", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('AJOU UNIVERSITY IN TASHKENT', 60, 60);

  ctx.fillStyle = '#fde047';
  ctx.textAlign = 'right';
  ctx.fillText('MAIN AUDITORIUM • LIVE SESSION', canvas.width - 60, 60);

  // Main Screen Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 56px "Montserrat", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('INTERNATIONAL SCIENTIFIC CONFERENCE', canvas.width / 2, 220);

  ctx.fillStyle = '#38bdf8';
  ctx.font = '32px "Montserrat", sans-serif';
  ctx.fillText('Advanced Engineering & Global Education 2026', canvas.width / 2, 280);

  // Decorative Audio/Signal Waveforms & Graphics
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 80; x < canvas.width - 80; x += 10) {
    const y = 430 + Math.sin(x * 0.03) * 45 * Math.sin(x * 0.005);
    if (x === 80) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Metrics Widgets at bottom
  const widgets = [
    { label: 'ATTENDEES', val: '240 / 250' },
    { label: 'AUDIO SYSTEM', val: 'DOLBY ATMOS 7.1' },
    { label: 'STAGE DISPLAY', val: '4K LASER HDR' },
  ];
  widgets.forEach((w, i) => {
    const wx = 120 + i * 380;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.fillRect(wx, 530, 280, 90);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.strokeRect(wx, 530, 280, 90);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px "Montserrat", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(w.label, wx + 16, 555);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 24px "Montserrat", sans-serif';
    ctx.fillText(w.val, wx + 16, 592);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  cachedScreen = texture;
  return texture;
}

/**
 * Creates the dark Grilyato open-cell ceiling texture.
 */
export function getGrilyatoTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (cachedGrilyato) return cachedGrilyato;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Dark deep background
  ctx.fillStyle = '#060a12';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Thin open-cell metal ribs
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 4;
  const step = 32;
  for (let x = 0; x <= canvas.width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Cell highlight
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(16, 16);
  cachedGrilyato = texture;
  return texture;
}

/**
 * Creates the light parquet/laminate floor planks texture.
 */
export function getParquetFloorTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (cachedParquet) return cachedParquet;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Light warm Scandinavian laminate color
  ctx.fillStyle = '#e2d8c3';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Planks
  const plankH = 32;
  for (let y = 0; y < canvas.height; y += plankH) {
    ctx.fillStyle = (y / plankH) % 2 === 0 ? '#ded4bd' : '#e6dcc8';
    ctx.fillRect(0, y, canvas.width, plankH);

    // Plank seams
    ctx.strokeStyle = '#c4b79b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 6);
  cachedParquet = texture;
  return texture;
}
