/**
 * Records the actual WebGL canvas (never the surrounding DOM UI) with MediaRecorder.
 *
 * Each rendered frame the WebGL canvas is copied (cover-fit) into an offscreen 2D canvas of the
 * requested resolution; that canvas is what `captureStream(fps)` records. Copying happens in an
 * R3F "after effect" (same task as the render) so the drawing buffer is still valid without
 * `preserveDrawingBuffer`.
 */

export type RecorderOptions = {
  width: number;
  height: number;
  fps: number;
  /** Swap red and blue channels (workaround for encoders that deliver BGR-ordered video). */
  swapRB?: boolean;
};

/** SVG colour matrix (sRGB space) exchanging the R and B channels, used as a 2D-canvas filter. */
const SWAP_RB_FILTER =
  'url("data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg'><filter id='f' color-interpolation-filters='sRGB'>" +
      "<feColorMatrix type='matrix' values='0 0 1 0 0  0 1 0 0 0  1 0 0 0 0  0 0 0 1 0'/></filter></svg>",
  ) +
  '#f")';

// VP8 first: it is encoded in software by Chrome, whereas VP9/AV1 may use a hardware encoder that on
// some Linux GPU/driver combinations outputs red and blue swapped.
const MIME_CANDIDATES = [
  'video/webm;codecs=vp8',
  'video/webm;codecs=vp9',
  'video/webm;codecs=av1',
  'video/webm',
];

export function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export function isRecordingSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
    pickMimeType() !== null
  );
}

class CinematicRecorderEngine {
  private source: HTMLCanvasElement | null = null;
  private out: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private swapRB = false;

  setSource(canvas: HTMLCanvasElement | null) {
    this.source = canvas;
  }

  get active(): boolean {
    return this.recorder !== null && this.recorder.state !== 'inactive';
  }

  start(opts: RecorderOptions): void {
    if (!this.source) throw new Error('WebGL canvas is not ready');
    const mimeType = pickMimeType();
    if (!mimeType || typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
      throw new Error('Video recording (MediaRecorder + WebM) is not supported by this browser');
    }
    const out = document.createElement('canvas');
    out.width = opts.width;
    out.height = opts.height;
    const ctx = out.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not create recording canvas');
    this.out = out;
    this.ctx = ctx;
    this.swapRB = !!opts.swapRB;
    this.chunks = [];
    this.capture(); // prime first frame
    const stream = out.captureStream(opts.fps);
    const pixels = opts.width * opts.height;
    const bitrate = Math.round(Math.min(40_000_000, Math.max(5_000_000, pixels * opts.fps * 0.1)));
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    rec.start(500);
    this.recorder = rec;
  }

  /** Copies the current WebGL frame into the output canvas. No-op unless recording. */
  capture(): void {
    const { source, out, ctx } = this;
    if (!source || !out || !ctx || !source.width || !source.height) return;
    const sw = source.width;
    const sh = source.height;
    const scale = Math.max(out.width / sw, out.height / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.filter = this.swapRB ? SWAP_RB_FILTER : 'none';
    ctx.drawImage(source, (out.width - dw) / 2, (out.height - dh) / 2, dw, dh);
  }

  stop(): Promise<Blob> {
    const rec = this.recorder;
    if (!rec) return Promise.reject(new Error('Not recording'));
    return new Promise((resolve, reject) => {
      rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: rec.mimeType || 'video/webm' });
        this.cleanup();
        blob.size > 0 ? resolve(blob) : reject(new Error('Recording is empty'));
      };
      rec.onerror = () => {
        this.cleanup();
        reject(new Error('Recorder error'));
      };
      if (rec.state !== 'inactive') rec.stop();
      else rec.onstop?.(new Event('stop'));
    });
  }

  private cleanup() {
    this.recorder?.stream.getTracks().forEach((t) => t.stop());
    this.recorder = null;
    this.out = null;
    this.ctx = null;
    this.chunks = [];
  }
}

export const recorderEngine = new CinematicRecorderEngine();
