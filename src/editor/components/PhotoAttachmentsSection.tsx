import React, { useRef, useState } from 'react';
import type { PhotoAttachment } from '../domain/types';
import type { PhotoTargetSpec } from '../history/commands';
import {
  createPhotoAttachmentFromFile,
  getAttachmentPreviewUrl,
} from '../storage/attachmentStorage';

interface PhotoAttachmentsSectionProps {
  targetLabel: string;
  targetSpec: PhotoTargetSpec;
  photos?: PhotoAttachment[];
  onAddPhotos: (spec: PhotoTargetSpec, newPhotos: PhotoAttachment[], actionName: string) => void;
  onUpdatePhoto: (
    spec: PhotoTargetSpec,
    photoId: string,
    patch: Partial<Omit<PhotoAttachment, 'id' | 'fileId'>>,
    actionName: string,
  ) => void;
  onReorderPhoto: (
    spec: PhotoTargetSpec,
    photoId: string,
    direction: 'up' | 'down',
    actionName: string,
  ) => void;
  onRemovePhoto: (spec: PhotoTargetSpec, photoId: string, actionName: string) => void;
}

const DIRECTION_PRESETS = [
  'From Entrance',
  'Toward Corridor',
  'Toward Windows',
  'North (-Z)',
  'East (+X)',
  'South (+Z)',
  'West (-X)',
  'Ceiling & Lighting',
  'Facade Exterior',
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const PhotoAttachmentsSection: React.FC<PhotoAttachmentsSectionProps> = ({
  targetLabel,
  targetSpec,
  photos = [],
  onAddPhotos,
  onUpdatePhoto,
  onReorderPhoto,
  onRemovePhoto,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [expandedPhotoId, setExpandedPhotoId] = useState<string | null>(null);
  const [previewPhotoId, setPreviewPhotoId] = useState<string | null>(null);

  const sortedPhotos = [...photos].sort((a, b) => a.order - b.order);
  const previewIndex = previewPhotoId
    ? sortedPhotos.findIndex((p) => p.id === previewPhotoId)
    : -1;
  const activePreviewPhoto = previewIndex >= 0 ? sortedPhotos[previewIndex] : null;

  const handleFilesSelected = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(
      (f) =>
        f.type.startsWith('image/') ||
        /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(f.name),
    );
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      const created: PhotoAttachment[] = [];
      let orderIdx = sortedPhotos.length;
      for (const file of files) {
        const { attachment } = await createPhotoAttachmentFromFile(file, orderIdx++);
        created.push(attachment);
      }
      onAddPhotos(
        targetSpec,
        created,
        `Attached ${created.length} photo(s) to ${targetLabel}`,
      );
      if (created.length === 1) {
        setExpandedPhotoId(created[0].id);
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFilesSelected(e.dataTransfer.files);
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: 12,
        marginBottom: 14,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 15 }}>📷</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
              Reference Photos ({sortedPhotos.length})
            </div>
            <div style={{ fontSize: 10, color: '#64748b' }}>
              Attached to: <strong style={{ color: '#334155' }}>{targetLabel}</strong>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          style={{
            padding: '5px 10px',
            fontSize: 11,
            fontWeight: 600,
            color: '#0f172a',
            backgroundColor: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            cursor: isUploading ? 'wait' : 'pointer',
          }}
        >
          {isUploading ? 'Uploading...' : '+ Add Photos'}
        </button>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml,.jpg,.jpeg,.png,.webp"
        multiple
        onChange={(e) => {
          if (e.target.files) {
            handleFilesSelected(e.target.files);
          }
        }}
        style={{ display: 'none' }}
      />

      {/* Drag & Drop Upload Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!isDraggingOver) setIsDraggingOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingOver(false);
        }}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `1.5px dashed ${isDraggingOver ? '#0f172a' : '#cbd5e1'}`,
          backgroundColor: isDraggingOver ? '#f1f5f9' : '#f8fafc',
          borderRadius: 8,
          padding: sortedPhotos.length === 0 ? '14px 10px' : '8px 10px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          marginBottom: sortedPhotos.length > 0 ? 10 : 0,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>
          {isDraggingOver
            ? 'Drop reference images here...'
            : 'Drag & drop photos here, or click to browse'}
        </div>
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
          Supports JPEG, PNG, WebP · Included in AI ZIP export
        </div>
      </div>

      {/* Thumbnail Cards List */}
      {sortedPhotos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sortedPhotos.map((photo, idx) => {
            const previewUrl = getAttachmentPreviewUrl(photo.fileId);
            const isExpanded = expandedPhotoId === photo.id;
            const hasAnnotations = Boolean(
              photo.title || photo.caption || photo.aiInstruction || photo.direction,
            );

            return (
              <div
                key={photo.id}
                style={{
                  border: isExpanded ? '1.5px solid #0f172a' : '1px solid #e2e8f0',
                  borderRadius: 8,
                  backgroundColor: '#ffffff',
                  overflow: 'hidden',
                }}
              >
                {/* Top Summary Row with Thumbnail */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: 8,
                    backgroundColor: isExpanded ? '#f8fafc' : '#ffffff',
                  }}
                >
                  {/* Thumbnail */}
                  <div
                    onClick={() => setPreviewPhotoId(photo.id)}
                    title="Click to open large preview"
                    style={{
                      width: 54,
                      height: 44,
                      borderRadius: 6,
                      overflow: 'hidden',
                      backgroundColor: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      flexShrink: 0,
                      cursor: 'zoom-in',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                    }}
                  >
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={photo.title || photo.fileName}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: 16 }}>🖼️</span>
                    )}
                    <span
                      style={{
                        position: 'absolute',
                        bottom: 2,
                        right: 2,
                        backgroundColor: 'rgba(15, 23, 42, 0.75)',
                        color: '#ffffff',
                        fontSize: 8,
                        fontWeight: 700,
                        padding: '1px 3px',
                        borderRadius: 3,
                      }}
                    >
                      #{idx + 1}
                    </span>
                  </div>

                  {/* Title / Filename & Quick Summary */}
                  <div
                    onClick={() => setExpandedPhotoId(isExpanded ? null : photo.id)}
                    style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#0f172a',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {photo.title || photo.fileName}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: '#64748b',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {photo.caption || photo.aiInstruction || formatBytes(photo.byteSize)}
                    </div>
                    {hasAnnotations && !isExpanded && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                        {photo.direction && (
                          <span
                            style={{
                              fontSize: 9,
                              backgroundColor: '#f1f5f9',
                              color: '#334155',
                              padding: '1px 5px',
                              borderRadius: 4,
                              fontWeight: 600,
                            }}
                          >
                            🧭 {photo.direction}
                          </span>
                        )}
                        {photo.aiInstruction && (
                          <span
                            style={{
                              fontSize: 9,
                              backgroundColor: '#fef3c7',
                              color: '#92400e',
                              padding: '1px 5px',
                              borderRadius: 4,
                              fontWeight: 600,
                            }}
                          >
                            ✨ AI Note
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons: Reorder Up/Down, Edit Details, Remove */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() =>
                        onReorderPhoto(targetSpec, photo.id, 'up', `Reordered photo ${photo.fileName}`)
                      }
                      title="Move up"
                      style={{
                        padding: '3px 5px',
                        fontSize: 10,
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#ffffff',
                        color: idx === 0 ? '#cbd5e1' : '#334155',
                        borderRadius: 4,
                        cursor: idx === 0 ? 'default' : 'pointer',
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={idx === sortedPhotos.length - 1}
                      onClick={() =>
                        onReorderPhoto(targetSpec, photo.id, 'down', `Reordered photo ${photo.fileName}`)
                      }
                      title="Move down"
                      style={{
                        padding: '3px 5px',
                        fontSize: 10,
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#ffffff',
                        color: idx === sortedPhotos.length - 1 ? '#cbd5e1' : '#334155',
                        borderRadius: 4,
                        cursor: idx === sortedPhotos.length - 1 ? 'default' : 'pointer',
                      }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedPhotoId(isExpanded ? null : photo.id)}
                      title={isExpanded ? 'Collapse details' : 'Edit caption & AI instruction'}
                      style={{
                        padding: '3px 6px',
                        fontSize: 10,
                        fontWeight: 600,
                        border: '1px solid #cbd5e1',
                        backgroundColor: isExpanded ? '#0f172a' : '#f8fafc',
                        color: isExpanded ? '#ffffff' : '#0f172a',
                        borderRadius: 4,
                        cursor: 'pointer',
                      }}
                    >
                      {isExpanded ? 'Done' : 'Edit'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onRemovePhoto(
                          targetSpec,
                          photo.id,
                          `Removed photo "${photo.fileName}" from ${targetLabel}`,
                        )
                      }
                      title="Remove photo attachment"
                      style={{
                        padding: '3px 6px',
                        fontSize: 10,
                        border: '1px solid #fecaca',
                        backgroundColor: '#fef2f2',
                        color: '#dc2626',
                        borderRadius: 4,
                        cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Expanded Metadata & AI Instruction Form */}
                {isExpanded && (
                  <div
                    style={{
                      padding: 10,
                      borderTop: '1px solid #e2e8f0',
                      backgroundColor: '#ffffff',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => setPreviewPhotoId(photo.id)}
                        style={{
                          flex: 1,
                          padding: '5px 8px',
                          fontSize: 11,
                          fontWeight: 600,
                          backgroundColor: '#f8fafc',
                          color: '#0f172a',
                          border: '1px solid #cbd5e1',
                          borderRadius: 6,
                          cursor: 'pointer',
                        }}
                      >
                        🔍 Open Full Preview ({formatBytes(photo.byteSize)})
                      </button>
                    </div>

                    {/* Short Title */}
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: 10,
                          fontWeight: 600,
                          color: '#475569',
                          marginBottom: 3,
                        }}
                      >
                        Short Title (optional)
                      </label>
                      <input
                        type="text"
                        value={photo.title || ''}
                        placeholder="e.g. Main Hall Entrance View"
                        onChange={(e) =>
                          onUpdatePhoto(
                            targetSpec,
                            photo.id,
                            { title: e.target.value },
                            `Updated photo title`,
                          )
                        }
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '5px 8px',
                          fontSize: 11,
                          border: '1px solid #cbd5e1',
                          borderRadius: 6,
                          backgroundColor: '#ffffff',
                          color: '#0f172a',
                        }}
                      />
                    </div>

                    {/* File Name (Rename attachment) */}
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: 10,
                          fontWeight: 600,
                          color: '#475569',
                          marginBottom: 3,
                        }}
                      >
                        Export File Name
                      </label>
                      <input
                        type="text"
                        value={photo.fileName}
                        placeholder="hall_reference_01.jpg"
                        onChange={(e) =>
                          onUpdatePhoto(
                            targetSpec,
                            photo.id,
                            { fileName: e.target.value },
                            `Renamed photo attachment`,
                          )
                        }
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '5px 8px',
                          fontSize: 11,
                          border: '1px solid #cbd5e1',
                          borderRadius: 6,
                          backgroundColor: '#ffffff',
                          color: '#0f172a',
                        }}
                      />
                    </div>

                    {/* Photographed Direction / Viewpoint */}
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: 10,
                          fontWeight: 600,
                          color: '#475569',
                          marginBottom: 3,
                        }}
                      >
                        Photographed Direction / Viewpoint (optional)
                      </label>
                      <input
                        type="text"
                        value={photo.direction || ''}
                        placeholder="e.g. From main entrance looking North"
                        onChange={(e) =>
                          onUpdatePhoto(
                            targetSpec,
                            photo.id,
                            { direction: e.target.value },
                            `Updated photo direction`,
                          )
                        }
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '5px 8px',
                          fontSize: 11,
                          border: '1px solid #cbd5e1',
                          borderRadius: 6,
                          backgroundColor: '#ffffff',
                          color: '#0f172a',
                          marginBottom: 4,
                        }}
                      />
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {DIRECTION_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() =>
                              onUpdatePhoto(
                                targetSpec,
                                photo.id,
                                { direction: preset },
                                `Set photo direction to ${preset}`,
                              )
                            }
                            style={{
                              padding: '2px 6px',
                              fontSize: 9,
                              borderRadius: 4,
                              border:
                                photo.direction === preset
                                  ? '1px solid #0f172a'
                                  : '1px solid #e2e8f0',
                              backgroundColor:
                                photo.direction === preset ? '#0f172a' : '#f8fafc',
                              color: photo.direction === preset ? '#ffffff' : '#475569',
                              cursor: 'pointer',
                            }}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Caption / Description */}
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: 10,
                          fontWeight: 600,
                          color: '#475569',
                          marginBottom: 3,
                        }}
                      >
                        Caption / What the Photo Shows (optional)
                      </label>
                      <textarea
                        rows={2}
                        value={photo.caption || ''}
                        placeholder="e.g. Actual main hall, photographed from the entrance."
                        onChange={(e) =>
                          onUpdatePhoto(
                            targetSpec,
                            photo.id,
                            { caption: e.target.value },
                            `Updated photo caption`,
                          )
                        }
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '5px 8px',
                          fontSize: 11,
                          border: '1px solid #cbd5e1',
                          borderRadius: 6,
                          backgroundColor: '#ffffff',
                          color: '#0f172a',
                          resize: 'vertical',
                          fontFamily: 'inherit',
                        }}
                      />
                    </div>

                    {/* AI Instruction */}
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: 10,
                          fontWeight: 700,
                          color: '#92400e',
                          marginBottom: 3,
                        }}
                      >
                        ✨ Instruction for AI for this Photo (optional)
                      </label>
                      <textarea
                        rows={3}
                        value={photo.aiInstruction || ''}
                        placeholder="e.g. Use this photo to understand the hall's proportions, ceiling height, materials, and lighting. Preserve the existing room layout unless requested."
                        onChange={(e) =>
                          onUpdatePhoto(
                            targetSpec,
                            photo.id,
                            { aiInstruction: e.target.value },
                            `Updated photo AI instruction`,
                          )
                        }
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '6px 8px',
                          fontSize: 11,
                          border: '1px solid #fcd34d',
                          borderRadius: 6,
                          backgroundColor: '#fffbeb',
                          color: '#0f172a',
                          resize: 'vertical',
                          fontFamily: 'inherit',
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Full-Size Lightbox Preview Modal */}
      {activePreviewPhoto && (
        <div
          onClick={() => setPreviewPhotoId(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.78)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 12,
              maxWidth: 860,
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
            }}
          >
            {/* Modal Top Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: '1px solid #e2e8f0',
                backgroundColor: '#f8fafc',
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                  {activePreviewPhoto.title || activePreviewPhoto.fileName}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {targetLabel} · Photo {previewIndex + 1} of {sortedPhotos.length} ·{' '}
                  {formatBytes(activePreviewPhoto.byteSize)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {sortedPhotos.length > 1 && (
                  <>
                    <button
                      type="button"
                      disabled={previewIndex <= 0}
                      onClick={() =>
                        setPreviewPhotoId(sortedPhotos[Math.max(0, previewIndex - 1)].id)
                      }
                      style={{
                        padding: '5px 10px',
                        fontSize: 12,
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        cursor: previewIndex <= 0 ? 'default' : 'pointer',
                      }}
                    >
                      ← Prev
                    </button>
                    <button
                      type="button"
                      disabled={previewIndex >= sortedPhotos.length - 1}
                      onClick={() =>
                        setPreviewPhotoId(
                          sortedPhotos[Math.min(sortedPhotos.length - 1, previewIndex + 1)].id,
                        )
                      }
                      style={{
                        padding: '5px 10px',
                        fontSize: 12,
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        cursor:
                          previewIndex >= sortedPhotos.length - 1 ? 'default' : 'pointer',
                      }}
                    >
                      Next →
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewPhotoId(null)}
                  style={{
                    padding: '5px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#0f172a',
                    color: '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  Close ✕
                </button>
              </div>
            </div>

            {/* Image Preview Area */}
            <div
              style={{
                flex: 1,
                backgroundColor: '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 320,
                maxHeight: '58vh',
                overflow: 'auto',
                padding: 16,
              }}
            >
              {getAttachmentPreviewUrl(activePreviewPhoto.fileId) ? (
                <img
                  src={getAttachmentPreviewUrl(activePreviewPhoto.fileId)!}
                  alt={activePreviewPhoto.title || activePreviewPhoto.fileName}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '54vh',
                    objectFit: 'contain',
                    borderRadius: 6,
                    boxShadow: '0 4px 16px rgba(15, 23, 42, 0.12)',
                  }}
                />
              ) : (
                <div style={{ color: '#64748b', fontSize: 13 }}>Image preview unavailable</div>
              )}
            </div>

            {/* Bottom Metadata Summary in Lightbox */}
            <div
              style={{
                padding: '12px 16px',
                borderTop: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Caption & Viewpoint
                </div>
                <div style={{ fontSize: 12, color: '#0f172a' }}>
                  {activePreviewPhoto.caption || (
                    <span style={{ color: '#94a3b8' }}>No caption added</span>
                  )}
                </div>
                {activePreviewPhoto.direction && (
                  <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
                    🧭 <strong>Direction:</strong> {activePreviewPhoto.direction}
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
                  ✨ Instruction for AI
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#0f172a',
                    backgroundColor: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: 6,
                    padding: '6px 8px',
                  }}
                >
                  {activePreviewPhoto.aiInstruction || (
                    <span style={{ color: '#94a3b8' }}>No AI instruction added</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
