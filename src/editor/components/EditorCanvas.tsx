import React, { useCallback, useRef, useState } from 'react';
import type { Vec2 } from '../../domain/geometry/types';
import { CHANGE_CATEGORY_LABELS } from '../changeTracking/changeTracker';
import type {
  CanvasViewport,
  EditorBuilding,
  EditorDocument,
  EditorFloor,
  EditorLayerId,
  EditorOutdoorElement,
  EditorRoom,
  EditorSelection,
  EditorTool,
  SemanticChange,
} from '../domain/types';

export type HandleType = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface DragState {
  type: 'move' | 'resize' | 'vertex' | 'draw-rect' | 'marquee';
  targetType: 'building' | 'room' | 'outdoor' | 'multi';
  targetId: string;
  handle?: HandleType;
  vertexIndex?: number;
  startPointer: { worldX: number; worldZ: number };
  currentPointer?: { worldX: number; worldZ: number };
  initialCenter: [number, number];
  initialSize: [number, number];
  initialPoints?: Vec2[];
  multiInitial?: {
    rooms: { id: string; localCenter: Vec2 }[];
    buildings: { id: string; center: Vec2; size: [number, number] }[];
    outdoor: { id: string; center: Vec2 }[];
  };
}

interface AlignmentGuide {
  axis: 'x' | 'z';
  value: number; // world coordinate
}

interface EditorCanvasProps {
  doc: EditorDocument;
  baselineDoc?: EditorDocument | null;
  selection: EditorSelection;
  tool: EditorTool;
  viewport: CanvasViewport;
  gridSnap: number;
  changes?: SemanticChange[];
  reviewMode?: boolean;
  visibleLayers?: Record<EditorLayerId, boolean>;
  onToggleLayer?: (layer: EditorLayerId) => void;
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
  onUpdateRoomPolygon?: (
    buildingId: string,
    floorId: string,
    roomId: string,
    polygon: Vec2[],
    actionName: string,
  ) => void;
  onUpdateRoomProps?: (
    buildingId: string,
    floorId: string,
    roomId: string,
    patch: Partial<Omit<EditorRoom, 'id'>>,
    actionName: string,
  ) => void;
  onUpdateOutdoorElement?: (
    outdoorId: string,
    patch: Partial<Omit<EditorOutdoorElement, 'id'>>,
    actionName: string,
  ) => void;
  onCanvasClickAdd: (
    worldX: number,
    worldZ: number,
    drawnSize?: [number, number],
    drawnPoints?: Vec2[],
  ) => void;
  onAddFloor?: (buildingId: string) => void;
  onDuplicateSelected?: () => void;
  onDeleteSelected?: () => void;
  onRevertChange?: (change: SemanticChange) => void;
}

const INDOOR_STYLES: Record<
  string,
  { fill: string; border: string; text: string; badge: string }
> = {
  classroom: { fill: '#eff6ff', border: '#3b82f6', text: '#1e3a8a', badge: 'Room' },
  room: { fill: '#eff6ff', border: '#3b82f6', text: '#1e3a8a', badge: 'Room' },
  lab: { fill: '#ecfdf5', border: '#10b981', text: '#065f46', badge: 'Lab' },
  office: { fill: '#fffbeb', border: '#f59e0b', text: '#92400e', badge: 'Office' },
  hall: { fill: '#eef2ff', border: '#6366f1', text: '#312e81', badge: 'Hall' },
  lobby: { fill: '#f5f3ff', border: '#8b5cf6', text: '#4c1d95', badge: 'Lobby' },
  corridor: { fill: '#f1f5f9', border: '#64748b', text: '#334155', badge: 'Corridor' },
  stairs: { fill: '#fef3c7', border: '#d97706', text: '#78350f', badge: '🪜 Stairs' },
  elevator: { fill: '#fae8ff', border: '#c026d3', text: '#701a75', badge: '🛗 Lift' },
  door: { fill: '#dcfce7', border: '#16a34a', text: '#14532d', badge: '🚪 Door' },
  window: { fill: '#e0f2fe', border: '#0284c7', text: '#0c4a6e', badge: '🪟 Win' },
  entrance: { fill: '#bbf7d0', border: '#15803d', text: '#14532d', badge: '🚩 Entrance' },
  exit: { fill: '#fee2e2', border: '#dc2626', text: '#7f1d1d', badge: '🏃 Exit' },
  wall: { fill: '#475569', border: '#1e293b', text: '#ffffff', badge: 'Wall' },
  partition: { fill: '#94a3b8', border: '#475569', text: '#0f172a', badge: 'Partition' },
  custom: { fill: '#f3f4f6', border: '#4b5563', text: '#1f2937', badge: 'Custom' },
  other: { fill: '#f1f5f9', border: '#64748b', text: '#334155', badge: 'Space' },
};

const OUTDOOR_STYLES: Record<
  string,
  { fill: string; border: string; text: string; icon: string }
> = {
  lawn: { fill: '#dcfce7', border: '#22c55e', text: '#14532d', icon: '🌿' },
  tree: { fill: '#bbf7d0', border: '#16a34a', text: '#14532d', icon: '🌳' },
  path: { fill: '#e2e8f0', border: '#64748b', text: '#1e293b', icon: '🚶' },
  walkway: { fill: '#ede9fe', border: '#7c3aed', text: '#4c1d95', icon: '🌉' },
  road: { fill: '#cbd5e1', border: '#475569', text: '#0f172a', icon: '🛣️' },
  plaza: { fill: '#fef3c7', border: '#d97706', text: '#78350f', icon: '🏟️' },
  fountain: { fill: '#e0f2fe', border: '#0284c7', text: '#0c4a6e', icon: '⛲' },
  entrance: { fill: '#f1f5f9', border: '#0f172a', text: '#0f172a', icon: '⛩️' },
  custom: { fill: '#f3f4f6', border: '#6b7280', text: '#1f2937', icon: '📍' },
};

export const EditorCanvas: React.FC<EditorCanvasProps> = ({
  doc,
  selection,
  tool,
  viewport,
  gridSnap,
  changes = [],
  reviewMode = false,
  visibleLayers = {
    buildings: true,
    paths: true,
    greenery: true,
    infrastructure: true,
    annotations: true,
  },
  onToggleLayer,
  onSelectionChange,
  onViewportChange,
  onUpdateBuildingFootprint,
  onUpdateRoomGeometry,
  onUpdateRoomPolygon,
  onUpdateRoomProps,
  onUpdateOutdoorElement,
  onCanvasClickAdd,
  onAddFloor,
  onDuplicateSelected,
  onDeleteSelected,
  onRevertChange,
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
    points?: Vec2[];
  } | null>(null);

  const [guides, setGuides] = useState<AlignmentGuide[]>([]);

  // Interactive multi-point drawing state (for paths and polygon rooms)
  const [draftPoints, setDraftPoints] = useState<Vec2[]>([]);
  const [cursorWorld, setCursorWorld] = useState<Vec2 | null>(null);

  // Inline rename state
  const [inlineEditRoomId, setInlineEditRoomId] = useState<string | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState<string>('');

  const selectedBuilding: EditorBuilding | undefined = doc.buildings.find(
    (b) => b.id === selection.buildingId,
  );
  const selectedFloor: EditorFloor | undefined = selectedBuilding?.floors.find(
    (f) => f.id === selection.floorId,
  );

  const changeByTarget = new Map<string, SemanticChange>();
  for (const chg of changes) {
    changeByTarget.set(chg.targetId, chg);
  }

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

  const isPointDrawTool = tool === 'add-path' || tool === 'add-polygon-room';
  const isRectDrawTool =
    tool !== 'select' && tool !== 'pan' && !isPointDrawTool;

  // Finish multi-point polyline / polygon drawing
  const finishPointDrawing = useCallback(() => {
    if (draftPoints.length >= 2) {
      const xs = draftPoints.map((p) => p[0]);
      const zs = draftPoints.map((p) => p[1]);
      const cx = Number(((Math.min(...xs) + Math.max(...xs)) / 2).toFixed(2));
      const cz = Number(((Math.min(...zs) + Math.max(...zs)) / 2).toFixed(2));
      const w = Math.max(1, Number((Math.max(...xs) - Math.min(...xs)).toFixed(2)));
      const d = Math.max(1, Number((Math.max(...zs) - Math.min(...zs)).toFixed(2)));
      onCanvasClickAdd(cx, cz, [w, d], draftPoints);
    }
    setDraftPoints([]);
  }, [draftPoints, onCanvasClickAdd]);

  // Wheel Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseSx = e.clientX - rect.left;
    const mouseSy = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newZoom = Math.min(80, Math.max(1, viewport.zoom * zoomFactor));

    const mouseWorldX = (mouseSx - viewport.pan.x) / viewport.zoom;
    const mouseWorldZ = (mouseSy - viewport.pan.y) / viewport.zoom;

    const newPanX = mouseSx - mouseWorldX * newZoom;
    const newPanY = mouseSy - mouseWorldZ * newZoom;

    onViewportChange({
      pan: { x: newPanX, y: newPanY },
      zoom: newZoom,
    });
  };

  // Pointer Down on Canvas Background
  const handlePointerDown = (e: React.PointerEvent) => {
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
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const { wx, wz } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const snappedX = applySnap(wx);
    const snappedZ = applySnap(wz);

    // Point-by-point drawing for polylines / polygons
    if (isPointDrawTool) {
      if (draftPoints.length >= 2) {
        const first = draftPoints[0];
        const distToFirst = Math.hypot(snappedX - first[0], snappedZ - first[1]);
        if (distToFirst < 2.0 / Math.max(1, viewport.zoom / 6)) {
          finishPointDrawing();
          return;
        }
      }
      setDraftPoints((prev) => [...prev, [snappedX, snappedZ]]);
      return;
    }

    // Click-and-drag rectangle creation for buildings, rooms, corridors, walls, lawns, etc.
    if (isRectDrawTool) {
      setDragState({
        type: 'draw-rect',
        targetType: tool.startsWith('add-building') ? 'building' : 'room',
        targetId: '__draw__',
        startPointer: { worldX: snappedX, worldZ: snappedZ },
        currentPointer: { worldX: snappedX, worldZ: snappedZ },
        initialCenter: [snappedX, snappedZ],
        initialSize: [0, 0],
      });
      setDragPreview({
        center: [snappedX, snappedZ],
        size: [0, 0],
      });
      return;
    }

    // Marquee selection when dragging on empty canvas in 'select' mode
    if (tool === 'select' && (e.target as Element).tagName.toLowerCase() === 'svg') {
      setDragState({
        type: 'marquee',
        targetType: 'multi',
        targetId: '__marquee__',
        startPointer: { worldX: wx, worldZ: wz },
        currentPointer: { worldX: wx, worldZ: wz },
        initialCenter: [wx, wz],
        initialSize: [0, 0],
      });
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const currentWorld = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

    if (isPointDrawTool) {
      setCursorWorld([applySnap(currentWorld.wx), applySnap(currentWorld.wz)]);
    }

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

    if (!dragState) return;

    const deltaX = currentWorld.wx - dragState.startPointer.worldX;
    const deltaZ = currentWorld.wz - dragState.startPointer.worldZ;

    if (dragState.type === 'draw-rect' || dragState.type === 'marquee') {
      const x1 = dragState.startPointer.worldX;
      const z1 = dragState.startPointer.worldZ;
      const x2 = dragState.type === 'draw-rect' ? applySnap(currentWorld.wx) : currentWorld.wx;
      const z2 = dragState.type === 'draw-rect' ? applySnap(currentWorld.wz) : currentWorld.wz;

      const cx = Number(((x1 + x2) / 2).toFixed(2));
      const cz = Number(((z1 + z2) / 2).toFixed(2));
      const w = Number(Math.abs(x2 - x1).toFixed(2));
      const d = Number(Math.abs(z2 - z1).toFixed(2));

      setDragState((prev) =>
        prev ? { ...prev, currentPointer: { worldX: x2, worldZ: z2 } } : null,
      );
      setDragPreview({ center: [cx, cz], size: [w, d] });
      return;
    }

    if (dragState.type === 'vertex' && dragState.initialPoints && dragState.vertexIndex !== undefined) {
      const nextPts = dragState.initialPoints.map((pt, idx) => {
        if (idx !== dragState.vertexIndex) return pt;
        return [
          applySnap(pt[0] + deltaX),
          applySnap(pt[1] + deltaZ),
        ] as Vec2;
      });
      setDragPreview({
        center: dragState.initialCenter,
        size: dragState.initialSize,
        points: nextPts,
      });
      return;
    }

    if (dragState.type === 'move') {
      let newCx = applySnap(dragState.initialCenter[0] + deltaX);
      let newCz = applySnap(dragState.initialCenter[1] + deltaZ);
      const activeGuides: AlignmentGuide[] = [];

      // Smart Alignment Guides against sibling rooms or buildings
      const snapTol = 0.35;
      if (dragState.targetType === 'room' && selectedBuilding && selectedFloor) {
        const bCx = selectedBuilding.footprint.center[0];
        const bCz = selectedBuilding.footprint.center[1];
        for (const other of selectedFloor.rooms) {
          if (other.id === dragState.targetId) continue;
          if (Math.abs(newCx - other.localCenter[0]) < snapTol) {
            newCx = other.localCenter[0];
            activeGuides.push({ axis: 'x', value: bCx + newCx });
          }
          if (Math.abs(newCz - other.localCenter[1]) < snapTol) {
            newCz = other.localCenter[1];
            activeGuides.push({ axis: 'z', value: bCz + newCz });
          }
        }
      } else if (dragState.targetType === 'building') {
        for (const other of doc.buildings) {
          if (other.id === dragState.targetId) continue;
          if (Math.abs(newCx - other.footprint.center[0]) < snapTol) {
            newCx = other.footprint.center[0];
            activeGuides.push({ axis: 'x', value: newCx });
          }
          if (Math.abs(newCz - other.footprint.center[1]) < snapTol) {
            newCz = other.footprint.center[1];
            activeGuides.push({ axis: 'z', value: newCz });
          }
        }
      }

      setGuides(activeGuides);
      setDragPreview({
        center: [newCx, newCz],
        size: dragState.initialSize,
      });
    } else if (dragState.type === 'resize' && dragState.handle) {
      const [initCx, initCz] = dragState.initialCenter;
      const [initW, initD] = dragState.initialSize;
      const minW = dragState.targetType === 'building' ? 2 : 0.3;
      const minD = dragState.targetType === 'building' ? 2 : 0.3;

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
    setGuides([]);

    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (dragState?.type === 'draw-rect' && dragPreview) {
      const [w, d] = dragPreview.size;
      const drawnSize: [number, number] | undefined = w >= 0.8 && d >= 0.8 ? [w, d] : undefined;
      onCanvasClickAdd(dragPreview.center[0], dragPreview.center[1], drawnSize);
      setDragState(null);
      setDragPreview(null);
      return;
    }

    if (dragState?.type === 'marquee' && dragPreview) {
      const [cx, cz] = dragPreview.center;
      const [w, d] = dragPreview.size;
      if (w < 0.5 && d < 0.5) {
        onSelectionChange({
          type: selectedFloor ? 'floor' : 'none',
          buildingId: selectedBuilding?.id,
          floorId: selectedFloor?.id,
        });
      } else {
        const minX = cx - w / 2;
        const maxX = cx + w / 2;
        const minZ = cz - d / 2;
        const maxZ = cz + d / 2;

        if (selectedBuilding && selectedFloor) {
          const bCx = selectedBuilding.footprint.center[0];
          const bCz = selectedBuilding.footprint.center[1];
          const matched = selectedFloor.rooms
            .filter((rm) => {
              const wx = bCx + rm.localCenter[0];
              const wz = bCz + rm.localCenter[1];
              return wx >= minX && wx <= maxX && wz >= minZ && wz <= maxZ;
            })
            .map((r) => r.id);

          if (matched.length === 1) {
            onSelectionChange({
              type: 'room',
              buildingId: selectedBuilding.id,
              floorId: selectedFloor.id,
              roomId: matched[0],
            });
          } else if (matched.length > 1) {
            onSelectionChange({
              type: 'multi',
              buildingId: selectedBuilding.id,
              floorId: selectedFloor.id,
              selectedIds: matched,
            });
          }
        } else {
          const matchedBlds = doc.buildings
            .filter((b) => {
              const [bx, bz] = b.footprint.center;
              return bx >= minX && bx <= maxX && bz >= minZ && bz <= maxZ;
            })
            .map((b) => b.id);
          if (matchedBlds.length === 1) {
            onSelectionChange({ type: 'building', buildingId: matchedBlds[0] });
          } else if (matchedBlds.length > 1) {
            onSelectionChange({ type: 'multi', selectedIds: matchedBlds });
          }
        }
      }
      setDragState(null);
      setDragPreview(null);
      return;
    }

    if (dragState && dragPreview) {
      const movedOrResized =
        Math.abs(dragPreview.center[0] - dragState.initialCenter[0]) > 0.01 ||
        Math.abs(dragPreview.center[1] - dragState.initialCenter[1]) > 0.01 ||
        Math.abs(dragPreview.size[0] - dragState.initialSize[0]) > 0.01 ||
        Math.abs(dragPreview.size[1] - dragState.initialSize[1]) > 0.01 ||
        Boolean(dragPreview.points);

      if (movedOrResized) {
        if (dragState.type === 'vertex' && dragPreview.points) {
          if (
            dragState.targetType === 'room' &&
            selection.buildingId &&
            selection.floorId &&
            onUpdateRoomPolygon
          ) {
            onUpdateRoomPolygon(
              selection.buildingId,
              selection.floorId,
              dragState.targetId,
              dragPreview.points,
              'Reshape room polygon',
            );
          } else if (dragState.targetType === 'outdoor' && onUpdateOutdoorElement) {
            onUpdateOutdoorElement(
              dragState.targetId,
              { points: dragPreview.points },
              'Reshape outdoor polygon/path',
            );
          }
        } else if (dragState.targetType === 'building') {
          onUpdateBuildingFootprint(
            dragState.targetId,
            dragPreview.center,
            dragPreview.size,
            dragState.type === 'move' ? 'Move building' : 'Resize building',
          );
        } else if (dragState.targetType === 'room' && selection.buildingId && selection.floorId) {
          onUpdateRoomGeometry(
            selection.buildingId,
            selection.floorId,
            dragState.targetId,
            dragPreview.center,
            dragPreview.size,
            dragState.type === 'move' ? 'Move indoor element' : 'Resize indoor element',
          );
        } else if (dragState.targetType === 'outdoor' && onUpdateOutdoorElement) {
          onUpdateOutdoorElement(
            dragState.targetId,
            { center: dragPreview.center, size: dragPreview.size },
            dragState.type === 'move' ? 'Move outdoor element' : 'Resize outdoor element',
          );
        }
      }
    }

    setDragState(null);
    setDragPreview(null);
  };

  // Start Move Drag
  const startMove = (
    e: React.PointerEvent,
    targetType: 'building' | 'room' | 'outdoor',
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
    targetType: 'building' | 'room' | 'outdoor',
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

  // Start Polygon / Polyline Vertex Drag
  const startVertexDrag = (
    e: React.PointerEvent,
    targetType: 'room' | 'outdoor',
    targetId: string,
    vertexIndex: number,
    initialPoints: Vec2[],
    initialCenter: [number, number],
    initialSize: [number, number],
  ) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const startWorld = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

    setDragState({
      type: 'vertex',
      targetType,
      targetId,
      vertexIndex,
      startPointer: { worldX: startWorld.wx, worldZ: startWorld.wz },
      initialCenter,
      initialSize,
      initialPoints,
    });
    setDragPreview({
      center: initialCenter,
      size: initialSize,
      points: initialPoints,
    });
  };

  // Render 8 Resize Handles
  const renderHandles = (
    worldCenter: [number, number],
    size: [number, number],
    targetType: 'building' | 'room' | 'outdoor',
    targetId: string,
    localOrWorldCenterForState: [number, number],
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

    return (Object.entries(handlePositions) as [HandleType, [number, number]][]).map(
      ([handle, [hx, hz]]) => {
        const { sx, sy } = worldToScreen(hx, hz);
        const handleSize = 9;
        return (
          <rect
            key={handle}
            x={sx - handleSize / 2}
            y={sy - handleSize / 2}
            width={handleSize}
            height={handleSize}
            rx={2}
            fill="#ffffff"
            stroke="#18181b"
            strokeWidth={2}
            style={{ cursor: cursors[handle] }}
            onPointerDown={(e) =>
              startResize(e, handle, targetType, targetId, localOrWorldCenterForState, size)
            }
          />
        );
      },
    );
  };

  // Render Clean Light Grid
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
    const majorStep = viewport.zoom > 15 ? 5 : 10;
    const minorStep = 1;

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
            stroke="#f1f5f9"
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
            stroke="#f1f5f9"
            strokeWidth={1}
          />,
        );
      }
    }

    for (let x = Math.floor(minX / majorStep) * majorStep; x <= maxX; x += majorStep) {
      const { sx } = worldToScreen(x, 0);
      lines.push(
        <line
          key={`majx_${x}`}
          x1={sx}
          y1={0}
          x2={sx}
          y2={height}
          stroke={x === 0 ? '#cbd5e1' : '#e2e8f0'}
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
          stroke={z === 0 ? '#cbd5e1' : '#e2e8f0'}
          strokeWidth={z === 0 ? 1.5 : 1}
        />,
      );
    }

    return <g className="grid">{lines}</g>;
  };

  const isFloorView = Boolean(selection.buildingId && selection.floorId);

  // Deleted objects on the current view (for Review Mode)
  const deletedChanges = changes.filter((c) => c.primaryCategory === 'deleted');

  return (
    <div
      ref={containerRef}
      className={`editor-canvas ${tool === 'pan' || isPanning ? 'cursor-grab' : ''}`}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: '#f8fafc',
        userSelect: 'none',
      }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* FLOATING CONTEXT HEADER BAR: FLOOR SELECTOR OR LAYER TOGGLES */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          right: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pointerEvents: 'none',
          zIndex: 10,
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        {selectedBuilding ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              backgroundColor: '#ffffff',
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
              pointerEvents: 'auto',
              flexWrap: 'wrap',
            }}
          >
            <button
              onClick={() => onSelectionChange({ type: 'none' })}
              style={{
                padding: '4px 8px',
                backgroundColor: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: 5,
                fontSize: 12,
                fontWeight: 600,
                color: '#0f172a',
                cursor: 'pointer',
              }}
            >
              ← Campus Exterior
            </button>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '0 4px' }}>
              🏢 {selectedBuilding.shortName ? `${selectedBuilding.shortName} · ` : ''}
              {selectedBuilding.name}
            </span>
            <div style={{ width: 1, height: 18, backgroundColor: '#e2e8f0' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Floor:</span>
            {selectedBuilding.floors.map((fl) => {
              const isFlActive = selection.floorId === fl.id;
              return (
                <button
                  key={fl.id}
                  onClick={() =>
                    onSelectionChange({
                      type: 'floor',
                      buildingId: selectedBuilding.id,
                      floorId: fl.id,
                    })
                  }
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: isFlActive ? 700 : 500,
                    backgroundColor: isFlActive ? '#18181b' : '#f1f5f9',
                    color: isFlActive ? '#ffffff' : '#334155',
                    border: '1px solid',
                    borderColor: isFlActive ? '#18181b' : '#cbd5e1',
                    cursor: 'pointer',
                  }}
                >
                  {fl.level === 1 ? 'Ground / Floor 1' : `Floor ${fl.level}`}
                </button>
              );
            })}
            {onAddFloor && (
              <button
                onClick={() => onAddFloor(selectedBuilding.id)}
                style={{
                  padding: '4px 8px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                  border: '1px dashed #94a3b8',
                  cursor: 'pointer',
                }}
                title="Add another floor to this building"
              >
                + Floor
              </button>
            )}
          </div>
        ) : (
          /* Outdoor Layer Filter Bar */
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              backgroundColor: '#ffffff',
              padding: '5px 10px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)',
              pointerEvents: 'auto',
              fontSize: 12,
            }}
          >
            <span style={{ fontWeight: 700, color: '#334155', fontSize: 11 }}>Layers:</span>
            {(
              [
                ['buildings', '🏢 Buildings'],
                ['paths', '🛣️ Paths & Roads'],
                ['greenery', '🌳 Greenery'],
                ['infrastructure', '⛲ Plazas & Fountain'],
                ['annotations', '💬 Labels & AI'],
              ] as [EditorLayerId, string][]
            ).map(([lid, text]) => {
              const active = visibleLayers[lid] !== false;
              return (
                <button
                  key={lid}
                  onClick={() => onToggleLayer?.(lid)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 5,
                    fontSize: 11,
                    fontWeight: active ? 600 : 500,
                    backgroundColor: active ? '#f1f5f9' : '#ffffff',
                    color: active ? '#0f172a' : '#94a3b8',
                    border: `1px solid ${active ? '#cbd5e1' : '#e2e8f0'}`,
                    cursor: 'pointer',
                  }}
                >
                  {active ? '✓ ' : ''}
                  {text}
                </button>
              );
            })}
          </div>
        )}

        {/* Active Polyline / Polygon Drawing Banner */}
        {isPointDrawTool && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              backgroundColor: '#18181b',
              color: '#ffffff',
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 12,
              pointerEvents: 'auto',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            <span>
              Click points on canvas ({draftPoints.length} placed).
            </span>
            <button
              onClick={finishPointDrawing}
              disabled={draftPoints.length < 2}
              style={{
                padding: '3px 8px',
                backgroundColor: '#22c55e',
                color: '#ffffff',
                border: 'none',
                borderRadius: 5,
                fontSize: 11,
                fontWeight: 700,
                cursor: draftPoints.length >= 2 ? 'pointer' : 'not-allowed',
              }}
            >
              ✓ Finish Shape
            </button>
            <button
              onClick={() => setDraftPoints([])}
              style={{
                padding: '3px 8px',
                backgroundColor: '#475569',
                color: '#ffffff',
                border: 'none',
                borderRadius: 5,
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Multi-Selection Action Bar */}
        {selection.type === 'multi' &&
          selection.selectedIds &&
          selection.selectedIds.length > 1 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                backgroundColor: '#ffffff',
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                pointerEvents: 'auto',
                fontSize: 12,
              }}
            >
              <span style={{ fontWeight: 700, color: '#0f172a' }}>
                {selection.selectedIds.length} objects selected
              </span>
              {onDuplicateSelected && (
                <button
                  onClick={onDuplicateSelected}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: 5,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ⧉ Duplicate All
                </button>
              )}
              {onDeleteSelected && (
                <button
                  onClick={onDeleteSelected}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#dc2626',
                    borderRadius: 5,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  🗑 Delete All
                </button>
              )}
            </div>
          )}
      </div>

      {/* MAIN INTERACTIVE SVG CANVAS */}
      <svg
        style={{ width: '100%', height: '100%', display: 'block' }}
        onDoubleClick={() => {
          if (isPointDrawTool && draftPoints.length >= 2) {
            finishPointDrawing();
          }
        }}
      >
        {renderGrid()}

        {/* 0. OUTDOOR CAMPUS ELEMENTS LAYER */}
        <g
          className="outdoor-elements"
          style={{ opacity: isFloorView ? 0.35 : 1, transition: 'opacity 0.2s' }}
        >
          {(doc.outdoorElements ?? []).map((out) => {
            if (visibleLayers[out.layer] === false) return null;
            const isSelected =
              (selection.type === 'outdoor' && selection.outdoorId === out.id) ||
              (selection.selectedIds?.includes(out.id) ?? false);
            const isDragTarget =
              dragState?.targetType === 'outdoor' &&
              dragState.targetId === out.id &&
              dragPreview;

            const center = isDragTarget ? dragPreview.center : out.center;
            const size = isDragTarget ? dragPreview.size : out.size;
            const points = isDragTarget && dragPreview.points ? dragPreview.points : out.points;

            const styleCfg = OUTDOOR_STYLES[out.type] || OUTDOOR_STYLES.custom;
            const chg = changeByTarget.get(out.id);

            if (out.shape === 'polyline' && points && points.length >= 2) {
              const ptsAttr = points
                .map(([wx, wz]) => {
                  const { sx, sy } = worldToScreen(wx, wz);
                  return `${sx.toFixed(1)},${sy.toFixed(1)}`;
                })
                .join(' ');
              const strokeW = Math.max(3, (out.width ?? 3.5) * viewport.zoom);
              const midPt = points[Math.floor(points.length / 2)];
              const { sx: msx, sy: msy } = worldToScreen(midPt[0], midPt[1]);

              return (
                <g key={out.id}>
                  <polyline
                    points={ptsAttr}
                    fill="none"
                    stroke={isSelected ? '#18181b' : styleCfg.border}
                    strokeWidth={strokeW + (isSelected ? 4 : 2)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <polyline
                    points={ptsAttr}
                    fill="none"
                    stroke={styleCfg.fill}
                    strokeWidth={strokeW}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ cursor: tool === 'select' ? 'pointer' : 'default' }}
                    onPointerDown={(e) => {
                      if (tool === 'select') {
                        onSelectionChange({ type: 'outdoor', outdoorId: out.id });
                        startMove(e, 'outdoor', out.id, center, size);
                      }
                    }}
                  />
                  {visibleLayers.annotations !== false && viewport.zoom >= 3.5 && (
                    <text
                      x={msx}
                      y={msy - strokeW / 2 - 6}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight="600"
                      fill="#334155"
                      pointerEvents="none"
                    >
                      {styleCfg.icon} {out.name}
                    </text>
                  )}
                  {/* Draggable Polyline Vertex Handles */}
                  {isSelected &&
                    points.map(([vx, vz], idx) => {
                      const { sx, sy } = worldToScreen(vx, vz);
                      return (
                        <circle
                          key={`v_${idx}`}
                          cx={sx}
                          cy={sy}
                          r={6}
                          fill="#ffffff"
                          stroke="#18181b"
                          strokeWidth={2}
                          style={{ cursor: 'move' }}
                          onPointerDown={(e) =>
                            startVertexDrag(e, 'outdoor', out.id, idx, points, center, size)
                          }
                        />
                      );
                    })}
                </g>
              );
            }

            if (out.shape === 'polygon' && points && points.length >= 3) {
              const ptsAttr = points
                .map(([wx, wz]) => {
                  const { sx, sy } = worldToScreen(wx, wz);
                  return `${sx.toFixed(1)},${sy.toFixed(1)}`;
                })
                .join(' ');
              const { sx: csx, sy: csy } = worldToScreen(center[0], center[1]);

              return (
                <g key={out.id}>
                  <polygon
                    points={ptsAttr}
                    fill={styleCfg.fill}
                    stroke={isSelected ? '#18181b' : chg ? CHANGE_CATEGORY_LABELS[chg.primaryCategory].borderColor : styleCfg.border}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    style={{ cursor: tool === 'select' ? 'pointer' : 'default' }}
                    onPointerDown={(e) => {
                      if (tool === 'select') {
                        onSelectionChange({ type: 'outdoor', outdoorId: out.id });
                        startMove(e, 'outdoor', out.id, center, size);
                      }
                    }}
                  />
                  {visibleLayers.annotations !== false && viewport.zoom >= 3.5 && (
                    <text
                      x={csx}
                      y={csy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={11}
                      fontWeight="600"
                      fill={styleCfg.text}
                      pointerEvents="none"
                    >
                      {styleCfg.icon} {out.name}
                    </text>
                  )}
                  {isSelected &&
                    points.map(([vx, vz], idx) => {
                      const { sx, sy } = worldToScreen(vx, vz);
                      return (
                        <circle
                          key={`v_${idx}`}
                          cx={sx}
                          cy={sy}
                          r={6}
                          fill="#ffffff"
                          stroke="#18181b"
                          strokeWidth={2}
                          style={{ cursor: 'move' }}
                          onPointerDown={(e) =>
                            startVertexDrag(e, 'outdoor', out.id, idx, points, center, size)
                          }
                        />
                      );
                    })}
                </g>
              );
            }

            const [cx, cz] = center;
            const [w, d] = size;
            const { sx, sy } = worldToScreen(cx - w / 2, cz - d / 2);
            const pixelW = w * viewport.zoom;
            const pixelH = d * viewport.zoom;

            if (out.type === 'tree' || out.shape === 'point') {
              const { sx: tsx, sy: tsy } = worldToScreen(cx, cz);
              const r = Math.max(8, (Math.max(w, d) / 2) * viewport.zoom);
              return (
                <g
                  key={out.id}
                  style={{ cursor: tool === 'select' ? 'pointer' : 'default' }}
                  onPointerDown={(e) => {
                    if (tool === 'select') {
                      onSelectionChange({ type: 'outdoor', outdoorId: out.id });
                      startMove(e, 'outdoor', out.id, center, size);
                    }
                  }}
                >
                  <circle
                    cx={tsx}
                    cy={tsy}
                    r={r}
                    fill="#bbf7d0"
                    stroke={isSelected ? '#18181b' : '#16a34a'}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                  />
                  <circle cx={tsx} cy={tsy} r={Math.max(3, r * 0.35)} fill="#15803d" />
                  {visibleLayers.annotations !== false && viewport.zoom >= 5 && (
                    <text
                      x={tsx}
                      y={tsy + r + 11}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight="600"
                      fill="#14532d"
                      pointerEvents="none"
                    >
                      {out.name}
                    </text>
                  )}
                </g>
              );
            }

            return (
              <g key={out.id}>
                <rect
                  x={sx}
                  y={sy}
                  width={pixelW}
                  height={pixelH}
                  rx={out.type === 'fountain' ? 6 : 4}
                  fill={styleCfg.fill}
                  stroke={
                    isSelected
                      ? '#18181b'
                      : chg
                        ? CHANGE_CATEGORY_LABELS[chg.primaryCategory].borderColor
                        : styleCfg.border
                  }
                  strokeWidth={isSelected ? 2.5 : chg ? 2 : 1.2}
                  style={{ cursor: tool === 'select' ? 'pointer' : 'default' }}
                  onPointerDown={(e) => {
                    if (tool === 'select') {
                      onSelectionChange({ type: 'outdoor', outdoorId: out.id });
                      startMove(e, 'outdoor', out.id, center, size);
                    }
                  }}
                />
                {/* Fountain water rings detail */}
                {out.type === 'fountain' && pixelW > 30 && pixelH > 15 && (
                  <g pointerEvents="none">
                    <rect
                      x={sx + pixelW * 0.35}
                      y={sy + pixelH * 0.2}
                      width={pixelW * 0.3}
                      height={pixelH * 0.6}
                      rx={4}
                      fill="#bae6fd"
                      stroke="#0284c7"
                      strokeWidth={1}
                    />
                  </g>
                )}
                {visibleLayers.annotations !== false && pixelW > 45 && pixelH > 18 && (
                  <text
                    x={sx + pixelW / 2}
                    y={sy + pixelH / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={Math.min(12, Math.max(9, pixelH / 4))}
                    fontWeight="600"
                    fill={styleCfg.text}
                    pointerEvents="none"
                  >
                    {styleCfg.icon} {out.name}
                  </text>
                )}
                {isSelected &&
                  !isFloorView &&
                  renderHandles(center, size, 'outdoor', out.id, center)}
              </g>
            );
          })}
        </g>

        {/* 1. BUILDINGS LAYER */}
        {visibleLayers.buildings !== false && (
          <g className="buildings">
            {doc.buildings.map((bld) => {
              const isSelected =
                selection.buildingId === bld.id ||
                (selection.selectedIds?.includes(bld.id) ?? false);
              const isDragTarget =
                dragState?.targetType === 'building' &&
                dragState.targetId === bld.id &&
                dragPreview;

              const center = isDragTarget ? dragPreview.center : bld.footprint.center;
              const size = isDragTarget ? dragPreview.size : bld.footprint.size;
              const [cx, cz] = center;
              const [w, d] = size;

              const dx = center[0] - bld.footprint.center[0];
              const dz = center[1] - bld.footprint.center[1];

              const { sx, sy } = worldToScreen(cx - w / 2, cz - d / 2);
              const pixelW = w * viewport.zoom;
              const pixelH = d * viewport.zoom;

              const chg = changeByTarget.get(bld.id);
              const partsToRender =
                bld.parts && bld.parts.length > 1 && !isDragTarget
                  ? bld.parts
                  : [{ center, size }];

              return (
                <g key={bld.id}>
                  {/* Baseline Ghost Outline if moved/resized */}
                  {reviewMode && chg && chg.before && chg.before.footprint && (
                    <rect
                      x={
                        worldToScreen(
                          chg.before.footprint.center[0] - chg.before.footprint.size[0] / 2,
                          chg.before.footprint.center[1] - chg.before.footprint.size[1] / 2,
                        ).sx
                      }
                      y={
                        worldToScreen(
                          chg.before.footprint.center[0] - chg.before.footprint.size[0] / 2,
                          chg.before.footprint.center[1] - chg.before.footprint.size[1] / 2,
                        ).sy
                      }
                      width={chg.before.footprint.size[0] * viewport.zoom}
                      height={chg.before.footprint.size[1] * viewport.zoom}
                      fill="none"
                      stroke="#94a3b8"
                      strokeWidth={1.5}
                      strokeDasharray="4,4"
                      pointerEvents="none"
                    />
                  )}

                  {/* Building Wings / Footprint Rectangles */}
                  {partsToRender.map((part, pIdx) => {
                    const pCenter: Vec2 =
                      bld.parts && bld.parts.length > 1 && isDragTarget
                        ? [part.center[0] + dx, part.center[1] + dz]
                        : part.center;
                    const pSize = part.size;
                    const { sx: psx, sy: psy } = worldToScreen(
                      pCenter[0] - pSize[0] / 2,
                      pCenter[1] - pSize[1] / 2,
                    );
                    const pw = pSize[0] * viewport.zoom;
                    const ph = pSize[1] * viewport.zoom;

                    return (
                      <rect
                        key={pIdx}
                        x={psx}
                        y={psy}
                        width={pw}
                        height={ph}
                        rx={4}
                        fill={
                          isFloorView && isSelected
                            ? '#ffffff'
                            : isSelected
                              ? '#f1f5f9'
                              : '#ffffff'
                        }
                        stroke={
                          isSelected
                            ? '#18181b'
                            : chg
                              ? CHANGE_CATEGORY_LABELS[chg.primaryCategory].borderColor
                              : '#475569'
                        }
                        strokeWidth={isSelected ? 2.5 : chg ? 2 : 1.5}
                        strokeDasharray={isFloorView && !isSelected ? '4,4' : undefined}
                        style={{
                          cursor: tool === 'select' ? 'pointer' : 'default',
                          opacity: isFloorView && !isSelected ? 0.45 : 1,
                        }}
                        onPointerDown={(e) => {
                          if (tool === 'select') {
                            if (e.shiftKey) {
                              const prevIds = selection.selectedIds || (selection.buildingId ? [selection.buildingId] : []);
                              const nextIds = prevIds.includes(bld.id)
                                ? prevIds.filter((id) => id !== bld.id)
                                : [...prevIds, bld.id];
                              onSelectionChange({ type: 'multi', selectedIds: nextIds });
                              return;
                            }
                            onSelectionChange({
                              type: isFloorView && isSelected ? 'floor' : 'building',
                              buildingId: bld.id,
                              floorId:
                                isFloorView && isSelected
                                  ? selection.floorId
                                  : undefined,
                            });
                            if (!isFloorView || !isSelected) {
                              startMove(e, 'building', bld.id, center, size);
                            }
                          }
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          onSelectionChange({
                            type: 'floor',
                            buildingId: bld.id,
                            floorId: bld.floors[0]?.id,
                          });
                        }}
                      />
                    );
                  })}

                  {/* Building Label (shown when not inside this building's active floor plan) */}
                  {(!isFloorView || !isSelected) &&
                    visibleLayers.annotations !== false &&
                    pixelW > 36 &&
                    pixelH > 18 && (
                      <g pointerEvents="none">
                        <text
                          x={sx + pixelW / 2}
                          y={sy + pixelH / 2 - (pixelH > 46 ? 8 : 0)}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#0f172a"
                          fontSize={Math.min(14, Math.max(10, pixelH / 4))}
                          fontWeight="700"
                        >
                          {bld.shortName ? `${bld.shortName} · ${bld.name}` : bld.name}
                        </text>
                        {pixelH > 46 && (
                          <text
                            x={sx + pixelW / 2}
                            y={sy + pixelH / 2 + 10}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill="#64748b"
                            fontSize={Math.min(11, Math.max(8, pixelH / 6))}
                            fontWeight="500"
                          >
                            {w.toFixed(1)}m × {d.toFixed(1)}m • {bld.floors.length} fl
                          </text>
                        )}
                        {(chg || (bld.photos && bld.photos.length > 0)) && (
                          <text
                            x={sx + pixelW / 2}
                            y={sy + 11}
                            textAnchor="middle"
                            fontSize={9}
                            fontWeight="700"
                            fill={
                              chg
                                ? CHANGE_CATEGORY_LABELS[chg.primaryCategory].color
                                : '#0284c7'
                            }
                          >
                            {bld.photos && bld.photos.length > 0 ? `📷${bld.photos.length} ` : ''}
                            {chg ? CHANGE_CATEGORY_LABELS[chg.primaryCategory].shortBadge : ''}
                          </text>
                        )}
                      </g>
                    )}

                  {/* Building Resize Handles when selected in Campus view */}
                  {isSelected &&
                    !selection.roomId &&
                    !isFloorView &&
                    renderHandles(center, size, 'building', bld.id, center)}
                </g>
              );
            })}
          </g>
        )}

        {/* 2. INDOOR FLOOR PLAN ELEMENTS LAYER (Active Floor) */}
        {selectedBuilding && selectedFloor && (
          <g className="rooms">
            {selectedFloor.rooms.map((rm) => {
              const isSelected =
                selection.roomId === rm.id ||
                (selection.selectedIds?.includes(rm.id) ?? false);
              const isDragTarget =
                dragState?.targetType === 'room' &&
                dragState.targetId === rm.id &&
                dragPreview;

              const localCenter = isDragTarget ? dragPreview.center : rm.localCenter;
              const size = isDragTarget ? dragPreview.size : rm.size;
              const polygon =
                isDragTarget && dragPreview.points ? dragPreview.points : rm.polygon;

              const bCx = selectedBuilding.footprint.center[0];
              const bCz = selectedBuilding.footprint.center[1];
              const worldCx = bCx + localCenter[0];
              const worldCz = bCz + localCenter[1];

              const [w, d] = size;
              const { sx, sy } = worldToScreen(worldCx - w / 2, worldCz - d / 2);
              const pixelW = w * viewport.zoom;
              const pixelH = d * viewport.zoom;

              const styleKey = rm.elementType || rm.kind || 'other';
              const styleCfg = INDOOR_STYLES[styleKey] || INDOOR_STYLES.other;
              const chg = changeByTarget.get(rm.id);

              return (
                <g key={rm.id}>
                  {/* Baseline ghost in Review Mode if moved/resized */}
                  {reviewMode && chg && chg.before && chg.before.localCenter && (
                    <rect
                      x={
                        worldToScreen(
                          bCx + chg.before.localCenter[0] - chg.before.size[0] / 2,
                          bCz + chg.before.localCenter[1] - chg.before.size[1] / 2,
                        ).sx
                      }
                      y={
                        worldToScreen(
                          bCx + chg.before.localCenter[0] - chg.before.size[0] / 2,
                          bCz + chg.before.localCenter[1] - chg.before.size[1] / 2,
                        ).sy
                      }
                      width={chg.before.size[0] * viewport.zoom}
                      height={chg.before.size[1] * viewport.zoom}
                      fill="none"
                      stroke="#94a3b8"
                      strokeWidth={1.2}
                      strokeDasharray="3,3"
                      pointerEvents="none"
                    />
                  )}

                  {/* Polygon Indoor Space */}
                  {polygon && polygon.length >= 3 ? (
                    <polygon
                      points={polygon
                        .map(([lx, lz]) => {
                          const pt = worldToScreen(bCx + lx, bCz + lz);
                          return `${pt.sx.toFixed(1)},${pt.sy.toFixed(1)}`;
                        })
                        .join(' ')}
                      fill={styleCfg.fill}
                      stroke={
                        isSelected
                          ? '#18181b'
                          : chg
                            ? CHANGE_CATEGORY_LABELS[chg.primaryCategory].borderColor
                            : styleCfg.border
                      }
                      strokeWidth={isSelected ? 2.5 : chg ? 2 : 1.5}
                      style={{ cursor: tool === 'select' ? 'pointer' : 'default' }}
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
                  ) : (
                    /* Standard Rectangular Indoor Element */
                    <rect
                      x={sx}
                      y={sy}
                      width={pixelW}
                      height={pixelH}
                      rx={rm.elementType === 'wall' || rm.elementType === 'partition' ? 1 : 3}
                      fill={styleCfg.fill}
                      stroke={
                        isSelected
                          ? '#18181b'
                          : chg
                            ? CHANGE_CATEGORY_LABELS[chg.primaryCategory].borderColor
                            : styleCfg.border
                      }
                      strokeWidth={isSelected ? 2.5 : chg ? 2 : 1.4}
                      strokeDasharray={rm.elementType === 'corridor' ? '5,3' : undefined}
                      style={{ cursor: tool === 'select' ? 'pointer' : 'default' }}
                      onPointerDown={(e) => {
                        if (tool === 'select') {
                          if (e.shiftKey) {
                            const prevIds =
                              selection.selectedIds ||
                              (selection.roomId ? [selection.roomId] : []);
                            const nextIds = prevIds.includes(rm.id)
                              ? prevIds.filter((id) => id !== rm.id)
                              : [...prevIds, rm.id];
                            onSelectionChange({
                              type: 'multi',
                              buildingId: selectedBuilding.id,
                              floorId: selectedFloor.id,
                              selectedIds: nextIds,
                            });
                            return;
                          }
                          onSelectionChange({
                            type: 'room',
                            buildingId: selectedBuilding.id,
                            floorId: selectedFloor.id,
                            roomId: rm.id,
                          });
                          startMove(e, 'room', rm.id, localCenter, size);
                        }
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setInlineEditRoomId(rm.id);
                        setInlineEditValue(rm.name || rm.number);
                      }}
                    />
                  )}

                  {/* Architectural Visual Symbols for Stairs, Doors, Windows */}
                  {rm.elementType === 'stairs' && pixelW > 16 && pixelH > 16 && (
                    <g pointerEvents="none" stroke="#d97706" strokeWidth={1}>
                      {[0.2, 0.35, 0.5, 0.65, 0.8].map((t) => (
                        <line
                          key={t}
                          x1={sx + 3}
                          y1={sy + pixelH * t}
                          x2={sx + pixelW - 3}
                          y2={sy + pixelH * t}
                        />
                      ))}
                    </g>
                  )}

                  {rm.elementType === 'door' && pixelW > 8 && pixelH > 8 && (
                    <path
                      d={`M ${sx} ${sy + pixelH} A ${pixelW} ${pixelW} 0 0 1 ${sx + pixelW} ${sy}`}
                      fill="none"
                      stroke="#16a34a"
                      strokeWidth={1.5}
                      strokeDasharray="2,2"
                      pointerEvents="none"
                    />
                  )}

                  {/* Room / Element Label */}
                  {visibleLayers.annotations !== false && pixelW > 22 && pixelH > 14 && (
                    <g pointerEvents="none">
                      <text
                        x={sx + pixelW / 2}
                        y={sy + pixelH / 2 - (pixelH > 34 ? 6 : 0)}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill={styleCfg.text}
                        fontSize={Math.min(12, Math.max(8, pixelH / 3.2))}
                        fontWeight="700"
                      >
                        {rm.number}
                      </text>
                      {pixelH > 34 && pixelW > 40 && (
                        <text
                          x={sx + pixelW / 2}
                          y={sy + pixelH / 2 + 8}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#475569"
                          fontSize={Math.min(10, Math.max(7, pixelH / 4.2))}
                          fontWeight="500"
                        >
                          {rm.name || `${w.toFixed(1)}×${d.toFixed(1)}m`}
                        </text>
                      )}
                      {(chg || rm.aiComment || (rm.photos && rm.photos.length > 0)) && pixelW > 36 && (
                        <text
                          x={sx + pixelW - 4}
                          y={sy + 10}
                          textAnchor="end"
                          fontSize={9}
                          fontWeight="700"
                          fill={
                            chg
                              ? CHANGE_CATEGORY_LABELS[chg.primaryCategory].color
                              : '#6d28d9'
                          }
                        >
                          {rm.photos && rm.photos.length > 0 ? `📷${rm.photos.length} ` : ''}
                          {rm.aiComment ? '💬' : ''}{' '}
                          {chg ? CHANGE_CATEGORY_LABELS[chg.primaryCategory].shortBadge : ''}
                        </text>
                      )}
                    </g>
                  )}

                  {/* Polygon Vertex Handles or 8-Way Resize Handles */}
                  {isSelected &&
                    (polygon && polygon.length >= 3
                      ? polygon.map(([vx, vz], idx) => {
                          const { sx: vsx, sy: vsy } = worldToScreen(bCx + vx, bCz + vz);
                          return (
                            <circle
                              key={`rv_${idx}`}
                              cx={vsx}
                              cy={vsy}
                              r={6}
                              fill="#ffffff"
                              stroke="#18181b"
                              strokeWidth={2}
                              style={{ cursor: 'move' }}
                              onPointerDown={(e) =>
                                startVertexDrag(
                                  e,
                                  'room',
                                  rm.id,
                                  idx,
                                  polygon,
                                  localCenter,
                                  size,
                                )
                              }
                            />
                          );
                        })
                      : renderHandles(
                          [worldCx, worldCz],
                          size,
                          'room',
                          rm.id,
                          localCenter,
                        ))}
                </g>
              );
            })}
          </g>
        )}

        {/* 3. DELETED OBJECTS OVERLAY IN CHANGE REVIEW MODE */}
        {reviewMode && deletedChanges.length > 0 && (
          <g className="deleted-ghosts">
            {deletedChanges.map((chg) => {
              if (
                chg.targetType === 'room' &&
                selectedBuilding &&
                selectedFloor &&
                chg.buildingId === selectedBuilding.id &&
                chg.floorId === selectedFloor.id &&
                chg.before
              ) {
                const bCx = selectedBuilding.footprint.center[0];
                const bCz = selectedBuilding.footprint.center[1];
                const [lx, lz] = chg.before.localCenter;
                const [rw, rd] = chg.before.size;
                const { sx, sy } = worldToScreen(bCx + lx - rw / 2, bCz + lz - rd / 2);
                const pw = rw * viewport.zoom;
                const ph = rd * viewport.zoom;
                return (
                  <g
                    key={chg.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onRevertChange?.(chg)}
                  >
                    <rect
                      x={sx}
                      y={sy}
                      width={pw}
                      height={ph}
                      fill="rgba(254, 226, 226, 0.55)"
                      stroke="#dc2626"
                      strokeWidth={2}
                      strokeDasharray="4,4"
                      rx={3}
                    />
                    <text
                      x={sx + pw / 2}
                      y={sy + ph / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={10}
                      fontWeight="700"
                      fill="#b91c1c"
                    >
                      ✕ DELETED: {chg.before.number} (Click to Restore)
                    </text>
                  </g>
                );
              }
              return null;
            })}
          </g>
        )}

        {/* 4. SMART ALIGNMENT GUIDES */}
        {guides.map((g, i) => {
          if (g.axis === 'x') {
            const { sx } = worldToScreen(g.value, 0);
            return (
              <line
                key={i}
                x1={sx}
                y1={0}
                x2={sx}
                y2={2000}
                stroke="#ec4899"
                strokeWidth={1.5}
                strokeDasharray="4,4"
                pointerEvents="none"
              />
            );
          } else {
            const { sy } = worldToScreen(0, g.value);
            return (
              <line
                key={i}
                x1={0}
                y1={sy}
                x2={3000}
                y2={sy}
                stroke="#ec4899"
                strokeWidth={1.5}
                strokeDasharray="4,4"
                pointerEvents="none"
              />
            );
          }
        })}

        {/* 5. DRAG-TO-DRAW OR MARQUEE SELECTION PREVIEW */}
        {(dragState?.type === 'draw-rect' || dragState?.type === 'marquee') && dragPreview && (
          <g pointerEvents="none">
            {(() => {
              const [cx, cz] = dragPreview.center;
              const [w, d] = dragPreview.size;
              const { sx, sy } = worldToScreen(cx - w / 2, cz - d / 2);
              const pw = w * viewport.zoom;
              const ph = d * viewport.zoom;
              return (
                <>
                  <rect
                    x={sx}
                    y={sy}
                    width={pw}
                    height={ph}
                    fill={
                      dragState.type === 'marquee'
                        ? 'rgba(24, 24, 27, 0.06)'
                        : 'rgba(16, 185, 129, 0.15)'
                    }
                    stroke={dragState.type === 'marquee' ? '#18181b' : '#16a34a'}
                    strokeWidth={1.5}
                    strokeDasharray="4,4"
                    rx={3}
                  />
                  {dragState.type === 'draw-rect' && w >= 0.5 && (
                    <text
                      x={sx + pw / 2}
                      y={sy + ph / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={11}
                      fontWeight="700"
                      fill="#15803d"
                    >
                      {w.toFixed(1)}m × {d.toFixed(1)}m
                    </text>
                  )}
                </>
              );
            })()}
          </g>
        )}

        {/* 6. INTERACTIVE POLYLINE / POLYGON RUBBER-BAND PREVIEW */}
        {isPointDrawTool && draftPoints.length > 0 && (
          <g pointerEvents="none">
            {(() => {
              const allPts = cursorWorld ? [...draftPoints, cursorWorld] : draftPoints;
              const ptsStr = allPts
                .map(([wx, wz]) => {
                  const { sx, sy } = worldToScreen(wx, wz);
                  return `${sx.toFixed(1)},${sy.toFixed(1)}`;
                })
                .join(' ');
              return (
                <>
                  <polyline
                    points={ptsStr}
                    fill={tool === 'add-polygon-room' ? 'rgba(59, 130, 246, 0.12)' : 'none'}
                    stroke="#18181b"
                    strokeWidth={2.5}
                    strokeDasharray="5,4"
                  />
                  {draftPoints.map(([vx, vz], idx) => {
                    const { sx, sy } = worldToScreen(vx, vz);
                    return (
                      <circle
                        key={idx}
                        cx={sx}
                        cy={sy}
                        r={5}
                        fill={idx === 0 ? '#22c55e' : '#ffffff'}
                        stroke="#18181b"
                        strokeWidth={2}
                      />
                    );
                  })}
                </>
              );
            })()}
          </g>
        )}
      </svg>

      {/* INLINE RENAME POPOVER ON DOUBLE CLICK */}
      {inlineEditRoomId && selectedBuilding && selectedFloor && (
        <div
          style={{
            position: 'absolute',
            bottom: 52,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#ffffff',
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.14)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            zIndex: 30,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Rename:</span>
          <input
            type="text"
            autoFocus
            value={inlineEditValue}
            onChange={(e) => setInlineEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onUpdateRoomProps?.(
                  selectedBuilding.id,
                  selectedFloor.id,
                  inlineEditRoomId,
                  { name: inlineEditValue.trim() },
                  'Inline rename element',
                );
                setInlineEditRoomId(null);
              } else if (e.key === 'Escape') {
                setInlineEditRoomId(null);
              }
            }}
            style={{
              padding: '5px 8px',
              borderRadius: 5,
              border: '1px solid #cbd5e1',
              fontSize: 12,
              outline: 'none',
            }}
          />
          <button
            onClick={() => {
              onUpdateRoomProps?.(
                selectedBuilding.id,
                selectedFloor.id,
                inlineEditRoomId,
                { name: inlineEditValue.trim() },
                'Inline rename element',
              );
              setInlineEditRoomId(null);
            }}
            style={{
              padding: '5px 10px',
              backgroundColor: '#18181b',
              color: '#ffffff',
              border: 'none',
              borderRadius: 5,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Save
          </button>
        </div>
      )}

      {/* Floating Bottom Status Bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          backgroundColor: '#ffffff',
          padding: '5px 12px',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 500,
          color: '#475569',
          border: '1px solid #cbd5e1',
          boxShadow: '0 2px 6px rgba(15, 23, 42, 0.05)',
          pointerEvents: 'none',
        }}
      >
        {isFloorView && selectedBuilding && selectedFloor
          ? `Indoor Mode: ${selectedBuilding.shortName || selectedBuilding.name} • Floor ${selectedFloor.level}`
          : 'Outdoor Campus Mode (Double-click a building to edit floors)'}{' '}
        | Zoom: {viewport.zoom.toFixed(1)} px/m | Snap: {gridSnap > 0 ? `${gridSnap}m` : 'Off'}
      </div>
    </div>
  );
};
