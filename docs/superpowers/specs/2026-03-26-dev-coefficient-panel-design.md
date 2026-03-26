# Dev Coefficient Panel — Design Spec

## Overview

A dev-only right-side drawer panel that exposes all simulation coefficients as tunable sliders with descriptions, an Apply button to re-run simulation, and a Copy Settings button that exports changed values as JSON for pasting into Claude Code to update `coefficients.ts`.

## Activation

- `?dev=true` URL parameter enables dev mode (no UI trace otherwise)
- `Ctrl+Shift+D` toggles panel visibility when dev mode is enabled
- Dev mode state stored in a React context or simple module-level flag

## Layout

- Right-side drawer, ~320px wide, glass-panel styling matching ControlPanel
- Scrollable content with collapsible coefficient groups
- Fixed header with: "Dev Coefficients" title, Apply button, Reset button, Copy Settings button
- Apply re-runs simulation with current slider values
- Reset restores all coefficients to their default values from `coefficients.ts`
- Copy Settings copies JSON of changed-from-default values to clipboard

## Coefficient Groups

### Wind Solver
| Coefficient | Description | Default | Min | Max | Step |
|---|---|---|---|---|---|
| `MAX_ITERATIONS` | Gauss-Seidel iteration cap for mass conservation | 100 | 10 | 500 | 10 |
| `DIVERGENCE_THRESHOLD` | Convergence threshold — lower = more accurate, slower | 0.005 | 0.001 | 0.05 | 0.001 |
| `RELAXATION_ALPHA` | Solver relaxation factor — higher = faster but less stable | 0.1 | 0.01 | 0.5 | 0.01 |
| `SURFACE_ROUGHNESS` | Terrain roughness length z0 (meters) — affects wind profile shape | 0.03 | 0.001 | 0.5 | 0.001 |
| `REF_HEIGHT` | Reference height for log-law wind profile (meters) | 50 | 10 | 200 | 5 |

*Note: `LAYER_HEIGHTS` is display-only (array, not slider-tunable).*

### Snow Transport
| Coefficient | Description | Default | Min | Max | Step |
|---|---|---|---|---|---|
| `BASE_SNOWFALL_CM` | Base snowfall depth for manual mode (cm) | 30 | 5 | 100 | 1 |
| `KARMAN_DRAG_COEFF` | Von Karman drag — u* = wind speed × this value | 0.04 | 0.01 | 0.1 | 0.005 |
| `ADVECTION_ITERATIONS` | Saltation passes per step — more = longer fetch distances | 12 | 1 | 30 | 1 |
| `POWDER_TEMP_MIN` | Coldest temp for powder survival (°C) | -10 | -30 | 0 | 1 |
| `POWDER_TEMP_MAX` | Warmest temp for powder survival (°C) | -5 | -20 | 0 | 1 |
| `SKIABLE_SLOPE_MIN` | Minimum skiable slope (degrees) | 25 | 10 | 40 | 1 |
| `SKIABLE_SLOPE_MAX` | Maximum skiable slope (degrees) | 45 | 30 | 60 | 1 |

### Historical Simulation
| Coefficient | Description | Default | Min | Max | Step |
|---|---|---|---|---|---|
| `SNOW_WATER_RATIO` | mm water → mm snow conversion | 10 | 5 | 20 | 1 |
| `MELT_DEGREE_FACTOR` | Melt rate: mm water equiv per °C per 3h step | 0.5 | 0.1 | 2.0 | 0.1 |
| `RAIN_MELT_FACTOR` | Additional melt per mm rain | 0.2 | 0.0 | 1.0 | 0.05 |
| `SUB_STEPS` | Sub-steps per 3h interval — higher = smoother but slower | 4 | 1 | 12 | 1 |
| `WIND_DIR_CHANGE_THRESHOLD` | Degrees change before re-solving wind field | 15 | 5 | 45 | 5 |
| `WIND_SPEED_CHANGE_THRESHOLD` | m/s change before re-solving wind field | 2 | 0.5 | 10 | 0.5 |

### Weather Downscaling
| Coefficient | Description | Default | Min | Max | Step |
|---|---|---|---|---|---|
| `LAPSE_RATE` | Temperature change per meter elevation (°C/m) | -0.0065 | -0.01 | -0.003 | 0.0005 |
| `PRECIP_ELEV_FACTOR` | Precipitation increase fraction per meter above reference | 0.0008 | 0.0 | 0.003 | 0.0001 |

### Terrain (display-only)
| Coefficient | Description | Default |
|---|---|---|
| `LAYER_HEIGHTS` | Vertical layer heights AGL (meters) | [10, 50] |
| `DEFAULT_CELL_SIZE` | Grid resolution (meters) — requires terrain re-sample to change | 75 |

## Copy Settings Export

The Copy Settings button copies a JSON object to clipboard containing only coefficients that differ from defaults:

```json
{
  "KARMAN_DRAG_COEFF": 0.05,
  "ADVECTION_ITERATIONS": 16
}
```

User pastes this into Claude Code to update `coefficients.ts` with the tuned values.

## Data Flow

1. `coefficients.ts` exports defaults as named constants (already done)
2. New: `coefficients.ts` also exports a `DEFAULTS` object and a `CoefficientsOverride` type
3. Dev panel stores overrides in React state
4. On Apply: overrides are sent to the worker via existing `run-simulation` message (new optional `overrides` field)
5. Worker merges overrides onto defaults before passing to `solveWindField` / `computeSnowAccumulation`
6. Physics functions receive coefficient values as parameters rather than importing constants directly

### Changes to physics functions

- `solveWindField` and `computeSnowAccumulation` gain an optional `coefficients` parameter object
- When omitted, they use the imported defaults (no breaking change for historical-sim or other callers)
- The worker is the only place that constructs the merged object

## Components

- `DevCoefficientPanel.tsx` — the drawer component with slider groups
- `useDevMode.ts` — hook that reads URL param and manages keyboard shortcut
- Changes to `coefficients.ts` — add `DEFAULTS` record and `CoefficientsOverride` type
- Changes to `worker-protocol.ts` — add optional `overrides` to `RunSimulationMessage`
- Changes to `simulation.worker.ts` — merge overrides before calling physics functions
- Changes to `wind-solver.ts` and `snow-model.ts` — accept optional coefficients parameter
- Changes to `App.tsx` — render DevCoefficientPanel when dev mode active, pass Apply handler

## Out of Scope

- Live auto-re-run on slider change (future enhancement)
- Tuning coefficients during historical simulation playback (manual mode only for now)
- Persisting tuned values in localStorage
- Changing `LAYER_HEIGHTS` or `DEFAULT_CELL_SIZE` at runtime
