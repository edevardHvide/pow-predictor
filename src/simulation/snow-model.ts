import type { ElevationGrid } from "../types/terrain.ts";
import type { WindField, WindParams } from "../types/wind.ts";
import type { SnowDepthGrid } from "../types/snow.ts";
import { clamp, smoothstep } from "../utils/math.ts";

const SCOUR_THRESHOLD_MS = 8.3; // ~30 km/h
const POWDER_TEMP_MIN = -10;
const POWDER_TEMP_MAX = -5;
const SKIABLE_SLOPE_MIN = 25; // degrees
const SKIABLE_SLOPE_MAX = 45;

export function computeSnowAccumulation(
  terrain: ElevationGrid,
  wind: WindField,
  params: WindParams,
): SnowDepthGrid {
  const { rows, cols, slopes, aspects, heights } = terrain;
  const depth = new Float64Array(rows * cols);
  const isPowderZone = new Uint8Array(rows * cols);

  // No snow above freezing
  if (params.temperature > 1) {
    return { depth, isPowderZone, rows, cols };
  }

  // Find height range for elevation band scoring
  let minH = Infinity, maxH = -Infinity;
  for (let i = 0; i < heights.length; i++) {
    if (heights[i] < minH) minH = heights[i];
    if (heights[i] > maxH) maxH = heights[i];
  }
  const heightRange = maxH - minH || 1;

  // Wind direction in radians (direction wind blows FROM → direction it blows TO)
  const windRadTo = ((params.direction + 180) % 360) * (Math.PI / 180);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const gi = r * cols + c;

      // Surface wind speed (layer 0)
      const su = wind.u[gi];
      const sv = wind.v[gi];
      const surfaceSpeed = Math.sqrt(su * su + sv * sv);

      // Factor 1: Wind speed (35%) — low wind = snow stays
      const windScore = 1 - clamp(surfaceSpeed / SCOUR_THRESHOLD_MS, 0, 1);

      // Factor 2: Lee-side deposition (30%)
      // Aspect is direction slope faces, wind blows TO windRadTo
      // Lee = aspect roughly aligned with wind-to direction (slope faces away from wind)
      const aspectDiff = Math.cos(aspects[gi] - windRadTo);
      const leeScore = clamp(aspectDiff * 0.5 + 0.5, 0, 1);

      // Factor 3: Slope angle (15%) — steep slopes shed snow
      const slopeDeg = slopes[gi] * (180 / Math.PI);
      const slopeScore = 1 - smoothstep(35, 55, slopeDeg);

      // Factor 4: Elevation band (10%) — mid-upper elevations accumulate best
      const relHeight = (heights[gi] - minH) / heightRange;
      // Best accumulation at 60-80% of height range (above treeline, below ridge)
      const elevScore = 1 - Math.abs(relHeight - 0.7) * 2;

      // Factor 5: Temperature (10%)
      let tempScore: number;
      if (params.temperature < -2) {
        // Cold dry snow — more transportable, moderate accumulation
        tempScore = 0.6;
      } else {
        // Wet snow — sticks where it falls
        tempScore = 0.9;
      }

      // Weighted sum
      const score =
        0.35 * windScore +
        0.30 * leeScore +
        0.15 * slopeScore +
        0.10 * clamp(elevScore, 0, 1) +
        0.10 * tempScore;

      depth[gi] = clamp(score, 0, 1);

      // Powder zone detection
      if (
        params.temperature >= POWDER_TEMP_MIN &&
        params.temperature <= POWDER_TEMP_MAX &&
        slopeDeg >= SKIABLE_SLOPE_MIN &&
        slopeDeg <= SKIABLE_SLOPE_MAX &&
        leeScore > 0.6 &&
        windScore > 0.4
      ) {
        isPowderZone[gi] = 1;
      }
    }
  }

  return { depth, isPowderZone, rows, cols };
}
