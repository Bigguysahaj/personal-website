/**
 * A pull-cord: a 2D Verlet rope hanging from a fixed anchor (world units, y up).
 *
 * Each frame: move every point by its own velocity (current - previous position) plus gravity,
 * then pull neighbouring points back to `seg` apart a few times. That's the whole simulation.
 * The cord can also slide out of its anchor (`extra`) when pulled, and winds back in on release,
 * which is what flips the switch and makes the knob snap back up.
 */

type P = { x: number; y: number; px: number; py: number };

export class Rope {
  pts: P[] = [];
  extra = 0; // how far the cord is pulled out past its rest length
  ax = 0; // anchor
  ay = 0;
  private rest = 1;

  constructor(private n = 10, private maxOut = 1.2) {}

  /** Hang the rope straight down from (ax, ay), `length` long. */
  reset(ax: number, ay: number, length: number) {
    this.ax = ax;
    this.ay = ay;
    this.rest = length;
    this.pts = Array.from({ length: this.n }, (_, i) => {
      const y = ay - (length * i) / (this.n - 1);
      return { x: ax, y, px: ax, py: y };
    });
  }

  get end() {
    return this.pts[this.n - 1];
  }

  /** pin: where something (cursor, gripper) holds the end, or null when free. wind: sideways accel. */
  step(dt: number, pin: { x: number; y: number } | null, wind = 0) {
    const g = -30;
    for (const p of this.pts.slice(1)) {
      const vx = (p.x - p.px) * 0.985;
      const vy = (p.y - p.py) * 0.985;
      p.px = p.x;
      p.py = p.y;
      p.x += vx + wind * dt * dt;
      p.y += vy + g * dt * dt;
    }

    // Pulled: let cord out to reach the pin (up to maxOut, then it's taut). Free: wind it back in quickly.
    if (pin) {
      const d = Math.hypot(pin.x - this.ax, pin.y - this.ay);
      const max = this.rest + this.maxOut;
      if (d > max) pin = { x: this.ax + ((pin.x - this.ax) * max) / d, y: this.ay + ((pin.y - this.ay) * max) / d };
      this.extra = Math.max(0, Math.min(d, max) - this.rest);
    }
    else this.extra *= Math.exp(-dt * 14);
    const seg = (this.rest + this.extra) / (this.n - 1);

    for (let k = 0; k < 12; k++) {
      this.pts[0].x = this.ax;
      this.pts[0].y = this.ay;
      if (pin) {
        this.end.x = pin.x;
        this.end.y = pin.y;
      }
      for (let i = 1; i < this.n; i++) {
        const a = this.pts[i - 1];
        const b = this.pts[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        const f = (d - seg) / d / (i === 1 ? 1 : 2); // the anchor never moves, so its neighbour takes the full correction
        if (i > 1) {
          a.x += dx * f;
          a.y += dy * f;
        }
        b.x -= dx * f;
        b.y -= dy * f;
      }
    }
  }
}
