import { useState, useEffect, useRef } from "react";

interface TimelineBarProps {
  steps: {
    timestamp: Date;
    temp: number;
    precip: number;
    windSpeed: number;
    windDir: number;
  }[];
  currentStep: number;
  onStepChange: (step: number) => void;
  onExit: () => void;
}

export default function TimelineBar({ steps, currentStep, onStepChange, onExit }: TimelineBarProps) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (!playing) {
      clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      onStepChange(-1); // -1 signals "advance by 1"
    }, 1000 / speed);
    return () => clearInterval(timerRef.current);
  }, [playing, speed, onStepChange]);

  const step = steps[currentStep];
  if (!step) return null;

  const isForecast = step.timestamp.getTime() > Date.now();

  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 glass-bar px-5 py-3.5">
      <div className="flex items-center gap-4 max-w-5xl mx-auto">
        {/* Playback controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onStepChange(Math.max(0, currentStep - 1))}
            className="w-8 h-8 flex items-center justify-center text-xs bg-slate-700/60 hover:bg-slate-600/70 text-slate-300 rounded-full"
          >
            ◀
          </button>
          <button
            onClick={() => setPlaying(!playing)}
            className={`w-9 h-9 flex items-center justify-center text-sm font-semibold rounded-full shadow-lg ${
              playing
                ? "bg-amber-500/90 text-slate-900 shadow-amber-900/30"
                : "bg-sky-500/90 hover:bg-sky-400/90 text-white shadow-sky-900/30"
            }`}
          >
            {playing ? "⏸" : "▶"}
          </button>
          <button
            onClick={() => onStepChange(Math.min(steps.length - 1, currentStep + 1))}
            className="w-8 h-8 flex items-center justify-center text-xs bg-slate-700/60 hover:bg-slate-600/70 text-slate-300 rounded-full"
          >
            ▶
          </button>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="bg-slate-700/50 text-xs text-slate-300 rounded-full px-2 py-1.5 ml-1 border border-slate-600/30 outline-none"
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
            <option value={8}>8x</option>
            <option value={16}>16x</option>
          </select>
        </div>

        {/* Time scrubber */}
        <input
          type="range"
          min={0}
          max={steps.length - 1}
          value={currentStep}
          onChange={(e) => { setPlaying(false); onStepChange(Number(e.target.value)); }}
          className="flex-1"
        />

        {/* Current info */}
        <div className="flex items-center gap-2.5 text-xs whitespace-nowrap">
          <span className="font-medium text-slate-100 tabular-nums">
            {fmtDate(step.timestamp)} {fmtTime(step.timestamp)}
          </span>
          {isForecast && (
            <span className="text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full text-[10px] font-medium">
              Forecast
            </span>
          )}
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium tabular-nums ${
            step.temp <= 0
              ? "text-sky-300 bg-sky-500/10 border border-sky-500/15"
              : "text-amber-300 bg-amber-500/10 border border-amber-500/15"
          }`}>
            {step.temp.toFixed(1)}°C
          </span>
          <span className="text-blue-300 bg-blue-500/10 border border-blue-500/15 px-2 py-0.5 rounded-full text-[11px] font-medium tabular-nums">
            {step.precip.toFixed(1)}mm
          </span>
          <span className="text-slate-400 tabular-nums text-[11px]">
            {step.windSpeed.toFixed(0)}m/s {Math.round(step.windDir)}°
          </span>
        </div>

        {/* Exit button */}
        <button
          onClick={onExit}
          className="px-3 py-1.5 text-xs font-medium bg-red-600/20 hover:bg-red-600/40 text-red-300 border border-red-500/20 rounded-full transition-all"
        >
          Exit
        </button>
      </div>
    </div>
  );
}
