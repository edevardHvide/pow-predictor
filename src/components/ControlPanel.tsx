import WindCompass from "./WindCompass.tsx";
import MountainSearch from "./MountainSearch.tsx";
import type { MountainResult } from "../api/kartverket.ts";
import type { WindParams } from "../types/wind.ts";

interface ControlPanelProps {
  params: WindParams;
  showSnow: boolean;
  showWind: boolean;
  historicalMode: boolean;
  historicalLoading: boolean;
  selectionMode: boolean;
  onParamsChange: (p: WindParams) => void;
  onMountainSelect: (m: MountainResult) => void;
  onToggleSnow: () => void;
  onToggleWind: () => void;
  onHistoricalMode: () => void;
}

export default function ControlPanel({
  params,
  showSnow,
  showWind,
  historicalMode,
  historicalLoading,
  selectionMode,
  onParamsChange,
  onMountainSelect,
  onToggleSnow,
  onToggleWind,
  onHistoricalMode,
}: ControlPanelProps) {
  return (
    <div className="absolute top-4 left-4 z-10 glass-panel text-white p-5 w-[272px] flex flex-col gap-4">
      <h1
        className="text-2xl font-semibold tracking-wide text-sky-100"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Pow Predictor
      </h1>

      <div className="h-px bg-gradient-to-r from-slate-600/60 via-slate-500/30 to-transparent" />

      <MountainSearch onSelect={onMountainSelect} />

      {!historicalMode && (
        <>
          <div className="h-px bg-gradient-to-r from-slate-600/40 to-transparent" />

          <WindCompass
            direction={params.direction}
            onChange={(d) => onParamsChange({ ...params, direction: d })}
          />

          <label className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-slate-400 font-light">Wind Speed</span>
              <span className="text-sm font-medium text-sky-300 tabular-nums">{params.speed} m/s</span>
            </div>
            <input
              type="range"
              min="0"
              max="30"
              value={params.speed}
              onChange={(e) => onParamsChange({ ...params, speed: Number(e.target.value) })}
            />
          </label>
        </>
      )}

      {historicalMode && (
        <div className="text-xs text-sky-300 bg-sky-950/40 border border-sky-800/30 rounded-lg p-2.5 text-center font-light">
          Simulation Active — use timeline below
        </div>
      )}

      <div className="h-px bg-gradient-to-r from-slate-600/40 to-transparent" />

      <button
        onClick={onHistoricalMode}
        disabled={historicalLoading || historicalMode || selectionMode}
        className="bg-gradient-to-b from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-400 text-white text-sm font-medium py-2.5 rounded-lg shadow-lg shadow-emerald-900/30 transition-all"
      >
        {historicalLoading ? "Loading weather data..." : historicalMode ? "Simulation Active" : selectionMode ? "Select a point..." : "Run Pow Simulation"}
      </button>

      <div className="flex gap-2 text-xs">
        <button
          onClick={onToggleWind}
          className={`flex-1 py-1.5 rounded-full font-medium transition-all ${showWind ? "bg-sky-600/80 text-white shadow-md shadow-sky-900/30" : "bg-slate-700/60 text-slate-400 hover:bg-slate-700/80"}`}
        >
          Wind {showWind ? "ON" : "OFF"}
        </button>
        <button
          onClick={onToggleSnow}
          className={`flex-1 py-1.5 rounded-full font-medium transition-all ${showSnow ? "bg-sky-600/80 text-white shadow-md shadow-sky-900/30" : "bg-slate-700/60 text-slate-400 hover:bg-slate-700/80"}`}
        >
          Snow {showSnow ? "ON" : "OFF"}
        </button>
      </div>
    </div>
  );
}
