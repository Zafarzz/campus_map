import { useEffect, useRef } from 'react';
import { cinematic, runtime, useCinematic } from './cinematicStore';
import { IconPause, IconPlay, IconStop } from './icons';
import { MIN_SEGMENT, keyframeTimes, totalDuration } from './pathMath';

const fmt = (t: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
};

/**
 * Bottom-of-viewport timeline. The playhead is updated imperatively from `runtime.time` in a rAF loop
 * so playback does not re-render React. Click / drag the track to scrub; drag a keyframe marker to
 * change the duration of the segment leading to it.
 */
export function CameraTimeline() {
  const keyframes = useCinematic((s) => s.path.keyframes);
  const status = useCinematic((s) => s.status);
  const selectedId = useCinematic((s) => s.selectedId);
  const speed = useCinematic((s) => s.settings.speed);
  const loop = useCinematic((s) => s.path.loop);

  const total = totalDuration(keyframes);
  const times = keyframeTimes(keyframes);

  const track = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const totalRef = useRef(total);
  totalRef.current = total;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const T = totalRef.current;
      const pct = T > 0 ? Math.min(100, (runtime.time / T) * 100) : 0;
      if (head.current) head.current.style.left = `${pct}%`;
      if (fill.current) fill.current.style.width = `${pct}%`;
      if (label.current) label.current.textContent = `${fmt(runtime.time)} / ${fmt(T)}`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const timeFromEvent = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.min(Math.max((clientX - r.left) / r.width, 0), 1) * total;
  };

  const onTrackDown = (e: React.PointerEvent) => {
    if (total <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    cinematic.seek(timeFromEvent(e.clientX));
  };
  const onTrackMove = (e: React.PointerEvent) => {
    if (total > 0 && e.currentTarget.hasPointerCapture(e.pointerId)) cinematic.seek(timeFromEvent(e.clientX));
  };

  const dragMarker = (i: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    const id = keyframes[i].id;
    cinematic.select(id);
    if (total <= 0) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (i === 0) return;
      if (!moved && Math.abs(ev.clientX - startX) < 3) return;
      moved = true;
      const prevTime = times[i - 1];
      cinematic.updateKeyframe(id, { duration: Math.max(MIN_SEGMENT, timeFromEvent(ev.clientX) - prevTime) });
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      if (!moved) cinematic.seek(times[i]);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  return (
    <div className="cine-timeline">
      <div className="cine-transport">
        <button type="button" className="cine-btn cine-btn--primary" onClick={() => cinematic.togglePlay()} title="Play / Pause (Space)" aria-label={status === 'playing' ? 'Pause' : 'Play'}>
          {status === 'playing' ? <IconPause /> : <IconPlay />}
        </button>
        <button type="button" className="cine-btn" onClick={() => cinematic.stop()} title="Stop (back to start)" aria-label="Stop">
          <IconStop />
        </button>
        <span className="cine-time" ref={label}>0:00.0 / 0:00.0</span>
      </div>
      <div className="cine-track" ref={track} onPointerDown={onTrackDown} onPointerMove={onTrackMove}>
        <div className="cine-track__rail" />
        <div className="cine-track__fill" ref={fill} />
        {total > 0 &&
          keyframes.map((k, i) => (
            <div
              key={k.id}
              className={`cine-track__key${k.id === selectedId ? ' cine-track__key--sel' : ''}`}
              style={{ left: `${(times[i] / total) * 100}%` }}
              onPointerDown={dragMarker(i)}
              title={i === 0 ? `Keyframe 1` : `Keyframe ${i + 1} — drag to change segment duration`}
            >
              <span>{i + 1}</span>
            </div>
          ))}
        <div className="cine-track__head" ref={head} />
        {total <= 0 && <div className="cine-track__empty">Pick a preset or add keyframes to build a shot</div>}
      </div>
      <div className="cine-transport cine-transport--right">
        <label className="cine-mini" title="Playback speed">
          <span>{speed.toFixed(2)}×</span>
          <input type="range" min={0.25} max={3} step={0.05} value={speed} onChange={(e) => cinematic.setSettings({ speed: +e.target.value })} />
        </label>
        <button type="button" className={`cine-btn cine-btn--text${loop ? ' is-on' : ''}`} onClick={() => cinematic.setPathProps({ loop: !loop })} title="Loop playback">
          Loop
        </button>
      </div>
    </div>
  );
}
