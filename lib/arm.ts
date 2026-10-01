import * as THREE from "three";
import { forward, H0, inverse, L1, L2, W1, W2, type Joints } from "./kinematics";

const TIP = 0.4; // tool tip below the last joint (W2 = 0.25 link + TIP)

export type ArmRig = {
  root: THREE.Group; // place it with root.position only (no rotation)
  joints: THREE.Group[];
  fingers: THREE.Mesh[];
  q: Joints;
};

/** Meshes for the arm. Joint i is a Group rotated by q[i]; dimensions come from kinematics.ts. */
export function buildArm(mat: THREE.Material): ArmRig {
  const root = new THREE.Group();

  const mesh = (parent: THREE.Object3D, geo: THREE.BufferGeometry, y = 0, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.rotation.set(rx, 0, rz);
    parent.add(m);
    return m;
  };
  const joint = (parent: THREE.Object3D, y: number) => {
    const g = new THREE.Group();
    g.position.y = y;
    parent.add(g);
    return g;
  };
  const cyl = (r: number, h: number) => new THREE.CylinderGeometry(r, r, h, 20);
  const box = (w: number, h: number, d = w) => new THREE.BoxGeometry(w, h, d);
  const Z = Math.PI / 2; // turns a cylinder so its axis matches the joint axis

  mesh(root, new THREE.CylinderGeometry(0.75, 0.9, 0.5, 24), 0.25);

  const j1 = joint(root, 0.5); // base yaw
  mesh(j1, new THREE.CylinderGeometry(0.5, 0.6, 0.5, 20), 0.25);

  const j2 = joint(j1, H0 - 0.5); // shoulder
  mesh(j2, cyl(0.45, 0.9), 0, Z);
  mesh(j2, box(0.55, L1), L1 / 2);

  const j3 = joint(j2, L1); // elbow
  mesh(j3, cyl(0.38, 0.75), 0, Z);
  mesh(j3, box(0.42, L2), L2 / 2);

  const j4 = joint(j3, L2); // wrist lean
  mesh(j4, cyl(0.3, 0.6), 0, Z);
  mesh(j4, box(0.32, W1), W1 / 2);

  const j5 = joint(j4, W1); // wrist tilt
  mesh(j5, cyl(0.24, 0.5), 0, 0, Z);
  mesh(j5, box(0.3, W2 - TIP), (W2 - TIP) / 2);

  const j6 = joint(j5, W2 - TIP); // tool roll
  mesh(j6, cyl(0.26, 0.1), 0.05);
  mesh(j6, box(1.0, 0.12, 0.3), 0.14);
  const fingers = [-1, 1].map(() => mesh(j6, box(0.1, 0.42, 0.26), 0.41));

  return { root, joints: [j1, j2, j3, j4, j5, j6], fingers, q: [0, 0, 0, 0, 0, 0] };
}

/** Pose the meshes from joint angles. grip: 0 = open, 1 = closed. */
export function applyJoints(rig: ArmRig, q: Joints, grip = 0, closedWidth = 0.38) {
  const [j1, j2, j3, j4, j5, j6] = rig.joints;
  j1.rotation.y = q[0];
  j2.rotation.z = -q[1];
  j3.rotation.z = -q[2];
  j4.rotation.z = -q[3];
  j5.rotation.x = q[4];
  j6.rotation.y = q[5];
  const w = THREE.MathUtils.lerp(0.5, closedWidth, grip);
  rig.fingers[0].position.x = -w;
  rig.fingers[1].position.x = w;
  rig.q = q;
}

/** IK to a world-space tip target, then pose. */
export function solveIK(rig: ArmRig, target: THREE.Vector3, roll: number, grip: number, pitch = 0, closedWidth = 0.38) {
  applyJoints(rig, inverse(target.clone().sub(rig.root.position), roll, pitch), grip, closedWidth);
}

/** FK: world-space tool tip for the rig's current joints. */
export function tipWorld(rig: ArmRig, out: THREE.Vector3) {
  const p = forward(rig.q);
  return out.set(p.x, p.y, p.z).add(rig.root.position);
}

/** A queued step: optionally move the tip (`to` is evaluated when the step starts), run an action, take `dur` seconds. */
export type Step = { to?: () => THREE.Vector3; roll?: number; pitch?: number; run?: () => void; dur: number };

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Plays queued steps on a commanded tool-tip position + roll. */
export class Mover {
  tip: THREE.Vector3;
  roll = 0;
  pitch = 0;
  queue: Step[] = [];
  private cur: Step | null = null;
  private from = new THREE.Vector3();
  private to: THREE.Vector3 | null = null;
  private fromRoll = 0;
  private fromPitch = 0;
  private t = 0;

  constructor(start: THREE.Vector3, private interpolate: (t: number) => number = ease) {
    this.tip = start.clone();
  }

  update(dt: number, plan: () => void) {
    if (!this.cur) {
      if (!this.queue.length) plan();
      this.cur = this.queue.shift() ?? null;
      if (!this.cur) return;
      this.cur.run?.();
      this.to = this.cur.to?.() ?? null;
      this.restart();
    }
    const s = this.cur;
    this.t += dt / Math.max(s.dur, 1e-3);
    const k = this.interpolate(Math.min(1, this.t));
    if (this.to) this.tip.lerpVectors(this.from, this.to, k);
    if (s.roll !== undefined) this.roll = this.fromRoll + (s.roll - this.fromRoll) * k;
    if (s.pitch !== undefined) this.pitch = this.fromPitch + (s.pitch - this.fromPitch) * k;
    if (this.t >= 1) this.cur = null;
  }

  /** Re-plan the current step from wherever the tip is now (e.g. after a user drag). */
  restart() {
    this.from.copy(this.tip);
    this.fromRoll = this.roll;
    this.fromPitch = this.pitch;
    this.t = 0;
  }

  clear() {
    this.queue = [];
    this.cur = null;
  }
}
