import { useEffect, useRef, type MutableRefObject } from 'react';
import { FOUNTAIN_DIMENSIONS } from '../../components/3d/CampusFountain';
import type { Campus } from '../../domain/campus/types';
import type { CampusGeometry } from '../../domain/geometry/types';
import type { PlayerTransformState } from '../config/gameConfig';

export type WayfindingTarget = {
  id: string;
  label: string;
  buildingId: string;
  floorId?: string;
  roomId?: string;
  position: [number, number, number];
};

type Props = {
  campus: Campus;
  geometry: CampusGeometry;
  playerTransformRef: MutableRefObject<PlayerTransformState>;
  wayfindingTarget: WayfindingTarget | null;
  enteredBuildingId: string | null;
};

/**
 * Lightweight 2D Canvas radar / minimap.
 * Renders building footprints, fountain, wayfinding line, player dot, and view cone
 * directly onto a 2D canvas without triggering React re-renders.
 */
export function Minimap({
  campus,
  geometry,
  playerTransformRef,
  wayfindingTarget,
  enteredBuildingId,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let lastDraw = 0;

    const size = 148;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    const { min, max } = geometry.bounds;
    const pad = 20;
    const worldW = max[0] - min[0] + pad * 2;
    const worldD = max[1] - min[1] + pad * 2;
    const scale = (size - 16) / Math.max(worldW, worldD);
    const centerX = (min[0] + max[0]) / 2;
    const centerZ = (min[1] + max[1]) / 2;

    const toCanvas = (wx: number, wz: number): [number, number] => [
      size / 2 + (wx - centerX) * scale,
      size / 2 + (wz - centerZ) * scale,
    ];

    const pitchFeature = geometry.context.find((f) => f.id === 'pitch');
    const fountainX =
      pitchFeature && pitchFeature.footprint.type === 'rect'
        ? pitchFeature.footprint.center[0] - 50.0
        : -2.45;
    const fountainZ =
      pitchFeature && pitchFeature.footprint.type === 'rect'
        ? pitchFeature.footprint.center[1]
        : 15.9;
    const fLen = FOUNTAIN_DIMENSIONS.outerLength * FOUNTAIN_DIMENSIONS.defaultScale * scale;
    const fWid = FOUNTAIN_DIMENSIONS.outerWidth * FOUNTAIN_DIMENSIONS.defaultScale * scale;

    const draw = (now: number) => {
      animId = requestAnimationFrame(draw);
      if (now - lastDraw < 45) return; // ~22 FPS radar update
      lastDraw = now;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, size, size);

      // Radar background
      ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
      ctx.beginPath();
      ctx.roundRect(0, 0, size, size, 12);
      ctx.fill();

      // Fountain pool
      const [fx, fz] = toCanvas(fountainX, fountainZ);
      ctx.fillStyle = 'rgba(14, 165, 233, 0.45)';
      ctx.fillRect(fx - fLen / 2, fz - fWid / 2, fLen, fWid);

      // Buildings
      for (const b of campus.buildings) {
        const bg = geometry.buildings[b.id];
        if (!bg) continue;
        const isEntered = enteredBuildingId === b.id;
        const isTarget = wayfindingTarget?.buildingId === b.id;

        ctx.fillStyle = isTarget
          ? 'rgba(59, 130, 246, 0.85)'
          : isEntered
          ? 'rgba(16, 185, 129, 0.85)'
          : 'rgba(148, 163, 184, 0.65)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 0.8;

        for (const part of bg.parts) {
          if (part.type === 'rect') {
            const [cx, cz] = toCanvas(part.center[0], part.center[1]);
            const w = part.size[0] * scale;
            const d = part.size[1] * scale;
            ctx.fillRect(cx - w / 2, cz - d / 2, w, d);
            ctx.strokeRect(cx - w / 2, cz - d / 2, w, d);
          }
        }

        const [lx, lz] = toCanvas(bg.center[0], bg.center[2]);
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 8px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.shortName, lx, lz);
      }

      const { x: px, z: pz, yaw } = playerTransformRef.current;
      const [pcx, pcz] = toCanvas(px, pz);

      // Wayfinding line & target marker
      if (wayfindingTarget) {
        const [tcx, tcz] = toCanvas(wayfindingTarget.position[0], wayfindingTarget.position[2]);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(pcx, pcz);
        ctx.lineTo(tcx, tcz);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(tcx, tcz, 3.8, 0, Math.PI * 2);
        ctx.fill();
      }

      // Player view cone (forward in Three.js for yaw is (-sin(yaw), -cos(yaw)))
      const dirAngle = Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
      const coneSpread = 0.5;
      const coneLen = 18;
      ctx.fillStyle = 'rgba(52, 211, 153, 0.32)';
      ctx.beginPath();
      ctx.moveTo(pcx, pcz);
      ctx.arc(pcx, pcz, coneLen, dirAngle - coneSpread, dirAngle + coneSpread);
      ctx.closePath();
      ctx.fill();

      // Player position dot
      ctx.fillStyle = '#10b981';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pcx, pcz, 3.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Compass N indicator
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('N ▲', size - 8, 6);

      ctx.restore();
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [campus, geometry, playerTransformRef, wayfindingTarget, enteredBuildingId]);

  return (
    <canvas
      ref={canvasRef}
      aria-label="Campus radar minimap"
      style={{
        width: 148,
        height: 148,
        borderRadius: 12,
        border: '1px solid rgba(255, 255, 255, 0.22)',
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.35)',
        pointerEvents: 'none',
      }}
    />
  );
}
