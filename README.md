# Alpine Wind

3D wind flow simulator for alpine terrain. Models how different wind directions move through mountains and predicts where snow accumulates — helping you find the best powder.

## Features

- **3D Terrain** — Real-world elevation data via CesiumJS (Lofoten, Lyngen Alps, Narvik)
- **Wind Simulation** — Mass-conserving diagnostic wind model with terrain effects (ridge speed-up, lee-side shadows, valley channeling)
- **Snow Accumulation** — Mass-conserving redistribution model with 30cm base snowfall. Wind scours windward faces and deposits on lee sides, preserving total snow mass.
- **Windy-Style Animation** — 6000 GPU-accelerated particle trails flowing through terrain with bilinear interpolation, color-coded by speed (cyan to red)
- **Interactive Controls** — Wind direction compass, speed slider (0-30 m/s), temperature (-20 to +5 C), auto-simulate on parameter change
- **Powder Zone Detection** — Highlights prime powder spots (cold dry snow + skiable slopes + wind-loaded lee sides)

## Quick Start

```bash
# Clone and install
git clone https://github.com/edevardHvide/alpine-wind.git
cd alpine-wind
npm install

# Set up Cesium Ion token (free at https://ion.cesium.com/tokens)
cp .env.example .env
# Edit .env and add your token

# Run
npm run dev
```

Open http://localhost:5173, wait for terrain to load. The simulation runs automatically when you change wind parameters.

## How It Works

### Wind Model
A simplified diagnostic wind model (similar to WindNinja) that:
1. Initializes a uniform wind field with logarithmic vertical profile
2. Applies terrain interaction rules (windward deceleration, lee-side shadows, ridge speed-up)
3. Iteratively enforces mass conservation using center-cell divergence absorption (Gauss-Seidel relaxation)
4. Operates at 2 layers: 10m and 50m above ground level (surface-focused for snow prediction)

### Snow Model
Mass-conserving redistribution of a 30cm base snowfall:
- **Wind scouring** — High surface wind removes snow (up to 80% reduction)
- **Lee-side deposition** — Slopes sheltered from wind accumulate drifted snow (up to 1.8x multiplier)
- **Slope shedding** — Steep slopes (>35 degrees) lose snow
- **Mass conservation** — Total snow is preserved during redistribution (normalized in a second pass)
- **Powder zones** — Flagged where temperature is -10 to -5C, slope is 25-45 degrees, lee-facing, and not wind-scoured

### Visualization
- **Wind particles** — 6000 particles with Windy.com-style flowing trails, bilinear wind and terrain height interpolation, trail fading via canvas compositing
- **Snow overlay** — Color-coded canvas texture draped on terrain (brown = scoured, white = base depth, blue = deep accumulation, cyan = powder zone)

## Tech Stack

- React 19 + TypeScript + Vite 8 + Tailwind CSS 4
- CesiumJS 1.139 (3D globe + terrain)
- No backend — all simulation runs client-side

## License

MIT
