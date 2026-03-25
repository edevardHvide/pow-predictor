import { useState } from "react";
import WindCompass from "./WindCompass.tsx";
import PlaceSearch from "./PlaceSearch.tsx";
import FeedbackModal from "./FeedbackModal.tsx";
import type { PlaceResult } from "../api/kartverket.ts";
import type { WindParams } from "../types/wind.ts";

interface ControlPanelProps {
  params: WindParams;
  showSnow: boolean;
  showWind: boolean;
  historicalMode: boolean;
  historicalLoading: boolean;
  selectionMode: boolean;
  onParamsChange: (p: WindParams) => void;
  onMountainSelect: (m: PlaceResult) => void;
  onToggleSnow: () => void;
  onToggleWind: () => void;
  onHistoricalMode: () => void;
  onExitHistorical: () => void;
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
  onExitHistorical,
}: ControlPanelProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  // Shared search state between mobile floating bar and desktop panel
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);

  const handleMountainSelect = (m: PlaceResult) => {
    onMountainSelect(m);
    setMobileOpen(false);
  };

  const searchProps = {
    onSelect: handleMountainSelect,
    query: searchQuery,
    onQueryChange: setSearchQuery,
    results: searchResults,
    onResultsChange: setSearchResults,
  };

  return (
    <>
      {/* ===== Mobile: floating search bar + settings toggle ===== */}
      {/* Hidden when drawer is open — search moves inside drawer */}
      {!mobileOpen && (
        <div className="md:hidden absolute top-3 left-3 right-14 z-20 flex items-center gap-2 safe-area-top">
          <div className="flex-1 glass-panel flex items-center rounded-full">
            <div className="pl-3.5 pr-1 text-slate-400 shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <div className="flex-1">
              <PlaceSearch {...searchProps} mobile />
            </div>
          </div>
          <button
            onClick={() => setMobileOpen(true)}
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
      )}

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
          absolute z-10 glass-panel text-white p-4 md:p-5 flex flex-col gap-3 md:gap-4
          md:top-4 md:left-4 md:w-[272px] md:translate-x-0
          top-0 left-0 w-[280px] h-full md:h-auto md:rounded-[var(--panel-radius)]
          rounded-none rounded-r-[var(--panel-radius)]
          transition-transform duration-300 ease-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
          overflow-y-auto
        `}
      >
        {/* Safe area spacer for standalone PWA */}
        <div className="safe-area-top" />

        <div className="flex items-center justify-between">
          <h1
            className="text-xl md:text-2xl font-semibold tracking-wide text-sky-100"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Pow Predictor
          </h1>
          {/* Close button on mobile */}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden w-8 h-8 rounded-full bg-slate-700/60 flex items-center justify-center text-slate-400 active:scale-95"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="h-px bg-gradient-to-r from-slate-600/60 via-slate-500/30 to-transparent" />

        {/* Search — always visible in drawer on mobile, always in panel on desktop */}
        <PlaceSearch {...searchProps} />

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

        <div className="h-px bg-gradient-to-r from-slate-600/40 to-transparent" />

        <button
          onClick={() => {
            if (historicalMode) {
              onExitHistorical();
            } else {
              onHistoricalMode();
            }
            setMobileOpen(false);
          }}
          disabled={historicalLoading || selectionMode}
          className={historicalMode
            ? "bg-gradient-to-b from-rose-500/80 to-rose-600/80 hover:from-rose-400/90 hover:to-rose-500/90 text-white text-sm font-medium py-2.5 rounded-lg shadow-lg shadow-rose-900/20 transition-all"
            : "bg-gradient-to-b from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-400 text-white text-sm font-medium py-2.5 rounded-lg shadow-lg shadow-emerald-900/30 transition-all"
          }
        >
          {historicalLoading ? "Loading weather data..." : historicalMode ? "Stop Simulation" : selectionMode ? "Select a point..." : "Run Pow Simulation"}
        </button>

        {!historicalMode && (
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
        )}

        {/* Feedback + version */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => setFeedbackOpen(true)}
            className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-sky-400 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            Feedback
          </button>
          <span className="text-[10px] text-slate-600 font-light">v{__APP_VERSION__}</span>
        </div>
      </div>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  );
}
