import React, { useState } from 'react';
import type { RoomKind } from '../../domain/campus/types';
import { CHANGE_CATEGORY_LABELS } from '../changeTracking/changeTracker';
import type {
  EditorBuilding,
  EditorDocument,
  EditorFloor,
  EditorLayerId,
  EditorOutdoorElement,
  EditorRoom,
  EditorSelection,
  ExportReferenceScope,
  IndoorElementType,
  OutdoorElementType,
  PhotoAttachment,
  SemanticChange,
  ValidationIssue,
} from '../domain/types';
import type { PhotoTargetSpec } from '../history/commands';
import { PhotoAttachmentsSection } from './PhotoAttachmentsSection';

interface EditorRightPanelProps {
  doc: EditorDocument;
  selection: EditorSelection;
  issues: ValidationIssue[];
  changes?: SemanticChange[];
  referenceScope?: ExportReferenceScope;
  onReferenceScopeChange?: (scope: ExportReferenceScope) => void;
  onSelectionChange: (sel: EditorSelection) => void;
  onUpdateCampusProps?: (
    patch: Partial<Pick<EditorDocument, 'name' | 'description' | 'aiComment'>>,
    actionName: string,
  ) => void;
  onUpdateBuildingProps: (
    buildingId: string,
    patch: Partial<Omit<EditorBuilding, 'id' | 'floors'>>,
    actionName: string,
  ) => void;
  onUpdateBuildingFootprint: (
    buildingId: string,
    center: [number, number],
    size: [number, number],
    actionName: string,
  ) => void;
  onUpdateFloorProps?: (
    buildingId: string,
    floorId: string,
    patch: Partial<Omit<EditorFloor, 'id' | 'rooms'>>,
    actionName: string,
  ) => void;
  onUpdateRoomProps: (
    buildingId: string,
    floorId: string,
    roomId: string,
    patch: Partial<Omit<EditorRoom, 'id'>>,
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
  onUpdateOutdoorElement?: (
    outdoorId: string,
    patch: Partial<Omit<EditorOutdoorElement, 'id'>>,
    actionName: string,
  ) => void;
  onAddPhotos?: (spec: PhotoTargetSpec, newPhotos: PhotoAttachment[], actionName: string) => void;
  onUpdatePhoto?: (
    spec: PhotoTargetSpec,
    photoId: string,
    patch: Partial<Omit<PhotoAttachment, 'id' | 'fileId'>>,
    actionName: string,
  ) => void;
  onReorderPhoto?: (
    spec: PhotoTargetSpec,
    photoId: string,
    direction: 'up' | 'down',
    actionName: string,
  ) => void;
  onRemovePhoto?: (spec: PhotoTargetSpec, photoId: string, actionName: string) => void;
  onDuplicateBuilding?: (buildingId: string) => void;
  onDuplicateRoom?: (buildingId: string, floorId: string, roomId: string) => void;
  onDuplicateOutdoor?: (outdoorId: string) => void;
  onDeleteBuilding: (buildingId: string) => void;
  onDeleteRoom: (buildingId: string, floorId: string, roomId: string) => void;
  onDeleteOutdoor?: (outdoorId: string) => void;
  onRevertChange?: (change: SemanticChange) => void;
  onExportZip?: () => void;
}

const INDOOR_ELEMENT_TYPES: { label: string; value: IndoorElementType }[] = [
  { label: '🏫 Room / Classroom', value: 'room' },
  { label: '🚶 Corridor / Passage', value: 'corridor' },
  { label: '🏛️ Hall / Auditorium', value: 'hall' },
  { label: '🛋️ Lobby / Foyer', value: 'lobby' },
  { label: '🚪 Door', value: 'door' },
  { label: '🪟 Window', value: 'window' },
  { label: '🪜 Stairs / Staircase', value: 'stairs' },
  { label: '🛗 Elevator', value: 'elevator' },
  { label: '🚩 Entrance', value: 'entrance' },
  { label: '🏃 Exit', value: 'exit' },
  { label: '🧱 Wall (Structural)', value: 'wall' },
  { label: '📏 Partition / Divider', value: 'partition' },
  { label: '📦 Custom Object', value: 'custom' },
];

const ROOM_KINDS: { label: string; value: RoomKind }[] = [
  { label: 'Classroom (Аудитория)', value: 'classroom' },
  { label: 'Laboratory (Лаборатория)', value: 'lab' },
  { label: 'Office / Faculty (Офис)', value: 'office' },
  { label: 'Hall / Common Space (Зал)', value: 'hall' },
  { label: 'Other / Service (Прочее)', value: 'other' },
];

const OUTDOOR_TYPES: { label: string; value: OutdoorElementType; layer: EditorLayerId }[] = [
  { label: '🚶 Pedestrian Path / Sidewalk', value: 'path', layer: 'paths' },
  { label: '🌉 Connecting Walkway', value: 'walkway', layer: 'paths' },
  { label: '🛣️ Road / Driveway', value: 'road', layer: 'paths' },
  { label: '🌿 Green Area / Lawn', value: 'lawn', layer: 'greenery' },
  { label: '🌳 Tree / Vegetation', value: 'tree', layer: 'greenery' },
  { label: '🏟️ Plaza / Open Space / Court', value: 'plaza', layer: 'infrastructure' },
  { label: '⛲ Fountain / Water Feature', value: 'fountain', layer: 'infrastructure' },
  { label: '⛩️ Campus Entrance / Gate', value: 'entrance', layer: 'infrastructure' },
  { label: '📍 Custom Outdoor Object', value: 'custom', layer: 'annotations' },
];

export const EditorRightPanel: React.FC<EditorRightPanelProps> = ({
  doc,
  selection,
  issues,
  changes = [],
  referenceScope = 'all',
  onReferenceScopeChange,
  onSelectionChange,
  onUpdateCampusProps,
  onUpdateBuildingProps,
  onUpdateBuildingFootprint,
  onUpdateFloorProps,
  onUpdateRoomProps,
  onUpdateRoomGeometry,
  onUpdateOutdoorElement,
  onAddPhotos,
  onUpdatePhoto,
  onReorderPhoto,
  onRemovePhoto,
  onDuplicateBuilding,
  onDuplicateRoom,
  onDuplicateOutdoor,
  onDeleteBuilding,
  onDeleteRoom,
  onDeleteOutdoor,
  onRevertChange,
  onExportZip,
}) => {
  const [showPreciseCoords, setShowPreciseCoords] = useState(false);
  const [metaKey, setMetaKey] = useState('');
  const [metaVal, setMetaVal] = useState('');

  const selectedBuilding: EditorBuilding | undefined = doc.buildings.find(
    (b) => b.id === selection.buildingId,
  );
  const selectedFloor: EditorFloor | undefined = selectedBuilding?.floors.find(
    (f) => f.id === selection.floorId,
  );
  const selectedRoom: EditorRoom | undefined = selectedFloor?.rooms.find(
    (r) => r.id === selection.roomId,
  );
  const selectedOutdoor: EditorOutdoorElement | undefined = (doc.outdoorElements ?? []).find(
    (el) => el.id === selection.outdoorId,
  );

  const activeTargetId =
    selectedRoom?.id ?? selectedOutdoor?.id ?? selectedBuilding?.id ?? undefined;
  const activeChange = activeTargetId
    ? changes.find((c) => c.targetId === activeTargetId)
    : undefined;

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    backgroundColor: '#ffffff',
    border: '1px solid #cbd5e1',
    borderRadius: 6,
    padding: '6px 9px',
    fontSize: 12,
    color: '#0f172a',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#475569',
    fontWeight: 600,
    marginBottom: 4,
    display: 'block',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    gap: 8,
    marginBottom: 10,
  };

  const actionBtnStyle: React.CSSProperties = {
    flex: 1,
    padding: '7px 10px',
    backgroundColor: '#f8fafc',
    border: '1px solid #cbd5e1',
    color: '#0f172a',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  };

  const renderMetadataSection = (
    metadata: Record<string, string> | undefined,
    onUpdateMeta: (nextMeta: Record<string, string>) => void,
  ) => {
    const entries = Object.entries(metadata || {});
    return (
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
        <label style={labelStyle}>Custom Metadata (Optional)</label>
        {entries.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
            {entries.map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#f8fafc',
                  padding: '3px 8px',
                  borderRadius: 5,
                  border: '1px solid #e2e8f0',
                  fontSize: 11,
                }}
              >
                <span>
                  <strong>{k}:</strong> {v}
                </span>
                <button
                  onClick={() => {
                    const copy = { ...(metadata || {}) };
                    delete copy[k];
                    onUpdateMeta(copy);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#dc2626',
                    cursor: 'pointer',
                    fontSize: 11,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            type="text"
            placeholder="Key (e.g. floor_finish)"
            value={metaKey}
            onChange={(e) => setMetaKey(e.target.value)}
            style={{ ...inputStyle, flex: 1, padding: '4px 6px', fontSize: 11 }}
          />
          <input
            type="text"
            placeholder="Value"
            value={metaVal}
            onChange={(e) => setMetaVal(e.target.value)}
            style={{ ...inputStyle, flex: 1, padding: '4px 6px', fontSize: 11 }}
          />
          <button
            onClick={() => {
              if (!metaKey.trim()) return;
              onUpdateMeta({ ...(metadata || {}), [metaKey.trim()]: metaVal.trim() });
              setMetaKey('');
              setMetaVal('');
            }}
            style={{
              padding: '4px 8px',
              backgroundColor: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: 5,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            +
          </button>
        </div>
      </div>
    );
  };

  return (
    <aside
      style={{
        width: 330,
        height: '100%',
        backgroundColor: '#ffffff',
        borderLeft: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflowY: 'auto',
        color: '#0f172a',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #e2e8f0',
          backgroundColor: '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', letterSpacing: '0.03em' }}>
          {selectedRoom
            ? 'INDOOR ELEMENT PROPERTIES'
            : selectedOutdoor
              ? 'OUTDOOR ELEMENT PROPERTIES'
              : selectedBuilding
                ? 'BUILDING PROPERTIES'
                : 'CAMPUS OVERVIEW & AI EXPORT'}
        </span>
        {activeChange && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 4,
              backgroundColor: CHANGE_CATEGORY_LABELS[activeChange.primaryCategory].bgColor,
              color: CHANGE_CATEGORY_LABELS[activeChange.primaryCategory].color,
              border: `1px solid ${CHANGE_CATEGORY_LABELS[activeChange.primaryCategory].borderColor}`,
            }}
          >
            {CHANGE_CATEGORY_LABELS[activeChange.primaryCategory].shortBadge}
          </span>
        )}
      </div>

      <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 1. INDOOR ELEMENT / ROOM SELECTED */}
        {selectedRoom && selectedBuilding && selectedFloor ? (
          <div>
            <div
              style={{
                fontSize: 11,
                color: '#475569',
                backgroundColor: '#f8fafc',
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid #e2e8f0',
                marginBottom: 12,
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>
                📍 <strong>{selectedBuilding.shortName || selectedBuilding.name}</strong> • Floor{' '}
                {selectedFloor.level}
              </span>
              <span style={{ color: '#64748b' }}>ID: {selectedRoom.id}</span>
            </div>

            <div style={rowStyle}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Code / Number</label>
                <input
                  type="text"
                  value={selectedRoom.number}
                  onChange={(e) =>
                    onUpdateRoomProps(
                      selectedBuilding.id,
                      selectedFloor.id,
                      selectedRoom.id,
                      { number: e.target.value },
                      'Rename element number',
                    )
                  }
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 2 }}>
                <label style={labelStyle}>Name / Label</label>
                <input
                  type="text"
                  value={selectedRoom.name || ''}
                  placeholder="e.g. Physics Lab, Main Lobby"
                  onChange={(e) =>
                    onUpdateRoomProps(
                      selectedBuilding.id,
                      selectedFloor.id,
                      selectedRoom.id,
                      { name: e.target.value },
                      'Rename element',
                    )
                  }
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={rowStyle}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Semantic Element Type</label>
                <select
                  value={selectedRoom.elementType || 'room'}
                  onChange={(e) => {
                    const newElType = e.target.value as IndoorElementType;
                    const mappedKind: RoomKind =
                      newElType === 'hall' || newElType === 'lobby'
                        ? 'hall'
                        : newElType === 'room'
                          ? selectedRoom.kind
                          : 'other';
                    onUpdateRoomProps(
                      selectedBuilding.id,
                      selectedFloor.id,
                      selectedRoom.id,
                      { elementType: newElType, kind: mappedKind },
                      'Change semantic element type',
                    );
                  }}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  {INDOOR_ELEMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {(!selectedRoom.elementType || selectedRoom.elementType === 'room') && (
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Room Category</label>
                  <select
                    value={selectedRoom.kind}
                    onChange={(e) =>
                      onUpdateRoomProps(
                        selectedBuilding.id,
                        selectedFloor.id,
                        selectedRoom.id,
                        { kind: e.target.value as RoomKind },
                        'Change room category',
                      )
                    }
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    {ROOM_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Description (Optional)</label>
              <input
                type="text"
                value={selectedRoom.description || ''}
                placeholder="Short description or equipment notes..."
                onChange={(e) =>
                  onUpdateRoomProps(
                    selectedBuilding.id,
                    selectedFloor.id,
                    selectedRoom.id,
                    { description: e.target.value },
                    'Update room description',
                  )
                }
                style={inputStyle}
              />
            </div>

            {/* Dedicated Instructions for AI field */}
            <div
              style={{
                marginBottom: 12,
                padding: 10,
                backgroundColor: '#f5f3ff',
                border: '1px solid #ddd6fe',
                borderRadius: 7,
              }}
            >
              <label style={{ ...labelStyle, color: '#5b21b6', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span>💬 Instructions for AI</span>
              </label>
              <textarea
                rows={3}
                value={selectedRoom.aiComment || ''}
                placeholder='e.g. "Extend the lobby toward the corridor, preserve the existing entrance, and use the remaining area for two classrooms."'
                onChange={(e) =>
                  onUpdateRoomProps(
                    selectedBuilding.id,
                    selectedFloor.id,
                    selectedRoom.id,
                    { aiComment: e.target.value },
                    'Update AI instructions',
                  )
                }
                style={{
                  ...inputStyle,
                  backgroundColor: '#ffffff',
                  borderColor: '#c4b5fd',
                  resize: 'vertical',
                  fontSize: 12,
                }}
              />
              <div style={{ fontSize: 10, color: '#6d28d9', marginTop: 4 }}>
                Attached to <code>{selectedRoom.id}</code> and exported in <code>instructions.md</code> &amp; <code>changes.json</code>.
              </div>
            </div>

            {/* Shape & Polygon Reshape Toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                marginBottom: 10,
                fontSize: 12,
              }}
            >
              <span>
                Dimensions:{' '}
                <strong>
                  {selectedRoom.size[0].toFixed(1)}m × {selectedRoom.size[1].toFixed(1)}m
                </strong>
              </span>
              <button
                onClick={() => {
                  if (selectedRoom.polygon && selectedRoom.polygon.length >= 3) {
                    onUpdateRoomProps(
                      selectedBuilding.id,
                      selectedFloor.id,
                      selectedRoom.id,
                      { shape: 'rect', polygon: undefined },
                      'Convert polygon to rectangle',
                    );
                  } else {
                    const [cx, cz] = selectedRoom.localCenter;
                    const [w, d] = selectedRoom.size;
                    const poly: [number, number][] = [
                      [Number((cx - w / 2).toFixed(2)), Number((cz - d / 2).toFixed(2))],
                      [Number((cx + w / 2).toFixed(2)), Number((cz - d / 2).toFixed(2))],
                      [Number((cx + w / 2).toFixed(2)), Number((cz + d / 2).toFixed(2))],
                      [Number((cx - w / 2).toFixed(2)), Number((cz + d / 2).toFixed(2))],
                    ];
                    onUpdateRoomProps(
                      selectedBuilding.id,
                      selectedFloor.id,
                      selectedRoom.id,
                      { shape: 'polygon', polygon: poly },
                      'Enable polygon vertex reshaping',
                    );
                  }
                }}
                style={{
                  padding: '3px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: 5,
                  cursor: 'pointer',
                }}
              >
                {selectedRoom.polygon && selectedRoom.polygon.length >= 3
                  ? '▭ Reset to Box'
                  : '⬠ Reshape Corners'}
              </button>
            </div>

            {/* Optional Precise Numerical Editing */}
            <div style={{ marginBottom: 10 }}>
              <button
                onClick={() => setShowPreciseCoords((p) => !p)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#475569',
                  cursor: 'pointer',
                }}
              >
                {showPreciseCoords ? '▼ Hide Precise Dimensions & Coordinates' : '▶ Precise Dimensions & Coordinates (Optional)'}
              </button>

              {showPreciseCoords && (
                <div
                  style={{
                    marginTop: 8,
                    padding: 10,
                    backgroundColor: '#f8fafc',
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <div style={rowStyle}>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Width W (m)</label>
                      <input
                        type="number"
                        step="0.25"
                        min="0.2"
                        value={selectedRoom.size[0]}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val >= 0.2) {
                            onUpdateRoomGeometry(
                              selectedBuilding.id,
                              selectedFloor.id,
                              selectedRoom.id,
                              selectedRoom.localCenter,
                              [val, selectedRoom.size[1]],
                              'Resize width',
                            );
                          }
                        }}
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Depth D (m)</label>
                      <input
                        type="number"
                        step="0.25"
                        min="0.2"
                        value={selectedRoom.size[1]}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val >= 0.2) {
                            onUpdateRoomGeometry(
                              selectedBuilding.id,
                              selectedFloor.id,
                              selectedRoom.id,
                              selectedRoom.localCenter,
                              [selectedRoom.size[0], val],
                              'Resize depth',
                            );
                          }
                        }}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div style={{ ...rowStyle, marginBottom: 0 }}>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Local X (m)</label>
                      <input
                        type="number"
                        step="0.25"
                        value={selectedRoom.localCenter[0]}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) {
                            onUpdateRoomGeometry(
                              selectedBuilding.id,
                              selectedFloor.id,
                              selectedRoom.id,
                              [val, selectedRoom.localCenter[1]],
                              selectedRoom.size,
                              'Move X',
                            );
                          }
                        }}
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Local Z (m)</label>
                      <input
                        type="number"
                        step="0.25"
                        value={selectedRoom.localCenter[1]}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) {
                            onUpdateRoomGeometry(
                              selectedBuilding.id,
                              selectedFloor.id,
                              selectedRoom.id,
                              [selectedRoom.localCenter[0], val],
                              selectedRoom.size,
                              'Move Z',
                            );
                          }
                        }}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {onAddPhotos && onUpdatePhoto && onReorderPhoto && onRemovePhoto && (
              <PhotoAttachmentsSection
                targetLabel={`${selectedBuilding.shortName || selectedBuilding.name}, Floor ${selectedFloor.level}, ${selectedRoom.name || selectedRoom.number}`}
                targetSpec={{
                  targetType: 'room',
                  buildingId: selectedBuilding.id,
                  floorId: selectedFloor.id,
                  roomId: selectedRoom.id,
                }}
                photos={selectedRoom.photos}
                onAddPhotos={onAddPhotos}
                onUpdatePhoto={onUpdatePhoto}
                onReorderPhoto={onReorderPhoto}
                onRemovePhoto={onRemovePhoto}
              />
            )}

            {renderMetadataSection(selectedRoom.customMetadata, (customMetadata) =>
              onUpdateRoomProps(
                selectedBuilding.id,
                selectedFloor.id,
                selectedRoom.id,
                { customMetadata },
                'Update room metadata',
              ),
            )}

            {/* Action Buttons: Duplicate, Revert, Delete */}
            <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
              {onDuplicateRoom && (
                <button
                  onClick={() =>
                    onDuplicateRoom(selectedBuilding.id, selectedFloor.id, selectedRoom.id)
                  }
                  style={actionBtnStyle}
                  title="Duplicate this element (Ctrl+D)"
                >
                  ⧉ Duplicate
                </button>
              )}
              {activeChange && onRevertChange && (
                <button
                  onClick={() => onRevertChange(activeChange)}
                  style={{
                    ...actionBtnStyle,
                    backgroundColor: '#fffbeb',
                    borderColor: '#fde68a',
                    color: '#92400e',
                  }}
                  title="Revert this element to its original state"
                >
                  ↶ Revert
                </button>
              )}
              <button
                onClick={() => onDeleteRoom(selectedBuilding.id, selectedFloor.id, selectedRoom.id)}
                style={{
                  ...actionBtnStyle,
                  backgroundColor: '#fef2f2',
                  borderColor: '#fecaca',
                  color: '#dc2626',
                }}
              >
                🗑 Delete
              </button>
            </div>
          </div>
        ) : selectedOutdoor ? (
          /* 2. OUTDOOR ELEMENT SELECTED */
          <div>
            <div
              style={{
                fontSize: 11,
                color: '#475569',
                backgroundColor: '#f8fafc',
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid #e2e8f0',
                marginBottom: 12,
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>🌍 Layer: <strong>{selectedOutdoor.layer}</strong></span>
              <span style={{ color: '#64748b' }}>ID: {selectedOutdoor.id}</span>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Name / Label</label>
              <input
                type="text"
                value={selectedOutdoor.name}
                onChange={(e) =>
                  onUpdateOutdoorElement?.(
                    selectedOutdoor.id,
                    { name: e.target.value },
                    'Rename outdoor element',
                  )
                }
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Outdoor Element Type</label>
              <select
                value={selectedOutdoor.type}
                onChange={(e) => {
                  const found = OUTDOOR_TYPES.find((o) => o.value === e.target.value);
                  onUpdateOutdoorElement?.(
                    selectedOutdoor.id,
                    {
                      type: e.target.value as OutdoorElementType,
                      layer: found ? found.layer : selectedOutdoor.layer,
                    },
                    'Change outdoor element type',
                  );
                }}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {OUTDOOR_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {(selectedOutdoor.shape === 'polyline' ||
              selectedOutdoor.type === 'path' ||
              selectedOutdoor.type === 'road' ||
              selectedOutdoor.type === 'walkway') && (
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>
                  Path / Road Width: <strong>{(selectedOutdoor.width ?? 3.5).toFixed(1)} m</strong>
                </label>
                <input
                  type="range"
                  min="1"
                  max="18"
                  step="0.5"
                  value={selectedOutdoor.width ?? 3.5}
                  onChange={(e) =>
                    onUpdateOutdoorElement?.(
                      selectedOutdoor.id,
                      { width: parseFloat(e.target.value) },
                      'Adjust path width',
                    )
                  }
                  style={{ width: '100%' }}
                />
              </div>
            )}

            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Description</label>
              <input
                type="text"
                value={selectedOutdoor.description || ''}
                placeholder="Surface material, landscaping notes..."
                onChange={(e) =>
                  onUpdateOutdoorElement?.(
                    selectedOutdoor.id,
                    { description: e.target.value },
                    'Update outdoor description',
                  )
                }
                style={inputStyle}
              />
            </div>

            {/* Instructions for AI */}
            <div
              style={{
                marginBottom: 12,
                padding: 10,
                backgroundColor: '#f5f3ff',
                border: '1px solid #ddd6fe',
                borderRadius: 7,
              }}
            >
              <label style={{ ...labelStyle, color: '#5b21b6' }}>💬 Instructions for AI</label>
              <textarea
                rows={3}
                value={selectedOutdoor.aiComment || ''}
                placeholder='e.g. "Add a tree-lined pedestrian walkway connecting Block A entrance to the central fountain plaza."'
                onChange={(e) =>
                  onUpdateOutdoorElement?.(
                    selectedOutdoor.id,
                    { aiComment: e.target.value },
                    'Update outdoor AI instructions',
                  )
                }
                style={{
                  ...inputStyle,
                  backgroundColor: '#ffffff',
                  borderColor: '#c4b5fd',
                  resize: 'vertical',
                }}
              />
            </div>

            {onAddPhotos && onUpdatePhoto && onReorderPhoto && onRemovePhoto && (
              <PhotoAttachmentsSection
                targetLabel={`Outdoor · ${selectedOutdoor.name}`}
                targetSpec={{
                  targetType: 'outdoor',
                  outdoorId: selectedOutdoor.id,
                }}
                photos={selectedOutdoor.photos}
                onAddPhotos={onAddPhotos}
                onUpdatePhoto={onUpdatePhoto}
                onReorderPhoto={onReorderPhoto}
                onRemovePhoto={onRemovePhoto}
              />
            )}

            {/* Polygon vertex editing toggle for rectangular outdoor areas */}
            {selectedOutdoor.shape !== 'polyline' && selectedOutdoor.shape !== 'point' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  marginBottom: 10,
                  fontSize: 12,
                }}
              >
                <span>
                  Size: <strong>{selectedOutdoor.size[0].toFixed(1)}m × {selectedOutdoor.size[1].toFixed(1)}m</strong>
                </span>
                <button
                  onClick={() => {
                    if (selectedOutdoor.shape === 'polygon') {
                      onUpdateOutdoorElement?.(
                        selectedOutdoor.id,
                        { shape: 'rect', points: undefined },
                        'Reset outdoor area to rectangle',
                      );
                    } else {
                      const [cx, cz] = selectedOutdoor.center;
                      const [w, d] = selectedOutdoor.size;
                      onUpdateOutdoorElement?.(
                        selectedOutdoor.id,
                        {
                          shape: 'polygon',
                          points: [
                            [Number((cx - w / 2).toFixed(2)), Number((cz - d / 2).toFixed(2))],
                            [Number((cx + w / 2).toFixed(2)), Number((cz - d / 2).toFixed(2))],
                            [Number((cx + w / 2).toFixed(2)), Number((cz + d / 2).toFixed(2))],
                            [Number((cx - w / 2).toFixed(2)), Number((cz + d / 2).toFixed(2))],
                          ],
                        },
                        'Convert outdoor area to editable polygon',
                      );
                    }
                  }}
                  style={{
                    padding: '3px 8px',
                    fontSize: 11,
                    fontWeight: 600,
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: 5,
                    cursor: 'pointer',
                  }}
                >
                  {selectedOutdoor.shape === 'polygon' ? '▭ Reset to Box' : '⬠ Edit Vertices'}
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              {onDuplicateOutdoor && (
                <button
                  onClick={() => onDuplicateOutdoor(selectedOutdoor.id)}
                  style={actionBtnStyle}
                >
                  ⧉ Duplicate
                </button>
              )}
              {activeChange && onRevertChange && (
                <button
                  onClick={() => onRevertChange(activeChange)}
                  style={{
                    ...actionBtnStyle,
                    backgroundColor: '#fffbeb',
                    borderColor: '#fde68a',
                    color: '#92400e',
                  }}
                >
                  ↶ Revert
                </button>
              )}
              {onDeleteOutdoor && (
                <button
                  onClick={() => onDeleteOutdoor(selectedOutdoor.id)}
                  style={{
                    ...actionBtnStyle,
                    backgroundColor: '#fef2f2',
                    borderColor: '#fecaca',
                    color: '#dc2626',
                  }}
                >
                  🗑 Delete
                </button>
              )}
            </div>
          </div>
        ) : selectedBuilding ? (
          /* 3. BUILDING (OR SPECIFIC FLOOR) SELECTED */
          <div>
            {/* Prominent Floor Selector CTA */}
            <div
              style={{
                padding: 10,
                backgroundColor: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                OPEN FLOOR PLAN (2D INTERIOR EDITOR)
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {selectedBuilding.floors.map((fl) => {
                  const isFloorOpen = selection.floorId === fl.id;
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
                        padding: '5px 10px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        backgroundColor: isFloorOpen ? '#18181b' : '#ffffff',
                        color: isFloorOpen ? '#ffffff' : '#0f172a',
                        border: '1px solid #cbd5e1',
                        cursor: 'pointer',
                      }}
                    >
                      {fl.level === 1 ? 'Ground / Floor 1' : `Floor ${fl.level}`} ({fl.rooms.length})
                      {(fl.photos ?? []).length > 0 ? ` · 📷${fl.photos!.length}` : ''}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Floor Reference Photos & AI Notes when a floor is active */}
            {selectedFloor && (
              <div
                style={{
                  padding: 10,
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  marginBottom: 12,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                  ACTIVE FLOOR: {selectedFloor.name} (Level {selectedFloor.level})
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={labelStyle}>Floor Instructions for AI (optional)</label>
                  <textarea
                    rows={2}
                    value={selectedFloor.aiComment || ''}
                    placeholder='e.g. "Match this floor plan to the uploaded architectural drawing photo."'
                    onChange={(e) =>
                      onUpdateFloorProps?.(
                        selectedBuilding.id,
                        selectedFloor.id,
                        { aiComment: e.target.value },
                        `Update Floor ${selectedFloor.level} AI instructions`,
                      )
                    }
                    style={{
                      ...inputStyle,
                      backgroundColor: '#ffffff',
                      resize: 'vertical',
                    }}
                  />
                </div>
                {onAddPhotos && onUpdatePhoto && onReorderPhoto && onRemovePhoto && (
                  <PhotoAttachmentsSection
                    targetLabel={`${selectedBuilding.shortName || selectedBuilding.name} · Floor ${selectedFloor.level}`}
                    targetSpec={{
                      targetType: 'floor',
                      buildingId: selectedBuilding.id,
                      floorId: selectedFloor.id,
                    }}
                    photos={selectedFloor.photos}
                    onAddPhotos={onAddPhotos}
                    onUpdatePhoto={onUpdatePhoto}
                    onReorderPhoto={onReorderPhoto}
                    onRemovePhoto={onRemovePhoto}
                  />
                )}
              </div>
            )}

            <div style={rowStyle}>
              <div style={{ flex: 2 }}>
                <label style={labelStyle}>Building Name</label>
                <input
                  type="text"
                  value={selectedBuilding.name}
                  onChange={(e) =>
                    onUpdateBuildingProps(
                      selectedBuilding.id,
                      { name: e.target.value },
                      'Rename building',
                    )
                  }
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Short Code</label>
                <input
                  type="text"
                  value={selectedBuilding.shortName || ''}
                  onChange={(e) =>
                    onUpdateBuildingProps(
                      selectedBuilding.id,
                      { shortName: e.target.value },
                      'Update building short code',
                    )
                  }
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Description</label>
              <textarea
                rows={2}
                value={selectedBuilding.description || ''}
                onChange={(e) =>
                  onUpdateBuildingProps(
                    selectedBuilding.id,
                    { description: e.target.value },
                    'Update building description',
                  )
                }
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            {/* Instructions for AI */}
            <div
              style={{
                marginBottom: 12,
                padding: 10,
                backgroundColor: '#f5f3ff',
                border: '1px solid #ddd6fe',
                borderRadius: 7,
              }}
            >
              <label style={{ ...labelStyle, color: '#5b21b6' }}>💬 Instructions for AI</label>
              <textarea
                rows={3}
                value={selectedBuilding.aiComment || ''}
                placeholder='e.g. "Align the south facade with the main promenade and add a central atrium on Floor 1."'
                onChange={(e) =>
                  onUpdateBuildingProps(
                    selectedBuilding.id,
                    { aiComment: e.target.value },
                    'Update building AI instructions',
                  )
                }
                style={{
                  ...inputStyle,
                  backgroundColor: '#ffffff',
                  borderColor: '#c4b5fd',
                  resize: 'vertical',
                }}
              />
            </div>

            {/* Building-level Photo Attachments */}
            {onAddPhotos && onUpdatePhoto && onReorderPhoto && onRemovePhoto && (
              <PhotoAttachmentsSection
                targetLabel={`Building · ${selectedBuilding.name} (${selectedBuilding.shortName || selectedBuilding.id})`}
                targetSpec={{
                  targetType: 'building',
                  buildingId: selectedBuilding.id,
                }}
                photos={selectedBuilding.photos}
                onAddPhotos={onAddPhotos}
                onUpdatePhoto={onUpdatePhoto}
                onReorderPhoto={onReorderPhoto}
                onRemovePhoto={onRemovePhoto}
              />
            )}

            {/* Optional Numerical Footprint Editing */}
            <div style={{ marginBottom: 10 }}>
              <button
                onClick={() => setShowPreciseCoords((p) => !p)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#475569',
                  cursor: 'pointer',
                }}
              >
                {showPreciseCoords
                  ? '▼ Hide Precise Footprint Dimensions'
                  : `▶ Footprint: ${selectedBuilding.footprint.size[0]}m × ${selectedBuilding.footprint.size[1]}m (Edit Numerically)`}
              </button>

              {showPreciseCoords && (
                <div
                  style={{
                    marginTop: 8,
                    padding: 10,
                    backgroundColor: '#f8fafc',
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <div style={rowStyle}>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Width W (m)</label>
                      <input
                        type="number"
                        step="0.5"
                        min="2"
                        value={selectedBuilding.footprint.size[0]}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val >= 2) {
                            onUpdateBuildingFootprint(
                              selectedBuilding.id,
                              selectedBuilding.footprint.center,
                              [val, selectedBuilding.footprint.size[1]],
                              'Resize building width',
                            );
                          }
                        }}
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Depth D (m)</label>
                      <input
                        type="number"
                        step="0.5"
                        min="2"
                        value={selectedBuilding.footprint.size[1]}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val >= 2) {
                            onUpdateBuildingFootprint(
                              selectedBuilding.id,
                              selectedBuilding.footprint.center,
                              [selectedBuilding.footprint.size[0], val],
                              'Resize building depth',
                            );
                          }
                        }}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <div style={{ ...rowStyle, marginBottom: 0 }}>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>World X (m)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={selectedBuilding.footprint.center[0]}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) {
                            onUpdateBuildingFootprint(
                              selectedBuilding.id,
                              [val, selectedBuilding.footprint.center[1]],
                              selectedBuilding.footprint.size,
                              'Move building X',
                            );
                          }
                        }}
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>World Z (m)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={selectedBuilding.footprint.center[1]}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) {
                            onUpdateBuildingFootprint(
                              selectedBuilding.id,
                              [selectedBuilding.footprint.center[0], val],
                              selectedBuilding.footprint.size,
                              'Move building Z',
                            );
                          }
                        }}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {renderMetadataSection(selectedBuilding.customMetadata, (customMetadata) =>
              onUpdateBuildingProps(
                selectedBuilding.id,
                { customMetadata },
                'Update building metadata',
              ),
            )}

            <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
              {onDuplicateBuilding && (
                <button
                  onClick={() => onDuplicateBuilding(selectedBuilding.id)}
                  style={actionBtnStyle}
                >
                  ⧉ Duplicate
                </button>
              )}
              {activeChange && onRevertChange && (
                <button
                  onClick={() => onRevertChange(activeChange)}
                  style={{
                    ...actionBtnStyle,
                    backgroundColor: '#fffbeb',
                    borderColor: '#fde68a',
                    color: '#92400e',
                  }}
                >
                  ↶ Revert
                </button>
              )}
              <button
                onClick={() => onDeleteBuilding(selectedBuilding.id)}
                style={{
                  ...actionBtnStyle,
                  backgroundColor: '#fef2f2',
                  borderColor: '#fecaca',
                  color: '#dc2626',
                }}
              >
                🗑 Delete
              </button>
            </div>
          </div>
        ) : (
          /* 4. NOTHING SELECTED — OVERALL CAMPUS SETTINGS, REFERENCE PHOTOS & EXPORT */
          <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.55 }}>
            {/* Overall Campus AI Instructions */}
            <div
              style={{
                marginBottom: 12,
                padding: 10,
                backgroundColor: '#f5f3ff',
                border: '1px solid #ddd6fe',
                borderRadius: 7,
              }}
            >
              <label style={{ ...labelStyle, color: '#5b21b6' }}>
                💬 Overall Campus Instructions for AI
              </label>
              <textarea
                rows={2}
                value={doc.aiComment || ''}
                placeholder='e.g. "Preserve the central symmetry of the campus plaza and align new walkways with the main gate."'
                onChange={(e) =>
                  onUpdateCampusProps?.(
                    { aiComment: e.target.value },
                    'Update campus AI instructions',
                  )
                }
                style={{
                  ...inputStyle,
                  backgroundColor: '#ffffff',
                  borderColor: '#c4b5fd',
                  resize: 'vertical',
                }}
              />
            </div>

            {/* Overall Campus Reference Photos */}
            {onAddPhotos && onUpdatePhoto && onReorderPhoto && onRemovePhoto && (
              <PhotoAttachmentsSection
                targetLabel={`Overall Campus (${doc.name})`}
                targetSpec={{ targetType: 'campus' }}
                photos={doc.photos}
                onAddPhotos={onAddPhotos}
                onUpdatePhoto={onUpdatePhoto}
                onReorderPhoto={onReorderPhoto}
                onRemovePhoto={onRemovePhoto}
              />
            )}

            <div
              style={{
                backgroundColor: '#f8fafc',
                padding: 12,
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                marginBottom: 12,
              }}
            >
              <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                Current Session Summary
              </div>
              <div>Buildings: <strong>{doc.buildings.length}</strong></div>
              <div>
                Indoor Spaces &amp; Elements:{' '}
                <strong>
                  {doc.buildings.reduce(
                    (acc, b) => acc + b.floors.reduce((facc, f) => facc + f.rooms.length, 0),
                    0,
                  )}
                </strong>
              </div>
              <div>Outdoor Elements: <strong>{(doc.outdoorElements ?? []).length}</strong></div>
              <div>Tracked Changes: <strong>{changes.length}</strong></div>
            </div>

            {/* Reference Export Scope Selector */}
            {onReferenceScopeChange && (
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  padding: 10,
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  marginBottom: 10,
                }}
              >
                <label style={{ ...labelStyle, marginBottom: 6 }}>
                  📷 Reference Photos Export Scope
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => onReferenceScopeChange('all')}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 6,
                      border:
                        referenceScope === 'all'
                          ? '1.5px solid #0f172a'
                          : '1px solid #cbd5e1',
                      backgroundColor: referenceScope === 'all' ? '#0f172a' : '#ffffff',
                      color: referenceScope === 'all' ? '#ffffff' : '#334155',
                      cursor: 'pointer',
                    }}
                  >
                    All References
                  </button>
                  <button
                    type="button"
                    onClick={() => onReferenceScopeChange('changed-only')}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 6,
                      border:
                        referenceScope === 'changed-only'
                          ? '1.5px solid #0f172a'
                          : '1px solid #cbd5e1',
                      backgroundColor:
                        referenceScope === 'changed-only' ? '#0f172a' : '#ffffff',
                      color: referenceScope === 'changed-only' ? '#ffffff' : '#334155',
                      cursor: 'pointer',
                    }}
                  >
                    Changed Objects Only
                  </button>
                </div>
              </div>
            )}

            {onExportZip && (
              <button
                onClick={onExportZip}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  backgroundColor: '#18181b',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 7,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ⬇ Export AI-Friendly ZIP Package
              </button>
            )}
          </div>
        )}

        {/* VALIDATION ISSUES LIST */}
        {issues.length > 0 && (
          <div
            style={{
              marginTop: 'auto',
              paddingTop: 12,
              borderTop: '1px solid #e2e8f0',
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: issues.some((i) => i.severity === 'error') ? '#dc2626' : '#d97706',
                display: 'block',
                marginBottom: 6,
              }}
            >
              VALIDATION CHECKS ({issues.length})
            </span>

            <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {issues.map((iss) => (
                <div
                  key={iss.id}
                  onClick={() => {
                    if (iss.targetType === 'building') {
                      onSelectionChange({ type: 'building', buildingId: iss.targetId });
                    } else if (iss.targetType === 'outdoor') {
                      onSelectionChange({ type: 'outdoor', outdoorId: iss.targetId });
                    } else if (iss.targetType === 'room') {
                      for (const b of doc.buildings) {
                        for (const f of b.floors) {
                          if (f.rooms.some((r) => r.id === iss.targetId)) {
                            onSelectionChange({
                              type: 'room',
                              buildingId: b.id,
                              floorId: f.id,
                              roomId: iss.targetId,
                            });
                            return;
                          }
                        }
                      }
                    }
                  }}
                  style={{
                    padding: '6px 8px',
                    borderRadius: 5,
                    fontSize: 11,
                    backgroundColor: iss.severity === 'error' ? '#fef2f2' : '#fffbeb',
                    border: `1px solid ${iss.severity === 'error' ? '#fecaca' : '#fde68a'}`,
                    color: iss.severity === 'error' ? '#b91c1c' : '#92400e',
                    cursor: 'pointer',
                  }}
                >
                  {iss.message}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
