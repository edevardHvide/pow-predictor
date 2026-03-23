import { useState, useCallback, useRef, useEffect } from "react";
import CesiumViewer from "./components/CesiumViewer.tsx";
import ControlPanel from "./components/ControlPanel.tsx";
import SnowLegend from "./components/SnowLegend.tsx";
import { REGIONS, regionFromCoordinates } from "./simulation/regions.ts";
import type { MountainResult } from "./api/kartverket.ts";
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

  const viewerRef = useRef<Viewer | null>(null);
  const windLayerRef = useRef<WindCanvasLayer | null>(null);
  const { state, setTerrain, runSimulation, clearSimulation, terrainRef } = useSimulation();

  const handleTerrainReady = useCallback(
    (grid: Parameters<typeof setTerrain>[0]) => {
      setTerrain(grid);
      prevKey.current = ""; // force re-simulation with new terrain
      setTerrainReady(true);
    },
    [setTerrain],
  );

  // Auto-simulate when params change
  const prevKey = useRef("");
  useEffect(() => {
    if (!terrainReady) return;
    const key = `${params.direction}-${params.speed}-${params.temperature}`;
    if (key === prevKey.current) return;
    prevKey.current = key;
    // Debounce rapid slider changes
    const timer = setTimeout(() => runSimulation(params), 150);
    return () => clearTimeout(timer);
  }, [params.direction, params.speed, params.temperature, terrainReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Create/update wind layer when wind field changes
  useEffect(() => {
    const viewer = viewerRef.current;
    const terrain = terrainRef.current;
    if (!viewer || !state.windField || !terrain) return;

    if (windLayerRef.current && !windLayerRef.current.isDestroyed()) {
      windLayerRef.current.updateWindData(state.windField, terrain);
    } else {
      windLayerRef.current = new WindCanvasLayer(viewer, state.windField, terrain);
    }
    windLayerRef.current.show = showWind;
  }, [state.windField]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup wind layer on unmount only
  useEffect(() => {
    return () => {
      if (windLayerRef.current && !windLayerRef.current.isDestroyed()) {
        windLayerRef.current.destroy();
      }
    };
  }, []);

  // Snow overlay
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !state.snowGrid) return;
    if (showSnow && terrainRef.current) {
      renderSnowOverlay(viewer, state.snowGrid, terrainRef.current);
    }
    return () => {
      if (viewer) removeSnowOverlay(viewer);
    };
  }, [state.snowGrid, showSnow]); // eslint-disable-line react-hooks/exhaustive-deps

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
        onParamsChange={setParams}
        onMountainSelect={(m: MountainResult) => {
          setTerrainReady(false);
          clearSimulation();
          if (viewerRef.current) removeSnowOverlay(viewerRef.current);
          if (windLayerRef.current && !windLayerRef.current.isDestroyed()) {
            windLayerRef.current.destroy();
            windLayerRef.current = null;
          }
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
      />

      {terrainReady && !state.windField && (
        <div className="absolute bottom-4 right-4 bg-gray-900/90 text-white rounded-lg px-4 py-2 text-sm">
          Terrain loaded. Click <strong>Run Simulation</strong> to start.
        </div>
      )}

      {showSnow && state.snowGrid && <SnowLegend />}
    </div>
  );
}
