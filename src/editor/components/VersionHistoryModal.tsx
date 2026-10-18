import React, { useState } from 'react';
import type { CampusVersion, EditorDocument } from '../domain/types';

interface VersionHistoryModalProps {
  isOpen: boolean;
  versions: CampusVersion[];
  currentDoc: EditorDocument;
  onClose: () => void;
  onCreateVersion: (name: string, reason: string) => Promise<void>;
  onRestoreVersion: (version: CampusVersion) => Promise<void>;
  onDeleteVersion: (versionId: string) => Promise<void>;
  onResetToDefaults: () => Promise<void>;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  isOpen,
  versions,
  onClose,
  onCreateVersion,
  onRestoreVersion,
  onDeleteVersion,
  onResetToDefaults,
}) => {
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      await onCreateVersion(name.trim(), reason.trim());
      setName('');
      setReason('');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestore = async (ver: CampusVersion) => {
    const ok = window.confirm(
      `Restore snapshot "${ver.name}" (${new Date(ver.timestamp).toLocaleString()})?\n\nYour current state will be automatically backed up as a snapshot before restoring.`,
    );
    if (!ok) return;
    await onRestoreVersion(ver);
  };

  const handleDelete = async (ver: CampusVersion) => {
    if (ver.type === 'initial') {
      alert('The initial baseline snapshot cannot be deleted.');
      return;
    }
    const ok = window.confirm(`Delete snapshot "${ver.name}" from history?`);
    if (!ok) return;
    await onDeleteVersion(ver.id);
  };

  const handleReset = async () => {
    const ok = window.confirm(
      'Reset the entire campus map to its original factory state?\n\nAn automatic backup snapshot of your current edits will be saved before resetting.',
    );
    if (!ok) return;
    await onResetToDefaults();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backdropFilter: 'blur(2px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 650,
          maxHeight: '85vh',
          backgroundColor: '#ffffff',
          borderRadius: 12,
          border: '1px solid #cbd5e1',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(15, 23, 42, 0.18)',
          color: '#0f172a',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#f8fafc',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              Saved Snapshots &amp; Reset
            </h2>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Create named checkpoints or revert to a previous version
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              fontSize: 18,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Create Named Version Section */}
        <div
          style={{
            padding: '14px 20px',
            backgroundColor: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
              Save Current State as a Named Snapshot:
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="Snapshot name (e.g. Block A Floor 1 Remodel)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  flex: 2,
                  backgroundColor: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  padding: '7px 10px',
                  color: '#0f172a',
                  fontSize: 12,
                  outline: 'none',
                }}
              />
              <input
                type="text"
                placeholder="Notes (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={{
                  flex: 3,
                  backgroundColor: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  padding: '7px 10px',
                  color: '#0f172a',
                  fontSize: 12,
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                disabled={!name.trim() || isSaving}
                style={{
                  padding: '7px 14px',
                  backgroundColor: name.trim() ? '#18181b' : '#cbd5e1',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: name.trim() ? 'pointer' : 'not-allowed',
                  whiteSpace: 'nowrap',
                }}
              >
                Save Snapshot
              </button>
            </div>
          </form>
        </div>

        {/* Versions List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            backgroundColor: '#f8fafc',
          }}
        >
          {versions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#64748b', fontSize: 13 }}>
              No snapshots saved yet
            </div>
          ) : (
            versions.map((ver) => {
              const dateStr = new Date(ver.timestamp).toLocaleString();
              const badgeColors = {
                initial: { bg: '#f1f5f9', text: '#334155', border: '#cbd5e1' },
                manual: { bg: '#dcfce7', text: '#15803d', border: '#bbf7d0' },
                auto: { bg: '#fef3c7', text: '#b45309', border: '#fde68a' },
              }[ver.type] || { bg: '#f1f5f9', text: '#334155', border: '#cbd5e1' };

              const badgeLabel = {
                initial: 'Baseline',
                manual: 'Manual',
                auto: 'Auto Backup',
              }[ver.type] || ver.type;

              return (
                <div
                  key={ver.id}
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{ver.name}</span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: '1px 6px',
                          borderRadius: 10,
                          backgroundColor: badgeColors.bg,
                          color: badgeColors.text,
                          border: `1px solid ${badgeColors.border}`,
                        }}
                      >
                        {badgeLabel}
                      </span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{dateStr}</span>
                    </div>

                    <div style={{ fontSize: 12, color: '#475569' }}>
                      {ver.reason || 'No notes'} • Buildings: {ver.document.buildings.length}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      onClick={() => handleRestore(ver)}
                      style={{
                        padding: '5px 12px',
                        backgroundColor: '#18181b',
                        border: 'none',
                        borderRadius: 6,
                        color: '#ffffff',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Restore
                    </button>
                    {ver.type !== 'initial' && (
                      <button
                        onClick={() => handleDelete(ver)}
                        style={{
                          padding: '5px 8px',
                          backgroundColor: '#fef2f2',
                          border: '1px solid #fecaca',
                          borderRadius: 6,
                          color: '#dc2626',
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                        title="Delete snapshot"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#ffffff',
          }}
        >
          <button
            onClick={handleReset}
            style={{
              padding: '6px 12px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reset Entire Campus to Original Defaults
          </button>

          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              backgroundColor: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              color: '#0f172a',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
