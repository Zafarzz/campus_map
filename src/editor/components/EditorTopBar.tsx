import React from 'react';
import type { CanvasViewport, EditorTool } from '../domain/types';

interface EditorTopBarProps {
  campusName: string;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  currentTool: EditorTool;
  gridSnap: number;
  viewport: CanvasViewport;
  versionCount: number;
  onToolChange: (tool: EditorTool) => void;
  onGridSnapChange: (snap: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onOpenVersions: () => void;
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
  onToolChange,
  onGridSnapChange,
  onUndo,
  onRedo,
  onSave,
  onOpenVersions,
  onZoomIn,
  onZoomOut,
  onResetView,
  onBackTo3D,
}) => {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        backgroundColor: '#1e293b',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        color: '#f8fafc',
        height: 52,
        boxSizing: 'border-box',
        gap: 12,
      }}
    >
      {/* Left side: Back to 3D and Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 260 }}>
        <button
          onClick={onBackTo3D}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: '#e2e8f0',
            padding: '6px 12px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
          title="Вернуться к интерактивной 3D-карте"
        >
          <span>← 3D Карта</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#f1f5f9' }}>{campusName}</span>
          <span
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 12,
              fontWeight: 500,
              backgroundColor: isDirty ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
              color: isDirty ? '#fbbf24' : '#34d399',
              border: `1px solid ${isDirty ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
            }}
          >
            {isDirty ? 'Несохранённые правки' : 'Сохранено'}
          </span>
        </div>
      </div>

      {/* Center: Tools and Grid */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.6)', borderRadius: 6, padding: 2 }}>
          <button
            onClick={() => onToolChange('select')}
            style={{
              padding: '5px 12px',
              background: currentTool === 'select' ? '#3b82f6' : 'transparent',
              color: currentTool === 'select' ? '#fff' : '#94a3b8',
              border: 'none',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
            title="Инструмент выбора и перемещения объектов (V)"
          >
            Выбор
          </button>
          <button
            onClick={() => onToolChange('pan')}
            style={{
              padding: '5px 12px',
              background: currentTool === 'pan' ? '#3b82f6' : 'transparent',
              color: currentTool === 'pan' ? '#fff' : '#94a3b8',
              border: 'none',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
            title="Панорамирование холста (H)"
          >
            Холст
          </button>
          <button
            onClick={() => onToolChange('add-building')}
            style={{
              padding: '5px 12px',
              background: currentTool === 'add-building' ? '#3b82f6' : 'transparent',
              color: currentTool === 'add-building' ? '#fff' : '#94a3b8',
              border: 'none',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
            title="Кликните на холст для добавления нового здания"
          >
            + Здание
          </button>
          <button
            onClick={() => onToolChange('add-room')}
            style={{
              padding: '5px 12px',
              background: currentTool === 'add-room' ? '#3b82f6' : 'transparent',
              color: currentTool === 'add-room' ? '#fff' : '#94a3b8',
              border: 'none',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
            title="Кликните внутри здания для добавления помещения"
          >
            + Комната
          </button>
        </div>

        <div style={{ height: 20, width: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />

        {/* Snap Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#94a3b8' }}>
          <span>Сетка:</span>
          <select
            value={gridSnap}
            onChange={(e) => onGridSnapChange(parseFloat(e.target.value))}
            style={{
              background: 'rgba(15, 23, 42, 0.6)',
              color: '#e2e8f0',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 4,
              padding: '4px 6px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <option value={0}>Выкл</option>
            <option value={0.5}>0.5 м</option>
            <option value={1}>1.0 м</option>
            <option value={2}>2.0 м</option>
          </select>
        </div>
      </div>

      {/* Right side: Undo/Redo, Zoom, History, Save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={onUndo}
          disabled={!canUndo}
          style={{
            padding: '6px 10px',
            background: 'rgba(255,255,255,0.06)',
            color: canUndo ? '#f1f5f9' : '#64748b',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 5,
            fontSize: 12,
            cursor: canUndo ? 'pointer' : 'not-allowed',
          }}
          title="Отменить действие (Ctrl+Z)"
        >
          ↶ Отмена
        </button>

        <button
          onClick={onRedo}
          disabled={!canRedo}
          style={{
            padding: '6px 10px',
            background: 'rgba(255,255,255,0.06)',
            color: canRedo ? '#f1f5f9' : '#64748b',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 5,
            fontSize: 12,
            cursor: canRedo ? 'pointer' : 'not-allowed',
          }}
          title="Повторить действие (Ctrl+Y / Ctrl+Shift+Z)"
        >
          ↷ Повтор
        </button>

        <div style={{ height: 20, width: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />

        {/* Zoom Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            onClick={onZoomOut}
            style={{
              padding: '6px 8px',
              background: 'rgba(255,255,255,0.06)',
              color: '#cbd5e1',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '5px 0 0 5px',
              fontSize: 12,
              cursor: 'pointer',
            }}
            title="Уменьшить масштаб"
          >
            -
          </button>
          <button
            onClick={onResetView}
            style={{
              padding: '6px 8px',
              background: 'rgba(255,255,255,0.06)',
              color: '#cbd5e1',
              border: '1px solid rgba(255,255,255,0.1)',
              borderLeft: 'none',
              borderRight: 'none',
              fontSize: 11,
              cursor: 'pointer',
            }}
            title="Сбросить масштаб и положение (Центр)"
          >
            {Math.round(viewport.zoom * 10)}%
          </button>
          <button
            onClick={onZoomIn}
            style={{
              padding: '6px 8px',
              background: 'rgba(255,255,255,0.06)',
              color: '#cbd5e1',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '0 5px 5px 0',
              fontSize: 12,
              cursor: 'pointer',
            }}
            title="Увеличить масштаб"
          >
            +
          </button>
        </div>

        <div style={{ height: 20, width: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />

        {/* Version History Button */}
        <button
          onClick={onOpenVersions}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            background: 'rgba(51, 65, 85, 0.8)',
            color: '#e2e8f0',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
          }}
          title="Открыть менеджер сохранённых версий кампуса"
        >
          <span>История версий</span>
          <span
            style={{
              backgroundColor: '#475569',
              borderRadius: 10,
              padding: '1px 6px',
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            {versionCount}
          </span>
        </button>

        {/* Save Button */}
        <button
          onClick={onSave}
          style={{
            padding: '6px 16px',
            backgroundColor: isDirty ? '#2563eb' : '#334155',
            color: '#ffffff',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: isDirty ? '0 0 10px rgba(37, 99, 235, 0.4)' : 'none',
            transition: 'background-color 0.2s',
          }}
          title="Сохранить изменения в локальное хранилище (Ctrl+S)"
        >
          Сохранить
        </button>
      </div>
    </header>
  );
};
