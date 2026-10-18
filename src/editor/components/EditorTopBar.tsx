import React from 'react';
import type { CanvasViewport, EditorTool, ExportReferenceScope } from '../domain/types';

interface EditorTopBarProps {
  campusName: string;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  currentTool: EditorTool;
  gridSnap: number;
  viewport: CanvasViewport;
  versionCount: number;
  changeCount?: number;
  reviewMode?: boolean;
  isFloorMode?: boolean;
  referenceScope?: ExportReferenceScope;
  onReferenceScopeChange?: (scope: ExportReferenceScope) => void;
  onToolChange: (tool: EditorTool) => void;
  onGridSnapChange: (snap: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onOpenVersions: () => void;
  onToggleReviewMode?: () => void;
  onExportZip?: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onBackTo3D: () => void;
}

export const EditorTopBar: React.FC<EditorTopBarProps> = ({
  campusName,
  isDirty,
  canUndo,
  canRedo,
  currentTool,
  gridSnap,
  viewport,
  versionCount,
  changeCount = 0,
  reviewMode = false,
  isFloorMode = false,
  referenceScope = 'all',
  onReferenceScopeChange,
  onToolChange,
  onGridSnapChange,
  onUndo,
  onRedo,
  onSave,
  onOpenVersions,
  onToggleReviewMode,
  onExportZip,
  onZoomIn,
  onZoomOut,
  onResetView,
  onBackTo3D,
}) => {
  const btnBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 10px',
    backgroundColor: '#ffffff',
    color: '#1e293b',
    border: '1px solid #cbd5e1',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.15s',
  };

  const toolBtn = (tool: EditorTool, label: string, title: string) => {
    const active = currentTool === tool;
    return (
      <button
        key={tool}
        onClick={() => onToolChange(tool)}
        style={{
          padding: '5px 10px',
          backgroundColor: active ? '#18181b' : 'transparent',
          color: active ? '#ffffff' : '#334155',
          border: 'none',
          borderRadius: 5,
          fontSize: 12,
          fontWeight: active ? 600 : 500,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
        title={title}
      >
        {label}
      </button>
    );
  };

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 14px',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        color: '#0f172a',
        minHeight: 54,
        boxSizing: 'border-box',
        gap: 10,
        flexWrap: 'wrap',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
        zIndex: 20,
      }}
    >
      {/* Left side: Back to 3D, Title & Save Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={onBackTo3D}
          style={{
            ...btnBase,
            backgroundColor: '#f8fafc',
            fontWeight: 600,
          }}
          title="Return to interactive 3D Campus Map"
        >
          <span>← 3D Map</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{campusName}</span>
          <span
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 12,
              fontWeight: 600,
              backgroundColor: isDirty ? '#fef3c7' : '#dcfce7',
              color: isDirty ? '#b45309' : '#15803d',
              border: `1px solid ${isDirty ? '#fde68a' : '#bbf7d0'}`,
            }}
          >
            {isDirty ? 'Draft (Autosaved)' : 'Saved'}
          </span>
        </div>
      </div>

      {/* Center: Quick Creation & Manipulation Tools */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            backgroundColor: '#f1f5f9',
            border: '1px solid #e2e8f0',
            borderRadius: 7,
            padding: 3,
          }}
        >
          {toolBtn('select', '↖ Select / Move', 'Select, move, or resize objects (V)')}
          {toolBtn('pan', '✋ Pan', 'Pan around the canvas (H or Middle Mouse)')}

          <div style={{ width: 1, height: 18, backgroundColor: '#cbd5e1', margin: '0 3px' }} />

          {!isFloorMode ? (
            <>
              {toolBtn('add-building', '+ Building', 'Drag on canvas or click to add a building')}
              {toolBtn('add-path', '+ Path', 'Click points to draw a pedestrian path / sidewalk')}
              {toolBtn('add-road', '+ Road', 'Drag or click to add a road segment')}
              {toolBtn('add-lawn', '+ Green Area', 'Drag on canvas to draw a lawn or garden')}
              {toolBtn('add-tree', '+ Tree', 'Click on canvas to plant a tree')}
              {toolBtn('add-plaza', '+ Plaza', 'Drag on canvas to add an open plaza or court')}
              {toolBtn('add-fountain', '+ Fountain', 'Click on canvas to place a water feature')}
              {toolBtn('add-outdoor-entrance', '+ Entrance', 'Click on canvas to add a gate or walkway')}
            </>
          ) : (
            <>
              {toolBtn('add-room', '+ Room', 'Drag or click inside the building to draw a room')}
              {toolBtn('add-polygon-room', '⬠ Polygon', 'Click vertices to draw a custom polygon space')}
              {toolBtn('add-corridor', '+ Corridor', 'Drag or click to create a corridor')}
              {toolBtn('add-hall', '+ Hall / Lobby', 'Drag or click to create a hall or lobby')}
              {toolBtn('add-wall', '+ Wall', 'Drag or click to add an interior wall or partition')}
              {toolBtn('add-door', '+ Door', 'Click to place a door along a room or wall')}
              {toolBtn('add-window', '+ Window', 'Click to place a window on a wall')}
              {toolBtn('add-stairs', '+ Stairs', 'Click to place stairs')}
              {toolBtn('add-elevator', '+ Elevator', 'Click to place an elevator')}
              {toolBtn('add-entrance', '+ Entrance', 'Click to mark a building entrance / exit')}
            </>
          )}
        </div>

        {/* Grid Snap Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#475569' }}>
          <span style={{ fontWeight: 500 }}>Snap:</span>
          <select
            value={gridSnap}
            onChange={(e) => onGridSnapChange(parseFloat(e.target.value))}
            style={{
              backgroundColor: '#ffffff',
              color: '#0f172a',
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              padding: '4px 6px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <option value={0}>Off</option>
            <option value={0.25}>0.25 m</option>
            <option value={0.5}>0.5 m</option>
            <option value={1}>1.0 m</option>
            <option value={2}>2.0 m</option>
          </select>
        </div>
      </div>

      {/* Right side: Undo/Redo, Zoom, Review Changes, Versions, Save, Export ZIP */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          onClick={onUndo}
          disabled={!canUndo}
          style={{
            ...btnBase,
            color: canUndo ? '#0f172a' : '#94a3b8',
            backgroundColor: canUndo ? '#ffffff' : '#f8fafc',
            cursor: canUndo ? 'pointer' : 'not-allowed',
          }}
          title="Undo last action (Ctrl+Z)"
        >
          ↶ Undo
        </button>

        <button
          onClick={onRedo}
          disabled={!canRedo}
          style={{
            ...btnBase,
            color: canRedo ? '#0f172a' : '#94a3b8',
            backgroundColor: canRedo ? '#ffffff' : '#f8fafc',
            cursor: canRedo ? 'pointer' : 'not-allowed',
          }}
          title="Redo action (Ctrl+Y / Ctrl+Shift+Z)"
        >
          ↷ Redo
        </button>

        {/* Zoom Controls */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button
            onClick={onZoomOut}
            style={{
              ...btnBase,
              padding: '5px 8px',
              borderRadius: '6px 0 0 6px',
            }}
            title="Zoom out"
          >
            −
          </button>
          <button
            onClick={onResetView}
            style={{
              ...btnBase,
              padding: '5px 8px',
              borderRadius: 0,
              borderLeft: 'none',
              borderRight: 'none',
              fontSize: 11,
            }}
            title="Reset zoom and center view"
          >
            {Math.round(viewport.zoom * 10)}%
          </button>
          <button
            onClick={onZoomIn}
            style={{
              ...btnBase,
              padding: '5px 8px',
              borderRadius: '0 6px 6px 0',
            }}
            title="Zoom in"
          >
            +
          </button>
        </div>

        {/* Review Changes Toggle */}
        {onToggleReviewMode && (
          <button
            onClick={onToggleReviewMode}
            style={{
              ...btnBase,
              backgroundColor: reviewMode ? '#fef3c7' : '#ffffff',
              borderColor: reviewMode ? '#f59e0b' : '#cbd5e1',
              color: reviewMode ? '#92400e' : '#1e293b',
              fontWeight: 600,
            }}
            title="Toggle Change Review mode to inspect and revert individual edits"
          >
            <span>Δ Changes</span>
            <span
              style={{
                backgroundColor: changeCount > 0 ? '#f59e0b' : '#e2e8f0',
                color: changeCount > 0 ? '#ffffff' : '#475569',
                borderRadius: 10,
                padding: '1px 6px',
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              {changeCount}
            </span>
          </button>
        )}

        {/* Version History Button */}
        <button
          onClick={onOpenVersions}
          style={btnBase}
          title="Open saved snapshots and reset options"
        >
          <span>Snapshots ({versionCount})</span>
        </button>

        {/* Save Draft Button */}
        <button
          onClick={onSave}
          style={{
            ...btnBase,
            backgroundColor: '#f8fafc',
            fontWeight: 600,
          }}
          title="Save draft to local browser storage (Ctrl+S)"
        >
          Save
        </button>

        {/* Export AI-Friendly ZIP Package + Reference Scope */}
        {onExportZip && (
          <div style={{ display: 'inline-flex', alignItems: 'center' }}>
            {onReferenceScopeChange && (
              <select
                value={referenceScope}
                onChange={(e) => onReferenceScopeChange(e.target.value as ExportReferenceScope)}
                style={{
                  backgroundColor: '#f8fafc',
                  color: '#0f172a',
                  border: '1px solid #cbd5e1',
                  borderRight: 'none',
                  borderRadius: '6px 0 0 6px',
                  padding: '5px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  height: 30,
                }}
                title="Choose whether to include all reference photos or only photos associated with changed objects in the exported ZIP"
              >
                <option value="all">📷 All Refs</option>
                <option value="changed-only">📷 Changed Refs</option>
              </select>
            )}
            <button
              onClick={onExportZip}
              style={{
                ...btnBase,
                backgroundColor: '#18181b',
                color: '#ffffff',
                borderColor: '#18181b',
                borderRadius: onReferenceScopeChange ? '0 6px 6px 0' : 6,
                padding: '6px 12px',
                fontWeight: 600,
              }}
              title="Validate and download AI-friendly ZIP package (manifest, instructions.md, changes.json, geometry.json, references/, SVG/PNG previews)"
            >
              ⬇ Export AI ZIP
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
