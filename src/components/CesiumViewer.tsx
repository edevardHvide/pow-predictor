import { useRef, useEffect } from "react";
import "cesium/Build/Cesium/Widgets/widgets.css";
import {
  Ion,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Cartographic,
  Math as CesiumMath,
  Cartesian3,
  Entity,
  VerticalOrigin,
  HorizontalOrigin,
  HeightReference,
  Cartesian2,
  type Viewer,
} from "cesium";
import { useCesium } from "../hooks/useCesium.ts";
import { sampleTerrain } from "../simulation/terrain-sampler.ts";
import { isMobileDevice, MOBILE_CELL_SIZE, DESKTOP_CELL_SIZE } from "../utils/device.ts";
import type { TerrainRegion } from "../types/terrain.ts";
import type { ElevationGrid } from "../types/terrain.ts";

Ion.defaultAccessToken =
  import.meta.env.VITE_CESIUM_ION_TOKEN ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3NjVjM2EyZS0xNTMwLTRjNWUtYWQ0Mi1hOTFlMDljYjM1YjMiLCJpZCI6NDA4OTgxLCJpYXQiOjE3NzQ0NDI5Njd9.fZTR8dTxON1hZ-C8Jw-GuoQE89RN2CGIDmXxpheol1c";

interface CesiumViewerProps {
  region: TerrainRegion;
  selectionMode?: boolean;
  historicalMode?: boolean;
  selectedPoint?: { lat: number; lng: number; name?: string } | null;
  searchedMountain?: { lat: number; lng: number; name: string } | null;
  onMapClick?: (lat: number, lng: number) => void;
  onProbeClick?: (lat: number, lng: number, screenX: number, screenY: number) => void;
  onTerrainReady?: (grid: ElevationGrid) => void;
  onViewerReady?: (viewer: Viewer) => void;
}

export default function CesiumViewer({
  region,
  selectionMode,
  historicalMode,
  searchedMountain,
  onMapClick,
  onProbeClick,
  onTerrainReady,
  onViewerReady,
}: CesiumViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { viewer, terrainProvider, ready } = useCesium(containerRef, region);
  const sampledRegionRef = useRef<string>("");
  const mountainMarkerRef = useRef<Entity | null>(null);
  const mountainLabelRef = useRef<Entity | null>(null);

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

  // Click handler — always active (selection mode uses crosshair cursor)
  useEffect(() => {
    const v = viewer.current;
    if (!v || historicalMode) return;

    const handler = new ScreenSpaceEventHandler(v.scene.canvas);
    handler.setInputAction((event: { position: { x: number; y: number } }) => {
      const ray = v.camera.getPickRay(event.position as any);
      if (!ray) return;

      const cartesian = v.scene.globe.pick(ray, v.scene);
      if (!cartesian) {
        const ellipsoidPos = v.camera.pickEllipsoid(event.position as any);
        if (!ellipsoidPos) return;
        const carto = Cartographic.fromCartesian(ellipsoidPos);
        onMapClick?.(CesiumMath.toDegrees(carto.latitude), CesiumMath.toDegrees(carto.longitude));
        return;
      }

      const carto = Cartographic.fromCartesian(cartesian);
      onMapClick?.(CesiumMath.toDegrees(carto.latitude), CesiumMath.toDegrees(carto.longitude));
    }, ScreenSpaceEventType.LEFT_CLICK);

    if (selectionMode) v.canvas.style.cursor = "crosshair";

    return () => {
      handler.destroy();
      if (v.canvas) v.canvas.style.cursor = "";
    };
  }, [selectionMode, historicalMode, viewer, onMapClick]);


  // Mountain arrow marker with name label
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;

    if (mountainMarkerRef.current) {
      v.entities.remove(mountainMarkerRef.current);
      mountainMarkerRef.current = null;
    }
    if (mountainLabelRef.current) {
      v.entities.remove(mountainLabelRef.current);
      mountainLabelRef.current = null;
    }

    if (searchedMountain) {
      // Minimal pin marker — teardrop shape with inner dot
      const pinSvg = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="52" viewBox="0 0 36 52">`,
        `<defs>`,
        `<filter id="s" x="-20%25" y="-10%25" width="140%25" height="130%25">`,
        `<feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="%23000" flood-opacity="0.4"/>`,
        `</filter>`,
        `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">`,
        `<stop offset="0%25" stop-color="%23f87171"/>`,
        `<stop offset="100%25" stop-color="%23dc2626"/>`,
        `</linearGradient>`,
        `</defs>`,
        `<path d="M18 2C10.3 2 4 8.3 4 16c0 10 14 32 14 32s14-22 14-32C32 8.3 25.7 2 18 2z" fill="url(%23g)" stroke="%23991b1b" stroke-width="1" filter="url(%23s)"/>`,
        `<circle cx="18" cy="16" r="5.5" fill="white" opacity="0.95"/>`,
        `</svg>`,
      ].join("");
      const pinUri = `data:image/svg+xml,${pinSvg}`;

      mountainMarkerRef.current = v.entities.add({
        position: Cartesian3.fromDegrees(searchedMountain.lng, searchedMountain.lat),
        billboard: {
          image: pinUri,
          width: 28,
          height: 40,
          verticalOrigin: VerticalOrigin.BOTTOM,
          horizontalOrigin: HorizontalOrigin.CENTER,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          pixelOffset: new Cartesian2(0, 2),
        },
      });

      // SVG label — clean white text with dark outline for readability
      const name = searchedMountain.name;
      const escaped = name.replace(/&/g, "%26amp;").replace(/</g, "%26lt;");
      const charW = 9;
      const textW = name.length * charW;
      const svgW = textW + 20;
      const svgH = 28;

      const labelSvg = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">`,
        `<defs>`,
        `<filter id="o" x="-5%25" y="-15%25" width="110%25" height="130%25">`,
        `<feMorphology operator="dilate" radius="2.5" in="SourceAlpha" result="expanded"/>`,
        `<feGaussianBlur in="expanded" stdDeviation="1.2" result="blurred"/>`,
        `<feFlood flood-color="%23000" flood-opacity="0.7" result="color"/>`,
        `<feComposite in="color" in2="blurred" operator="in" result="shadow"/>`,
        `<feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge>`,
        `</filter>`,
        `</defs>`,
        `<text x="${svgW / 2}" y="${svgH / 2 + 5}" text-anchor="middle" `,
        `font-family="-apple-system, 'SF Pro Display', 'Segoe UI', Roboto, Helvetica, sans-serif" `,
        `font-size="15" font-weight="600" letter-spacing="0.5" fill="white" filter="url(%23o)">`,
        `${escaped}`,
        `</text>`,
        `</svg>`,
      ].join("");
      const labelUri = `data:image/svg+xml,${encodeURIComponent(labelSvg)}`;

      mountainLabelRef.current = v.entities.add({
        position: Cartesian3.fromDegrees(searchedMountain.lng, searchedMountain.lat),
        billboard: {
          image: labelUri,
          width: svgW,
          height: svgH,
          verticalOrigin: VerticalOrigin.BOTTOM,
          horizontalOrigin: HorizontalOrigin.CENTER,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          pixelOffset: new Cartesian2(0, -42),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }

    return () => {
      if (mountainMarkerRef.current && v.entities.contains(mountainMarkerRef.current)) {
        v.entities.remove(mountainMarkerRef.current);
        mountainMarkerRef.current = null;
      }
      if (mountainLabelRef.current && v.entities.contains(mountainLabelRef.current)) {
        v.entities.remove(mountainLabelRef.current);
        mountainLabelRef.current = null;
      }
    };
  }, [searchedMountain, viewer]);

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
