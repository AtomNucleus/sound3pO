import * as THREE from 'three';
import type { JackHandle } from './device';
import { PALETTE } from './materials';

/** Endpoint: jack handle or fixed world position. */
export type CableEndpoint = JackHandle | THREE.Vector3;

/** Options for {@link PatchCable}. */
export interface PatchCableOptions {
  color?: THREE.ColorRepresentation;
  from: CableEndpoint;
  to: CableEndpoint;
  /** Extra length fraction beyond straight-line distance. Default 0.35. */
  slack?: number;
  /** Verlet particle count. Default 24. */
  segments?: number;
  /** Cable tube radius. Default 0.028. */
  radius?: number;
  /**
   * Peak arc height above the endpoints (world units).
   * Default = max(0.35, distance * 0.55).
   */
  arcHeight?: number;
}

/** Opaque grab token from {@link PatchCable.grabNearest}. */
export interface CableGrabToken {
  cable: PatchCable;
  /** Particle index being dragged. */
  particleIndex: number;
  /** Which end if grabbing a plug: 0 | 1 | null for mid-cable. */
  endIndex: 0 | 1 | null;
}

const MAX_STRETCH = 1.15;
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();

function resolvePos(ep: CableEndpoint, out: THREE.Vector3): THREE.Vector3 {
  if (ep instanceof THREE.Vector3) return out.copy(ep);
  return ep.getWorldPosition(out);
}

/**
 * Elastic patch cable: verlet rope (~24 particles) rendered as a CatmullRom tube
 * with cylindrical plugs at both ends.
 *
 * Grabbing mid-cable allows ~15% stretch with spring-back; released cable settles under gravity.
 */
export class PatchCable {
  readonly group: THREE.Group;
  readonly color: THREE.Color;
  /** Particle count (including endpoints). */
  readonly segmentCount: number;
  private particles: THREE.Vector3[] = [];
  private prev: THREE.Vector3[] = [];
  private restPose: THREE.Vector3[] = [];
  private restLength = 0.05;
  private slack: number;
  private radius: number;
  private from: CableEndpoint;
  private to: CableEndpoint;
  private attached: [JackHandle | null, JackHandle | null] = [null, null];
  private tubeMesh: THREE.Mesh | null = null;
  private plugA: THREE.Mesh;
  private plugB: THREE.Mesh;
  private material: THREE.MeshPhysicalMaterial;
  private plugMat: THREE.MeshStandardMaterial;
  /** Mild gravity — rest-pose spring holds the signature arc above the deck. */
  private gravity = new THREE.Vector3(0, -1.2, 0);
  private damping = 0.96;
  private poseSpring = 0.28;
  private grabIndex: number | null = null;
  private readonly grabPos = new THREE.Vector3();
  private disposed = false;
  private readonly posA = new THREE.Vector3();
  private readonly posB = new THREE.Vector3();
  private arcHeight: number;

  constructor(scene: THREE.Scene, opts: PatchCableOptions) {
    this.color = new THREE.Color(opts.color ?? PALETTE.cableRed);
    // Keep cable hues vivid under ACES (avoid washed peach)
    const hsl = { h: 0, s: 0, l: 0 };
    this.color.getHSL(hsl);
    this.color.setHSL(hsl.h, Math.min(1, Math.max(0.85, hsl.s * 1.15)), Math.min(0.48, Math.max(0.35, hsl.l)));

    this.from = opts.from;
    this.to = opts.to;
    this.slack = opts.slack ?? 0.55;
    this.segmentCount = opts.segments ?? 24;
    this.radius = opts.radius ?? 0.03;
    this.arcHeight = opts.arcHeight ?? -1;

    if (!(opts.from instanceof THREE.Vector3)) this.attached[0] = opts.from;
    if (!(opts.to instanceof THREE.Vector3)) this.attached[1] = opts.to;

    this.group = new THREE.Group();
    this.group.name = 'patchCable';
    this.group.userData.cable = this;
    scene.add(this.group);

    // Saturated rubber — mild emissive so red survives ACES without going pink
    this.material = new THREE.MeshPhysicalMaterial({
      color: this.color,
      roughness: 0.75,
      metalness: 0.0,
      clearcoat: 0.15,
      clearcoatRoughness: 0.6,
      emissive: this.color.clone().multiplyScalar(0.35),
      emissiveIntensity: 0.35,
    });
    this.plugMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a18,
      metalness: 0.65,
      roughness: 0.4,
    });

    const plugGeo = new THREE.CylinderGeometry(this.radius * 1.55, this.radius * 1.15, 0.1, 14);
    this.plugA = new THREE.Mesh(plugGeo, this.plugMat);
    this.plugB = new THREE.Mesh(plugGeo.clone(), this.plugMat);
    this.plugA.castShadow = true;
    this.plugB.castShadow = true;
    this.plugA.userData.cableEnd = { cable: this, endIndex: 0 as const };
    this.plugB.userData.cableEnd = { cable: this, endIndex: 1 as const };
    this.group.add(this.plugA, this.plugB);

    this.initParticles();
    this.rebuildTube();
  }

  private initParticles(): void {
    if (!(this.from instanceof THREE.Vector3)) {
      this.from.mesh.updateWorldMatrix(true, false);
    }
    if (!(this.to instanceof THREE.Vector3)) {
      this.to.mesh.updateWorldMatrix(true, false);
    }
    resolvePos(this.from, this.posA);
    resolvePos(this.to, this.posB);
    const dist = Math.max(this.posA.distanceTo(this.posB), 0.25);
    const height = this.arcHeight > 0 ? this.arcHeight : Math.max(0.45, dist * 0.85);
    this.arcHeight = height;
    const total = Math.max(dist * (1 + this.slack), dist + height * 1.4);
    this.restLength = total / (this.segmentCount - 1);
    this.particles = [];
    this.prev = [];
    this.restPose = [];
    for (let i = 0; i < this.segmentCount; i++) {
      const t = i / (this.segmentCount - 1);
      const p = new THREE.Vector3().lerpVectors(this.posA, this.posB, t);
      // Tall sine arc above the deck (product-photo signature)
      p.y += Math.sin(t * Math.PI) * height;
      this.particles.push(p);
      this.prev.push(p.clone());
      this.restPose.push(p.clone());
    }
  }

  /** Rebuild arched rest pose between current endpoints (keeps signature arc). */
  private refreshRestPose(): void {
    for (let i = 0; i < this.segmentCount; i++) {
      const t = i / (this.segmentCount - 1);
      const p = this.restPose[i]!;
      p.lerpVectors(this.posA, this.posB, t);
      p.y += Math.sin(t * Math.PI) * this.arcHeight;
    }
  }

  /** Current grab world position (valid while grabbed). */
  getGrabPosition(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.grabPos);
  }

  /**
   * Advance verlet simulation.
   * @param dt - Delta seconds
   */
  update(dt: number): void {
    if (this.disposed) return;
    const h = Math.min(dt, 0.033);
    resolvePos(this.from, this.posA);
    resolvePos(this.to, this.posB);
    this.refreshRestPose();

    if (this.grabIndex !== 0) {
      this.particles[0]!.copy(this.posA);
      this.prev[0]!.copy(this.posA);
    }
    if (this.grabIndex !== this.segmentCount - 1) {
      this.particles[this.segmentCount - 1]!.copy(this.posB);
      this.prev[this.segmentCount - 1]!.copy(this.posB);
    }

    if (this.grabIndex != null) {
      this.particles[this.grabIndex]!.copy(this.grabPos);
      this.prev[this.grabIndex]!.copy(this.grabPos);
    }

    // Idle: lerp to arched rest pose (smooth product-photo cable).
    // Grabbed: verlet + stretch for elastic feel.
    if (this.grabIndex == null) {
      for (let i = 1; i < this.segmentCount - 1; i++) {
        this.particles[i]!.lerp(this.restPose[i]!, 0.5);
        this.prev[i]!.copy(this.particles[i]!);
      }
      this.particles[0]!.copy(this.posA);
      this.particles[this.segmentCount - 1]!.copy(this.posB);
      this.rebuildTube();
      this.updatePlugs();
      return;
    }

    const substeps = 3;
    const step = h / substeps;
    for (let s = 0; s < substeps; s++) {
      for (let i = 1; i < this.segmentCount - 1; i++) {
        if (i === this.grabIndex) continue;
        const p = this.particles[i]!;
        const pr = this.prev[i]!;
        const pose = this.restPose[i]!;
        const vx = (p.x - pr.x) * this.damping;
        const vy = (p.y - pr.y) * this.damping;
        const vz = (p.z - pr.z) * this.damping;
        pr.copy(p);
        const spring = this.poseSpring * 0.35;
        p.x += vx + this.gravity.x * step * step + (pose.x - p.x) * spring;
        p.y += vy + this.gravity.y * step * step + (pose.y - p.y) * spring;
        p.z += vz + this.gravity.z * step * step + (pose.z - p.z) * spring;
      }

      for (let iter = 0; iter < 4; iter++) {
        for (let i = 0; i < this.segmentCount - 1; i++) {
          const a = this.particles[i]!;
          const b = this.particles[i + 1]!;
          _dir.subVectors(b, a);
          const d = _dir.length();
          if (d < 1e-6) continue;
          const maxLen = this.restLength * MAX_STRETCH;
          const targetLen = Math.min(Math.max(d, this.restLength * 0.85), maxLen);
          const corr = ((d - targetLen) / d) * 0.5;
          const aPinned = i === 0 || i === this.grabIndex;
          const bPinned = i + 1 === this.segmentCount - 1 || i + 1 === this.grabIndex;
          if (aPinned && bPinned) continue;
          if (aPinned) {
            b.x -= _dir.x * corr * 2;
            b.y -= _dir.y * corr * 2;
            b.z -= _dir.z * corr * 2;
          } else if (bPinned) {
            a.x += _dir.x * corr * 2;
            a.y += _dir.y * corr * 2;
            a.z += _dir.z * corr * 2;
          } else {
            a.x += _dir.x * corr;
            a.y += _dir.y * corr;
            a.z += _dir.z * corr;
            b.x -= _dir.x * corr;
            b.y -= _dir.y * corr;
            b.z -= _dir.z * corr;
          }
        }
        if (this.grabIndex !== 0) this.particles[0]!.copy(this.posA);
        if (this.grabIndex !== this.segmentCount - 1) {
          this.particles[this.segmentCount - 1]!.copy(this.posB);
        }
        this.particles[this.grabIndex]!.copy(this.grabPos);
      }
    }

    this.rebuildTube();
    this.updatePlugs();
  }

  private rebuildTube(): void {
    const curve = new THREE.CatmullRomCurve3(this.particles);
    const geo = new THREE.TubeGeometry(curve, Math.max(48, this.segmentCount * 3), this.radius, 10, false);
    if (this.tubeMesh) {
      this.tubeMesh.geometry.dispose();
      this.tubeMesh.geometry = geo;
    } else {
      this.tubeMesh = new THREE.Mesh(geo, this.material);
      this.tubeMesh.castShadow = true;
      this.tubeMesh.receiveShadow = false;
      this.tubeMesh.userData.cable = this;
      this.group.add(this.tubeMesh);
    }
  }

  private updatePlugs(): void {
    const orient = (plug: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void => {
      plug.position.copy(a);
      _dir.subVectors(b, a).normalize();
      if (_dir.lengthSq() < 1e-6) return;
      plug.quaternion.setFromUnitVectors(_up, _dir);
    };
    orient(this.plugA, this.particles[0]!, this.particles[1]!);
    orient(
      this.plugB,
      this.particles[this.segmentCount - 1]!,
      this.particles[this.segmentCount - 2]!,
    );
  }

  /**
   * Grab the nearest particle / plug to a world point.
   * @returns Grab token or null if too far
   */
  grabNearest(worldPoint: THREE.Vector3, maxDist = 0.35): CableGrabToken | null {
    let best = -1;
    let bestD = maxDist;
    for (let i = 0; i < this.segmentCount; i++) {
      const d = this.particles[i]!.distanceTo(worldPoint);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) return null;
    this.grabIndex = best;
    this.grabPos.copy(worldPoint);
    let endIndex: 0 | 1 | null = null;
    if (best <= 1) endIndex = 0;
    else if (best >= this.segmentCount - 2) endIndex = 1;
    return { cable: this, particleIndex: best, endIndex };
  }

  /** Move an active grab. */
  moveGrab(token: CableGrabToken, worldPoint: THREE.Vector3): void {
    if (token.cable !== this) return;
    this.grabIndex = token.particleIndex;
    this.grabPos.copy(worldPoint);
  }

  /** Release grab; cable springs back. */
  releaseGrab(token: CableGrabToken): void {
    if (token.cable !== this) return;
    this.grabIndex = null;
  }

  /**
   * Attach an end to a jack (updates simulation pin).
   * @param endIndex - 0 = from, 1 = to
   */
  attachEnd(endIndex: 0 | 1, jack: JackHandle): void {
    this.attached[endIndex] = jack;
    if (endIndex === 0) this.from = jack;
    else this.to = jack;
  }

  /** Detach an end; pin stays at last world position as a free Vector3. */
  detachEnd(endIndex: 0 | 1): void {
    const pos = new THREE.Vector3();
    if (endIndex === 0) {
      resolvePos(this.from, pos);
      this.from = pos.clone();
    } else {
      resolvePos(this.to, pos);
      this.to = pos.clone();
    }
    this.attached[endIndex] = null;
  }

  /** Currently attached jack for an end (null if free). */
  getAttached(endIndex: 0 | 1): JackHandle | null {
    return this.attached[endIndex];
  }

  /** World positions of cable ends. */
  getEndPosition(endIndex: 0 | 1, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(endIndex === 0 ? this.particles[0]! : this.particles[this.segmentCount - 1]!);
  }

  /** Plug meshes for raycasting. */
  getPlugs(): [THREE.Mesh, THREE.Mesh] {
    return [this.plugA, this.plugB];
  }

  /** Tube mesh for raycasting. */
  getTube(): THREE.Mesh | null {
    return this.tubeMesh;
  }

  dispose(): void {
    this.disposed = true;
    this.tubeMesh?.geometry.dispose();
    this.material.dispose();
    this.plugMat.dispose();
    this.plugA.geometry.dispose();
    this.plugB.geometry.dispose();
    this.group.removeFromParent();
  }
}

/** Options for {@link CableManager}. */
export interface CableManagerOptions {
  /** Snap distance when releasing a plug near a jack. Default 0.12. */
  snapRadius?: number;
}

/**
 * Owns multiple {@link PatchCable}s, raycast picking, and per-frame updates.
 */
export class CableManager {
  readonly cables: PatchCable[] = [];
  private snapRadius: number;
  private activeGrab: CableGrabToken | null = null;
  private jacks: JackHandle[] = [];
  private readonly tmp = new THREE.Vector3();

  constructor(opts: CableManagerOptions = {}) {
    this.snapRadius = opts.snapRadius ?? 0.12;
  }

  /** Register jacks for snap / highlight. */
  setJacks(jacks: JackHandle[]): void {
    this.jacks = jacks;
  }

  add(cable: PatchCable): void {
    this.cables.push(cable);
  }

  /** Create and register a cable. */
  create(scene: THREE.Scene, opts: PatchCableOptions): PatchCable {
    const c = new PatchCable(scene, opts);
    this.add(c);
    return c;
  }

  update(dt: number): void {
    for (const c of this.cables) c.update(dt);
  }

  /**
   * Raycast against cable tubes and plugs.
   * @returns Grab token if hit
   */
  pickCable(raycaster: THREE.Raycaster): CableGrabToken | null {
    const objs: THREE.Object3D[] = [];
    for (const c of this.cables) {
      const tube = c.getTube();
      if (tube) objs.push(tube);
      objs.push(...c.getPlugs());
    }
    const hits = raycaster.intersectObjects(objs, false);
    if (!hits.length) return null;
    const hit = hits[0]!;
    const endMeta = hit.object.userData.cableEnd as { cable: PatchCable; endIndex: 0 | 1 } | undefined;
    if (endMeta) {
      const particleIndex = endMeta.endIndex === 0 ? 0 : endMeta.cable.segmentCount - 1;
      const token: CableGrabToken = {
        cable: endMeta.cable,
        particleIndex,
        endIndex: endMeta.endIndex,
      };
      endMeta.cable.moveGrab(token, hit.point);
      // force grab index via grabNearest then override end
      const grabbed = endMeta.cable.grabNearest(hit.point, 2);
      if (!grabbed) return token;
      return { ...grabbed, particleIndex, endIndex: endMeta.endIndex };
    }
    const cable =
      (hit.object.userData.cable as PatchCable | undefined) ??
      (hit.object.parent?.userData.cable as PatchCable | undefined);
    if (!cable) return null;
    return cable.grabNearest(hit.point, 1);
  }

  /** Begin grab from interaction controller. */
  beginGrab(token: CableGrabToken): void {
    this.activeGrab = token;
    if (token.endIndex != null) {
      token.cable.detachEnd(token.endIndex);
    }
  }

  moveGrab(worldPoint: THREE.Vector3): void {
    if (!this.activeGrab) return;
    this.activeGrab.cable.moveGrab(this.activeGrab, worldPoint);
    this.highlightNearby(worldPoint);
  }

  /**
   * Release grab. If an end-plug is near a jack, attach and return that jack.
   */
  endGrab(): { token: CableGrabToken; jack: JackHandle | null } | null {
    if (!this.activeGrab) return null;
    const token = this.activeGrab;
    let jack: JackHandle | null = null;
    if (token.endIndex != null) {
      token.cable.getGrabPosition(this.tmp);
      jack = this.findNearestJack(this.tmp);
      if (jack) token.cable.attachEnd(token.endIndex, jack);
    }
    token.cable.releaseGrab(token);
    this.activeGrab = null;
    this.clearHighlights();
    return { token, jack };
  }

  getActiveGrab(): CableGrabToken | null {
    return this.activeGrab;
  }

  findNearestJack(worldPoint: THREE.Vector3, radius = this.snapRadius): JackHandle | null {
    let best: JackHandle | null = null;
    let bestD = radius;
    const p = new THREE.Vector3();
    for (const j of this.jacks) {
      const d = j.getWorldPosition(p).distanceTo(worldPoint);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    return best;
  }

  highlightNearby(worldPoint: THREE.Vector3): void {
    const p = new THREE.Vector3();
    for (const j of this.jacks) {
      const d = j.getWorldPosition(p).distanceTo(worldPoint);
      j.highlight(d < this.snapRadius * 1.5);
    }
  }

  clearHighlights(): void {
    for (const j of this.jacks) j.highlight(false);
  }

  dispose(): void {
    for (const c of this.cables) c.dispose();
    this.cables.length = 0;
  }
}
