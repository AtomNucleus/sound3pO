import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  PALETTE,
  defaultMaterials,
  punchColor,
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
  opts: {
    width?: number;
    height?: number;
    color?: string;
    align?: CanvasTextAlign;
    fontSize?: number;
    bold?: boolean;
    lineGap?: number;
    /** If set, first N lines use title weight/size (for stacked logo). */
    titleLines?: number;
  } = {},
): THREE.CanvasTexture {
  const w = opts.width ?? 512;
  const h = opts.height ?? 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  // Slight supersampling hint
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = opts.color ?? '#1a1a18';
  ctx.textAlign = opts.align ?? 'left';
  ctx.textBaseline = 'top';
  const base = opts.fontSize ?? 48;
  const titleCount = opts.titleLines ?? 1;
  const x = opts.align === 'center' ? w / 2 : 24;
  let y = 16;
  lines.forEach((line, i) => {
    const isTitle = i < titleCount && opts.bold !== false;
    const size = isTitle ? base : Math.round(base * 0.28);
    ctx.font = `${isTitle ? '800' : '600'} ${size}px "Helvetica Neue", Helvetica, Arial, ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(line, x, y);
    y += isTitle ? size + (opts.lineGap ?? 6) : size * 1.4;
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Chassis casts/receives; small deck parts receive only (avoids floating ground shadows). */
function enableShadows(obj: THREE.Object3D, cast = true): void {
  obj.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = cast;
      c.receiveShadow = true;
    }
  });
}

/**
 * Procedurally build the full MOD DESK chassis, modules, knobs, keys, pads, jacks, and screens.
 *
 * Device is ~4 units wide, ~2.6 deep (≈2:1.3), centered at origin, top face tilted toward +Z camera.
 *
 * @param options - Palette / chunkiness / material overrides
 * @returns Named interactive handles + root group
 */
export function buildDevice(options: BuildDeviceOptions = {}): DeviceHandle {
  const mats = options.materials ?? defaultMaterials;
  const chunk = options.chunkiness ?? 1;
  const tilt = options.tilt ?? 0.26;
  const scale = options.scale ?? 1;

  const p = {
    chassis: punchColor(options.palette?.chassis ?? PALETTE.chassis, 1, 1.06),
    teal: punchColor(options.palette?.teal ?? PALETTE.teal, 1.35, 1.08),
    orange: punchColor(options.palette?.orange ?? PALETTE.orange, 1.3, 1.1),
    vermilion: punchColor(options.palette?.vermilion ?? PALETTE.vermilion, 1.3, 1.08),
    mustard: punchColor(options.palette?.mustard ?? PALETTE.mustard, 1.25, 1.1),
    dark: new THREE.Color(options.palette?.dark ?? PALETTE.dark),
    mint: punchColor(options.palette?.mint ?? PALETTE.mint, 1.2, 1.05),
    yellow: punchColor(options.palette?.yellow ?? PALETTE.yellow, 1.2, 1.08),
    whiteKey: punchColor(options.palette?.whiteKey ?? PALETTE.whiteKey, 1, 1.1),
    blackKey: new THREE.Color(options.palette?.blackKey ?? PALETTE.blackKey),
  };

  const plastic = { roughness: 0.92, clearcoat: 0.08, clearcoatRoughness: 0.7 } as const;
  const chassisMat = mats.matte(p.chassis, plastic);
  const darkMat = mats.matte(p.dark, { roughness: 0.85, clearcoat: 0 });
  const darkMetal = mats.metal(p.dark, { roughness: 0.55, metalness: 0.45 });
  const tealMat = mats.matte(p.teal, plastic);
  const orangeMat = mats.matte(p.orange, plastic);
  const vermMat = mats.matte(p.vermilion, plastic);
  const mustardMat = mats.matte(p.mustard, plastic);
  const whiteKeyMat = mats.matte(p.whiteKey, { roughness: 0.88, clearcoat: 0 });
  const blackKeyMat = mats.matte(p.blackKey, { roughness: 0.75, clearcoat: 0 });
  const indicatorMat = mats.matte('#FFFEF8', { roughness: 0.7, clearcoat: 0 });
  const wellMat = mats.matte('#E2DDD4', { roughness: 0.95, clearcoat: 0 });

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
    whiteKeyMat,
    blackKeyMat,
    indicatorMat,
    wellMat,
  ];

  const root = new THREE.Group();
  root.name = 'modDesk';

  // Proportions ≈ 2 : 1.35 width : depth — chunky landscape, not a flat slab
  const bodyW = 4 * chunk;
  const bodyD = 2.85 * chunk;
  const bodyH = 0.58 * Math.sqrt(chunk);

  const chassisGeo = new RoundedBoxGeometry(bodyW, bodyH, bodyD, 5, 0.1 * chunk);
  const chassis = new THREE.Mesh(chassisGeo, chassisMat);
  chassis.name = 'chassis';
  chassis.position.y = 0;
  root.add(chassis);
  enableShadows(chassis, true);

  // Deck sits flush on chassis top
  const topY = bodyH * 0.5;
  const panel = new THREE.Group();
  panel.name = 'topPanel';
  panel.position.y = topY;
  root.add(panel);

  // Thin cream deck plate (ensures continuous surface under all controls)
  const deck = new THREE.Mesh(
    new RoundedBoxGeometry(bodyW - 0.06, 0.03, bodyD - 0.06, 4, 0.06),
    chassisMat,
  );
  deck.position.y = 0.012;
  panel.add(deck);
  enableShadows(deck, true);

  // --- Logo (hi-res stacked MOD / DESK), tipped toward camera for crisp read ---
  const logoTex = makeLabelTexture(
    ['MOD', 'DESK', '1 OSC MODULE', '2 FILTER SECTION', '3 LFO STAGE', '4 MASTER OUT'],
    { width: 1024, height: 720, fontSize: 130, bold: true, lineGap: 2, titleLines: 2 },
  );
  disposables.push(logoTex);
  const logoMat = new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, depthWrite: false });
  disposables.push(logoMat);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.68), logoMat);
  logo.rotation.x = -Math.PI / 2 + 0.22;
  logo.position.set(-bodyW * 0.36, 0.045, -bodyD * 0.37);
  logo.renderOrder = 2;
  logo.castShadow = false;
  panel.add(logo);

  // --- Helpers (all deck parts: receive shadows only) ---
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

    const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.08, r * 1.12, 0.014, 28), darkMetal);
    base.castShadow = false;
    base.receiveShadow = true;
    g.add(base);
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.92, r, 0.048, 28),
      mats.matte(opts.color ?? p.dark, { roughness: 0.78, clearcoat: 0 }),
    );
    body.position.y = 0.028;
    body.castShadow = false;
    body.receiveShadow = true;
    g.add(body);
    const indicator = new THREE.Mesh(new THREE.BoxGeometry(r * 0.22, 0.012, r * 0.7), indicatorMat);
    indicator.position.set(0, 0.054, -r * 0.18);
    indicator.castShadow = false;
    g.add(indicator);

    let value = clamp01(opts.initial ?? 0.5);
    const apply = (): void => {
      g.rotation.y = -KNOB_SWEEP * 0.5 + value * KNOB_SWEEP;
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
    g.position.set(x, 0.016, z);
    parent.add(g);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.02, 18), darkMetal);
    sleeve.castShadow = false;
    g.add(sleeve);
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.022, 14), darkMat);
    hole.position.y = 0.002;
    g.add(hole);
    const ringMat = mats.emissive(p.mint, 0);
    disposables.push(ringMat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.004, 8, 22), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.012;
    ring.visible = false;
    g.add(ring);

    const handle: JackHandle = {
      mesh: g,
      id,
      getWorldPosition(out = new THREE.Vector3()) {
        g.updateWorldMatrix(true, false);
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
    size = 0.038,
  ): ButtonHandle => {
    const mat = mats.matte(color, { roughness: 0.8, clearcoat: 0 });
    disposables.push(mat);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(size, size, 0.02, 18), mat);
    mesh.name = `button:${id}`;
    mesh.position.set(x, 0.016, z);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
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
        mesh.position.y = on ? 0.008 : 0.016;
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

  // ========== TOP BAND ==========
  // Back edge: logo (left) | cream knobs + red btns | LCD A | LCD B (far right)
  const topZ = -bodyD * 0.38;

  for (let i = 0; i < 6; i++) {
    createKnob(`top-${i}`, `Top ${i + 1}`, -bodyW * 0.1 + i * 0.14, topZ, panel, {
      radius: 0.042,
      color: p.chassis,
      initial: 0.3 + i * 0.08,
    });
  }
  createButton('top-btn-a', 'Rec', bodyW * 0.12, topZ, panel, p.vermilion, 0.028);
  createButton('top-btn-b', 'Stop', bodyW * 0.175, topZ, panel, p.vermilion, 0.028);

  // LCDs — ~9% and ~8% of device width, clearly rectangular
  const makeScreen = (name: string, x: number, z: number, w: number, h: number): THREE.Mesh => {
    const bezel = new THREE.Mesh(new RoundedBoxGeometry(w + 0.06, 0.032, h + 0.05, 2, 0.012), darkMat);
    bezel.position.set(x, 0.018, z);
    bezel.castShadow = false;
    bezel.receiveShadow = true;
    panel.add(bezel);
    const glassMat = new THREE.MeshStandardMaterial({
      color: PALETTE.lcdBg,
      roughness: 0.45,
      metalness: 0.05,
      emissive: new THREE.Color('#0a1810'),
      emissiveIntensity: 0.5,
    });
    disposables.push(glassMat);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat);
    screen.name = name;
    // Tip screen slightly toward camera so content reads
    screen.rotation.x = -Math.PI / 2 + 0.1;
    screen.position.set(x, 0.038, z);
    screen.castShadow = false;
    panel.add(screen);
    return screen;
  };
  // screenA ~11% width, screenB ~9%
  const screenA = makeScreen('screenA', bodyW * 0.26, topZ + 0.05, 0.5, 0.3);
  const screenB = makeScreen('screenB', bodyW * 0.41, topZ + 0.05, 0.4, 0.28);

  // Signature cable jacks — ~25% of width apart on top-right
  const jackSpan = bodyW * 0.25;
  const jackMidX = bodyW * 0.3;
  createJack('top-jack-l', jackMidX - jackSpan * 0.5, topZ + 0.32, panel);
  createJack('top-jack-r', jackMidX + jackSpan * 0.5, topZ + 0.32, panel);
  createJack('top-jack-extra', bodyW * 0.08, topZ + 0.28, panel);

  // ========== SPEAKER GRILLE (left, under logo) ==========
  const grilleGroup = new THREE.Group();
  grilleGroup.position.set(-bodyW * 0.35, 0.02, -bodyD * 0.05);
  panel.add(grilleGroup);
  const grilleBase = new THREE.Mesh(
    new RoundedBoxGeometry(0.7, 0.02, 0.85, 3, 0.055),
    mats.matte(p.chassis, { roughness: 0.95, clearcoat: 0 }),
  );
  grilleBase.castShadow = false;
  grilleBase.receiveShadow = true;
  grilleGroup.add(grilleBase);
  const dotGeo = new THREE.CircleGeometry(0.012, 10);
  const dotMat = mats.matte('#5A5A54', { roughness: 0.95, clearcoat: 0 });
  disposables.push(dotMat);
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 8; col++) {
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(-0.28 + col * 0.08, 0.012, -0.34 + row * 0.075);
      dot.castShadow = false;
      grilleGroup.add(dot);
    }
  }
  const speakerGrille = grilleBase;
  speakerGrille.name = 'speakerGrille';
  speakerGrille.userData.grilleRoot = grilleGroup;

  // ========== MODULE BAND (inset well) ==========
  const moduleZ = -bodyD * 0.02;
  const moduleD = 0.78;
  const moduleY = 0.028;

  // Recessed well — darker inset so modules read as sitting IN the chassis
  const well = new THREE.Mesh(
    new RoundedBoxGeometry(bodyW * 0.72, 0.05, 1.05, 3, 0.04),
    wellMat,
  );
  well.position.set(bodyW * 0.08, 0.005, moduleZ + 0.08);
  well.castShadow = false;
  well.receiveShadow = true;
  panel.add(well);

  // Soft AO lip around well
  const wellLip = new THREE.Mesh(
    new RoundedBoxGeometry(bodyW * 0.735, 0.012, 1.07, 3, 0.04),
    mats.matte('#D5D0C7', { roughness: 0.95, clearcoat: 0 }),
  );
  wellLip.position.set(bodyW * 0.08, 0.022, moduleZ + 0.08);
  wellLip.castShadow = false;
  panel.add(wellLip);

  const makeModule = (
    colorMat: THREE.Material,
    x: number,
    w: number,
    label: string,
  ): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, moduleY, moduleZ);
    panel.add(g);
    const plate = new THREE.Mesh(new RoundedBoxGeometry(w, 0.05, moduleD, 3, 0.04), colorMat);
    plate.position.y = 0;
    plate.castShadow = false;
    plate.receiveShadow = true;
    g.add(plate);
    const stripTex = makeLabelTexture([label], {
      width: 512,
      height: 96,
      color: '#FFFEF8',
      fontSize: 48,
      bold: true,
      align: 'center',
    });
    disposables.push(stripTex);
    const stripMat = new THREE.MeshBasicMaterial({ map: stripTex, transparent: true, depthWrite: false });
    disposables.push(stripMat);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.6, 0.08), stripMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, 0.028, -moduleD * 0.36);
    strip.renderOrder = 2;
    strip.castShadow = false;
    g.add(strip);
    const darkStrip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.01, 0.05), darkMat);
    darkStrip.position.set(0, 0.026, -moduleD * 0.24);
    darkStrip.castShadow = false;
    g.add(darkStrip);
    return g;
  };

  const tealMod = makeModule(tealMat, -bodyW * 0.05, 0.82, 'OSC');
  createKnob('osc-tune', 'Tune', -0.22, -0.1, tealMod, { initial: 0.5 });
  createKnob('osc-wave', 'Shape', 0, -0.1, tealMod, { initial: 0.25 });
  createKnob('osc-level', 'Level', 0.22, -0.1, tealMod, { initial: 0.7 });
  createKnob('osc-mod', 'Mod', -0.12, 0.14, tealMod, { radius: 0.042, initial: 0.4 });
  createKnob('osc-fine', 'Fine', 0.12, 0.14, tealMod, { radius: 0.042, initial: 0.5 });
  createButton('osc-saw', 'Saw', -0.22, 0.3, tealMod, p.dark, 0.024);
  createButton('osc-square', 'Square', -0.08, 0.3, tealMod, p.dark, 0.024);
  createButton('osc-tri', 'Tri', 0.08, 0.3, tealMod, p.dark, 0.024);
  createButton('osc-sine', 'Sine', 0.22, 0.3, tealMod, p.dark, 0.024);
  createJack('osc-out', -0.18, 0.32, tealMod);
  createJack('osc-in', 0.18, 0.32, tealMod);

  const orangeMod = makeModule(orangeMat, bodyW * 0.155, 0.82, 'FILTER');
  createKnob('filter-cutoff', 'Cutoff', -0.22, -0.1, orangeMod, { initial: 0.65 });
  createKnob('filter-res', 'Resonance', 0, -0.1, orangeMod, { initial: 0.2 });
  createKnob('filter-env', 'Env', 0.22, -0.1, orangeMod, { color: p.vermilion, initial: 0.4 });
  createKnob('filter-drive', 'Drive', 0, 0.12, orangeMod, { radius: 0.042, initial: 0.3 });
  createButton('filter-toggle', 'LP/HP', 0.22, 0.12, orangeMod, p.dark, 0.026);
  createJack('filter-in', -0.18, 0.32, orangeMod);
  createJack('filter-out', 0.18, 0.32, orangeMod);

  const vermMod = makeModule(vermMat, bodyW * 0.36, 0.76, 'FX / OUT');
  createKnob('fx-delay', 'Delay', -0.18, -0.1, vermMod, { initial: 0.25 });
  createKnob('fx-feedback', 'Feedback', 0.06, -0.1, vermMod, { initial: 0.2 });
  createKnob('fx-mix', 'Mix', -0.18, 0.12, vermMod, { initial: 0.3 });
  createKnob('fx-volume', 'Volume', 0.06, 0.12, vermMod, { initial: 0.7 });
  createButton('fx-mint', 'Mute', -0.2, 0.3, vermMod, p.mint, 0.026);
  createButton('fx-yellow', 'Tap', 0.0, 0.3, vermMod, p.yellow, 0.026);
  createJack('fx-in', -0.12, 0.32, vermMod);
  createJack('fx-out', 0.12, 0.32, vermMod);
  const arch = new THREE.Mesh(
    new THREE.TorusGeometry(0.11, 0.016, 8, 18, Math.PI),
    mats.matte(p.chassis, plastic),
  );
  arch.rotation.z = Math.PI / 2;
  arch.rotation.y = Math.PI / 2;
  arch.position.set(0.4, 0.06, 0);
  arch.castShadow = false;
  vermMod.add(arch);

  // Mustard LFO — between teal/orange, just below module band (NOT over keyboard)
  const mustard = new THREE.Group();
  mustard.position.set(bodyW * 0.05, moduleY, moduleZ + moduleD * 0.55 + 0.12);
  panel.add(mustard);
  const mustardPlate = new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.042, 0.34, 2, 0.03), mustardMat);
  mustardPlate.castShadow = false;
  mustardPlate.receiveShadow = true;
  mustard.add(mustardPlate);
  const lfoTex = makeLabelTexture(['LFO'], {
    width: 256,
    height: 64,
    color: '#1a1a18',
    fontSize: 40,
    align: 'center',
  });
  disposables.push(lfoTex);
  const lfoLabelMat = new THREE.MeshBasicMaterial({ map: lfoTex, transparent: true, depthWrite: false });
  disposables.push(lfoLabelMat);
  const lfoLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.07), lfoLabelMat);
  lfoLabel.rotation.x = -Math.PI / 2;
  lfoLabel.position.set(-0.1, 0.024, -0.08);
  mustard.add(lfoLabel);
  const tinyDispMat = new THREE.MeshStandardMaterial({
    color: PALETTE.lcdBg,
    emissive: '#0a1810',
    emissiveIntensity: 0.55,
  });
  disposables.push(tinyDispMat);
  const tinyDisp = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.09), tinyDispMat);
  tinyDisp.rotation.x = -Math.PI / 2 + 0.1;
  tinyDisp.position.set(0.12, 0.026, -0.04);
  mustard.add(tinyDisp);
  createKnob('lfo-rate', 'LFO Rate', -0.12, 0.06, mustard, { radius: 0.042, initial: 0.35 });
  createKnob('lfo-depth', 'LFO Depth', 0.12, 0.06, mustard, { radius: 0.042, initial: 0.25 });
  createJack('lfo-out', 0, 0.1, mustard);

  // ========== BOTTOM BAND: shallow flush pads + keyboard ==========
  // Keys/pads sit coplanar with the cream deck — shallow recess only,
  // no deep dark undercut that reads as "floating" from camera.
  const bottomZ = bodyD * 0.36;

  const padOriginX = -bodyW * 0.2;
  const padSize = 0.082;
  const padGap = 0.012;
  const padGridW = 4 * padSize + 3 * padGap;
  const padGridD = 4 * padSize + 3 * padGap;
  const padCenterX = padOriginX + (padGridW - padSize) * 0.5;
  const padCenterZ = bottomZ - 0.02 + (padGridD - padSize) * 0.5;

  // Shallow cream recess (same family as chassis — no dark void under pads)
  const padRecess = new THREE.Mesh(
    new RoundedBoxGeometry(padGridW + 0.08, 0.02, padGridD + 0.08, 2, 0.025),
    mats.matte('#E8E3DA', { roughness: 0.95, clearcoat: 0 }),
  );
  padRecess.position.set(padCenterX, 0.02, padCenterZ);
  padRecess.castShadow = false;
  padRecess.receiveShadow = true;
  panel.add(padRecess);

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const idx = row * 4 + col;
      const mat = mats.matte(p.dark, { roughness: 0.8, clearcoat: 0 });
      disposables.push(mat);
      const mesh = new THREE.Mesh(new RoundedBoxGeometry(padSize, 0.018, padSize, 2, 0.008), mat);
      mesh.position.set(
        padOriginX + col * (padSize + padGap),
        0.028,
        bottomZ - 0.02 + row * (padSize + padGap),
      );
      mesh.castShadow = false;
      mesh.receiveShadow = true;
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
          mat.emissiveIntensity = on ? 0.85 : 0;
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
  createKnob('seq-tempo', 'Tempo', padOriginX - 0.12, bottomZ + 0.02, panel, {
    radius: 0.036,
    initial: 0.5,
  });
  createKnob('seq-swing', 'Swing', padOriginX - 0.12, bottomZ + 0.18, panel, {
    radius: 0.036,
    initial: 0.2,
  });

  // Piano — continuous ivory slab flush with deck, thin dark seams
  const whiteCount = 11;
  const whiteW = 0.084;
  const keyGap = 0.0006;
  const whiteD = 0.4;
  const whiteH = 0.028;
  const keyBedW = whiteCount * whiteW + 0.05;
  const keyGroup = new THREE.Group();
  keyGroup.position.set(bodyW * 0.2, 0.018, bottomZ + 0.08);
  panel.add(keyGroup);

  // Cream recess frame around keyboard
  const keyFrame = new THREE.Mesh(
    new RoundedBoxGeometry(keyBedW + 0.06, 0.022, whiteD + 0.08, 2, 0.025),
    mats.matte('#E8E3DA', { roughness: 0.95, clearcoat: 0 }),
  );
  keyFrame.position.set(0, 0.0, 0);
  keyFrame.castShadow = false;
  keyFrame.receiveShadow = true;
  keyGroup.add(keyFrame);

  // Solid ivory bed (fills all gaps)
  const keySlab = new THREE.Mesh(
    new THREE.BoxGeometry(keyBedW - 0.01, 0.02, whiteD),
    whiteKeyMat,
  );
  keySlab.position.set(0, 0.01, 0);
  keySlab.castShadow = false;
  keySlab.receiveShadow = true;
  keyGroup.add(keySlab);

  for (let i = 1; i < whiteCount; i++) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.022, whiteD * 0.98), darkMat);
    seam.position.set(-((whiteCount - 1) * whiteW) * 0.5 + i * whiteW - whiteW * 0.5, 0.012, 0);
    seam.castShadow = false;
    keyGroup.add(seam);
  }

  const midiBase = 60;
  let noteIdx = 0;
  const startX = -((whiteCount - 1) * whiteW) * 0.5;

  for (let i = 0; i < whiteCount; i++) {
    const x = startX + i * whiteW;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(whiteW - keyGap, whiteH, whiteD), whiteKeyMat);
    mesh.position.set(x, 0.016, 0);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    // Prevent any residual shadow acne
    mesh.material = whiteKeyMat;
    keyGroup.add(mesh);
    const restY = 0.016;
    const pressedY = 0.004;
    const midi = midiBase + noteIdx;
    const handle: KeyHandle = {
      mesh,
      noteIndex: noteIdx,
      midi,
      isBlack: false,
      press() {
        mesh.position.y = pressedY;
      },
      release() {
        mesh.position.y = restY;
      },
    };
    keys.push(handle);
    mesh.userData.interactive = { type: 'key', handle };
    noteIdx++;

    const whiteDegree = ['C', 'D', 'E', 'F', 'G', 'A', 'B'][i % 7];
    if (whiteDegree && !['E', 'B'].includes(whiteDegree) && i < whiteCount - 1) {
      const bMesh = new THREE.Mesh(
        new RoundedBoxGeometry(whiteW * 0.5, whiteH * 0.75, whiteD * 0.55, 1, 0.004),
        blackKeyMat,
      );
      bMesh.position.set(x + whiteW * 0.5, 0.03, -whiteD * 0.12);
      bMesh.castShadow = false;
      bMesh.receiveShadow = true;
      keyGroup.add(bMesh);
      const bRest = 0.03;
      const bPress = 0.016;
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

  // Tip top face toward +Z camera
  root.rotation.x = tilt;
  root.scale.setScalar(scale);
  // Deck controls never cast (prevents "floating" contact shadows on the chassis)
  panel.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = false;
      obj.receiveShadow = true;
    }
  });
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  root.updateMatrixWorld(true);

  const getJack = (id: string): JackHandle | undefined => jacks.find((j) => j.id === id);
  const getKnob = (id: string): KnobHandle | undefined => knobs.find((k) => k.id === id);

  const dispose = (): void => {
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        (obj as THREE.Mesh).geometry?.dispose();
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
