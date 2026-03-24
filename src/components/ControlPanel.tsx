import { useState } from "react";
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
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleMountainSelect = (m: MountainResult) => {
    onMountainSelect(m);
    setMobileOpen(false);
  };

  return (
    <>
      {/* ===== Mobile: floating search bar + settings toggle ===== */}
      <div className="md:hidden absolute top-3 left-3 right-14 z-20 flex items-center gap-2">
        <div className="flex-1 glass-panel flex items-center rounded-full overflow-hidden">
          {/* Search icon */}
          <div className="pl-3.5 pr-1 text-slate-400 shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <div className="flex-1">
            <MountainSearch onSelect={handleMountainSelect} mobile />
          </div>
        </div>
        {/* Settings button to open drawer */}
        <button
          onClick={() => setMobileOpen((o) => !o)}
          className="w-10 h-10 rounded-full glass-panel flex items-center justify-center text-slate-300 active:scale-95 transition-transform shrink-0"
          aria-label="Settings"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <circle cx="8" cy="6" r="2" fill="currentColor" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <circle cx="16" cy="12" r="2" fill="currentColor" />
            <line x1="4" y1="18" x2="20" y2="18" />
            <circle cx="12" cy="18" r="2" fill="currentColor" />
          </svg>
        </button>
      </div>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-10 bg-slate-950/40 backdrop-blur-[2px]"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ===== Desktop: full panel / Mobile: slide-in settings drawer ===== */}
      <div
        className={`
          absolute z-10 glass-panel text-white p-5 flex flex-col gap-4
          md:top-4 md:left-4 md:w-[272px] md:translate-x-0
          top-0 left-0 w-[280px] h-full md:h-auto md:rounded-[var(--panel-radius)]
          rounded-none rounded-r-[var(--panel-radius)]
          transition-transform duration-300 ease-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
          pt-16 md:pt-5
          overflow-y-auto
        `}
      >
        <h1
          className="text-2xl font-semibold tracking-wide text-sky-100"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Pow Predictor
        </h1>

        <div className="h-px bg-gradient-to-r from-slate-600/60 via-slate-500/30 to-transparent" />

        {/* Desktop search (hidden on mobile since it's in the floating bar) */}
        <div className="hidden md:block">
          <MountainSearch onSelect={handleMountainSelect} />
        </div>

        {/* Mobile: label in drawer */}
        <div className="md:hidden text-xs text-slate-500 font-light -mb-2">
          Use the search bar at the top to find mountains
        </div>

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
          onClick={() => { onHistoricalMode(); setMobileOpen(false); }}
          disabled={historicalLoading || historicalMode || selectionMode}
          className="bg-gradient-to-b from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-400 text-white text-sm font-medium py-2.5 rounded-lg shadow-lg shadow-emerald-900/30 transition-all"
        >
          {historicalLoading ? "Loading weather data..." : historicalMode ? "Simulation Active" : selectionMode ? "Select a point..." : "Run Pow Simulation"}
        </button>

        <div className="flex gap-2 text-xs">
          <button
            onClick={onToggleWind}
            className={`flex-1 py-2 md:py-1.5 rounded-full font-medium transition-all ${showWind ? "bg-sky-600/80 text-white shadow-md shadow-sky-900/30" : "bg-slate-700/60 text-slate-400 hover:bg-slate-700/80"}`}
          >
            Wind {showWind ? "ON" : "OFF"}
          </button>
          <button
            onClick={onToggleSnow}
            className={`flex-1 py-2 md:py-1.5 rounded-full font-medium transition-all ${showSnow ? "bg-sky-600/80 text-white shadow-md shadow-sky-900/30" : "bg-slate-700/60 text-slate-400 hover:bg-slate-700/80"}`}
          >
            Snow {showSnow ? "ON" : "OFF"}
          </button>
        </div>
      </div>
    </>
  );
}
