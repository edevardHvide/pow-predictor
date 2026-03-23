import type { ElevationGrid } from "../types/terrain.ts";
import type { WindField, WindParams } from "../types/wind.ts";
import { windDirToComponents, clamp } from "../utils/math.ts";

const LAYER_HEIGHTS = [10, 50]; // meters AGL — ground level only
const MAX_ITERATIONS = 100;
const DIVERGENCE_THRESHOLD = 0.005;
const RELAXATION_ALPHA = 0.1;
const SURFACE_ROUGHNESS = 0.03;
const REF_HEIGHT = 50;

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

  // Apply terrain effects
  applyTerrainEffects(u, v, w, terrain, baseU, baseV, layers);

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

  // Compute mean direction of surface layer to verify
  let sumU = 0, sumV = 0;
  for (let i = 0; i < rows * cols; i++) {
    sumU += u[i];
    sumV += v[i];
  }
  const meanDir = (Math.atan2(-sumU, -sumV) * 180 / Math.PI + 360) % 360;
  console.log(`Wind solver: input=${params.direction}deg ${params.speed}m/s, output meanDir=${meanDir.toFixed(0)}deg, iters=${finalIter}, maxDiv=${finalDiv.toFixed(4)}, maxU=${maxU.toFixed(1)}, maxV=${maxV.toFixed(1)}`);

  return { u, v, w, rows, cols, layers, layerHeights: LAYER_HEIGHTS };
}

function applyTerrainEffects(
  u: Float64Array,
  v: Float64Array,
  w: Float64Array,
  terrain: ElevationGrid,
  baseU: number,
  baseV: number,
  layers: number,
): void {
  const { rows, cols, heights, slopes, normalsX, normalsY } = terrain;
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
      const exposure = computeExposure(heights, r, c, rows, cols, wdx, wdy, terrain.cellSizeMeters);

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

        if (exposure > 0) {
          const speedUp = 1 + 0.4 * exposure * heightFactor;
          u[idx] *= clamp(speedUp, 1, 1.5);
          v[idx] *= clamp(speedUp, 1, 1.5);
        }
      }
    }
  }
}

function computeExposure(
  heights: Float64Array,
  r: number,
  c: number,
  rows: number,
  cols: number,
  wdx: number,
  wdy: number,
  cellSize: number,
): number {
  const centerH = heights[r * cols + c];
  let sumDiff = 0;
  let count = 0;

  for (let dist = 1; dist <= 5; dist++) {
    const sr = r - Math.round(wdy * dist);
    const sc = c - Math.round(wdx * dist);
    if (sr >= 0 && sr < rows && sc >= 0 && sc < cols) {
      sumDiff += centerH - heights[sr * cols + sc];
      count++;
    }
  }

  if (count === 0) return 0;
  return clamp(sumDiff / count / (cellSize * 2), -1, 1);
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
