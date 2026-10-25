import type { CampusGeometry } from '../../domain/geometry/types';
import { FOUNTAIN_DIMENSIONS } from '../../components/3d/CampusFountain';
import type { TimeOfDayPresetId } from '../config/gameConfig';

export type FootstepSurfaceType = 'pavement' | 'grass' | 'wood' | 'indoor';

export interface AudioListenerState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  isIndoor: boolean;
  timeOfDay: TimeOfDayPresetId;
}

/**
 * Determines the walkable surface material under the player at (x, y, z)
 * so footsteps sound distinct on stone/asphalt pavement, grass lawns,
 * wooden fountain bridges, and indoor library floors.
 */
export function detectFootstepSurface(
  x: number,
  y: number,
  z: number,
  geometry: CampusGeometry,
  isIndoor: boolean,
): FootstepSurfaceType {
  if (isIndoor) {
    return 'indoor';
  }

  // Check if player is on the wooden Grand Fountain bridges
  const pitchFeature = geometry.context.find((f) => f.id === 'pitch');
  const fountainX =
    pitchFeature && pitchFeature.footprint.type === 'rect'
      ? pitchFeature.footprint.center[0] - 50.0
      : -2.45;
  const fountainZ =
    pitchFeature && pitchFeature.footprint.type === 'rect'
      ? pitchFeature.footprint.center[1]
      : 15.9;
  const s = FOUNTAIN_DIMENSIONS.defaultScale;
  const outerHalfLen = (FOUNTAIN_DIMENSIONS.outerLength * s) / 2;
  const outerHalfWid = (FOUNTAIN_DIMENSIONS.outerWidth * s) / 2 + 3.0;
  const isNearFountain1 =
    Math.abs(x - fountainX) <= outerHalfLen && Math.abs(z - fountainZ) <= outerHalfWid;
  const isNearFountain2 =
    Math.abs(x - 5.5) <= outerHalfLen && Math.abs(z - (-23.1)) <= outerHalfWid;
  if (y > 0.25 && (isNearFountain1 || isNearFountain2)) {
    return 'wood';
  }

  // Check if player is inside any lawn footprint (and not on a road)
  for (const feat of geometry.context) {
    if (feat.kind === 'road' && feat.footprint.type === 'rect') {
      const hw = feat.footprint.size[0] / 2;
      const hd = feat.footprint.size[1] / 2;
      if (
        Math.abs(x - feat.footprint.center[0]) <= hw &&
        Math.abs(z - feat.footprint.center[1]) <= hd
      ) {
        return 'pavement';
      }
    }
  }

  for (const feat of geometry.context) {
    if (feat.kind !== 'lawn') continue;
    if (feat.footprint.type === 'rect') {
      const hw = feat.footprint.size[0] / 2;
      const hd = feat.footprint.size[1] / 2;
      if (
        Math.abs(x - feat.footprint.center[0]) <= hw &&
        Math.abs(z - feat.footprint.center[1]) <= hd
      ) {
        return 'grass';
      }
    } else if (feat.footprint.type === 'polygon' && feat.footprint.points.length >= 3) {
      const pts = feat.footprint.points;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0];
        const zi = pts[i][1];
        const xj = pts[j][0];
        const zj = pts[j][1];
        const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
        if (intersect) inside = !inside;
      }
      if (inside) return 'grass';
    }
  }

  return 'pavement';
}

/**
 * Self-contained procedural Web Audio soundscape engine for the 3D Campus Walkthrough.
 * Produces:
 * - Gentle wind & foliage breeze
 * - Spatialized Grand Fountain cascade & geyser water ambience
 * - Subtle daytime bird calls in outdoor greenery
 * - Calm indoor room acoustics when inside a building
 * - Surface-dependent footsteps (stone pavement, lawn grass, wooden bridge deck, indoor floor)
 */
export class CampusAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private fountainGain: GainNode | null = null;
  private fountainPanner: StereoPannerNode | null = null;
  private indoorGain: GainNode | null = null;

  private muted = false;
  private volume = 0.65;
  private initialized = false;
  private birdTimerId: number | null = null;
  private lastListener: AudioListenerState = {
    x: 85,
    y: 2.2,
    z: 15.9,
    yaw: Math.PI / 2,
    isIndoor: false,
    timeOfDay: 'day',
  };

  public isMuted(): boolean {
    return this.muted;
  }

  public getVolume(): number {
    return this.volume;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMasterGain();
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    this.applyMasterGain();
  }

  private applyMasterGain(): void {
    if (!this.ctx || !this.masterGain) return;
    const target = this.muted ? 0 : this.volume;
    this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.06);
  }

  /**
   * Initializes or resumes the Web Audio graph upon user gesture.
   */
  public resumeFromUserGesture(): void {
    if (typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx();
        this.setupAmbientGraph();
      } catch {
        return;
      }
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private createPinkNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const output = buffer.getChannelData(0);

    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.035;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  private setupAmbientGraph(): void {
    if (!this.ctx || this.initialized) return;
    this.initialized = true;
    const ctx = this.ctx;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : this.volume;
    this.masterGain.connect(ctx.destination);

    const noiseBuffer = this.createPinkNoiseBuffer(ctx, 4.0);

    // 1. Outdoor Wind & Foliage Rustle
    const windSource = ctx.createBufferSource();
    windSource.buffer = noiseBuffer;
    windSource.loop = true;

    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 320;
    this.windFilter.Q.value = 0.9;

    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.08;

    windSource.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    windSource.start();

    // 2. Positional Fountain Water Cascade
    const fountainSource = ctx.createBufferSource();
    fountainSource.buffer = noiseBuffer;
    fountainSource.loop = true;

    const fountainFilter = ctx.createBiquadFilter();
    fountainFilter.type = 'bandpass';
    fountainFilter.frequency.value = 950;
    fountainFilter.Q.value = 0.65;

    this.fountainGain = ctx.createGain();
    this.fountainGain.gain.value = 0.0;

    if (typeof ctx.createStereoPanner === 'function') {
      this.fountainPanner = ctx.createStereoPanner();
      fountainSource.connect(fountainFilter);
      fountainFilter.connect(this.fountainPanner);
      this.fountainPanner.connect(this.fountainGain);
    } else {
      fountainSource.connect(fountainFilter);
      fountainFilter.connect(this.fountainGain);
    }
    this.fountainGain.connect(this.masterGain);
    fountainSource.start();

    // 3. Subtle Indoor Room Tone
    const indoorSource = ctx.createBufferSource();
    indoorSource.buffer = noiseBuffer;
    indoorSource.loop = true;

    const indoorFilter = ctx.createBiquadFilter();
    indoorFilter.type = 'lowpass';
    indoorFilter.frequency.value = 160;

    this.indoorGain = ctx.createGain();
    this.indoorGain.gain.value = 0.0;

    indoorSource.connect(indoorFilter);
    indoorFilter.connect(this.indoorGain);
    this.indoorGain.connect(this.masterGain);
    indoorSource.start();

    // 4. Periodic Subtle Bird Calls in Outdoor Greenery
    if (typeof window !== 'undefined') {
      this.birdTimerId = window.setInterval(() => {
        this.maybeTriggerBirdCall();
      }, 3600);
    }
  }

  private maybeTriggerBirdCall(): void {
    if (!this.ctx || !this.masterGain || this.muted || this.ctx.state !== 'running') return;
    if (this.lastListener.isIndoor || this.lastListener.timeOfDay === 'night') return;
    if (Math.random() > 0.62) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Two-note or three-note gentle melodic bird chirp
    const noteCount = Math.random() > 0.45 ? 2 : 3;
    const baseFreq = 2100 + Math.random() * 950;

    for (let i = 0; i < noteCount; i++) {
      const start = now + i * 0.13;
      const dur = 0.085;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      const fStart = baseFreq * (1 + i * 0.09);
      const fEnd = fStart * (Math.random() > 0.3 ? 1.18 : 0.88);
      osc.frequency.setValueAtTime(fStart, start);
      osc.frequency.exponentialRampToValueAtTime(fEnd, start + dur);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.018, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

      if (typeof ctx.createStereoPanner === 'function') {
        const panner = ctx.createStereoPanner();
        panner.pan.value = (Math.random() - 0.5) * 1.4;
        osc.connect(gain);
        gain.connect(panner);
        panner.connect(this.masterGain);
      } else {
        osc.connect(gain);
        gain.connect(this.masterGain);
      }

      osc.start(start);
      osc.stop(start + dur + 0.01);
    }
  }

  /**
   * Updates spatial audio attenuation and indoor/outdoor crossfades.
   */
  public updateListener(state: AudioListenerState): void {
    this.lastListener = state;
    if (!this.ctx || !this.initialized || this.ctx.state !== 'running') return;

    const now = this.ctx.currentTime;

    // Fountain center at [-2.45, 0, 15.9]
    const fx = -2.45;
    const fz = 15.9;
    const dx = fx - state.x;
    const dz = fz - state.z;
    const distToFountain = Math.hypot(dx, dz);

    // Distance attenuation for the 81m-long fountain basin
    const effectiveDist = Math.max(0, distToFountain - 14);
    const fountainLevel = state.isIndoor
      ? 0.005
      : Math.max(0, Math.min(0.26, 0.26 * Math.exp(-effectiveDist / 38)));

    if (this.fountainGain) {
      this.fountainGain.gain.setTargetAtTime(fountainLevel, now, 0.15);
    }

    if (this.fountainPanner && distToFountain > 0.5) {
      // Compute stereo pan from player's right vector (cos(yaw), 0, -sin(yaw))
      const rightX = Math.cos(state.yaw);
      const rightZ = -Math.sin(state.yaw);
      const pan = Math.max(-0.85, Math.min(0.85, (dx * rightX + dz * rightZ) / distToFountain));
      this.fountainPanner.pan.setTargetAtTime(pan, now, 0.12);
    }

    // Wind modulation & indoor crossfade
    if (this.windGain && this.windFilter) {
      const targetWind = state.isIndoor ? 0.012 : 0.085;
      this.windGain.gain.setTargetAtTime(targetWind, now, 0.25);
      const gustFreq = 260 + Math.sin(now * 0.45) * 90;
      this.windFilter.frequency.setTargetAtTime(gustFreq, now, 0.2);
    }

    if (this.indoorGain) {
      this.indoorGain.gain.setTargetAtTime(state.isIndoor ? 0.065 : 0.0, now, 0.25);
    }
  }

  /**
   * Triggers a single surface-dependent footstep sound.
   */
  public playFootstep(surface: FootstepSurfaceType, isSprinting: boolean): void {
    if (!this.ctx || !this.masterGain || this.muted || this.ctx.state !== 'running') return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const pitchJitter = 0.92 + Math.random() * 0.16;
    const gainScale = isSprinting ? 1.25 : 0.85;

    // Short noise burst shaped by surface filter + low thud oscillator
    const dur = surface === 'grass' ? 0.095 : 0.065;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.pow(1 - i / bufferSize, surface === 'grass' ? 1.4 : 2.4);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    const filter = ctx.createBiquadFilter();
    const stepGain = ctx.createGain();

    if (surface === 'grass') {
      filter.type = 'bandpass';
      filter.frequency.value = 1550 * pitchJitter;
      filter.Q.value = 1.1;
      stepGain.gain.value = 0.055 * gainScale;
    } else if (surface === 'wood') {
      filter.type = 'bandpass';
      filter.frequency.value = 420 * pitchJitter;
      filter.Q.value = 2.6;
      stepGain.gain.value = 0.09 * gainScale;
    } else if (surface === 'indoor') {
      filter.type = 'lowpass';
      filter.frequency.value = 680 * pitchJitter;
      filter.Q.value = 1.4;
      stepGain.gain.value = 0.05 * gainScale;
    } else {
      // Stone / asphalt pavement
      filter.type = 'bandpass';
      filter.frequency.value = 880 * pitchJitter;
      filter.Q.value = 1.3;
      stepGain.gain.value = 0.065 * gainScale;
    }

    noise.connect(filter);
    filter.connect(stepGain);
    stepGain.connect(this.masterGain);
    noise.start(now);

    // Subtle low-end heel thud for wood, pavement, and indoor surfaces
    if (surface !== 'grass') {
      const osc = ctx.createOscillator();
      const thudGain = ctx.createGain();
      osc.type = 'sine';
      const baseThud = surface === 'wood' ? 115 : surface === 'indoor' ? 95 : 130;
      osc.frequency.setValueAtTime(baseThud * pitchJitter, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.055);

      thudGain.gain.setValueAtTime(0.05 * gainScale, now);
      thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

      osc.connect(thudGain);
      thudGain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.065);
    }
  }

  /**
   * Plays a soft landing sound when touching down after a jump.
   */
  public playLanding(surface: FootstepSurfaceType): void {
    this.playFootstep(surface, true);
  }

  public dispose(): void {
    if (this.birdTimerId !== null && typeof window !== 'undefined') {
      window.clearInterval(this.birdTimerId);
      this.birdTimerId = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.initialized = false;
  }
}

export const sharedCampusAudio = new CampusAudioEngine();
