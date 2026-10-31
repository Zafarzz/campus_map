import { useEffect, useRef, useState } from 'react';
import type { Vec3 } from '../domain/geometry/types';
import { cinematic, runtime, useCinematic } from './cinematicStore';
import { IconCopy, IconDown, IconEye, IconTrash, IconUp } from './icons';
import { keyframeTimes, type Keyframe } from './pathMath';

/** Number input that tolerates partial typing ("-", "1.") and commits valid numbers immediately. */
export function NumField({
  label, value, onChange, step = 1, min, max,
}: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  const [text, setText] = useState(String(round(value)));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(String(round(value)));
  }, [value]);
  return (
    <label className="cine-num">
      <span>{label}</span>
      <input
        type="number"
        value={text}
        step={step}
        min={min}
        max={max}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          setText(String(round(value)));
        }}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(min !== undefined && v < min ? min : max !== undefined && v > max ? max : v);
        }}
      />
    </label>
  );
}
const round = (v: number) => Math.round(v * 100) / 100;

function KeyframeInspector({ kf, index }: { kf: Keyframe; index: number }) {
  const editTarget = useCinematic((s) => s.editTarget);
  const setVec = (key: 'position' | 'target', axis: 0 | 1 | 2, v: number) => {
    const next = [...kf[key]] as Vec3;
    next[axis] = v;
    cinematic.updateKeyframe(kf.id, { [key]: next });
  };
  return (
    <div className="cine-inspector">
      <div className="cine-row cine-row--title">
        <b>Keyframe {index + 1}</b>
        <div className="cine-seg">
          <button type="button" className={!editTarget ? 'is-on' : ''} onClick={() => cinematic.setEditTarget(false)} title="Drag the camera position in the viewport">
            Move camera
          </button>
          <button type="button" className={editTarget ? 'is-on' : ''} onClick={() => cinematic.setEditTarget(true)} title="Drag the look-at target in the viewport">
            Move target
          </button>
        </div>
      </div>
      <div className="cine-grid3">
        {(['X', 'Y', 'Z'] as const).map((a, i) => (
          <NumField key={a} label={`Pos ${a}`} value={kf.position[i]} onChange={(v) => setVec('position', i as 0 | 1 | 2, v)} />
        ))}
        {(['X', 'Y', 'Z'] as const).map((a, i) => (
          <NumField key={a} label={`Look ${a}`} value={kf.target[i]} onChange={(v) => setVec('target', i as 0 | 1 | 2, v)} />
        ))}
        <NumField label="Roll °" value={kf.roll} step={1} min={-45} max={45} onChange={(v) => cinematic.updateKeyframe(kf.id, { roll: v })} />
        {index > 0 && (
          <NumField label="Dur s" value={kf.duration} step={0.5} min={0.2} onChange={(v) => cinematic.updateKeyframe(kf.id, { duration: v })} />
        )}
      </div>
      <button
        type="button"
        className="cine-btn cine-btn--text cine-btn--wide"
        onClick={() => {
          const pose = runtime.api?.getPose();
          if (pose) cinematic.updateKeyframe(kf.id, { position: pose.position, target: pose.target });
        }}
        title="Overwrite this keyframe with the current viewport camera"
      >
        Set from current view
      </button>
    </div>
  );
}

/** Keyframe list with select / go-to / reorder / duplicate / delete. */
export function CameraKeyframeList() {
  const keyframes = useCinematic((s) => s.path.keyframes);
  const selectedId = useCinematic((s) => s.selectedId);
  const times = keyframeTimes(keyframes);

  return (
    <div className="cine-kflist">
      <div className="cine-row">
        <button type="button" className="cine-btn cine-btn--text" onClick={() => cinematic.addKeyframeFromCamera()} title="Add a keyframe at the current camera (K)">
          + Add keyframe
        </button>
        <button type="button" className="cine-btn cine-btn--text" disabled={!keyframes.length} onClick={() => cinematic.clearKeyframes()}>
          Clear
        </button>
      </div>
      {keyframes.length === 0 && <p className="cine-hint">No keyframes yet. Fly the camera where you want it, then press “Add keyframe”.</p>}
      <ul>
        {keyframes.map((k, i) => (
          <li key={k.id}>
            <div className={`cine-kf${k.id === selectedId ? ' is-sel' : ''}`} onClick={() => cinematic.select(k.id)}>
              <span className="cine-kf__n">{i + 1}</span>
              <span className="cine-kf__t">{times[i].toFixed(1)}s</span>
              <span className="cine-kf__actions" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="cine-ico" title="Look through this keyframe" onClick={() => cinematic.goToKeyframe(k.id)}><IconEye /></button>
                <button type="button" className="cine-ico" title="Move up" disabled={i === 0} onClick={() => cinematic.moveKeyframe(k.id, -1)}><IconUp /></button>
                <button type="button" className="cine-ico" title="Move down" disabled={i === keyframes.length - 1} onClick={() => cinematic.moveKeyframe(k.id, 1)}><IconDown /></button>
                <button type="button" className="cine-ico" title="Duplicate" onClick={() => cinematic.duplicateKeyframe(k.id)}><IconCopy /></button>
                <button type="button" className="cine-ico cine-ico--danger" title="Delete" onClick={() => cinematic.deleteKeyframe(k.id)}><IconTrash /></button>
              </span>
            </div>
            {k.id === selectedId && <KeyframeInspector kf={k} index={i} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
