import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMap } from '../state/MapProvider';
import { CameraKeyframeList } from './CameraKeyframe';
import { CameraPresets } from './CameraPresets';
import { CameraTimeline } from './CameraTimeline';
import { CinematicRecorder } from './CinematicRecorder';
import { cinematic, useCinematic } from './cinematicStore';
import { IconClose, IconFilm } from './icons';
import { EASING_LABELS, type EasingId } from './pathMath';
import { CAMPUS_LOCK } from './presets';
import './cinematic.css';

/** True while the regular map UI should be hidden for a clean cinematic view. */
export function useCinematicClean(): boolean {
  return useCinematic((s) => s.open && s.settings.autoHide && (s.status === 'playing' || s.rec.phase === 'recording'));
}

export function useCinematicOpen(): boolean {
  return useCinematic((s) => s.open);
}

/** Header button that enters / leaves Cinematic Mode. */
export function CinematicButton() {
  const open = useCinematic((s) => s.open);
  return (
    <button
      type="button"
      className={`cine-open-btn${open ? ' is-on' : ''}`}
      onClick={() => (open ? cinematic.close() : cinematic.open())}
      title="Cinematic camera mode: fly the camera, build shots, record video"
    >
      <IconFilm /> Cinematic Mode
    </button>
  );
}

function Section({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="cine-section">
      <button type="button" className="cine-section__head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{title}</span>
        <span className={`cine-chev${open ? ' is-open' : ''}`}>›</span>
      </button>
      {open && <div className="cine-section__body">{children}</div>}
    </section>
  );
}

function Slider({
  label, value, min, max, step, unit = '', onChange, format,
}: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <label className="cine-slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      <output>{format ? format(value) : value}{unit}</output>
    </label>
  );
}

function CameraSettings() {
  const { campus, geometry } = useMap();
  const path = useCinematic((s) => s.path);
  const settings = useCinematic((s) => s.settings);
  const freeFlight = useCinematic((s) => s.freeFlight);
  return (
    <div>
      <Slider label="Speed" value={settings.speed} min={0.25} max={3} step={0.05} format={(v) => v.toFixed(2)} unit="×" onChange={(v) => cinematic.setSettings({ speed: v })} />
      <Slider label="Height" value={settings.heightOffset} min={-40} max={150} step={1} unit=" m" format={(v) => (v > 0 ? `+${v}` : `${v}`)} onChange={(v) => cinematic.setSettings({ heightOffset: v })} />
      <Slider label="FOV" value={path.fov} min={15} max={100} step={1} unit="°" onChange={(v) => cinematic.setPathProps({ fov: v })} />
      <Slider label="Smoothness" value={path.smoothness} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => cinematic.setPathProps({ smoothness: v })} />
      <label className="cine-field">
        <span>Easing</span>
        <select value={path.easing} onChange={(e) => cinematic.setPathProps({ easing: e.target.value as EasingId })}>
          {(Object.keys(EASING_LABELS) as EasingId[]).map((id) => <option key={id} value={id}>{EASING_LABELS[id]}</option>)}
        </select>
      </label>
      <label className="cine-field">
        <span>Look-at target</span>
        <select value={path.lockTarget ?? ''} onChange={(e) => cinematic.setPathProps({ lockTarget: e.target.value || null })}>
          <option value="">Per-keyframe targets</option>
          <option value={CAMPUS_LOCK}>Campus center</option>
          {campus.buildings.filter((b) => geometry.buildings[b.id]).map((b) => (
            <option key={b.id} value={b.id}>{b.shortName} — {b.name}</option>
          ))}
        </select>
      </label>
      <label className="cine-check"><input type="checkbox" checked={settings.banking} onChange={(e) => cinematic.setSettings({ banking: e.target.checked })} />Camera banking in turns</label>
      <label className="cine-check"><input type="checkbox" checked={settings.showPath} onChange={(e) => cinematic.setSettings({ showPath: e.target.checked })} />Show path in scene</label>
      <label className="cine-check"><input type="checkbox" checked={settings.autoHide} onChange={(e) => cinematic.setSettings({ autoHide: e.target.checked })} />Hide map UI during playback</label>
      <button type="button" className={`cine-btn cine-btn--text cine-btn--wide${freeFlight ? ' is-on' : ''}`} onClick={() => cinematic.setFreeFlight(!freeFlight)}>
        {freeFlight ? 'Exit free flight' : 'Free flight (WASD)'}
      </button>
    </div>
  );
}

function PathStorage() {
  const path = useCinematic((s) => s.path);
  const names = useCinematic((s) => s.savedNames);
  const [name, setName] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const exportFile = () => {
    const blob = new Blob([cinematic.exportPathJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(path.name || 'camera-path').replace(/[^\w.-]+/g, '_')}.camera.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="cine-row">
        <input className="cine-text" placeholder="Path name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        <button type="button" className="cine-btn cine-btn--text" onClick={() => { cinematic.savePath(name || path.name); setName(''); }}>Save</button>
      </div>
      {names.length === 0 && <p className="cine-hint">No saved paths yet.</p>}
      <ul className="cine-saved">
        {names.map((n) => (
          <li key={n}>
            <span>{n}</span>
            <button type="button" className="cine-btn cine-btn--text" onClick={() => cinematic.loadPath(n)}>Load</button>
            <button type="button" className="cine-ico cine-ico--danger" title="Delete saved path" onClick={() => cinematic.deletePath(n)}><IconClose /></button>
          </li>
        ))}
      </ul>
      <div className="cine-row">
        <button type="button" className="cine-btn cine-btn--text" disabled={!path.keyframes.length} onClick={exportFile}>Export .json</button>
        <button type="button" className="cine-btn cine-btn--text" onClick={() => file.current?.click()}>Import…</button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) cinematic.importPathJson(await f.text());
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

/** Floating control panel + bottom timeline + keyboard shortcuts. Rendered over the 3D viewport. */
export function CinematicOverlay() {
  const open = useCinematic((s) => s.open);
  const status = useCinematic((s) => s.status);
  const notice = useCinematic((s) => s.notice);
  const recording = useCinematic((s) => s.rec.phase === 'recording');
  const clean = useCinematicClean();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') && (t as HTMLInputElement).type !== 'range' && (t as HTMLInputElement).type !== 'checkbox';
      if (e.key === 'Escape') {
        if (typing) (t as HTMLElement).blur();
        cinematic.close();
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Space') {
        e.preventDefault();
        cinematic.togglePlay();
      } else if (e.code === 'KeyK') {
        cinematic.addKeyframeFromCamera();
      } else if (e.code === 'KeyH') {
        setHidden((h) => !h);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  // Prevent focused buttons from swallowing the Space shortcut.
  const keepFocusOff = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) e.preventDefault();
  };

  return (
    <div className={`cine-root${clean ? ' is-clean' : ''}${hidden ? ' is-hidden' : ''}`} onMouseDown={keepFocusOff}>
      <aside className="cine-panel" aria-label="Cinematic controls">
        <header className="cine-panel__head">
          <IconFilm />
          <b>Cinematic</b>
          {recording && <span className="cine-badge">● REC</span>}
          {!recording && status === 'playing' && <span className="cine-badge cine-badge--play">PLAY</span>}
          <button type="button" className="cine-ico" onClick={() => setHidden(true)} title="Hide controls (H)">–</button>
          <button type="button" className="cine-ico" onClick={() => cinematic.close()} title="Exit Cinematic Mode (Esc)"><IconClose /></button>
        </header>
        <div className="cine-panel__scroll">
          <Section title="Presets" defaultOpen><CameraPresets /></Section>
          <Section title="Camera"><CameraSettings /></Section>
          <Section title="Keyframes & path" defaultOpen><CameraKeyframeList /></Section>
          <Section title="Save / load"><PathStorage /></Section>
          <Section title="Record video"><CinematicRecorder /></Section>
        </div>
        <footer className="cine-panel__foot">
          <kbd>Space</kbd> play · <kbd>K</kbd> keyframe · <kbd>H</kbd> hide UI · <kbd>Esc</kbd> exit
        </footer>
      </aside>
      <CameraTimeline />
      {notice && <div className="cine-toast" role="status">{notice}</div>}
      {hidden && (
        <button type="button" className="cine-reveal" onClick={() => setHidden(false)} title="Show controls (H)">
          <IconFilm />
        </button>
      )}
    </div>
  );
}
