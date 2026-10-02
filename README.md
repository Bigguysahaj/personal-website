# Sahaj Singh — personal website

A portfolio where the page is a small robotics cell. Two 6-axis arms sort the letters of my name, pass strays to each other mid-air, and one of them pulls a cord to switch the lights. Everything is rendered as ASCII from a real Three.js scene, driven by hand-written forward and inverse kinematics. There are no physics or robotics libraries.

Built with Next.js, React, TypeScript, Three.js and Tailwind CSS v4.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build, also type-checks
npm start        # serve the production build
```

## What's on the page

| Section | Component | What it does |
| --- | --- | --- |
| Nav | `components/Nav.tsx` | Sticky top bar: name and role on the left, Work / About / Contact on the right. |
| 01 Hero | `components/Hero.tsx` | Two arms catch the falling letters of my name and place them. A stray letter lands in the other arm's lane and gets handed across. The right arm pulls the cord to toggle light and dark. Drag an arm by its gripper. A hatch reveals the live controller code. |
| 02 Palletizing | `components/Palletizer.tsx` | A 6-axis arm picks cases off a conveyor and stacks them on a pallet. Drag to orbit, switch pattern (column / interlock) and speed. |
| 03 Work | `components/Projects.tsx` | Projects as crates on a staircase, one step per year. Pick a crate and the arm brings it to you. |
| 04 About, 05 Contact | `components/About.tsx`, `components/Contact.tsx` | Plain text sections. |

## How it works

- **ASCII rendering** (`lib/ascii.ts`): the Three.js scene is rendered into a tiny buffer, one pixel per character cell, and each pixel's brightness is mapped to a character from a ramp (` .:-=+*#%@`). Strongly coloured surfaces are drawn in the accent colour (that's how a hovered or selected crate turns orange), and greys use the theme colour.
- **Kinematics** (`lib/kinematics.ts`): pure math, no three.js. Closed-form IK for a 6-axis arm with a spherical wrist: remove the tool offset, solve a two-link triangle to the wrist centre, and clamp out-of-reach targets so the arm stretches towards them. Forward kinematics is its inverse and is used to place held objects at the tool tip.
- **Motion** (`lib/arm.ts`): `Mover` plays a queue of steps (move the tip, roll, pitch, run an action, wait). Steps can also hold until a condition is true (`until`), which is how the two arms synchronise during a handoff.
- **Handoff**: arms are 7.7 units from the centre with about 7.8 of reach, so a vertical tool can't meet in the middle. For the pass both tools turn horizontal and point at each other. If the receiver never shows up, the giver drops the letter straight into its slot after a timeout.
- **Cord** (`lib/rope.ts`): a small Verlet rope hanging from above the top edge of the view. The gripper, the visitor's pointer or nothing pins its end. Pulling it far enough flips the theme.
- **Theme** (`lib/theme.ts`): light/dark is a `data-theme` attribute set before first paint, so there's no flash. Switching to light plays a fluorescent flicker.
- **Under the hood panel**: the hatch on the hero shows `public/letter-controller.cpp`, a C++20 reference controller for the same sorting logic, or the browser simulation source, with the current phase highlighted live.
- **Reduced motion**: with `prefers-reduced-motion`, the arms don't run and the pages show a static state.

## Project layout

```
app/            layout, page, global CSS
components/     Nav, Hero, Palletizer, Projects, About, Contact
content/        projects.ts (the crates)
lib/            kinematics, arm rig + Mover, ASCII renderer, rope, theme
public/         letter-controller.cpp (shown in the hero's hatch)
FUTURE.md       ideas not built yet
```

## Adding a project

Edit `content/projects.ts`. Each entry becomes a crate:

```ts
{
  tag: "NIRIKSH",          // short label printed on the crate (11 characters or fewer)
  name: "Niriksh",
  year: 2026,              // which step of the staircase it sits on
  blurb: "…",
  stack: "…",              // optional
  stat: "…",               // optional highlight line
  links: [{ label: "site", href: "https://…" }],
}
```

Keep to **at most 4 projects per year**; the steps are only wide enough for four crates. Order within a year is left to right.

## Styling

Tailwind v4 is set up **without** its preflight reset. The hand-written reset in `app/globals.css` stays in charge, and it sits in the `base` layer so utilities can override it.

- Use Tailwind utilities for new UI.
- Theme colours are CSS variables (`--bg`, `--fg`, `--muted`, `--ascii`, `--ascii-strong`, `--accent`) that switch on `data-theme="dark"`. They're mapped into Tailwind, so `text-muted`, `bg-bg` and `text-accent` work.
- The animated hero rules (pull cord, notch, letters, flicker) stay as plain CSS in `globals.css`.
- The sticky nav's height is `--nav-h`; the hero is sized to fit under it.
- After styling changes, run `npm run build` and check both light and dark mode.

## Notes

- `AGENTS.md` and `CLAUDE.md` hold instructions for coding agents (this project uses a Next.js version with breaking changes, so read `node_modules/next/dist/docs/` before changing framework code).
- Ideas for later (playing chess against the robot, swapping in industrial robot models, an IK playground) are in [`FUTURE.md`](./FUTURE.md).
- Only public specs and my own code appear here. Nothing from my employer's codebase is on the site.
