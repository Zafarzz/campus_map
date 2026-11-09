import React from 'react';
import type { EditorDocument, EditorSelection, ValidationIssue } from '../domain/types';

interface EditorValidationListProps {
  doc: EditorDocument;
  issues: ValidationIssue[];
  onSelectionChange: (sel: EditorSelection) => void;
}

export const EditorValidationList: React.FC<EditorValidationListProps> = ({
  doc,
  issues,
  onSelectionChange,
}) => {
  if (issues.length === 0) return null;

  return (
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

      <div
        style={{
          maxHeight: 150,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
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
  );
};
