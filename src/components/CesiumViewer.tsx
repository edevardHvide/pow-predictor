import { useRef, useEffect } from "react";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { Ion, type Viewer } from "cesium";
import { useCesium } from "../hooks/useCesium.ts";
import { sampleTerrain } from "../simulation/terrain-sampler.ts";
import type { TerrainRegion } from "../types/terrain.ts";
import type { ElevationGrid } from "../types/terrain.ts";

Ion.defaultAccessToken =
  import.meta.env.VITE_CESIUM_ION_TOKEN ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkZWZhdWx0IiwiaWQiOjEsImlhdCI6MTY5MDAwMDAwMH0.demo";

interface CesiumViewerProps {
  region: TerrainRegion;
  onTerrainReady?: (grid: ElevationGrid) => void;
  onViewerReady?: (viewer: Viewer) => void;
}

export default function CesiumViewer({ region, onTerrainReady, onViewerReady }: CesiumViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { viewer, terrainProvider, ready } = useCesium(containerRef, region);
  const sampledRegionRef = useRef<string>("");

  // Expose viewer instance
  useEffect(() => {
    if (ready && viewer.current) {
      onViewerReady?.(viewer.current);
    }
  }, [ready, viewer, onViewerReady]);

  useEffect(() => {
    if (!ready || !terrainProvider || sampledRegionRef.current === region.name) return;
    sampledRegionRef.current = region.name;

    sampleTerrain(terrainProvider, region.bbox).then((grid) => {
      console.log("Elevation grid ready:", grid);
      onTerrainReady?.(grid);
    });
  }, [ready, terrainProvider, region, onTerrainReady]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
    />
  );
}
