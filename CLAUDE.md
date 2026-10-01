@AGENTS.md

## Styling

Tailwind v4 is set up (no preflight; the reset in `app/globals.css` stays in charge). Use Tailwind utilities for all new UI. Do not mass-convert the existing hand-written CSS; only touch it when editing that component anyway. Leave pseudo-element, keyframe and canvas-tied rules (`.pull*`, `.hero-letters`, `.flicker`, `.grabbing`) as plain CSS. Check light and dark mode, and run `npx next build`, after styling changes.
