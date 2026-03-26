import type { ElevationGrid } from "../types/terrain.ts";
import type { WindField, WindParams } from "../types/wind.ts";
import type { SnowDepthGrid } from "../types/snow.ts";
import { clamp, smoothstep } from "../utils/math.ts";
import {
  BASE_SNOWFALL_CM,
  KARMAN_DRAG_COEFF,
  POWDER_TEMP_MIN,
  POWDER_TEMP_MAX,
  SKIABLE_SLOPE_MIN,
  SKIABLE_SLOPE_MAX,
  ADVECTION_ITERATIONS,
  type CoefficientsOverride,
} from "./coefficients.ts";

// Li & Pomeroy 1997 — friction velocity threshold by temperature
function thresholdFrictionVelocity(tempC: number): number {
  if (tempC > 0) return 1.0;     // wet snow barely moves
  if (tempC > -3) return 0.48;   // moist snow
  if (tempC > -10) return 0.28;  // settled cold snow
  return 0.16;                    // fresh dry powder
}

// 10m wind speed threshold (for powder detection)
function thresholdWindSpeed(tempC: number): number {
  if (tempC > 0) return 25;
  if (tempC > -3) return 12;
  if (tempC > -10) return 7;
  return 4;
}

// 2D saltation advection: snow physically moves downwind from ridges to lee slopes
function advectSaltation(
  terrain: ElevationGrid,
  wind: WindField,
  params: WindParams,
  snowfallCm: number | Float64Array,
  overrides?: CoefficientsOverride,
): Float64Array {
  const karman = overrides?.KARMAN_DRAG_COEFF ?? KARMAN_DRAG_COEFF;
  const advIter = overrides?.ADVECTION_ITERATIONS ?? ADVECTION_ITERATIONS;

  const { rows, cols, heights, slopes, cellSizeMeters } = terrain;
  const n = rows * cols;

  // Start with snowfall on land — uniform scalar or per-cell array
  const snow = new Float64Array(n);
  const isArray = typeof snowfallCm !== "number";
  for (let i = 0; i < n; i++) {
    if (heights[i] >= 40) snow[i] = isArray ? snowfallCm[i] : snowfallCm;
  }

  // No redistribution at calm wind
  if (params.speed < 0.5) return snow;

  const massInTransport = new Float64Array(n);
  const uStarTh = thresholdFrictionVelocity(params.temperature);
  const windStrength = smoothstep(0, 12, params.speed);

  // Reference max flux for normalization (30 m/s wind)
  const uStarMax = 30 * karman;
  const qRef = uStarMax * (uStarMax * uStarMax - uStarTh * uStarTh);

  // Scale factor: maps normalized flux [0,1] to cm of erosion per iteration
  // At max flux, erode up to ~snowfallCm*0.15 per iteration (moderate redistribution)
  // For per-cell snowfall, use mean as reference scale
  const meanFall = isArray
    ? snow.reduce((a, b) => a + b, 0) / Math.max(n, 1)
    : (snowfallCm as number);
  const erosionScale = meanFall * 0.15;

  for (let iter = 0; iter < advIter; iter++) {
    // 1. Erosion & deposition per cell
    for (let i = 0; i < n; i++) {
      if (heights[i] < 40) continue;

      const speed = Math.sqrt(wind.u[i] ** 2 + wind.v[i] ** 2);
      const uStar = speed * karman;

      // Erosion: Pomeroy flux normalized to [0,1], fetch-limited
      if (uStar > uStarTh && snow[i] > 0.1) {
        const qNorm = clamp((uStar * (uStar * uStar - uStarTh * uStarTh)) / qRef, 0, 1);
        const equilibriumTransport = qNorm * erosionScale;
        const deficit = Math.max(0, equilibriumTransport - massInTransport[i]);
        const eroded = Math.min(deficit * windStrength, snow[i] * 0.15);
        snow[i] -= eroded;
        massInTransport[i] += eroded;
      }

      // Deposition: in sheltered areas (positive Sx) or where wind drops
      const sx = wind.exposure[i];
      if (sx > 0.005 && massInTransport[i] > 0.01) {
        // Stronger deposition in more sheltered areas
        const depRate = clamp(sx * 8, 0, 0.5);
        const deposited = massInTransport[i] * depRate;
        snow[i] += deposited;
        massInTransport[i] -= deposited;
      }

      // Slope shedding: steep slopes shed deposited snow
      const slopeDeg = slopes[i] * (180 / Math.PI);
      const cellFall = isArray ? snowfallCm[i] : (snowfallCm as number);
      if (slopeDeg > 40 && snow[i] > cellFall * 0.5) {
        const excess = (snow[i] - cellFall * 0.5) * smoothstep(40, 55, slopeDeg) * 0.3;
        snow[i] -= excess;
        massInTransport[i] += excess * 0.5;
      }
    }

    // 2. Advect transport mass downwind (first-order upwind scheme)
    const newTransport = new Float64Array(n);
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        const i = r * cols + c;
        if (massInTransport[i] < 0.001) continue;

        const wu = wind.u[i];
        const wv = wind.v[i];
        const speed = Math.sqrt(wu * wu + wv * wv);
        if (speed < 0.1) {
          newTransport[i] += massInTransport[i];
          continue;
        }

        const dt = cellSizeMeters / (speed + 1);
        const courant = clamp(speed * dt / cellSizeMeters, 0, 0.9);

        // Upwind source: where is transport coming FROM
        const srcC = wu > 0 ? c - 1 : c + 1;
        const srcR = wv > 0 ? r - 1 : r + 1;

        if (srcC >= 0 && srcC < cols && srcR >= 0 && srcR < rows) {
          const srcI = srcR * cols + srcC;
          newTransport[i] += massInTransport[i] * (1 - courant)
                          + massInTransport[srcI] * courant;
        } else {
          newTransport[i] += massInTransport[i];
        }
      }
    }

    // 3. Sublimation loss during transport (1-3% per iteration)
    const sublimRate = clamp(0.01 + 0.0015 * params.speed, 0, 0.03);
    for (let i = 0; i < n; i++) {
      newTransport[i] *= (1 - sublimRate);
    }

    massInTransport.set(newTransport);
  }

  // Deposit remaining transport mass
  for (let i = 0; i < n; i++) {
    snow[i] += massInTransport[i];
  }

  return snow;
}

export function computeSnowAccumulation(
  terrain: ElevationGrid,
  wind: WindField,
  params: WindParams,
  snowfallCm: number | Float64Array = BASE_SNOWFALL_CM,
  overrides?: CoefficientsOverride,
): SnowDepthGrid {
  const powTempMin = overrides?.POWDER_TEMP_MIN ?? POWDER_TEMP_MIN;
  const powTempMax = overrides?.POWDER_TEMP_MAX ?? POWDER_TEMP_MAX;
  const skiSlopeMin = overrides?.SKIABLE_SLOPE_MIN ?? SKIABLE_SLOPE_MIN;
  const skiSlopeMax = overrides?.SKIABLE_SLOPE_MAX ?? SKIABLE_SLOPE_MAX;

  const { rows, cols, slopes, heights } = terrain;
  const n = rows * cols;
  const isPowderZone = new Uint8Array(n);

  // No snow above freezing (only for uniform scalar snowfall — per-cell arrays
  // already have temperature filtering baked in from the spatial interpolation)
  if (typeof snowfallCm === "number" && params.temperature > 1) {
    return { depth: new Float64Array(n), isPowderZone, rows, cols };
  }

  // Advection-based redistribution
  const depth = advectSaltation(terrain, wind, params, snowfallCm, overrides);

  // For powder detection, use mean snowfall as reference
  const meanSnowfall = typeof snowfallCm === "number"
    ? snowfallCm
    : snowfallCm.reduce((a, b) => a + b, 0) / Math.max(n, 1);

  // Powder zone detection: powder survives in sheltered, low-wind areas
  const inPowderTemp = params.temperature >= powTempMin && params.temperature <= powTempMax;
  if (inPowderTemp) {
    for (let i = 0; i < n; i++) {
      if (heights[i] < 40) continue;
      const slopeDeg = slopes[i] * (180 / Math.PI);
      const skiable = slopeDeg >= skiSlopeMin && slopeDeg <= skiSlopeMax;
      if (!skiable) continue;

      const surfaceSpeed = Math.sqrt(wind.u[i] ** 2 + wind.v[i] ** 2);
      const baseSnow = typeof snowfallCm === "number" ? snowfallCm : snowfallCm[i];
      const isWindLoaded = depth[i] > baseSnow * 1.15;
      const isLowWind = surfaceSpeed < thresholdWindSpeed(params.temperature) * 0.7;

      if (isLowWind && !isWindLoaded) {
        isPowderZone[i] = 1;
      }
    }
  }

  let minD = Infinity, maxD = -Infinity, landCells = 0;
  for (let i = 0; i < n; i++) {
    if (heights[i] < 40) continue;
    landCells++;
    if (depth[i] < minD) minD = depth[i];
    if (depth[i] > maxD) maxD = depth[i];
  }
  console.log(`Snow model: ${meanSnowfall.toFixed(1)}cm avg base, ${landCells} land cells, depth range: ${minD.toFixed(1)}-${maxD.toFixed(1)}cm`);

  return { depth, isPowderZone, rows, cols };
}
