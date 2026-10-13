import React, { useState } from 'react';
import type { EditorBuilding, EditorDocument, EditorFloor, EditorRoom, EditorSelection } from '../domain/types';

interface EditorLeftPanelProps {
  doc: EditorDocument;
  selection: EditorSelection;
  onSelectionChange: (sel: EditorSelection) => void;
  onAddBuilding: () => void;
  onDeleteBuilding: (buildingId: string) => void;
  onAddFloor: (buildingId: string) => void;
  onDeleteFloor: (buildingId: string, floorId: string) => void;
  onAddRoom: (buildingId: string, floorId: string) => void;
  onDeleteRoom: (buildingId: string, floorId: string, roomId: string) => void;
}

export const EditorLeftPanel: React.FC<EditorLeftPanelProps> = ({
  doc,
  selection,
  onSelectionChange,
  onAddBuilding,
  onDeleteBuilding,
  onAddFloor,
  onDeleteFloor,
  onAddRoom,
  onDeleteRoom,
}) => {
  const [search, setSearch] = useState('');
  const [expandedBuildings, setExpandedBuildings] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    doc.buildings.forEach((b) => (init[b.id] = true));
    return init;
  });

  const toggleExpand = (buildingId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedBuildings((prev) => ({
      ...prev,
      [buildingId]: !prev[buildingId],
    }));
  };

  const filteredBuildings = doc.buildings.filter((b) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const matchBuilding =
      b.name.toLowerCase().includes(term) || (b.shortName && b.shortName.toLowerCase().includes(term));
    const matchRoom = b.floors.some((f) =>
      f.rooms.some((r) => r.number.toLowerCase().includes(term) || (r.name && r.name.toLowerCase().includes(term))),
    );
    return matchBuilding || matchRoom;
  });

  return (
    <aside
      style={{
        width: 300,
        height: '100%',
        backgroundColor: '#0f172a',
        borderRight: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', letterSpacing: '0.02em' }}>
            СТРУКТУРА КАМПУСА
          </span>
          <button
            onClick={onAddBuilding}
            style={{
              padding: '4px 8px',
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              color: '#60a5fa',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
            }}
            title="Добавить новое здание"
          >
            + Здание
          </button>
        </div>

        {/* Search Input */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по зданиям и комнатам..."
          style={{
            width: '100%',
            boxSizing: 'border-box',
            backgroundColor: 'rgba(30, 41, 59, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 5,
            padding: '6px 10px',
            fontSize: 12,
            color: '#f8fafc',
            outline: 'none',
          }}
        />
      </div>

      {/* Buildings Tree */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>
        {filteredBuildings.length === 0 ? (
          <div style={{ padding: 16, fontSize: 12, color: '#64748b', textAlign: 'center' }}>
            Здания не найдены
          </div>
        ) : (
          filteredBuildings.map((bld) => {
            const isSelected = selection.buildingId === bld.id && !selection.roomId;
            const isExpanded = !!expandedBuildings[bld.id];

            return (
              <div key={bld.id} style={{ marginBottom: 4 }}>
                {/* Building Header Row */}
                <div
                  onClick={() => {
                    onSelectionChange({
                      type: 'building',
                      buildingId: bld.id,
                      floorId: bld.floors[0]?.id,
                    });
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: 5,
                    backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                    border: `1px solid ${isSelected ? 'rgba(59, 130, 246, 0.5)' : 'transparent'}`,
                    cursor: 'pointer',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                    <span
                      onClick={(e) => toggleExpand(bld.id, e)}
                      style={{
                        fontSize: 10,
                        color: '#94a3b8',
                        padding: '2px 4px',
                        cursor: 'pointer',
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        display: 'inline-block',
                        transition: 'transform 0.15s',
                      }}
                    >
                      ▶
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: isSelected ? '#93c5fd' : '#e2e8f0',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {bld.shortName || bld.name}
                    </span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>({bld.floors.length} эт)</span>
                  </div>

                  {/* Actions for building */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onAddFloor(bld.id)}
                      style={{
                        padding: '2px 5px',
                        background: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                      title="Добавить этаж в здание"
                    >
                      +эт
                    </button>
                    <button
                      onClick={() => onDeleteBuilding(bld.id)}
                      style={{
                        padding: '2px 5px',
                        background: 'transparent',
                        border: 'none',
                        color: '#f87171',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                      title="Удалить здание"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Expanded Floors & Rooms */}
                {isExpanded && (
                  <div style={{ paddingLeft: 16, marginTop: 4 }}>
                    {bld.floors.map((fl) => {
                      const isFloorActive = selection.buildingId === bld.id && selection.floorId === fl.id;

                      return (
                        <div key={fl.id} style={{ marginBottom: 4 }}>
                          {/* Floor Row */}
                          <div
                            onClick={() => {
                              onSelectionChange({
                                type: 'floor',
                                buildingId: bld.id,
                                floorId: fl.id,
                              });
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '4px 6px',
                              borderRadius: 4,
                              backgroundColor: isFloorActive && !selection.roomId
                                ? 'rgba(59, 130, 246, 0.15)'
                                : 'transparent',
                              cursor: 'pointer',
                            }}
                          >
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 500,
                                color: isFloorActive ? '#60a5fa' : '#cbd5e1',
                              }}
                            >
                              Этаж {fl.level} ({fl.rooms.length})
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => onAddRoom(bld.id, fl.id)}
                                style={{
                                  padding: '1px 4px',
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#38bdf8',
                                  fontSize: 11,
                                  cursor: 'pointer',
                                }}
                                title="Добавить помещение на этаж"
                              >
                                +комн
                              </button>
                              {bld.floors.length > 1 && (
                                <button
                                  onClick={() => onDeleteFloor(bld.id, fl.id)}
                                  style={{
                                    padding: '1px 4px',
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#f87171',
                                    fontSize: 11,
                                    cursor: 'pointer',
                                  }}
                                  title="Удалить этаж"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Rooms list on this floor */}
                          <div style={{ paddingLeft: 12 }}>
                            {fl.rooms.map((rm) => {
                              const isRoomSelected = selection.roomId === rm.id;
                              return (
                                <div
                                  key={rm.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectionChange({
                                      type: 'room',
                                      buildingId: bld.id,
                                      floorId: fl.id,
                                      roomId: rm.id,
                                    });
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '3px 6px',
                                    borderRadius: 3,
                                    backgroundColor: isRoomSelected ? '#2563eb' : 'transparent',
                                    color: isRoomSelected ? '#ffffff' : '#94a3b8',
                                    fontSize: 11,
                                    cursor: 'pointer',
                                    marginTop: 1,
                                  }}
                                >
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 6,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    <span style={{ fontWeight: 600 }}>{rm.number}</span>
                                    {rm.name && (
                                      <span style={{ opacity: 0.8, fontSize: 10 }}>{rm.name}</span>
                                    )}
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeleteRoom(bld.id, fl.id, rm.id);
                                    }}
                                    style={{
                                      padding: '1px 3px',
                                      background: 'transparent',
                                      border: 'none',
                                      color: isRoomSelected ? '#ffffff' : '#ef4444',
                                      fontSize: 10,
                                      cursor: 'pointer',
                                      opacity: isRoomSelected ? 0.9 : 0.6,
                                    }}
                                    title="Удалить помещение"
                                  >
                                    ✕
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
