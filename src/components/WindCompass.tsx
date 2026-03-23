import { useRef, useCallback } from "react";

interface WindCompassProps {
  direction: number;
  onChange: (deg: number) => void;
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

  const arrowRad = ((direction - 180) * Math.PI) / 180; // points where wind goes TO
  const arrowX = 50 + 30 * Math.sin(arrowRad);
  const arrowY = 50 - 30 * Math.cos(arrowRad);
  const tailX = 50 - 30 * Math.sin(arrowRad);
  const tailY = 50 + 30 * Math.cos(arrowRad);

  return (
    <div className="flex flex-col items-center">
      <span className="text-xs text-gray-400 mb-1">Wind from {direction}°</span>
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        className="w-24 h-24 cursor-pointer"
        onPointerDown={handlePointer}
        onPointerMove={(e) => e.buttons && handlePointer(e)}
      >
        <circle cx="50" cy="50" r="45" fill="none" stroke="#555" strokeWidth="1" />
        {/* Cardinal labels */}
        <text x="50" y="10" textAnchor="middle" fill="#999" fontSize="8">N</text>
        <text x="93" y="53" textAnchor="middle" fill="#999" fontSize="8">E</text>
        <text x="50" y="96" textAnchor="middle" fill="#999" fontSize="8">S</text>
        <text x="7" y="53" textAnchor="middle" fill="#999" fontSize="8">W</text>
        {/* Arrow line */}
        <line x1={tailX} y1={tailY} x2={arrowX} y2={arrowY} stroke="#60a5fa" strokeWidth="2.5" />
        {/* Arrow head */}
        <circle cx={arrowX} cy={arrowY} r="4" fill="#60a5fa" />
        {/* Origin dot */}
        <circle cx={tailX} cy={tailY} r="2" fill="#f87171" />
      </svg>
    </div>
  );
}
