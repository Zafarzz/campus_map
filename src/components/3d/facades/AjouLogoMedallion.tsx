import { useMemo } from 'react';
import * as THREE from 'three';
import { getAjouLogoTexture } from './facadeTextures';

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
 * Features:
 * - Circular beveled composite backplate.
 * - Deep navy circular border ring (#002b66).
 * - Official Ajou University logo emblem texture.
 * - Architectural embossed "AJOU UNIVERSITY" typography underneath.
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

  // Text canvas texture for "AJOU" / "UNIVERSITY" underneath the medallion
  const textTexture = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Primary Brand Blue
    ctx.fillStyle = '#002b66';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // "AJOU"
    ctx.font = '900 160px "Montserrat", "Arial Black", sans-serif';
    ctx.fillText('AJOU', canvas.width / 2, 125);

    // "UNIVERSITY"
    ctx.font = '700 88px "Montserrat", "Arial", sans-serif';
    ctx.letterSpacing = '7px';
    ctx.fillText('UNIVERSITY', canvas.width / 2, 260);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  }, []);

  const materials = useMemo(() => {
    // Stainless steel / silver bezel outer rim
    const rimMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      metalness: 0.85,
      roughness: 0.25,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // Deep brand navy enamel ring
    const navyMat = new THREE.MeshStandardMaterial({
      color: '#002b66',
      metalness: 0.1,
      roughness: 0.3,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // Crisp white border ring
    const whiteMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      metalness: 0.05,
      roughness: 0.35,
      transparent,
      opacity,
      depthWrite: !transparent,
    });

    // Main emblem logo face
    const logoMat = new THREE.MeshStandardMaterial({
      map: logoTexture ?? null,
      color: logoTexture ? '#ffffff' : '#002b66',
      roughness: 0.2,
      metalness: 0.08,
      transparent: true,
      opacity: transparent ? opacity * 0.5 : 1,
      depthWrite: !transparent,
      side: THREE.DoubleSide,
    });

    // Typography plaque material
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
      <mesh position={[0, 0, 0.01]} rotation={[Math.PI / 2, 0, 0]} material={materials.rimMat} castShadow>
        <cylinderGeometry args={[radius + 0.06, radius + 0.06, 0.03, 48]} />
      </mesh>

      {/* 2. Deep Navy Outer Ring */}
      <mesh position={[0, 0, 0.02]} material={materials.navyMat}>
        <ringGeometry args={[radius * 0.82, radius, 48]} />
      </mesh>

      {/* 3. Concentric White Separation Ring */}
      <mesh position={[0, 0, 0.025]} material={materials.whiteMat}>
        <ringGeometry args={[radius * 0.76, radius * 0.82, 48]} />
      </mesh>

      {/* 4. Central Circular Logo Face */}
      <mesh position={[0, 0, 0.03]} material={materials.logoMat}>
        <circleGeometry args={[radius * 0.76, 48]} />
      </mesh>

      {/* 5. "AJOU UNIVERSITY" Typography Plaque Underneath */}
      {showText && textTexture && (
        <mesh position={[0, -radius * 1.35, 0.02]}>
          <planeGeometry args={[radius * 2.2, radius * 0.82]} />
          <primitive object={materials.textMat} attach="material" />
        </mesh>
      )}
    </group>
  );
}
