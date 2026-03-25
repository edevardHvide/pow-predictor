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
    const r1 = i % 2 === 0 ? 39 : 42;
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
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-xs text-slate-400 font-light">Wind from</span>
        <span className="text-sm font-medium text-sky-300 tabular-nums">
          {dirLabel(direction)} {direction}°
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox="0 0 120 120"
        className="w-36 h-36 cursor-pointer select-none"
        onPointerDown={handlePointer}
        onPointerMove={(e) => e.buttons && handlePointer(e)}
      >
        {/* Subtle outer glow ring */}
        <circle cx="60" cy="60" r="48" fill="none" stroke="rgba(125,211,252,0.06)" strokeWidth="3" />

        {/* Outer ring */}
        <circle cx="60" cy="60" r="46" fill="none" stroke="#475569" strokeWidth="1.5" />
        <circle cx="60" cy="60" r="46" fill="none" stroke="#64748b" strokeWidth="0.3" strokeDasharray="2 4" />

        {/* Inner subtle ring */}
        <circle cx="60" cy="60" r="36" fill="none" stroke="#334155" strokeWidth="0.5" />

        {/* Tick marks */}
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            stroke={t.major ? "#94a3b8" : "#64748b"}
            strokeWidth={t.major ? 1.5 : 0.8}
          />
        ))}

        {/* Cardinal labels */}
        <text x="60" y="9" textAnchor="middle" fill="#e2e8f0" fontSize="9" fontWeight="600" style={{ fontFamily: "var(--font-body)" }}>N</text>
        <text x="112" y="63" textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="400" style={{ fontFamily: "var(--font-body)" }}>E</text>
        <text x="60" y="117" textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="400" style={{ fontFamily: "var(--font-body)" }}>S</text>
        <text x="8" y="63" textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="400" style={{ fontFamily: "var(--font-body)" }}>W</text>

        {/* Arrow shaft */}
        <line
          x1={tailX} y1={tailY} x2={tipX} y2={tipY}
          stroke="#7dd3fc" strokeWidth="2.5" strokeLinecap="round"
        />

        {/* Arrow head */}
        <polygon points={headPoints} fill="#7dd3fc" />

        {/* Center dot */}
        <circle cx="60" cy="60" r="2" fill="#7dd3fc" opacity="0.6" />
      </svg>
    </div>
  );
}
