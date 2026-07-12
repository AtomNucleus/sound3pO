/**
 * V1 — Product Shot
 * Photo-faithful fixed camera MOD DESK with interactive knobs, keys, and patch cables.
 */
import * as THREE from 'three';
import { createStage } from '../../core/scene';
import { buildDevice } from '../../core/device';
import { CableManager } from '../../core/cables';
import { SynthEngine, type SynthParam, type Waveform } from '../../core/audio';
import { makeScopeScreen, makeParamScreen, midiToNoteName } from '../../core/screens';
import { InteractionController } from '../../core/interaction';
import { KeyboardInput } from '../../core/keyboardInput';

const container = document.getElementById('app');
if (!container) throw new Error('#app missing');

const hintEl = document.getElementById('hint');
const powerEl = document.getElementById('power') as HTMLButtonElement | null;

/**
 * Product-shot framing: ~34° elevation, full device in frame including
 * logo + red cable arc; top panel reads as a chunky landscape rectangle.
 */
function productCamera(aspect: number): { position: THREE.Vector3; lookAt: THREE.Vector3; fov: number } {
  const pull = aspect < 1.15 ? 1.18 : aspect < 1.4 ? 1.06 : 1.0;
  return {
    // ~35° elevation, framed so logo + red arc + keyboard all fit with modest margins
    position: new THREE.Vector3(0.1 * pull, 3.6 * pull, 5.1 * pull),
    lookAt: new THREE.Vector3(0.05, 0.02, 0.02),
    fov: aspect < 1.15 ? 33 : 28,
  };
}

const initialAspect = container.clientWidth / Math.max(container.clientHeight, 1);
const cam = productCamera(initialAspect);

const stage = createStage(container, {
  cameraMode: 'fixed',
  background: '#DDD8D0',
  cameraPosition: cam.position,
  lookAt: cam.lookAt,
  fov: cam.fov,
  contactShadow: true,
  lighting: true,
});

const device = buildDevice({ tilt: 0.22, scale: 1.08 });
stage.scene.add(device.root);
device.root.updateMatrixWorld(true);

const shadow = stage.scene.getObjectByName('contactShadow');
if (shadow) {
  shadow.position.y = -0.5;
  shadow.scale.setScalar(1.15);
}

// Screens — visible without power (static grid / caption)
const synth = new SynthEngine();
const analyser = synth.getAnalyser();
const scope = makeScopeScreen(analyser, { caption: 'MOD DESK' });
const params = makeParamScreen({ analyser, caption: 'PATCH' });
params.setParam('cutoff', 0.65);
params.setNote('—');

const applyScreenMap = (mesh: THREE.Mesh, texture: THREE.CanvasTexture): void => {
  const mat = mesh.material as THREE.MeshStandardMaterial;
  mat.map = texture;
  mat.emissiveMap = texture;
  mat.emissive = new THREE.Color(0xffffff);
  mat.emissiveIntensity = 0.85;
  mat.needsUpdate = true;
};
applyScreenMap(device.screens.screenA, scope.texture);
applyScreenMap(device.screens.screenB, params.texture);
// Paint once immediately so LCDs aren't blank before first frame
scope.update(0);
params.update(0);

synth.setParam('cutoff', device.getKnob('filter-cutoff')?.value ?? 0.65);
synth.setParam('resonance', device.getKnob('filter-res')?.value ?? 0.2);
synth.setParam('delayTime', device.getKnob('fx-delay')?.value ?? 0.25);
synth.setParam('delayFeedback', device.getKnob('fx-feedback')?.value ?? 0.2);
synth.setParam('delayMix', device.getKnob('fx-mix')?.value ?? 0.3);
synth.setParam('volume', device.getKnob('fx-volume')?.value ?? 0.7);
synth.setParam('tune', device.getKnob('osc-tune')?.value ?? 0.5);
synth.setParam('lfoRate', device.getKnob('lfo-rate')?.value ?? 0.35);
synth.setParam('lfoDepth', device.getKnob('lfo-depth')?.value ?? 0.25);
synth.setLfoTarget('cutoff');
synth.setWaveform('sawtooth');
device.buttons.find((b) => b.id === 'osc-saw')?.setActive(true);

// Cables — signature red arc + teal module cable
const cables = new CableManager({ snapRadius: 0.14 });
cables.setJacks(device.jacks);

const jack = (id: string) => {
  const j = device.getJack(id);
  if (!j) throw new Error(`missing jack ${id}`);
  return j;
};

cables.create(stage.scene, {
  color: '#E23B2E',
  from: jack('top-jack-l'),
  to: jack('top-jack-r'),
  slack: 0.35,
  radius: 0.03,
  arcHeight: 0.85,
  segments: 32,
});

cables.create(stage.scene, {
  color: '#3BA8A0',
  from: jack('osc-out'),
  to: jack('filter-in'),
  slack: 0.3,
  radius: 0.02,
  arcHeight: 0.32,
  segments: 24,
});

const KNOB_MAP: Record<string, SynthParam> = {
  'osc-tune': 'tune',
  'osc-level': 'volume',
  'filter-cutoff': 'cutoff',
  'filter-res': 'resonance',
  'fx-delay': 'delayTime',
  'fx-feedback': 'delayFeedback',
  'fx-mix': 'delayMix',
  'fx-volume': 'volume',
  'lfo-rate': 'lfoRate',
  'lfo-depth': 'lfoDepth',
  'top-0': 'attack',
  'top-1': 'decay',
  'top-2': 'sustain',
  'top-3': 'release',
};

const WAVE_BTNS: Record<string, Waveform> = {
  'osc-saw': 'sawtooth',
  'osc-square': 'square',
  'osc-tri': 'triangle',
  'osc-sine': 'sine',
};

let powered = false;
let hintHidden = false;

const powerOn = async (): Promise<void> => {
  await synth.resume();
  powered = true;
  powerEl?.classList.add('off');
};

const hideHint = (): void => {
  if (hintHidden) return;
  hintHidden = true;
  hintEl?.classList.add('hidden');
};

const interaction = new InteractionController(
  stage.camera,
  stage.renderer.domElement,
  device,
  cables,
);

interaction.on('interact', () => {
  hideHint();
  if (!powered) void powerOn();
});

interaction.on('knob', ({ id, value, label }) => {
  const param = KNOB_MAP[id];
  if (param) {
    synth.setParam(param, value);
    params.setParam(label || param, value);
  } else {
    params.setParam(label || id, value);
  }
});

interaction.on('noteOn', ({ midi }) => {
  if (!powered) void powerOn();
  synth.noteOn(midi);
  params.setNote(midiToNoteName(midi));
});

interaction.on('noteOff', ({ midi }) => {
  synth.noteOff(midi);
});

interaction.on('button', ({ id, active }) => {
  const wave = WAVE_BTNS[id];
  if (wave && active) {
    synth.setWaveform(wave);
    for (const btnId of Object.keys(WAVE_BTNS)) {
      const btn = device.buttons.find((b) => b.id === btnId);
      if (btn && btnId !== id) btn.setActive(false);
    }
    params.setParam(`wave:${wave}`, 1);
  }
  if (id === 'filter-toggle') {
    synth.setLfoTarget(active ? 'pitch' : 'cutoff');
    params.setParam(active ? 'lfo→pitch' : 'lfo→cut', 1);
  }
});

interaction.on('pad', ({ index, lit }) => {
  params.setParam(`pad ${index + 1}`, lit ? 1 : 0);
});

interaction.on('replug', ({ jackId }) => {
  params.setParam(jackId ? `jack ${jackId}` : 'unplugged', jackId ? 1 : 0);
});

const kb = new KeyboardInput({ baseMidi: 60 });
kb.on('noteOn', ({ midi }) => {
  hideHint();
  if (!powered) void powerOn();
  const key = device.keys.find((k) => k.midi === midi);
  key?.press();
  synth.noteOn(midi);
  params.setNote(midiToNoteName(midi));
});
kb.on('noteOff', ({ midi }) => {
  const key = device.keys.find((k) => k.midi === midi);
  key?.release();
  synth.noteOff(midi);
});

powerEl?.addEventListener('click', () => {
  void powerOn();
  hideHint();
});

const grilleRoot =
  (device.speakerGrille.userData.grilleRoot as THREE.Object3D | undefined) ?? device.speakerGrille;
const grilleBaseScale = grilleRoot.scale.clone();

const disposeResize = stage.addResizeHandler();
void disposeResize;
// Re-frame on resize so square and wide viewports both work
const onResizeFrame = (): void => {
  const aspect = container.clientWidth / Math.max(container.clientHeight, 1);
  const next = productCamera(aspect);
  stage.camera.fov = next.fov;
  stage.camera.position.copy(next.position);
  stage.camera.lookAt(next.lookAt);
  stage.camera.updateProjectionMatrix();
};
window.addEventListener('resize', onResizeFrame);

stage.onFrame((_t, dt) => {
  cables.update(dt);
  scope.update(dt);
  params.update(dt);
  const level = synth.getLevel();
  const pulse = 1 + level * 0.06;
  grilleRoot.scale.set(
    grilleBaseScale.x * pulse,
    grilleBaseScale.y * (1 + level * 0.12),
    grilleBaseScale.z * pulse,
  );
});
stage.start();
