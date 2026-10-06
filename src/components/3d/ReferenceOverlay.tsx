import { useTexture } from '@react-three/drei';
import { SRGBColorSpace } from 'three';
import { mapConfig } from '../../config/mapConfig';

/**
 * The Google Earth screenshot laid on the ground at the configured scale.
 * Useful for checking/adjusting traced footprints.
 */
export function ReferenceOverlay() {
  const texture = useTexture(mapConfig.reference.imageUrl);
  texture.colorSpace = SRGBColorSpace;
  const [w, h] = mapConfig.reference.imageSizePx;
  const mpp = mapConfig.reference.metersPerPixel;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]} raycast={() => null}>
      <planeGeometry args={[w * mpp, h * mpp]} />
      <meshBasicMaterial map={texture} transparent opacity={0.9} toneMapped={false} />
    </mesh>
  );
}
