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
}: SnowDepthTooltipProps) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768 && "ontouchstart" in window;

  const hasWeather = temp !== undefined;
  const hasDepth = depthCm >= 0;
  const showAnalyzeButton = onAnalyze && !summary && !analysisLoading && !analysisError;

  // Mobile: fixed bottom sheet. Desktop: follow click position.
  if (isMobile) {
    return (
      <div
        className="fixed z-30 bottom-0 left-0 right-0 glass-panel text-white px-4 py-3 pb-[env(safe-area-inset-bottom,8px)] pointer-events-auto border-t border-t-sky-400/40 max-h-[60vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1">
            {hasDepth ? (
              <>
                <p className="text-lg font-semibold text-sky-300 tabular-nums">
                  {depthCm.toFixed(1)} cm
                </p>
                <p className="text-xs text-slate-400 font-light mt-0.5">
                  Predicted snow depth
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-400 font-light">
                {hasWeather ? weatherEmoji(temp!, precip!, windSpeed!, cloudCover ?? 50) + " " : ""}Current weather
              </p>
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

            {showAnalyzeButton && (
              <>
                <div className="h-px bg-slate-700/50 my-2" />
                <button
                  onClick={onAnalyze}
                  className="w-full text-sm text-sky-400 active:text-sky-300 active:bg-sky-400/10 rounded px-2 py-2 transition-colors text-center"
                >
                  Analyze with RegObs + AI
                </button>
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
                <div className="space-y-1.5 text-xs">
                  {summary.dataNotice && (
                    <p className="text-amber-400 font-medium">{summary.dataNotice}</p>
                  )}
                  <p className="text-slate-300"><span className="text-sky-400">Wind</span> {summary.windTransport}</p>
                  <p className="text-slate-300"><span className="text-sky-400">Surface</span> {summary.surfaceConditions}</p>
                  <p className="text-slate-300"><span className="text-sky-400">Stability</span> {summary.stabilityConcerns}</p>
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

  const style = {
    left: `${screenX + 16}px`,
    top: `${screenY - 40}px`,
  };

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
                Predicted snow depth
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-400 font-light">
              {hasWeather ? weatherEmoji(temp!, precip!, windSpeed!, cloudCover ?? 50) + " " : ""}Current weather
            </p>
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

          {/* Analyze conditions button */}
          {showAnalyzeButton && (
            <>
              <div className="h-px bg-slate-700/50 my-2" />
              <button
                onClick={onAnalyze}
                className="w-full text-xs text-sky-400 hover:text-sky-300 hover:bg-sky-400/10 rounded px-2 py-1.5 transition-colors text-center"
              >
                Analyze with RegObs + AI
              </button>
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
              <div className="space-y-1.5 text-[11px]">
                {summary.dataNotice && (
                  <p className="text-amber-400 font-medium">{summary.dataNotice}</p>
                )}
                <p className="text-slate-300"><span className="text-sky-400">Wind</span> {summary.windTransport}</p>
                <p className="text-slate-300"><span className="text-sky-400">Surface</span> {summary.surfaceConditions}</p>
                <p className="text-slate-300"><span className="text-sky-400">Stability</span> {summary.stabilityConcerns}</p>
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
