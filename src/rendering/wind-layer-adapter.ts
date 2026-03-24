import {
  Cartesian3,
  Cartesian2,
  SceneTransforms,
  type Viewer,
} from "cesium";
import type { WindField } from "../types/wind.ts";
import type { ElevationGrid } from "../types/terrain.ts";
import { clamp } from "../utils/math.ts";

const DEFAULT_PARTICLE_COUNT = 6000;
const TRAIL_FADE = 0.95;
const SPEED_SCALE = 0.005;
const MAX_AGE = 180;
const LINE_WIDTH = 2.0;

interface WindParticle {
  row: number;
  col: number;
  age: number;
  maxAge: number;
}

export class WindCanvasLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particles: WindParticle[];
  private wind: WindField;
  private terrain: ElevationGrid;
  private viewer: Viewer;
  private particleCount: number;
  private rafId: number | null = null;
  private _show = true;
  private _destroyed = false;

  constructor(viewer: Viewer, wind: WindField, terrain: ElevationGrid, particleCount = DEFAULT_PARTICLE_COUNT) {
    this.viewer = viewer;
    this.wind = wind;
    this.terrain = terrain;
    this.particleCount = particleCount;

    // Create canvas overlay
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText =
      "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;";
    const container = viewer.container as HTMLElement;
    container.style.position = "relative";
    container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext("2d")!;
    this.particles = [];

    this.resize();
    this.initParticles();
    this.animate();

    // Handle resize
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);
    (this as unknown as Record<string, unknown>)._ro = ro;

    console.log(`WindCanvasLayer: ${this.particleCount} particles, ${this.wind.rows}x${this.wind.cols} grid`);
  }

  get show() { return this._show; }
  set show(v: boolean) {
    this._show = v;
    this.canvas.style.display = v ? "block" : "none";
    if (v && !this.rafId) this.animate();
  }

  isDestroyed() { return this._destroyed; }

  destroy() {
    this._destroyed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.canvas.remove();
    const ro = (this as unknown as Record<string, unknown>)._ro as ResizeObserver;
    ro?.disconnect();
  }

  updateWindData(wind: WindField, terrain: ElevationGrid) {
    this.wind = wind;
    this.terrain = terrain;
    this.initParticles();
  }

  private resize() {
    const rect = this.viewer.container.getBoundingClientRect();
    this.canvas.width = rect.width * devicePixelRatio;
    this.canvas.height = rect.height * devicePixelRatio;
    this.ctx.scale(devicePixelRatio, devicePixelRatio);
  }

  private initParticles() {
    this.particles = [];
    for (let i = 0; i < this.particleCount; i++) {
      this.particles.push(this.spawnParticle());
    }
  }

  private spawnParticle(): WindParticle {
    return {
      row: Math.random() * (this.wind.rows - 1),
      col: Math.random() * (this.wind.cols - 1),
      age: Math.floor(Math.random() * MAX_AGE),
      maxAge: MAX_AGE + Math.floor(Math.random() * 40),
    };
  }

  private sampleWind(row: number, col: number): [number, number] {
    const { rows, cols } = this.wind;
    // Bilinear interpolation for smooth flow
    const r0 = clamp(Math.floor(row), 0, rows - 2);
    const c0 = clamp(Math.floor(col), 0, cols - 2);
    const r1 = r0 + 1;
    const c1 = c0 + 1;
    const fr = row - r0;
    const fc = col - c0;

    const i00 = r0 * cols + c0;
    const i01 = r0 * cols + c1;
    const i10 = r1 * cols + c0;
    const i11 = r1 * cols + c1;

    const u = this.wind.u;
    const v = this.wind.v;

    const uVal = u[i00] * (1 - fr) * (1 - fc) + u[i01] * (1 - fr) * fc +
                 u[i10] * fr * (1 - fc) + u[i11] * fr * fc;
    const vVal = v[i00] * (1 - fr) * (1 - fc) + v[i01] * (1 - fr) * fc +
                 v[i10] * fr * (1 - fc) + v[i11] * fr * fc;

    return [uVal, vVal];
  }

  private gridToScreen(row: number, col: number): [number, number] | null {
    const { bbox, rows, cols, heights } = this.terrain;
    const lat = bbox.south + ((row + 0.5) / rows) * (bbox.north - bbox.south);
    const lng = bbox.west + ((col + 0.5) / cols) * (bbox.east - bbox.west);

    // Bilinear height interpolation for smooth terrain following
    const r0 = clamp(Math.floor(row), 0, rows - 2);
    const c0 = clamp(Math.floor(col), 0, cols - 2);
    const fr = row - r0;
    const fc = col - c0;
    const h00 = heights[r0 * cols + c0];
    const h01 = heights[r0 * cols + c0 + 1];
    const h10 = heights[(r0 + 1) * cols + c0];
    const h11 = heights[(r0 + 1) * cols + c0 + 1];
    const h = h00 * (1 - fr) * (1 - fc) + h01 * (1 - fr) * fc +
              h10 * fr * (1 - fc) + h11 * fr * fc + 15;

    const cartesian = Cartesian3.fromDegrees(lng, lat, h);
    const screenPos = SceneTransforms.worldToWindowCoordinates(
      this.viewer.scene,
      cartesian,
      new Cartesian2(),
    );

    if (!screenPos) return null;
    return [screenPos.x, screenPos.y];
  }

  private animate = () => {
    if (this._destroyed || !this._show) {
      this.rafId = null;
      return;
    }

    const ctx = this.ctx;
    const w = this.canvas.width / devicePixelRatio;
    const h = this.canvas.height / devicePixelRatio;

    // Fade previous frame (creates trails)
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = `rgba(0, 0, 0, ${TRAIL_FADE})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";

    const { rows, cols } = this.wind;

    for (const p of this.particles) {
      p.age++;
      if (p.age > p.maxAge || p.row < 0 || p.row >= rows - 1 || p.col < 0 || p.col >= cols - 1) {
        Object.assign(p, this.spawnParticle());
        continue;
      }

      const [u, v] = this.sampleWind(p.row, p.col);
      const speed = Math.sqrt(u * u + v * v);

      // Get screen position before moving
      const from = this.gridToScreen(p.row, p.col);

      // Advect
      p.col += u * SPEED_SCALE;
      p.row += v * SPEED_SCALE;

      // Get screen position after moving
      const to = this.gridToScreen(p.row, p.col);

      if (!from || !to) continue;
      if (from[0] < -50 || from[0] > w + 50 || from[1] < -50 || from[1] > h + 50) continue;

      // Bright visible colors: cyan at low speed → yellow → red at high
      const t = clamp(speed / 15, 0, 1);
      const r = Math.round(80 + t * 175);
      const g = Math.round(220 + t * 35 - t * t * 180);
      const b = Math.round(255 - t * 200);
      const alpha = 0.6 + t * 0.35;

      ctx.beginPath();
      ctx.moveTo(from[0], from[1]);
      ctx.lineTo(to[0], to[1]);
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.lineWidth = LINE_WIDTH + speed * 0.15;
      ctx.stroke();
    }

    this.rafId = requestAnimationFrame(this.animate);
  };
}
