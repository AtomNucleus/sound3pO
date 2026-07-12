import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PALETTE } from './materials';

/** Camera mode for the stage. */
export type CameraMode = 'fixed' | 'orbit';

/** Options for {@link createStage}. */
export interface StageOptions {
  /** Fixed product shot or orbit exploration. Default `'fixed'`. */
  cameraMode?: CameraMode;
  /** Scene background color. Default palette warm gray. */
  background?: THREE.ColorRepresentation;
  /** Initial camera position. */
  cameraPosition?: THREE.Vector3;
  /** Look-at target. Default origin. */
  lookAt?: THREE.Vector3;
  /** Perspective FOV. Default 32 (product photo feel). */
  fov?: number;
  /** Enable soft shadows. Default true. */
  shadows?: boolean;
  /** Pixel ratio clamp. Default 2. */
  maxPixelRatio?: number;
  /** Add a soft contact-shadow ground plane. Default true. */
  contactShadow?: boolean;
  /** Soft 3-point lighting. Default true. */
  lighting?: boolean;
}

/** Frame callback receives elapsed and delta seconds. */
export type FrameCallback = (elapsed: number, dt: number) => void;

/** Handle returned by {@link createStage}. */
export interface StageHandle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls | null;
  clock: THREE.Clock;
  /** Register a per-frame callback (runs before render). */
  onFrame: (cb: FrameCallback) => () => void;
  /** Bind window resize. Returns disposer. */
  addResizeHandler: () => () => void;
  /** Start the render loop (idempotent). */
  start: () => void;
  /** Stop the render loop. */
  stop: () => void;
  /** Dispose renderer + controls. */
  dispose: () => void;
}

/**
 * Soft studio 3-point lighting: gentle key upper-left, fill, rim.
 * @param scene - Target scene
 * @param intensity - Overall scale
 */
export function addStudioLighting(scene: THREE.Scene, intensity = 1): THREE.Group {
  const group = new THREE.Group();
  group.name = 'studioLighting';

  // Soft ambient base so cream reads bright/warm
  const ambient = new THREE.AmbientLight(0xfff8f0, 0.55 * intensity);
  group.add(ambient);

  // Soft key from upper-left-front (product photo)
  // Shadow casting off by default — deck micro-geometry shadows read as "floating".
  // Variants that want contact shadows on the ground can enable key.castShadow.
  const key = new THREE.DirectionalLight(0xfff3e4, 1.85 * intensity);
  key.position.set(-2.8, 5.2, 4.2);
  key.castShadow = false;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 22;
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 7;
  key.shadow.camera.bottom = -7;
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4.5;
  group.add(key);

  // Warm soft fill from the right
  const fill = new THREE.DirectionalLight(0xf0f4ff, 0.7 * intensity);
  fill.position.set(4.5, 3.2, 2.5);
  group.add(fill);

  // Subtle rim from behind
  const rim = new THREE.DirectionalLight(0xffffff, 0.45 * intensity);
  rim.position.set(0.2, 4.0, -4.5);
  group.add(rim);

  // Large soft sky / ground bounce
  const hemi = new THREE.HemisphereLight(0xfffaf4, 0xd4cfc4, 0.65 * intensity);
  group.add(hemi);

  scene.add(group);
  return group;
}

/**
 * Soft contact-shadow ground plane beneath the device.
 */
export function addContactShadow(
  scene: THREE.Scene,
  opts: { color?: THREE.ColorRepresentation; y?: number; size?: number; opacity?: number } = {},
): THREE.Mesh {
  const size = opts.size ?? 8;
  const geo = new THREE.PlaneGeometry(size, size);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 20, 128, 128, 120);
  grad.addColorStop(0, 'rgba(0,0,0,0.35)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0.12)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const map = new THREE.CanvasTexture(canvas);
  const mat = new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    opacity: opts.opacity ?? 0.85,
    depthWrite: false,
    color: opts.color ?? 0x000000,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = opts.y ?? -0.48;
  mesh.name = 'contactShadow';
  mesh.receiveShadow = false;
  scene.add(mesh);
  return mesh;
}

/**
 * Bootstrap renderer / scene / camera / lighting / render loop.
 *
 * @param container - DOM element to append the canvas into
 * @param options - Stage configuration
 * @returns Stage handle with render-loop helpers
 *
 * @example
 * ```ts
 * const stage = createStage(document.getElementById('app')!, { cameraMode: 'fixed' });
 * stage.onFrame((_t, dt) => cables.update(dt));
 * stage.start();
 * ```
 */
export function createStage(container: HTMLElement, options: StageOptions = {}): StageHandle {
  const {
    cameraMode = 'fixed',
    background = PALETTE.background,
    cameraPosition = new THREE.Vector3(0, 3.4, 4.6),
    lookAt = new THREE.Vector3(0, 0.05, 0),
    fov = 32,
    shadows = true,
    maxPixelRatio = 2,
    contactShadow = true,
    lighting = true,
  } = options;

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);

  const camera = new THREE.PerspectiveCamera(
    fov,
    container.clientWidth / Math.max(container.clientHeight, 1),
    0.1,
    100,
  );
  camera.position.copy(cameraPosition);
  camera.lookAt(lookAt);

  let controls: OrbitControls | null = null;
  if (cameraMode === 'orbit') {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(lookAt);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2.5;
    controls.maxDistance = 12;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.update();
  }

  if (lighting) addStudioLighting(scene);
  if (contactShadow) addContactShadow(scene);

  const clock = new THREE.Clock();
  const frameCallbacks = new Set<FrameCallback>();
  let raf = 0;
  let running = false;

  const renderFrame = (): void => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.elapsedTime;
    for (const cb of frameCallbacks) cb(elapsed, dt);
    controls?.update();
    renderer.render(scene, camera);
    if (running) raf = requestAnimationFrame(renderFrame);
  };

  const onFrame = (cb: FrameCallback): (() => void) => {
    frameCallbacks.add(cb);
    return () => {
      frameCallbacks.delete(cb);
    };
  };

  const addResizeHandler = (): (() => void) => {
    const onResize = (): void => {
      const w = container.clientWidth;
      const h = Math.max(container.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  };

  const start = (): void => {
    if (running) return;
    running = true;
    clock.start();
    raf = requestAnimationFrame(renderFrame);
  };

  const stop = (): void => {
    running = false;
    cancelAnimationFrame(raf);
  };

  const dispose = (): void => {
    stop();
    controls?.dispose();
    renderer.dispose();
    if (renderer.domElement.parentElement === container) {
      container.removeChild(renderer.domElement);
    }
  };

  return {
    renderer,
    scene,
    camera,
    controls,
    clock,
    onFrame,
    addResizeHandler,
    start,
    stop,
    dispose,
  };
}
