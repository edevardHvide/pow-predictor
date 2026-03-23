import type { ElevationGrid } from "../types/terrain.ts";
import type { WindField, WindParams } from "../types/wind.ts";
import { windDirToComponents, clamp } from "../utils/math.ts";

const LAYER_HEIGHTS = [10, 50, 150, 300, 500]; // meters AGL
const MAX_ITERATIONS = 150;
const DIVERGENCE_THRESHOLD = 0.01;
const RELAXATION_ALPHA = 0.15;
const SURFACE_ROUGHNESS = 0.03; // z0 for snow-covered terrain
const REF_HEIGHT = 500; // reference height for log profile

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

  // Step 1: Initialize with log-profile wind at each layer
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

  // Step 2: Apply terrain effects
  applyTerrainEffects(u, v, w, terrain, baseU, baseV, layers);

  // Step 3: Iterative mass-conservation (divergence reduction)
  let finalDiv = 0;
  let finalIter = 0;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const maxDiv = enforceMassConservation(u, v, w, rows, cols, layers, terrain.cellSizeMeters);
    finalDiv = maxDiv;
    finalIter = iter;
    if (maxDiv < DIVERGENCE_THRESHOLD) break;
  }

  // Debug: check for blowup
  let maxU = 0, maxV = 0, maxW = 0, hasNaN = false;
  for (let i = 0; i < totalCells; i++) {
    if (!isFinite(u[i]) || !isFinite(v[i]) || !isFinite(w[i])) { hasNaN = true; break; }
    maxU = Math.max(maxU, Math.abs(u[i]));
    maxV = Math.max(maxV, Math.abs(v[i]));
    maxW = Math.max(maxW, Math.abs(w[i]));
  }
  console.log(`Wind solver: speed=${params.speed}m/s, iters=${finalIter}, maxDiv=${finalDiv.toFixed(4)}, maxU=${maxU.toFixed(1)}, maxV=${maxV.toFixed(1)}, maxW=${maxW.toFixed(1)}, NaN=${hasNaN}`);

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

  // Normalized wind direction vector (horizontal)
  const wdx = baseU / windMag;
  const wdy = baseV / windMag;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const gi = r * cols + c; // grid index
      const slope = slopes[gi];
      const nx = normalsX[gi];
      const ny = normalsY[gi];

      // Dot product of wind direction with surface normal (horizontal component)
      // Positive = windward (wind hits this slope), negative = lee side
      const windwardness = wdx * nx + wdy * ny;

      // Terrain exposure: how much this cell "sticks up" relative to upwind cells
      const exposure = computeExposure(heights, r, c, rows, cols, wdx, wdy, terrain.cellSizeMeters);

      for (let layer = 0; layer < layers; layer++) {
        const idx = layer * rows * cols + gi;
        const heightAGL = LAYER_HEIGHTS[layer];

        // Effects diminish with height
        const heightFactor = Math.exp(-heightAGL / 200);

        if (windwardness > 0.1) {
          // Windward slope: decelerate, deflect upward
          const decel = 1 - 0.4 * windwardness * Math.sin(slope) * heightFactor;
          u[idx] *= clamp(decel, 0.3, 1);
          v[idx] *= clamp(decel, 0.3, 1);
          w[idx] += windMag * 0.3 * windwardness * Math.sin(slope) * heightFactor;
        } else if (windwardness < -0.1) {
          // Lee side: strong deceleration, turbulence zone
          const leeFactor = 1 + windwardness * 0.6 * heightFactor; // windwardness is negative
          u[idx] *= clamp(leeFactor, 0.2, 1);
          v[idx] *= clamp(leeFactor, 0.2, 1);
          w[idx] -= windMag * 0.15 * Math.abs(windwardness) * heightFactor;
        }

        // Ridge speed-up (exposure > 0 means cell is higher than surroundings)
        if (exposure > 0) {
          const speedUp = 1 + 0.5 * exposure * heightFactor;
          u[idx] *= clamp(speedUp, 1, 1.6);
          v[idx] *= clamp(speedUp, 1, 1.6);
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

  // Check upwind cells (3-5 cells back along wind direction)
  for (let dist = 1; dist <= 5; dist++) {
    const sr = r - Math.round(wdy * dist);
    const sc = c - Math.round(wdx * dist);
    if (sr >= 0 && sr < rows && sc >= 0 && sc < cols) {
      sumDiff += centerH - heights[sr * cols + sc];
      count++;
    }
  }

  if (count === 0) return 0;
  // Normalize: positive = cell is higher (ridge), negative = cell is lower (valley)
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

  // Distribute divergence equally to the center cell's velocity components
  // This is stable because each cell only modifies itself
  for (let layer = 0; layer < layers; layer++) {
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        const idx = layer * layerSize + r * cols + c;

        const dudx = (u[idx + 1] - u[idx - 1]) / (2 * cellSize);
        const dvdy = (v[idx + cols] - v[idx - cols]) / (2 * cellSize);
        let dwdz = 0;
        let dims = 2;

        if (layer > 0 && layer < layers - 1) {
          const dz = LAYER_HEIGHTS[layer + 1] - LAYER_HEIGHTS[layer - 1];
          dwdz = (w[idx + layerSize] - w[idx - layerSize]) / dz;
          dims = 3;
        }

        const div = dudx + dvdy + dwdz;
        maxDiv = Math.max(maxDiv, Math.abs(div));

        // Correct center cell velocity to reduce divergence
        // Each component absorbs an equal share
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
