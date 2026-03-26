# Pow Predictor — Claude Code Guide

## Project Overview

3D snow redistribution simulator for alpine terrain. Models how wind transports snow through mountains — scouring ridges and depositing on lee slopes — to predict where powder accumulates after storms.

**Goal:** Help users find the best powder snow by simulating wind-driven snow transport and deposition.

**Repo:** https://github.com/edevardHvide/pow-predictor

## Architecture

Single-page React app with Web Worker computation (no backend for simulation):

- **CesiumJS** — 3D globe with real terrain tiles (Cesium Ion free tier)
- **Web Worker** — All simulation runs off main thread (`simulation.worker.ts`)
- **Wind Solver** — Mass-conserving diagnostic wind model with Winstral Sx terrain exposure
- **Snow Model** — 2D saltation advection with Pomeroy-Gray physics
- **Historical Simulation** — 12-day weather from NVE API (7 days history + 5 days forecast)
- **Spatial Weather** — 9-station 3×3 grid with IDW interpolation, lapse rate, orographic precip
- **Wind Canvas Layer** — Custom 2D canvas overlay (6000 desktop / 2000 mobile particles)
- **Snow Overlay** — `SnowOverlayManager` class with double-buffered imagery layers and crossfade

## Tech Stack

- **Frontend:** React 19, TypeScript 5.9, Vite 8, Tailwind CSS 4
- **3D:** CesiumJS 1.139 + vite-plugin-cesium
- **Weather API:** NVE GridTimeSeries (proxied through Vite dev server to avoid CORS)
- **Observations:** RegObs v5/Search API (snow observations, avalanche reports)
- **Search:** Kartverket Stedsnavn API (all place types in Norway)
- **Runs locally** — `npm run dev` on http://localhost:5173

## Project Structure

```
src/
  components/        CesiumViewer, ControlPanel, WindCompass, SnowLegend,
                     TimelineBar, PlaceSearch, SnowDepthTooltip, MapCompass,
                     ScaleBar, WelcomePage
  simulation/        wind-solver, snow-model, terrain-sampler, terrain-processing,
                     regions, historical-sim, simulation.worker, worker-protocol
  rendering/         wind-layer-adapter, snow-overlay, color-scales
  hooks/             useCesium, useSimulation, useHistoricalSim, useAnimationLoop
  api/               nve (weather), kartverket (place search)
  utils/             geo, math, device
  types/             wind, terrain, snow
```

## Key Files

| File | Purpose |
|------|---------|
| `src/simulation/wind-solver.ts` | Wind field computation with Winstral Sx exposure, 2-layer mass conservation |
| `src/simulation/snow-model.ts` | 2D saltation advection with Pomeroy-Gray flux, fetch-limited erosion, sublimation |
| `src/simulation/historical-sim.ts` | Time-stepped simulation using NVE weather data, wind field caching |
| `src/simulation/terrain-sampler.ts` | Samples elevation grid via Cesium API (75m desktop / 120m mobile) |
| `src/simulation/terrain-processing.ts` | Pure terrain math (derivatives, Sx sectors) — imported by worker |
| `src/simulation/simulation.worker.ts` | Web Worker — runs wind solver, snow model, historical sim off main thread |
| `src/simulation/worker-protocol.ts` | Typed message definitions for main↔worker communication |
| `src/rendering/wind-layer-adapter.ts` | Custom Windy-style canvas particle overlay (6000 particles) |
| `src/rendering/snow-overlay.ts` | Canvas texture overlay on terrain (manual + historical color modes) |
| `src/rendering/color-scales.ts` | Snow depth color mapping — brown/white/blue (manual), blue gradient (historical) |
| `src/api/nve.ts` | NVE GridTimeSeries API client with UTM33 conversion |
| `src/hooks/useSimulation.ts` | Worker-based simulation hook — creates worker, sends/receives messages |
| `src/hooks/useHistoricalSim.ts` | Historical sim hook — silent background mode, reveal(), worker communication |
| `src/utils/device.ts` | Mobile detection (narrow screen AND touch) + adaptive constants |
| `src/App.tsx` | Main wiring — auto-simulate, background prefetch+precompute, depth probe |
| `src/components/WelcomePage.tsx` | Welcome modal — app overview, usage guide, session-dismissable |

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

## Spatial Weather & Downscaling

Weather is fetched from a 3×3 grid of NVE stations (9 points) across the terrain bounding box, then downscaled to the 75m terrain grid:

- **IDW interpolation:** Inverse-distance-weighted blending from 9 stations per grid cell
- **Lapse rate correction:** -6.5°C per 1000m elevation difference between terrain cell and IDW-weighted station altitude. This means valleys can get rain while peaks get snow at the same timestep.
- **Orographic precipitation:** +8% per 100m above reference altitude (higher terrain gets more precip)
- **Wind:** Domain-average across stations (terrain effects from wind solver already handle spatial variation)

### IMPORTANT: Per-cell temperature check

When passing per-cell snowfall arrays to `computeSnowAccumulation`, the global `params.temperature > 1` early return MUST be bypassed. The per-cell filtering already handles temperature (cells with temp > 0 get snowfall = 0). The global check would kill all snow when domain-average is above freezing, even if high-altitude cells are below freezing.

## Snow Overlay Rendering

`SnowOverlayManager` class in `snow-overlay.ts` handles smooth transitions:

- **Double-buffering:** New imagery layer is added BEFORE old one is removed (no gap/blink)
- **Crossfade:** 300ms cubic ease-out alpha transition between old and new layers
- **Frame interpolation:** During adjacent-step playback, snow depth is lerped over 250ms via `renderInterpolated()`
- **Scrubbing:** Non-adjacent jumps use instant crossfade (no interpolation delay)
- **Render generation counter:** `renderGen` increments per render call; stale async renders are discarded after `fromUrl()` resolves
- **Deferred removal:** `renderInterpolated()` defers old layer removal by 1 frame via `requestAnimationFrame` so Cesium composites the new tile first
- **Stable color stats:** `computeColorStats()` precomputes mean/spread from the TARGET step once per transition, passed to all interpolation frames to prevent color shimmer

### IMPORTANT: Cesium imagery layer lifecycle

Never call `removeSnowOverlay` before the new layer is ready. The async `SingleTileImageryProvider.fromUrl()` creates a gap between remove and add, causing visible blinking. Always add-then-remove (double-buffer pattern).

### IMPORTANT: Async renders in RAF loops

`renderInterpolated()` is async (awaits `SingleTileImageryProvider.fromUrl()`). The RAF animation loop MUST `await` each call before scheduling the next frame. Without this, multiple overlapping async renders race and resolve out-of-order, adding/removing Cesium layers chaotically and causing flicker.

## Historical Simulation Mode

User flow: Search mountain → terrain loads + weather prefetch + background sim auto-starts → click "Run Pow Simulation" → confirm → instant (or near-instant) timeline playback.

### Key Implementation Details

- **Background precompute:** When a mountain is selected, weather prefetch starts immediately. Once both weather data AND worker terrain are ready, the full historical sim runs silently in the Web Worker. By the time user clicks Confirm, results are usually already cached.
- **Three-tier confirm:** `handleConfirmSelection` checks: (1) sim done → instant entry, (2) sim running → `reveal()` shows progress mid-flight, (3) nothing started → full flow fallback.
- **Silent/reveal pattern:** `useHistoricalSim.run(weather, { silent: true })` runs without UI feedback. `reveal()` transitions to showing progress if the user catches up before the sim finishes.
- **Wind field caching:** Re-solve only when direction changes >15 degrees or speed >2 m/s. Reduces ~337 solves to ~30.
- **Sub-stepping:** 4 sub-steps per 3h interval = 45-minute resolution. Interpolates weather between data points.
- **Click guard:** `confirmDialogRef` (a ref, not state) prevents Cesium click-through when confirm dialog is open. Refs update synchronously, state doesn't.

### IMPORTANT: Shared Buffer Cloning

`historical-sim.ts` caches and reuses `WindField` objects across steps when wind hasn't changed. Before transferring buffers from worker to main thread, shared wind field buffers MUST be cloned — otherwise earlier steps get detached arrays. See the `seen` Set pattern in `simulation.worker.ts`.

## Snow Depth Probe

In simulation mode, clicking the map shows a tooltip with predicted snow depth. The lat/lng is converted to grid row/col using the terrain bbox, then depth is read from `historicalSteps[currentStep].snowGrid.depth[gi]`. Tooltip auto-clears when timeline step changes.

## Wind Particle Visualization

Custom 2D canvas overlay (`wind-layer-adapter.ts`), NOT cesium-wind-layer library:
- 6000 particles desktop / 2000 particles mobile (configurable via constructor)
- Bilinear wind velocity interpolation
- Trail fading via `globalCompositeOperation: "destination-in"` + alpha fill
- Color gradient: cyan (calm) → yellow (moderate) → red (strong)

### Why not cesium-wind-layer?

The `cesium-wind-layer` npm package uses `Cesium.defaultValue` removed from public API in Cesium 1.139. Replaced with custom canvas overlay.

## RegObs API (v5/Search)

Field observations (snow surface, avalanche activity, danger signs, weather) fetched from RegObs.

### IMPORTANT: v5/Search does NOT support lat/lng geo-filtering

The `Latitude`, `Longitude`, and `Radius` fields in the request body are **silently ignored**. The API returns results from all of Norway regardless. Use `SelectedRegions` with NVE forecast region IDs instead (e.g., `3010` = Lyngen). The `findRegionIds()` function in `regobs.ts` maps lat/lng to the nearest region(s).

### IMPORTANT: v5 response structure

The v5 response uses **top-level fields** per observation type, NOT `Registrations[].FullObject`:
- `SnowSurfaceObservation` — surface type, drift name
- `WeatherObservation` — temp, precip, wind, cloud cover
- `AvalancheEvaluation3` — danger level, evaluation text, development
- `AvalancheObs` — single avalanche event (size, trigger, type)
- `AvalancheActivityObs2[]` — multiple observed avalanche events
- `DangerObs[]` — danger sign observations
- `GeneralObservation` — free-text notes
- `Observer.CompetenceLevelTID` (not `CompetencyLevel`)

### Key region IDs

| ID | Region | Approx center |
|----|--------|---------------|
| 3010 | Lyngen | 69.6°N, 20.1°E |
| 3011 | Tromsø | 69.6°N, 19.0°E |
| 3014 | Lofoten og Vesterålen | 68.3°N, 15.0°E |
| 3015 | Ofoten | 68.4°N, 17.0°E |

Full list in `FORECAST_REGIONS` array in `src/api/regobs.ts`.

## Powder Zone Detection

Powder survives where: cold (<-2C), low wind (<70% of threshold), sheltered terrain (positive Sx), NOT wind-loaded (depth < 1.15x base). Wind-deposited lee slopes are dense **wind slab**, not powder. This is the inverted logic from the original implementation which incorrectly marked lee deposition as powder.

## Mobile Layout

Responsive design using Tailwind `md:` breakpoint (768px):

- **ControlPanel** — Slide-in drawer from left on mobile (hamburger toggle top-left). Full fixed panel on desktop. Auto-closes on mountain select and sim start.
- **TimelineBar** — Two-row stacked layout on mobile (controls + scrubber top, weather info below). Single row on desktop. Safe area padding for notched devices.
- **SnowLegend** — Positioned at `bottom-20` on mobile to avoid timeline overlap, `bottom-4` on desktop.
- **MapCompass** — Smaller on mobile (`w-11 h-11` vs `w-14 h-14`).
- **Range sliders** — Larger touch targets on mobile (20px thumbs vs 14px).
- **WelcomePage** — Scrollable with tighter spacing on small screens.

## Map Compass

`MapCompass` component reads `viewer.camera.heading` via `requestAnimationFrame` loop. The viewer must be passed as state (not ref) to trigger React rendering. Clicking snaps to north via `camera.flyTo` with 0.5s duration.

## Environment Variables

- `VITE_CESIUM_ION_TOKEN` — Free token from https://ion.cesium.com/tokens

## IMPORTANT: CesiumJS Gotchas

- `SingleTileImageryProvider` requires async `fromUrl()` factory (Cesium 1.104+). Old constructor silently fails.
- CesiumJS conflicts with React StrictMode (double-mount destroys viewer). Use non-StrictMode.
- `createWorldTerrainAsync()` is async — guard against unmount with `destroyed` flag.
- To pass Cesium viewer to React components that need re-renders (e.g. compass), store it in state AND ref. Ref alone won't trigger re-render.
- Cesium labels: use native font size at `scale: 1.0`. Large font + small scale (e.g. `52px` at `scale: 0.25`) renders blurry because Cesium rasterizes the text then downscales the bitmap.
- **Camera centering:** Use `camera.flyToBoundingSphere` (not `camera.flyTo`) when flying to a target point. `flyTo` positions the camera and looks in a fixed direction — the target drifts off-center with varying terrain heights. `flyToBoundingSphere` centers the target in the viewport.

## Water Masking

Terrain height < 40m = water/shore (transparent in snow overlay, no particles). Norwegian fjords report positive heights for shallow coastal areas, threshold must be >30m.

## Terrain Grid Resolution

- **75m cell size** on desktop (~82K cells), **120m on mobile** (~32K cells) — adaptive via `device.ts`
- Don't go below 50m without testing performance (30m = ~500K cells, overloaded browser)
- Sx precomputation adds ~8 sector grids on load — still fast at 75m
- Mobile detection uses AND logic: narrow screen (<768px) AND touch capability. OR would wrongly detect touchscreen laptops.

## Web Worker Architecture

- **Worker file:** `simulation.worker.ts` — imports existing pure functions unchanged
- **Protocol:** `worker-protocol.ts` — typed discriminated union messages
- **Terrain data:** Sent to worker via structured clone (NOT transfer) because main thread still needs heights for rendering
- **Terrain processing:** `terrain-processing.ts` extracts pure math (derivatives, Sx) from `terrain-sampler.ts` so the worker doesn't import Cesium
- **`historical-sim.ts` is unchanged** — its `yieldToUI` calls are harmless in worker context (~120ms overhead, acceptable)
- **Cancel support:** `cancel` message type + `cancelled` flag checked in progress callback

## Infrastructure (OpenTofu)

All AWS resources are codified in `infra/` and managed with OpenTofu:

- **S3:** `pow-predictor-frontend` (static assets, public access blocked, CloudFront OAC)
- **CloudFront:** Distribution `E1FX2FUC1H43O2` with SPA error routing (403/404 → index.html)
- **Lambda:** `pow-predictor-nve-proxy` (Python 3.11, proxies NVE API to avoid CORS)
- **Lambda:** `pow-predictor-conditions-summary` (Python 3.11, calls Claude Haiku for RegObs analysis)
- **API Gateway v2:** HTTP API with `GET /api/nve/{proxy+}` and `POST /api/conditions-summary` routes
- **IAM:** Scoped deploy user `pow-predictor` (S3, CloudFront, Lambda, CloudWatch only)
- **State:** `s3://pow-predictor-tfstate` (versioned)

**Two AWS profiles:**
- `tennis-bot` — admin, runs `tofu plan/apply` (infra changes) and Lambda code deploys
- `pow-predictor` — scoped, runs S3/CloudFront deploys (`/deploy` skill)

### IMPORTANT: Lambda deploys require `tennis-bot` profile

The `pow-predictor` IAM user does NOT have `lambda:UpdateFunctionCode` permission. Use `tennis-bot` profile when deploying Lambda code changes:
```bash
aws lambda update-function-code --function-name pow-predictor-conditions-summary \
  --zip-file fileb://path/to/zip --profile tennis-bot --region eu-north-1
```
**WARNING:** Each Lambda is a separate zip — do NOT deploy `conditions_summary.py` to the NVE proxy function or vice versa. This will break weather fetching in production.

```bash
cd infra
tofu init            # First time setup
tofu plan            # Preview changes
tofu apply           # Apply changes
```

## Key Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Production build
npx tsc --noEmit     # Type check
npx playwright test  # E2E smoke tests (headless Chromium)
```
