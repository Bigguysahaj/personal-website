import * as THREE from "three";

const RAMP = " .:-=+*#%@";

/** Renders a scene into a tiny buffer (one pixel per character cell) and draws it as text. */
export class AsciiRenderer {
  private gl = new THREE.WebGLRenderer({ antialias: false });
  private rt = new THREE.WebGLRenderTarget(1, 1);
  private buf = new Uint8Array(4);
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private cols = 0;
  private rows = 0;
  private cw = 0;
  private ch = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.gl.setClearColor(0x000000, 1);
  }

  setSize(w: number, h: number, cellH: number, dpr: number) {
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `${cellH}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textBaseline = "top";
    this.cw = ctx.measureText("M").width;
    this.ch = cellH;
    this.cols = Math.ceil(w / this.cw);
    this.rows = Math.ceil(h / this.ch);
    this.rt.setSize(this.cols, this.rows);
    this.buf = new Uint8Array(this.cols * this.rows * 4);
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    const { gl, rt, buf, ctx, cols, rows, cw, ch } = this;
    gl.setRenderTarget(rt);
    gl.render(scene, camera);
    gl.readRenderTargetPixels(rt, 0, 0, cols, rows, buf);
    gl.setRenderTarget(null);

    ctx.clearRect(0, 0, this.w, this.h);
    const style = getComputedStyle(this.canvas);
    const base = style.color; // theme-aware via CSS `color`
    const accent = style.getPropertyValue("--accent").trim() || base;
    ctx.fillStyle = base;
    let current = base;
    const n = RAMP.length - 1;
    for (let y = 0; y < rows; y++) {
      const row = (rows - 1 - y) * cols; // GL rows are bottom-up
      for (let x = 0; x < cols; x++) {
        const i = (row + x) * 4;
        const lum = Math.sqrt((buf[i] * 0.299 + buf[i + 1] * 0.587 + buf[i + 2] * 0.114) / 255);
        if (lum < 0.08) continue;
        // Saturated (coloured) surfaces draw in the accent colour; greys stay in the text colour.
        const next = buf[i] - buf[i + 2] > buf[i] * 0.4 ? accent : base;
        if (next !== current) ctx.fillStyle = current = next;
        ctx.fillText(RAMP[Math.min(n, 1 + Math.floor(lum * n))], x * cw, y * ch);
      }
    }
  }

  dispose() {
    this.rt.dispose();
    this.gl.dispose();
  }
}
