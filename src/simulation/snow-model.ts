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

  // Smooth ramp: how much wind affects redistribution (0 at calm, 1 at 2+ m/s)
  const windStrength = smoothstep(0, 2, params.speed);

  const inPowderTemp = params.temperature >= POWDER_TEMP_MIN && params.temperature <= POWDER_TEMP_MAX;

  // Pass 1: compute redistribution factor per cell
  // Factor > 1 = accumulation (lee sides), < 1 = scouring (windward/ridges)
  // At 0 wind, all factors → 1.0 (uniform snow)
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

      // Wind scouring: ramps in with windStrength (no scouring at 0 wind)
      const scourFactor = 1 - clamp(surfaceSpeed / SCOUR_THRESHOLD_MS, 0, 0.8) * windStrength;

      // Lee-side deposition: naturally → 1 at 0 wind (surfaceSpeed=0 → windInfluence=0)
      const aspectDiff = Math.cos(aspects[gi] - windRadTo);
      const windInfluence = clamp(surfaceSpeed / 2, 0, 1);
      const leeFactor = 1 + clamp(aspectDiff, 0, 1) * 0.8 * windInfluence;

      // Slope shedding: steep slopes lose snow (gravity, applies at all wind speeds)
      const slopeDeg = slopes[gi] * (180 / Math.PI);
      const slopeFactor = 1 - smoothstep(35, 55, slopeDeg) * 0.7 * windStrength;

      // Combined redistribution factor
      const factor = scourFactor * leeFactor * slopeFactor;
      factors[gi] = factor;
      factorSum += factor;
    }
  }

  // Pass 2: normalize so total snow is conserved (mass conservation)
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

      depth[gi] = clamp(factors[gi] * scale, 0, snowfallCm * 3);

      // Powder: fresh cold snow IS powder. Wind REMOVES it from exposed areas.
      // At 0 wind: all skiable cells are powder. As wind increases, exposed
      // areas lose powder while sheltered lee slopes retain it.
      if (inPowderTemp) {
        const slopeDeg = slopes[gi] * (180 / Math.PI);
        const skiable = slopeDeg >= SKIABLE_SLOPE_MIN && slopeDeg <= SKIABLE_SLOPE_MAX;
        if (skiable) {
          const su = wind.u[gi];
          const sv = wind.v[gi];
          const surfaceSpeed = Math.sqrt(su * su + sv * sv);
          const aspectDiff = Math.cos(aspects[gi] - windRadTo);

          const exposure = clamp(surfaceSpeed / SCOUR_THRESHOLD_MS, 0, 1) * windStrength;
          const sheltering = clamp(aspectDiff, 0, 1); // 1 = lee, 0 = windward
          const powderSurvival = 1 - exposure * (1 - sheltering * 0.7);

          if (powderSurvival > 0.5) {
            isPowderZone[gi] = 1;
          }
        }
      }
    }
  }

  console.log(`Snow model: ${snowfallCm}cm base, ${landCells} land cells, windStrength=${windStrength.toFixed(2)}, depth range: ${Math.min(...depth).toFixed(0)}-${Math.max(...depth).toFixed(0)}cm`);

  return { depth, isPowderZone, rows, cols };
}
