// ── Simulation Coefficients ──────────────────────────────────────────
// Central registry of all tunable physics and solver parameters.
// Import from here instead of scattering constants across modules.

// ── Wind Solver ─────────────────────────────────────────────────────

/** Vertical layer heights in meters above ground level */
export const LAYER_HEIGHTS = [10, 50];
/** Max Gauss-Seidel iterations for mass conservation */
export const MAX_ITERATIONS = 100;
/** Convergence threshold for divergence check */
export const DIVERGENCE_THRESHOLD = 0.005;
/** Relaxation factor for Gauss-Seidel solver */
export const RELAXATION_ALPHA = 0.1;
/** Surface roughness length z0 (meters) */
export const SURFACE_ROUGHNESS = 0.03;
/** Reference height for log-law wind profile (meters) */
export const REF_HEIGHT = 50;

// ── Snow Model ──────────────────────────────────────────────────────

/** Default snowfall for manual (non-historical) simulation (cm) */
export const BASE_SNOWFALL_CM = 30;
/** Von Karman drag coefficient: u* = surfaceSpeed × this */
export const KARMAN_DRAG_COEFF = 0.04;
/** Powder survival: minimum temperature (°C) */
export const POWDER_TEMP_MIN = -10;
/** Powder survival: maximum temperature (°C) */
export const POWDER_TEMP_MAX = -5;
/** Skiable slope range: minimum steepness (degrees) */
export const SKIABLE_SLOPE_MIN = 25;
/** Skiable slope range: maximum steepness (degrees) */
export const SKIABLE_SLOPE_MAX = 45;
/** Number of saltation advection iterations per simulation step */
export const ADVECTION_ITERATIONS = 12;

// ── Historical Simulation ───────────────────────────────────────────

/** 1mm water = 10mm (1cm) snow */
export const SNOW_WATER_RATIO = 10;
/** Melt rate: mm water equivalent per °C per 3h step */
export const MELT_DEGREE_FACTOR = 0.5;
/** Additional melt per mm rain */
export const RAIN_MELT_FACTOR = 0.2;
/** Sub-steps per 3h weather interval (= 45-minute resolution) */
export const SUB_STEPS = 4;
/** Duration of one weather interval in ms */
export const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
/** Wind direction change threshold for re-solving wind field (degrees) */
export const WIND_DIR_CHANGE_THRESHOLD = 15;
/** Wind speed change threshold for re-solving wind field (m/s) */
export const WIND_SPEED_CHANGE_THRESHOLD = 2;

// ── Spatial Weather & Downscaling ───────────────────────────────────

/** Environmental lapse rate: °C per meter of elevation gain */
export const LAPSE_RATE = -6.5 / 1000;
/** Orographic precipitation enhancement: fractional increase per meter above reference */
export const PRECIP_ELEV_FACTOR = 0.08 / 100;

// ── Terrain ─────────────────────────────────────────────────────────

/** Default terrain grid cell size (meters). 75m desktop, 120m mobile via device.ts */
export const DEFAULT_CELL_SIZE = 75;

// ── Runtime Override Support ────────────────────────────────────────

export const DEFAULTS = {
  MAX_ITERATIONS,
  DIVERGENCE_THRESHOLD,
  RELAXATION_ALPHA,
  SURFACE_ROUGHNESS,
  REF_HEIGHT,
  BASE_SNOWFALL_CM,
  KARMAN_DRAG_COEFF,
  ADVECTION_ITERATIONS,
  POWDER_TEMP_MIN,
  POWDER_TEMP_MAX,
  SKIABLE_SLOPE_MIN,
  SKIABLE_SLOPE_MAX,
  SNOW_WATER_RATIO,
  MELT_DEGREE_FACTOR,
  RAIN_MELT_FACTOR,
  SUB_STEPS,
  WIND_DIR_CHANGE_THRESHOLD,
  WIND_SPEED_CHANGE_THRESHOLD,
  LAPSE_RATE,
  PRECIP_ELEV_FACTOR,
} as const;

export type CoefficientsOverride = Partial<typeof DEFAULTS>;

export interface SliderMeta {
  key: keyof typeof DEFAULTS;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
}

export const COEFFICIENT_GROUPS: { name: string; sliders: SliderMeta[] }[] = [
  {
    name: "Wind Solver",
    sliders: [
      { key: "MAX_ITERATIONS", label: "Max Iterations", description: "Gauss-Seidel iteration cap for mass conservation", min: 10, max: 500, step: 10 },
      { key: "DIVERGENCE_THRESHOLD", label: "Divergence Threshold", description: "Convergence check — lower = more accurate, slower", min: 0.001, max: 0.05, step: 0.001 },
      { key: "RELAXATION_ALPHA", label: "Relaxation Alpha", description: "Solver relaxation — higher = faster but less stable", min: 0.01, max: 0.5, step: 0.01 },
      { key: "SURFACE_ROUGHNESS", label: "Surface Roughness (z0)", description: "Terrain roughness length in meters — affects wind profile", min: 0.001, max: 0.5, step: 0.001 },
      { key: "REF_HEIGHT", label: "Reference Height", description: "Log-law wind profile reference height (meters)", min: 10, max: 200, step: 5 },
    ],
  },
  {
    name: "Snow Transport",
    sliders: [
      { key: "BASE_SNOWFALL_CM", label: "Base Snowfall (cm)", description: "Starting snowfall depth for manual mode", min: 5, max: 100, step: 1 },
      { key: "KARMAN_DRAG_COEFF", label: "Von Karman Drag", description: "Friction velocity: u* = wind speed x this", min: 0.01, max: 0.1, step: 0.005 },
      { key: "ADVECTION_ITERATIONS", label: "Advection Iterations", description: "Saltation passes per step — more = longer fetch", min: 1, max: 30, step: 1 },
      { key: "POWDER_TEMP_MIN", label: "Powder Temp Min (C)", description: "Coldest temp for powder survival", min: -30, max: 0, step: 1 },
      { key: "POWDER_TEMP_MAX", label: "Powder Temp Max (C)", description: "Warmest temp for powder survival", min: -20, max: 0, step: 1 },
      { key: "SKIABLE_SLOPE_MIN", label: "Skiable Slope Min (deg)", description: "Minimum skiable steepness", min: 10, max: 40, step: 1 },
      { key: "SKIABLE_SLOPE_MAX", label: "Skiable Slope Max (deg)", description: "Maximum skiable steepness", min: 30, max: 60, step: 1 },
    ],
  },
  {
    name: "Historical Simulation",
    sliders: [
      { key: "SNOW_WATER_RATIO", label: "Snow:Water Ratio", description: "mm water to mm snow conversion", min: 5, max: 20, step: 1 },
      { key: "MELT_DEGREE_FACTOR", label: "Melt Degree Factor", description: "Melt rate: mm water equiv per C per 3h step", min: 0.1, max: 2.0, step: 0.1 },
      { key: "RAIN_MELT_FACTOR", label: "Rain Melt Factor", description: "Additional melt per mm rain", min: 0.0, max: 1.0, step: 0.05 },
      { key: "SUB_STEPS", label: "Sub-Steps", description: "Sub-steps per 3h interval — higher = smoother", min: 1, max: 12, step: 1 },
      { key: "WIND_DIR_CHANGE_THRESHOLD", label: "Wind Dir Threshold (deg)", description: "Direction change before re-solving wind", min: 5, max: 45, step: 5 },
      { key: "WIND_SPEED_CHANGE_THRESHOLD", label: "Wind Speed Threshold (m/s)", description: "Speed change before re-solving wind", min: 0.5, max: 10, step: 0.5 },
    ],
  },
  {
    name: "Weather Downscaling",
    sliders: [
      { key: "LAPSE_RATE", label: "Lapse Rate (C/m)", description: "Temperature change per meter elevation gain", min: -0.01, max: -0.003, step: 0.0005 },
      { key: "PRECIP_ELEV_FACTOR", label: "Precip Elevation Factor", description: "Precipitation increase fraction per meter above reference", min: 0.0, max: 0.003, step: 0.0001 },
    ],
  },
];
