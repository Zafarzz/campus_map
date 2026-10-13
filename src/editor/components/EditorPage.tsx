import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CanvasViewport,
  EditorBuilding,
  EditorDocument,
  EditorFloor,
  EditorRoom,
  EditorSelection,
  EditorTool,
} from '../domain/types';
import {
  addBuildingToDoc,
  addFloorToDoc,
  addRoomToDoc,
  removeBuildingFromDoc,
  removeFloorFromDoc,
  removeRoomFromDoc,
  SnapshotCommand,
  updateBuildingFootprint,
  updateBuildingPropsInDoc,
  updateRoomGeometry,
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
  saveVersion,
} from '../storage/storageService';
import { validateDocument } from '../validation/validator';
import { EditorCanvas } from './EditorCanvas';
import { EditorLeftPanel } from './EditorLeftPanel';
import { EditorRightPanel } from './EditorRightPanel';
import { EditorTopBar } from './EditorTopBar';
import { VersionHistoryModal } from './VersionHistoryModal';

export const EditorPage: React.FC = () => {
  const [doc, setDoc] = useState<EditorDocument | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [selection, setSelection] = useState<EditorSelection>({ type: 'none' });
  const [tool, setTool] = useState<EditorTool>('select');
  const [gridSnap, setGridSnap] = useState<number>(0.5);
  const [isVersionsOpen, setIsVersionsOpen] = useState(false);

  const [viewport, setViewport] = useState<CanvasViewport>({
    pan: { x: 500, y: 350 },
    zoom: 6, // 6 pixels per meter default
  });

  const history = useRef(new HistoryManager(60));

  // Initialize storage
  useEffect(() => {
    let alive = true;
    initStorage().then(({ doc: loadedDoc, versions: loadedVersions }) => {
      if (!alive) return;
      setDoc(loadedDoc);
      setVersions(loadedVersions);
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

  // Document Mutation with Command Pattern
  const applyMutation = useCallback(
    (actionName: string, nextDoc: EditorDocument) => {
      if (!doc) return;
      const cmd = new SnapshotCommand(actionName, doc, nextDoc);
      history.current.push(cmd);
      setDoc(nextDoc);
      setIsDirty(true);
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
    }
  }, [doc]);

  const handleRedo = useCallback(() => {
    if (!doc || !history.current.canRedo) return;
    const res = history.current.redo(doc);
    if (res) {
      setDoc(res.doc);
      setIsDirty(true);
    }
  }, [doc]);

  // Save current draft
  const handleSave = useCallback(async () => {
    if (!doc) return;
    await saveDraft(doc);
    setIsDirty(false);
  }, [doc]);

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

      if (e.key === 'v' || e.key === 'V') {
        setTool('select');
        return;
      }

      if (e.key === 'h' || e.key === 'H') {
        setTool('pan');
        return;
      }

      if (e.key === 'Escape') {
        setSelection({ type: 'none' });
        setTool('select');
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!doc) return;
        if (selection.roomId && selection.buildingId && selection.floorId) {
          e.preventDefault();
          const next = removeRoomFromDoc(doc, selection.buildingId, selection.floorId, selection.roomId);
          applyMutation('Удаление помещения', next);
          setSelection({ type: 'floor', buildingId: selection.buildingId, floorId: selection.floorId });
        } else if (selection.buildingId) {
          e.preventDefault();
          const next = removeBuildingFromDoc(doc, selection.buildingId);
          applyMutation('Удаление здания', next);
          setSelection({ type: 'none' });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [doc, selection, handleUndo, handleRedo, handleSave, applyMutation]);

  // Back to 3D Navigation
  const handleBackTo3D = useCallback(async () => {
    if (isDirty) {
      const saveNow = window.confirm(
        'У вас есть несохранённые изменения. Сохранить их перед переходом в 3D-режим?\n\n(Нажмите "ОК" для сохранения, или "Отмена" для отмены перехода)',
      );
      if (saveNow) {
        if (doc) await saveDraft(doc);
        setIsDirty(false);
      } else {
        return;
      }
    }
    // Navigate back to 3D root
    window.location.hash = '';
    window.history.pushState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [isDirty, doc]);

  // Operations: Buildings
  const handleAddBuilding = useCallback(
    (customX?: number, customZ?: number) => {
      if (!doc) return;
      const count = doc.buildings.length + 1;
      const id = `bld-${Date.now().toString(36)}`;
      const newBld: EditorBuilding = {
        id,
        name: `Новый корпус ${count}`,
        shortName: `K${count}`,
        footprint: {
          center: [customX ?? 0, customZ ?? 0],
          size: [28, 14],
        },
        floorCount: 2,
        floors: [
          {
            id: `fl-${id}-1`,
            level: 1,
            name: 'Этаж 1',
            rooms: [
              {
                id: `rm-${id}-101`,
                number: '101',
                name: 'Аудитория 101',
                kind: 'classroom',
                capacity: 30,
                localCenter: [-7, 0],
                size: [10, 8],
                provenance: 'demo',
              },
              {
                id: `rm-${id}-102`,
                number: '102',
                name: 'Аудитория 102',
                kind: 'lab',
                capacity: 25,
                localCenter: [7, 0],
                size: [10, 8],
                provenance: 'demo',
              },
            ],
          },
          {
            id: `fl-${id}-2`,
            level: 2,
            name: 'Этаж 2',
            rooms: [
              {
                id: `rm-${id}-201`,
                number: '201',
                name: 'Аудитория 201',
                kind: 'classroom',
                capacity: 30,
                localCenter: [-7, 0],
                size: [10, 8],
                provenance: 'demo',
              },
            ],
          },
        ],
      };

      const next = addBuildingToDoc(doc, newBld);
      applyMutation(`Добавлено здание «${newBld.name}»`, next);
      setSelection({ type: 'building', buildingId: id, floorId: newBld.floors[0]?.id });
      setTool('select');
    },
    [doc, applyMutation],
  );

  const handleDeleteBuilding = useCallback(
    async (buildingId: string) => {
      if (!doc) return;
      const bld = doc.buildings.find((b) => b.id === buildingId);
      if (!bld) return;

      const ok = window.confirm(`Удалить здание «${bld.name}» и все его этажи? Действие можно отменить через Undo.`);
      if (!ok) return;

      // Auto snapshot before destructive action
      await createNamedVersion(doc, `Автокопия перед удалением ${bld.shortName || bld.name}`, '', 'auto');
      const updatedVersions = await loadVersions();
      setVersions(updatedVersions);

      const next = removeBuildingFromDoc(doc, buildingId);
      applyMutation(`Удалено здание «${bld.name}»`, next);
      setSelection({ type: 'none' });
    },
    [doc, applyMutation],
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
        name: `Этаж ${nextLevel}`,
        rooms: [],
      };
      const next = addFloorToDoc(doc, buildingId, newFloor);
      applyMutation(`Добавлен этаж ${nextLevel} в «${bld.name}»`, next);
      setSelection({ type: 'floor', buildingId, floorId });
    },
    [doc, applyMutation],
  );

  const handleDeleteFloor = useCallback(
    (buildingId: string, floorId: string) => {
      if (!doc) return;
      const bld = doc.buildings.find((b) => b.id === buildingId);
      const fl = bld?.floors.find((f) => f.id === floorId);
      if (!bld || !fl) return;
      if (bld.floors.length <= 1) {
        alert('Нельзя удалить единственный этаж здания.');
        return;
      }
      const ok = window.confirm(`Удалить этаж ${fl.level} и все его помещения?`);
      if (!ok) return;
      const next = removeFloorFromDoc(doc, buildingId, floorId);
      applyMutation(`Удален этаж ${fl.level}`, next);
      setSelection({ type: 'building', buildingId, floorId: bld.floors[0]?.id });
    },
    [doc, applyMutation],
  );

  // Operations: Rooms
  const handleAddRoom = useCallback(
    (buildingId: string, floorId: string, customLocalX?: number, customLocalZ?: number) => {
      if (!doc) return;
      const bld = doc.buildings.find((b) => b.id === buildingId);
      const fl = bld?.floors.find((f) => f.id === floorId);
      if (!bld || !fl) return;

      const roomNum = `${fl.level}0${fl.rooms.length + 1}`;
      const roomId = `rm-${buildingId}-${roomNum}`;
      const newRoom: EditorRoom = {
        id: roomId,
        number: roomNum,
        name: `Аудитория ${roomNum}`,
        kind: 'classroom',
        capacity: 30,
        localCenter: [customLocalX ?? 0, customLocalZ ?? 0],
        size: [8, 6],
        provenance: 'demo',
      };
      const next = addRoomToDoc(doc, buildingId, floorId, newRoom);
      applyMutation(`Добавлена комната ${roomNum}`, next);
      setSelection({ type: 'room', buildingId, floorId, roomId });
      setTool('select');
    },
    [doc, applyMutation],
  );

  const handleDeleteRoom = useCallback(
    (buildingId: string, floorId: string, roomId: string) => {
      if (!doc) return;
      const bld = doc.buildings.find((b) => b.id === buildingId);
      const fl = bld?.floors.find((f) => f.id === floorId);
      const rm = fl?.rooms.find((r) => r.id === roomId);
      if (!rm) return;

      const next = removeRoomFromDoc(doc, buildingId, floorId, roomId);
      applyMutation(`Удалено помещение ${rm.number}`, next);
      setSelection({ type: 'floor', buildingId, floorId });
    },
    [doc, applyMutation],
  );

  // Canvas Click Add Dispatcher
  const handleCanvasClickAdd = useCallback(
    (wx: number, wz: number) => {
      if (tool === 'add-building') {
        handleAddBuilding(wx, wz);
      } else if (tool === 'add-room') {
        if (!selection.buildingId) {
          alert('Сначала выберите здание, в которое необходимо добавить помещение.');
          return;
        }
        const bld = doc?.buildings.find((b) => b.id === selection.buildingId);
        if (!bld) return;
        const flId = selection.floorId || bld.floors[0]?.id;
        if (!flId) return;

        const localX = wx - bld.footprint.center[0];
        const localZ = wz - bld.footprint.center[1];
        handleAddRoom(bld.id, flId, localX, localZ);
      }
    },
    [tool, selection, doc, handleAddBuilding, handleAddRoom],
  );

  // Versions Management
  const handleCreateNamedVersion = async (name: string, reason: string) => {
    if (!doc) return;
    const newVer = await createNamedVersion(doc, name, reason, 'manual');
    setVersions((prev) => [newVer, ...prev]);
  };

  const handleRestoreVersion = async (ver: any) => {
    if (!doc) return;
    // Auto snapshot before restore
    await createNamedVersion(doc, `Автокопия перед восстановлением «${ver.name}»`, '', 'auto');
    const restoredDoc = cloneDocument(ver.document);
    await saveDraft(restoredDoc);

    const record = await createNamedVersion(
      restoredDoc,
      `Восстановлено из: ${ver.name}`,
      `Восстановление состояния от ${new Date(ver.timestamp).toLocaleString()}`,
      'manual',
    );

    setDoc(restoredDoc);
    setVersions((prev) => [record, ...prev]);
    history.current.clear();
    setIsDirty(false);
    setIsVersionsOpen(false);
    setSelection({ type: 'none' });
  };

  const handleDeleteVersion = async (versionId: string) => {
    const ok = await deleteVersion(versionId);
    if (ok) {
      setVersions((prev) => prev.filter((v) => v.id !== versionId));
    }
  };

  const handleResetToDefaults = async () => {
    if (doc) {
      await createNamedVersion(doc, 'Автокопия перед полным сбросом', '', 'auto');
    }
    const { doc: resetDoc, versions: resetVersions } = await resetToDefaults();
    setDoc(resetDoc);
    setVersions(resetVersions);
    history.current.clear();
    setIsDirty(false);
    setIsVersionsOpen(false);
    setSelection({ type: 'none' });
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
          backgroundColor: '#0f172a',
          color: '#94a3b8',
          fontSize: 16,
        }}
      >
        Загрузка редактора кампуса...
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
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
        onToolChange={setTool}
        onGridSnapChange={setGridSnap}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSave={handleSave}
        onOpenVersions={() => setIsVersionsOpen(true)}
        onZoomIn={() => setViewport((v) => ({ ...v, zoom: Math.min(60, v.zoom * 1.25) }))}
        onZoomOut={() => setViewport((v) => ({ ...v, zoom: Math.max(1, v.zoom * 0.8) }))}
        onResetView={() => setViewport({ pan: { x: 500, y: 350 }, zoom: 6 })}
        onBackTo3D={handleBackTo3D}
      />

      {/* 2. MAIN WORKSPACE (LEFT PANEL + SVG CANVAS + RIGHT PANEL) */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <EditorLeftPanel
          doc={doc}
          selection={selection}
          onSelectionChange={setSelection}
          onAddBuilding={() => handleAddBuilding()}
          onDeleteBuilding={handleDeleteBuilding}
          onAddFloor={handleAddFloor}
          onDeleteFloor={handleDeleteFloor}
          onAddRoom={handleAddRoom}
          onDeleteRoom={handleDeleteRoom}
        />

        <main style={{ flex: 1, position: 'relative', minWidth: 0, height: '100%' }}>
          <EditorCanvas
            doc={doc}
            selection={selection}
            tool={tool}
            viewport={viewport}
            gridSnap={gridSnap}
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
            onCanvasClickAdd={handleCanvasClickAdd}
          />
        </main>

        <EditorRightPanel
          doc={doc}
          selection={selection}
          issues={issues}
          onSelectionChange={setSelection}
          onUpdateBuildingProps={(bldId, patch, action) => {
            const next = updateBuildingPropsInDoc(doc, bldId, patch);
            applyMutation(action, next);
          }}
          onUpdateBuildingFootprint={(bldId, center, size, action) => {
            const next = updateBuildingFootprint(doc, bldId, center, size);
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
          onDeleteBuilding={handleDeleteBuilding}
          onDeleteRoom={handleDeleteRoom}
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
