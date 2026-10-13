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
  currentDoc,
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
      `Восстановить версию «${ver.name}» от ${new Date(ver.timestamp).toLocaleString()}?\n\nТекущее состояние будет автоматически сохранено в контрольный снимок. Более новые версии не будут удалены.`,
    );
    if (!ok) return;
    await onRestoreVersion(ver);
  };

  const handleDelete = async (ver: CampusVersion) => {
    if (ver.type === 'initial') {
      alert('Начальную версию нельзя удалить.');
      return;
    }
    const ok = window.confirm(`Удалить версию «${ver.name}» из истории?`);
    if (!ok) return;
    await onDeleteVersion(ver.id);
  };

  const handleReset = async () => {
    const ok = window.confirm(
      'ВНИМАНИЕ! Вы действительно хотите сбросить проект к заводским исходным данным кампуса?\n\nПеред сбросом будет автоматически создана резервная копия текущего состояния.',
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
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backdropFilter: 'blur(3px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 650,
          maxHeight: '85vh',
          backgroundColor: '#1e293b',
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.15)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          color: '#f8fafc',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>История версий кампуса</h2>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              Сохраненные контрольные точки геометрии и планировок кампуса
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: 18,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Create Named Version Section */}
        <div style={{ padding: '16px 20px', backgroundColor: 'rgba(15, 23, 42, 0.4)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>
              Создать именованный снимок текущего состояния:
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                type="text"
                placeholder="Название версии (например: Добавлено крыло корпуса C)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  flex: 2,
                  backgroundColor: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 5,
                  padding: '7px 10px',
                  color: '#fff',
                  fontSize: 12,
                  outline: 'none',
                }}
              />
              <input
                type="text"
                placeholder="Причина / описание изменений (опционально)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={{
                  flex: 3,
                  backgroundColor: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 5,
                  padding: '7px 10px',
                  color: '#fff',
                  fontSize: 12,
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                disabled={!name.trim() || isSaving}
                style={{
                  padding: '7px 14px',
                  backgroundColor: name.trim() ? '#2563eb' : '#334155',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 5,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: name.trim() ? 'pointer' : 'not-allowed',
                  whiteSpace: 'nowrap',
                }}
              >
                Сохранить снимок
              </button>
            </div>
          </form>
        </div>

        {/* Versions List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {versions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#64748b', fontSize: 13 }}>
              История версий пуста
            </div>
          ) : (
            versions.map((ver) => {
              const dateStr = new Date(ver.timestamp).toLocaleString();
              const badgeColors = {
                initial: { bg: 'rgba(59, 130, 246, 0.2)', text: '#60a5fa', border: 'rgba(59, 130, 246, 0.4)' },
                manual: { bg: 'rgba(16, 185, 129, 0.2)', text: '#34d399', border: 'rgba(16, 185, 129, 0.4)' },
                auto: { bg: 'rgba(245, 158, 11, 0.2)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.4)' },
              }[ver.type] || { bg: '#334155', text: '#cbd5e1', border: '#475569' };

              const badgeLabel = {
                initial: 'Начальная',
                manual: 'Вручную',
                auto: 'Авто',
              }[ver.type] || ver.type;

              return (
                <div
                  key={ver.id}
                  style={{
                    backgroundColor: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: '#f1f5f9' }}>{ver.name}</span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 500,
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

                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                      {ver.reason || 'Без описания'} • Зданий: {ver.document.buildings.length}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => handleRestore(ver)}
                      style={{
                        padding: '5px 12px',
                        backgroundColor: '#2563eb',
                        border: 'none',
                        borderRadius: 5,
                        color: '#ffffff',
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                      title="Восстановить геометрию кампуса из этой версии"
                    >
                      Восстановить
                    </button>
                    {ver.type !== 'initial' && (
                      <button
                        onClick={() => handleDelete(ver)}
                        style={{
                          padding: '5px 8px',
                          backgroundColor: 'rgba(239, 68, 68, 0.15)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          borderRadius: 5,
                          color: '#f87171',
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                        title="Удалить версию из истории"
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
            borderTop: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.3)',
          }}
        >
          <button
            onClick={handleReset}
            style={{
              padding: '6px 12px',
              backgroundColor: 'transparent',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#f87171',
              borderRadius: 5,
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Сброс к исходному проекту
          </button>

          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              backgroundColor: 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: 5,
              color: '#cbd5e1',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
