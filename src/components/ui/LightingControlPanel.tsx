import { useState } from 'react';
import { useLighting } from '../../state/LightingProvider';

const PERIOD_PRESETS = [
  { label: '🌙 Ночь', hours: 2.0 },
  { label: '🌄 Утро', hours: 7.5 },
  { label: '☀️ День', hours: 13.0 },
  { label: '🌅 Закат', hours: 18.5 },
] as const;

export function LightingControlPanel() {
  const {
    timeHours,
    setTimeHours,
    timeSpeed,
    setTimeSpeed,
    atmosphere,
    fountainLighting,
    setFountainLighting,
    manualStreetLamps,
    setManualStreetLamps,
  } = useLighting();

  const [expanded, setExpanded] = useState(false);

  const formatTime = (h: number) => {
    const hours = Math.floor(h);
    const mins = Math.floor((h % 1) * 60);
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  return (
    <div
      style={{
        marginTop: 8,
        padding: '8px 10px',
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 8,
        color: '#f8fafc',
        fontSize: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setExpanded((p) => !p)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
          <span>{atmosphere.isNight ? '🌙' : atmosphere.period === 'sunset' ? '🌅' : atmosphere.period === 'morning' ? '🌄' : '☀️'}</span>
          <span>Освещение & Время ({formatTime(timeHours)})</span>
        </div>
        <span style={{ fontSize: 10, opacity: 0.7 }}>{expanded ? '▲ Свернуть' : '▼ Настроить'}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Quick Period Presets */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
            {PERIOD_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setTimeHours(p.hours)}
                style={{
                  padding: '4px 2px',
                  borderRadius: 4,
                  fontSize: 11,
                  backgroundColor: Math.abs(timeHours - p.hours) < 2 ? '#2563eb' : '#334155',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Time Slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span>Время суток:</span>
              <span style={{ fontWeight: 600 }}>{formatTime(timeHours)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={23.95}
              step={0.1}
              value={timeHours}
              onChange={(e) => setTimeHours(parseFloat(e.target.value))}
              style={{ width: '100%', cursor: 'pointer' }}
            />
          </div>

          {/* Time speed multiplier */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Скорость времени:</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {[0, 10, 60, 240].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setTimeSpeed(spd)}
                  style={{
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontSize: 10,
                    backgroundColor: timeSpeed === spd ? '#059669' : '#1e293b',
                    color: '#ffffff',
                    border: '1px solid rgba(255,255,255,0.15)',
                    cursor: 'pointer',
                  }}
                >
                  {spd === 0 ? 'Пауза' : `${spd}x`}
                </button>
              ))}
            </div>
          </div>

          {/* Street lamps manual toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Фонари кампуса:</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => setManualStreetLamps(null)}
                style={{
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontSize: 10,
                  backgroundColor: manualStreetLamps === null ? '#3b82f6' : '#1e293b',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.15)',
                  cursor: 'pointer',
                }}
              >
                Авто
              </button>
              <button
                onClick={() => setManualStreetLamps(true)}
                style={{
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontSize: 10,
                  backgroundColor: manualStreetLamps === true ? '#eab308' : '#1e293b',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.15)',
                  cursor: 'pointer',
                }}
              >
                Вкл
              </button>
              <button
                onClick={() => setManualStreetLamps(false)}
                style={{
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontSize: 10,
                  backgroundColor: manualStreetLamps === false ? '#ef4444' : '#1e293b',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.15)',
                  cursor: 'pointer',
                }}
              >
                Выкл
              </button>
            </div>
          </div>

          {/* Fountain Lighting Control */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Подсветка фонтана:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="color"
                value={fountainLighting.color}
                onChange={(e) => setFountainLighting({ color: e.target.value })}
                title="Цвет подсветки"
                style={{ width: 22, height: 22, border: 'none', borderRadius: 4, cursor: 'pointer', padding: 0 }}
              />
              <button
                onClick={() => setFountainLighting({ enabled: !fountainLighting.enabled })}
                style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 10,
                  backgroundColor: fountainLighting.enabled ? '#0284c7' : '#475569',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {fountainLighting.enabled ? 'ВКЛ' : 'ВЫКЛ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
