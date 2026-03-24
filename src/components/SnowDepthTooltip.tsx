interface SnowDepthTooltipProps {
  depthCm: number;
  lat: number;
  lng: number;
  screenX: number;
  screenY: number;
  onClose: () => void;
}

export default function SnowDepthTooltip({
  depthCm,
  lat,
  lng,
  screenX,
  screenY,
  onClose,
}: SnowDepthTooltipProps) {
  const style = {
    left: `${screenX + 16}px`,
    top: `${screenY - 40}px`,
  };

  return (
    <div
      className="absolute z-30 glass-panel text-white px-4 py-3 pointer-events-auto border-l-[3px] border-l-sky-400"
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-3">
        <div>
          <p className="text-xl font-semibold text-sky-300 tabular-nums">
            {depthCm.toFixed(1)} cm
          </p>
          <p className="text-xs text-slate-400 font-light mt-0.5">
            Predicted snow depth
          </p>
          <div className="h-px bg-slate-700/50 my-1.5" />
          <p className="text-[11px] text-slate-500 font-light tabular-nums">
            {lat.toFixed(4)}°N, {lng.toFixed(4)}°E
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-full text-slate-500 hover:text-white hover:bg-slate-700/60 text-xs transition-all"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
