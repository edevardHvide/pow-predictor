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

  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 bg-gray-900/95 backdrop-blur-sm border-t border-gray-700 px-4 py-3">
      <div className="flex items-center gap-4 max-w-4xl mx-auto">
        {/* Playback controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onStepChange(Math.max(0, currentStep - 1))}
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded"
          >
            ◀
          </button>
          <button
            onClick={() => setPlaying(!playing)}
            className={`px-3 py-1 text-sm font-semibold rounded ${playing ? "bg-orange-600" : "bg-blue-600 hover:bg-blue-500"}`}
          >
            {playing ? "⏸" : "▶"}
          </button>
          <button
            onClick={() => onStepChange(Math.min(steps.length - 1, currentStep + 1))}
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded"
          >
            ▶
          </button>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="bg-gray-700 text-xs rounded px-1 py-1 ml-1"
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
          </select>
        </div>

        {/* Time scrubber */}
        <input
          type="range"
          min={0}
          max={steps.length - 1}
          value={currentStep}
          onChange={(e) => { setPlaying(false); onStepChange(Number(e.target.value)); }}
          className="flex-1 accent-blue-500"
        />

        {/* Current info */}
        <div className="flex items-center gap-3 text-xs text-gray-300 whitespace-nowrap">
          <span className="font-semibold text-white">
            {fmtDate(step.timestamp)} {fmtTime(step.timestamp)}
          </span>
          <span className={step.temp <= 0 ? "text-cyan-400" : "text-orange-400"}>
            {step.temp.toFixed(1)}°C
          </span>
          <span className="text-blue-400">
            {step.precip.toFixed(1)}mm
          </span>
          <span className="text-gray-400">
            {step.windSpeed.toFixed(0)}m/s {step.windDir}°
          </span>
        </div>

        {/* Exit button */}
        <button
          onClick={onExit}
          className="px-2 py-1 text-xs bg-red-700 hover:bg-red-600 rounded"
        >
          Exit
        </button>
      </div>
    </div>
  );
}
