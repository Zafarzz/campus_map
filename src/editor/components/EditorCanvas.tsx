import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CanvasViewport,
  EditorBuilding,
  EditorDocument,
  EditorFloor,
  EditorRoom,
  EditorSelection,
  EditorTool,
  Rect2D,
} from '../domain/types';

export type HandleType = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface DragState {
  type: 'move' | 'resize';
  targetType: 'building' | 'room';
  targetId: string;
  handle?: HandleType;
  startPointer: { worldX: number; worldZ: number };
  initialCenter: [number, number];
  initialSize: [number, number];
}

interface EditorCanvasProps {
  doc: EditorDocument;
  selection: EditorSelection;
  tool: EditorTool;
  viewport: CanvasViewport;
  gridSnap: number; // 0 for no snap, 0.5, 1, etc.
  onSelectionChange: (sel: EditorSelection) => void;
  onViewportChange: (vp: CanvasViewport) => void;
  onUpdateBuildingFootprint: (
    buildingId: string,
    center: [number, number],
    size: [number, number],
    actionName: string,
  ) => void;
  onUpdateRoomGeometry: (
    buildingId: string,
    floorId: string,
    roomId: string,
    localCenter: [number, number],
    size: [number, number],
    actionName: string,
  ) => void;
  onCanvasClickAdd: (worldX: number, worldZ: number) => void;
}

const ROOM_COLORS: Record<string, { fill: string; border: string }> = {
  classroom: { fill: '#3b82f620', border: '#3b82f6' },
  lecture: { fill: '#3b82f620', border: '#3b82f6' },
  seminar: { fill: '#8b5cf620', border: '#8b5cf6' },
  lab: { fill: '#10b98120', border: '#10b981' },
  computer_lab: { fill: '#06b6d420', border: '#06b6d4' },
  office: { fill: '#f59e0b20', border: '#f59e0b' },
  library: { fill: '#ec489920', border: '#ec4899' },
  canteen: { fill: '#f9731620', border: '#f97316' },
  service: { fill: '#64748b20', border: '#64748b' },
  corridor: { fill: '#94a3b815', border: '#94a3b8' },
  hall: { fill: '#6366f120', border: '#6366f1' },
  other: { fill: '#64748b20', border: '#64748b' },
};

export const EditorCanvas: React.FC<EditorCanvasProps> = ({
  doc,
  selection,
  tool,
  viewport,
  gridSnap,
  onSelectionChange,
  onViewportChange,
  onUpdateBuildingFootprint,
  onUpdateRoomGeometry,
  onCanvasClickAdd,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });

  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    center: [number, number];
    size: [number, number];
  } | null>(null);

  const selectedBuilding: EditorBuilding | undefined = doc.buildings.find((b) => b.id === selection.buildingId);
  const selectedFloor: EditorFloor | undefined = selectedBuilding?.floors.find((f) => f.id === selection.floorId);
  const selectedRoom: EditorRoom | undefined = selectedFloor?.rooms.find((r) => r.id === selection.roomId);

  // Screen <-> World Coordinate Transformations
  const worldToScreen = useCallback(
    (wx: number, wz: number): { sx: number; sy: number } => {
      return {
        sx: viewport.pan.x + wx * viewport.zoom,
        sy: viewport.pan.y + wz * viewport.zoom,
      };
    },
    [viewport],
  );

  const screenToWorld = useCallback(
    (sx: number, sy: number): { wx: number; wz: number } => {
      return {
        wx: (sx - viewport.pan.x) / viewport.zoom,
        wz: (sy - viewport.pan.y) / viewport.zoom,
      };
    },
    [viewport],
  );

  const applySnap = useCallback(
    (val: number): number => {
      if (gridSnap <= 0) return Number(val.toFixed(2));
      return Number((Math.round(val / gridSnap) * gridSnap).toFixed(2));
    },
    [gridSnap],
  );

  // Wheel Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseSx = e.clientX - rect.left;
    const mouseSy = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newZoom = Math.min(60, Math.max(1, viewport.zoom * zoomFactor));

    // Keep point under cursor stable
    const mouseWorldX = (mouseSx - viewport.pan.x) / viewport.zoom;
    const mouseWorldZ = (mouseSy - viewport.pan.y) / viewport.zoom;

    const newPanX = mouseSx - mouseWorldX * newZoom;
    const newPanY = mouseSy - mouseWorldZ * newZoom;

    onViewportChange({
      pan: { x: newPanX, y: newPanY },
      zoom: newZoom,
    });
  };

  // Pointer Down (Pan or Drag/Resize)
  const handlePointerDown = (e: React.PointerEvent) => {
    // If middle click or space held or tool === 'pan'
    if (e.button === 1 || tool === 'pan') {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: viewport.pan.x,
        panY: viewport.pan.y,
      };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      return;
    }

    if (e.button !== 0) return;

    if (tool === 'add-building' || tool === 'add-room') {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const { wx, wz } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      onCanvasClickAdd(applySnap(wx), applySnap(wz));
      return;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isPanning) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      onViewportChange({
        ...viewport,
        pan: {
          x: panStartRef.current.panX + dx,
          y: panStartRef.current.panY + dy,
        },
      });
      return;
    }

    if (!dragState || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const currentWorld = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

    const deltaX = currentWorld.wx - dragState.startPointer.worldX;
    const deltaZ = currentWorld.wz - dragState.startPointer.worldZ;

    if (dragState.type === 'move') {
      const newCx = applySnap(dragState.initialCenter[0] + deltaX);
      const newCz = applySnap(dragState.initialCenter[1] + deltaZ);
      setDragPreview({
        center: [newCx, newCz],
        size: dragState.initialSize,
      });
    } else if (dragState.type === 'resize' && dragState.handle) {
      const [initCx, initCz] = dragState.initialCenter;
      const [initW, initD] = dragState.initialSize;
      const minW = dragState.targetType === 'building' ? 2 : 1;
      const minD = dragState.targetType === 'building' ? 2 : 1;

      let left = initCx - initW / 2;
      let right = initCx + initW / 2;
      let top = initCz - initD / 2;
      let bottom = initCz + initD / 2;

      const handle = dragState.handle;

      if (handle.includes('w')) left = Math.min(right - minW, applySnap(left + deltaX));
      if (handle.includes('e')) right = Math.max(left + minW, applySnap(right + deltaX));
      if (handle.includes('n')) top = Math.min(bottom - minD, applySnap(top + deltaZ));
      if (handle.includes('s')) bottom = Math.max(top + minD, applySnap(bottom + deltaZ));

      const newW = Number((right - left).toFixed(2));
      const newD = Number((bottom - top).toFixed(2));
      const newCx = Number(((left + right) / 2).toFixed(2));
      const newCz = Number(((top + bottom) / 2).toFixed(2));

      setDragPreview({
        center: [newCx, newCz],
        size: [newW, newD],
      });
    }
  };

  const handlePointerUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (dragState && dragPreview) {
      if (dragState.targetType === 'building') {
        onUpdateBuildingFootprint(
          dragState.targetId,
          dragPreview.center,
          dragPreview.size,
          dragState.type === 'move' ? 'Перемещение здания' : 'Изменение размера здания',
        );
      } else if (dragState.targetType === 'room' && selection.buildingId && selection.floorId) {
        onUpdateRoomGeometry(
          selection.buildingId,
          selection.floorId,
          dragState.targetId,
          dragPreview.center,
          dragPreview.size,
          dragState.type === 'move' ? 'Перемещение помещения' : 'Изменение размера помещения',
        );
      }
    }

    setDragState(null);
    setDragPreview(null);
  };

  // Start Move Drag
  const startMove = (
    e: React.PointerEvent,
    targetType: 'building' | 'room',
    targetId: string,
    initialCenter: [number, number],
    initialSize: [number, number],
  ) => {
    e.stopPropagation();
    if (tool !== 'select') return;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const startWorld = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

    setDragState({
      type: 'move',
      targetType,
      targetId,
      startPointer: { worldX: startWorld.wx, worldZ: startWorld.wz },
      initialCenter,
      initialSize,
    });
    setDragPreview({ center: initialCenter, size: initialSize });
  };

  // Start Resize Handle Drag
  const startResize = (
    e: React.PointerEvent,
    handle: HandleType,
    targetType: 'building' | 'room',
    targetId: string,
    initialCenter: [number, number],
    initialSize: [number, number],
  ) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const startWorld = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

    setDragState({
      type: 'resize',
      targetType,
      targetId,
      handle,
      startPointer: { worldX: startWorld.wx, worldZ: startWorld.wz },
      initialCenter,
      initialSize,
    });
    setDragPreview({ center: initialCenter, size: initialSize });
  };

  // Render 8 Resize Handles
  const renderHandles = (
    worldCenter: [number, number],
    size: [number, number],
    targetType: 'building' | 'room',
    targetId: string,
  ) => {
    const [cx, cz] = worldCenter;
    const [w, d] = size;
    const handlePositions: Record<HandleType, [number, number]> = {
      nw: [cx - w / 2, cz - d / 2],
      n: [cx, cz - d / 2],
      ne: [cx + w / 2, cz - d / 2],
      e: [cx + w / 2, cz],
      se: [cx + w / 2, cz + d / 2],
      s: [cx, cz + d / 2],
      sw: [cx - w / 2, cz + d / 2],
      w: [cx - w / 2, cz],
    };

    const cursors: Record<HandleType, string> = {
      nw: 'nwse-resize',
      n: 'ns-resize',
      ne: 'nesw-resize',
      e: 'ew-resize',
      se: 'nwse-resize',
      s: 'ns-resize',
      sw: 'nesw-resize',
      w: 'ew-resize',
    };

    return (Object.entries(handlePositions) as [HandleType, [number, number]][]).map(([handle, [hx, hz]]) => {
      const { sx, sy } = worldToScreen(hx, hz);
      const handleSize = 9;
      return (
        <rect
          key={handle}
          x={sx - handleSize / 2}
          y={sy - handleSize / 2}
          width={handleSize}
          height={handleSize}
          fill="#3b82f6"
          stroke="#ffffff"
          strokeWidth={1.5}
          style={{ cursor: cursors[handle] }}
          onPointerDown={(e) => startResize(e, handle, targetType, targetId, worldCenter, size)}
        />
      );
    });
  };

  // Dynamic Grid Rendering
  const renderGrid = () => {
    if (!containerRef.current) return null;
    const width = containerRef.current.clientWidth || 1000;
    const height = containerRef.current.clientHeight || 700;

    const topLeft = screenToWorld(0, 0);
    const bottomRight = screenToWorld(width, height);

    const minX = Math.floor(topLeft.wx);
    const maxX = Math.ceil(bottomRight.wx);
    const minZ = Math.floor(topLeft.wz);
    const maxZ = Math.ceil(bottomRight.wz);

    const lines: React.ReactNode[] = [];

    // Major grid step: 10m or 5m
    const majorStep = viewport.zoom > 15 ? 5 : 10;
    const minorStep = 1;

    // Minor lines if zoomed in enough
    if (viewport.zoom >= 7) {
      for (let x = Math.floor(minX / minorStep) * minorStep; x <= maxX; x += minorStep) {
        if (x % majorStep === 0) continue;
        const { sx } = worldToScreen(x, 0);
        lines.push(
          <line
            key={`mx_${x}`}
            x1={sx}
            y1={0}
            x2={sx}
            y2={height}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={1}
          />,
        );
      }
      for (let z = Math.floor(minZ / minorStep) * minorStep; z <= maxZ; z += minorStep) {
        if (z % majorStep === 0) continue;
        const { sy } = worldToScreen(0, z);
        lines.push(
          <line
            key={`mz_${z}`}
            x1={0}
            y1={sy}
            x2={width}
            y2={sy}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={1}
          />,
        );
      }
    }

    // Major grid lines
    for (let x = Math.floor(minX / majorStep) * majorStep; x <= maxX; x += majorStep) {
      const { sx } = worldToScreen(x, 0);
      lines.push(
        <line
          key={`majx_${x}`}
          x1={sx}
          y1={0}
          x2={sx}
          y2={height}
          stroke={x === 0 ? 'rgba(59,130,246,0.35)' : 'rgba(255,255,255,0.1)'}
          strokeWidth={x === 0 ? 1.5 : 1}
        />,
      );
    }
    for (let z = Math.floor(minZ / majorStep) * majorStep; z <= maxZ; z += majorStep) {
      const { sy } = worldToScreen(0, z);
      lines.push(
        <line
          key={`majz_${z}`}
          x1={0}
          y1={sy}
          x2={width}
          y2={sy}
          stroke={z === 0 ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.1)'}
          strokeWidth={z === 0 ? 1.5 : 1}
        />,
      );
    }

    return <g className="grid">{lines}</g>;
  };

  const isFloorView = Boolean(selection.buildingId && selection.floorId);

  return (
    <div
      ref={containerRef}
      className={`editor-canvas ${tool === 'pan' || isPanning ? 'cursor-grab' : ''}`}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: '#0f172a',
        userSelect: 'none',
      }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <svg
        style={{ width: '100%', height: '100%', display: 'block' }}
        onClick={(e) => {
          if (e.target === e.currentTarget && tool === 'select') {
            onSelectionChange({ type: 'none' });
          }
        }}
      >
        {renderGrid()}

        {/* 1. BUILDINGS LAYER */}
        <g className="buildings">
          {doc.buildings.map((bld) => {
            const isSelected = selection.buildingId === bld.id;
            const isDragTarget =
              dragState?.targetType === 'building' && dragState.targetId === bld.id && dragPreview;

            const center = isDragTarget ? dragPreview.center : bld.footprint.center;
            const size = isDragTarget ? dragPreview.size : bld.footprint.size;

            const [cx, cz] = center;
            const [w, d] = size;
            const { sx, sy } = worldToScreen(cx - w / 2, cz - d / 2);
            const pixelW = w * viewport.zoom;
            const pixelH = d * viewport.zoom;

            return (
              <g key={bld.id}>
                {/* Building Rect */}
                <rect
                  x={sx}
                  y={sy}
                  width={pixelW}
                  height={pixelH}
                  rx={3}
                  fill={isSelected ? 'rgba(30, 58, 138, 0.45)' : 'rgba(30, 41, 59, 0.8)'}
                  stroke={isSelected ? '#3b82f6' : 'rgba(148, 163, 184, 0.45)'}
                  strokeWidth={isSelected ? 2 : 1}
                  strokeDasharray={isFloorView && !isSelected ? '4,4' : undefined}
                  style={{
                    cursor: tool === 'select' ? 'pointer' : 'default',
                    transition: dragState ? 'none' : 'stroke 0.15s, fill 0.15s',
                  }}
                  onPointerDown={(e) => {
                    if (tool === 'select') {
                      onSelectionChange({
                        type: 'building',
                        buildingId: bld.id,
                        floorId: bld.floors[0]?.id,
                      });
                      startMove(e, 'building', bld.id, center, size);
                    }
                  }}
                />

                {/* Building Label */}
                {pixelW > 40 && pixelH > 20 && (
                  <g pointerEvents="none">
                    <text
                      x={sx + pixelW / 2}
                      y={sy + pixelH / 2 - (pixelH > 50 ? 8 : 0)}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#e2e8f0"
                      fontSize={Math.min(15, Math.max(10, pixelH / 4))}
                      fontWeight="600"
                    >
                      {bld.shortName || bld.name}
                    </text>
                    {pixelH > 50 && (
                      <text
                        x={sx + pixelW / 2}
                        y={sy + pixelH / 2 + 10}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#94a3b8"
                        fontSize={Math.min(11, Math.max(8, pixelH / 6))}
                      >
                        {w.toFixed(1)}m × {d.toFixed(1)}m
                      </text>
                    )}
                  </g>
                )}

                {/* Building Resize Handles when selected in Campus view */}
                {isSelected &&
                  !selection.roomId &&
                  selection.type === 'building' &&
                  renderHandles(center, size, 'building', bld.id)}
              </g>
            );
          })}
        </g>

        {/* 2. ROOMS LAYER (Active Floor) */}
        {selectedBuilding && selectedFloor && (
          <g className="rooms">
            {selectedFloor.rooms.map((rm) => {
              const isSelected = selection.roomId === rm.id;
              const isDragTarget = dragState?.targetType === 'room' && dragState.targetId === rm.id && dragPreview;

              const localCenter = isDragTarget ? dragPreview.center : rm.localCenter;
              const size = isDragTarget ? dragPreview.size : rm.size;

              // Convert local coordinates to world coordinates for SVG rendering
              const worldCx = selectedBuilding.footprint.center[0] + localCenter[0];
              const worldCz = selectedBuilding.footprint.center[1] + localCenter[1];

              const [w, d] = size;
              const { sx, sy } = worldToScreen(worldCx - w / 2, worldCz - d / 2);
              const pixelW = w * viewport.zoom;
              const pixelH = d * viewport.zoom;

              const styleConfig = ROOM_COLORS[rm.kind] || ROOM_COLORS.other;

              return (
                <g key={rm.id}>
                  <rect
                    x={sx}
                    y={sy}
                    width={pixelW}
                    height={pixelH}
                    rx={2}
                    fill={isSelected ? '#3b82f635' : styleConfig.fill}
                    stroke={isSelected ? '#60a5fa' : styleConfig.border}
                    strokeWidth={isSelected ? 2 : 1}
                    style={{
                      cursor: tool === 'select' ? 'pointer' : 'default',
                    }}
                    onPointerDown={(e) => {
                      if (tool === 'select') {
                        onSelectionChange({
                          type: 'room',
                          buildingId: selectedBuilding.id,
                          floorId: selectedFloor.id,
                          roomId: rm.id,
                        });
                        startMove(e, 'room', rm.id, localCenter, size);
                      }
                    }}
                  />

                  {/* Room Label */}
                  {pixelW > 25 && pixelH > 18 && (
                    <g pointerEvents="none">
                      <text
                        x={sx + pixelW / 2}
                        y={sy + pixelH / 2 - (pixelH > 35 ? 6 : 0)}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#ffffff"
                        fontSize={Math.min(13, Math.max(9, pixelH / 3))}
                        fontWeight="600"
                      >
                        {rm.number}
                      </text>
                      {pixelH > 35 && pixelW > 40 && (
                        <text
                          x={sx + pixelW / 2}
                          y={sy + pixelH / 2 + 8}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#cbd5e1"
                          fontSize={Math.min(10, Math.max(7, pixelH / 4))}
                        >
                          {rm.name || `${w.toFixed(1)}×${d.toFixed(1)}m`}
                        </text>
                      )}
                    </g>
                  )}

                  {/* Room Resize Handles when selected */}
                  {isSelected &&
                    renderHandles([worldCx, worldCz], size, 'room', rm.id)}
                </g>
              );
            })}
          </g>
        )}
      </svg>

      {/* Floating Canvas Info (Scale / Coordinates) */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          background: 'rgba(15, 23, 42, 0.85)',
          padding: '4px 10px',
          borderRadius: 6,
          fontSize: 12,
          color: '#94a3b8',
          border: '1px solid rgba(255,255,255,0.1)',
          pointerEvents: 'none',
        }}
      >
        Масштаб: {viewport.zoom.toFixed(1)} px/м | Сетка: {gridSnap > 0 ? `${gridSnap}м` : 'Выкл'}
      </div>
    </div>
  );
};
