import {
  Cartographic,
  type CesiumTerrainProvider,
  sampleTerrainMostDetailed,
} from "cesium";
import type { BoundingBox, ElevationGrid } from "../types/terrain.ts";
import { gridDimensions, gridToLatLng } from "../utils/geo.ts";

const DEFAULT_CELL_SIZE = 75; // meters

export async function sampleTerrain(
  terrainProvider: CesiumTerrainProvider,
  bbox: BoundingBox,
  cellSizeMeters = DEFAULT_CELL_SIZE,
): Promise<ElevationGrid> {
  const { rows, cols } = gridDimensions(bbox, cellSizeMeters);

  // Build sample positions
  const positions: Cartographic[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const { lat, lng } = gridToLatLng(r, c, bbox, rows, cols);
      positions.push(Cartographic.fromDegrees(lng, lat));
    }
  }

  // Query terrain heights in batches to avoid stack overflow with large grids
  const BATCH_SIZE = 10000;
  const heights = new Float64Array(rows * cols);
  for (let start = 0; start < positions.length; start += BATCH_SIZE) {
    const batch = positions.slice(start, start + BATCH_SIZE);
    const sampled = await sampleTerrainMostDetailed(terrainProvider, batch);
    for (let i = 0; i < sampled.length; i++) {
      heights[start + i] = sampled[i].height;
    }
  }

  // Skip derivatives + Sx precomputation on main thread.
  // The Web Worker recomputes these when it receives init-terrain.
  // Main thread only needs heights for rendering (wind particles, snow overlay).
  // Provide empty arrays so the type is satisfied for rendering code.
  const n = rows * cols;
  const empty = new Float64Array(n);

  console.log(
    `Terrain sampled: ${rows}x${cols} grid, cell=${cellSizeMeters}m, ` +
    `height range: ${typedArrayMin(heights).toFixed(0)}-${typedArrayMax(heights).toFixed(0)}m`,
  );

  return {
    heights, rows, cols, bbox, cellSizeMeters,
    slopes: empty,
    aspects: empty,
    normalsX: empty,
    normalsY: empty,
    normalsZ: empty,
    // No sxSectors — worker computes them
  };
}

function typedArrayMin(arr: Float64Array): number {
  let min = Infinity;
  for (let i = 0; i < arr.length; i++) if (arr[i] < min) min = arr[i];
  return min;
}

function typedArrayMax(arr: Float64Array): number {
  let max = -Infinity;
  for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
  return max;
}
