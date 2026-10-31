import { useEffect, useState } from 'react';
import { RESOLUTIONS, cinematic, useCinematic } from './cinematicStore';
import { IconRecord, IconStop } from './icons';

/** Recording controls. The engine itself lives in `recorder.ts` (captures the WebGL canvas only). */
export function CinematicRecorder() {
  const rec = useCinematic((s) => s.rec);
  const hasShot = useCinematic((s) => s.path.keyframes.length >= 2);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (rec.phase !== 'recording') return;
    const id = setInterval(() => setElapsed((performance.now() - rec.startedAt) / 1000), 250);
    return () => clearInterval(id);
  }, [rec.phase, rec.startedAt]);

  if (!rec.supported) {
    return <p className="cine-hint cine-hint--warn">Video recording is not supported in this browser (needs MediaRecorder + canvas.captureStream with WebM).</p>;
  }
  const recording = rec.phase === 'recording';
  const mm = Math.floor(elapsed / 60);
  const ss = Math.floor(elapsed % 60).toString().padStart(2, '0');

  return (
    <div>
      <div className="cine-grid2">
        <label className="cine-field">
          <span>Resolution</span>
          <select disabled={recording} value={rec.resolutionId} onChange={(e) => cinematic.setRecording({ resolutionId: e.target.value })}>
            {RESOLUTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
        <label className="cine-field">
          <span>Frame rate</span>
          <select disabled={recording} value={rec.fps} onChange={(e) => cinematic.setRecording({ fps: +e.target.value === 60 ? 60 : 30 })}>
            <option value={30}>30 fps</option>
            <option value={60}>60 fps</option>
          </select>
        </label>
      </div>
      <label className="cine-check">
        <input type="checkbox" disabled={recording} checked={rec.wholeSequence} onChange={(e) => cinematic.setRecording({ wholeSequence: e.target.checked })} />
        Record the whole camera sequence (auto start / stop)
      </label>
      <label className="cine-check" title="Enable if the exported video shows red and blue swapped compared to the map">
        <input type="checkbox" disabled={recording} checked={rec.swapRB} onChange={(e) => cinematic.setRecording({ swapRB: e.target.checked })} />
        Fix swapped colors (red ↔ blue)
      </label>
      <button
        type="button"
        className={`cine-rec${recording ? ' is-rec' : ''}`}
        onClick={() => (recording ? void cinematic.stopRecording() : cinematic.startRecording())}
        disabled={!recording && rec.wholeSequence && !hasShot}
        title={!recording && rec.wholeSequence && !hasShot ? 'Needs a shot with at least 2 keyframes, or disable “whole sequence”' : undefined}
      >
        {recording ? <IconStop /> : <IconRecord />}
        {recording ? `Stop recording  ${mm}:${ss}` : 'Start recording'}
      </button>
      {rec.error && <p className="cine-hint cine-hint--warn">{rec.error}</p>}
      {rec.downloadUrl && (
        <p className="cine-hint">
          Saved: <a href={rec.downloadUrl} download={rec.downloadName ?? 'cinematic.webm'}>{rec.downloadName}</a> ({(rec.sizeBytes / 1048576).toFixed(1)} MB)
        </p>
      )}
      <p className="cine-hint">Only the 3D canvas is recorded — panels and overlays never appear in the video.</p>
    </div>
  );
}
