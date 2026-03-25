import { useState, useCallback, useRef, useEffect } from "react";
import CesiumViewer from "./components/CesiumViewer.tsx";
import CesiumErrorBoundary from "./components/CesiumErrorBoundary.tsx";
import ControlPanel from "./components/ControlPanel.tsx";
import SnowLegend from "./components/SnowLegend.tsx";
import SnowDepthTooltip from "./components/SnowDepthTooltip.tsx";
import MapCompass from "./components/MapCompass.tsx";
import ScaleBar from "./components/ScaleBar.tsx";
import TimelineBar from "./components/TimelineBar.tsx";
import WelcomePage from "./components/WelcomePage.tsx";
import { REGIONS, regionFromCoordinates } from "./simulation/regions.ts";
import type { PlaceResult } from "./api/kartverket.ts";
import { fetchSpatialWeather, type SpatialWeatherTimeSeries } from "./api/nve.ts";
import { useSimulation } from "./hooks/useSimulation.ts";
import { useHistoricalSim } from "./hooks/useHistoricalSim.ts";
import { renderSnowOverlay, removeSnowOverlay, SnowOverlayManager, computeColorStats } from "./rendering/snow-overlay.ts";
import { WindCanvasLayer } from "./rendering/wind-layer-adapter.ts";
import { isMobileDevice, MOBILE_PARTICLE_COUNT, DESKTOP_PARTICLE_COUNT } from "./utils/device.ts";
import type { WindParams } from "./types/wind.ts";
import type { Viewer } from "cesium";

export default function App() {
  const [region, setRegion] = useState(REGIONS[0]);
  const [params, setParams] = useState<WindParams>({
    direction: 270,
    speed: 8,
    temperature: -7,
  });
  const [showSnow, setShowSnow] = useState(true);
  const [showWind, setShowWind] = useState(true);
  const [terrainReady, setTerrainReady] = useState(false);

  // Historical mode state
  const [historicalMode, setHistoricalMode] = useState(false);

  // Point selection flow
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<{ lat: number; lng: number; name?: string } | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<{ stage: string; percent: number } | null>(null);

  // Last searched mountain (used as default simulation point)
  const [searchedMountain, setSearchedMountain] = useState<{ lat: number; lng: number; name: string } | null>(null);

  // Snow depth probe (click in simulation mode)
  const [depthProbe, setDepthProbe] = useState<{
    lat: number; lng: number; depthCm: number;
    screenX: number; screenY: number;
    temp?: number; precip?: number; windSpeed?: number; windDir?: number;
    elevation?: number;
  } | null>(null);

  const [cesiumViewer, setCesiumViewer] = useState<Viewer | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const windLayerRef = useRef<WindCanvasLayer | null>(null);
  const prefetchRef = useRef<Promise<SpatialWeatherTimeSeries> | null>(null);
  const snowOverlayRef = useRef<SnowOverlayManager | null>(null);
  const { state, setTerrain, runSimulation, clearSimulation, terrainRef, workerRef, workerReady } = useSimulation();
  const historicalSim = useHistoricalSim(workerRef);

  // Derive displayed progress: prefetch phase OR worker computation phase
  const displayProgress = historicalSim.progress ?? loadingProgress;

  const handleTerrainReady = useCallback(
    (grid: Parameters<typeof setTerrain>[0]) => {
      setTerrain(grid);
      prevKey.current = "";
      setTerrainReady(true);
    },
    [setTerrain],
  );

  // Clear overlays helper
  const clearOverlays = useCallback(() => {
    if (viewerRef.current) removeSnowOverlay(viewerRef.current);
    if (snowOverlayRef.current) {
      snowOverlayRef.current.destroy();
      snowOverlayRef.current = null;
    }
    lastRenderedStep.current = -1;
    if (windLayerRef.current && !windLayerRef.current.isDestroyed()) {
      windLayerRef.current.destroy();
      windLayerRef.current = null;
    }
  }, []);

  // Auto-simulate when params change (manual mode only)
  const prevKey = useRef("");
  useEffect(() => {
    if (!terrainReady || historicalMode) return;
    const key = `${params.direction}-${params.speed}-${params.temperature}`;
    if (key === prevKey.current) return;
    prevKey.current = key;
    const timer = setTimeout(() => runSimulation(params), 150);
    return () => clearTimeout(timer);
  }, [params.direction, params.speed, params.temperature, terrainReady, historicalMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Create/update wind layer when wind field changes (manual mode)
  useEffect(() => {
    if (historicalMode) return;
    const viewer = viewerRef.current;
    const terrain = terrainRef.current;
    if (!viewer || !state.windField || !terrain) return;

    if (windLayerRef.current && !windLayerRef.current.isDestroyed()) {
      windLayerRef.current.updateWindData(state.windField, terrain);
    } else {
      const particleCount = isMobileDevice() ? MOBILE_PARTICLE_COUNT : DESKTOP_PARTICLE_COUNT;
      windLayerRef.current = new WindCanvasLayer(viewer, state.windField, terrain, particleCount);
    }
    windLayerRef.current.show = showWind;
  }, [state.windField, historicalMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup wind layer on unmount only
  useEffect(() => {
    return () => {
      if (windLayerRef.current && !windLayerRef.current.isDestroyed()) {
        windLayerRef.current.destroy();
      }
    };
  }, []);

  // Snow overlay (manual mode)
  useEffect(() => {
    if (historicalMode) return;
    const viewer = viewerRef.current;
    if (!viewer || !state.snowGrid) return;
    if (showSnow && terrainRef.current) {
      renderSnowOverlay(viewer, state.snowGrid, terrainRef.current, "manual");
    }
    return () => {
      if (viewer) removeSnowOverlay(viewer);
    };
  }, [state.snowGrid, showSnow, historicalMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Historical mode: render current step with smooth interpolation
  const interpRaf = useRef<number | null>(null);
  const lastRenderedStep = useRef(-1);

  useEffect(() => {
    if (!historicalMode || !historicalSim.steps) return;
    const step = historicalSim.steps[historicalSim.currentStep];
    if (!step) return;

    const viewer = viewerRef.current;
    const terrain = terrainRef.current;
    if (!viewer || !terrain) return;

    // Cancel any in-flight interpolation
    if (interpRaf.current !== null) {
      cancelAnimationFrame(interpRaf.current);
      interpRaf.current = null;
    }

    // Ensure we have an overlay manager
    if (!snowOverlayRef.current) {
      snowOverlayRef.current = new SnowOverlayManager(viewer);
    }
    const overlayMgr = snowOverlayRef.current;

    // Update wind layer
    if (windLayerRef.current && !windLayerRef.current.isDestroyed()) {
      windLayerRef.current.updateWindData(step.windField, terrain);
    } else {
      const particleCount = isMobileDevice() ? MOBILE_PARTICLE_COUNT : DESKTOP_PARTICLE_COUNT;
      windLayerRef.current = new WindCanvasLayer(viewer, step.windField, terrain, particleCount);
    }
    windLayerRef.current.show = showWind;

    if (!showSnow) {
      overlayMgr.remove();
      lastRenderedStep.current = historicalSim.currentStep;
      return;
    }

    const prevStep = lastRenderedStep.current;
    const curIdx = historicalSim.currentStep;
    lastRenderedStep.current = curIdx;

    // If stepping by 1 and we have a previous step, interpolate smoothly
    const prevData = prevStep >= 0 ? historicalSim.steps[prevStep] : null;
    const isAdjacentStep = prevData && Math.abs(curIdx - prevStep) === 1;

    if (isAdjacentStep && prevData) {
      // Animate interpolation over ~250ms
      const INTERP_MS = 250;
      const start = performance.now();
      const depthA = prevData.snowGrid.depth;
      const depthB = step.snowGrid.depth;
      const { rows, cols } = step.snowGrid;

      // Precompute color stats from target step — stable across all frames
      const colorStats = computeColorStats(depthB, rows, cols, terrain);

      const animate = async () => {
        const elapsed = performance.now() - start;
        const t = Math.min(elapsed / INTERP_MS, 1);
        // Ease-out quadratic for natural feel
        const ease = 1 - (1 - t) * (1 - t);

        await overlayMgr.renderInterpolated(depthA, depthB, ease, rows, cols, terrain, colorStats);

        if (t < 1) {
          interpRaf.current = requestAnimationFrame(animate);
        } else {
          interpRaf.current = null;
        }
      };
      interpRaf.current = requestAnimationFrame(animate);
    } else {
      // Direct render (scrubbing, first frame, or big jump)
      overlayMgr.render(step.snowGrid, terrain, "historical");
    }

    return () => {
      if (interpRaf.current !== null) {
        cancelAnimationFrame(interpRaf.current);
        interpRaf.current = null;
      }
    };
  }, [historicalSim.currentStep, historicalSim.steps, historicalMode, showSnow, showWind]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-start historical sim in background once worker terrain + weather are both ready
  const backgroundWeatherRef = useRef<SpatialWeatherTimeSeries | null>(null);
  useEffect(() => {
    if (!workerReady || historicalMode || !prefetchRef.current) return;
    // Worker has terrain, prefetch is in-flight — await it then start sim silently
    const prefetch = prefetchRef.current;
    let cancelled = false;
    prefetch.then((weather) => {
      if (cancelled || historicalMode) return;
      backgroundWeatherRef.current = weather;
      historicalSim.run(weather, { silent: true });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [workerReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start prefetching weather data silently (called when a point is picked)
  const prefetchProgressRef = useRef<{ stage: string; percent: number }>({ stage: "", percent: 0 });
  const showProgressRef = useRef(false);

  const startPrefetch = useCallback((lat: number, lng: number) => {
    prefetchProgressRef.current = { stage: "Finding weather stations...", percent: 0 };
    showProgressRef.current = false;
    // Compute bbox for spatial weather fetch (same logic as regionFromCoordinates)
    const latSpan = 0.2;
    const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.3);
    const lngSpan = Math.min(0.5 / cosLat, 0.6);
    prefetchRef.current = fetchSpatialWeather(
      lat, lng,
      lng - lngSpan / 2, lat - latSpan / 2,
      lng + lngSpan / 2, lat + latSpan / 2,
      7, 5,
      (stage, percent) => {
        prefetchProgressRef.current = { stage, percent };
        if (showProgressRef.current) {
          setLoadingProgress({ stage, percent });
        }
      },
    );
  }, []);

  // Enter selection mode for historical simulation
  // If user already searched a mountain, skip selection and go straight to confirm
  const enterHistoricalMode = useCallback(() => {
    if (searchedMountain) {
      setSelectedPoint(searchedMountain);
      setShowConfirmDialog(true);
      confirmDialogRef.current = true;
      // Reuse in-flight prefetch if already started on mountain select
      if (!prefetchRef.current) {
        startPrefetch(searchedMountain.lat, searchedMountain.lng);
      }
    } else {
      setSelectionMode(true);
      setSelectedPoint(null);
      setShowConfirmDialog(false);
    }
  }, [searchedMountain, startPrefetch]);

  // Handle map click — selection mode OR free-click to set simulation point
  const confirmDialogRef = useRef(false);
  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (confirmDialogRef.current) return;

    if (selectionMode) {
      setSelectedPoint({ lat, lng, name: `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E` });
      confirmDialogRef.current = true;
      setShowConfirmDialog(true);
      startPrefetch(lat, lng);
      return;
    }

    // Free-click: set as simulation point (like searching a mountain)
    if (!historicalMode) {
      const name = `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`;
      setSearchedMountain({ lat, lng, name });
      setTerrainReady(false);
      clearSimulation();
      clearOverlays();
      historicalSim.reset();
      backgroundWeatherRef.current = null;
      setRegion(regionFromCoordinates(name, lat, lng));
      startPrefetch(lat, lng);
    }
  }, [selectionMode, historicalMode, startPrefetch, clearSimulation, clearOverlays, historicalSim]);

  // Confirm selected point and run historical simulation
  const handleConfirmSelection = useCallback(async () => {
    confirmDialogRef.current = false;
    setShowConfirmDialog(false);
    setSelectionMode(false);
    clearOverlays();
    clearSimulation();

    // Case 1: Background sim already completed — instant entry
    if (historicalSim.steps) {
      setHistoricalMode(true);
      setSelectedPoint(null);
      return;
    }

    // Case 2: Background sim is running — reveal its progress
    if (historicalSim.running) {
      historicalSim.reveal();
      setHistoricalMode(true);
      setSelectedPoint(null);
      return;
    }

    // Case 3: No background sim — start from scratch (weather may still be fetching)
    if (!prefetchRef.current) return;
    showProgressRef.current = true;
    setLoadingProgress({ ...prefetchProgressRef.current });

    try {
      const weather = await prefetchRef.current;
      prefetchRef.current = null;
      setLoadingProgress(null);
      historicalSim.run(weather);
      setHistoricalMode(true);
      setSelectedPoint(null);
    } catch (err) {
      console.error("Historical sim failed:", err);
      setLoadingProgress(null);
    }
  }, [clearOverlays, clearSimulation, historicalSim]);

  // Cancel selection (discard in-flight prefetch)
  const handleCancelSelection = useCallback(() => {
    prefetchRef.current = null;
    showProgressRef.current = false;
    confirmDialogRef.current = false;
    setSelectedPoint(null);
    setShowConfirmDialog(false);
    setLoadingProgress(null);
  }, []);

  // Exit historical mode
  const exitHistoricalMode = useCallback(() => {
    setHistoricalMode(false);
    historicalSim.reset();
    setSelectionMode(false);
    setSelectedPoint(null);
    confirmDialogRef.current = false;
    setShowConfirmDialog(false);
    lastRenderedStep.current = -1;
    clearOverlays();
    // Re-trigger manual simulation
    prevKey.current = "";
  }, [clearOverlays, historicalSim]);

  // Handle snow depth probe click in simulation mode
  const handleProbeClick = useCallback((lat: number, lng: number, screenX: number, screenY: number) => {
    if (!historicalMode || !historicalSim.steps) return;
    const terrain = terrainRef.current;
    if (!terrain) return;

    const step = historicalSim.steps[historicalSim.currentStep];
    if (!step) return;

    // Convert lat/lng to grid row/col
    const { bbox } = terrain;
    const row = Math.round(((lat - bbox.south) / (bbox.north - bbox.south)) * terrain.rows - 0.5);
    const col = Math.round(((lng - bbox.west) / (bbox.east - bbox.west)) * terrain.cols - 0.5);

    if (row < 0 || row >= terrain.rows || col < 0 || col >= terrain.cols) {
      setDepthProbe(null);
      return;
    }

    const gi = row * terrain.cols + col;
    const depthCm = step.snowGrid.depth[gi];
    const elevation = terrain.heights[gi];

    // IDW-interpolate weather from stations at clicked point
    const weather = backgroundWeatherRef.current;
    let temp = step.temp;
    let precip = step.precip;
    let windSpeed = step.windSpeed;
    let windDir = step.windDir;

    if (weather && weather.stations.length > 0) {
      // Find the original timestep index for this sub-step
      // Steps are generated as (len-1)*SUB_STEPS + 1, with SUB_STEPS=4
      const stepIdx = historicalSim.currentStep;
      const dataIdx = Math.min(Math.floor(stepIdx / 4), weather.timestamps.length - 1);

      const stations = weather.stations;
      if (stations.length === 1) {
        temp = stations[0].temp[dataIdx];
        precip = stations[0].precip[dataIdx];
        windSpeed = stations[0].windSpeed[dataIdx];
        windDir = stations[0].windDir[dataIdx];
      } else {
        // IDW at clicked lat/lng
        let totalW = 0;
        let wTemp = 0, wPrecip = 0, wWindSpeed = 0;
        let sinSum = 0, cosSum = 0;

        for (const s of stations) {
          const dlat = lat - s.lat;
          const dlng = (lng - s.lng) * Math.cos(lat * Math.PI / 180);
          const dist2 = dlat * dlat + dlng * dlng;
          const w = dist2 < 1e-10 ? 1e10 : 1 / dist2;
          totalW += w;
          wTemp += s.temp[dataIdx] * w;
          wPrecip += s.precip[dataIdx] * w;
          wWindSpeed += s.windSpeed[dataIdx] * w;
          const rad = s.windDir[dataIdx] * Math.PI / 180;
          sinSum += Math.sin(rad) * w;
          cosSum += Math.cos(rad) * w;
        }

        temp = wTemp / totalW;
        precip = wPrecip / totalW;
        windSpeed = wWindSpeed / totalW;
        windDir = ((Math.atan2(sinSum / totalW, cosSum / totalW) * 180 / Math.PI) + 360) % 360;

        // Lapse rate + wind altitude correction using IDW-weighted station altitude
        let refAlt = 0;
        for (const s of stations) {
          const dlat2 = lat - s.lat;
          const dlng2 = (lng - s.lng) * Math.cos(lat * Math.PI / 180);
          const d2 = dlat2 * dlat2 + dlng2 * dlng2;
          const w2 = d2 < 1e-10 ? 1e10 : 1 / d2;
          refAlt += s.altitude * (w2 / totalW);
        }
        temp += (elevation - refAlt) * (-6.5 / 1000);

        // Mild wind speed altitude correction for sub-grid terrain variation
        const dElev = elevation - refAlt;
        if (dElev > 0) {
          const ratio = (10 + dElev) / 10;
          windSpeed *= Math.pow(ratio, 0.12); // gentle — MET already has terrain-aware wind
        }
      }
    }

    setDepthProbe({ lat, lng, depthCm, screenX, screenY, temp, precip, windSpeed, windDir, elevation });
  }, [historicalMode, historicalSim.steps, historicalSim.currentStep, terrainRef]);

  // Clear probe when step changes
  useEffect(() => {
    setDepthProbe(null);
  }, [historicalSim.currentStep]);

  // Handle timeline step change
  const handleStepChange = useCallback((step: number) => {
    if (step === -1) {
      historicalSim.setCurrentStep((prev) => {
        const next = prev + 1;
        return next >= (historicalSim.steps?.length ?? 0) ? 0 : next;
      });
    } else {
      historicalSim.setCurrentStep(step);
    }
  }, [historicalSim]);

  return (
    <div className="relative w-full h-full">
      <WelcomePage />
      <CesiumErrorBoundary>
        <CesiumViewer
          region={region}
          selectionMode={selectionMode}
          historicalMode={historicalMode}
          selectedPoint={selectedPoint}
          searchedMountain={searchedMountain}
          onMapClick={handleMapClick}
          onProbeClick={handleProbeClick}
          onTerrainReady={handleTerrainReady}
          onViewerReady={(v: Viewer) => {
            viewerRef.current = v;
            setCesiumViewer(v);
          }}
        />
      </CesiumErrorBoundary>

      <MapCompass viewer={cesiumViewer} />
      <ScaleBar viewer={cesiumViewer} />

      <ControlPanel
        params={params}
        showSnow={showSnow}
        showWind={showWind}
        historicalMode={historicalMode}
        historicalLoading={historicalSim.loading}
        selectionMode={selectionMode}
        onParamsChange={setParams}
        onMountainSelect={(m: PlaceResult) => {
          if (selectionMode) {
            setSelectedPoint({ lat: m.lat, lng: m.lng, name: m.name });
            setShowConfirmDialog(true);
            startPrefetch(m.lat, m.lng);
            return;
          }
          setSearchedMountain({ lat: m.lat, lng: m.lng, name: m.name });
          setTerrainReady(false);
          clearSimulation();
          clearOverlays();
          historicalSim.reset(); // Cancel any in-flight background sim
          backgroundWeatherRef.current = null;
          if (historicalMode) exitHistoricalMode();
          setRegion(regionFromCoordinates(m.name, m.lat, m.lng));
          // Start weather prefetch immediately — background sim will auto-start
          // once both weather + worker terrain are ready
          startPrefetch(m.lat, m.lng);
        }}
        onToggleSnow={() => setShowSnow((s) => !s)}
        onToggleWind={() => {
          setShowWind((s) => {
            const next = !s;
            if (windLayerRef.current && !windLayerRef.current.isDestroyed()) {
              windLayerRef.current.show = next;
            }
            return next;
          });
        }}
        onHistoricalMode={enterHistoricalMode}
        onExitHistorical={exitHistoricalMode}
      />

      {/* Floating simulate button — mobile: below search bar, desktop: top center */}
      {searchedMountain && !historicalMode && !selectionMode && !showConfirmDialog && !displayProgress && (
        <div className="absolute top-[4.25rem] md:top-4 left-3 right-14 md:left-1/2 md:right-auto md:-translate-x-1/2 z-20 flex justify-center safe-area-top animate-fade-in-up" key={searchedMountain.name + searchedMountain.lat}>
          <button
            onClick={enterHistoricalMode}
            disabled={historicalSim.loading}
            className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 active:from-emerald-400 active:to-emerald-500 disabled:from-slate-600 disabled:to-slate-700 disabled:text-slate-400 text-white text-sm font-semibold px-6 py-2.5 rounded-full shadow-lg shadow-emerald-900/40 transition-all active:scale-95"
          >
            {historicalSim.loading ? "Loading..." : "Simulate"}
          </button>
        </div>
      )}

      {/* Selection mode banner */}
      {selectionMode && !showConfirmDialog && !displayProgress && (
        <div className="absolute top-14 md:top-4 left-3 right-3 md:left-1/2 md:right-auto md:-translate-x-1/2 z-20 glass-panel text-white px-4 md:px-5 py-3 flex items-center gap-3 md:gap-4 border-l-[3px] border-l-sky-400">
          <span className="text-xs md:text-sm font-light">Tap the map or search to select a point</span>
          <button
            onClick={() => { setSelectionMode(false); setSelectedPoint(null); }}
            className="text-xs bg-slate-600/50 hover:bg-slate-500/60 text-slate-300 px-3 py-1.5 rounded-full transition-all shrink-0"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Confirm dialog */}
      {showConfirmDialog && selectedPoint && (
        <div className="absolute inset-0 z-20 flex items-center md:justify-center justify-end pb-[60%] md:pb-0 bg-slate-950/50 backdrop-blur-[2px]" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <div className="glass-panel p-5 md:p-6 text-white max-w-sm mx-5 md:mx-0">
            <p className="text-sm text-slate-300 font-light mb-1">Simulate historical weather at:</p>
            <p className="font-semibold text-emerald-400 mb-4 text-lg" style={{ fontFamily: "var(--font-display)" }}>{selectedPoint.name}</p>
            <p className="text-xs text-slate-400 font-light mb-5">Fetches 7 days of history + 5 days of forecast from NVE and runs a time-stepped snow simulation.</p>
            <div className="flex gap-3">
              <button
                onClick={handleConfirmSelection}
                className="flex-1 bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 font-medium py-2.5 rounded-lg shadow-lg shadow-emerald-900/30 transition-all"
              >
                Confirm
              </button>
              <button
                onClick={handleCancelSelection}
                className="flex-1 bg-slate-700/60 hover:bg-slate-600/70 font-medium py-2.5 rounded-lg border border-slate-600/30 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading progress */}
      {displayProgress && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/50 backdrop-blur-[2px] px-3 md:px-0">
          <div className="glass-panel p-5 md:p-6 text-white w-full max-w-80">
            <p className="text-sm font-light text-slate-200 mb-3">{displayProgress.stage}</p>
            <div className="w-full bg-slate-700/50 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300 bg-gradient-to-r from-sky-500 to-sky-400"
                style={{ width: `${displayProgress.percent}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 font-light mt-2 tabular-nums">{Math.round(displayProgress.percent)}%</p>
          </div>
        </div>
      )}

      {historicalMode && historicalSim.steps && (
        <TimelineBar
          steps={historicalSim.steps}
          currentStep={historicalSim.currentStep}
          onStepChange={handleStepChange}
          onExit={exitHistoricalMode}
        />
      )}

      {showSnow && (state.snowGrid || historicalMode) && <SnowLegend mode={historicalMode ? "historical" : "manual"} />}

      {depthProbe && (
        <SnowDepthTooltip
          depthCm={depthProbe.depthCm}
          lat={depthProbe.lat}
          lng={depthProbe.lng}
          screenX={depthProbe.screenX}
          screenY={depthProbe.screenY}
          temp={depthProbe.temp}
          precip={depthProbe.precip}
          windSpeed={depthProbe.windSpeed}
          windDir={depthProbe.windDir}
          elevation={depthProbe.elevation}
          onClose={() => setDepthProbe(null)}
        />
      )}
    </div>
  );
}
