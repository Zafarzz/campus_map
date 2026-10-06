import type { ThreeEvent } from '@react-three/fiber';

/** Max pointer travel (px) for a pointer-up to count as a click rather than a camera drag. */
const CLICK_TOLERANCE_PX = 5;

export function isClick(e: ThreeEvent<MouseEvent>): boolean {
  return e.delta <= CLICK_TOLERANCE_PX;
}
