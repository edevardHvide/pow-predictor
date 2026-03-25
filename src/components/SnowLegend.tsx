interface SnowLegendProps {
  mode: "manual" | "historical";
}

export default function SnowLegend({ mode }: SnowLegendProps) {
  const isHistorical = mode === "historical";

  return (
    <div className="absolute bottom-32 md:bottom-[12%] right-2 left-auto md:left-4 md:right-auto z-10 glass-panel text-white px-3 md:px-4 py-2 md:py-3 text-xs">
      <div className="font-medium text-slate-200 mb-2.5">
        {isHistorical ? "Snow Accumulation" : "Wind Redistribution"}
      </div>
      <div className="flex items-center gap-2">
        <div
          className="w-40 h-3.5 rounded-sm border border-slate-600/30"
          style={{
            background: isHistorical
              ? "linear-gradient(to right, #786050, #AAB4D2, #2846BE)"
              : "linear-gradient(to right, #8B7765, #C8C0B8, #FFFFFF, #B0E0FF)",
          }}
        />
      </div>
      <div className="flex justify-between mt-1.5 text-slate-400 font-light w-40">
        {isHistorical ? (
          <>
            <span>Scoured</span>
            <span>Average</span>
            <span>Loaded</span>
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
