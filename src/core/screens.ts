import * as THREE from 'three';
import { PALETTE } from './materials';

/** Shared options for LCD canvas screens. */
export interface ScreenOptions {
  width?: number;
  height?: number;
  background?: string;
  foreground?: string;
  caption?: string;
  /** Caption color. */
  captionColor?: string;
}

/** Scope / oscilloscope LCD handle. */
export interface ScopeScreen {
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  /** Redraw from analyser time-domain data. */
  update: (dt: number) => void;
  setCaption: (text: string) => void;
  dispose: () => void;
}

/** Parameter readout LCD handle. */
export interface ParamScreen {
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  update: (dt: number) => void;
  /** Show last-touched parameter. */
  setParam: (name: string, value01: number) => void;
  /** Show last played note (e.g. "C4"). */
  setNote: (noteName: string) => void;
  setCaption: (text: string) => void;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

function makeTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function drawScanlines(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < h; y += 3) {
    ctx.fillRect(0, y, w, 1);
  }
}

/**
 * Oscilloscope LCD: dark green-black background + bright waveform from analyser.
 *
 * @param analyser - Web Audio AnalyserNode (time-domain)
 * @param opts - Size / color overrides (v4 neon variant)
 */
export function makeScopeScreen(analyser: AnalyserNode, opts: ScreenOptions = {}): ScopeScreen {
  const w = opts.width ?? 256;
  const h = opts.height ?? 128;
  const bg = opts.background ?? PALETTE.lcdBg;
  const fg = opts.foreground ?? PALETTE.lcdGreen;
  let caption = opts.caption ?? 'MOD DESK';
  const captionColor = opts.captionColor ?? fg;
  const { canvas, ctx } = makeCanvas(w, h);
  const texture = makeTexture(canvas);
  const td = new Uint8Array(analyser.fftSize);
  let phase = 0;

  const update = (dt: number): void => {
    phase += dt;
    analyser.getByteTimeDomainData(td);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Subtle grid
    ctx.strokeStyle = 'rgba(92,255,154,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    ctx.strokeStyle = fg;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const n = td.length;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      const v = td[i]! / 128 - 1;
      const y = h * 0.55 + v * h * 0.35;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Glow pass
    ctx.strokeStyle = 'rgba(92,255,154,0.25)';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = captionColor;
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillText(caption, 8, 14);

    // Tiny activity blip
    ctx.fillStyle = fg;
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(phase * 4);
    ctx.fillRect(w - 14, 6, 6, 6);
    ctx.globalAlpha = 1;

    drawScanlines(ctx, w, h);
    texture.needsUpdate = true;
  };

  return {
    texture,
    canvas,
    update,
    setCaption(text: string) {
      caption = text;
    },
    dispose() {
      texture.dispose();
    },
  };
}

/**
 * Parameter readout LCD: last param name + value bar + note + mini spectrum.
 *
 * @param opts - Pass `analyser` via opts extension for spectrum; or call later through update with bound analyser
 */
export function makeParamScreen(
  opts: ScreenOptions & { analyser?: AnalyserNode } = {},
): ParamScreen {
  const w = opts.width ?? 256;
  const h = opts.height ?? 128;
  const bg = opts.background ?? PALETTE.lcdBg;
  const fg = opts.foreground ?? PALETTE.lcdGreen;
  let caption = opts.caption ?? 'PARAMS';
  const captionColor = opts.captionColor ?? fg;
  const analyser = opts.analyser ?? null;
  const { canvas, ctx } = makeCanvas(w, h);
  const texture = makeTexture(canvas);
  let paramName = 'cutoff';
  let paramValue = 0.65;
  let noteName = '—';
  const freq = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

  const update = (_dt: number): void => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = captionColor;
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillText(caption, 8, 14);

    ctx.font = 'bold 16px ui-monospace, monospace';
    ctx.fillStyle = fg;
    ctx.fillText(paramName.toUpperCase(), 8, 38);

    // Value bar
    const barX = 8;
    const barY = 48;
    const barW = w - 16;
    const barH = 10;
    ctx.fillStyle = 'rgba(92,255,154,0.15)';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = fg;
    ctx.fillRect(barX, barY, barW * paramValue, barH);
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText(`${Math.round(paramValue * 100)}%`, barX, barY + 24);

    ctx.fillText(`NOTE ${noteName}`, barX, barY + 42);

    // Spectrum
    if (analyser && freq) {
      analyser.getByteFrequencyData(freq);
      const specY = h - 28;
      const specH = 22;
      const bars = 32;
      const step = Math.floor(freq.length / bars);
      for (let i = 0; i < bars; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += freq[i * step + j]!;
        const v = sum / step / 255;
        const bh = v * specH;
        ctx.fillStyle = fg;
        ctx.globalAlpha = 0.35 + v * 0.65;
        ctx.fillRect(8 + i * ((w - 16) / bars), specY + specH - bh, (w - 16) / bars - 1, bh);
      }
      ctx.globalAlpha = 1;
    }

    drawScanlines(ctx, w, h);
    texture.needsUpdate = true;
  };

  return {
    texture,
    canvas,
    update,
    setParam(name: string, value01: number) {
      paramName = name;
      paramValue = Math.max(0, Math.min(1, value01));
    },
    setNote(name: string) {
      noteName = name;
    },
    setCaption(text: string) {
      caption = text;
    },
    dispose() {
      texture.dispose();
    },
  };
}

/** Convert MIDI number to note name (e.g. 60 → "C4"). */
export function midiToNoteName(midi: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const name = names[((midi % 12) + 12) % 12]!;
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}
