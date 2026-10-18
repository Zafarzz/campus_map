import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Vec2 } from '../../domain/geometry/types';
import {
  computeSemanticChanges,
  revertIndividualChange,
} from '../changeTracking/changeTracker';
import { createInitialDocument } from '../domain/adapter';
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
  ExportReferenceScope,
  IndoorElementType,
  OutdoorElementType,
  SemanticChange,
} from '../domain/types';
import { downloadCampusEditZip } from '../export/exportService';
import {
  addBuildingToDoc,
  addFloorToDoc,
  addOutdoorElementToDoc,
  addPhotosToTargetInDoc,
  addRoomToDoc,
  duplicateBuildingInDoc,
  duplicateOutdoorElementInDoc,
  duplicateRoomInDoc,
  removeBuildingFromDoc,
  removeFloorFromDoc,
  removeOutdoorElementFromDoc,
  removePhotoFromTargetInDoc,
  removeRoomFromDoc,
  reorderPhotoInTargetInDoc,
  SnapshotCommand,
  updateBuildingFootprint,
  updateBuildingPropsInDoc,
  updateCampusPropsInDoc,
  updateFloorPropsInDoc,
  updateOutdoorElementInDoc,
  updatePhotoInTargetInDoc,
  updateRoomGeometry,
  updateRoomPolygonInDoc,
  updateRoomPropsInDoc,
} from '../history/commands';
import { HistoryManager } from '../history/historyManager';
import {
  cloneDocument,
  createNamedVersion,
  deleteVersion,
  initStorage,
  loadVersions,
  resetToDefaults,
  saveDraft,
} from '../storage/storageService';
import { validateDocument } from '../validation/validator';
import { EditorCanvas } from './EditorCanvas';
import { EditorLeftPanel } from './EditorLeftPanel';
import { EditorRightPanel } from './EditorRightPanel';
import { EditorTopBar } from './EditorTopBar';
import { VersionHistoryModal } from './VersionHistoryModal';

export const EditorPage: React.FC = () => {
  const [doc, setDoc] = useState<EditorDocument | null>(null);
  const [baselineDoc, setBaselineDoc] = useState<EditorDocument | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [selection, setSelection] = useState<EditorSelection>({ type: 'none' });
  const [tool, setTool] = useState<EditorTool>('select');
  const [gridSnap, setGridSnap] = useState<number>(0.5);
  const [isVersionsOpen, setIsVersionsOpen] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [referenceScope, setReferenceScope] = useState<ExportReferenceScope>('all');
  const [leftTab, setLeftTab] = useState<'buildings' | 'outdoor' | 'changes'>('buildings');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [visibleLayers, setVisibleLayers] = useState<Record<EditorLayerId, boolean>>({
    buildings: true,
    paths: true,
    greenery: true,
    infrastructure: true,
    annotations: true,
  });

  const [viewport, setViewport] = useState<CanvasViewport>({
    pan: { x: 540, y: 360 },
    zoom: 4.5, // Default zoom showing the full campus comfortably
  });

  const history = useRef(new HistoryManager(80));

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  // Initialize storage and baseline document
  useEffect(() => {
    let alive = true;
    const defaultBaseline = createInitialDocument();
    setBaselineDoc(defaultBaseline);

    initStorage().then(({ doc: loadedDoc, versions: loadedVersions }) => {
      if (!alive) return;
      setDoc(loadedDoc);
      setVersions(loadedVersions);
      // Use the initial version snapshot if available, otherwise canonical defaultBaseline
      const initialVer = loadedVersions.find((v) => v.type === 'initial');
      if (initialVer?.document) {
        setBaselineDoc(cloneDocument(initialVer.document));
      }
      history.current.clear();
      setIsDirty(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Warn on tab close if unsaved
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Validation
  const issues = useMemo(() => {
    return doc ? validateDocument(doc) : [];
  }, [doc]);

  // Semantic Change Tracking against Baseline
  const changes = useMemo(() => {
    if (!doc || !baselineDoc) return [];
    return computeSemanticChanges(baselineDoc, doc);
  }, [doc, baselineDoc]);

  // Document Mutation with Command Pattern + Reliable Autosave
  const applyMutation = useCallback(
    (actionName: string, nextDoc: EditorDocument) => {
      if (!doc) return;
      const cmd = new SnapshotCommand(actionName, doc, nextDoc);
      history.current.push(cmd);
      setDoc(nextDoc);
      setIsDirty(true);
      // Autosave draft to IndexedDB / localStorage asynchronously
      saveDraft(nextDoc).catch(() => {});
    },
    [doc],
  );

  // Undo / Redo
  const handleUndo = useCallback(() => {
    if (!doc || !history.current.canUndo) return;
    const res = history.current.undo(doc);
    if (res) {
      setDoc(res.doc);
      setIsDirty(true);
      saveDraft(res.doc).catch(() => {});
      showToast(`Undid: ${res.description}`);
    }
  }, [doc, showToast]);

  const handleRedo = useCallback(() => {
    if (!doc || !history.current.canRedo) return;
    const res = history.current.redo(doc);
    if (res) {
      setDoc(res.doc);
      setIsDirty(true);
      saveDraft(res.doc).catch(() => {});
      showToast(`Redid: ${res.description}`);
    }
  }, [doc, showToast]);

  // Save current draft explicitly
  const handleSave = useCallback(async () => {
    if (!doc) return;
    await saveDraft(doc);
    setIsDirty(false);
    showToast('Saved to 3D Campus Map');
  }, [doc, showToast]);

  // Toggle Layer Visibility
  const handleToggleLayer = useCallback((layer: EditorLayerId) => {
    setVisibleLayers((prev) => ({
      ...prev,
      [layer]: !prev[layer],
    }));
  }, []);

  // Duplicate Selected Object(s)
  const handleDuplicateSelected = useCallback(() => {
    if (!doc) return;
    if (selection.type === 'room' && selection.buildingId && selection.floorId && selection.roomId) {
      const res = duplicateRoomInDoc(doc, selection.buildingId, selection.floorId, selection.roomId);
      applyMutation('Duplicate floor element', res.doc);
      if (res.newRoomId) {
        setSelection({
          type: 'room',
          buildingId: selection.buildingId,
          floorId: selection.floorId,
          roomId: res.newRoomId,
        });
      }
      showToast('Duplicated floor element');
    } else if (selection.type === 'building' && selection.buildingId) {
      const res = duplicateBuildingInDoc(doc, selection.buildingId);
      applyMutation('Duplicate building', res.doc);
      if (res.newBuildingId) {
        const bld = res.doc.buildings.find((b) => b.id === res.newBuildingId);
        setSelection({
          type: 'building',
          buildingId: res.newBuildingId,
          floorId: bld?.floors[0]?.id,
        });
      }
      showToast('Duplicated building');
    } else if (selection.type === 'outdoor' && selection.outdoorId) {
      const res = duplicateOutdoorElementInDoc(doc, selection.outdoorId);
      applyMutation('Duplicate outdoor element', res.doc);
      if (res.newOutdoorId) {
        setSelection({
          type: 'outdoor',
          outdoorId: res.newOutdoorId,
        });
      }
      showToast('Duplicated outdoor element');
    } else if (selection.type === 'multi' && selection.selectedIds?.length) {
      let next = cloneDocument(doc);
      const newIds: string[] = [];
      for (const id of selection.selectedIds) {
        if (selection.buildingId && selection.floorId) {
          const r = duplicateRoomInDoc(next, selection.buildingId, selection.floorId, id);
          next = r.doc;
          if (r.newRoomId) newIds.push(r.newRoomId);
        } else if (next.buildings.some((b) => b.id === id)) {
          const r = duplicateBuildingInDoc(next, id);
          next = r.doc;
          if (r.newBuildingId) newIds.push(r.newBuildingId);
        } else if ((next.outdoorElements ?? []).some((o) => o.id === id)) {
          const r = duplicateOutdoorElementInDoc(next, id);
          next = r.doc;
          if (r.newOutdoorId) newIds.push(r.newOutdoorId);
        }
      }
      applyMutation(`Duplicate ${selection.selectedIds.length} objects`, next);
      if (newIds.length > 0) {
        setSelection({ ...selection, selectedIds: newIds });
      }
      showToast(`Duplicated ${selection.selectedIds.length} objects`);
    }
  }, [doc, selection, applyMutation, showToast]);

  // Delete Selected Object(s)
  const handleDeleteSelected = useCallback(() => {
    if (!doc) return;
    if (selection.type === 'multi' && selection.selectedIds?.length) {
      let next = cloneDocument(doc);
      for (const id of selection.selectedIds) {
        if (selection.buildingId && selection.floorId) {
          next = removeRoomFromDoc(next, selection.buildingId, selection.floorId, id);
        } else if (next.buildings.some((b) => b.id === id)) {
          next = removeBuildingFromDoc(next, id);
        } else if ((next.outdoorElements ?? []).some((o) => o.id === id)) {
          next = removeOutdoorElementFromDoc(next, id);
        }
      }
      applyMutation(`Delete ${selection.selectedIds.length} objects`, next);
      if (selection.buildingId && selection.floorId) {
        setSelection({ type: 'floor', buildingId: selection.buildingId, floorId: selection.floorId });
      } else {
        setSelection({ type: 'none' });
      }
      showToast(`Deleted ${selection.selectedIds.length} objects`);
      return;
    }

    if (selection.roomId && selection.buildingId && selection.floorId) {
      const next = removeRoomFromDoc(doc, selection.buildingId, selection.floorId, selection.roomId);
      applyMutation('Delete floor element', next);
      setSelection({ type: 'floor', buildingId: selection.buildingId, floorId: selection.floorId });
      showToast('Deleted floor element');
    } else if (selection.outdoorId) {
      const next = removeOutdoorElementFromDoc(doc, selection.outdoorId);
      applyMutation('Delete outdoor element', next);
      setSelection({ type: 'none' });
      showToast('Deleted outdoor element');
    } else if (selection.buildingId && selection.type === 'building') {
      const next = removeBuildingFromDoc(doc, selection.buildingId);
      applyMutation('Delete building', next);
      setSelection({ type: 'none' });
      showToast('Deleted building');
    }
  }, [doc, selection, applyMutation, showToast]);

  // Global hotkeys (excluding inputs/textareas)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        handleRedo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleSave();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        handleDuplicateSelected();
        return;
      }

      if (e.key === 'v' || e.key === 'V') {
        setTool('select');
        return;
      }

      if (e.key === 'h' || e.key === 'H') {
        setTool('pan');
        return;
      }

      if (e.key === 'Escape') {
        if (tool !== 'select') {
          setTool('select');
        } else if (selection.type === 'room' && selection.buildingId && selection.floorId) {
          setSelection({ type: 'floor', buildingId: selection.buildingId, floorId: selection.floorId });
        } else {
          setSelection({ type: 'none' });
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteSelected();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    tool,
    selection,
    handleUndo,
    handleRedo,
    handleSave,
    handleDuplicateSelected,
    handleDeleteSelected,
  ]);

  // Back to 3D Navigation
  const handleBackTo3D = useCallback(async () => {
    if (doc) {
      await saveDraft(doc);
      setIsDirty(false);
    }
    window.location.hash = '';
    window.history.pushState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [doc]);

  // Operations: Buildings
  const handleAddBuilding = useCallback(
    (customX?: number, customZ?: number, customSize?: [number, number]) => {
      if (!doc) return;
      const count = doc.buildings.length + 1;
      const id = `bld-${Date.now().toString(36)}`;
      const w = customSize?.[0] ?? 28;
      const d = customSize?.[1] ?? 14;
      const newBld: EditorBuilding = {
        id,
        name: `Building ${count}`,
        shortName: `B${count}`,
        footprint: {
          center: [customX ?? 0, customZ ?? 0],
          size: [w, d],
        },
        floorCount: 2,
        floors: [
          {
            id: `fl-${id}-1`,
            level: 1,
            name: 'Floor 1 (Ground)',
            rooms: [
              {
                id: `rm-${id}-101`,
                number: '101',
                name: 'Room 101',
                kind: 'classroom',
                elementType: 'room',
                shape: 'rect',
                capacity: 30,
                localCenter: [-Math.max(3, w * 0.22), 0],
                size: [Math.max(4, w * 0.35), Math.max(4, d * 0.6)],
                provenance: 'demo',
              },
              {
                id: `rm-${id}-102`,
                number: '102',
                name: 'Room 102',
                kind: 'lab',
                elementType: 'room',
                shape: 'rect',
                capacity: 25,
                localCenter: [Math.max(3, w * 0.22), 0],
                size: [Math.max(4, w * 0.35), Math.max(4, d * 0.6)],
                provenance: 'demo',
              },
            ],
          },
          {
            id: `fl-${id}-2`,
            level: 2,
            name: 'Floor 2',
            rooms: [
              {
                id: `rm-${id}-201`,
                number: '201',
                name: 'Room 201',
                kind: 'classroom',
                elementType: 'room',
                shape: 'rect',
                capacity: 30,
                localCenter: [0, 0],
                size: [Math.max(6, w * 0.5), Math.max(4, d * 0.6)],
                provenance: 'demo',
              },
            ],
          },
        ],
      };

      const next = addBuildingToDoc(doc, newBld);
      applyMutation(`Added building "${newBld.name}"`, next);
      setSelection({ type: 'building', buildingId: id, floorId: newBld.floors[0]?.id });
      setTool('select');
      showToast(`Created ${newBld.name}`);
    },
    [doc, applyMutation, showToast],
  );

  const handleDeleteBuilding = useCallback(
    async (buildingId: string) => {
      if (!doc) return;
      const bld = doc.buildings.find((b) => b.id === buildingId);
      if (!bld) return;

      const ok = window.confirm(
        `Delete building "${bld.name}" and all its floors? You can undo this action with Ctrl+Z.`,
      );
      if (!ok) return;

      await createNamedVersion(doc, `Auto-backup before deleting ${bld.shortName || bld.name}`, '', 'auto');
      const updatedVersions = await loadVersions();
      setVersions(updatedVersions);

      const next = removeBuildingFromDoc(doc, buildingId);
      applyMutation(`Deleted building "${bld.name}"`, next);
      setSelection({ type: 'none' });
      showToast(`Deleted ${bld.name}`);
    },
    [doc, applyMutation, showToast],
  );

  // Operations: Floors
  const handleAddFloor = useCallback(
    (buildingId: string) => {
      if (!doc) return;
      const bld = doc.buildings.find((b) => b.id === buildingId);
      if (!bld) return;
      const nextLevel = (bld.floors.length ? Math.max(...bld.floors.map((f) => f.level)) : 0) + 1;
      const floorId = `fl-${buildingId}-${nextLevel}`;
      const newFloor: EditorFloor = {
        id: floorId,
        level: nextLevel,
        name: `Floor ${nextLevel}`,
        rooms: [],
      };
      const next = addFloorToDoc(doc, buildingId, newFloor);
      applyMutation(`Added Floor ${nextLevel} to "${bld.name}"`, next);
      setSelection({ type: 'floor', buildingId, floorId });
      showToast(`Added Floor ${nextLevel}`);
    },
    [doc, applyMutation, showToast],
  );

  const handleDeleteFloor = useCallback(
    (buildingId: string, floorId: string) => {
      if (!doc) return;
      const bld = doc.buildings.find((b) => b.id === buildingId);
      const fl = bld?.floors.find((f) => f.id === floorId);
      if (!bld || !fl) return;
      if (bld.floors.length <= 1) {
        alert('Cannot delete the only floor of a building.');
        return;
      }
      const ok = window.confirm(`Delete Floor ${fl.level} and all its elements?`);
      if (!ok) return;
      const next = removeFloorFromDoc(doc, buildingId, floorId);
      applyMutation(`Deleted Floor ${fl.level}`, next);
      setSelection({ type: 'building', buildingId, floorId: bld.floors[0]?.id });
      showToast(`Deleted Floor ${fl.level}`);
    },
    [doc, applyMutation, showToast],
  );

  // Operations: Indoor Elements (Rooms, Corridors, Halls, Doors, Windows, Stairs, Elevators, Entrances, Walls, Polygons)
  const handleAddIndoorElement = useCallback(
    (
      buildingId: string,
      floorId: string,
      elementType: IndoorElementType = 'room',
      customLocalX?: number,
      customLocalZ?: number,
      customSize?: [number, number],
      customPolygon?: Vec2[],
    ) => {
      if (!doc) return;
      const bld = doc.buildings.find((b) => b.id === buildingId);
      const fl = bld?.floors.find((f) => f.id === floorId);
      if (!bld || !fl) return;

      const idx = fl.rooms.length + 1;
      const presets: Record<
        IndoorElementType,
        {
          prefix: string;
          label: string;
          kind: EditorRoom['kind'];
          defaultSize: [number, number];
          capacity?: number;
        }
      > = {
        room: {
          prefix: `${fl.level}${String(idx).padStart(2, '0')}`,
          label: `Room ${fl.level}${String(idx).padStart(2, '0')}`,
          kind: 'classroom',
          defaultSize: [8, 6],
          capacity: 30,
        },
        corridor: {
          prefix: `COR-${fl.level}${idx}`,
          label: `Corridor ${idx}`,
          kind: 'other',
          defaultSize: [14, 3],
        },
        hall: {
          prefix: `HALL-${fl.level}${idx}`,
          label: `Hall / Lobby ${idx}`,
          kind: 'hall',
          defaultSize: [12, 8],
          capacity: 80,
        },
        lobby: {
          prefix: `LOBBY-${fl.level}${idx}`,
          label: `Lobby ${idx}`,
          kind: 'hall',
          defaultSize: [10, 8],
        },
        door: {
          prefix: `DR-${fl.level}${idx}`,
          label: `Door ${idx}`,
          kind: 'other',
          defaultSize: [1.5, 0.5],
        },
        window: {
          prefix: `WIN-${fl.level}${idx}`,
          label: `Window ${idx}`,
          kind: 'other',
          defaultSize: [2.5, 0.5],
        },
        stairs: {
          prefix: `STR-${fl.level}${idx}`,
          label: `Stairs ${idx}`,
          kind: 'other',
          defaultSize: [4, 3.5],
        },
        elevator: {
          prefix: `ELV-${fl.level}${idx}`,
          label: `Elevator ${idx}`,
          kind: 'other',
          defaultSize: [2.5, 2.5],
        },
        entrance: {
          prefix: `ENT-${fl.level}${idx}`,
          label: `Entrance ${idx}`,
          kind: 'hall',
          defaultSize: [4, 2.5],
        },
        exit: {
          prefix: `EXT-${fl.level}${idx}`,
          label: `Emergency Exit ${idx}`,
          kind: 'hall',
          defaultSize: [3, 2],
        },
        wall: {
          prefix: `WL-${fl.level}${idx}`,
          label: `Wall / Partition ${idx}`,
          kind: 'other',
          defaultSize: [8, 0.5],
        },
        partition: {
          prefix: `PRT-${fl.level}${idx}`,
          label: `Partition ${idx}`,
          kind: 'other',
          defaultSize: [6, 0.4],
        },
        custom: {
          prefix: `OBJ-${fl.level}${idx}`,
          label: `Custom Zone ${idx}`,
          kind: 'other',
          defaultSize: [5, 5],
        },
      };

      const preset = presets[elementType] || presets.room;
      const roomId = `rm-${buildingId}-${Date.now().toString(36)}-${idx}`;
      const size: [number, number] = customSize ?? preset.defaultSize;

      const newRoom: EditorRoom = {
        id: roomId,
        number: preset.prefix,
        name: preset.label,
        kind: preset.kind,
        elementType,
        shape: customPolygon && customPolygon.length >= 3 ? 'polygon' : 'rect',
        polygon: customPolygon,
        capacity: preset.capacity,
        localCenter: [
          Math.round((customLocalX ?? 0) * 100) / 100,
          Math.round((customLocalZ ?? 0) * 100) / 100,
        ],
        size: [
          Math.round(size[0] * 100) / 100,
          Math.round(size[1] * 100) / 100,
        ],
        provenance: 'demo',
      };

      const next = addRoomToDoc(doc, buildingId, floorId, newRoom);
      applyMutation(`Added ${preset.label}`, next);
      setSelection({ type: 'room', buildingId, floorId, roomId });
      setTool('select');
      showToast(`Added ${preset.label}`);
    },
    [doc, applyMutation, showToast],
  );

  const handleAddRoom = useCallback(
    (buildingId: string, floorId: string, customLocalX?: number, customLocalZ?: number) => {
      handleAddIndoorElement(buildingId, floorId, 'room', customLocalX, customLocalZ);
    },
    [handleAddIndoorElement],
  );

  const handleDeleteRoom = useCallback(
    (buildingId: string, floorId: string, roomId: string) => {
      if (!doc) return;
      const bld = doc.buildings.find((b) => b.id === buildingId);
      const fl = bld?.floors.find((f) => f.id === floorId);
      const rm = fl?.rooms.find((r) => r.id === roomId);
      if (!rm) return;

      const next = removeRoomFromDoc(doc, buildingId, floorId, roomId);
      applyMutation(`Deleted ${rm.name || rm.number}`, next);
      setSelection({ type: 'floor', buildingId, floorId });
      showToast(`Deleted ${rm.name || rm.number}`);
    },
    [doc, applyMutation, showToast],
  );

  // Operations: Outdoor Campus Elements
  const handleAddOutdoorElement = useCallback(
    (
      type: OutdoorElementType,
      worldX: number,
      worldZ: number,
      drawnSize?: [number, number],
      drawnPoints?: Vec2[],
    ) => {
      if (!doc) return;
      const existingCount = (doc.outdoorElements ?? []).filter((o) => o.type === type).length + 1;
      const id = `out-${type}-${Date.now().toString(36)}`;

      const presets: Record<
        OutdoorElementType,
        {
          name: string;
          layer: EditorLayerId;
          shape: EditorOutdoorElement['shape'];
          defaultSize: [number, number];
          width?: number;
        }
      > = {
        path: {
          name: `Pedestrian Path ${existingCount}`,
          layer: 'paths',
          shape: 'polyline',
          defaultSize: [24, 4],
          width: 3.5,
        },
        walkway: {
          name: `Connecting Walkway ${existingCount}`,
          layer: 'paths',
          shape: 'polyline',
          defaultSize: [20, 4],
          width: 4,
        },
        road: {
          name: `Campus Road ${existingCount}`,
          layer: 'paths',
          shape: 'polyline',
          defaultSize: [40, 8],
          width: 8,
        },
        lawn: {
          name: `Green Area / Lawn ${existingCount}`,
          layer: 'greenery',
          shape: drawnPoints && drawnPoints.length >= 3 ? 'polygon' : 'rect',
          defaultSize: [26, 18],
        },
        tree: {
          name: `Tree Cluster ${existingCount}`,
          layer: 'greenery',
          shape: 'point',
          defaultSize: [5, 5],
        },
        plaza: {
          name: `Open Plaza ${existingCount}`,
          layer: 'infrastructure',
          shape: drawnPoints && drawnPoints.length >= 3 ? 'polygon' : 'rect',
          defaultSize: [24, 20],
        },
        fountain: {
          name: `Campus Fountain ${existingCount}`,
          layer: 'infrastructure',
          shape: 'point',
          defaultSize: [14, 14],
        },
        entrance: {
          name: `Campus Entrance Gate ${existingCount}`,
          layer: 'infrastructure',
          shape: 'rect',
          defaultSize: [8, 4],
        },
        custom: {
          name: `Outdoor Object ${existingCount}`,
          layer: 'infrastructure',
          shape: drawnPoints && drawnPoints.length >= 3 ? 'polygon' : 'rect',
          defaultSize: [12, 12],
        },
      };

      const preset = presets[type] || presets.custom;
      const size: [number, number] = drawnSize ?? preset.defaultSize;

      let points: Vec2[] | undefined = drawnPoints;
      if (!points && preset.shape === 'polyline') {
        points = [
          [Math.round((worldX - size[0] / 2) * 100) / 100, Math.round(worldZ * 100) / 100],
          [Math.round((worldX + size[0] / 2) * 100) / 100, Math.round(worldZ * 100) / 100],
        ];
      }

      const newElem: EditorOutdoorElement = {
        id,
        name: preset.name,
        type,
        layer: preset.layer,
        shape: preset.shape,
        center: [Math.round(worldX * 100) / 100, Math.round(worldZ * 100) / 100],
        size: [Math.round(size[0] * 100) / 100, Math.round(size[1] * 100) / 100],
        points,
        width: preset.width,
      };

      const next = addOutdoorElementToDoc(doc, newElem);
      applyMutation(`Added ${preset.name}`, next);
      setSelection({ type: 'outdoor', outdoorId: id });
      setTool('select');
      showToast(`Added ${preset.name}`);
    },
    [doc, applyMutation, showToast],
  );

  const handleDeleteOutdoor = useCallback(
    (outdoorId: string) => {
      if (!doc) return;
      const elem = (doc.outdoorElements ?? []).find((o) => o.id === outdoorId);
      if (!elem) return;
      const next = removeOutdoorElementFromDoc(doc, outdoorId);
      applyMutation(`Deleted "${elem.name}"`, next);
      setSelection({ type: 'none' });
      showToast(`Deleted ${elem.name}`);
    },
    [doc, applyMutation, showToast],
  );

  // Canvas Click / Draw Dispatcher
  const handleCanvasClickAdd = useCallback(
    (
      wx: number,
      wz: number,
      drawnSize?: [number, number],
      drawnPoints?: Vec2[],
    ) => {
      if (!doc) return;

      // Outdoor tools
      if (tool === 'add-building') {
        handleAddBuilding(wx, wz, drawnSize);
        return;
      }

      const outdoorToolMap: Partial<Record<EditorTool, OutdoorElementType>> = {
        'add-path': 'path',
        'add-road': 'road',
        'add-lawn': 'lawn',
        'add-tree': 'tree',
        'add-plaza': 'plaza',
        'add-fountain': 'fountain',
        'add-outdoor-entrance': 'entrance',
        'add-outdoor-custom': 'custom',
      };

      if (outdoorToolMap[tool]) {
        handleAddOutdoorElement(outdoorToolMap[tool]!, wx, wz, drawnSize, drawnPoints);
        return;
      }

      // Indoor floor tools
      const indoorToolMap: Partial<Record<EditorTool, IndoorElementType>> = {
        'add-room': 'room',
        'add-polygon-room': 'room',
        'add-corridor': 'corridor',
        'add-hall': 'hall',
        'add-door': 'door',
        'add-window': 'window',
        'add-stairs': 'stairs',
        'add-elevator': 'elevator',
        'add-entrance': 'entrance',
        'add-wall': 'wall',
      };

      const indoorType = indoorToolMap[tool];
      if (indoorType) {
        if (!selection.buildingId) {
          alert('Please click a building first to open its floor plan before placing indoor elements.');
          return;
        }
        const bld = doc.buildings.find((b) => b.id === selection.buildingId);
        if (!bld) return;
        const flId = selection.floorId || bld.floors[0]?.id;
        if (!flId) return;

        const localX = wx - bld.footprint.center[0];
        const localZ = wz - bld.footprint.center[1];
        handleAddIndoorElement(
          bld.id,
          flId,
          indoorType,
          localX,
          localZ,
          drawnSize,
          drawnPoints,
        );
      }
    },
    [tool, selection, doc, handleAddBuilding, handleAddOutdoorElement, handleAddIndoorElement],
  );

  // Revert an individual semantic change
  const handleRevertChange = useCallback(
    (change: SemanticChange) => {
      if (!doc || !baselineDoc) return;
      const next = revertIndividualChange(doc, baselineDoc, change);
      applyMutation(`Reverted change on "${change.name}"`, next);
      showToast(`Reverted "${change.name}" to original state`);
    },
    [doc, baselineDoc, applyMutation, showToast],
  );

  // Reset all changes back to baseline with confirmation
  const handleResetAllChanges = useCallback(async () => {
    if (!doc || !baselineDoc) return;
    const ok = window.confirm(
      `Discard all ${changes.length} change(s) and revert the campus to its original baseline state?\n\n(An automatic backup snapshot will be saved in Version History.)`,
    );
    if (!ok) return;

    await createNamedVersion(doc, 'Auto-backup before Reset All Changes', '', 'auto');
    const updatedVersions = await loadVersions();
    setVersions(updatedVersions);

    const restored = cloneDocument(baselineDoc);
    applyMutation('Reset all changes to original state', restored);
    setSelection({ type: 'none' });
    showToast('Reverted all changes to original baseline');
  }, [doc, baselineDoc, changes.length, applyMutation, showToast]);

  // Export AI-friendly ZIP archive
  const handleExportZip = useCallback(async () => {
    if (!doc || !baselineDoc) return;
    const blockingErrors = issues.filter((i) => i.severity === 'error');
    if (blockingErrors.length > 0) {
      const proceed = window.confirm(
        `There are ${blockingErrors.length} validation error(s):\n\n• ${blockingErrors.map((e) => e.message).join('\n• ')}\n\nDo you still want to export the ZIP package?`,
      );
      if (!proceed) return;
    }
    try {
      const pkg = downloadCampusEditZip(doc, baselineDoc, { referenceScope });
      showToast(
        `Exported campus-edit.zip (${pkg.changes.length} changes, ${pkg.manifest.stats.referencePhotoCount} photos)`,
      );
    } catch (err: any) {
      alert(`Export error: ${err?.message || 'Failed to package reference photos'}`);
    }
  }, [doc, baselineDoc, issues, referenceScope, showToast]);

  // Versions Management
  const handleCreateNamedVersion = async (name: string, reason: string) => {
    if (!doc) return;
    const newVer = await createNamedVersion(doc, name, reason, 'manual');
    setVersions((prev) => [newVer, ...prev]);
    showToast(`Saved snapshot "${name}"`);
  };

  const handleRestoreVersion = async (ver: any) => {
    if (!doc) return;
    await createNamedVersion(doc, `Auto-backup before restoring "${ver.name}"`, '', 'auto');
    const restoredDoc = cloneDocument(ver.document);
    await saveDraft(restoredDoc);

    const record = await createNamedVersion(
      restoredDoc,
      `Restored from: ${ver.name}`,
      `Restored state from ${new Date(ver.timestamp).toLocaleString()}`,
      'manual',
    );

    setDoc(restoredDoc);
    setVersions((prev) => [record, ...prev]);
    history.current.clear();
    setIsDirty(false);
    setIsVersionsOpen(false);
    setSelection({ type: 'none' });
    showToast(`Restored snapshot "${ver.name}"`);
  };

  const handleDeleteVersion = async (versionId: string) => {
    const ok = await deleteVersion(versionId);
    if (ok) {
      setVersions((prev) => prev.filter((v) => v.id !== versionId));
    }
  };

  const handleResetToDefaults = async () => {
    if (doc) {
      await createNamedVersion(doc, 'Auto-backup before full reset', '', 'auto');
    }
    const { doc: resetDoc, versions: resetVersions } = await resetToDefaults();
    setDoc(resetDoc);
    setBaselineDoc(cloneDocument(resetDoc));
    setVersions(resetVersions);
    history.current.clear();
    setIsDirty(false);
    setIsVersionsOpen(false);
    setSelection({ type: 'none' });
    showToast('Reset campus to factory defaults');
  };

  if (!doc) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f8fafc',
          color: '#334155',
          fontSize: 15,
          fontWeight: 600,
        }}
      >
        Loading Visual Campus Editor...
      </div>
    );
  }

  const isFloorMode = Boolean(selection.buildingId);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#ffffff',
        color: '#0f172a',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      {/* 1. TOP BAR */}
      <EditorTopBar
        campusName={doc.name}
        isDirty={isDirty}
        canUndo={history.current.canUndo}
        canRedo={history.current.canRedo}
        currentTool={tool}
        gridSnap={gridSnap}
        viewport={viewport}
        versionCount={versions.length}
        changeCount={changes.length}
        reviewMode={reviewMode}
        isFloorMode={isFloorMode}
        referenceScope={referenceScope}
        onReferenceScopeChange={setReferenceScope}
        onToolChange={setTool}
        onGridSnapChange={setGridSnap}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSave={handleSave}
        onOpenVersions={() => setIsVersionsOpen(true)}
        onToggleReviewMode={() => {
          setReviewMode((prev) => {
            const next = !prev;
            if (next) setLeftTab('changes');
            return next;
          });
        }}
        onExportZip={handleExportZip}
        onZoomIn={() => setViewport((v) => ({ ...v, zoom: Math.min(60, v.zoom * 1.25) }))}
        onZoomOut={() => setViewport((v) => ({ ...v, zoom: Math.max(1, v.zoom * 0.8) }))}
        onResetView={() => setViewport({ pan: { x: 540, y: 360 }, zoom: 4.5 })}
        onBackTo3D={handleBackTo3D}
      />

      {/* 2. MAIN WORKSPACE (LEFT PANEL + SVG CANVAS + RIGHT PANEL) */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        <EditorLeftPanel
          doc={doc}
          selection={selection}
          changes={changes}
          visibleLayers={visibleLayers}
          activeTabOverride={leftTab}
          onTabChange={setLeftTab}
          onToggleLayer={handleToggleLayer}
          onSelectionChange={(sel) => {
            setSelection(sel);
            // Center viewport gently when picking a building from the sidebar if not already focused
            if (sel.buildingId && sel.buildingId !== selection.buildingId) {
              const b = doc.buildings.find((x) => x.id === sel.buildingId);
              if (b) {
                setViewport((vp) => ({
                  zoom: Math.max(vp.zoom, 7),
                  pan: {
                    x: 520 - b.footprint.center[0] * Math.max(vp.zoom, 7),
                    y: 360 - b.footprint.center[1] * Math.max(vp.zoom, 7),
                  },
                }));
              }
            }
          }}
          onAddBuilding={() => handleAddBuilding()}
          onDeleteBuilding={handleDeleteBuilding}
          onAddFloor={handleAddFloor}
          onDeleteFloor={handleDeleteFloor}
          onAddRoom={handleAddRoom}
          onDeleteRoom={handleDeleteRoom}
          onDeleteOutdoor={handleDeleteOutdoor}
          onRevertChange={handleRevertChange}
          onResetAllChanges={handleResetAllChanges}
        />

        <main style={{ flex: 1, position: 'relative', minWidth: 0, height: '100%' }}>
          <EditorCanvas
            doc={doc}
            baselineDoc={baselineDoc}
            selection={selection}
            tool={tool}
            viewport={viewport}
            gridSnap={gridSnap}
            changes={changes}
            reviewMode={reviewMode}
            visibleLayers={visibleLayers}
            onToggleLayer={handleToggleLayer}
            onSelectionChange={setSelection}
            onViewportChange={setViewport}
            onUpdateBuildingFootprint={(bldId, center, size, action) => {
              const next = updateBuildingFootprint(doc, bldId, center, size);
              applyMutation(action, next);
            }}
            onUpdateRoomGeometry={(bldId, flId, rmId, lCenter, size, action) => {
              const next = updateRoomGeometry(doc, bldId, flId, rmId, lCenter, size);
              applyMutation(action, next);
            }}
            onUpdateRoomPolygon={(bldId, flId, rmId, polygon, action) => {
              const next = updateRoomPolygonInDoc(doc, bldId, flId, rmId, polygon);
              applyMutation(action, next);
            }}
            onUpdateRoomProps={(bldId, flId, rmId, patch, action) => {
              const next = updateRoomPropsInDoc(doc, bldId, flId, rmId, patch);
              applyMutation(action, next);
            }}
            onUpdateOutdoorElement={(outId, patch, action) => {
              const next = updateOutdoorElementInDoc(doc, outId, patch);
              applyMutation(action, next);
            }}
            onCanvasClickAdd={handleCanvasClickAdd}
            onAddFloor={handleAddFloor}
            onDuplicateSelected={handleDuplicateSelected}
            onDeleteSelected={handleDeleteSelected}
            onRevertChange={handleRevertChange}
          />

          {/* Floating Toast Notification */}
          {toastMessage && (
            <div
              style={{
                position: 'absolute',
                bottom: 50,
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: '#0f172a',
                color: '#ffffff',
                padding: '8px 16px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                boxShadow: '0 8px 20px rgba(15, 23, 42, 0.18)',
                pointerEvents: 'none',
                zIndex: 40,
              }}
            >
              ✓ {toastMessage}
            </div>
          )}
        </main>

        <EditorRightPanel
          doc={doc}
          selection={selection}
          issues={issues}
          changes={changes}
          referenceScope={referenceScope}
          onReferenceScopeChange={setReferenceScope}
          onSelectionChange={setSelection}
          onUpdateCampusProps={(patch, action) => {
            const next = updateCampusPropsInDoc(doc, patch);
            applyMutation(action, next);
          }}
          onUpdateBuildingProps={(bldId, patch, action) => {
            const next = updateBuildingPropsInDoc(doc, bldId, patch);
            applyMutation(action, next);
          }}
          onUpdateBuildingFootprint={(bldId, center, size, action) => {
            const next = updateBuildingFootprint(doc, bldId, center, size);
            applyMutation(action, next);
          }}
          onUpdateFloorProps={(bldId, flId, patch, action) => {
            const next = updateFloorPropsInDoc(doc, bldId, flId, patch);
            applyMutation(action, next);
          }}
          onUpdateRoomProps={(bldId, flId, rmId, patch, action) => {
            const next = updateRoomPropsInDoc(doc, bldId, flId, rmId, patch);
            applyMutation(action, next);
          }}
          onUpdateRoomGeometry={(bldId, flId, rmId, lCenter, size, action) => {
            const next = updateRoomGeometry(doc, bldId, flId, rmId, lCenter, size);
            applyMutation(action, next);
          }}
          onUpdateOutdoorElement={(outId, patch, action) => {
            const next = updateOutdoorElementInDoc(doc, outId, patch);
            applyMutation(action, next);
          }}
          onAddPhotos={(target, photos, action) => {
            const next = addPhotosToTargetInDoc(doc, target, photos);
            applyMutation(action, next);
            showToast(`Attached ${photos.length} reference photo(s)`);
          }}
          onUpdatePhoto={(target, photoId, patch, action) => {
            const next = updatePhotoInTargetInDoc(doc, target, photoId, patch);
            applyMutation(action, next);
          }}
          onReorderPhoto={(target, photoId, dir, action) => {
            const next = reorderPhotoInTargetInDoc(doc, target, photoId, dir);
            applyMutation(action, next);
          }}
          onRemovePhoto={(target, photoId, action) => {
            const next = removePhotoFromTargetInDoc(doc, target, photoId);
            applyMutation(action, next);
            showToast('Removed photo attachment');
          }}
          onDuplicateBuilding={(bldId) => {
            const res = duplicateBuildingInDoc(doc, bldId);
            applyMutation('Duplicate building', res.doc);
            if (res.newBuildingId) {
              const bld = res.doc.buildings.find((b) => b.id === res.newBuildingId);
              setSelection({
                type: 'building',
                buildingId: res.newBuildingId,
                floorId: bld?.floors[0]?.id,
              });
            }
            showToast('Duplicated building');
          }}
          onDuplicateRoom={(bldId, flId, rmId) => {
            const res = duplicateRoomInDoc(doc, bldId, flId, rmId);
            applyMutation('Duplicate floor element', res.doc);
            if (res.newRoomId) {
              setSelection({
                type: 'room',
                buildingId: bldId,
                floorId: flId,
                roomId: res.newRoomId,
              });
            }
            showToast('Duplicated floor element');
          }}
          onDuplicateOutdoor={(outId) => {
            const res = duplicateOutdoorElementInDoc(doc, outId);
            applyMutation('Duplicate outdoor element', res.doc);
            if (res.newOutdoorId) {
              setSelection({ type: 'outdoor', outdoorId: res.newOutdoorId });
            }
            showToast('Duplicated outdoor element');
          }}
          onDeleteBuilding={handleDeleteBuilding}
          onDeleteRoom={handleDeleteRoom}
          onDeleteOutdoor={handleDeleteOutdoor}
          onRevertChange={handleRevertChange}
          onExportZip={handleExportZip}
        />
      </div>

      {/* 3. VERSION HISTORY MODAL */}
      <VersionHistoryModal
        isOpen={isVersionsOpen}
        versions={versions}
        currentDoc={doc}
        onClose={() => setIsVersionsOpen(false)}
        onCreateVersion={handleCreateNamedVersion}
        onRestoreVersion={handleRestoreVersion}
        onDeleteVersion={handleDeleteVersion}
        onResetToDefaults={handleResetToDefaults}
      />
    </div>
  );
};
