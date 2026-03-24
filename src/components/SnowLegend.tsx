interface SnowLegendProps {
  mode: "manual" | "historical";
}

export default function SnowLegend({ mode }: SnowLegendProps) {
  const isHistorical = mode === "historical";

  return (
    <div className="absolute bottom-4 left-4 z-10 glass-panel text-white px-4 py-3 text-xs">
      <div className="font-medium text-slate-200 mb-2.5">
        {isHistorical ? "Snow Accumulation" : "Wind Redistribution"}
      </div>
      <div className="flex items-center gap-2">
        <div
          className="w-40 h-3.5 rounded-sm border border-slate-600/30"
          style={{
            background: isHistorical
              ? "linear-gradient(to right, rgba(220,235,255,0.3), #82B4F0, #3264C8, #1E1E8C)"
              : "linear-gradient(to right, #8B7765, #C8C0B8, #FFFFFF, #B0E0FF)",
          }}
        />
      </div>
      <div className="flex justify-between mt-1.5 text-slate-400 font-light w-40">
        {isHistorical ? (
          <>
            <span>0cm</span>
            <span>10</span>
            <span>30</span>
            <span>60+</span>
          </>
        ) : (
          <>
            <span>Scoured</span>
            <span>Base</span>
            <span>Deposited</span>
          </>
        )}
      </div>
    </div>
  );
}
