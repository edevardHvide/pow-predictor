import { useRef, useEffect, useState, useCallback } from "react";
import {
  Viewer,
  createWorldTerrainAsync,
  Cartesian3,
  Math as CesiumMath,
  type CesiumTerrainProvider,
} from "cesium";
import type { TerrainRegion } from "../types/terrain.ts";

export function useCesium(containerRef: React.RefObject<HTMLDivElement | null>, region: TerrainRegion) {
  const viewerRef = useRef<Viewer | null>(null);
  const [terrainProvider, setTerrainProvider] = useState<CesiumTerrainProvider | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Prevent double-init
    if (viewerRef.current) return;

    let destroyed = false;

    const viewer = new Viewer(container, {
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      creditContainer: document.createElement("div"),
    });

    viewerRef.current = viewer;

    createWorldTerrainAsync().then((tp) => {
      if (destroyed || viewer.isDestroyed()) return;
      viewer.terrainProvider = tp;
      setTerrainProvider(tp as CesiumTerrainProvider);
      setReady(true);
    }).catch((err) => {
      console.error("Failed to load terrain:", err);
    });

    return () => {
      destroyed = true;
      if (!viewer.isDestroyed()) {
        viewer.destroy();
      }
      viewerRef.current = null;
    };
  }, [containerRef]);

  const flyToRegion = useCallback(
    (r: TerrainRegion) => {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(
          r.cameraPosition.lng,
          r.cameraPosition.lat,
          r.cameraPosition.height,
        ),
        orientation: {
          heading: CesiumMath.toRadians(r.cameraHeading),
          pitch: CesiumMath.toRadians(r.cameraPitch),
          roll: 0,
        },
        duration: 2,
      });
    },
    [],
  );

  useEffect(() => {
    if (ready) flyToRegion(region);
  }, [ready, region, flyToRegion]);

  return { viewer: viewerRef, terrainProvider, ready, flyToRegion };
}
