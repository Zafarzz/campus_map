import { useSyncExternalStore } from 'react';
import type { CampusGeometry, Vec3 } from '../domain/geometry/types';
import {
  MIN_SEGMENT,
  defaultPath,
  makeKeyframeId,
  sanitizePath,
  totalDuration,
  type CameraPath,
  type Keyframe,
} from './pathMath';
import { buildPreset, type PresetId } from './presets';
import { isRecordingSupported, recorderEngine } from './recorder';

/**
 * Cinematic mode state.
 *
 * Two layers on purpose:
 *  - `state`   : immutable React-facing UI state (panel, keyframes, settings). Subscribed via `useCinematic`.
 *  - `runtime` : mutable per-frame data (playhead). Read/written by the R3F loop and by imperatively
 *                updated DOM (timeline) so playback never triggers React re-renders.
 */

export type Status = 'idle' | 'playing' | 'paused';

export type Settings = {
  /** Playback rate multiplier (also scales free-flight speed). */
  speed: number;
  /** Meters added to the camera height while a path is playing. */
  heightOffset: number;
  banking: boolean;
  autoHide: boolean;
  showPath: boolean;
};

export type ResolutionOption = { id: string; label: string; width: number; height: number };
export const RESOLUTIONS: ResolutionOption[] = [
  { id: '720', label: '1280 × 720', width: 1280, height: 720 },
  { id: '1080', label: '1920 × 1080', width: 1920, height: 1080 },
  { id: '1440', label: '2560 × 1440', width: 2560, height: 1440 },
  { id: '2160', label: '3840 × 2160', width: 3840, height: 2160 },
];

export type RecordingState = {
  resolutionId: string;
  fps: 30 | 60;
  /** Record the whole camera sequence: restarts the shot and stops automatically at its end. */
  wholeSequence: boolean;
  /** Swap red/blue in the output (fix for encoders that produce wrong channel order). */
  swapRB: boolean;
  phase: 'idle' | 'recording';
  startedAt: number;
  supported: boolean;
  error: string | null;
  downloadUrl: string | null;
  downloadName: string | null;
  sizeBytes: number;
};

export type CinematicState = {
  open: boolean;
  status: Status;
  freeFlight: boolean;
  path: CameraPath;
  selectedId: string | null;
  /** Gizmo edits the selected keyframe's look-at target instead of its position. */
  editTarget: boolean;
  presetId: PresetId | null;
  presetBuildingId: string | null;
  settings: Settings;
  rec: RecordingState;
  savedNames: string[];
  notice: string | null;
};

export type ControllerApi = {
  /** Current camera pose as seen by the user (position + orbit target). */
  getPose: () => { position: Vec3; target: Vec3; fov: number };
  /** Moves the camera, optionally with the controls' smooth transition. */
  flyTo: (position: Vec3, target: Vec3, smooth: boolean) => void;
  defaultFov: () => number;
};

export const runtime = {
  /** Playhead, seconds. */
  time: 0,
  /** One-shot request for the controller to apply the pose at `time`. */
  applyPending: null as null | 'snap' | 'smooth',
  /** Request a smooth blend from the current camera into the path when playback starts. */
  blendIn: false,
  /** Set when the playhead jumps so banking / velocity estimates reset. */
  discontinuity: false,
  api: null as ControllerApi | null,
};

const STORAGE_KEY = 'campus-map.cinematic.paths.v1';

function loadStored(): Record<string, CameraPath> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    const out: Record<string, CameraPath> = {};
    for (const [name, v] of Object.entries(raw)) {
      const p = sanitizePath(v);
      if (p) out[name] = { ...p, name };
    }
    return out;
  } catch {
    return {};
  }
}

function persist(all: Record<string, CameraPath>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* quota / private mode — surfaced via notice by callers */
  }
}

const initial = (): CinematicState => ({
  open: false,
  status: 'idle',
  freeFlight: false,
  path: defaultPath(),
  selectedId: null,
  editTarget: false,
  presetId: null,
  presetBuildingId: null,
  settings: { speed: 1, heightOffset: 0, banking: true, autoHide: true, showPath: true },
  rec: {
    resolutionId: '1080',
    fps: 30,
    wholeSequence: true,
    swapRB: false,
    phase: 'idle',
    startedAt: 0,
    supported: typeof window !== 'undefined' ? isRecordingSupported() : false,
    error: null,
    downloadUrl: null,
    downloadName: null,
    sizeBytes: 0,
  },
  savedNames: [],
  notice: null,
});

let state: CinematicState = initial();
const listeners = new Set<() => void>();
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

function set(patch: Partial<CinematicState> | ((s: CinematicState) => Partial<CinematicState>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}

function notify(msg: string) {
  set({ notice: msg });
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => set({ notice: null }), 3500);
}

const setPath = (fn: (p: CameraPath) => CameraPath) => set((s) => ({ path: fn(s.path) }));

const clampTime = (t: number) => Math.min(Math.max(t, 0), totalDuration(state.path.keyframes));

export const cinematic = {
  getState: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  // ---- lifecycle -------------------------------------------------------------------------
  open() {
    if (state.open) return;
    const fov = runtime.api?.defaultFov() ?? state.path.fov;
    runtime.time = 0;
    set({
      open: true,
      status: 'idle',
      freeFlight: false,
      savedNames: Object.keys(loadStored()),
      path: state.path.keyframes.length ? state.path : { ...state.path, fov },
    });
  },
  close() {
    if (!state.open) return;
    if (state.rec.phase === 'recording') void cinematic.stopRecording();
    runtime.time = 0;
    set({ open: false, status: 'idle', freeFlight: false });
  },

  // ---- playback --------------------------------------------------------------------------
  play() {
    if (state.path.keyframes.length < 2) {
      notify('Add at least 2 keyframes or pick a preset to play a shot');
      return;
    }
    const total = totalDuration(state.path.keyframes);
    if (runtime.time >= total - 0.01) runtime.time = 0;
    runtime.blendIn = true;
    runtime.discontinuity = true;
    set({ status: 'playing', freeFlight: false });
  },
  pause() {
    if (state.status === 'playing') set({ status: 'paused' });
  },
  togglePlay() {
    state.status === 'playing' ? cinematic.pause() : cinematic.play();
  },
  stop() {
    if (state.rec.phase === 'recording') void cinematic.stopRecording();
    runtime.time = 0;
    runtime.discontinuity = true;
    runtime.applyPending = state.path.keyframes.length ? 'smooth' : null;
    set({ status: 'idle' });
  },
  seek(t: number) {
    runtime.time = clampTime(t);
    runtime.discontinuity = true;
    runtime.applyPending = 'snap';
    if (state.status === 'idle') set({ status: 'paused', freeFlight: false });
  },
  /** Called by the controller when a non-looping shot reaches its end. */
  playbackEnded() {
    set({ status: 'paused' });
    if (state.rec.phase === 'recording' && state.rec.wholeSequence) void cinematic.stopRecording();
  },
  setFreeFlight(on: boolean) {
    if (on === state.freeFlight) return;
    if (on) set({ freeFlight: true, status: state.status === 'playing' ? 'paused' : state.status, presetId: 'freeFlight' });
    else set({ freeFlight: false });
  },

  // ---- settings / path-level -------------------------------------------------------------
  setSettings(patch: Partial<Settings>) {
    set((s) => ({ settings: { ...s.settings, ...patch } }));
    if ('heightOffset' in patch && state.status === 'paused') runtime.applyPending = 'snap';
  },
  setPathProps(patch: Partial<Pick<CameraPath, 'easing' | 'smoothness' | 'fov' | 'lockTarget' | 'loop' | 'name'>>) {
    setPath((p) => ({ ...p, ...patch }));
    if (state.status === 'paused') runtime.applyPending = 'snap';
  },
  setPresetBuilding(id: string | null) {
    set({ presetBuildingId: id });
  },

  // ---- presets ---------------------------------------------------------------------------
  applyPreset(id: PresetId, geometry: CampusGeometry, buildingId?: string) {
    if (id === 'freeFlight') {
      cinematic.setFreeFlight(true);
      return;
    }
    const res = buildPreset(id, geometry, buildingId);
    if (!res) {
      notify('Select a building first');
      return;
    }
    const wasPlaying = state.status === 'playing';
    runtime.time = 0;
    runtime.discontinuity = true;
    setPath((p) => ({ ...p, ...res, fov: res.fov ?? p.fov, name: id }));
    set({
      presetId: id,
      presetBuildingId: buildingId ?? state.presetBuildingId,
      selectedId: null,
      freeFlight: false,
      status: wasPlaying ? 'playing' : 'idle',
    });
    if (wasPlaying) runtime.blendIn = true;
    else runtime.applyPending = 'smooth'; // preview: fly to the start of the new shot
  },

  // ---- keyframes -------------------------------------------------------------------------
  select(id: string | null) {
    set({ selectedId: id });
  },
  setEditTarget(on: boolean) {
    set({ editTarget: on });
  },
  addKeyframeFromCamera() {
    const pose = runtime.api?.getPose();
    if (!pose) return;
    const kfs = state.path.keyframes;
    const kf: Keyframe = {
      id: makeKeyframeId(),
      position: pose.position,
      target: pose.target,
      roll: 0,
      duration: kfs.length ? 3 : 0,
    };
    const idx = state.selectedId ? kfs.findIndex((k) => k.id === state.selectedId) : -1;
    const at = idx >= 0 ? idx + 1 : kfs.length;
    const next = [...kfs.slice(0, at), kf, ...kfs.slice(at)];
    setPath((p) => ({ ...p, keyframes: fixFirst(next) }));
    set({ selectedId: kf.id });
  },
  updateKeyframe(id: string, patch: Partial<Omit<Keyframe, 'id'>>) {
    setPath((p) => ({
      ...p,
      keyframes: p.keyframes.map((k) =>
        k.id === id
          ? { ...k, ...patch, duration: patch.duration !== undefined ? Math.max(MIN_SEGMENT, patch.duration) : k.duration }
          : k,
      ),
    }));
  },
  deleteKeyframe(id: string) {
    const kfs = state.path.keyframes;
    const idx = kfs.findIndex((k) => k.id === id);
    if (idx < 0) return;
    const next = fixFirst(kfs.filter((k) => k.id !== id));
    setPath((p) => ({ ...p, keyframes: next }));
    runtime.time = clampTime(runtime.time);
    set({ selectedId: next[Math.min(idx, next.length - 1)]?.id ?? null });
  },
  duplicateKeyframe(id: string) {
    const kfs = state.path.keyframes;
    const idx = kfs.findIndex((k) => k.id === id);
    if (idx < 0) return;
    const src = kfs[idx];
    // Slight offset so the copy is distinguishable and draggable in the viewport.
    const copy: Keyframe = {
      ...src,
      id: makeKeyframeId(),
      position: [src.position[0] + 4, src.position[1], src.position[2] + 4],
      target: [...src.target],
      duration: Math.max(MIN_SEGMENT, src.duration || 3),
    };
    const next = [...kfs.slice(0, idx + 1), copy, ...kfs.slice(idx + 1)];
    setPath((p) => ({ ...p, keyframes: fixFirst(next) }));
    set({ selectedId: copy.id });
  },
  moveKeyframe(id: string, dir: -1 | 1) {
    const kfs = [...state.path.keyframes];
    const idx = kfs.findIndex((k) => k.id === id);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= kfs.length) return;
    [kfs[idx], kfs[to]] = [kfs[to], kfs[idx]];
    setPath((p) => ({ ...p, keyframes: fixFirst(kfs) }));
  },
  goToKeyframe(id: string) {
    const k = state.path.keyframes.find((x) => x.id === id);
    if (!k) return;
    if (state.status === 'playing') cinematic.pause();
    if (state.freeFlight) cinematic.setFreeFlight(false);
    runtime.api?.flyTo(k.position, k.target, true);
    set({ selectedId: id });
  },
  clearKeyframes() {
    runtime.time = 0;
    setPath((p) => ({ ...p, keyframes: [] }));
    set({ selectedId: null, status: 'idle' });
  },

  // ---- saved paths -----------------------------------------------------------------------
  savePath(name: string) {
    const clean = name.trim();
    if (!clean) return notify('Enter a name for the path');
    if (!state.path.keyframes.length) return notify('Nothing to save: the path has no keyframes');
    const all = loadStored();
    all[clean] = { ...state.path, name: clean };
    persist(all);
    setPath((p) => ({ ...p, name: clean }));
    set({ savedNames: Object.keys(all) });
    notify(`Saved “${clean}”`);
  },
  loadPath(name: string) {
    const p = loadStored()[name];
    if (!p) return notify('Saved path not found');
    cinematic.stop();
    set({ path: p, selectedId: null, presetId: null });
    runtime.applyPending = 'smooth';
    notify(`Loaded “${name}”`);
  },
  deletePath(name: string) {
    const all = loadStored();
    delete all[name];
    persist(all);
    set({ savedNames: Object.keys(all) });
  },
  exportPathJson(): string {
    return JSON.stringify({ format: 'campus-map-camera-path', version: 1, ...state.path }, null, 2);
  },
  importPathJson(json: string) {
    try {
      const p = sanitizePath(JSON.parse(json));
      if (!p) return notify('Invalid camera path file');
      cinematic.stop();
      set({ path: p, selectedId: null, presetId: null });
      runtime.applyPending = p.keyframes.length ? 'smooth' : null;
      notify(`Imported “${p.name}”`);
    } catch {
      notify('Invalid camera path file');
    }
  },

  // ---- recording -------------------------------------------------------------------------
  setRecording(patch: Partial<Pick<RecordingState, 'resolutionId' | 'fps' | 'wholeSequence' | 'swapRB'>>) {
    if (state.rec.phase === 'recording') return;
    set((s) => ({ rec: { ...s.rec, ...patch } }));
  },
  startRecording() {
    const { rec } = state;
    if (rec.phase === 'recording') return;
    const res = RESOLUTIONS.find((r) => r.id === rec.resolutionId) ?? RESOLUTIONS[1];
    try {
      if (rec.downloadUrl) URL.revokeObjectURL(rec.downloadUrl);
      recorderEngine.start({ width: res.width, height: res.height, fps: rec.fps, swapRB: rec.swapRB });
    } catch (e) {
      set({ rec: { ...rec, error: e instanceof Error ? e.message : String(e), downloadUrl: null } });
      return;
    }
    set({ rec: { ...rec, phase: 'recording', startedAt: performance.now(), error: null, downloadUrl: null, downloadName: null, sizeBytes: 0 } });
    if (rec.wholeSequence && state.path.keyframes.length >= 2) {
      runtime.time = 0;
      runtime.blendIn = false;
      runtime.discontinuity = true;
      runtime.applyPending = 'snap';
      set({ status: 'playing', freeFlight: false });
    }
  },
  async stopRecording() {
    if (state.rec.phase !== 'recording') return;
    set((s) => ({ rec: { ...s.rec, phase: 'idle' } }));
    try {
      const blob = await recorderEngine.stop();
      const url = URL.createObjectURL(blob);
      const name = `campus-cinematic-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
      set((s) => ({ rec: { ...s.rec, downloadUrl: url, downloadName: name, sizeBytes: blob.size, error: null } }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      notify('Recording saved as WebM');
    } catch (e) {
      set((s) => ({ rec: { ...s.rec, error: e instanceof Error ? e.message : String(e) } }));
    }
  },
};

/** Keeps the invariant: the first keyframe has duration 0. */
function fixFirst(kfs: Keyframe[]): Keyframe[] {
  return kfs.map((k, i) =>
    i === 0 ? { ...k, duration: 0 } : { ...k, duration: k.duration > 0 ? k.duration : 3 },
  );
}

export function useCinematic<T>(selector: (s: CinematicState) => T): T {
  return useSyncExternalStore(cinematic.subscribe, () => selector(state), () => selector(state));
}

/** Test helper. */
export function __resetCinematicForTests() {
  state = initial();
  runtime.time = 0;
  runtime.applyPending = null;
  runtime.blendIn = false;
  runtime.api = null;
}
