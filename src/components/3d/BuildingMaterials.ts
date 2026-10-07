import * as THREE from 'three';

export function createWindowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  
  // Wall color (cream/beige)
  ctx.fillStyle = '#fef6e4';
  ctx.fillRect(0, 0, 128, 128);
  
  // Window holes
  ctx.fillStyle = '#1e293b'; // dark glass
  
  // 4 windows per block
  const w = 20;
  const h = 40;
  
  // Row 1
  ctx.fillRect(16, 20, w, h);
  ctx.fillRect(48, 20, w, h);
  ctx.fillRect(80, 20, w, h);
  
  // Row 2
  ctx.fillRect(16, 80, w, h);
  ctx.fillRect(48, 80, w, h);
  ctx.fillRect(80, 80, w, h);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // Repeat based on building scale
  return texture;
}

export const windowMaterial = new THREE.MeshStandardMaterial({
  map: createWindowTexture(),
  roughness: 0.8,
});
