import React from 'react';
import type { RoomKind } from '../../domain/campus/types';
import type {
  EditorBuilding,
  EditorDocument,
  EditorFloor,
  EditorRoom,
  EditorSelection,
  ValidationIssue,
} from '../domain/types';

interface EditorRightPanelProps {
  doc: EditorDocument;
  selection: EditorSelection;
  issues: ValidationIssue[];
  onSelectionChange: (sel: EditorSelection) => void;
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
  onDeleteBuilding: (buildingId: string) => void;
  onDeleteRoom: (buildingId: string, floorId: string, roomId: string) => void;
}

const ROOM_KINDS: { label: string; value: RoomKind }[] = [
  { label: 'Аудитория (classroom)', value: 'classroom' },
  { label: 'Лаборатория (lab)', value: 'lab' },
  { label: 'Офис / преподавательская (office)', value: 'office' },
  { label: 'Зал / холл (hall)', value: 'hall' },
  { label: 'Другое (other)', value: 'other' },
];

export const EditorRightPanel: React.FC<EditorRightPanelProps> = ({
  doc,
  selection,
  issues,
  onSelectionChange,
  onUpdateBuildingProps,
  onUpdateBuildingFootprint,
  onUpdateRoomProps,
  onUpdateRoomGeometry,
  onDeleteBuilding,
  onDeleteRoom,
}) => {
  const selectedBuilding: EditorBuilding | undefined = doc.buildings.find((b) => b.id === selection.buildingId);
  const selectedFloor: EditorFloor | undefined = selectedBuilding?.floors.find((f) => f.id === selection.floorId);
  const selectedRoom: EditorRoom | undefined = selectedFloor?.rooms.find((r) => r.id === selection.roomId);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 5,
    padding: '6px 8px',
    fontSize: 12,
    color: '#f8fafc',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: 500,
    marginBottom: 4,
    display: 'block',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    gap: 8,
    marginBottom: 10,
  };

  return (
    <aside
      style={{
        width: 320,
        height: '100%',
        backgroundColor: '#0f172a',
        borderLeft: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflowY: 'auto',
      }}
    >
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', letterSpacing: '0.02em' }}>
          {selectedRoom
            ? 'СВОЙСТВА ПОМЕЩЕНИЯ'
            : selectedBuilding
              ? 'СВОЙСТВА ЗДАНИЯ'
              : 'ПАРАМЕТРЫ КАМПУСА'}
        </span>
      </div>

      <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* ROOM SELECTED */}
        {selectedRoom && selectedBuilding && selectedFloor ? (
          <div>
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Номер помещения</label>
              <input
                type="text"
                value={selectedRoom.number}
                onChange={(e) =>
                  onUpdateRoomProps(
                    selectedBuilding.id,
                    selectedFloor.id,
                    selectedRoom.id,
                    { number: e.target.value },
                    'Изменение номера комнаты',
                  )
                }
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Название / назначение</label>
              <input
                type="text"
                value={selectedRoom.name || ''}
                placeholder="Например: Кабинет физики"
                onChange={(e) =>
                  onUpdateRoomProps(
                    selectedBuilding.id,
                    selectedFloor.id,
                    selectedRoom.id,
                    { name: e.target.value },
                    'Изменение названия комнаты',
                  )
                }
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Тип помещения</label>
              <select
                value={selectedRoom.kind}
                onChange={(e) =>
                  onUpdateRoomProps(
                    selectedBuilding.id,
                    selectedFloor.id,
                    selectedRoom.id,
                    { kind: e.target.value as RoomKind },
                    'Изменение типа комнаты',
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

            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Вместимость (чел.)</label>
              <input
                type="number"
                min="0"
                value={selectedRoom.capacity ?? ''}
                onChange={(e) =>
                  onUpdateRoomProps(
                    selectedBuilding.id,
                    selectedFloor.id,
                    selectedRoom.id,
                    { capacity: e.target.value ? parseInt(e.target.value, 10) : undefined },
                    'Изменение вместимости',
                  )
                }
                style={inputStyle}
              />
            </div>

            <div style={{ margin: '14px 0 6px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 8 }}>
              ГЕОМЕТРИЯ (МЕТРЫ)
            </span>

            <div style={rowStyle}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Локальный X (м)</label>
                <input
                  type="number"
                  step="0.1"
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
                        'Изменение X комнаты',
                      );
                    }
                  }}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Локальный Z (м)</label>
                <input
                  type="number"
                  step="0.1"
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
                        'Изменение Z комнаты',
                      );
                    }
                  }}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={rowStyle}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Ширина W (м)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  value={selectedRoom.size[0]}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val >= 0.5) {
                      onUpdateRoomGeometry(
                        selectedBuilding.id,
                        selectedFloor.id,
                        selectedRoom.id,
                        selectedRoom.localCenter,
                        [val, selectedRoom.size[1]],
                        'Изменение ширины комнаты',
                      );
                    }
                  }}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Глубина D (м)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  value={selectedRoom.size[1]}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val >= 0.5) {
                      onUpdateRoomGeometry(
                        selectedBuilding.id,
                        selectedFloor.id,
                        selectedRoom.id,
                        selectedRoom.localCenter,
                        [selectedRoom.size[0], val],
                        'Изменение глубины комнаты',
                      );
                    }
                  }}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, marginBottom: 16 }}>
              Мировые: X={(selectedBuilding.footprint.center[0] + selectedRoom.localCenter[0]).toFixed(1)}м, Z=
              {(selectedBuilding.footprint.center[1] + selectedRoom.localCenter[1]).toFixed(1)}м | Этаж:{' '}
              {selectedFloor.level}
            </div>

            <button
              onClick={() => onDeleteRoom(selectedBuilding.id, selectedFloor.id, selectedRoom.id)}
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                borderRadius: 5,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Удалить помещение
            </button>
          </div>
        ) : selectedBuilding ? (
          /* BUILDING SELECTED */
          <div>
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Полное название</label>
              <input
                type="text"
                value={selectedBuilding.name}
                onChange={(e) =>
                  onUpdateBuildingProps(selectedBuilding.id, { name: e.target.value }, 'Изменение названия здания')
                }
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Краткое имя / Литера</label>
              <input
                type="text"
                value={selectedBuilding.shortName || ''}
                onChange={(e) =>
                  onUpdateBuildingProps(
                    selectedBuilding.id,
                    { shortName: e.target.value },
                    'Изменение краткого имени',
                  )
                }
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Описание</label>
              <textarea
                rows={2}
                value={selectedBuilding.description || ''}
                onChange={(e) =>
                  onUpdateBuildingProps(
                    selectedBuilding.id,
                    { description: e.target.value },
                    'Изменение описания здания',
                  )
                }
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            <div style={{ margin: '14px 0 6px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 8 }}>
              КООРДИНАТЫ И РАЗМЕРЫ (МЕТРЫ)
            </span>

            <div style={rowStyle}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Центр X (м)</label>
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
                        'Изменение X здания',
                      );
                    }
                  }}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Центр Z (м)</label>
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
                        'Изменение Z здания',
                      );
                    }
                  }}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={rowStyle}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Ширина W (м)</label>
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
                        'Изменение ширины здания',
                      );
                    }
                  }}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Глубина D (м)</label>
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
                        'Изменение глубины здания',
                      );
                    }
                  }}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Активный этаж</label>
              <select
                value={selection.floorId || selectedBuilding.floors[0]?.id}
                onChange={(e) => {
                  onSelectionChange({
                    type: 'floor',
                    buildingId: selectedBuilding.id,
                    floorId: e.target.value,
                  });
                }}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {selectedBuilding.floors.map((fl) => (
                  <option key={fl.id} value={fl.id}>
                    Этаж {fl.level} ({fl.rooms.length} комнат)
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => onDeleteBuilding(selectedBuilding.id)}
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                borderRadius: 5,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Удалить здание
            </button>
          </div>
        ) : (
          /* NOTHING SELECTED - CAMPUS INFO */
          <div>
            <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
              <p style={{ marginTop: 0 }}>
                Выберите здание или помещение для редактирования параметров или используйте интерактивные маркеры на холсте.
              </p>
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.5)',
                  padding: 10,
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.06)',
                  marginBottom: 12,
                }}
              >
                <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: 6 }}>Статистика кампуса:</div>
                <div>Зданий: <strong style={{ color: '#60a5fa' }}>{doc.buildings.length}</strong></div>
                <div>
                  Помещений:{' '}
                  <strong style={{ color: '#60a5fa' }}>
                    {doc.buildings.reduce(
                      (acc, b) => acc + b.floors.reduce((facc, f) => facc + f.rooms.length, 0),
                      0,
                    )}
                  </strong>
                </div>
              </div>

              <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
                <strong style={{ color: '#94a3b8' }}>Горячие клавиши:</strong>
                <ul style={{ paddingLeft: 16, margin: '4px 0' }}>
                  <li><strong>Ctrl + Z</strong>: отмена действия</li>
                  <li><strong>Ctrl + Y / Ctrl+Shift+Z</strong>: повтор</li>
                  <li><strong>Ctrl + S</strong>: сохранение</li>
                  <li><strong>Delete</strong>: удаление выбранного объекта</li>
                  <li><strong>Колесико мыши</strong>: масштабирование к курсору</li>
                  <li><strong>Средняя кнопка мыши</strong>: панорамирование</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* VALIDATION ISSUES LIST */}
        {issues.length > 0 && (
          <div
            style={{
              marginTop: 'auto',
              paddingTop: 12,
              borderTop: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: issues.some((i) => i.severity === 'error') ? '#f87171' : '#fbbf24',
                display: 'block',
                marginBottom: 6,
              }}
            >
              ВАЛИДАЦИЯ ({issues.length})
            </span>

            <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {issues.map((iss) => (
                <div
                  key={iss.id}
                  onClick={() => {
                    if (iss.targetType === 'building') {
                      onSelectionChange({ type: 'building', buildingId: iss.targetId });
                    } else if (iss.targetType === 'room') {
                      // find room's parent building and floor
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
                    borderRadius: 4,
                    fontSize: 11,
                    backgroundColor:
                      iss.severity === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    border: `1px solid ${
                      iss.severity === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'
                    }`,
                    color: iss.severity === 'error' ? '#fca5a5' : '#fde68a',
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
