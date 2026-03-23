import { useState, useCallback, useRef, useEffect } from "react";
import CesiumViewer from "./components/CesiumViewer.tsx";
import ControlPanel from "./components/ControlPanel.tsx";
import SnowLegend from "./components/SnowLegend.tsx";
import { REGIONS } from "./simulation/regions.ts";
import { useSimulation } from "./hooks/useSimulation.ts";
import { useAnimationLoop } from "./hooks/useAnimationLoop.ts";
import { renderSnowOverlay, removeSnowOverlay } from "./rendering/snow-overlay.ts";
import { updateWindParticles, removeWindParticles } from "./rendering/wind-renderer.ts";
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
  const { state, setTerrain, runSimulation, advect, terrainRef } = useSimulation();

  const handleTerrainReady = useCallback(
    (grid: Parameters<typeof setTerrain>[0]) => {
      setTerrain(grid);
      setTerrainReady(true);
    },
    [setTerrain],
  );

  const handleSimulate = useCallback(() => {
    runSimulation(params);
  }, [runSimulation, params]);

  // Animation loop for wind particles
  useAnimationLoop(
    () => {
      const viewer = viewerRef.current;
      if (!viewer || !showWind) return;
      const pool = advect();
      if (pool) updateWindParticles(viewer, pool);
    },
    showWind && state.windField !== null,
    30,
  );

  // Render snow overlay when simulation completes
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !state.snowGrid) return;
    if (showSnow && terrainRef.current) {
      renderSnowOverlay(viewer, state.snowGrid, terrainRef.current);
    }
    return () => {
      if (viewer) removeSnowOverlay(viewer);
    };
  }, [state.snowGrid, showSnow, region.bbox]);

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
        region={region}
        regions={REGIONS}
        simulating={state.simulating}
        showSnow={showSnow}
        showWind={showWind}
        onParamsChange={setParams}
        onRegionChange={setRegion}
        onSimulate={handleSimulate}
        onToggleSnow={() => setShowSnow((s) => !s)}
        onToggleWind={() => {
          setShowWind((s) => {
            const next = !s;
            if (!next && viewerRef.current) removeWindParticles(viewerRef.current);
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
