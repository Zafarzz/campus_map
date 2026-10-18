import React, { useState } from 'react';
import { CHANGE_CATEGORY_LABELS } from '../changeTracking/changeTracker';
import type {
  EditorDocument,
  EditorLayerId,
  EditorSelection,
  SemanticChange,
} from '../domain/types';

interface EditorLeftPanelProps {
  doc: EditorDocument;
  selection: EditorSelection;
  changes?: SemanticChange[];
  visibleLayers?: Record<EditorLayerId, boolean>;
  activeTabOverride?: 'buildings' | 'outdoor' | 'changes';
  onTabChange?: (tab: 'buildings' | 'outdoor' | 'changes') => void;
  onToggleLayer?: (layer: EditorLayerId) => void;
  onSelectionChange: (sel: EditorSelection) => void;
  onAddBuilding: () => void;
  onDeleteBuilding: (buildingId: string) => void;
  onAddFloor: (buildingId: string) => void;
  onDeleteFloor: (buildingId: string, floorId: string) => void;
  onAddRoom: (buildingId: string, floorId: string) => void;
  onDeleteRoom: (buildingId: string, floorId: string, roomId: string) => void;
  onDeleteOutdoor?: (outdoorId: string) => void;
  onRevertChange?: (change: SemanticChange) => void;
  onResetAllChanges?: () => void;
}

const LAYER_LABELS: { id: EditorLayerId; label: string; icon: string }[] = [
  { id: 'buildings', label: 'Buildings & Footprints', icon: '🏢' },
  { id: 'paths', label: 'Paths, Sidewalks & Roads', icon: '🛣️' },
  { id: 'greenery', label: 'Greenery, Lawns & Trees', icon: '🌳' },
  { id: 'infrastructure', label: 'Plazas, Fountain & Gates', icon: '⛲' },
  { id: 'annotations', label: 'Labels & AI Annotations', icon: '💬' },
];

export const EditorLeftPanel: React.FC<EditorLeftPanelProps> = ({
  doc,
  selection,
  changes = [],
  visibleLayers = {
    buildings: true,
    paths: true,
    greenery: true,
    infrastructure: true,
    annotations: true,
  },
  activeTabOverride,
  onTabChange,
  onToggleLayer,
  onSelectionChange,
  onAddBuilding,
  onDeleteBuilding,
  onAddFloor,
  onDeleteFloor,
  onAddRoom,
  onDeleteRoom,
  onDeleteOutdoor,
  onRevertChange,
  onResetAllChanges,
}) => {
  const [internalTab, setInternalTab] = useState<'buildings' | 'outdoor' | 'changes'>('buildings');
  const activeTab = activeTabOverride ?? internalTab;
  const setTab = (t: 'buildings' | 'outdoor' | 'changes') => {
    setInternalTab(t);
    onTabChange?.(t);
  };

  const [search, setSearch] = useState('');
  const [expandedBuildings, setExpandedBuildings] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    doc.buildings.forEach((b) => (init[b.id] = true));
    return init;
  });

  const changeByTarget = new Map<string, SemanticChange>();
  for (const chg of changes) {
    changeByTarget.set(chg.targetId, chg);
  }

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
      b.name.toLowerCase().includes(term) ||
      (b.shortName && b.shortName.toLowerCase().includes(term));
    const matchRoom = b.floors.some((f) =>
      f.rooms.some(
        (r) =>
          r.number.toLowerCase().includes(term) ||
          (r.name && r.name.toLowerCase().includes(term)),
      ),
    );
    return matchBuilding || matchRoom;
  });

  const outdoorList = (doc.outdoorElements ?? []).filter((el) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return el.name.toLowerCase().includes(term) || el.type.toLowerCase().includes(term);
  });

  return (
    <aside
      style={{
        width: 300,
        height: '100%',
        backgroundColor: '#ffffff',
        borderRight: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        boxSizing: 'border-box',
        color: '#0f172a',
      }}
    >
      {/* Top Mode Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #e2e8f0',
          backgroundColor: '#f8fafc',
          padding: '6px 8px 0 8px',
          gap: 4,
        }}
      >
        <button
          onClick={() => setTab('buildings')}
          style={{
            flex: 1,
            padding: '7px 6px',
            fontSize: 12,
            fontWeight: activeTab === 'buildings' ? 700 : 500,
            color: activeTab === 'buildings' ? '#0f172a' : '#64748b',
            backgroundColor: activeTab === 'buildings' ? '#ffffff' : 'transparent',
            border: '1px solid',
            borderColor: activeTab === 'buildings' ? '#e2e8f0 #e2e8f0 #ffffff #e2e8f0' : 'transparent',
            borderRadius: '6px 6px 0 0',
            cursor: 'pointer',
            marginBottom: -1,
          }}
        >
          🏢 Buildings
        </button>
        <button
          onClick={() => setTab('outdoor')}
          style={{
            flex: 1,
            padding: '7px 6px',
            fontSize: 12,
            fontWeight: activeTab === 'outdoor' ? 700 : 500,
            color: activeTab === 'outdoor' ? '#0f172a' : '#64748b',
            backgroundColor: activeTab === 'outdoor' ? '#ffffff' : 'transparent',
            border: '1px solid',
            borderColor: activeTab === 'outdoor' ? '#e2e8f0 #e2e8f0 #ffffff #e2e8f0' : 'transparent',
            borderRadius: '6px 6px 0 0',
            cursor: 'pointer',
            marginBottom: -1,
          }}
        >
          🌳 Outdoor
        </button>
        <button
          onClick={() => setTab('changes')}
          style={{
            flex: 1,
            padding: '7px 6px',
            fontSize: 12,
            fontWeight: activeTab === 'changes' ? 700 : 500,
            color: activeTab === 'changes' ? '#0f172a' : '#64748b',
            backgroundColor: activeTab === 'changes' ? '#ffffff' : 'transparent',
            border: '1px solid',
            borderColor: activeTab === 'changes' ? '#e2e8f0 #e2e8f0 #ffffff #e2e8f0' : 'transparent',
            borderRadius: '6px 6px 0 0',
            cursor: 'pointer',
            marginBottom: -1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          <span>Δ Changes</span>
          {changes.length > 0 && (
            <span
              style={{
                backgroundColor: '#f59e0b',
                color: '#ffffff',
                borderRadius: 10,
                padding: '0 5px',
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              {changes.length}
            </span>
          )}
        </button>
      </div>

      {/* Search & Quick Action Header */}
      {activeTab !== 'changes' && (
        <div
          style={{
            padding: '10px 12px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.03em' }}>
              {activeTab === 'buildings' ? 'BUILDINGS & FLOOR PLANS' : 'CAMPUS EXTERIOR & LAYERS'}
            </span>
            {activeTab === 'buildings' && (
              <button
                onClick={onAddBuilding}
                style={{
                  padding: '3px 8px',
                  backgroundColor: '#18181b',
                  border: 'none',
                  color: '#ffffff',
                  borderRadius: 5,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                title="Add a new building"
              >
                + Building
              </button>
            )}
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter buildings, rooms, outdoor..."
            style={{
              width: '100%',
              boxSizing: 'border-box',
              backgroundColor: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 12,
              color: '#0f172a',
              outline: 'none',
            }}
          />
        </div>
      )}

      {/* TAB 1: BUILDINGS & FLOORS */}
      {activeTab === 'buildings' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {/* Quick button to return to Campus Exterior Overview when inside a floor */}
          {selection.floorId && (
            <button
              onClick={() => onSelectionChange({ type: 'none' })}
              style={{
                width: '100%',
                marginBottom: 8,
                padding: '7px 10px',
                backgroundColor: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                color: '#0f172a',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>🌍 View Full Campus Exterior</span>
              <span style={{ fontSize: 11, color: '#64748b' }}>Esc</span>
            </button>
          )}

          {filteredBuildings.length === 0 ? (
            <div style={{ padding: 16, fontSize: 12, color: '#64748b', textAlign: 'center' }}>
              No matching buildings or rooms found
            </div>
          ) : (
            filteredBuildings.map((bld) => {
              const isSelected = selection.buildingId === bld.id && !selection.roomId;
              const isExpanded = !!expandedBuildings[bld.id];
              const bldChange = changeByTarget.get(bld.id);

              return (
                <div
                  key={bld.id}
                  style={{
                    marginBottom: 6,
                    border: `1px solid ${isSelected ? '#18181b' : '#e2e8f0'}`,
                    borderRadius: 7,
                    backgroundColor: '#ffffff',
                    overflow: 'hidden',
                  }}
                >
                  {/* Building Header Row */}
                  <div
                    onClick={() => {
                      onSelectionChange({
                        type: 'building',
                        buildingId: bld.id,
                        floorId: selection.buildingId === bld.id ? selection.floorId : undefined,
                      });
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 8px',
                      backgroundColor: isSelected ? '#f1f5f9' : '#f8fafc',
                      cursor: 'pointer',
                      gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                      <span
                        onClick={(e) => toggleExpand(bld.id, e)}
                        style={{
                          fontSize: 10,
                          color: '#64748b',
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
                          fontSize: 12,
                          fontWeight: 700,
                          color: '#0f172a',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {bld.shortName ? `${bld.shortName} · ${bld.name}` : bld.name}
                      </span>
                      {bldChange && (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            padding: '1px 4px',
                            borderRadius: 4,
                            backgroundColor: CHANGE_CATEGORY_LABELS[bldChange.primaryCategory].bgColor,
                            color: CHANGE_CATEGORY_LABELS[bldChange.primaryCategory].color,
                          }}
                        >
                          {CHANGE_CATEGORY_LABELS[bldChange.primaryCategory].shortBadge}
                        </span>
                      )}
                      {bld.aiComment && (
                        <span title={bld.aiComment} style={{ fontSize: 11 }}>
                          💬
                        </span>
                      )}
                    </div>

                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => onAddFloor(bld.id)}
                        style={{
                          padding: '2px 6px',
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: 4,
                          color: '#334155',
                          fontSize: 10,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                        title="Add floor to building"
                      >
                        +Floor
                      </button>
                      <button
                        onClick={() => onDeleteBuilding(bld.id)}
                        style={{
                          padding: '2px 5px',
                          background: 'transparent',
                          border: 'none',
                          color: '#dc2626',
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                        title="Delete building"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Expanded Floors & Rooms */}
                  {isExpanded && (
                    <div style={{ padding: '6px 8px', borderTop: '1px solid #f1f5f9' }}>
                      {/* Floor Selector Pills */}
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                        {bld.floors.map((fl) => {
                          const isFloorActive =
                            selection.buildingId === bld.id && selection.floorId === fl.id;
                          return (
                            <button
                              key={fl.id}
                              onClick={() =>
                                onSelectionChange({
                                  type: 'floor',
                                  buildingId: bld.id,
                                  floorId: fl.id,
                                })
                              }
                              style={{
                                padding: '3px 8px',
                                borderRadius: 5,
                                fontSize: 11,
                                fontWeight: isFloorActive ? 700 : 500,
                                backgroundColor: isFloorActive ? '#18181b' : '#f1f5f9',
                                color: isFloorActive ? '#ffffff' : '#334155',
                                border: '1px solid',
                                borderColor: isFloorActive ? '#18181b' : '#e2e8f0',
                                cursor: 'pointer',
                              }}
                              title={`Open 2D plan for ${fl.name}`}
                            >
                              {fl.level === 1 ? 'Floor 1 (G)' : `Floor ${fl.level}`} ({fl.rooms.length})
                            </button>
                          );
                        })}
                      </div>

                      {/* Show active floor rooms or all floors if searched */}
                      {bld.floors.map((fl) => {
                        const isFloorActive =
                          selection.buildingId === bld.id && selection.floorId === fl.id;
                        if (!isFloorActive && !search.trim() && selection.buildingId === bld.id && selection.floorId) {
                          return null;
                        }
                        return (
                          <div key={fl.id} style={{ marginBottom: 4 }}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '2px 4px',
                                fontSize: 11,
                                color: '#64748b',
                                fontWeight: 600,
                              }}
                            >
                              <span
                                style={{ cursor: 'pointer' }}
                                onClick={() =>
                                  onSelectionChange({
                                    type: 'floor',
                                    buildingId: bld.id,
                                    floorId: fl.id,
                                  })
                                }
                              >
                                {fl.level === 1 ? 'Ground / Floor 1' : `Floor ${fl.level}`}
                              </span>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                  onClick={() => onAddRoom(bld.id, fl.id)}
                                  style={{
                                    padding: '1px 5px',
                                    background: '#f8fafc',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: 4,
                                    color: '#0f172a',
                                    fontSize: 10,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                  }}
                                >
                                  +Room
                                </button>
                                {bld.floors.length > 1 && (
                                  <button
                                    onClick={() => onDeleteFloor(bld.id, fl.id)}
                                    style={{
                                      padding: '1px 4px',
                                      background: 'transparent',
                                      border: 'none',
                                      color: '#dc2626',
                                      fontSize: 10,
                                      cursor: 'pointer',
                                    }}
                                    title="Delete floor"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            </div>

                            <div style={{ paddingLeft: 6, marginTop: 2 }}>
                              {fl.rooms.map((rm) => {
                                const isRoomSelected = selection.roomId === rm.id;
                                const rmChange = changeByTarget.get(rm.id);
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
                                      padding: '4px 6px',
                                      borderRadius: 5,
                                      backgroundColor: isRoomSelected ? '#18181b' : 'transparent',
                                      color: isRoomSelected ? '#ffffff' : '#334155',
                                      fontSize: 11,
                                      cursor: 'pointer',
                                      marginTop: 1,
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 5,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      <span style={{ fontWeight: 600 }}>{rm.number}</span>
                                      {rm.name && (
                                        <span
                                          style={{
                                            opacity: 0.78,
                                            fontSize: 10,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                          }}
                                        >
                                          {rm.name}
                                        </span>
                                      )}
                                      {rmChange && (
                                        <span
                                          style={{
                                            fontSize: 9,
                                            padding: '0 4px',
                                            borderRadius: 3,
                                            fontWeight: 700,
                                            backgroundColor:
                                              CHANGE_CATEGORY_LABELS[rmChange.primaryCategory].bgColor,
                                            color:
                                              CHANGE_CATEGORY_LABELS[rmChange.primaryCategory].color,
                                          }}
                                        >
                                          {rmChange.primaryCategory[0].toUpperCase()}
                                        </span>
                                      )}
                                      {rm.aiComment && <span title={rm.aiComment}>💬</span>}
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
                                        color: isRoomSelected ? '#ffffff' : '#dc2626',
                                        fontSize: 10,
                                        cursor: 'pointer',
                                        opacity: 0.75,
                                      }}
                                      title="Delete element"
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
      )}

      {/* TAB 2: OUTDOOR CAMPUS LAYERS & ELEMENTS */}
      {activeTab === 'outdoor' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
          {/* Toggleable Layers */}
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#475569',
                marginBottom: 6,
                letterSpacing: '0.02em',
              }}
            >
              VISIBLE LAYERS
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                backgroundColor: '#f8fafc',
                padding: 8,
                borderRadius: 7,
                border: '1px solid #e2e8f0',
              }}
            >
              {LAYER_LABELS.map((layer) => (
                <label
                  key={layer.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 12,
                    color: '#1e293b',
                    cursor: 'pointer',
                    padding: '2px 0',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={visibleLayers[layer.id] !== false}
                    onChange={() => onToggleLayer?.(layer.id)}
                  />
                  <span>{layer.icon}</span>
                  <span style={{ fontWeight: 500 }}>{layer.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#475569',
              marginBottom: 6,
              letterSpacing: '0.02em',
            }}
          >
            OUTDOOR ELEMENTS ({outdoorList.length})
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {outdoorList.map((el) => {
              const isSelected = selection.type === 'outdoor' && selection.outdoorId === el.id;
              const outChange = changeByTarget.get(el.id);
              return (
                <div
                  key={el.id}
                  onClick={() =>
                    onSelectionChange({
                      type: 'outdoor',
                      outdoorId: el.id,
                    })
                  }
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: 6,
                    backgroundColor: isSelected ? '#18181b' : '#f8fafc',
                    color: isSelected ? '#ffffff' : '#1e293b',
                    border: `1px solid ${isSelected ? '#18181b' : '#e2e8f0'}`,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                      minWidth: 0,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span
                        style={{
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {el.name}
                      </span>
                      {outChange && (
                        <span
                          style={{
                            fontSize: 9,
                            padding: '0 4px',
                            borderRadius: 3,
                            fontWeight: 700,
                            backgroundColor:
                              CHANGE_CATEGORY_LABELS[outChange.primaryCategory].bgColor,
                            color: CHANGE_CATEGORY_LABELS[outChange.primaryCategory].color,
                          }}
                        >
                          {CHANGE_CATEGORY_LABELS[outChange.primaryCategory].shortBadge}
                        </span>
                      )}
                      {el.aiComment && <span title={el.aiComment}>💬</span>}
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        color: isSelected ? '#cbd5e1' : '#64748b',
                      }}
                    >
                      {el.type} • {el.shape} ({el.size[0]}×{el.size[1]}m)
                    </span>
                  </div>
                  {onDeleteOutdoor && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteOutdoor(el.id);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: isSelected ? '#ffffff' : '#dc2626',
                        cursor: 'pointer',
                        fontSize: 11,
                      }}
                      title="Delete outdoor element"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: TRACKED CHANGES & INDIVIDUAL REVERT */}
      {activeTab === 'changes' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>
              SESSION CHANGES ({changes.length})
            </span>
            {changes.length > 0 && onResetAllChanges && (
              <button
                onClick={onResetAllChanges}
                style={{
                  padding: '3px 8px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  borderRadius: 5,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Revert All
              </button>
            )}
          </div>

          {changes.length === 0 ? (
            <div
              style={{
                padding: 20,
                textAlign: 'center',
                backgroundColor: '#f8fafc',
                borderRadius: 8,
                border: '1px dashed #cbd5e1',
                color: '#64748b',
                fontSize: 12,
              }}
            >
              No edits made yet relative to the original campus baseline. Move, resize, rename, add, or delete any object to track changes here.
            </div>
          ) : (
            changes.map((chg) => {
              const badge = CHANGE_CATEGORY_LABELS[chg.primaryCategory];
              return (
                <div
                  key={chg.id}
                  onClick={() => {
                    if (chg.primaryCategory === 'deleted') {
                      if (chg.buildingId && chg.floorId) {
                        onSelectionChange({
                          type: 'floor',
                          buildingId: chg.buildingId,
                          floorId: chg.floorId,
                        });
                      }
                      return;
                    }
                    if (chg.targetType === 'building') {
                      onSelectionChange({ type: 'building', buildingId: chg.targetId });
                    } else if (chg.targetType === 'room') {
                      onSelectionChange({
                        type: 'room',
                        buildingId: chg.buildingId,
                        floorId: chg.floorId,
                        roomId: chg.targetId,
                      });
                    } else if (chg.targetType === 'outdoor') {
                      onSelectionChange({
                        type: 'outdoor',
                        outdoorId: chg.targetId,
                      });
                    }
                  }}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 7,
                    backgroundColor: '#ffffff',
                    border: `1px solid ${badge.borderColor}`,
                    boxShadow: '0 1px 2px rgba(15,23,42,0.03)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#0f172a',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {chg.name}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: 4,
                        backgroundColor: badge.bgColor,
                        color: badge.color,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {badge.shortBadge}
                    </span>
                  </div>

                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>
                    {chg.locationLabel} • {chg.semanticLabel}
                  </div>

                  <div style={{ fontSize: 11, color: '#334155', lineHeight: 1.35 }}>
                    {chg.summary}
                  </div>

                  {chg.aiComment && (
                    <div
                      style={{
                        fontSize: 11,
                        backgroundColor: '#f5f3ff',
                        color: '#6d28d9',
                        padding: '4px 6px',
                        borderRadius: 4,
                        border: '1px solid #ddd6fe',
                      }}
                    >
                      💬 AI: &ldquo;{chg.aiComment}&rdquo;
                    </div>
                  )}

                  {onRevertChange && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRevertChange(chg);
                        }}
                        style={{
                          padding: '3px 8px',
                          fontSize: 11,
                          fontWeight: 600,
                          backgroundColor: '#f8fafc',
                          color: '#0f172a',
                          border: '1px solid #cbd5e1',
                          borderRadius: 4,
                          cursor: 'pointer',
                        }}
                        title="Discard this change and revert this object to its original state"
                      >
                        ↶ Revert Object
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </aside>
  );
};
