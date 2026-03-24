import type { ElevationGrid } from "../types/terrain.ts";
import type { WindField, WindParams } from "../types/wind.ts";
import { windDirToComponents, clamp } from "../utils/math.ts";

const LAYER_HEIGHTS = [10, 50]; // meters AGL — ground level only
const MAX_ITERATIONS = 100;
const DIVERGENCE_THRESHOLD = 0.005;
const RELAXATION_ALPHA = 0.1;
const SURFACE_ROUGHNESS = 0.03;
const REF_HEIGHT = 50;

// Interpolate Sx between two nearest precomputed sectors, or compute from scratch
function interpolateSx(
  terrain: ElevationGrid,
  baseU: number,
  baseV: number,
): Float64Array {
  const { rows, cols, heights, cellSizeMeters } = terrain;
  const n = rows * cols;
  const windMag = Math.sqrt(baseU * baseU + baseV * baseV);
  const sxGrid = new Float64Array(n);

  if (windMag < 0.01) return sxGrid;

  if (terrain.sxSectors && terrain.sxSectors.length === 8) {
    const windDirRad = Math.atan2(baseU, baseV);
    const sectorWidth = Math.PI / 4;
    const normDir = ((windDirRad % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const sectorIdx = normDir / sectorWidth;
    const s0 = Math.floor(sectorIdx) % 8;
    const s1 = (s0 + 1) % 8;
    const t = sectorIdx - Math.floor(sectorIdx);
    const sx0 = terrain.sxSectors[s0];
    const sx1 = terrain.sxSectors[s1];
    for (let i = 0; i < n; i++) {
      sxGrid[i] = sx0[i] * (1 - t) + sx1[i] * t;
    }
  } else {
    const wdx = baseU / windMag;
    const wdy = baseV / windMag;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        sxGrid[r * cols + c] = computeSx(heights, r, c, rows, cols, wdx, wdy, cellSizeMeters);
      }
    }
  }

  return sxGrid;
}

export function solveWindField(
  terrain: ElevationGrid,
  params: WindParams,
): WindField {
  const { rows, cols } = terrain;
  const layers = LAYER_HEIGHTS.length;
  const totalCells = rows * cols * layers;

  const u = new Float64Array(totalCells);
  const v = new Float64Array(totalCells);
  const w = new Float64Array(totalCells);

  const { u: baseU, v: baseV } = windDirToComponents(params.direction, params.speed);

  // Initialize with log-profile wind
  for (let layer = 0; layer < layers; layer++) {
    const z = LAYER_HEIGHTS[layer];
    const logFactor = Math.log(z / SURFACE_ROUGHNESS) / Math.log(REF_HEIGHT / SURFACE_ROUGHNESS);
    const layerU = baseU * logFactor;
    const layerV = baseV * logFactor;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = layer * rows * cols + r * cols + c;
        u[idx] = layerU;
        v[idx] = layerV;
        w[idx] = 0;
      }
    }
  }

  // Compute Sx once — used for both terrain effects and snow model exposure
  const exposure = interpolateSx(terrain, baseU, baseV);

  // Apply terrain effects using precomputed Sx
  applyTerrainEffects(u, v, w, terrain, baseU, baseV, layers, exposure);

  // Iterative mass-conservation
  let finalDiv = 0;
  let finalIter = 0;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const maxDiv = enforceMassConservation(u, v, w, rows, cols, layers, terrain.cellSizeMeters);
    finalDiv = maxDiv;
    finalIter = iter;
    if (maxDiv < DIVERGENCE_THRESHOLD) break;
  }

  // Debug
  let maxU = 0, maxV = 0;
  for (let i = 0; i < rows * cols; i++) {
    maxU = Math.max(maxU, Math.abs(u[i]));
    maxV = Math.max(maxV, Math.abs(v[i]));
  }

  let sumU = 0, sumV = 0;
  for (let i = 0; i < rows * cols; i++) {
    sumU += u[i];
    sumV += v[i];
  }
  const meanDir = (Math.atan2(-sumU, -sumV) * 180 / Math.PI + 360) % 360;
  console.log(`Wind solver: input=${params.direction}deg ${params.speed}m/s, output meanDir=${meanDir.toFixed(0)}deg, iters=${finalIter}, maxDiv=${finalDiv.toFixed(4)}, maxU=${maxU.toFixed(1)}, maxV=${maxV.toFixed(1)}`);

  return { u, v, w, exposure, rows, cols, layers, layerHeights: LAYER_HEIGHTS };
}

function applyTerrainEffects(
  u: Float64Array,
  v: Float64Array,
  w: Float64Array,
  terrain: ElevationGrid,
  baseU: number,
  baseV: number,
  layers: number,
  sxGrid: Float64Array,
): void {
  const { rows, cols, slopes, normalsX, normalsY } = terrain;
  const windMag = Math.sqrt(baseU * baseU + baseV * baseV);
  if (windMag < 0.01) return;

  const wdx = baseU / windMag;
  const wdy = baseV / windMag;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const gi = r * cols + c;
      const slope = slopes[gi];
      const nx = normalsX[gi];
      const ny = normalsY[gi];

      const windwardness = wdx * nx + wdy * ny;
      const sx = sxGrid[gi];

      for (let layer = 0; layer < layers; layer++) {
        const idx = layer * rows * cols + gi;
        const heightAGL = LAYER_HEIGHTS[layer];
        const heightFactor = Math.exp(-heightAGL / 100);

        if (windwardness > 0.1) {
          const decel = 1 - 0.3 * windwardness * Math.sin(slope) * heightFactor;
          u[idx] *= clamp(decel, 0.4, 1);
          v[idx] *= clamp(decel, 0.4, 1);
          w[idx] += windMag * 0.2 * windwardness * Math.sin(slope) * heightFactor;
        } else if (windwardness < -0.1) {
          const leeFactor = 1 + windwardness * 0.5 * heightFactor;
          u[idx] *= clamp(leeFactor, 0.3, 1);
          v[idx] *= clamp(leeFactor, 0.3, 1);
        }

        // Negative Sx = exposed ridge → speed up wind
        if (sx < 0) {
          const speedUp = 1 + 0.6 * Math.abs(sx) * 10 * heightFactor;
          u[idx] *= clamp(speedUp, 1, 2.0);
          v[idx] *= clamp(speedUp, 1, 2.0);
        }
      }
    }
  }
}

// Winstral Sx: maximum upwind shelter angle
// positive = sheltered (upwind terrain higher), negative = exposed ridge
export function computeSx(
  heights: Float64Array,
  r: number,
  c: number,
  rows: number,
  cols: number,
  wdx: number,
  wdy: number,
  cellSize: number,
  searchDist: number = 300,
): number {
  const h0 = heights[r * cols + c];
  const maxSteps = Math.ceil(searchDist / cellSize);
  let maxAngle = -Infinity;

  for (let d = 1; d <= maxSteps; d++) {
    const sr = r - Math.round(wdy * d);
    const sc = c - Math.round(wdx * d);
    if (sr < 0 || sr >= rows || sc < 0 || sc >= cols) break;
    const dh = heights[sr * cols + sc] - h0;
    maxAngle = Math.max(maxAngle, Math.atan2(dh, d * cellSize));
  }

  return maxAngle === -Infinity ? 0 : maxAngle;
}

function enforceMassConservation(
  u: Float64Array,
  v: Float64Array,
  w: Float64Array,
  rows: number,
  cols: number,
  layers: number,
  cellSize: number,
): number {
  let maxDiv = 0;
  const layerSize = rows * cols;

  for (let layer = 0; layer < layers; layer++) {
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        const idx = layer * layerSize + r * cols + c;

        const dudx = (u[idx + 1] - u[idx - 1]) / (2 * cellSize);
        const dvdy = (v[idx + cols] - v[idx - cols]) / (2 * cellSize);
        let dwdz = 0;
        let dims = 2;

        if (layers > 1 && layer > 0 && layer < layers - 1) {
          const dz = LAYER_HEIGHTS[layer + 1] - LAYER_HEIGHTS[layer - 1];
          dwdz = (w[idx + layerSize] - w[idx - layerSize]) / dz;
          dims = 3;
        }

        const div = dudx + dvdy + dwdz;
        maxDiv = Math.max(maxDiv, Math.abs(div));

        const share = RELAXATION_ALPHA * div * cellSize / dims;
        u[idx] -= share;
        v[idx] -= share;
        if (dims === 3) {
          const dz = (LAYER_HEIGHTS[layer + 1] - LAYER_HEIGHTS[layer - 1]) / 2;
          w[idx] -= RELAXATION_ALPHA * div * dz / dims;
        }
      }
    }
  }

  return maxDiv;
}
