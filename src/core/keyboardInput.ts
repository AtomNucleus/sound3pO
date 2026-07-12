import { EventEmitter } from './interaction';

/** Events from computer-keyboard note input. */
export interface KeyboardInputEvents {
  noteOn: { midi: number; key: string };
  noteOff: { midi: number; key: string };
}

/**
 * QWERTY → chromatic mapping (A W S E D F T G Y H U J K = C4..C5).
 *
 * ```
 *   W E   T Y U
 * A S D F G H J K
 * ```
 */
export const KEY_TO_SEMI: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
};

/** Options for {@link KeyboardInput}. */
export interface KeyboardInputOptions {
  /** MIDI base note for key "A". Default 60 (C4). */
  baseMidi?: number;
}

/**
 * Computer-keyboard note input with key-repeat filtering.
 *
 * @example
 * ```ts
 * const kb = new KeyboardInput();
 * kb.on('noteOn', ({ midi }) => synth.noteOn(midi));
 * kb.on('noteOff', ({ midi }) => synth.noteOff(midi));
 * ```
 */
export class KeyboardInput extends EventEmitter<KeyboardInputEvents> {
  private baseMidi: number;
  private held = new Set<string>();
  private bound = false;
  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;

  constructor(opts: KeyboardInputOptions = {}) {
    super();
    this.baseMidi = opts.baseMidi ?? 60;
    this.onKeyDown = (e) => this.handleDown(e);
    this.onKeyUp = (e) => this.handleUp(e);
    this.bind();
  }

  bind(): void {
    if (this.bound) return;
    this.bound = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  dispose(): void {
    if (!this.bound) return;
    this.bound = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.held.clear();
  }

  private handleDown(e: KeyboardEvent): void {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    const semi = KEY_TO_SEMI[key];
    if (semi == null) return;
    if (e.repeat || this.held.has(key)) return;
    this.held.add(key);
    e.preventDefault();
    this.emit('noteOn', { midi: this.baseMidi + semi, key });
  }

  private handleUp(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    const semi = KEY_TO_SEMI[key];
    if (semi == null) return;
    if (!this.held.has(key)) return;
    this.held.delete(key);
    this.emit('noteOff', { midi: this.baseMidi + semi, key });
  }
}
