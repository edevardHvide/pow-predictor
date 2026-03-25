import {
  Rectangle,
  SingleTileImageryProvider,
  type Viewer,
  type ImageryLayer,
} from "cesium";
import type { SnowDepthGrid } from "../types/snow.ts";
import type { ElevationGrid } from "../types/terrain.ts";
import { snowDepthColor, historicalSnowColor } from "./color-scales.ts";

const CROSSFADE_MS = 300;

export interface ColorStats {
  mean: number;
  spread: number;
}

export function computeColorStats(
  depth: Float64Array,
  rows: number,
  cols: number,
  terrain: ElevationGrid,
): ColorStats {
  let sum = 0, count = 0;
  for (let i = 0; i < rows * cols; i++) {
    if (terrain.heights[i] >= 40 && depth[i] > 0.5) {
      sum += depth[i];
      count++;
    }
  }
  const mean = count > 0 ? sum / count : 0;
  let maxDev = 0;
  for (let i = 0; i < rows * cols; i++) {
    if (terrain.heights[i] >= 40 && depth[i] > 0.5) {
      maxDev = Math.max(maxDev, Math.abs(depth[i] - mean));
    }
  }
  return { mean, spread: Math.max(maxDev, 3) };
}

export class SnowOverlayManager {
  private viewer: Viewer;
  private currentLayer: ImageryLayer | null = null;
  private fadingLayer: ImageryLayer | null = null;
  private fadeRaf: number | null = null;
  private _targetAlpha = 0.55;
  private renderGen = 0;

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  /**
   * Render snow overlay with crossfade transition.
   * The new layer is added before the old one is removed — no gap.
   */
  async render(
    snow: SnowDepthGrid,
    terrain: ElevationGrid,
    mode: "manual" | "historical" = "manual",
  ): Promise<void> {
    const gen = ++this.renderGen;
    const canvas = this.paintCanvas(snow, terrain, mode);
    const { bbox } = terrain;
    const rect = Rectangle.fromDegrees(bbox.west, bbox.south, bbox.east, bbox.north);
    const provider = await SingleTileImageryProvider.fromUrl(
      canvas.toDataURL(),
      { rectangle: rect },
    );

    if (gen !== this.renderGen) return; // Stale render — discard

    const newLayer = this.viewer.imageryLayers.addImageryProvider(provider);

    // If there's an existing layer, crossfade from old to new
    if (this.currentLayer) {
      this.crossfade(this.currentLayer, newLayer);
    } else {
      newLayer.alpha = this._targetAlpha;
    }

    this.currentLayer = newLayer;
  }

  /**
   * Render from interpolated depth arrays (for smooth playback).
   */
  async renderInterpolated(
    depthA: Float64Array,
    depthB: Float64Array,
    t: number, // 0..1 blend factor
    rows: number,
    cols: number,
    terrain: ElevationGrid,
    colorStats?: ColorStats,
  ): Promise<void> {
    const gen = ++this.renderGen;
    const n = rows * cols;
    const blended = new Float64Array(n);
    const oneMinusT = 1 - t;
    for (let i = 0; i < n; i++) {
      blended[i] = depthA[i] * oneMinusT + depthB[i] * t;
    }

    // Build a minimal SnowDepthGrid for rendering
    const snow: SnowDepthGrid = {
      depth: blended,
      isPowderZone: new Uint8Array(n), // not used in historical mode
      rows,
      cols,
    };

    const canvas = this.paintCanvas(snow, terrain, "historical", colorStats);
    const { bbox } = terrain;
    const rect = Rectangle.fromDegrees(bbox.west, bbox.south, bbox.east, bbox.north);
    const provider = await SingleTileImageryProvider.fromUrl(
      canvas.toDataURL(),
      { rectangle: rect },
    );

    if (gen !== this.renderGen) return; // Stale render — discard

    const newLayer = this.viewer.imageryLayers.addImageryProvider(provider);
    newLayer.alpha = this._targetAlpha;

    // Capture old layers, update state immediately
    const oldLayer = this.currentLayer;
    const oldFading = this.fadingLayer;
    this.currentLayer = newLayer;
    this.fadingLayer = null;

    // Defer removal by 1 frame so Cesium composites the new tile first
    requestAnimationFrame(() => {
      if (oldLayer && this.viewer.imageryLayers.contains(oldLayer)) {
        this.viewer.imageryLayers.remove(oldLayer);
      }
      if (oldFading && this.viewer.imageryLayers.contains(oldFading)) {
        this.viewer.imageryLayers.remove(oldFading);
      }
    });
  }

  remove(): void {
    this.cancelFade();
    if (this.fadingLayer) {
      this.viewer.imageryLayers.remove(this.fadingLayer);
      this.fadingLayer = null;
    }
    if (this.currentLayer) {
      this.viewer.imageryLayers.remove(this.currentLayer);
      this.currentLayer = null;
    }
  }

  destroy(): void {
    this.remove();
  }

  private paintCanvas(
    snow: SnowDepthGrid,
    terrain: ElevationGrid,
    mode: "manual" | "historical",
    colorStats?: ColorStats,
  ): HTMLCanvasElement {
    // 1. Paint at grid resolution (1 pixel per cell)
    const raw = document.createElement("canvas");
    raw.width = snow.cols;
    raw.height = snow.rows;
    const rawCtx = raw.getContext("2d")!;
    const imageData = rawCtx.createImageData(snow.cols, snow.rows);

    // For historical mode, compute mean and spread for relative coloring
    let meanDepth = 0;
    let spreadDepth = 15;
    if (mode === "historical") {
      if (colorStats) {
        meanDepth = colorStats.mean;
        spreadDepth = colorStats.spread;
      } else {
        let sum = 0, count = 0;
        for (let i = 0; i < snow.rows * snow.cols; i++) {
          if (terrain.heights[i] >= 40 && snow.depth[i] > 0.5) {
            sum += snow.depth[i];
            count++;
          }
        }
        meanDepth = count > 0 ? sum / count : 0;
        // Spread = max absolute deviation from mean (clamped to reasonable range)
        let maxDev = 0;
        for (let i = 0; i < snow.rows * snow.cols; i++) {
          if (terrain.heights[i] >= 40 && snow.depth[i] > 0.5) {
            maxDev = Math.max(maxDev, Math.abs(snow.depth[i] - meanDepth));
          }
        }
        spreadDepth = Math.max(maxDev, 3); // at least 3cm spread to avoid div issues
      }
    }

    for (let r = 0; r < snow.rows; r++) {
      const canvasRow = snow.rows - 1 - r;
      for (let c = 0; c < snow.cols; c++) {
        const gi = r * snow.cols + c;
        const pi = (canvasRow * snow.cols + c) * 4;

        if (terrain.heights[gi] < 40) {
          imageData.data[pi + 3] = 0;
          continue;
        }

        const [red, green, blue, alpha] =
          mode === "historical"
            ? historicalSnowColor(snow.depth[gi], meanDepth, spreadDepth)
            : snowDepthColor(snow.depth[gi], snow.isPowderZone[gi] === 1);
        imageData.data[pi] = red;
        imageData.data[pi + 1] = green;
        imageData.data[pi + 2] = blue;
        imageData.data[pi + 3] = alpha;
      }
    }

    rawCtx.putImageData(imageData, 0, 0);

    // 2. Upscale with bilinear interpolation for smooth gradients
    const scale = 4;
    const canvas = document.createElement("canvas");
    canvas.width = snow.cols * scale;
    canvas.height = snow.rows * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(raw, 0, 0, canvas.width, canvas.height);

    return canvas;
  }

  private crossfade(oldLayer: ImageryLayer, newLayer: ImageryLayer): void {
    this.cancelFade();

    // Clean up any previous fading layer that's still around
    if (this.fadingLayer) {
      this.viewer.imageryLayers.remove(this.fadingLayer);
    }
    this.fadingLayer = oldLayer;

    const start = performance.now();
    const startAlpha = oldLayer.alpha;
    newLayer.alpha = 0;

    const step = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(elapsed / CROSSFADE_MS, 1);
      // Ease-out cubic
      const ease = 1 - (1 - t) * (1 - t) * (1 - t);

      newLayer.alpha = this._targetAlpha * ease;
      if (this.fadingLayer) {
        this.fadingLayer.alpha = startAlpha * (1 - ease);
      }

      if (t < 1) {
        this.fadeRaf = requestAnimationFrame(step);
      } else {
        // Done — remove old layer
        if (this.fadingLayer) {
          this.viewer.imageryLayers.remove(this.fadingLayer);
          this.fadingLayer = null;
        }
        this.fadeRaf = null;
      }
    };

    this.fadeRaf = requestAnimationFrame(step);
  }

  private cancelFade(): void {
    if (this.fadeRaf !== null) {
      cancelAnimationFrame(this.fadeRaf);
      this.fadeRaf = null;
    }
  }
}

// Legacy API for backwards compat (manual mode still uses this pattern)
let legacyManager: SnowOverlayManager | null = null;

export async function renderSnowOverlay(
  viewer: Viewer,
  snow: SnowDepthGrid,
  terrain: ElevationGrid,
  mode: "manual" | "historical" = "manual",
): Promise<void> {
  if (!legacyManager || (legacyManager as unknown as { viewer: Viewer }).viewer !== viewer) {
    legacyManager?.destroy();
    legacyManager = new SnowOverlayManager(viewer);
  }
  return legacyManager.render(snow, terrain, mode);
}

export function removeSnowOverlay(_viewer: Viewer): void {
  if (legacyManager) {
    legacyManager.remove();
    legacyManager = null;
  }
}
