import { useRef, useEffect } from "react";
import "cesium/Build/Cesium/Widgets/widgets.css";
import {
  Ion,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cartographic,
  Math as CesiumMath,
  Cartesian3,
  Color,
  Entity,
  type Viewer,
} from "cesium";
import { useCesium } from "../hooks/useCesium.ts";
import { sampleTerrain } from "../simulation/terrain-sampler.ts";
import { isMobileDevice, MOBILE_CELL_SIZE, DESKTOP_CELL_SIZE } from "../utils/device.ts";
import type { TerrainRegion } from "../types/terrain.ts";
import type { ElevationGrid } from "../types/terrain.ts";

Ion.defaultAccessToken =
  import.meta.env.VITE_CESIUM_ION_TOKEN ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkZWZhdWx0IiwiaWQiOjEsImlhdCI6MTY5MDAwMDAwMH0.demo";

interface CesiumViewerProps {
  region: TerrainRegion;
  selectionMode?: boolean;
  historicalMode?: boolean;
  selectedPoint?: { lat: number; lng: number; name?: string } | null;
  onMapClick?: (lat: number, lng: number) => void;
  onProbeClick?: (lat: number, lng: number, screenX: number, screenY: number) => void;
  onTerrainReady?: (grid: ElevationGrid) => void;
  onViewerReady?: (viewer: Viewer) => void;
}

export default function CesiumViewer({
  region,
  selectionMode,
  historicalMode,
  selectedPoint,
  onMapClick,
  onProbeClick,
  onTerrainReady,
  onViewerReady,
}: CesiumViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { viewer, terrainProvider, ready } = useCesium(containerRef, region);
  const sampledRegionRef = useRef<string>("");
  const markerRef = useRef<Entity | null>(null);

  // Expose viewer instance
  useEffect(() => {
    if (ready && viewer.current) {
      onViewerReady?.(viewer.current);
    }
  }, [ready, viewer, onViewerReady]);

  useEffect(() => {
    if (!ready || !terrainProvider || sampledRegionRef.current === region.name) return;
    sampledRegionRef.current = region.name;

    const cellSize = isMobileDevice() ? MOBILE_CELL_SIZE : DESKTOP_CELL_SIZE;
    sampleTerrain(terrainProvider, region.bbox, cellSize).then((grid) => {
      console.log("Elevation grid ready:", grid);
      onTerrainReady?.(grid);
    }).catch((err) => {
      console.error("Terrain sampling failed:", err);
    });
  }, [ready, terrainProvider, region, onTerrainReady]);

  // Click handler for selection mode
  useEffect(() => {
    const v = viewer.current;
    if (!v || !selectionMode) return;

    const handler = new ScreenSpaceEventHandler(v.scene.canvas);
    handler.setInputAction((event: { position: { x: number; y: number } }) => {
      const ray = v.camera.getPickRay(event.position as any);
      if (!ray) return;

      const cartesian = v.scene.globe.pick(ray, v.scene);
      if (!cartesian) {
        // Fallback to ellipsoid
        const ellipsoidPos = v.camera.pickEllipsoid(event.position as any);
        if (!ellipsoidPos) return;
        const carto = Cartographic.fromCartesian(ellipsoidPos);
        onMapClick?.(CesiumMath.toDegrees(carto.latitude), CesiumMath.toDegrees(carto.longitude));
        return;
      }

      const carto = Cartographic.fromCartesian(cartesian);
      onMapClick?.(CesiumMath.toDegrees(carto.latitude), CesiumMath.toDegrees(carto.longitude));
    }, ScreenSpaceEventType.LEFT_CLICK);

    // Set crosshair cursor
    v.canvas.style.cursor = "crosshair";

    return () => {
      handler.destroy();
      if (v.canvas) v.canvas.style.cursor = "";
    };
  }, [selectionMode, viewer, onMapClick]);

  // Marker entity for selected point
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;

    // Remove old marker
    if (markerRef.current) {
      v.entities.remove(markerRef.current);
      markerRef.current = null;
    }

    if (selectedPoint) {
      markerRef.current = v.entities.add({
        position: Cartesian3.fromDegrees(selectedPoint.lng, selectedPoint.lat, 100),
        point: {
          pixelSize: 14,
          color: Color.YELLOW,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
        },
      });
    }

    return () => {
      if (markerRef.current && v.entities.contains(markerRef.current)) {
        v.entities.remove(markerRef.current);
        markerRef.current = null;
      }
    };
  }, [selectedPoint, viewer]);

  // Click handler for snow depth probe in historical mode
  useEffect(() => {
    const v = viewer.current;
    if (!v || !historicalMode || selectionMode) return;

    const handler = new ScreenSpaceEventHandler(v.scene.canvas);
    handler.setInputAction((event: { position: { x: number; y: number } }) => {
      const ray = v.camera.getPickRay(event.position as any);
      if (!ray) return;

      const cartesian = v.scene.globe.pick(ray, v.scene);
      if (!cartesian) {
        const ellipsoidPos = v.camera.pickEllipsoid(event.position as any);
        if (!ellipsoidPos) return;
        const carto = Cartographic.fromCartesian(ellipsoidPos);
        onProbeClick?.(
          CesiumMath.toDegrees(carto.latitude),
          CesiumMath.toDegrees(carto.longitude),
          event.position.x,
          event.position.y,
        );
        return;
      }

      const carto = Cartographic.fromCartesian(cartesian);
      onProbeClick?.(
        CesiumMath.toDegrees(carto.latitude),
        CesiumMath.toDegrees(carto.longitude),
        event.position.x,
        event.position.y,
      );
    }, ScreenSpaceEventType.LEFT_CLICK);

    v.canvas.style.cursor = "crosshair";

    return () => {
      handler.destroy();
      if (v.canvas) v.canvas.style.cursor = "";
    };
  }, [historicalMode, selectionMode, viewer, onProbeClick]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
    />
  );
}
