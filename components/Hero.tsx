"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { AsciiRenderer } from "@/lib/ascii";
import { buildArm, Mover, solveIK, tipWorld, type ArmRig, type Step } from "@/lib/arm";
import { Rope } from "@/lib/rope";
import { currentTheme, setTheme } from "@/lib/theme";

const NAME = "SAHAJ SINGH";
const SPACING = 0.95;
const ARM_X = 7.7;
const ARM_Z = -1.2;
const GRIP = 0.3; // letter centre sits this far below the tool tip
const HALF_W = 9.6; // world half-width that must stay in view
const HALF_H = 4.4;
const CAM_Y = 3.4;
const SWITCH_X = 4.6; // the cord hangs from above the top edge of the view, at this x
const KNOB_Y = 6.2; // where the knob rests (kept within the right arm's reach)
const KNOB_GRIP = 0.35; // gripper holds the cord this far above the knob
const PULL = 0.9; // cord travel that flips the switch

type Phase = "scan" | "approach" | "grasp" | "lift" | "transfer" | "place" | "release" | "retract" | "handoff";
type Letter = { state: "falling" | "ready" | "reserved" | "held" | "placed"; velocity: number; delay: number; floor: number; spin: number; el: HTMLElement; home: THREE.Vector3; pos: THREE.Vector3; roll: number; heldBy: Arm | null };
type Arm = {
  phase: Phase;
  active: Letter | null;
  rig: ArmRig;
  mover: Mover;
  own: Letter[];
  rest: THREE.Vector3;
  grip: number;
  gripTarget: number;
  drag: THREE.Vector3 | null;
  service: Step[] | null;
  pending: Step[] | null; // takes over as soon as the arm isn't holding a letter
};

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const at = (p: THREE.Vector3, h: number) => V(p.x, p.y + GRIP + h, p.z);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function pickPlace(arm: Arm, l: Letter, extra: Step[] = []) {
  l.state = "reserved";
  arm.active = l;
  arm.mover.queue.push(...pick(arm, l), ...extra, ...place(arm, l));
}

function pick(arm: Arm, l: Letter): Step[] {
  const phase = (value: Phase) => () => { arm.phase = value; };
  return [
    { run: phase("approach"), to: () => at(l.pos, 1.2), dur: 0.7 },
    { run: phase("grasp"), to: () => at(l.pos, 0), dur: 0.35 },
    { run: () => { l.state = "held"; l.heldBy = arm; arm.gripTarget = 1; }, dur: 0.2 },
    { run: phase("lift"), to: () => at(l.pos, 1.2), dur: 0.35 },
  ];
}

function place(arm: Arm, l: Letter): Step[] {
  const phase = (value: Phase) => () => { arm.phase = value; };
  return [
    { run: phase("transfer"), to: () => at(l.home, 1.2), pitch: 0, dur: 0.8 },
    { run: phase("place"), to: () => at(l.home, 0), dur: 0.35 },
    { run: () => {
        arm.phase = "release";
        l.heldBy = null; l.state = "placed"; l.pos.copy(l.home);
        l.roll = arm.mover.roll = 0; arm.gripTarget = 0;
      }, dur: 0.2 },
    { run: phase("retract"), to: () => at(l.home, 1.2), dur: 0.3 },
    { run: () => { arm.phase = "scan"; arm.active = null; }, dur: 0.1 },
  ];
}

const side = (arm: Arm) => Math.sign(arm.rest.x);
const MEET_Y = 2.7; // tool height of the mid-air pass
// Both arms reach the centre only with the tool horizontal, pointing at the other arm.
const reachAcross = (arm: Arm) => (-side(arm) * Math.PI) / 2;

/** `giver` caught a letter that belongs to `taker`'s half: pass it across mid-air, then `taker` places it. */
function handoff(giver: Arm, taker: Arm, l: Letter, now: () => number) {
  const h = { atMeet: false, taken: false, aborted: false, deadline: now() + 20 };
  const stalled = () => h.aborted || now() > h.deadline;
  const phase = (arm: Arm) => () => { arm.phase = "handoff"; };
  const meet = (arm: Arm) => V(side(arm) * 0.15, MEET_Y, 0);
  const abort = () => {
    h.aborted = true;
    taker.mover.queue = [];
    taker.active = null; taker.phase = "scan"; taker.gripTarget = 0;
  };

  l.state = "reserved";
  giver.active = l;
  taker.active = l;
  giver.mover.queue.push(
    ...pick(giver, l),
    { run: phase(giver), to: () => meet(giver), pitch: reachAcross(giver), roll: Math.PI * 2, dur: 1.1 },
    { run: () => { h.atMeet = true; }, dur: 0.01 },
    { until: () => h.taken || stalled(), dur: 0.01 },
    { run: () => {
        giver.gripTarget = 0;
        // Nobody took it: drop it straight into its slot.
        if (!h.taken) { l.heldBy = null; l.state = "placed"; l.pos.copy(l.home); l.roll = 0; }
      }, to: () => V(side(giver) * 3.5, 3.8, 0), pitch: 0, dur: 0.6 },
    { run: () => { giver.mover.roll = 0; giver.phase = "scan"; giver.active = null; }, dur: 0.1 },
  );
  taker.mover.queue.push(
    { run: phase(taker), to: () => V(side(taker) * 2.5, 3.4, 0), pitch: reachAcross(taker), dur: 1.0 },
    { until: () => h.atMeet || stalled(), dur: 0.01 },
    { run: () => { if (!h.atMeet || l.heldBy !== giver) abort(); }, dur: 0.01 },
    { to: () => meet(taker), dur: 0.5 },
    { run: () => {
        if (l.heldBy !== giver) return abort();
        l.heldBy = taker; taker.gripTarget = 1; giver.gripTarget = 0; h.taken = true;
      }, dur: 0.25 },
    ...place(taker, l),
  );
}

type Telemetry = { phase: Phase; glyph: string; slot: string; arm: string; placed: number; target: string; reduced: boolean };
const INITIAL: Telemetry = { phase: "scan", glyph: "—", slot: "—", arm: "01", placed: 0, target: "—", reduced: false };

export default function Hero({ controllerSource, simulationSource }: { controllerSource: string; simulationSource: string }) {
  const [telemetry, setTelemetry] = useState<Telemetry>(INITIAL);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerBusy, setDrawerBusy] = useState(false);
  const [codeView, setCodeView] = useState<"cpp" | "simulation">("cpp");
  const notchRef = useRef<HTMLButtonElement>(null);
  const controllerRef = useRef<HTMLElement>(null);
  const drawerAction = useRef<() => void>(() => {});
  const sourceLines = (codeView === "cpp" ? controllerSource : simulationSource).split("\n");
  const scan = telemetry.phase === "scan";
  const simulationStart = sourceLines.findIndex((line) => line.startsWith("function pickPlace("));
  const startLine = codeView === "simulation" ? simulationStart : scan ? 29 : 45;
  const endLine = codeView === "simulation" ? sourceLines.findIndex((line) => line.startsWith("type Telemetry")) - 1 : scan ? 44 : 60;
  const codeLines = sourceLines.slice(startLine, endLine);
  const heroRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lettersRef = useRef<HTMLDivElement>(null);
  const cordRef = useRef<SVGPolylineElement>(null);
  const knobRef = useRef<HTMLButtonElement>(null);
  const pullRef = useRef<() => void>(() => {});

  useEffect(() => {
    const hero = heroRef.current!;
    const lettersEl = lettersRef.current!;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(4, 8, 10);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.8);
    rim.position.set(-6, 3, 4);
    scene.add(rim);

    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.6 });
    const jointMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, flatShading: true, roughness: 0.6 }); // joints + end effector, drawn in the accent colour
    const ascii = new AsciiRenderer(canvasRef.current!);

    const letters: Letter[] = Array.from(lettersEl.children as HTMLCollectionOf<HTMLElement>).map((el) => {
      const i = Number(el.dataset.i);
      const home = V((i - (NAME.length - 1) / 2) * SPACING, 0.5, 0);
      return { el, home, pos: home.clone(), roll: 0, heldBy: null, state: "placed", velocity: 0, delay: 0, floor: 0.5, spin: 0 };
    });

    const arms: Arm[] = [-1, 1].map((side) => {
      const rig = buildArm(mat, jointMat);
      rig.root.position.set(side * ARM_X, 0, ARM_Z);
      scene.add(rig.root);
      const rest = V(side * 5.2, 2.8, 0);
      // Outermost letter first, so each arm builds its half inward from its pile.
      const own = letters.filter((l) => Math.sign(l.home.x) === side).sort((a, b) => Math.abs(b.home.x) - Math.abs(a.home.x));
      return { phase: "scan", active: null, rig, mover: new Mover(rest, (t) => t*t*t*(10+t*(-15+6*t))), own, rest, grip: 0, gripTarget: 0, drag: null, service: null, pending: null };
    });

    let simTime = 0;
    const strays: Letter[] = []; // letters that landed in the other arm's lane and need a handoff
    const rain = () => {
      if (reduceMotion || arms.some((arm) => arm.pending) || switching) return;
      for (const arm of arms) {
        arm.mover.clear(); arm.active = null; arm.phase = "scan";
        arm.gripTarget = 0; arm.drag = null;
        const side = Math.sign(arm.rest.x);
        // Shuffle intake lanes, preserving a separate identity for repeated glyphs.
        const lanes = arm.own.map((_, i) => i);
        for (let i = lanes.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
        }
        arm.own.forEach((l, i) => {
          l.state = "falling"; l.heldBy = null;
          l.floor = 1.8 + rand(-0.15, 0.15);
          l.pos.set(side * (0.9 + lanes[i] * 0.95), 9 + rand(0, 3), 0);
          l.delay = simTime + rand(0.1, 2.2); l.velocity = 0;
          l.roll = rand(-0.8, 0.8); l.spin = rand(-0.6, 0.6);
        });
      }
      // One of them drops into the wrong lane, on the other arm's side.
      strays.length = 0;
      const lander = arms[Math.round(Math.random())];
      const owner = arms.find((arm) => arm !== lander)!;
      const stray = owner.own[Math.floor(Math.random() * owner.own.length)];
      stray.pos.x = side(lander) * (0.9 + lander.own.length * 0.95);
      strays.push(stray);
    };
    const plan = (arm: Arm) => () => {
      if (reduceMotion) return;
      const other = arms.find((a) => a !== arm)!;
      const stray = strays.find((l) => l.state === "ready" && Math.sign(l.pos.x) === side(arm));
      const otherIdle = other.phase === "scan" && !other.active && !other.pending && !other.drag && !other.service;
      if (stray && otherIdle) return handoff(arm, other, stray, () => simTime);
      const available = arm.own.filter((l) => l.state === "ready" && !strays.includes(l));
      available.sort((a, b) => arm.mover.tip.distanceToSquared(a.pos) - arm.mover.tip.distanceToSquared(b.pos));
      if (available[0]) pickPlace(arm, available[0]);
      else if (arm.own.every((l) => l.state === "placed")) {
        // Once assembled, keep the original small pick / flip / replace gestures.
        const l = arm.own[Math.floor(Math.random() * arm.own.length)];
        arm.mover.queue.push({ to: () => arm.rest.clone(), dur: 0.8 }, { dur: rand(3, 7) });
        // Reserve only when the idle pause ends, so service requests can interrupt it.
        arm.mover.queue.push({ run: () => pickPlace(arm, l, [
          { to: () => arm.mover.tip.clone(), roll: Math.PI * 2, dur: 1.1 },
        ]), dur: 0.01 });
      } else arm.mover.queue.push({ dur: 0.1 });
    };

    // --- light switch: the right arm drops what it's doing, pulls the cord, the lights change ---
    // The cord is a rope (lib/rope.ts). Its end is pinned by the gripper, the visitor's pointer, or nothing.
    const rope = new Rope(10);
    let cordLen = 1;
    let ropeHeld: Arm | null = null;
    let userPin: THREE.Vector3 | null = null;
    let flipped = false; // one toggle per pull
    let switching = false;
    const toggle = () => setTheme(currentTheme() === "dark" ? "light" : "dark");
    pullRef.current = () => {
      if (reduceMotion) return toggle();
      if (switching) return;
      switching = true;
      knobRef.current!.dataset.waiting = ""; // ring pulses until the arm grabs the cord
      const arm = arms[1];
      const grab = () => V(rope.end.x, rope.end.y + KNOB_GRIP, 0);
      arm.pending = [
        { to: () => grab().add(V(0.4, 0.2, 1.4)), dur: 0.9 }, // come round in front of the cord
        { to: grab, dur: 0.5 },
        { run: () => ((ropeHeld = arm), (arm.gripTarget = 1), delete knobRef.current!.dataset.waiting), dur: 0.3 },
        { to: () => V(rope.ax, rope.ay - cordLen + KNOB_GRIP - PULL, 0), dur: 1.2 }, // slow pull; the switch flips near the bottom
        { dur: 0.4 }, // hold
        { run: () => ((ropeHeld = null), (arm.gripTarget = 0)), dur: 0.25 },
        { to: () => arm.mover.tip.clone().add(V(0.6, 0.6, 1.2)), dur: 0.5 },
        { run: () => (switching = false), to: () => arm.rest.clone(), dur: 0.9 },
      ];
    };

    rain();
    if (reduceMotion) setTelemetry({ ...INITIAL, placed: letters.length, reduced: true });

    // --- layout ---
    let w = 1;
    let h = 1;
    const tmp = new THREE.Vector3();
    const toScreen = (p: THREE.Vector3) => {
      tmp.copy(p).project(camera);
      return { x: ((tmp.x + 1) / 2) * w, y: ((1 - tmp.y) / 2) * h };
    };
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(V(0, 0, 1), 0);
    const ndc = new THREE.Vector2();
    const resize = () => {
      w = hero.clientWidth;
      h = hero.clientHeight;
      camera.aspect = w / h;
      const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const dist = Math.max(HALF_W / (t * camera.aspect), HALF_H / t);
      // Phones see more height than HALF_H: keep the floor put and spend the extra above, where letters fall in.
      const lookY = CAM_Y + (w <= 700 ? Math.max(0, dist * t - HALF_H) : 0);
      camera.position.set(0, lookY + dist * 0.08, dist);
      camera.lookAt(0, lookY, 0);
      camera.updateProjectionMatrix();
      ascii.setSize(w, h, w < 700 ? 8 : 12, Math.min(window.devicePixelRatio, 2));
      const ppu = toScreen(V(0, 0, 0)).y - toScreen(V(0, 1, 0)).y;
      lettersEl.style.fontSize = `${ppu * 1.35}px`;
      const handle = notchRef.current?.firstElementChild as HTMLElement | null;
      if (handle) handle.style.height = `${Math.max(6, ppu * 0.32)}px`;
      // The cord comes down from above the top edge; the knob rests at KNOB_Y (or lower on short screens).
      ray.setFromCamera(ndc.set(V(SWITCH_X, KNOB_Y, 0).project(camera).x, 1), camera);
      const top = ray.ray.intersectPlane(plane, V(0, 0, 0))?.y ?? Infinity;
      const anchorY = top + 0.8;
      cordLen = anchorY - Math.min(KNOB_Y, top - 1.2);
      rope.reset(SWITCH_X, anchorY, cordLen);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(hero);
    resize();

    // The gripper turns sideways and pulls the handle and drawer as one assembly.
    let opened = false;
    let servicing = false;
    let notchHeld = false;
    let hatchProgress = 0;
    let closeTime: number | null = null;
    let closeFrom = 0;
    let glideTime: number | null = null;
    let glideFrom = 0;
    const notchPosition = V(0, 0, 0);
    const notchAt = (progress: number) => {
      const width = controllerRef.current?.getBoundingClientRect().width ?? 0;
      ray.setFromCamera(ndc.set(1 - 2 * (18 + width * progress) / w, 0), camera);
      return ray.ray.intersectPlane(plane, V(0, 0, 0)) ?? V(9, 3.4, 0);
    };
    const notchHome = () => notchAt(0);
    const pullProgress = () => {
      // On narrow screens the drawer glides the remaining way after release.
      // The fixed arm must not follow a full-width drawer beyond its workspace.
      const home = notchHome();
      const travel = toScreen(home).x - toScreen(V(2.4, home.y, 0)).x;
      return THREE.MathUtils.clamp(travel / controllerRef.current!.getBoundingClientRect().width, 0, 1);
    };
    notchPosition.copy(notchHome());
    drawerAction.current = () => {
      if (servicing) return;
      if (reduceMotion) {
        opened = !opened;
        hatchProgress = opened ? 1 : 0;
        setDrawerOpen(opened);
        notchRef.current?.focus();
        return;
      }
      if (opened) {
        servicing = true;
        setDrawerBusy(true);
        closeTime = 0;
        closeFrom = hatchProgress;
        return;
      }
      servicing = true;
      setDrawerBusy(true);
      const arm = arms[1];
      arm.service = [
        { to: () => notchHome().add(V(-0.7, 0, 0)), roll: 0, dur: 0.6 },
        { pitch: Math.PI / 2, dur: 0.45 },
        { to: notchHome, dur: 0.35 },
        { run: () => { notchHeld = true; arm.gripTarget = 1; }, dur: 0.2 },
        { run: () => { opened = true; setDrawerOpen(true); },
          to: () => notchAt(pullProgress()), dur: 1.2 },
        { run: () => {
            notchHeld = false; arm.gripTarget = 0;
            if (hatchProgress < 0.999) { glideFrom = hatchProgress; glideTime = 0; }
            else hatchProgress = 1;
          }, dur: 0.2 },
        { to: () => notchHome().add(V(-0.7, 0, 1.2)), dur: 0.7 },
        { pitch: 0, dur: 0.45 },
        { to: () => arm.rest.clone(), dur: 0.7 },
        { run: () => { servicing = false; setDrawerBusy(false); }, dur: 0.1 },
      ];
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && opened && !servicing) drawerAction.current();
    };
    window.addEventListener("keydown", onEscape);

    // --- pointer: drag an arm's gripper (mouse: anywhere, touch: near a gripper so the page still scrolls) ---
    let dragging: Arm | null = null;

    const pointerWorld = (e: PointerEvent, out: THREE.Vector3) => {
      const r = hero.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      ray.ray.intersectPlane(plane, out);
      out.y = Math.max(out.y, 0.6);
      return out;
    };
    const onDown = (e: PointerEvent) => {
      if (reduceMotion || (e.target as Element).closest("button, a")) return; // the light switch handles its own clicks
      const r = hero.getBoundingClientRect();
      let best: Arm | null = null;
      let bestD = Infinity;
      for (const arm of arms) {
        const s = toScreen(tipWorld(arm.rig, V(0, 0, 0)));
        const d = Math.hypot(s.x - (e.clientX - r.left), s.y - (e.clientY - r.top));
        if (d < bestD) [best, bestD] = [arm, d];
      }
      if (!best || (e.pointerType !== "mouse" && bestD > 44)) return;
      dragging = best;
      best.drag = pointerWorld(e, V(0, 0, 0));
      hero.setPointerCapture(e.pointerId);
      hero.classList.add("grabbing");
    };
    const onMove = (e: PointerEvent) => {
      if (dragging?.drag) pointerWorld(e, dragging.drag);
    };
    const onUp = () => {
      if (!dragging) return;
      dragging.drag = null;
      dragging.mover.restart();
      dragging = null;
      hero.classList.remove("grabbing");
    };
    const blockScroll = (e: TouchEvent) => {
      if (dragging) e.preventDefault();
    };
    // Knob: drag it to pull the cord yourself; a tap (or Enter) sends the robot instead.
    const knobEl = knobRef.current!;
    let knobStart = { x: 0, y: 0, moved: false };
    const knobDown = (e: PointerEvent) => {
      if (ropeHeld) return;
      knobEl.setPointerCapture(e.pointerId);
      knobStart = { x: e.clientX, y: e.clientY, moved: false };
      userPin = pointerWorld(e, V(0, 0, 0));
    };
    const knobMove = (e: PointerEvent) => {
      if (!userPin) return;
      knobStart.moved ||= Math.hypot(e.clientX - knobStart.x, e.clientY - knobStart.y) > 6;
      pointerWorld(e, userPin);
    };
    const knobUp = () => {
      if (!userPin) return;
      userPin = null;
      if (!knobStart.moved) pullRef.current();
    };
    const knobKey = (e: MouseEvent) => e.detail === 0 && pullRef.current(); // keyboard "click"
    knobEl.addEventListener("pointerdown", knobDown);
    knobEl.addEventListener("pointermove", knobMove);
    knobEl.addEventListener("pointerup", knobUp);
    knobEl.addEventListener("pointercancel", knobUp);
    knobEl.addEventListener("click", knobKey);
    hero.addEventListener("pointerdown", onDown);
    hero.addEventListener("pointermove", onMove);
    hero.addEventListener("pointerup", onUp);
    hero.addEventListener("pointercancel", onUp);
    hero.addEventListener("touchstart", blockScroll, { passive: false });
    hero.addEventListener("touchmove", blockScroll, { passive: false });

    let visible = true;
    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    io.observe(hero);

    // --- loop ---
    let last = performance.now();
    let raf = 0;
    let telemetryAt = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!visible) return;

      simTime += dt;
      for (const l of letters) {
        if (l.state !== "falling" || simTime < l.delay) continue;
        l.velocity -= 9.81 * dt;
        l.pos.y += l.velocity * dt;
        l.roll += l.spin * dt;
        if (l.pos.y <= l.floor) {
          l.pos.y = l.floor; l.velocity = 0; l.roll = 0; l.state = "ready";
        }
      }
      const placed = letters.filter((l) => l.state === "placed").length;
      if (!reduceMotion && simTime - telemetryAt > 0.1) {
        telemetryAt = simTime;
        const arm = arms.find((a) => a.active) ?? arms[0];
        const l = arm.active;
        setTelemetry({ phase: arm.phase, glyph: l?.el.textContent ?? "—",
          slot: l ? String(Number(l.el.dataset.i)).padStart(2, "0") : "—",
          arm: arm === arms[0] ? "01" : "02", placed,
          target: `${arm.mover.tip.x.toFixed(2)}, ${arm.mover.tip.y.toFixed(2)}, ${arm.mover.tip.z.toFixed(2)}`, reduced: false });
      }
      for (const arm of arms) {
        // Finish the held letter, then temporarily service the hidden hatch.
        if (arm.service && !arm.active && !arm.drag && !ropeHeld && !switching) {
          arm.mover.clear();
          arm.mover.queue.push(...arm.service);
          arm.service = null;
        }
        // Light switch takes over as soon as the arm's hands are empty; a reserved letter goes back to the pool.
        if (arm.pending && !servicing && !letters.some((l) => l.heldBy === arm)) {
          if (arm.active?.state === "reserved") arm.active.state = "ready";
          arm.active = null;
          arm.phase = "scan";
          arm.mover.clear();
          arm.mover.queue.push(...arm.pending);
          arm.pending = null;
        }
        if (arm.drag) arm.mover.tip.lerp(arm.drag, 1 - Math.exp(-dt * 14));
        else arm.mover.update(dt, plan(arm));
        arm.grip += (arm.gripTarget - arm.grip) * (1 - Math.exp(-dt * 12));
        solveIK(arm.rig, arm.mover.tip, arm.mover.roll, arm.grip, arm.mover.pitch,
          arm === arms[1] && servicing ? 0.16 : 0.38);
      }

      for (const l of letters) {
        if (l.heldBy) {
          tipWorld(l.heldBy.rig, l.pos).y -= GRIP;
          l.roll = l.heldBy.mover.roll;
        }
        const s = toScreen(l.pos);
        l.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%) perspective(600px) rotateY(${l.roll}rad)`;
      }

      if (glideTime !== null) {
        glideTime = Math.min(1, glideTime + dt / 0.65);
        const t = glideTime;
        hatchProgress = glideFrom + (1 - glideFrom) * t*t*t*(10+t*(-15+6*t));
        if (t === 1) glideTime = null;
      }
      if (closeTime !== null) {
        closeTime = Math.min(1, closeTime + dt / 0.65);
        const t = closeTime;
        hatchProgress = closeFrom * (1 - t*t*t*(10+t*(-15+6*t)));
        if (t === 1) {
          closeTime = null; opened = false; servicing = false;
          setDrawerOpen(false); setDrawerBusy(false); notchRef.current?.focus();
        }
      }
      if (notchHeld) {
        notchPosition.copy(tipWorld(arms[1].rig, V(0, 0, 0)));
        const home = toScreen(notchHome());
        const held = toScreen(notchPosition);
        hatchProgress = THREE.MathUtils.clamp((home.x - held.x) / controllerRef.current!.getBoundingClientRect().width, 0, 1);
      } else notchPosition.copy(notchAt(hatchProgress));
      if (controllerRef.current) controllerRef.current.style.transform = `translateX(${(1 - hatchProgress) * 100}%)`;
      const notchScreen = toScreen(notchPosition);
      if (notchRef.current) notchRef.current.style.transform = `translate(${notchScreen.x}px, ${notchScreen.y}px) translate(-50%, -50%)`;

      // Cord: rope sim with a slow draught for idle sway. Pulled far enough -> the switch flips once.
      const pin = ropeHeld ? tipWorld(ropeHeld.rig, V(0, 0, 0)).sub(V(0, KNOB_GRIP, 0)) : userPin;
      rope.step(dt, pin, Math.sin(now / 900) * 1.5);
      if (rope.extra > PULL * 0.75 && !flipped) (flipped = true), toggle();
      if (rope.extra < 0.1) flipped = false;
      cordRef.current?.setAttribute("points", rope.pts.map((p) => { const s = toScreen(V(p.x, p.y, 0)); return `${s.x},${s.y}`; }).join(" "));
      const k = toScreen(V(rope.end.x, rope.end.y, 0));
      knobEl.style.transform = `translate(${k.x}px, ${k.y}px) translate(-50%, -15%)`;

      ascii.render(scene, camera);
      lettersEl.classList.add("ready");
    };
    tick();

    return () => {
      drawerAction.current = () => {};
      window.removeEventListener("keydown", onEscape);
      pullRef.current = () => {};
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      knobEl.removeEventListener("pointerdown", knobDown);
      knobEl.removeEventListener("pointermove", knobMove);
      knobEl.removeEventListener("pointerup", knobUp);
      knobEl.removeEventListener("pointercancel", knobUp);
      knobEl.removeEventListener("click", knobKey);
      hero.removeEventListener("pointerdown", onDown);
      hero.removeEventListener("pointermove", onMove);
      hero.removeEventListener("pointerup", onUp);
      hero.removeEventListener("pointercancel", onUp);
      hero.removeEventListener("touchstart", blockScroll);
      hero.removeEventListener("touchmove", blockScroll);
      scene.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
      mat.dispose();
      jointMat.dispose();
      ascii.dispose();
    };
  }, []);

  return (
    <section className="hero-layout" aria-label="Robot letter sorting" data-drawer-open={drawerOpen}>
    <div ref={heroRef} className="hero">
      <canvas ref={canvasRef} aria-hidden />
      <h1 className="sr-only">Sahaj Singh</h1>
      <svg className="cord" aria-hidden>
        <polyline ref={cordRef} />
      </svg>
      <button
        ref={knobRef}
        className="pull"
        aria-label="Toggle lights (dark mode): tap for the robot, or drag to pull it yourself"
      >
        <svg className="pull-bulb" viewBox="0 0 24 34" aria-hidden>
          <path d="M8 10V3h8v7l1.5 3a10 10 0 1 1-11 0Z" />
          <path d="M8 5h8M8 8h8M10 10v7l-2 4m6-11v7l2 4M10 17h4" fill="none" />
        </svg>
        <span className="pull-hit" aria-hidden />
        <span className="pull-tip" aria-hidden>
          let robo handle this,
          <br />
          just click
        </span>
      </button>
      <div ref={lettersRef} className="hero-letters" aria-hidden>
        {NAME.split("").map((c, i) =>
          c === " " ? null : (
            <span key={i} data-i={i}>
              {c}
            </span>
          ),
        )}
      </div>
      <button ref={notchRef} className="hero-notch" aria-label={drawerOpen ? "Close controller hatch" : "Reveal controller hatch"}
        aria-expanded={drawerOpen} aria-controls="hero-controller" aria-busy={drawerBusy}
        disabled={drawerBusy} onClick={() => drawerAction.current()}>
        <span className="notch-grip" />
        <span className="pull-hit" aria-hidden />
        <span className="pull-tip" aria-hidden>click me</span>
      </button>
      <div aria-hidden className="pointer-events-none absolute bottom-7 left-8 z-[2] flex flex-col items-start gap-1 text-[11px] uppercase tracking-[0.12em] text-muted max-[700px]:hidden">
        <span>scroll</span>
        <span className="text-base leading-none motion-safe:animate-bounce">↓</span>
      </div>
      <a className="hero-work-link max-[700px]:hidden" href="#selected-work">Selected work ↗</a>
    </div>
    {/* Phones: the scene is short, so the role line and the way in sit beneath it instead of over it. */}
    <div className="hidden px-4 pt-2 pb-2 text-[13px] leading-relaxed tracking-[0.04em] max-[700px]:block">
      <p className="text-fg">Robotics Application Engineer · Jacobi</p>
      <p className="mt-1 text-muted">Tap the bulb to switch the lights. Drag an arm by its gripper.</p>
      <a className="mt-5 inline-block border-b border-accent py-1 text-accent no-underline" href="#selected-work">Selected work ↓</a>
    </div>
    <aside ref={controllerRef} id="hero-controller" className="controller" aria-label="Live C++ controller reference" inert={!drawerOpen} aria-hidden={!drawerOpen}>
      <header><span>{codeView === "cpp" ? "letter_controller.cpp" : "Hero.tsx / pickPlace"}</span><button className="controller-close" aria-label="Close controller hatch" disabled={drawerBusy} onClick={() => drawerAction.current()}>×</button></header>
      <div className="controller-title"><p>UNDER THE HOOD <span className="controller-live">/ {telemetry.reduced ? "STATIC" : "LIVE SIM"}</span></p></div>
      <div className="controller-views" aria-label="Code view"><button aria-pressed={codeView === "cpp"} onClick={() => setCodeView("cpp")}>C++ controller</button><button aria-pressed={codeView === "simulation"} onClick={() => setCodeView("simulation")}>Browser simulation</button></div>
      <div className="controller-status"><span>ARM {telemetry.arm} / {telemetry.phase.toUpperCase()}</span><span>{telemetry.placed}/10 PLACED</span></div>
      <pre className="controller-code"><code>{codeLines.map((line, i) => {
        const active = codeView === "simulation" ? line.includes(`phase("${telemetry.phase}")`) || line.includes(`arm.phase = "${telemetry.phase}"`) : scan ? line.includes("candidate < cost") : line.includes(`Phase::${telemetry.phase},`);
        return <span key={`${startLine}-${i}`} className={active ? "code-line active" : "code-line"}><span className="line-number">{startLine + i + 1}</span><span>{line.replace(/^ {4}/, "") || " "}</span></span>;
      })}</code></pre>
      <dl className="controller-telemetry"><div><dt>GLYPH → SLOT</dt><dd>{telemetry.glyph} → {telemetry.slot}</dd></div><div><dt>TOOL TARGET / m</dt><dd>{telemetry.target}</dd></div></dl>
      <footer><span>C++20 reference · browser simulation</span><a href="/letter-controller.cpp" download>Source ↓</a></footer>
    </aside>
    </section>
  );
}
