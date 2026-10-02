"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { AsciiRenderer } from "@/lib/ascii";
import { buildArm, Mover, solveIK, tipWorld } from "@/lib/arm";

type Pattern = "column" | "interlock";
type Slot = { pos: THREE.Vector3; yaw: number };
type Box = { mesh: THREE.Mesh; slot?: Slot };

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const BOX = { x: 1.5, y: 0.8, z: 1.0 };
const LAYERS = 4;
const PALLET = V(4.4, 0.35, 0); // centre of the deck top
const CONV_TOP = 1.2;
const CONV_Z = 0.3;
const PICK = V(-4.3, CONV_TOP + BOX.y / 2, CONV_Z);
const SPAWN_X = -9.2;
const CONV_SPEED = 2.2;
const VIA = V(0, 4.5, 2.5); // swing in front of the robot between conveyor and pallet
const REST = V(-1.5, 3.8, 2);
const TARGET = V(0.3, 1.6, 0);

const above = (p: THREE.Vector3, h: number) => V(p.x, p.y + BOX.y / 2 + h, p.z);

/** 6 boxes per layer; "interlock" turns every other layer 90° (3×2 instead of 2×3) so the stack ties together. */
function buildSlots(pattern: Pattern): Slot[] {
  const g = 1.08; // gap between boxes between boxes
  const out: Slot[] = [];
  for (let layer = 0; layer < LAYERS; layer++) {
    const turned = pattern === "interlock" && layer % 2 === 1;
    const y = PALLET.y + layer * BOX.y + BOX.y / 2;
    const layerSlots: Slot[] = [];
    for (const a of [-1, 0, 1])
      for (const b of [-0.5, 0.5])
        layerSlots.push(
          turned
            ? { pos: V(PALLET.x + a * BOX.z * g, y, PALLET.z + b * BOX.x * g), yaw: Math.PI / 2 }
            : { pos: V(PALLET.x + b * BOX.x * g, y, PALLET.z + a * BOX.z * g), yaw: 0 },
        );
    // Farthest from the robot first, so it never reaches over boxes it already placed.
    layerSlots.sort((p, q) => Math.hypot(q.pos.x, q.pos.z) - Math.hypot(p.pos.x, p.pos.z));
    out.push(...layerSlots);
  }
  return out;
}

function buildCell(scene: THREE.Scene, mat: THREE.Material) {
  const add = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    scene.add(m);
  };
  // Pallet: deck on nine blocks
  add(3.4, 0.12, 3.4, PALLET.x, PALLET.y - 0.06, PALLET.z);
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) add(0.4, 0.23, 0.4, PALLET.x + a * 1.4, 0.115, PALLET.z + b * 1.4);
  // Conveyor: rails, rollers, legs, end stop
  const [x0, x1] = [-10, -3.5];
  const cx = (x0 + x1) / 2;
  const len = x1 - x0;
  for (const s of [-1, 1]) add(len, 0.22, 0.1, cx, CONV_TOP - 0.05, CONV_Z + s * 0.75);
  for (let x = x0 + 0.3; x < x1; x += 0.55) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 8), mat);
    r.rotation.x = Math.PI / 2;
    r.position.set(x, CONV_TOP - 0.08, CONV_Z);
    scene.add(r);
  }
  for (const x of [x0 + 0.4, x1 - 0.4]) for (const s of [-1, 1]) add(0.12, CONV_TOP - 0.1, 0.12, x, (CONV_TOP - 0.1) / 2, CONV_Z + s * 0.7);
  add(0.1, 0.4, 1.5, x1 + 0.05, CONV_TOP + 0.2, CONV_Z);
}

type Controls = { reset: (p: Pattern) => void };

export default function Palletizer() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statsRef = useRef<HTMLOutputElement>(null);
  const ctrl = useRef<Controls | null>(null);
  const speedRef = useRef(1);
  const [pattern, setPattern] = useState<Pattern>("interlock");
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    const stage = stageRef.current!;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
    scene.add(new THREE.AmbientLight(0xffffff, 0.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 10, 6);
    scene.add(key);
    const side = new THREE.DirectionalLight(0xffffff, 0.9);
    side.position.set(-8, 4, 3);
    scene.add(side);

    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.7 });
    // Darker greys pick different characters, so boxes and pallet read apart from the arm.
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, flatShading: true, roughness: 0.7 });
    const pickedMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, flatShading: true, roughness: 0.7 }); // drawn in the accent colour
    const cellMat = new THREE.MeshStandardMaterial({ color: 0x707070, flatShading: true, roughness: 0.7 });
    const boxGeo = new THREE.BoxGeometry(BOX.x, BOX.y, BOX.z);
    buildCell(scene, cellMat);

    const rig = buildArm(mat);
    for (const f of rig.fingers) f.visible = false; // vacuum tool instead of fingers
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.2, 12), mat);
    cup.position.y = 0.3;
    rig.joints[5].add(cup);
    scene.add(rig.root);

    const ascii = new AsciiRenderer(canvasRef.current!);
    const mover = new Mover(REST);

    let slots: Slot[] = [];
    let conveyor: Box[] = [];
    let placed: Box[] = [];
    let held: Box | null = null;
    let simTime = 0;
    let lastGrab = -1;
    let cycle = 0;

    const removeBox = (b: Box) => scene.remove(b.mesh);
    const reset = (p: Pattern) => {
      [...conveyor, ...placed].forEach(removeBox);
      if (held) removeBox(held);
      conveyor = [];
      placed = [];
      held = null;
      lastGrab = -1;
      cycle = 0;
      slots = buildSlots(p);
      mover.clear();
      mover.queue.push({ to: () => REST.clone(), dur: 0.6 });
    };
    reset("interlock");
    ctrl.current = { reset };

    const plan = () => {
      if (placed.length === slots.length) {
        mover.queue.push(
          { to: () => REST.clone(), dur: 0.6 },
          { dur: 2 },
          { run: () => (placed.forEach(removeBox), (placed = [])), dur: 0.3 },
        );
        return;
      }
      const b = conveyor[0];
      if (!b || b.mesh.position.x < PICK.x - 1e-3) {
        mover.queue.push({ dur: 0.1 });
        return;
      }
      const slot = slots[placed.length];
      mover.queue.push(
        { to: () => above(PICK, 1.2), dur: 0.6 },
        { to: () => above(PICK, 0), dur: 0.3 },
        {
          run: () => {
            conveyor.shift();
            held = b;
            b.slot = slot;
            if (lastGrab >= 0) cycle = cycle ? cycle * 0.7 + (simTime - lastGrab) * 0.3 : simTime - lastGrab;
            lastGrab = simTime;
          },
          dur: 0.15,
        },
        { to: () => above(PICK, 1.2), dur: 0.3 },
        { to: () => VIA.clone(), dur: 0.5 },
        { to: () => above(slot.pos, 1), dur: 0.6 },
        { to: () => above(slot.pos, 0), dur: 0.35 },
        {
          run: () => {
            b.mesh.position.copy(slot.pos);
            b.mesh.rotation.y = slot.yaw;
            b.mesh.material = boxMat;
            placed.push(b);
            held = null;
          },
          dur: 0.15,
        },
        { to: () => above(slot.pos, 1), dur: 0.3 },
      );
    };

    const updateConveyor = (dt: number) => {
      conveyor.forEach((b, i) => {
        const limit = i === 0 ? PICK.x : conveyor[i - 1].mesh.position.x - BOX.x - 0.25;
        b.mesh.position.x = Math.min(limit, b.mesh.position.x + CONV_SPEED * dt);
      });
      const last = conveyor[conveyor.length - 1];
      const needed = slots.length - placed.length - (held ? 1 : 0) - conveyor.length;
      if (needed > 0 && conveyor.length < 4 && (!last || last.mesh.position.x > SPAWN_X + BOX.x + 0.6)) {
        const mesh = new THREE.Mesh(boxGeo, boxMat);
        mesh.position.set(SPAWN_X, PICK.y, CONV_Z);
        scene.add(mesh);
        conveyor.push({ mesh });
      }
    };

    // --- camera: orbit by dragging horizontally ---
    let w = 1;
    let h = 1;
    let theta = 0.35;
    const placeCamera = () => {
      const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      // Phones crop the far end of the conveyor so the cell itself isn't tiny.
      const R = Math.max((w < 700 ? 6.8 : 8.5) / (t * camera.aspect), 3.8 / t);
      const phi = 0.5;
      camera.position.set(
        TARGET.x + R * Math.sin(theta) * Math.cos(phi),
        TARGET.y + R * Math.sin(phi),
        TARGET.z + R * Math.cos(theta) * Math.cos(phi),
      );
      camera.lookAt(TARGET);
    };
    const resize = () => {
      w = stage.clientWidth;
      h = stage.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      placeCamera();
      ascii.setSize(w, h, w < 700 ? 8 : 11, Math.min(window.devicePixelRatio, 2));
    };
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    resize();

    let dragX: number | null = null;
    const onDown = (e: PointerEvent) => {
      dragX = e.clientX;
      stage.setPointerCapture(e.pointerId);
      stage.classList.add("grabbing");
    };
    const onMove = (e: PointerEvent) => {
      if (dragX === null) return;
      theta = THREE.MathUtils.clamp(theta - (e.clientX - dragX) * 0.008, -1.2, 1.2);
      dragX = e.clientX;
      placeCamera();
    };
    const onUp = () => {
      dragX = null;
      stage.classList.remove("grabbing");
    };
    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);

    let visible = false;
    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    io.observe(stage);

    const tmp = new THREE.Vector3();
    let last = performance.now();
    let statsT = 0;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const real = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!visible) return;
      const dt = reduceMotion ? 0 : real * speedRef.current;
      simTime += dt;

      updateConveyor(dt);
      mover.update(dt, plan);
      solveIK(rig, mover.tip, 0, 0);
      if (held) {
        tipWorld(rig, tmp);
        held.mesh.material = pickedMat;
        held.mesh.position.set(tmp.x, tmp.y - BOX.y / 2, tmp.z);
        held.mesh.rotation.y += ((held.slot?.yaw ?? 0) - held.mesh.rotation.y) * (1 - Math.exp(-dt * 4));
      }
      ascii.render(scene, camera);

      if ((statsT += real) > 0.25 && statsRef.current) {
        statsT = 0;
        const perLayer = slots.length / LAYERS;
        const layer = Math.min(LAYERS, Math.floor(placed.length / perLayer) + 1);
        statsRef.current.textContent =
          // Non-breaking inside each reading, so a narrow bar wraps between them, never through one.
          `boxes\u00a0${String(placed.length).padStart(2, "0")}/${slots.length}  ` +
          `layer\u00a0${layer}/${LAYERS}  ` +
          `cycle\u00a0${cycle ? cycle.toFixed(1) + "s" : "--"}  ` +
          `${cycle ? (60 / cycle).toFixed(1) : "--"}\u00a0picks/min`;
      }
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
      scene.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
      boxGeo.dispose();
      [mat, boxMat, pickedMat, cellMat].forEach((m) => m.dispose());
      ascii.dispose();
      ctrl.current = null;
    };
  }, []);

  const choosePattern = (p: Pattern) => {
    setPattern(p);
    ctrl.current?.reset(p);
  };
  const chooseSpeed = (s: number) => {
    setSpeed(s);
    speedRef.current = s;
  };

  return (
    <section className="pallet">
      <header>
        <p className="label">02 / palletizing</p>
        <p>
          A 6-axis arm picking cases off a conveyor and stacking them on a pallet, the kind of cell I write software for.
          Drag to orbit.
        </p>
      </header>
      <div ref={stageRef} className="pallet-stage">
        <canvas ref={canvasRef} aria-label="ASCII render of a robot arm palletizing boxes" role="img" />
      </div>
      <div className="pallet-bar">
        <span>
          pattern{" "}
          {(["column", "interlock"] as const).map((p) => (
            <button key={p} aria-pressed={pattern === p} onClick={() => choosePattern(p)}>
              {p}
            </button>
          ))}
        </span>
        <span>
          speed{" "}
          {[1, 2, 4].map((s) => (
            <button key={s} aria-pressed={speed === s} onClick={() => chooseSpeed(s)}>
              {s}x
            </button>
          ))}
        </span>
        <button onClick={() => ctrl.current?.reset(pattern)}>reset</button>
        <output ref={statsRef} />
      </div>
    </section>
  );
}
