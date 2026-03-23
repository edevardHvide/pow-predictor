import {
  Rectangle,
  SingleTileImageryProvider,
  type Viewer,
  type ImageryLayer,
} from "cesium";
import type { SnowDepthGrid } from "../types/snow.ts";
import type { ElevationGrid } from "../types/terrain.ts";
import { snowDepthColor } from "./color-scales.ts";

let currentLayer: ImageryLayer | null = null;

export async function renderSnowOverlay(
  viewer: Viewer,
  snow: SnowDepthGrid,
  terrain: ElevationGrid,
): Promise<void> {
  removeSnowOverlay(viewer);

  const canvas = document.createElement("canvas");
  canvas.width = snow.cols;
  canvas.height = snow.rows;
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(snow.cols, snow.rows);

  for (let r = 0; r < snow.rows; r++) {
    const canvasRow = snow.rows - 1 - r;
    for (let c = 0; c < snow.cols; c++) {
      const gi = r * snow.cols + c;
      const pi = (canvasRow * snow.cols + c) * 4;

      // Transparent over water/very low terrain
      if (terrain.heights[gi] < 40) {
        imageData.data[pi + 3] = 0;
        continue;
      }

      const [red, green, blue, alpha] = snowDepthColor(snow.depth[gi], snow.isPowderZone[gi] === 1);
      imageData.data[pi] = red;
      imageData.data[pi + 1] = green;
      imageData.data[pi + 2] = blue;
      imageData.data[pi + 3] = alpha;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const { bbox } = terrain;
  const rect = Rectangle.fromDegrees(bbox.west, bbox.south, bbox.east, bbox.north);
  const provider = await SingleTileImageryProvider.fromUrl(canvas.toDataURL(), { rectangle: rect });

  currentLayer = viewer.imageryLayers.addImageryProvider(provider);
  currentLayer.alpha = 0.55;
  console.log("Snow overlay added, imagery layers:", viewer.imageryLayers.length);
}

export function removeSnowOverlay(viewer: Viewer): void {
  if (currentLayer) {
    viewer.imageryLayers.remove(currentLayer);
    currentLayer = null;
  }
}
