"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { AsciiRenderer } from "@/lib/ascii";
import { buildArm, Mover, solveIK, tipWorld } from "@/lib/arm";
import { PROJECTS, type Project } from "@/content/projects";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const CRATE = { x: 1.2, y: 0.5, z: 0.6 };
const STEP = { dy: 0.6, dz: 0.7, w: 6.0, y0: 0.3 }; // one step per year, rising away from the viewer
const COL = 1.4;
const GRIP = 0.3; // crate centre below the tool tip
const HIGH = 3.9; // travel height, clears every step
const ARM_BASE = V(0, 1.2, -4.3); // on a pedestal behind the stairs
const REST = V(0, 3.6, -2.2);
const PRESENT = V(-3.2, 3.4, 0.6); // held up to the viewer, clear of the stairs
const TARGET = V(0, 2.4, -1);

const YEARS = [...new Set(PROJECTS.map((p) => p.year))].sort();

type Crate = { project: Project; mesh: THREE.Mesh; home: THREE.Vector3; label: HTMLElement };

export default function Projects() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const yearsRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<(i: number | null) => void>(() => {});
  const [open, setOpen] = useState<Project | null>(null);

  useEffect(() => {
    const stage = stageRef.current!;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
    scene.add(new THREE.AmbientLight(0xffffff, 0.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(4, 9, 8);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.7);
    fill.position.set(-6, 3, 5);
    scene.add(fill);

    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.7 });
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x777777, flatShading: true, roughness: 0.8 });
    const pickedMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, flatShading: true, roughness: 0.7 }); // drawn in the accent colour
    const add = (w: number, h: number, d: number, x: number, y: number, z: number, m = mat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      scene.add(mesh);
      return mesh;
    };

    // Stairs: a plank + two legs per year
    YEARS.forEach((_, k) => {
      const y = STEP.y0 + k * STEP.dy;
      const z = -k * STEP.dz;
      add(STEP.w, 0.08, STEP.dz - 0.05, 0, y - 0.04, z, crateMat);
      for (const s of [-1, 1]) add(0.08, y, 0.08, s * (STEP.w / 2 - 0.1), y / 2, z, crateMat);
    });
    add(1.6, ARM_BASE.y, 1.6, ARM_BASE.x, ARM_BASE.y / 2, ARM_BASE.z, crateMat); // pedestal

    const crateGeo = new THREE.BoxGeometry(CRATE.x, CRATE.y, CRATE.z);
    const labels = Array.from(labelsRef.current!.children as HTMLCollectionOf<HTMLElement>);
    const crates: Crate[] = PROJECTS.map((project, i) => {
      const k = YEARS.indexOf(project.year);
      const row = PROJECTS.filter((p) => p.year === project.year);
      const col = row.indexOf(project) - (row.length - 1) / 2;
      const home = V(col * COL, STEP.y0 + k * STEP.dy + CRATE.y / 2, -k * STEP.dz);
      const mesh = new THREE.Mesh(crateGeo, mat);
      mesh.position.copy(home);
      scene.add(mesh);
      return { project, mesh, home, label: labels[i] };
    });

    // The crate under the pointer lights up too (ASCII only; the name tag keeps its look).
    let hovered: Crate | null = null;
    for (const c of crates) {
      c.label.addEventListener("pointerenter", () => (hovered = c));
      c.label.addEventListener("pointerleave", () => (hovered = null));
      c.label.addEventListener("focus", () => (hovered = c));
      c.label.addEventListener("blur", () => (hovered = null));
    }

    const rig = buildArm(mat);
    rig.root.position.copy(ARM_BASE);
    scene.add(rig.root);
    const mover = new Mover(REST);
    let grip = 0;
    let gripTarget = 0;

    // --- what the arm should be doing: `want` is the crate the visitor asked for (or none) ---
    let want: Crate | null = null;
    let held: Crate | null = null;
    let atRest = true;
    const up = (c: Crate) => V(c.home.x, HIGH, c.home.z);
    const onIt = (c: Crate) => V(c.home.x, c.home.y + GRIP, c.home.z);

    const plan = () => {
      if (held && held !== want) {
        const c = held;
        mover.queue.push(
          { run: () => setOpen(null), to: () => up(c), dur: 0.8 },
          { to: () => onIt(c), dur: 0.45 },
          { run: () => ((held = null), c.mesh.position.copy(c.home), (gripTarget = 0)), dur: 0.25 },
          { to: () => up(c), dur: 0.4 },
        );
      } else if (!held && want) {
        const c = want;
        atRest = false;
        mover.queue.push(
          { to: () => up(c), dur: 0.8 },
          { to: () => onIt(c), dur: 0.45 },
          { run: () => ((held = c), (gripTarget = 1)), dur: 0.25 },
          { to: () => up(c), dur: 0.45 },
          { to: () => PRESENT.clone(), dur: 0.8 },
          { run: () => want === c && setOpen(c.project), dur: 0 },
        );
      } else if (!held && !atRest) {
        atRest = true;
        mover.queue.push({ to: () => REST.clone(), dur: 0.8 });
      } else mover.queue.push({ dur: 0.1 });
    };

    selectRef.current = (i) => {
      want = i === null ? null : crates[i];
      if (reduceMotion) setOpen(want?.project ?? null);
    };

    // --- layout ---
    let w = 1;
    let h = 1;
    const tmp = new THREE.Vector3();
    const toScreen = (p: THREE.Vector3) => {
      tmp.copy(p).project(camera);
      return { x: ((tmp.x + 1) / 2) * w, y: ((1 - tmp.y) / 2) * h };
    };
    const ppuAt = (p: THREE.Vector3) => toScreen(p).y - toScreen(V(p.x, p.y + 1, p.z)).y;
    const resize = () => {
      w = stage.clientWidth;
      h = stage.clientHeight;
      camera.aspect = w / h;
      const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const R = Math.max(4.9 / (t * camera.aspect), 3.3 / t);
      camera.position.set(TARGET.x, TARGET.y + R * 0.3, TARGET.z + R);
      camera.lookAt(TARGET);
      camera.updateProjectionMatrix();
      ascii.setSize(w, h, w < 700 ? 8 : 11, Math.min(window.devicePixelRatio, 2));
      // Year labels sit at the left end of each step.
      Array.from(yearsRef.current!.children as HTMLCollectionOf<HTMLElement>).forEach((el, k) => {
        const s = toScreen(V(-STEP.w / 2 - 0.15, STEP.y0 + k * STEP.dy, -k * STEP.dz));
        el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-100%, -100%)`;
      });
    };
    const ascii = new AsciiRenderer(canvasRef.current!);
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    resize();

    let visible = false;
    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    io.observe(stage);

    let last = performance.now();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!visible) return;

      if (!reduceMotion) mover.update(dt, plan);
      grip += (gripTarget - grip) * (1 - Math.exp(-dt * 12));
      solveIK(rig, mover.tip, 0, grip);
      if (held) tipWorld(rig, held.mesh.position).y -= GRIP;

      for (const c of crates) {
        c.mesh.material = c === hovered || c === want || c === held ? pickedMat : mat;
        const front = c.mesh.position.clone().setZ(c.mesh.position.z + CRATE.z / 2);
        const s = toScreen(front);
        c.label.style.fontSize = `${ppuAt(front) * 0.16}px`;
        c.label.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`;
        c.label.toggleAttribute("data-held", c === held);
      }
      ascii.render(scene, camera);
    };
    tick();

    const onKey = (e: KeyboardEvent) => e.key === "Escape" && selectRef.current(null);
    window.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("keydown", onKey);
      scene.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
      [mat, crateMat, pickedMat].forEach((m) => m.dispose());
      ascii.dispose();
    };
  }, []);

  return (
    <section className="work" id="selected-work">
      <header>
        <p className="label">03 / work</p>
        <p>Everything I&apos;ve built, stacked by year. Pick a crate and the arm will bring it to you.</p>
      </header>
      <div ref={stageRef} className="work-stage">
        <canvas ref={canvasRef} aria-hidden />
        <div ref={yearsRef} className="work-years" aria-hidden>
          {YEARS.map((y) => (
            <span key={y}>{y}</span>
          ))}
        </div>
        <div ref={labelsRef} className="work-crates">
          {PROJECTS.map((p, i) => (
            <button key={p.tag} onClick={() => selectRef.current(open?.name === p.name ? null : i)} aria-label={`${p.name}, ${p.year}`}>
              {p.tag}
            </button>
          ))}
        </div>
        {open && (
          <article className="card" aria-live="polite">
            <header>
              <span>
                {open.year} · {open.name}
              </span>
              <button onClick={() => selectRef.current(null)} aria-label="Put it back">
                x
              </button>
            </header>
            <p>{open.blurb}</p>
            {open.stack && <p className="muted">{open.stack}</p>}
            {open.stat && <p>→ {open.stat}</p>}
            {open.links && (
              <nav>
                {open.links.map((l) => (
                  <a key={l.href} href={l.href} target="_blank" rel="noreferrer">
                    ↗ {l.label}
                  </a>
                ))}
              </nav>
            )}
          </article>
        )}
      </div>
    </section>
  );
}
