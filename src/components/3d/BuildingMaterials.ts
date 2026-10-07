import * as THREE from 'three';

export function createWindowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  
  // Wall color (transparent so the mesh color shows through? No, needs to be white to multiply with mesh color)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);
  
  // Window holes
  ctx.fillStyle = '#0f172a'; // dark glass
  
  const w = 40;
  const h = 60;
  
  // 3 columns, 2 rows of windows
  const cols = [32, 108, 184];
  const rows = [40, 140];
  
  for (const x of cols) {
    for (const y of rows) {
      ctx.fillRect(x, y, w, h);
      // Window frame
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(x + w/2 - 2, y, 4, h);
      ctx.fillRect(x, y + h/2 - 2, w, 4);
      ctx.fillStyle = '#0f172a';
    }
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  // Scale the texture so it looks proportional on the buildings
  texture.repeat.set(0.1, 0.1); 
  return texture;
}

export const windowTexture = createWindowTexture();
