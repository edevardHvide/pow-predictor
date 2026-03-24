import { useState, useEffect } from "react";
import { Cartographic, Ellipsoid, SceneMode, type Viewer } from "cesium";

interface ScaleBarProps {
  viewer: Viewer | null;
}

const NICE_VALUES = [
  50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000,
];

function fmt(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000;
    return km === Math.floor(km) ? `${km} km` : `${km.toFixed(1)} km`;
  }
  return `${meters} m`;
}

export default function ScaleBar({ viewer }: ScaleBarProps) {
  const [barWidth, setBarWidth] = useState(0);
  const [distance, setDistance] = useState(0);

  useEffect(() => {
    if (!viewer) return;
    let animId: number;

    const update = () => {
      animId = requestAnimationFrame(update);
      if (viewer.isDestroyed() || viewer.scene.mode === SceneMode.MORPHING) return;

      const canvas = viewer.scene.canvas;
      const cx = Math.floor(canvas.clientWidth / 2);
      const cy = Math.floor(canvas.clientHeight / 2);

      const left = viewer.camera.pickEllipsoid({ x: cx - 100, y: cy } as any, Ellipsoid.WGS84);
      const right = viewer.camera.pickEllipsoid({ x: cx + 100, y: cy } as any, Ellipsoid.WGS84);
      if (!left || !right) return;

      const cL = Cartographic.fromCartesian(left);
      const cR = Cartographic.fromCartesian(right);
      const dLat = cR.latitude - cL.latitude;
      const dLon = cR.longitude - cL.longitude;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(cL.latitude) * Math.cos(cR.latitude) * Math.sin(dLon / 2) ** 2;
      const dist = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      const mpp = dist / 200;
      if (!isFinite(mpp) || mpp <= 0) return;

      const maxPx = 120;
      let best = NICE_VALUES[0];
      for (const v of NICE_VALUES) {
        if (v <= mpp * maxPx) best = v;
        else break;
      }

      setBarWidth(Math.round(best / mpp));
      setDistance(best);
    };

    animId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animId);
  }, [viewer]);

  if (barWidth <= 0) return null;

  const half = distance / 2;

  return (
    <div className="absolute bottom-3 left-2 md:bottom-4 md:left-4 z-10 pointer-events-none select-none">
      {/* Labels */}
      <div className="flex text-[10px] font-medium tabular-nums mb-0.5" style={{ width: `${barWidth}px` }}>
        <span className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">0</span>
        <span className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] flex-1 text-center">{fmt(half)}</span>
        <span className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{fmt(distance)}</span>
      </div>
      {/* Bar: two-tone like the screenshot */}
      <div className="flex" style={{ width: `${barWidth}px`, height: "5px" }}>
        <div className="flex-1 bg-slate-900 border border-white/30 rounded-l-sm" />
        <div className="flex-1 bg-white border border-white/30 rounded-r-sm" />
      </div>
    </div>
  );
}
