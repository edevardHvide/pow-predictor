import { useRef, useCallback } from "react";

interface WindCompassProps {
  direction: number;
  onChange: (deg: number) => void;
}

const CARDINAL = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

function dirLabel(deg: number): string {
  const i = Math.round(deg / 45) % 8;
  return CARDINAL[i];
}

export default function WindCompass({ direction, onChange }: WindCompassProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const handlePointer = useCallback(
    (e: React.PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
      if (angle < 0) angle += 360;
      onChange(Math.round(angle));
    },
    [onChange],
  );

  // Arrow points in the direction wind is GOING (from - 180)
  const toRad = ((direction + 180) * Math.PI) / 180;
  const sin = Math.sin(toRad);
  const cos = -Math.cos(toRad);

  // Arrow tip and tail positions
  const tipX = 60 + 28 * sin;
  const tipY = 60 + 28 * cos;
  const tailX = 60 - 28 * sin;
  const tailY = 60 - 28 * cos;

  // Arrowhead triangle (pointing in wind direction)
  const headLen = 10;
  const headWidth = 5;
  const perpX = -cos;
  const perpY = sin;
  const baseX = tipX - headLen * sin;
  const baseY = tipY - headLen * cos;
  const headPoints = [
    `${tipX},${tipY}`,
    `${baseX + headWidth * perpX},${baseY + headWidth * perpY}`,
    `${baseX - headWidth * perpX},${baseY - headWidth * perpY}`,
  ].join(" ");

  // Tick marks for cardinal/intercardinal directions
  const ticks = Array.from({ length: 8 }, (_, i) => {
    const a = (i * 45 * Math.PI) / 180;
    const r1 = i % 2 === 0 ? 40 : 42;
    const r2 = 46;
    return {
      x1: 60 + r1 * Math.sin(a),
      y1: 60 - r1 * Math.cos(a),
      x2: 60 + r2 * Math.sin(a),
      y2: 60 - r2 * Math.cos(a),
      major: i % 2 === 0,
    };
  });

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs text-gray-400">Wind from</span>
        <span className="text-sm font-semibold text-blue-400">
          {dirLabel(direction)} {direction}°
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox="0 0 120 120"
        className="w-32 h-32 cursor-pointer select-none"
        onPointerDown={handlePointer}
        onPointerMove={(e) => e.buttons && handlePointer(e)}
      >
        {/* Outer ring */}
        <circle cx="60" cy="60" r="46" fill="none" stroke="#374151" strokeWidth="1.5" />
        <circle cx="60" cy="60" r="46" fill="none" stroke="#4b5563" strokeWidth="0.5" strokeDasharray="2 4" />

        {/* Tick marks */}
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            stroke={t.major ? "#9ca3af" : "#6b7280"}
            strokeWidth={t.major ? 1.5 : 1}
          />
        ))}

        {/* Cardinal labels */}
        <text x="60" y="9" textAnchor="middle" fill="#d1d5db" fontSize="9" fontWeight="bold">N</text>
        <text x="112" y="63" textAnchor="middle" fill="#9ca3af" fontSize="8">E</text>
        <text x="60" y="117" textAnchor="middle" fill="#9ca3af" fontSize="8">S</text>
        <text x="8" y="63" textAnchor="middle" fill="#9ca3af" fontSize="8">W</text>

        {/* Arrow shaft */}
        <line
          x1={tailX} y1={tailY} x2={tipX} y2={tipY}
          stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round"
        />

        {/* Arrow head */}
        <polygon points={headPoints} fill="#3b82f6" />

        {/* Origin dot (wind comes FROM here) */}
        <circle cx={tailX} cy={tailY} r="3" fill="#ef4444" stroke="#1f2937" strokeWidth="1" />

        {/* Center dot */}
        <circle cx="60" cy="60" r="2" fill="#6b7280" />
      </svg>
    </div>
  );
}
