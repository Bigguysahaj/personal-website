# Future ideas

## Chess against the robot (`/lab` or section 04)

The profile lists Top 8 in IIT Madras's chess tournament (SHAH-MAAT 2022). This makes it something visitors can play.

- An 8×8 board in the same ASCII style. One arm (reuse `lib/arm.ts` + `lib/kinematics.ts`) physically picks and places pieces.
- The visitor moves by click or drag. The robot answers with a small in-browser engine: minimax plus alpha-beta to depth 3–4 is plenty, or a Stockfish WASM build for real strength.
- The robot has some personality: it "thinks" by hovering over candidate squares, sets captured pieces neatly beside the board, and taps the king on mate.
- Keep the rules logic separate (e.g. `chess.js`) so the robot is only the presentation layer.

## Robot picker: swap in the industrial robots I've coded for

Hovering an arm (or a small picker next to it) lets the visitor swap it for a different real industrial robot I've worked with, e.g. a UR, ABB, FANUC or KUKA model from my list.

- Each robot is a data entry: name, maker, link lengths and offsets (DH-style), joint limits, payload/reach, and an ASCII-friendly mesh made from boxes and cylinders like `buildArm`.
- `lib/kinematics.ts` reads its constants from that entry, so FK/IK work for whichever robot is picked. Robots with non-spherical wrists need a general solver (e.g. damped-least-squares Jacobian IK) or their own closed form.
- The swap animation: the current arm folds to home, an ASCII "scan line" wipes it out, the new one builds in segment by segment, then carries on with its task (letters, pallet, crates).
- A small spec card: model, DOF, reach, payload, and one line on what I did with it.
- Only use public specs and my own code. Nothing from Jacobi's proprietary codebase goes on the public site (NDA).

## A thread that follows you down the page

A single line (cable, wire, or robot hose, to fit the theme) that runs through the whole page and draws itself as you scroll, tying the sections together into one follow-through. A lot of sites do this now.

- One SVG path running the full page height, behind the content. `stroke-dasharray` / `stroke-dashoffset` driven by scroll progress so it "draws" as you go (CSS scroll-driven animations `animation-timeline: scroll()` where supported, a small scroll listener otherwise).
- It could start from the light-switch cord in the hero and end at the contact links, looping around each section's scene on the way (around the pallet, through the crate stairs).
- Recompute the path on resize from each section's bounding box; on phones, keep it to a simple line down the left gutter so it never crosses text.
- Respect `prefers-reduced-motion`: show it fully drawn, no scroll animation.

## Other ideas

- `/lab`: an IK playground. Drag the target, read `q[0..5]` live, toggle elbow-up/down. It's a showcase for `lib/kinematics.ts`.
- `/notes`: field notes (sim → real, operator UIs, rendering robot cells in the browser).
- Palletizer: a layer-map minimap and mixed-SKU boxes.
