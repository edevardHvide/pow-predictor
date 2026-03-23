import { useState, useCallback, useRef, useEffect } from "react";
import CesiumViewer from "./components/CesiumViewer.tsx";
import ControlPanel from "./components/ControlPanel.tsx";
import SnowLegend from "./components/SnowLegend.tsx";
import TimelineBar from "./components/TimelineBar.tsx";
import { REGIONS, regionFromCoordinates } from "./simulation/regions.ts";
import type { MountainResult } from "./api/kartverket.ts";
import { fetchWeatherTimeSeries } from "./api/nve.ts";
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

  const viewerRef = useRef<Viewer | null>(null);
  const windLayerRef = useRef<WindCanvasLayer | null>(null);
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
      renderSnowOverlay(viewer, state.snowGrid, terrainRef.current);
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
      renderSnowOverlay(viewer, step.snowGrid, terrain);
    }

    // Update wind layer
    if (windLayerRef.current && !windLayerRef.current.isDestroyed()) {
      windLayerRef.current.updateWindData(step.windField, terrain);
    } else {
      windLayerRef.current = new WindCanvasLayer(viewer, step.windField, terrain);
    }
    windLayerRef.current.show = showWind;
  }, [historicalStep, historicalSteps, historicalMode, showSnow, showWind]); // eslint-disable-line react-hooks/exhaustive-deps

  // Enter historical mode
  const enterHistoricalMode = useCallback(async () => {
    const terrain = terrainRef.current;
    if (!terrain) return;

    setHistoricalLoading(true);
    clearOverlays();
    clearSimulation();

    try {
      const centerLat = (terrain.bbox.south + terrain.bbox.north) / 2;
      const centerLng = (terrain.bbox.west + terrain.bbox.east) / 2;
      const weather = await fetchWeatherTimeSeries(centerLat, centerLng, 7);
      const steps = runHistoricalSimulation(terrain, weather);

      setHistoricalSteps(steps);
      setHistoricalStep(0);
      setHistoricalMode(true);
    } catch (err) {
      console.error("Historical sim failed:", err);
    } finally {
      setHistoricalLoading(false);
    }
  }, [clearOverlays, clearSimulation, terrainRef]);

  // Exit historical mode
  const exitHistoricalMode = useCallback(() => {
    setHistoricalMode(false);
    setHistoricalSteps(null);
    setHistoricalStep(0);
    clearOverlays();
    // Re-trigger manual simulation
    prevKey.current = "";
  }, [clearOverlays]);

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
        onTerrainReady={handleTerrainReady}
        onViewerReady={(v: Viewer) => {
          viewerRef.current = v;
        }}
      />

      <ControlPanel
        params={params}
        simulating={state.simulating}
        showSnow={showSnow}
        showWind={showWind}
        historicalMode={historicalMode}
        historicalLoading={historicalLoading}
        onParamsChange={setParams}
        onMountainSelect={(m: MountainResult) => {
          setTerrainReady(false);
          clearSimulation();
          clearOverlays();
          if (historicalMode) exitHistoricalMode();
          setRegion(regionFromCoordinates(m.name, m.lat, m.lng));
        }}
        onSimulate={() => runSimulation(params)}
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

      {historicalMode && historicalSteps && (
        <TimelineBar
          steps={historicalSteps}
          currentStep={historicalStep}
          onStepChange={handleStepChange}
          onExit={exitHistoricalMode}
        />
      )}

      {terrainReady && !state.windField && !historicalMode && (
        <div className="absolute bottom-4 right-4 bg-gray-900/90 text-white rounded-lg px-4 py-2 text-sm">
          Terrain loaded. Click <strong>Run Simulation</strong> to start.
        </div>
      )}

      {showSnow && (state.snowGrid || historicalMode) && <SnowLegend />}
    </div>
  );
}
