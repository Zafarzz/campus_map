import React from 'react';
import type {
  EditorBuilding,
  EditorFloor,
  EditorLayerId,
  EditorSelection,
} from '../domain/types';
import { LAYER_BUTTON_ITEMS } from './canvasConstants';

interface EditorCanvasHeaderOverlayProps {
  selectedBuilding?: EditorBuilding;
  selection: EditorSelection;
  visibleLayers: Record<EditorLayerId, boolean>;
  isPointDrawTool: boolean;
  draftPointsCount: number;
  onSelectionChange: (sel: EditorSelection) => void;
  onToggleLayer?: (layer: EditorLayerId) => void;
  onAddFloor?: (buildingId: string) => void;
  onFinishPointDrawing: () => void;
  onCancelPointDrawing: () => void;
  onDuplicateSelected?: () => void;
  onDeleteSelected?: () => void;
}

export const EditorCanvasHeaderOverlay: React.FC<EditorCanvasHeaderOverlayProps> = ({
  selectedBuilding,
  selection,
  visibleLayers,
  isPointDrawTool,
  draftPointsCount,
  onSelectionChange,
  onToggleLayer,
  onAddFloor,
  onFinishPointDrawing,
  onCancelPointDrawing,
  onDuplicateSelected,
  onDeleteSelected,
}) => {
  return (
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
          {LAYER_BUTTON_ITEMS.map(([lid, text]) => {
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
          <span>Click points on canvas ({draftPointsCount} placed).</span>
          <button
            onClick={onFinishPointDrawing}
            disabled={draftPointsCount < 2}
            style={{
              padding: '3px 8px',
              backgroundColor: '#22c55e',
              color: '#ffffff',
              border: 'none',
              borderRadius: 5,
              fontSize: 11,
              fontWeight: 700,
              cursor: draftPointsCount >= 2 ? 'pointer' : 'not-allowed',
            }}
          >
            ✓ Finish Shape
          </button>
          <button
            onClick={onCancelPointDrawing}
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
  );
};

interface InlineRoomRenamePopoverProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export const InlineRoomRenamePopover: React.FC<InlineRoomRenamePopoverProps> = ({
  value,
  onChange,
  onSave,
  onCancel,
}) => (
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
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSave();
        else if (e.key === 'Escape') onCancel();
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
      onClick={onSave}
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
);

interface EditorCanvasStatusBarProps {
  isFloorView: boolean;
  selectedBuilding?: EditorBuilding;
  selectedFloor?: EditorFloor;
  zoom: number;
  gridSnap: number;
}

export const EditorCanvasStatusBar: React.FC<EditorCanvasStatusBarProps> = ({
  isFloorView,
  selectedBuilding,
  selectedFloor,
  zoom,
  gridSnap,
}) => (
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
    | Zoom: {zoom.toFixed(1)} px/m | Snap: {gridSnap > 0 ? `${gridSnap}m` : 'Off'}
  </div>
);
