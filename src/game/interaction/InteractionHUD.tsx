import { useInteraction } from './InteractionContext';

export function InteractionHUD() {
  const { activeTarget } = useInteraction();

  if (!activeTarget) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '60%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        border: '1px solid rgba(255, 255, 255, 0.25)',
        borderRadius: 8,
        padding: '8px 16px',
        color: '#f8fafc',
        fontSize: 13,
        fontWeight: 600,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        zIndex: 50,
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 22,
          height: 22,
          backgroundColor: '#2563eb',
          color: '#ffffff',
          borderRadius: 4,
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        E
      </span>
      <span>{activeTarget.prompt.replace(/^Нажмите E,\s*/i, '')}</span>
    </div>
  );
}
