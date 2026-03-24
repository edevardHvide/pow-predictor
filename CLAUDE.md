# Pow Predictor — Claude Code Guide

## Project Overview

3D snow redistribution simulator for alpine terrain. Models how wind transports snow through mountains — scouring ridges and depositing on lee slopes — to predict where powder accumulates after storms.

**Goal:** Help users find the best powder snow by simulating wind-driven snow transport and deposition.

**Repo:** https://github.com/edevardHvide/alpine-wind

## Architecture

Single-page React app running locally (no backend, no cloud):

- **CesiumJS** — 3D globe with real terrain tiles (Cesium Ion free tier)
- **Wind Solver** — Mass-conserving diagnostic wind model with Winstral Sx terrain exposure
- **Snow Model** — 2D saltation advection with Pomeroy-Gray physics
- **Historical Simulation** — 12-day weather from NVE API (7 days history + 5 days forecast)
- **Wind Canvas Layer** — Custom 2D canvas overlay with 6000 particles, Windy.com-style flowing trails
- **Snow Overlay** — Canvas texture draped on terrain via SingleTileImageryProvider

## Tech Stack

- **Frontend:** React 19, TypeScript 5.9, Vite 8, Tailwind CSS 4
- **3D:** CesiumJS 1.139 + vite-plugin-cesium
- **Weather API:** NVE GridTimeSeries (proxied through Vite dev server to avoid CORS)
- **Search:** Kartverket Stedsnavn API (mountain search)
- **Runs locally** — `npm run dev` on http://localhost:5173

## Project Structure

```
src/
  components/        CesiumViewer, ControlPanel, WindCompass, SnowLegend,
                     TimelineBar, MountainSearch, SnowDepthTooltip, MapCompass
  simulation/        wind-solver, snow-model, terrain-sampler, regions, historical-sim
  rendering/         wind-layer-adapter, snow-overlay, color-scales
  hooks/             useCesium, useSimulation, useAnimationLoop
  api/               nve (weather), kartverket (mountain search)
  utils/             geo, math
  types/             wind, terrain, snow
```

## Key Files

| File | Purpose |
|------|---------|
| `src/simulation/wind-solver.ts` | Wind field computation with Winstral Sx exposure, 2-layer mass conservation |
| `src/simulation/snow-model.ts` | 2D saltation advection with Pomeroy-Gray flux, fetch-limited erosion, sublimation |
| `src/simulation/historical-sim.ts` | Time-stepped simulation using NVE weather data, wind field caching |
| `src/simulation/terrain-sampler.ts` | Samples 75m elevation grid, precomputes Sx for 8 azimuth sectors |
| `src/rendering/wind-layer-adapter.ts` | Custom Windy-style canvas particle overlay (6000 particles) |
| `src/rendering/snow-overlay.ts` | Canvas texture overlay on terrain (manual + historical color modes) |
| `src/rendering/color-scales.ts` | Snow depth color mapping — brown/white/blue (manual), blue gradient (historical) |
| `src/api/nve.ts` | NVE GridTimeSeries API client with UTM33 conversion |
| `src/App.tsx` | Main wiring — auto-simulate, historical mode flow, depth probe |

## Snow Model — 2D Saltation Advection

The snow model uses physically-based advection, NOT simple per-cell factors. Snow physically moves downwind from ridges to lee slopes.

### Key Physics

- **Pomeroy-Gray saltation flux:** `Q ~ u*(u*^2 - u*_th^2)` — cubic/quartic scaling. At 15 m/s, erosion is ~8x that at 7 m/s. A linear model would only predict 2x.
- **Temperature-dependent thresholds (Li & Pomeroy 1997):** Fresh powder at -15C moves at 4 m/s; wet snow at 0C resists until 15 m/s.
- **Fetch-limited erosion:** `deficit = equilibrium - currentTransport`. Long fetches saturate; short ridges don't.
- **Sublimation:** 2-5% per iteration (15-25% total at moderate wind).
- **Von Karman drag:** `u* = surfaceSpeed * 0.04`

### Key Constants

```
KARMAN_DRAG_COEFF = 0.04
ADVECTION_ITERATIONS = 12
erosionScale = snowfallCm * 0.25 (max erosion per iteration at reference wind)
```

### IMPORTANT: Erosion Scaling

The raw Pomeroy flux is in physical units (tiny numbers). It MUST be normalized to [0,1] range using a reference max wind (30 m/s) and then scaled to meaningful cm values via `erosionScale`. Without this normalization, redistribution appears nearly uniform (depth range of 27-32cm instead of 2-58cm). This was a bug found during development.

## Wind Solver

- **75m grid cells, 2 vertical layers** (10m, 50m AGL)
- **Winstral Sx** — Maximum upwind shelter angle over 300m search distance. Positive = sheltered, negative = exposed ridge.
- **8 precomputed Sx sectors** — Computed on terrain load for each 45-degree azimuth. Interpolated between nearest 2 sectors per wind direction. This means Sx lookup is O(1) per wind solve, not O(n * searchDist).
- **Ridge speed-up** — Up to 2.0x (was 1.5x, increased for steep Norwegian alpine terrain)
- **Sx sign convention:** Positive = upwind terrain higher = cell is sheltered. Negative = cell is exposed ridge = speed up wind. This is INVERTED from the old `computeExposure` which used positive = exposed.
- Gauss-Seidel mass conservation with center-cell divergence absorption (unconditionally stable)

### IMPORTANT: Solver Stability

The solver was unstable with neighbor-cell pressure corrections at speeds > 4 m/s (velocities diverged to 10^24). Fixed by switching to center-cell divergence absorption. **Do not revert to neighbor-correction scheme.**

## Historical Simulation Mode

User flow: Click "Simulation Mode" → select point on map or search mountain → confirm → loading bar → timeline playback.

### Key Implementation Details

- **Silent prefetch trick:** API fetch starts when user picks a point (before confirm dialog). When user clicks Confirm, progress bar jumps to wherever the fetch already reached. Uses `showProgressRef` flag to control when `setLoadingProgress` is called.
- **Wind field caching:** Re-solve only when direction changes >15 degrees or speed >2 m/s. Reduces ~337 solves to ~30.
- **Async with UI yields:** `setTimeout(0)` every 5 wind solves keeps UI responsive during heavy computation.
- **Sub-stepping:** 4 sub-steps per 3h interval = 45-minute resolution. Interpolates weather between data points.
- **Click guard:** `confirmDialogRef` (a ref, not state) prevents Cesium click-through when confirm dialog is open. Refs update synchronously, state doesn't.

## Snow Depth Probe

In simulation mode, clicking the map shows a tooltip with predicted snow depth. The lat/lng is converted to grid row/col using the terrain bbox, then depth is read from `historicalSteps[currentStep].snowGrid.depth[gi]`. Tooltip auto-clears when timeline step changes.

## Wind Particle Visualization

Custom 2D canvas overlay (`wind-layer-adapter.ts`), NOT cesium-wind-layer library:
- 6000 particles with bilinear wind velocity interpolation
- Trail fading via `globalCompositeOperation: "destination-in"` + alpha fill
- Color gradient: cyan (calm) → yellow (moderate) → red (strong)

### Why not cesium-wind-layer?

The `cesium-wind-layer` npm package uses `Cesium.defaultValue` removed from public API in Cesium 1.139. Replaced with custom canvas overlay.

## Powder Zone Detection

Powder survives where: cold (<-2C), low wind (<70% of threshold), sheltered terrain (positive Sx), NOT wind-loaded (depth < 1.15x base). Wind-deposited lee slopes are dense **wind slab**, not powder. This is the inverted logic from the original implementation which incorrectly marked lee deposition as powder.

## Map Compass

`MapCompass` component reads `viewer.camera.heading` via `requestAnimationFrame` loop. The viewer must be passed as state (not ref) to trigger React rendering. Clicking snaps to north via `camera.flyTo` with 0.5s duration.

## Environment Variables

- `VITE_CESIUM_ION_TOKEN` — Free token from https://ion.cesium.com/tokens

## Key Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Production build
npx tsc --noEmit     # Type check
```

## IMPORTANT: CesiumJS Gotchas

- `SingleTileImageryProvider` requires async `fromUrl()` factory (Cesium 1.104+). Old constructor silently fails.
- CesiumJS conflicts with React StrictMode (double-mount destroys viewer). Use non-StrictMode.
- `createWorldTerrainAsync()` is async — guard against unmount with `destroyed` flag.
- To pass Cesium viewer to React components that need re-renders (e.g. compass), store it in state AND ref. Ref alone won't trigger re-render.

## Water Masking

Terrain height < 40m = water/shore (transparent in snow overlay, no particles). Norwegian fjords report positive heights for shallow coastal areas, threshold must be >30m.

## Terrain Grid Resolution

- **75m cell size** is the current setting (~82K cells for typical region)
- Don't go below 50m without testing performance (30m = ~500K cells, overloaded browser)
- Sx precomputation adds ~8 sector grids on load — still fast at 75m
