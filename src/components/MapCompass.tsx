import { useState, useEffect, useCallback } from "react";
import { Math as CesiumMath, type Viewer } from "cesium";

interface MapCompassProps {
  viewer: Viewer | null;
}

export default function MapCompass({ viewer }: MapCompassProps) {
  const [heading, setHeading] = useState(0);

  useEffect(() => {
    if (!viewer) return;
    let animId: number;
    const update = () => {
      setHeading(CesiumMath.toDegrees(viewer.camera.heading));
      animId = requestAnimationFrame(update);
    };
    animId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animId);
  }, [viewer]);

  const resetNorth = useCallback(() => {
    if (!viewer) return;
    const camera = viewer.camera;
    camera.flyTo({
      destination: camera.positionWC.clone(),
      orientation: {
        heading: 0,
        pitch: camera.pitch,
        roll: 0,
      },
      duration: 0.5,
    });
  }, [viewer]);

  return (
    <button
      onClick={resetNorth}
      title="Click to reset to north"
      className="absolute top-4 right-4 z-10 w-14 h-14 rounded-full glass-panel flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-transform"
    >
      <svg
        width="36"
        height="36"
        viewBox="0 0 32 32"
        style={{ transform: `rotate(${-heading}deg)`, transition: "transform 0.1s ease-out" }}
      >
        {/* North arrow (red) */}
        <polygon points="16,3 20,16 16,13 12,16" fill="#f87171" />
        {/* South arrow */}
        <polygon points="16,29 12,16 16,19 20,16" fill="#64748b" />
        {/* N label */}
        <text
          x="16"
          y="2"
          textAnchor="middle"
          fontSize="6"
          fontWeight="bold"
          fill="#f87171"
          style={{ fontFamily: "var(--font-body)" }}
        >
          N
        </text>
      </svg>
    </button>
  );
}
