import { useState, useCallback, useRef, useEffect } from "react";
import CesiumViewer from "./components/CesiumViewer.tsx";
import ControlPanel from "./components/ControlPanel.tsx";
import SnowLegend from "./components/SnowLegend.tsx";
import SnowDepthTooltip from "./components/SnowDepthTooltip.tsx";
import MapCompass from "./components/MapCompass.tsx";
import TimelineBar from "./components/TimelineBar.tsx";
import { REGIONS, regionFromCoordinates } from "./simulation/regions.ts";
import type { MountainResult } from "./api/kartverket.ts";
import { fetchWeatherTimeSeries, type WeatherTimeSeries } from "./api/nve.ts";
import { runHistoricalSimulation, type HistoricalStep } from "./simulation/historical-sim.ts";
import { useSimulation } from "./hooks/useSimulation.ts";
import { renderSnowOverlay, removeSnowOverlay } from "./rendering/snow-overlay.ts";
import { WindCanvasLayer } from "./rendering/wind-layer-adapter.ts";
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
  const [historicalSteps, setHistoricalSteps] = useState<HistoricalStep[] | null>(null);
  const [historicalStep, setHistoricalStep] = useState(0);
  const [historicalLoading, setHistoricalLoading] = useState(false);

  // Point selection flow
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<{ lat: number; lng: number; name?: string } | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<{ stage: string; percent: number } | null>(null);

  // Snow depth probe (click in simulation mode)
  const [depthProbe, setDepthProbe] = useState<{ lat: number; lng: number; depthCm: number; screenX: number; screenY: number } | null>(null);

  const [cesiumViewer, setCesiumViewer] = useState<Viewer | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const windLayerRef = useRef<WindCanvasLayer | null>(null);
  const prefetchRef = useRef<Promise<WeatherTimeSeries> | null>(null);
  const { state, setTerrain, runSimulation, clearSimulation, terrainRef } = useSimulation();

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
      windLayerRef.current = new WindCanvasLayer(viewer, state.windField, terrain);
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

  // Historical mode: render current step
  useEffect(() => {
    if (!historicalMode || !historicalSteps) return;
    const step = historicalSteps[historicalStep];
    if (!step) return;

    const viewer = viewerRef.current;
    const terrain = terrainRef.current;
    if (!viewer || !terrain) return;

    // Update snow overlay
    if (showSnow) {
      renderSnowOverlay(viewer, step.snowGrid, terrain, "historical");
    }

    // Update wind layer
    if (windLayerRef.current && !windLayerRef.current.isDestroyed()) {
      windLayerRef.current.updateWindData(step.windField, terrain);
    } else {
      windLayerRef.current = new WindCanvasLayer(viewer, step.windField, terrain);
    }
    windLayerRef.current.show = showWind;
  }, [historicalStep, historicalSteps, historicalMode, showSnow, showWind]); // eslint-disable-line react-hooks/exhaustive-deps

  // Enter selection mode for historical simulation
  const enterHistoricalMode = useCallback(() => {
    setSelectionMode(true);
    setSelectedPoint(null);
    setShowConfirmDialog(false);
  }, []);

  // Start prefetching weather data silently (called when a point is picked)
  const prefetchProgressRef = useRef<{ stage: string; percent: number }>({ stage: "", percent: 0 });
  const showProgressRef = useRef(false);

  const startPrefetch = useCallback((lat: number, lng: number) => {
    prefetchProgressRef.current = { stage: "Finding weather station...", percent: 0 };
    showProgressRef.current = false;
    prefetchRef.current = fetchWeatherTimeSeries(lat, lng, 7, 5,
      (stage, percent) => {
        prefetchProgressRef.current = { stage, percent };
        // Only update visible progress if confirm has been pressed
        if (showProgressRef.current) {
          setLoadingProgress({ stage, percent });
        }
      },
    );
  }, []);

  // Handle map click during selection mode
  const confirmDialogRef = useRef(false);
  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (!selectionMode || confirmDialogRef.current) return;
    setSelectedPoint({ lat, lng, name: `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E` });
    confirmDialogRef.current = true;
    setShowConfirmDialog(true);
    startPrefetch(lat, lng);
  }, [selectionMode, startPrefetch]);

  // Confirm selected point and run historical simulation
  const handleConfirmSelection = useCallback(async () => {
    const terrain = terrainRef.current;
    if (!terrain || !prefetchRef.current) return;

    confirmDialogRef.current = false;
    setShowConfirmDialog(false);
    setSelectionMode(false);
    setHistoricalLoading(true);
    clearOverlays();
    clearSimulation();

    // Reveal progress — jump to wherever the silent prefetch already got
    showProgressRef.current = true;
    setLoadingProgress({ ...prefetchProgressRef.current });

    try {
      // Await the already-in-flight prefetch
      const weather = await prefetchRef.current;
      prefetchRef.current = null;
      setLoadingProgress({ stage: "Computing simulation...", percent: 0 });
      const steps = await runHistoricalSimulation(terrain, weather,
        (stage, percent) => setLoadingProgress({ stage, percent }),
      );

      setHistoricalSteps(steps);
      setHistoricalStep(0);
      setHistoricalMode(true);
      setSelectedPoint(null);
    } catch (err) {
      console.error("Historical sim failed:", err);
    } finally {
      setHistoricalLoading(false);
      setLoadingProgress(null);
    }
  }, [clearOverlays, clearSimulation, terrainRef]);

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
    setHistoricalSteps(null);
    setHistoricalStep(0);
    setSelectionMode(false);
    setSelectedPoint(null);
    confirmDialogRef.current = false;
    setShowConfirmDialog(false);
    clearOverlays();
    // Re-trigger manual simulation
    prevKey.current = "";
  }, [clearOverlays]);

  // Handle snow depth probe click in simulation mode
  const handleProbeClick = useCallback((lat: number, lng: number, screenX: number, screenY: number) => {
    if (!historicalMode || !historicalSteps) return;
    const terrain = terrainRef.current;
    if (!terrain) return;

    const step = historicalSteps[historicalStep];
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

    setDepthProbe({ lat, lng, depthCm, screenX, screenY });
  }, [historicalMode, historicalSteps, historicalStep, terrainRef]);

  // Clear probe when step changes
  useEffect(() => {
    setDepthProbe(null);
  }, [historicalStep]);

  // Handle timeline step change
  const handleStepChange = useCallback((step: number) => {
    setHistoricalStep((prev) => {
      if (step === -1) {
        // Advance by 1 (from play)
        const next = prev + 1;
        return next >= (historicalSteps?.length ?? 0) ? 0 : next;
      }
      return step;
    });
  }, [historicalSteps]);

  return (
    <div className="relative w-full h-full">
      <CesiumViewer
        region={region}
        selectionMode={selectionMode}
        historicalMode={historicalMode}
        selectedPoint={selectedPoint}
        onMapClick={handleMapClick}
        onProbeClick={handleProbeClick}
        onTerrainReady={handleTerrainReady}
        onViewerReady={(v: Viewer) => {
          viewerRef.current = v;
          setCesiumViewer(v);
        }}
      />

      <MapCompass viewer={cesiumViewer} />

      <ControlPanel
        params={params}
        showSnow={showSnow}
        showWind={showWind}
        historicalMode={historicalMode}
        historicalLoading={historicalLoading}
        selectionMode={selectionMode}
        onParamsChange={setParams}
        onMountainSelect={(m: MountainResult) => {
          if (selectionMode) {
            setSelectedPoint({ lat: m.lat, lng: m.lng, name: m.name });
            setShowConfirmDialog(true);
            startPrefetch(m.lat, m.lng);
            return;
          }
          setTerrainReady(false);
          clearSimulation();
          clearOverlays();
          if (historicalMode) exitHistoricalMode();
          setRegion(regionFromCoordinates(m.name, m.lat, m.lng));
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
      />

      {/* Selection mode banner */}
      {selectionMode && !showConfirmDialog && !loadingProgress && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 glass-panel text-white px-5 py-3 flex items-center gap-4 border-l-[3px] border-l-sky-400">
          <span className="text-sm font-light">Click on the map or search a mountain to select a point</span>
          <button
            onClick={() => { setSelectionMode(false); setSelectedPoint(null); }}
            className="text-xs bg-slate-600/50 hover:bg-slate-500/60 text-slate-300 px-3 py-1.5 rounded-full transition-all"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Confirm dialog */}
      {showConfirmDialog && selectedPoint && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/50 backdrop-blur-[2px]" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <div className="glass-panel p-6 text-white max-w-sm">
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
      {loadingProgress && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/50 backdrop-blur-[2px]">
          <div className="glass-panel p-6 text-white w-80">
            <p className="text-sm font-light text-slate-200 mb-3">{loadingProgress.stage}</p>
            <div className="w-full bg-slate-700/50 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300 bg-gradient-to-r from-sky-500 to-sky-400"
                style={{ width: `${loadingProgress.percent}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 font-light mt-2 tabular-nums">{Math.round(loadingProgress.percent)}%</p>
          </div>
        </div>
      )}

      {historicalMode && historicalSteps && (
        <TimelineBar
          steps={historicalSteps}
          currentStep={historicalStep}
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
          onClose={() => setDepthProbe(null)}
        />
      )}
    </div>
  );
}
