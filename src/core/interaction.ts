import * as THREE from 'three';
import type { DeviceHandle, JackHandle, KnobHandle, KeyHandle, ButtonHandle, PadHandle } from './device';
import type { CableManager, CableGrabToken } from './cables';

/** Typed events emitted by {@link InteractionController}. */
export interface InteractionEvents {
  knob: { id: string; value: number; label: string };
  noteOn: { midi: number; noteIndex: number };
  noteOff: { midi: number; noteIndex: number };
  button: { id: string; active: boolean; label: string };
  pad: { id: string; index: number; lit: boolean };
  replug: { endIndex: 0 | 1; jackId: string | null; previousJackId: string | null };
  interact: Record<string, never>;
}

type Handler<T> = (payload: T) => void;

/**
 * Minimal typed event emitter used by interaction + keyboard modules.
 */
export class EventEmitter<EventMap extends object> {
  private listeners = new Map<keyof EventMap, Set<Handler<unknown>>>();

  on<K extends keyof EventMap>(event: K, fn: Handler<EventMap[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn as Handler<unknown>);
    return () => this.off(event, fn);
  }

  off<K extends keyof EventMap>(event: K, fn: Handler<EventMap[K]>): void {
    this.listeners.get(event)?.delete(fn as Handler<unknown>);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) (fn as Handler<EventMap[K]>)(payload);
  }
}

type DragKind =
  | { type: 'knob'; handle: KnobHandle; startY: number; startValue: number }
  | { type: 'key'; handle: KeyHandle }
  | { type: 'cable'; token: CableGrabToken; previousJack: JackHandle | null };

/**
 * Pointer/touch raycast controller for knobs, keys, buttons, pads, and cables.
 *
 * @example
 * ```ts
 * const input = new InteractionController(camera, renderer.domElement, device, cables);
 * input.on('knob', ({ id, value }) => synth.setParam(...));
 * ```
 */
export class InteractionController extends EventEmitter<InteractionEvents> {
  private camera: THREE.Camera;
  private el: HTMLElement;
  private device: DeviceHandle;
  private cables: CableManager | null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private drag: DragKind | null = null;
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hitPoint = new THREE.Vector3();
  private bound = false;
  private readonly onPointerDown: (e: PointerEvent) => void;
  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onPointerUp: (e: PointerEvent) => void;

  constructor(
    camera: THREE.Camera,
    domElement: HTMLElement,
    deviceHandle: DeviceHandle,
    cableManager?: CableManager | null,
  ) {
    super();
    this.camera = camera;
    this.el = domElement;
    this.device = deviceHandle;
    this.cables = cableManager ?? null;
    this.cables?.setJacks(deviceHandle.jacks);

    this.onPointerDown = (e) => this.handleDown(e);
    this.onPointerMove = (e) => this.handleMove(e);
    this.onPointerUp = (e) => this.handleUp(e);
    this.bind();
  }

  /** Attach pointer listeners. */
  bind(): void {
    if (this.bound) return;
    this.bound = true;
    this.el.style.touchAction = 'none';
    this.el.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
  }

  /** Remove listeners. */
  dispose(): void {
    if (!this.bound) return;
    this.bound = false;
    this.el.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
  }

  private setPointerFromEvent(e: PointerEvent): void {
    const rect = this.el.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private interactiveObjects(): THREE.Object3D[] {
    const objs: THREE.Object3D[] = [];
    for (const k of this.device.knobs) objs.push(k.mesh);
    for (const k of this.device.keys) objs.push(k.mesh);
    for (const b of this.device.buttons) objs.push(b.mesh);
    for (const p of this.device.padGrid) objs.push(p.mesh);
    for (const j of this.device.jacks) objs.push(j.mesh);
    return objs;
  }

  private findInteractive(obj: THREE.Object3D): { type: string; handle: unknown } | null {
    let o: THREE.Object3D | null = obj;
    while (o) {
      if (o.userData.interactive) return o.userData.interactive as { type: string; handle: unknown };
      o = o.parent;
    }
    return null;
  }

  private handleDown(e: PointerEvent): void {
    this.setPointerFromEvent(e);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.emit('interact', {});

    // Cables first (signature interaction)
    if (this.cables) {
      const token = this.cables.pickCable(this.raycaster);
      if (token) {
        const prev =
          token.endIndex != null ? token.cable.getAttached(token.endIndex) : null;
        this.cables.beginGrab(token);
        this.drag = { type: 'cable', token, previousJack: prev };
        this.el.setPointerCapture?.(e.pointerId);
        this.el.style.cursor = 'grabbing';
        return;
      }
    }

    const hits = this.raycaster.intersectObjects(this.interactiveObjects(), true);
    if (!hits.length) return;
    const info = this.findInteractive(hits[0]!.object);
    if (!info) return;

    switch (info.type) {
      case 'knob': {
        const handle = info.handle as KnobHandle;
        this.drag = {
          type: 'knob',
          handle,
          startY: e.clientY,
          startValue: handle.value,
        };
        this.el.style.cursor = 'ns-resize';
        break;
      }
      case 'key': {
        const handle = info.handle as KeyHandle;
        handle.press();
        this.drag = { type: 'key', handle };
        this.emit('noteOn', { midi: handle.midi, noteIndex: handle.noteIndex });
        break;
      }
      case 'button': {
        const handle = info.handle as ButtonHandle;
        handle.toggle();
        this.emit('button', { id: handle.id, active: handle.active, label: handle.label });
        break;
      }
      case 'pad': {
        const handle = info.handle as PadHandle;
        handle.toggle();
        this.emit('pad', { id: handle.id, index: handle.index, lit: handle.lit });
        break;
      }
      default:
        break;
    }
    this.el.setPointerCapture?.(e.pointerId);
  }

  private handleMove(e: PointerEvent): void {
    this.setPointerFromEvent(e);
    this.raycaster.setFromCamera(this.pointer, this.camera);

    if (!this.drag) {
      // Hover cursor
      let cursor = 'default';
      if (this.cables?.pickCable(this.raycaster)) cursor = 'grab';
      else {
        const hits = this.raycaster.intersectObjects(this.interactiveObjects(), true);
        if (hits.length && this.findInteractive(hits[0]!.object)) cursor = 'pointer';
      }
      this.el.style.cursor = cursor;
      return;
    }

    if (this.drag.type === 'knob') {
      const dy = this.drag.startY - e.clientY;
      const next = Math.max(0, Math.min(1, this.drag.startValue + dy / 180));
      this.drag.handle.setValue(next);
      this.emit('knob', {
        id: this.drag.handle.id,
        value: this.drag.handle.value,
        label: this.drag.handle.label,
      });
    } else if (this.drag.type === 'cable' && this.cables) {
      // Project onto a plane at cable height
      const grab = this.drag.token;
      const ref = new THREE.Vector3();
      grab.cable.getEndPosition(grab.endIndex ?? 0, ref);
      this.plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1).applyQuaternion(this.camera.quaternion).normalize(), ref);
      // Prefer horizontal-ish drag plane
      this.plane.normal.set(0, 1, 0);
      this.plane.constant = -ref.y;
      if (this.raycaster.ray.intersectPlane(this.plane, this.hitPoint)) {
        this.cables.moveGrab(this.hitPoint);
      }
    }
  }

  private handleUp(e: PointerEvent): void {
    if (!this.drag) return;

    if (this.drag.type === 'key') {
      this.drag.handle.release();
      this.emit('noteOff', {
        midi: this.drag.handle.midi,
        noteIndex: this.drag.handle.noteIndex,
      });
    } else if (this.drag.type === 'cable' && this.cables) {
      const { token, previousJack } = this.drag;
      const result = this.cables.endGrab();
      let jack = result?.jack ?? null;
      if (token.endIndex != null) {
        if (!jack && previousJack) {
          // Spring back to previous jack
          token.cable.attachEnd(token.endIndex, previousJack);
          jack = previousJack;
        }
        this.emit('replug', {
          endIndex: token.endIndex,
          jackId: jack?.id ?? null,
          previousJackId: previousJack?.id ?? null,
        });
      }
    }

    this.drag = null;
    this.el.style.cursor = 'default';
    try {
      this.el.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  }
}
