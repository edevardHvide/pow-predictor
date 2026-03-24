import {
  Cartesian3,
  Cartesian2,
  SceneTransforms,
  type Viewer,
} from "cesium";
import type { WindField } from "../types/wind.ts";
import type { ElevationGrid } from "../types/terrain.ts";
import { clamp } from "../utils/math.ts";

const DEFAULT_PARTICLE_COUNT = 10000;
const TRAIL_FADE = 0.92;
const SPEED_SCALE = 0.005;
const MAX_AGE = 120;
const LINE_WIDTH = 1.4;
const TURBULENCE = 0.15;

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

  // Cached screen projections — refreshed only when camera moves
  private screenCache: Float32Array | null = null; // [x0,y0, x1,y1, ...] for each grid cell
  private cacheKey = "";

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
    const ro = new ResizeObserver(() => { this.resize(); this.invalidateCache(); });
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
    this.invalidateCache();
    this.initParticles();
  }

  private invalidateCache() {
    this.screenCache = null;
    this.cacheKey = "";
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

  // Camera key for cache invalidation — changes when camera moves significantly
  private getCameraKey(): string {
    const cam = this.viewer.camera;
    // Round to reduce unnecessary invalidation (small sub-pixel movements)
    const px = Math.round(cam.positionWC.x / 10);
    const py = Math.round(cam.positionWC.y / 10);
    const pz = Math.round(cam.positionWC.z / 10);
    const h = Math.round(cam.heading * 100);
    const p = Math.round(cam.pitch * 100);
    return `${px},${py},${pz},${h},${p}`;
  }

  // Build screen position cache for all grid vertices
  private buildScreenCache() {
    const { bbox, rows, cols, heights } = this.terrain;
    const n = rows * cols;
    const cache = new Float32Array(n * 2);
    const scene = this.viewer.scene;
    const scratch = new Cartesian2();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const gi = r * cols + c;
        const lat = bbox.south + ((r + 0.5) / rows) * (bbox.north - bbox.south);
        const lng = bbox.west + ((c + 0.5) / cols) * (bbox.east - bbox.west);
        const h = heights[gi] + 15;

        const cartesian = Cartesian3.fromDegrees(lng, lat, h);
        const screenPos = SceneTransforms.worldToWindowCoordinates(scene, cartesian, scratch);

        const idx = gi * 2;
        if (screenPos) {
          cache[idx] = screenPos.x;
          cache[idx + 1] = screenPos.y;
        } else {
          cache[idx] = -9999;
          cache[idx + 1] = -9999;
        }
      }
    }

    this.screenCache = cache;
    this.cacheKey = this.getCameraKey();
  }

  // Get screen position from cache with bilinear interpolation
  private gridToScreen(row: number, col: number): [number, number] | null {
    if (!this.screenCache) return null;

    const { rows, cols } = this.terrain;
    const r0 = clamp(Math.floor(row), 0, rows - 2);
    const c0 = clamp(Math.floor(col), 0, cols - 2);
    const r1 = r0 + 1;
    const c1 = c0 + 1;
    const fr = row - r0;
    const fc = col - c0;

    const cache = this.screenCache;
    const i00 = (r0 * cols + c0) * 2;
    const i01 = (r0 * cols + c1) * 2;
    const i10 = (r1 * cols + c0) * 2;
    const i11 = (r1 * cols + c1) * 2;

    // If any corner is offscreen, skip
    if (cache[i00] < -9000 || cache[i01] < -9000 || cache[i10] < -9000 || cache[i11] < -9000) {
      return null;
    }

    const x = cache[i00] * (1 - fr) * (1 - fc) + cache[i01] * (1 - fr) * fc +
              cache[i10] * fr * (1 - fc) + cache[i11] * fr * fc;
    const y = cache[i00 + 1] * (1 - fr) * (1 - fc) + cache[i01 + 1] * (1 - fr) * fc +
              cache[i10 + 1] * fr * (1 - fc) + cache[i11 + 1] * fr * fc;

    return [x, y];
  }

  private animate = () => {
    if (this._destroyed || !this._show) {
      this.rafId = null;
      return;
    }

    // Refresh cache if camera moved
    const camKey = this.getCameraKey();
    if (camKey !== this.cacheKey) {
      this.buildScreenCache();
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

      // Advect with slight turbulence (snow doesn't travel in perfect lines)
      p.col += u * SPEED_SCALE + (Math.random() - 0.5) * TURBULENCE * SPEED_SCALE;
      p.row += v * SPEED_SCALE + (Math.random() - 0.5) * TURBULENCE * SPEED_SCALE;

      // Get screen position after moving
      const to = this.gridToScreen(p.row, p.col);

      if (!from || !to) continue;
      if (from[0] < -50 || from[0] > w + 50 || from[1] < -50 || from[1] > h + 50) continue;

      // Snow-like colors: white with slight blue tint, brighter at higher speed
      const t = clamp(speed / 15, 0, 1);
      const r = Math.round(220 + t * 35);
      const g = Math.round(225 + t * 30);
      const b = 255;
      const alpha = 0.3 + t * 0.5;

      ctx.beginPath();
      ctx.moveTo(from[0], from[1]);
      ctx.lineTo(to[0], to[1]);
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.lineWidth = LINE_WIDTH + speed * 0.1;
      ctx.stroke();
    }

    this.rafId = requestAnimationFrame(this.animate);
  };
}
