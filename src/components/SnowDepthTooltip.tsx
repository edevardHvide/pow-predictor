import { useRef, useState, useCallback } from "react";
import type { ConditionsSummary } from "../types/conditions";

interface SnowDepthTooltipProps {
  depthCm: number;
  lat: number;
  lng: number;
  screenX: number;
  screenY: number;
  temp?: number;
  precip?: number;
  windSpeed?: number;
  windDir?: number;
  cloudCover?: number;
  elevation?: number;
  onClose: () => void;
  // Conditions analysis
  onAnalyze?: () => void;
  analysisLoading?: boolean;
  analysisError?: string | null;
  summary?: ConditionsSummary | null;
  // Simulation
  onSimulate?: () => void;
}

function windDirLabel(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

function weatherEmoji(temp: number, precip: number, windSpeed: number, cloudCover: number): string {
  if (precip > 1 && temp <= 0) return "❄️";
  if (precip > 0 && temp <= 0) return "🌨️";
  if (precip > 1 && temp > 0) return "🌧️";
  if (precip > 0 && temp > 0) return "🌦️";
  if (windSpeed > 10) return "💨";
  if (cloudCover > 75) return "☁️";
  if (cloudCover > 25) return "⛅";
  return "☀️";
}

export default function SnowDepthTooltip({
  depthCm,
  lat,
  lng,
  screenX,
  screenY,
  temp,
  precip,
  windSpeed,
  windDir,
  cloudCover,
  elevation,
  onClose,
  onAnalyze,
  analysisLoading,
  analysisError,
  summary,
  onSimulate,
}: SnowDepthTooltipProps) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768 && "ontouchstart" in window;

  // Pull-down-to-dismiss state
  const [dragY, setDragY] = useState(0);
  const dragStartY = useRef(0);
  const isDragging = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    isDragging.current = true;
    setDragY(0);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    // Only allow pulling down (positive dy)
    setDragY(Math.max(0, dy));
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (dragY > 80) {
      onClose();
    } else {
      setDragY(0);
    }
  }, [dragY, onClose]);

  const hasWeather = temp !== undefined;
  const weatherLoading = !hasWeather && depthCm < 0; // No weather yet in exploration mode
  const hasDepth = depthCm >= 0;
  const showAnalyzeButton = onAnalyze && !summary && !analysisLoading && !analysisError;

  // Mobile: fixed bottom sheet. Desktop: follow click position.
  if (isMobile) {
    return (
      <div
        className="fixed z-30 bottom-0 left-0 right-0 glass-panel text-white px-4 pt-1 pb-[env(safe-area-inset-bottom,8px)] pointer-events-auto border-t border-t-sky-400/40 max-h-[60vh] flex flex-col"
        style={{
          transform: `translateY(${dragY}px)`,
          transition: isDragging.current ? "none" : "transform 0.25s ease-out",
          opacity: isDragging.current ? Math.max(0.3, 1 - dragY / 200) : 1,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div
          className="flex justify-center py-2 cursor-grab"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="w-10 h-1 rounded-full bg-slate-500/60" />
        </div>
        <div className="flex items-start gap-3 overflow-y-auto min-h-0 px-0 pb-2">
          <div className="flex-1 overflow-y-auto min-h-0">
            {hasDepth ? (
              <>
                <p className="text-lg font-semibold text-sky-300 tabular-nums">
                  {depthCm.toFixed(1)} cm
                </p>
                <p className="text-xs text-slate-400 font-light mt-0.5">
                  Predicted accumulation from sim period
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-400 font-light">
                {hasWeather ? weatherEmoji(temp!, precip!, windSpeed!, cloudCover ?? 50) + " " : ""}Current weather
              </p>
            )}

            {weatherLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-1.5">
                <div className="w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                Loading weather...
              </div>
            )}

            {hasWeather && (
              <>
                <div className="h-px bg-slate-700/50 my-2" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div>
                    <span className="text-slate-500">Temp</span>
                    <span className={`ml-1.5 font-medium tabular-nums ${temp! <= 0 ? "text-sky-300" : "text-amber-300"}`}>
                      {temp!.toFixed(1)}°C
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Precip</span>
                    <span className="ml-1.5 font-medium text-blue-300 tabular-nums">
                      {precip!.toFixed(1)} mm
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Wind</span>
                    <span className="ml-1.5 font-medium text-slate-300 tabular-nums">
                      {windSpeed!.toFixed(1)} m/s
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Dir</span>
                    <span className="ml-1.5 font-medium text-slate-300 tabular-nums">
                      {Math.round(windDir!)}° {windDirLabel(windDir!)}
                    </span>
                  </div>
                </div>
              </>
            )}

            <div className="h-px bg-slate-700/50 my-1.5" />
            <div className="flex items-center gap-2 text-xs text-slate-500 font-light tabular-nums">
              <span>{lat.toFixed(4)}°N, {lng.toFixed(4)}°E</span>
              {elevation !== undefined && elevation >= 40 && (
                <>
                  <span className="text-slate-600">·</span>
                  <span>{Math.round(elevation)} m</span>
                </>
              )}
            </div>

            {(showAnalyzeButton || onSimulate) && !analysisLoading && !analysisError && !summary && (
              <>
                <div className="h-px bg-slate-700/50 my-2" />
                <div className="flex gap-2">
                  {showAnalyzeButton && (
                    <button
                      onClick={onAnalyze}
                      className="flex-1 text-xs text-sky-400 active:text-sky-300 active:bg-sky-400/10 border border-sky-400/25 rounded-lg px-2 py-2 transition-colors text-center"
                    >
                      Analyze RegObs
                    </button>
                  )}
                  {onSimulate && (
                    <button
                      onClick={onSimulate}
                      className="flex-1 text-xs text-emerald-400 active:text-emerald-300 active:bg-emerald-400/10 border border-emerald-400/25 rounded-lg px-2 py-2 transition-colors text-center"
                    >
                      Run Simulation
                    </button>
                  )}
                </div>
              </>
            )}

            {analysisLoading && (
              <>
                <div className="h-px bg-slate-700/50 my-2" />
                <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
                  <div className="w-3 h-3 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                  Fetching RegObs data & analyzing...
                </div>
              </>
            )}

            {analysisError && (
              <>
                <div className="h-px bg-slate-700/50 my-2" />
                <button
                  onClick={onAnalyze}
                  className="w-full text-sm text-amber-400 active:text-amber-300 rounded px-2 py-2 transition-colors text-center"
                >
                  {analysisError} — try again
                </button>
              </>
            )}

            {summary && (
              <>
                <div className="h-px bg-sky-400/30 my-2" />
                <p className="text-[10px] text-slate-500 leading-snug">
                  AI summary based on nearby{" "}
                  <a href="https://regobs.no" target="_blank" rel="noopener noreferrer" className="text-sky-500 active:text-sky-400">RegObs</a>
                  {" "}observations. May be inaccurate — see{" "}
                  <a href="https://varsom.no" target="_blank" rel="noopener noreferrer" className="text-sky-500 active:text-sky-400">varsom.no</a>
                  {" "}for official forecasts.
                </p>
                <div className="space-y-1.5 text-xs mt-1.5">
                  {summary.dataNotice && (
                    <p className="text-amber-400 font-medium">{summary.dataNotice}</p>
                  )}
                  <p className="text-slate-300"><span className="text-sky-400">Wind</span> {summary.windTransport}</p>
                  <p className="text-slate-300"><span className="text-sky-400">Surface</span> {summary.surfaceConditions}</p>
                  <p className="text-slate-300"><span className="text-sky-400">Stability</span> {summary.stabilityConcerns}</p>
                  {summary.observedSnowDepth && (
                    <p className="text-slate-300"><span className="text-emerald-400">Snow depth</span> {summary.observedSnowDepth}</p>
                  )}
                  {summary.bestBet && (
                    <>
                      <div className="h-px bg-emerald-400/20 my-1.5" />
                      <p className="text-slate-300 leading-relaxed"><span className="text-emerald-400 font-medium">Best bet</span> {summary.bestBet}</p>
                    </>
                  )}
                  {summary.topObsUrl && (
                    <a
                      href={summary.topObsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block text-sky-400 active:text-sky-300 mt-1"
                    >
                      Top observation on RegObs →
                    </a>
                  )}
                </div>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-slate-500 active:text-white active:bg-slate-700/60 text-sm transition-all shrink-0"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  const tooltipWidth = 320;
  const tooltipHeight = 300;
  const pad = 16;
  let left = screenX + pad;
  let top = screenY - 40;

  if (left + tooltipWidth > window.innerWidth - pad) {
    left = screenX - tooltipWidth - pad;
  }
  if (top + tooltipHeight > window.innerHeight - pad) {
    top = window.innerHeight - tooltipHeight - pad;
  }
  if (top < pad) {
    top = pad;
  }

  const style = { left: `${left}px`, top: `${top}px` };

  return (
    <div
      className="absolute z-30 glass-panel text-white px-4 py-3 pointer-events-auto border-l-[3px] border-l-sky-400 min-w-[180px] max-w-[320px] max-h-[70vh] overflow-y-auto"
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          {hasDepth ? (
            <>
              <p className="text-xl font-semibold text-sky-300 tabular-nums">
                {depthCm.toFixed(1)} cm
              </p>
              <p className="text-xs text-slate-400 font-light mt-0.5">
                Predicted accumulation from sim period
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-400 font-light">
              {hasWeather ? weatherEmoji(temp!, precip!, windSpeed!, cloudCover ?? 50) + " " : ""}Current weather
            </p>
          )}

          {weatherLoading && (
            <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1.5">
              <div className="w-2.5 h-2.5 border-[1.5px] border-slate-500 border-t-transparent rounded-full animate-spin" />
              Loading weather...
            </div>
          )}

          {hasWeather && (
            <>
              <div className="h-px bg-slate-700/50 my-2" />
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                <div>
                  <span className="text-slate-500">Temp</span>
                  <span className={`ml-1.5 font-medium tabular-nums ${temp! <= 0 ? "text-sky-300" : "text-amber-300"}`}>
                    {temp!.toFixed(1)}°C
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Precip</span>
                  <span className="ml-1.5 font-medium text-blue-300 tabular-nums">
                    {precip!.toFixed(1)} mm
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Wind</span>
                  <span className="ml-1.5 font-medium text-slate-300 tabular-nums">
                    {windSpeed!.toFixed(1)} m/s
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Dir</span>
                  <span className="ml-1.5 font-medium text-slate-300 tabular-nums">
                    {Math.round(windDir!)}° {windDirLabel(windDir!)}
                  </span>
                </div>
              </div>
            </>
          )}

          <div className="h-px bg-slate-700/50 my-1.5" />
          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-light tabular-nums">
            <span>{lat.toFixed(4)}°N, {lng.toFixed(4)}°E</span>
            {elevation !== undefined && elevation >= 40 && (
              <span className="text-slate-600">·</span>
            )}
            {elevation !== undefined && elevation >= 40 && (
              <span>{Math.round(elevation)} m</span>
            )}
          </div>

          {/* Action buttons */}
          {(showAnalyzeButton || onSimulate) && !analysisLoading && !analysisError && !summary && (
            <>
              <div className="h-px bg-slate-700/50 my-2" />
              <div className="flex gap-2">
                {showAnalyzeButton && (
                  <button
                    onClick={onAnalyze}
                    className="flex-1 text-[11px] text-sky-400 hover:text-sky-300 hover:bg-sky-400/10 border border-sky-400/25 rounded-lg px-2 py-1.5 transition-colors text-center"
                  >
                    Analyze RegObs
                  </button>
                )}
                {onSimulate && (
                  <button
                    onClick={onSimulate}
                    className="flex-1 text-[11px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10 border border-emerald-400/25 rounded-lg px-2 py-1.5 transition-colors text-center"
                  >
                    Run Simulation
                  </button>
                )}
              </div>
            </>
          )}

          {/* Loading state */}
          {analysisLoading && (
            <>
              <div className="h-px bg-slate-700/50 my-2" />
              <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
                <div className="w-3 h-3 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                Fetching RegObs data & analyzing...
              </div>
            </>
          )}

          {/* Error state */}
          {analysisError && (
            <>
              <div className="h-px bg-slate-700/50 my-2" />
              <button
                onClick={onAnalyze}
                className="w-full text-xs text-amber-400 hover:text-amber-300 rounded px-2 py-1.5 transition-colors text-center"
              >
                {analysisError} — try again
              </button>
            </>
          )}

          {/* Summary display */}
          {summary && (
            <>
              <div className="h-px bg-sky-400/30 my-2" />
              <p className="text-[10px] text-slate-500 leading-snug">
                AI summary based on nearby{" "}
                <a href="https://regobs.no" target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:text-sky-400">RegObs</a>
                {" "}observations. May be inaccurate — see{" "}
                <a href="https://varsom.no" target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:text-sky-400">varsom.no</a>
                {" "}for official forecasts.
              </p>
              <div className="space-y-1.5 text-[11px] mt-1.5">
                {summary.dataNotice && (
                  <p className="text-amber-400 font-medium">{summary.dataNotice}</p>
                )}
                <p className="text-slate-300"><span className="text-sky-400">Wind</span> {summary.windTransport}</p>
                <p className="text-slate-300"><span className="text-sky-400">Surface</span> {summary.surfaceConditions}</p>
                <p className="text-slate-300"><span className="text-sky-400">Stability</span> {summary.stabilityConcerns}</p>
                {summary.bestBet && (
                  <>
                    <div className="h-px bg-emerald-400/20 my-1.5" />
                    <p className="text-slate-300 leading-relaxed"><span className="text-emerald-400 font-medium">Best bet</span> {summary.bestBet}</p>
                  </>
                )}
                {summary.topObsUrl && (
                  <a
                    href={summary.topObsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-sky-400 hover:text-sky-300 mt-1"
                  >
                    Top observation on RegObs →
                  </a>
                )}
              </div>
            </>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-full text-slate-500 hover:text-white hover:bg-slate-700/60 text-xs transition-all shrink-0"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
