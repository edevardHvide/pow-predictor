# Alpine Wind — Claude Code Guide

## Project Overview

3D wind flow simulator for alpine terrain. Models how wind moves through mountains and predicts snow accumulation patterns. Uses CesiumJS for terrain visualization with real-world elevation data.

**Goal:** Help users find the best powder snow by simulating wind-driven snow transport and deposition.

**Repo:** https://github.com/edevardHvide/alpine-wind

## Architecture

Single-page React app running locally (no backend, no cloud):

- **CesiumJS** — 3D globe with real terrain tiles (Cesium Ion free tier)
- **Wind Solver** — Mass-conserving diagnostic wind model (grid-based, Gauss-Seidel relaxation)
- **Snow Model** — Mass-conserving redistribution with 30cm base snowfall
- **Wind Canvas Layer** — Custom 2D canvas overlay with 6000 particles, Windy.com-style flowing trails
- **Snow Overlay** — Canvas texture draped on terrain via SingleTileImageryProvider

## Tech Stack

- **Frontend:** React 19, TypeScript 5.9, Vite 8, Tailwind CSS 4
- **3D:** CesiumJS 1.139 + vite-plugin-cesium
- **Runs locally** — `npm run dev` on http://localhost:5173

## Project Structure

```
src/
  components/        CesiumViewer, ControlPanel, WindCompass, SnowLegend, RegionSelector
  simulation/        wind-solver, snow-model, terrain-sampler, regions
  rendering/         wind-layer-adapter, snow-overlay, color-scales
  hooks/             useCesium, useSimulation, useAnimationLoop
  utils/             geo, math
  types/             wind, terrain, snow
```

## Key Files

| File | Purpose |
|------|---------|
| `src/simulation/wind-solver.ts` | Core wind field computation — 2-layer mass-conserving diagnostic model |
| `src/simulation/terrain-sampler.ts` | Samples 75m elevation grid from CesiumJS terrain provider |
| `src/simulation/snow-model.ts` | Mass-conserving snow redistribution (30cm base, wind scouring + lee deposition) |
| `src/rendering/wind-layer-adapter.ts` | Custom Windy-style canvas particle overlay (6000 particles, bilinear interpolation) |
| `src/rendering/snow-overlay.ts` | Canvas texture overlay on terrain |
| `src/rendering/color-scales.ts` | Snow depth color mapping (cm-based, brown→white→blue→cyan) |
| `src/App.tsx` | Main wiring — auto-simulate on param change, wind layer lifecycle |

## Wind Solver Details

- **75m grid cells, 2 vertical layers** (10m, 50m AGL) — surface-focused for snow prediction
- Log-profile wind initialization
- Terrain effects: windward deceleration, lee-side shadows, ridge speed-up, valley channeling
- Gauss-Seidel mass conservation with **center-cell divergence absorption**
- Input speed is in **m/s** (0-30 range), direction in degrees (0=N, clockwise)

### IMPORTANT: Solver Stability

The solver was unstable with **neighbor-cell pressure corrections** at speeds > 4 m/s (velocities diverged to 10^24). Fixed by switching to **center-cell divergence absorption** — the divergence at each cell is absorbed into that cell's own velocity rather than distributed to neighbors. This is unconditionally stable. **Do not revert to neighbor-correction scheme.**

## Snow Model

Mass-conserving redistribution of 30cm base snowfall (two-pass algorithm):

**Pass 1 — Compute redistribution factors per cell:**
- Wind scouring: `1 - clamp(surfaceSpeed / 8.3, 0, 0.8)` — high wind removes up to 80%
- Lee deposition: `1 + clamp(cos(aspect - windDir), 0, 1) * 0.8` — up to 1.8x on lee sides
- Slope shedding: `1 - smoothstep(35, 55, slopeDeg) * 0.7` — steep slopes lose snow

**Pass 2 — Normalize for mass conservation:**
- Total snow = `snowfallCm * landCells`
- Scale all factors so the sum equals the target total
- Cap at 3x base snowfall

Snow depth is in **centimeters** (not normalized 0-1). Color scale: brown (0cm) → white (15cm) → blue (30cm) → cyan (powder zone).

Powder zones: -10 to -5C, 25-45 degree slope, lee-facing (cos > 0.3), wind < 8.3 m/s.

## Wind Particle Visualization

Custom 2D canvas overlay (`wind-layer-adapter.ts`), NOT cesium-wind-layer library:
- 6000 particles with bilinear wind velocity interpolation
- Bilinear terrain height interpolation for smooth mountain following
- Trail fading via `globalCompositeOperation: "destination-in"` + alpha fill
- `SceneTransforms.worldToWindowCoordinates` for 3D→screen projection
- Color gradient: cyan (calm) → yellow (moderate) → red (strong)
- Particles respawn when off-screen, below terrain, or max age reached

### Why not cesium-wind-layer?

The `cesium-wind-layer` npm package uses `Cesium.defaultValue` which was removed from public API in Cesium 1.139. Even with Vite transform plugins, the particles rendered invisible. Replaced with a custom canvas overlay that works reliably.

## Auto-Simulation

Parameters auto-trigger simulation via debounced `useEffect` (150ms delay). A key guard (`prevKey` ref) prevents infinite re-render loops — the key encodes direction + speed + temperature.

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

## IMPORTANT: CesiumJS Gotchas

- `SingleTileImageryProvider` requires async `fromUrl()` factory (Cesium 1.104+). The old constructor silently fails.
- CesiumJS conflicts with React StrictMode (double-mount destroys viewer during async terrain load). Use non-StrictMode.
- `createWorldTerrainAsync()` is async — guard against component unmount with a `destroyed` flag before using the resolved provider.

## Water Masking

Terrain height < 40m treated as water/shore (transparent in snow overlay, no particle spawning). Norwegian fjords report positive heights for shallow coastal areas, so threshold must be >30m.

## Terrain Grid Resolution

- **75m cell size** is the current setting (~82K cells for typical region)
- 10m was too heavy (~4.6M cells, browser overloaded)
- 30m also overloaded (~500K cells)
- Don't go below 50m without testing performance
