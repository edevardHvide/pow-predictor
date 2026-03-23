# Alpine Wind — Claude Code Guide

## Project Overview

3D wind flow simulator for alpine terrain. Models how wind moves through mountains and predicts snow accumulation patterns. Uses CesiumJS for terrain visualization with real-world elevation data.

**Goal:** Help users find the best powder snow by simulating wind-driven snow transport and deposition.

**Repo:** https://github.com/edevardHvide/alpine-wind

## Architecture

Single-page React app running locally (no backend, no cloud):

- **CesiumJS** — 3D globe with real terrain tiles (Cesium Ion free tier)
- **Wind Solver** — Mass-conserving diagnostic wind model (grid-based, iterative relaxation)
- **Snow Model** — 5-factor heuristic: wind speed, lee deposition, slope, elevation, temperature
- **Particle System** — 800 particles advected through wind field, rendered as colored points
- **Snow Overlay** — Canvas texture draped on terrain via SingleTileImageryProvider

## Tech Stack

- **Frontend:** React 19, TypeScript 5.9, Vite 8, Tailwind CSS 4
- **3D:** CesiumJS 1.139 + vite-plugin-cesium
- **Runs locally** — `npm run dev` on http://localhost:5173

## Project Structure

```
src/
  components/        CesiumViewer, ControlPanel, WindCompass, SnowLegend, RegionSelector
  simulation/        wind-solver, snow-model, wind-particles, terrain-sampler, regions
  rendering/         wind-renderer, snow-overlay, color-scales
  hooks/             useCesium, useSimulation, useAnimationLoop
  utils/             geo, math
  types/             wind, terrain, snow
```

## Key Files

| File | Purpose |
|------|---------|
| `src/simulation/wind-solver.ts` | Core wind field computation — mass-conserving diagnostic model |
| `src/simulation/terrain-sampler.ts` | Samples elevation grid from CesiumJS terrain provider |
| `src/simulation/snow-model.ts` | Snow accumulation heuristic scoring |
| `src/simulation/wind-particles.ts` | Particle advection through wind field |
| `src/rendering/wind-renderer.ts` | PointPrimitiveCollection rendering |
| `src/rendering/snow-overlay.ts` | Canvas texture overlay on terrain |

## Wind Solver Details

- 100m grid cells, 5 vertical layers (10m, 50m, 150m, 300m, 500m AGL)
- Log-profile wind initialization
- Terrain effects: windward deceleration, lee-side shadows, ridge speed-up, valley channeling
- Gauss-Seidel mass conservation (center-cell correction for stability)
- Input speed is in **m/s** (0-30 range), direction in degrees (0=N, clockwise)
- **Stability note:** The solver was unstable with neighbor-cell corrections at speeds > 4 m/s. Fixed by switching to center-cell divergence absorption. Do not revert to neighbor-correction scheme.

## Snow Model

5-factor weighted heuristic per grid cell:
- Wind speed at surface (35%) — low wind = snow stays
- Lee-side deposition (30%) — sheltered slopes accumulate
- Slope angle (15%) — steep slopes shed snow
- Elevation band (10%) — mid-upper elevations best
- Temperature (10%) — cold = dry transportable, warm = sticky

Powder zones flagged where: -10 to -5C, 25-45 degree slope, high lee score.

## Environment Variables

- `VITE_CESIUM_ION_TOKEN` — Free token from https://ion.cesium.com/tokens

## Key Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Production build
npx tsc --noEmit     # Type check
```

## Regions

Currently configured: Lofoten, Lyngen Alps, Narvik/Narvikfjellet (Norwegian alpine regions).

## IMPORTANT: CesiumJS API Notes

- `SingleTileImageryProvider` requires async `fromUrl()` factory (Cesium 1.104+). The old constructor silently fails.
- `PointPrimitiveCollection` needs `disableDepthTestDistance: Number.POSITIVE_INFINITY` to render above terrain.
- `createWorldTerrainAsync()` is async — guard against component unmount before it resolves.
- CesiumJS conflicts with React StrictMode (double-mount destroys viewer). Use non-StrictMode.

## Water Masking

Terrain height < 40m treated as water/shore (transparent in snow overlay, no particle spawning). Norwegian fjords report positive heights for shallow coastal areas, so threshold must be >30m.
