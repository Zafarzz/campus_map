import { useMemo } from 'react';
import * as THREE from 'three';
import { NO_RAYCAST } from '../geometry/staticGeometryMerger';
import { getAjouLogoTexture } from './facadeTextures';

let cachedMedallionTextTexture: THREE.CanvasTexture | null = null;
function getMedallionTextTexture(): THREE.CanvasTexture | null {
  if (cachedMedallionTextTexture) return cachedMedallionTextTexture;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Primary Brand Blue
  ctx.fillStyle = '#002b66';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // "AJOU"
  ctx.font = '900 80px "Montserrat", "Arial Black", sans-serif';
  ctx.fillText('AJOU', canvas.width / 2, 62);

  // "UNIVERSITY"
  ctx.font = '700 44px "Montserrat", "Arial", sans-serif';
  ctx.letterSpacing = '3.5px';
  ctx.fillText('UNIVERSITY', canvas.width / 2, 130);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  cachedMedallionTextTexture = texture;
  return texture;
}

export type AjouLogoMedallionProps = {
  /** World or local position [x, y, z] */
  position?: [number, number, number];
  /** Euler rotation in radians [rx, ry, rz] */
  rotation?: [number, number, number];
  /** Overall scale multiplier (default: 1) */
  scale?: number;
  /** Radius of circular medallion in meters (default: 1.15) */
  radius?: number;
  /** Whether to render the embossed "AJOU UNIVERSITY" text plaque underneath (default: true) */
  showText?: boolean;
  /** Selection dimming opacity */
  opacity?: number;
  /** Transparency flag */
  transparent?: boolean;
};

/**
 * Universal 3D Architectural Medallion for Ajou University in Tashkent.
 * Reusable across Block C, Block F, and other campus facades.
 */
export function AjouLogoMedallion({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  radius = 1.15,
  showText = true,
  opacity = 1,
  transparent = false,
}: AjouLogoMedallionProps) {
  const logoTexture = useMemo(() => getAjouLogoTexture(), []);
  const textTexture = useMemo(() => (showText ? getMedallionTextTexture() : null), [showText]);

  const materials = useMemo(() => {
    const rimMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      metalness: 0.85,
      roughness: 0.25,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const navyMat = new THREE.MeshStandardMaterial({
      color: '#002b66',
      metalness: 0.1,
      roughness: 0.3,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const whiteMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      metalness: 0.05,
      roughness: 0.35,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    const logoMat = new THREE.MeshStandardMaterial({
      map: logoTexture ?? null,
      color: logoTexture ? '#ffffff' : '#002b66',
      roughness: 0.2,
      metalness: 0.08,
      transparent: true,
      opacity: transparent ? opacity * 0.5 : 1,
      depthWrite: !transparent,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    const textMat = new THREE.MeshStandardMaterial({
      map: textTexture ?? null,
      transparent: true,
      opacity: transparent ? opacity * 0.5 : 1,
      roughness: 0.3,
      metalness: 0.1,
      depthWrite: false,
    });

    return { rimMat, navyMat, whiteMat, logoMat, textMat };
  }, [logoTexture, textTexture, transparent, opacity]);

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* 1. Outer Metallic Bevel Rim */}
      <mesh position={[0, 0, 0.01]} rotation={[Math.PI / 2, 0, 0]} material={materials.rimMat} raycast={NO_RAYCAST}>
        <cylinderGeometry args={[radius + 0.06, radius + 0.06, 0.03, 32]} />
      </mesh>

      {/* 2. Deep Navy Outer Ring */}
      <mesh position={[0, 0, 0.02]} material={materials.navyMat} raycast={NO_RAYCAST}>
        <ringGeometry args={[radius * 0.82, radius, 32]} />
      </mesh>

      {/* 3. Concentric White Separation Ring */}
      <mesh position={[0, 0, 0.025]} material={materials.whiteMat} raycast={NO_RAYCAST}>
        <ringGeometry args={[radius * 0.76, radius * 0.82, 32]} />
      </mesh>

      {/* 3b. Central White Background Disc */}
      <mesh position={[0, 0, 0.028]} material={materials.whiteMat} raycast={NO_RAYCAST}>
        <circleGeometry args={[radius * 0.76, 32]} />
      </mesh>

      {/* 4. Central Circular Logo Face */}
      <mesh position={[0, 0, 0.03]} material={materials.logoMat} raycast={NO_RAYCAST}>
        <circleGeometry args={[radius * 0.76, 32]} />
      </mesh>

      {/* 5. "AJOU UNIVERSITY" Typography Plaque Underneath */}
      {showText && textTexture && (
        <mesh position={[0, -radius * 1.35, 0.02]} material={materials.textMat} raycast={NO_RAYCAST}>
          <planeGeometry args={[radius * 2.2, radius * 0.82]} />
        </mesh>
      )}
    </group>
  );
}
