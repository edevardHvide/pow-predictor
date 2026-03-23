import type { ElevationGrid } from "../types/terrain.ts";
import type { WindField, WindParams } from "../types/wind.ts";
import type { SnowDepthGrid } from "../types/snow.ts";
import { clamp, smoothstep } from "../utils/math.ts";

const BASE_SNOWFALL_CM = 30; // default uniform snowfall in cm
const SCOUR_THRESHOLD_MS = 8.3;
const POWDER_TEMP_MIN = -10;
const POWDER_TEMP_MAX = -5;
const SKIABLE_SLOPE_MIN = 25;
const SKIABLE_SLOPE_MAX = 45;

export function computeSnowAccumulation(
  terrain: ElevationGrid,
  wind: WindField,
  params: WindParams,
  snowfallCm = BASE_SNOWFALL_CM,
): SnowDepthGrid {
  const { rows, cols, slopes, aspects, heights } = terrain;
  const depth = new Float64Array(rows * cols);
  const isPowderZone = new Uint8Array(rows * cols);

  // No snow above freezing
  if (params.temperature > 1) {
    return { depth, isPowderZone, rows, cols };
  }

  // Wind direction: where wind blows TO (for lee-side calc)
  const windRadTo = ((params.direction + 180) % 360) * (Math.PI / 180);

  // Pass 1: compute redistribution factor per cell
  // Factor > 1 = accumulation (lee sides), < 1 = scouring (windward/ridges)
  const factors = new Float64Array(rows * cols);
  let factorSum = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const gi = r * cols + c;

      // Skip water
      if (heights[gi] < 40) {
        factors[gi] = 0;
        continue;
      }

      const su = wind.u[gi];
      const sv = wind.v[gi];
      const surfaceSpeed = Math.sqrt(su * su + sv * sv);

      // Wind scouring: high wind removes snow
      const scourFactor = 1 - clamp(surfaceSpeed / SCOUR_THRESHOLD_MS, 0, 0.8);

      // Lee-side deposition: slope facing away from wind accumulates
      const aspectDiff = Math.cos(aspects[gi] - windRadTo);
      const leeFactor = 1 + clamp(aspectDiff, 0, 1) * 0.8; // up to 1.8x on lee

      // Slope shedding: steep slopes lose snow
      const slopeDeg = slopes[gi] * (180 / Math.PI);
      const slopeFactor = 1 - smoothstep(35, 55, slopeDeg) * 0.7;

      // Combined redistribution factor
      const factor = scourFactor * leeFactor * slopeFactor;
      factors[gi] = factor;
      factorSum += factor;
    }
  }

  // Pass 2: normalize so total snow is conserved (mass conservation)
  // Total snow = snowfallCm * number_of_land_cells
  let landCells = 0;
  for (let i = 0; i < factors.length; i++) {
    if (factors[i] > 0) landCells++;
  }

  const targetTotal = snowfallCm * landCells;
  const scale = factorSum > 0 ? targetTotal / factorSum : 1;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const gi = r * cols + c;
      if (factors[gi] === 0) continue;

      depth[gi] = clamp(factors[gi] * scale, 0, snowfallCm * 3); // cap at 3x base

      // Powder zone detection
      const slopeDeg = slopes[gi] * (180 / Math.PI);
      const aspectDiff = Math.cos(aspects[gi] - windRadTo);
      const su = wind.u[gi];
      const sv = wind.v[gi];
      const surfaceSpeed = Math.sqrt(su * su + sv * sv);

      if (
        params.temperature >= POWDER_TEMP_MIN &&
        params.temperature <= POWDER_TEMP_MAX &&
        slopeDeg >= SKIABLE_SLOPE_MIN &&
        slopeDeg <= SKIABLE_SLOPE_MAX &&
        aspectDiff > 0.3 && // lee side
        surfaceSpeed < SCOUR_THRESHOLD_MS // not scoured
      ) {
        isPowderZone[gi] = 1;
      }
    }
  }

  console.log(`Snow model: ${snowfallCm}cm base, ${landCells} land cells, depth range: ${Math.min(...depth).toFixed(0)}-${Math.max(...depth).toFixed(0)}cm`);

  return { depth, isPowderZone, rows, cols };
}
