# Pow Predictor

3D snow redistribution simulator for alpine terrain. Models how wind transports snow through mountains — scouring ridges and depositing on lee slopes — to predict where powder accumulates after storms.

## Features

- **3D Terrain** -- Real elevation data via CesiumJS with mountain search across Norway
- **Manual Mode** -- Set wind direction, speed, and temperature to instantly see predicted snow redistribution
- **Simulation Mode** -- Fetches 12 days of real weather data (7 days history + 5 days forecast) from NVE and steps through a time-evolving snow simulation
- **Snow Depth Probe** -- Click any point on the map in simulation mode to see predicted snow depth
- **Wind Animation** -- 6000 GPU-accelerated particle trails flowing through terrain, color-coded by speed
- **Powder Zone Detection** -- Highlights where uncompacted powder survives (sheltered, low-wind, cold areas)

## Physics Model

### Wind Field Solver

A simplified diagnostic wind model inspired by WindNinja:

1. **Initialization** -- Uniform wind field with logarithmic vertical profile (`z0 = 0.03m` roughness, reference height 50m)
2. **Terrain interaction** -- Windward deceleration, lee-side flow separation, and ridge speed-up (up to 2.0x for steep Norwegian alpine terrain)
3. **Mass conservation** -- Iterative Gauss-Seidel relaxation of the divergence equation across 2 layers (10m and 50m AGL)
4. **Terrain exposure** -- Winstral Sx parameter (maximum upwind shelter angle over 300m search distance) determines which cells are exposed ridges vs sheltered valleys. Precomputed for 8 azimuth sectors on terrain load, interpolated per wind direction at runtime.

### Snow Redistribution (2D Saltation Advection)

Snow redistribution uses a physically-based advection model rather than simple per-cell factors. Snow is physically transported downwind from ridges to lee slopes:

1. **Erosion** -- Pomeroy-Gray saltation flux `Q ~ u*(u*^2 - u*_th^2)` gives cubic/quartic scaling with wind speed. At 15 m/s, erosion is roughly 8x that at 7 m/s (a linear model would predict only 2x).

2. **Temperature-dependent thresholds** -- Based on Li & Pomeroy (1997). Fresh dry powder at -15C starts moving at ~4 m/s wind; wet snow near 0C resists transport until ~15 m/s. This means the same wind speed produces dramatically different redistribution patterns depending on temperature.

3. **Fetch-limited erosion** -- Erosion only occurs when current saltation transport is below the equilibrium capacity. A 500m exposed plateau erodes far more snow than a narrow 50m ridge crest, because transport saturates on short fetches.

4. **Advection** -- First-order upwind finite-difference scheme moves saltation mass downwind through the grid. Snow scoured from a ridge explicitly deposits on the lee slope behind it.

5. **Deposition** -- Controlled by Winstral Sx: cells with positive Sx (upwind terrain is higher = sheltered) capture a fraction of passing transport mass.

6. **Sublimation** -- 2-5% of airborne snow sublimates per advection iteration (15-25% total loss at moderate wind). This is physically correct -- blowing snow events are net-loss events for the snowpack.

7. **Slope shedding** -- Slopes steeper than 40 degrees shed excess snow due to gravity.

### Simulation Mode (Historical Weather)

In simulation mode, real weather data from NVE (Norwegian Water Resources and Energy Directorate) drives a time-stepped simulation:

- **Weather data** -- 3-hourly precipitation, temperature, wind speed, and wind direction from NVE's GridTimeSeries API
- **Sub-stepping** -- 4 sub-steps per 3-hour interval (45-minute resolution) with interpolated weather for smooth playback
- **Accumulation** -- Each sub-step runs the full advection model on that period's snowfall
- **Melt** -- Degree-day melt model (`0.5 mm/C/3h`) plus rain-on-snow melt factor
- **Wind field caching** -- Wind solver only re-runs when direction changes >15 degrees or speed >2 m/s

### Simplifications and Limitations

This is a browser-based educational tool, not a forecasting system. Key simplifications:

- **No suspension transport** -- Only saltation (snow bouncing along the surface) is modeled. In reality, above ~15 m/s, snow is suspended to 100m+ height and transported kilometers. This means the model underestimates long-range transport in extreme winds.
- **No snow microstructure** -- Snow is a single uniform layer with no density, grain type, or bonding information. Real snowpacks have complex layered stratigraphy that affects transport thresholds. Full models like SNOWPACK track this per-layer.
- **Simplified wind solver** -- The diagnostic wind model uses terrain-following adjustments rather than solving the full Navier-Stokes equations. A variational solver (WindNinja, NUATMOS) would give more accurate wind fields, especially in complex terrain with recirculation zones.
- **Fixed grid resolution** -- 75m cells. Real snow redistribution features can be smaller than this (cornices, sastrugi, small gullies). Research models like Alpine3D operate at 25-50m.
- **No vegetation** -- Forest canopy intercepts snow and reduces wind speed near the surface. The model treats all terrain as bare.
- **No avalanche dynamics** -- Slope shedding is a simple threshold, not a physically-based avalanche model.
- **2D advection only** -- Transport is horizontal. Vertical recirculation in lee eddies (which creates cornices) is not captured.
- **Lookup-table thresholds** -- The Li & Pomeroy temperature thresholds are a 4-bin lookup rather than a continuous function of snow surface temperature and grain properties.

### References

- Pomeroy, J.W. & Gray, D.M. (1990). Saltation of snow. *Water Resources Research*, 26(7), 1583-1594.
- Li, L. & Pomeroy, J.W. (1997). Estimates of threshold wind speeds for snow transport. *Journal of Applied Meteorology*, 36(3), 205-213.
- Winstral, A., Elder, K. & Davis, R.E. (2002). Spatial snow modeling of wind-redistributed snow using terrain-based parameters. *Journal of Hydrometeorology*, 3(5), 524-538.
- Lehning, M. et al. (2008). Inhomogeneous precipitation distribution and snow transport in steep terrain. *Water Resources Research*, 44(7).

## Running Locally

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or newer
- A free Cesium Ion token (for 3D terrain data)

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/edevardHvide/alpine-wind.git
cd alpine-wind

# 2. Install dependencies
npm install

# 3. Get a Cesium Ion token
#    Go to https://ion.cesium.com/tokens and create a free account.
#    Copy your default access token.

# 4. Create your .env file
cp .env.example .env
#    Open .env and replace "your_token_here" with your Cesium Ion token.

# 5. Start the development server
npm run dev
```

Open http://localhost:5173 in your browser. Wait a few seconds for the 3D terrain to load.

### Usage

- **Manual mode** -- Use the wind compass to set direction and the slider to set wind speed. Snow redistribution updates automatically.
- **Simulation mode** -- Click "Simulation Mode (12 days)", then click a point on the map or search for a mountain. Confirm the location to fetch real weather data and run the simulation. Use the timeline bar to scrub through time.
- **Snow depth probe** -- In simulation mode, click any point on the map to see the predicted snow depth at that location.
- **Search** -- Type a mountain name in the search box to fly to it (uses Kartverket API).

### Building for Production

```bash
npm run build    # outputs to dist/
npm run preview  # preview the production build locally
```

## Tech Stack

- React 19, TypeScript 5.9, Vite 8, Tailwind CSS 4
- CesiumJS 1.139 (3D globe and terrain)
- NVE GridTimeSeries API (weather data, proxied through Vite dev server)
- Kartverket Stedsnavn API (mountain search)
- No backend -- all simulation runs client-side in the browser

## License

MIT
