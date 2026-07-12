import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  PALETTE,
  defaultMaterials,
  type MaterialFactory,
  type ColorInput,
} from './materials';

/** Interactive rotary knob. */
export interface KnobHandle {
  /** Knob mesh group (rotate locally around Y). */
  mesh: THREE.Object3D;
  id: string;
  label: string;
  /** Normalized value 0..1. */
  value: number;
  /** Set value and update visual rotation (~270° sweep). */
  setValue: (v: number) => void;
}

/** Piano key. */
export interface KeyHandle {
  mesh: THREE.Object3D;
  /** MIDI-style index within the built keyboard (0 = lowest). */
  noteIndex: number;
  /** MIDI note number (C4 = 60 by default for index 0 of white+black layout). */
  midi: number;
  isBlack: boolean;
  press: () => void;
  release: () => void;
}

/** Momentary / toggle button. */
export interface ButtonHandle {
  mesh: THREE.Object3D;
  id: string;
  label: string;
  active: boolean;
  toggle: () => void;
  setActive: (on: boolean) => void;
}

/** Step pad in the 4×4 grid. */
export interface PadHandle {
  mesh: THREE.Object3D;
  id: string;
  index: number;
  lit: boolean;
  setLit: (on: boolean) => void;
  toggle: () => void;
}

/** Patch jack / socket. */
export interface JackHandle {
  mesh: THREE.Object3D;
  id: string;
  /** World-space jack center (updates matrix). */
  getWorldPosition: (out?: THREE.Vector3) => THREE.Vector3;
  highlight: (on: boolean) => void;
}

/** LCD screen meshes (assign CanvasTexture via screens.ts). */
export interface DeviceScreens {
  screenA: THREE.Mesh;
  screenB: THREE.Mesh;
}

/** Full device handle returned by {@link buildDevice}. */
export interface DeviceHandle {
  root: THREE.Group;
  knobs: KnobHandle[];
  keys: KeyHandle[];
  buttons: ButtonHandle[];
  padGrid: PadHandle[];
  jacks: JackHandle[];
  screens: DeviceScreens;
  speakerGrille: THREE.Mesh;
  /** Find a jack by id. */
  getJack: (id: string) => JackHandle | undefined;
  /** Find a knob by id. */
  getKnob: (id: string) => KnobHandle | undefined;
  dispose: () => void;
}

/** Palette overrides for chassis / modules / accents. */
export interface DevicePalette {
  chassis?: ColorInput;
  teal?: ColorInput;
  orange?: ColorInput;
  vermilion?: ColorInput;
  mustard?: ColorInput;
  dark?: ColorInput;
  mint?: ColorInput;
  yellow?: ColorInput;
  whiteKey?: ColorInput;
  blackKey?: ColorInput;
}

/** Options for {@link buildDevice}. */
export interface BuildDeviceOptions {
  /** Color overrides. */
  palette?: DevicePalette;
  /**
   * Proportion exaggeration for chunky "toy" variants.
   * 1 = photo-faithful; >1 thickens chassis / knobs.
   */
  chunkiness?: number;
  /** Material factory override (toon / emissive pipelines). */
  materials?: MaterialFactory;
  /** Tilt of the top face toward the camera (radians). Default ~0.22. */
  tilt?: number;
  /** Overall uniform scale. Default 1 (≈4 units wide). */
  scale?: number;
}

const KNOB_SWEEP = (270 * Math.PI) / 180;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function makeLabelTexture(
  lines: string[],
  opts: { width?: number; height?: number; color?: string; align?: CanvasTextAlign; fontSize?: number; bold?: boolean } = {},
): THREE.CanvasTexture {
  const w = opts.width ?? 256;
  const h = opts.height ?? 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = opts.color ?? '#1a1a18';
  ctx.textAlign = opts.align ?? 'left';
  ctx.textBaseline = 'top';
  const base = opts.fontSize ?? 28;
  const x = opts.align === 'center' ? w / 2 : 8;
  lines.forEach((line, i) => {
    const size = i === 0 && opts.bold !== false ? base : base * 0.42;
    ctx.font = `${i === 0 && opts.bold !== false ? '700' : '500'} ${size}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(line, x, 6 + i * (i === 0 ? size + 4 : size * 1.15));
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function enableShadows(obj: THREE.Object3D): void {
  obj.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
}

/**
 * Procedurally build the full MOD DESK chassis, modules, knobs, keys, pads, jacks, and screens.
 *
 * Device is ~4 units wide, centered at origin, top face tilted toward +Z camera.
 *
 * @param options - Palette / chunkiness / material overrides
 * @returns Named interactive handles + root group
 */
export function buildDevice(options: BuildDeviceOptions = {}): DeviceHandle {
  const mats = options.materials ?? defaultMaterials;
  const chunk = options.chunkiness ?? 1;
  const tilt = options.tilt ?? 0.28;
  const scale = options.scale ?? 1;
  const p = {
    chassis: options.palette?.chassis ?? PALETTE.chassis,
    teal: options.palette?.teal ?? PALETTE.teal,
    orange: options.palette?.orange ?? PALETTE.orange,
    vermilion: options.palette?.vermilion ?? PALETTE.vermilion,
    mustard: options.palette?.mustard ?? PALETTE.mustard,
    dark: options.palette?.dark ?? PALETTE.dark,
    mint: options.palette?.mint ?? PALETTE.mint,
    yellow: options.palette?.yellow ?? PALETTE.yellow,
    whiteKey: options.palette?.whiteKey ?? PALETTE.whiteKey,
    blackKey: options.palette?.blackKey ?? PALETTE.blackKey,
  };

  const chassisMat = mats.matte(p.chassis);
  const darkMat = mats.matte(p.dark, { roughness: 0.55 });
  const darkMetal = mats.metal(p.dark, { roughness: 0.4, metalness: 0.6 });
  const tealMat = mats.matte(p.teal);
  const orangeMat = mats.matte(p.orange);
  const vermMat = mats.matte(p.vermilion);
  const mustardMat = mats.matte(p.mustard);
  const mintMat = mats.matte(p.mint);
  const yellowMat = mats.matte(p.yellow);
  const whiteKeyMat = mats.matte(p.whiteKey, { roughness: 0.7 });
  const blackKeyMat = mats.matte(p.blackKey, { roughness: 0.5 });

  const knobs: KnobHandle[] = [];
  const keys: KeyHandle[] = [];
  const buttons: ButtonHandle[] = [];
  const padGrid: PadHandle[] = [];
  const jacks: JackHandle[] = [];
  const disposables: Array<{ dispose: () => void }> = [
    chassisMat,
    darkMat,
    darkMetal,
    tealMat,
    orangeMat,
    vermMat,
    mustardMat,
    mintMat,
    yellowMat,
    whiteKeyMat,
    blackKeyMat,
  ];

  const root = new THREE.Group();
  root.name = 'modDesk';

  const bodyW = 4 * chunk;
  const bodyD = 2.55 * chunk;
  const bodyH = 0.38 * Math.sqrt(chunk);

  // Chassis
  const chassisGeo = new RoundedBoxGeometry(bodyW, bodyH, bodyD, 4, 0.08 * chunk);
  const chassis = new THREE.Mesh(chassisGeo, chassisMat);
  chassis.name = 'chassis';
  chassis.position.y = 0;
  root.add(chassis);

  // Top panel local group (y = top face)
  const topY = bodyH * 0.5 + 0.001;
  const panel = new THREE.Group();
  panel.name = 'topPanel';
  panel.position.y = topY;
  root.add(panel);

  // --- Logo ---
  const logoTex = makeLabelTexture(
    ['MOD DESK', '1 OSC MODULE', '2 FILTER SECTION', '3 LFO STAGE', '4 MASTER OUT'],
    { width: 320, height: 200, fontSize: 42, bold: true },
  );
  disposables.push(logoTex);
  const logoMat = new THREE.MeshBasicMaterial({ map: logoTex, transparent: true });
  disposables.push(logoMat);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.45), logoMat);
  logo.rotation.x = -Math.PI / 2;
  logo.position.set(-bodyW * 0.38, 0.002, -bodyD * 0.32);
  panel.add(logo);

  // --- Helpers ---
  const createKnob = (
    id: string,
    label: string,
    x: number,
    z: number,
    parent: THREE.Object3D,
    opts: { radius?: number; color?: ColorInput; initial?: number } = {},
  ): KnobHandle => {
    const r = (opts.radius ?? 0.055) * chunk;
    const g = new THREE.Group();
    g.name = `knob:${id}`;
    g.position.set(x, 0.02, z);
    parent.add(g);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.1, 0.018, 24), darkMetal);
    g.add(base);
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.92, r, 0.045, 24),
      mats.matte(opts.color ?? p.dark, { roughness: 0.45 }),
    );
    body.position.y = 0.028;
    g.add(body);
    const indicator = new THREE.Mesh(
      new THREE.BoxGeometry(r * 0.18, 0.01, r * 0.55),
      mats.matte('#F4F1EA'),
    );
    indicator.position.set(0, 0.052, -r * 0.25);
    g.add(indicator);

    let value = clamp01(opts.initial ?? 0.5);
    const apply = (): void => {
      // Indicator points "up" (−Z) at 0.5 mid; sweep from -135° to +135° around Y
      const angle = -KNOB_SWEEP * 0.5 + value * KNOB_SWEEP;
      g.rotation.y = angle;
    };
    apply();

    const handle: KnobHandle = {
      mesh: g,
      id,
      label,
      get value() {
        return value;
      },
      setValue(v: number) {
        value = clamp01(v);
        apply();
      },
    };
    knobs.push(handle);
    g.userData.interactive = { type: 'knob', handle };
    return handle;
  };

  const createJack = (id: string, x: number, z: number, parent: THREE.Object3D): JackHandle => {
    const g = new THREE.Group();
    g.name = `jack:${id}`;
    g.position.set(x, 0.01, z);
    parent.add(g);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.02, 16), darkMetal);
    g.add(sleeve);
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.022, 12), darkMat);
    hole.position.y = 0.002;
    g.add(hole);
    const ringMat = mats.emissive(p.mint, 0);
    disposables.push(ringMat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.004, 8, 20), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.012;
    ring.visible = false;
    g.add(ring);

    const handle: JackHandle = {
      mesh: g,
      id,
      getWorldPosition(out = new THREE.Vector3()) {
        return sleeve.getWorldPosition(out);
      },
      highlight(on: boolean) {
        ring.visible = on;
        ringMat.emissiveIntensity = on ? 1.4 : 0;
      },
    };
    jacks.push(handle);
    g.userData.interactive = { type: 'jack', handle };
    return handle;
  };

  const createButton = (
    id: string,
    label: string,
    x: number,
    z: number,
    parent: THREE.Object3D,
    color: ColorInput,
    size = 0.04,
  ): ButtonHandle => {
    const mat = mats.matte(color, { roughness: 0.55 });
    disposables.push(mat);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(size, size, 0.02, 16), mat);
    mesh.name = `button:${id}`;
    mesh.position.set(x, 0.012, z);
    parent.add(mesh);
    let active = false;
    const handle: ButtonHandle = {
      mesh,
      id,
      label,
      get active() {
        return active;
      },
      setActive(on: boolean) {
        active = on;
        mesh.position.y = on ? 0.006 : 0.012;
        mat.emissive = new THREE.Color(color);
        mat.emissiveIntensity = on ? 0.35 : 0;
      },
      toggle() {
        handle.setActive(!active);
      },
    };
    buttons.push(handle);
    mesh.userData.interactive = { type: 'button', handle };
    return handle;
  };

  // --- Top edge row: small cream knobs, red buttons, two LCDs ---
  const topZ = -bodyD * 0.38;
  for (let i = 0; i < 6; i++) {
    createKnob(`top-${i}`, `Top ${i + 1}`, -bodyW * 0.12 + i * 0.14, topZ, panel, {
      radius: 0.038,
      color: p.chassis,
      initial: 0.3 + i * 0.08,
    });
  }
  createButton('top-btn-a', 'Rec', bodyW * 0.18, topZ, panel, p.vermilion, 0.028);
  createButton('top-btn-b', 'Stop', bodyW * 0.24, topZ, panel, p.vermilion, 0.028);

  // LCD screens
  const makeScreen = (name: string, x: number, z: number, w: number, h: number): THREE.Mesh => {
    const bezel = new THREE.Mesh(new RoundedBoxGeometry(w + 0.04, 0.03, h + 0.04, 2, 0.02), darkMat);
    bezel.position.set(x, 0.01, z);
    panel.add(bezel);
    const glassMat = new THREE.MeshStandardMaterial({
      color: PALETTE.lcdBg,
      roughness: 0.35,
      metalness: 0.1,
      emissive: PALETTE.lcdBg,
      emissiveIntensity: 0.15,
    });
    disposables.push(glassMat);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat);
    screen.name = name;
    screen.rotation.x = -Math.PI / 2;
    screen.position.set(x, 0.026, z);
    panel.add(screen);
    return screen;
  };
  const screenA = makeScreen('screenA', bodyW * 0.22, topZ + 0.02, 0.42, 0.22);
  const screenB = makeScreen('screenB', bodyW * 0.4, topZ + 0.02, 0.32, 0.2);

  // Top-panel jacks for signature cable
  createJack('top-jack-l', bodyW * 0.3, topZ + 0.18, panel);
  createJack('top-jack-r', bodyW * 0.42, topZ + 0.18, panel);
  createJack('top-jack-extra', bodyW * 0.08, topZ + 0.18, panel);

  // --- Speaker grille ---
  const grilleGroup = new THREE.Group();
  grilleGroup.position.set(-bodyW * 0.34, 0.002, -bodyD * 0.02);
  panel.add(grilleGroup);
  const grilleBase = new THREE.Mesh(
    new RoundedBoxGeometry(0.7, 0.02, 0.85, 3, 0.06),
    mats.matte(p.chassis, { roughness: 0.9 }),
  );
  grilleGroup.add(grilleBase);
  const dotGeo = new THREE.CircleGeometry(0.012, 8);
  const dotMat = mats.matte('#5A5A55', { roughness: 0.9 });
  disposables.push(dotMat);
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 8; col++) {
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(-0.28 + col * 0.08, 0.012, -0.36 + row * 0.08);
      grilleGroup.add(dot);
    }
  }
  const speakerGrille = grilleBase;
  speakerGrille.name = 'speakerGrille';
  speakerGrille.userData.grilleRoot = grilleGroup;

  // --- Module panels ---
  const moduleY = 0.015;
  const moduleZ = bodyD * 0.02;
  const moduleH = 0.9;
  const moduleD = 0.95;

  const makeModule = (
    color: ColorInput,
    x: number,
    w: number,
    label: string,
  ): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, moduleY, moduleZ);
    panel.add(g);
    const plate = new THREE.Mesh(new RoundedBoxGeometry(w, 0.04, moduleD, 2, 0.04), mats.matte(color));
    plate.position.y = 0;
    g.add(plate);
    const stripTex = makeLabelTexture([label], {
      width: 256,
      height: 48,
      color: '#F5F2EC',
      fontSize: 28,
      bold: true,
      align: 'center',
    });
    disposables.push(stripTex);
    const stripMat = new THREE.MeshBasicMaterial({ map: stripTex, transparent: true });
    disposables.push(stripMat);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, 0.08), stripMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, 0.022, -moduleD * 0.38);
    g.add(strip);
    // dark label strip under title
    const darkStrip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, 0.01, 0.06), darkMat);
    darkStrip.position.set(0, 0.02, -moduleD * 0.28);
    g.add(darkStrip);
    return g;
  };

  // Teal / OSC
  const tealMod = makeModule(p.teal, -bodyW * 0.08, 0.85, 'OSC');
  createKnob('osc-tune', 'Tune', -0.22, -0.05, tealMod, { initial: 0.5 });
  createKnob('osc-wave', 'Shape', 0, -0.05, tealMod, { initial: 0.25 });
  createKnob('osc-level', 'Level', 0.22, -0.05, tealMod, { initial: 0.7 });
  createKnob('osc-mod', 'Mod', -0.12, 0.2, tealMod, { radius: 0.042, initial: 0.4 });
  createKnob('osc-fine', 'Fine', 0.12, 0.2, tealMod, { radius: 0.042, initial: 0.5 });
  createButton('osc-saw', 'Saw', -0.22, 0.35, tealMod, p.dark, 0.025);
  createButton('osc-square', 'Square', -0.08, 0.35, tealMod, p.dark, 0.025);
  createButton('osc-tri', 'Tri', 0.08, 0.35, tealMod, p.dark, 0.025);
  createButton('osc-sine', 'Sine', 0.22, 0.35, tealMod, p.dark, 0.025);
  createJack('osc-out', -0.18, 0.38, tealMod);
  createJack('osc-in', 0.18, 0.38, tealMod);

  // Orange / FILTER
  const orangeMod = makeModule(p.orange, bodyW * 0.14, 0.85, 'FILTER');
  createKnob('filter-cutoff', 'Cutoff', -0.22, -0.05, orangeMod, { initial: 0.65 });
  createKnob('filter-res', 'Resonance', 0, -0.05, orangeMod, { initial: 0.2 });
  createKnob('filter-env', 'Env', 0.22, -0.05, orangeMod, { color: p.vermilion, initial: 0.4 });
  createKnob('filter-drive', 'Drive', 0, 0.18, orangeMod, { radius: 0.042, initial: 0.3 });
  createButton('filter-toggle', 'LP/HP', 0.22, 0.18, orangeMod, p.dark, 0.028);
  createJack('filter-in', -0.18, 0.38, orangeMod);
  createJack('filter-out', 0.18, 0.38, orangeMod);

  // Vermilion / FX
  const vermMod = makeModule(p.vermilion, bodyW * 0.36, 0.78, 'FX / OUT');
  createKnob('fx-delay', 'Delay', -0.18, -0.05, vermMod, { initial: 0.25 });
  createKnob('fx-feedback', 'Feedback', 0.05, -0.05, vermMod, { initial: 0.2 });
  createKnob('fx-mix', 'Mix', -0.18, 0.18, vermMod, { initial: 0.3 });
  createKnob('fx-volume', 'Volume', 0.05, 0.18, vermMod, { initial: 0.7 });
  createButton('fx-mint', 'Mute', -0.2, 0.35, vermMod, p.mint, 0.028);
  createButton('fx-yellow', 'Tap', 0, 0.35, vermMod, p.yellow, 0.028);
  createJack('fx-in', -0.12, 0.38, vermMod);
  createJack('fx-out', 0.12, 0.38, vermMod);
  // Handle arch on right edge
  const arch = new THREE.Mesh(
    new THREE.TorusGeometry(0.12, 0.018, 8, 16, Math.PI),
    mats.matte(p.chassis),
  );
  arch.rotation.z = Math.PI / 2;
  arch.rotation.y = Math.PI / 2;
  arch.position.set(0.42, 0.06, 0);
  vermMod.add(arch);

  // Mustard LFO (small, between/below)
  const mustard = new THREE.Group();
  mustard.position.set(bodyW * 0.02, moduleY, moduleZ + moduleH * 0.42);
  panel.add(mustard);
  const mustardPlate = new THREE.Mesh(
    new RoundedBoxGeometry(0.55, 0.035, 0.38, 2, 0.03),
    mustardMat,
  );
  mustard.add(mustardPlate);
  const lfoTex = makeLabelTexture(['LFO'], {
    width: 128,
    height: 40,
    color: '#1a1a18',
    fontSize: 26,
    align: 'center',
  });
  disposables.push(lfoTex);
  const lfoMat = new THREE.MeshBasicMaterial({ map: lfoTex, transparent: true });
  disposables.push(lfoMat);
  const lfoLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.07), lfoMat);
  lfoLabel.rotation.x = -Math.PI / 2;
  lfoLabel.position.set(-0.1, 0.02, -0.1);
  mustard.add(lfoLabel);
  // tiny display
  const tinyDisp = new THREE.Mesh(
    new THREE.PlaneGeometry(0.18, 0.1),
    new THREE.MeshStandardMaterial({ color: PALETTE.lcdBg, emissive: PALETTE.lcdBg, emissiveIntensity: 0.2 }),
  );
  tinyDisp.rotation.x = -Math.PI / 2;
  tinyDisp.position.set(0.12, 0.02, -0.05);
  mustard.add(tinyDisp);
  createKnob('lfo-rate', 'LFO Rate', -0.12, 0.08, mustard, { radius: 0.045, initial: 0.35 });
  createKnob('lfo-depth', 'LFO Depth', 0.12, 0.08, mustard, { radius: 0.045, initial: 0.25 });
  createJack('lfo-out', 0, 0.14, mustard);

  // --- Bottom: pad grid + keyboard ---
  const bottomZ = bodyD * 0.38;

  // Pad grid 4x4
  const padOriginX = -bodyW * 0.22;
  const padSize = 0.08;
  const padGap = 0.02;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const idx = row * 4 + col;
      const mat = mats.matte(p.dark, { roughness: 0.5 });
      disposables.push(mat);
      const mesh = new THREE.Mesh(new RoundedBoxGeometry(padSize, 0.025, padSize, 1, 0.01), mat);
      mesh.position.set(
        padOriginX + col * (padSize + padGap),
        0.015,
        bottomZ - 0.12 + row * (padSize + padGap),
      );
      panel.add(mesh);
      let lit = false;
      const handle: PadHandle = {
        mesh,
        id: `pad-${idx}`,
        index: idx,
        get lit() {
          return lit;
        },
        setLit(on: boolean) {
          lit = on;
          mat.emissive = new THREE.Color(on ? p.orange : 0x000000);
          mat.emissiveIntensity = on ? 0.8 : 0;
          mat.color.set(on ? p.orange : p.dark);
        },
        toggle() {
          handle.setLit(!lit);
        },
      };
      padGrid.push(handle);
      mesh.userData.interactive = { type: 'pad', handle };
    }
  }
  createKnob('seq-tempo', 'Tempo', padOriginX - 0.18, bottomZ - 0.05, panel, {
    radius: 0.04,
    initial: 0.5,
  });
  createKnob('seq-swing', 'Swing', padOriginX - 0.18, bottomZ + 0.12, panel, {
    radius: 0.04,
    initial: 0.2,
  });

  // Piano keyboard ~1.5 octaves (11 white keys = C to F next octave-ish, with blacks)
  const keyGroup = new THREE.Group();
  keyGroup.position.set(bodyW * 0.12, 0.01, bottomZ + 0.02);
  panel.add(keyGroup);
  const whiteCount = 11;
  const whiteW = 0.095;
  const whiteD = 0.42;
  const whiteH = 0.05;
  const midiBase = 60; // C4
  let whiteIdx = 0;
  let noteIdx = 0;

  for (let i = 0; i < whiteCount; i++) {
    const x = -((whiteCount - 1) * whiteW) * 0.5 + i * whiteW;
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(whiteW * 0.92, whiteH, whiteD, 1, 0.01), whiteKeyMat);
    mesh.position.set(x, 0, 0);
    keyGroup.add(mesh);
    const restY = 0;
    const pressedY = -0.018;
    let pressed = false;
    const midi = midiBase + noteIdx;
    const handle: KeyHandle = {
      mesh,
      noteIndex: noteIdx,
      midi,
      isBlack: false,
      press() {
        pressed = true;
        mesh.position.y = pressedY;
      },
      release() {
        pressed = false;
        mesh.position.y = restY;
      },
    };
    void pressed;
    keys.push(handle);
    mesh.userData.interactive = { type: 'key', handle };
    noteIdx++;
    whiteIdx++;

    // Black key after C,D,F,G,A (not E,B)
    const whiteDegree = ['C', 'D', 'E', 'F', 'G', 'A', 'B'][i % 7];
    if (whiteDegree && !['E', 'B'].includes(whiteDegree) && i < whiteCount - 1) {
      const bMesh = new THREE.Mesh(
        new RoundedBoxGeometry(whiteW * 0.55, whiteH * 1.15, whiteD * 0.62, 1, 0.008),
        blackKeyMat,
      );
      bMesh.position.set(x + whiteW * 0.5, 0.02, -whiteD * 0.12);
      keyGroup.add(bMesh);
      const bRest = 0.02;
      const bPress = 0.004;
      const bMidi = midiBase + noteIdx;
      const bHandle: KeyHandle = {
        mesh: bMesh,
        noteIndex: noteIdx,
        midi: bMidi,
        isBlack: true,
        press() {
          bMesh.position.y = bPress;
        },
        release() {
          bMesh.position.y = bRest;
        },
      };
      keys.push(bHandle);
      bMesh.userData.interactive = { type: 'key', handle: bHandle };
      noteIdx++;
    }
  }
  void whiteIdx;

  // Recessed well under modules (visual depth)
  const well = new THREE.Mesh(
    new RoundedBoxGeometry(bodyW * 0.72, 0.03, 1.15, 2, 0.04),
    mats.matte('#E2DDD4', { roughness: 0.9 }),
  );
  well.position.set(bodyW * 0.08, -0.005, moduleZ);
  panel.add(well);

  // Tilt whole device toward camera
  root.rotation.x = -tilt;
  root.scale.setScalar(scale);
  enableShadows(root);

  const getJack = (id: string): JackHandle | undefined => jacks.find((j) => j.id === id);
  const getKnob = (id: string): KnobHandle | undefined => knobs.find((k) => k.id === id);

  const dispose = (): void => {
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
      }
    });
    for (const d of disposables) d.dispose();
    root.removeFromParent();
  };

  return {
    root,
    knobs,
    keys,
    buttons,
    padGrid,
    jacks,
    screens: { screenA, screenB },
    speakerGrille,
    getJack,
    getKnob,
    dispose,
  };
}
