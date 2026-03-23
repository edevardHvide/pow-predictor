import WindCompass from "./WindCompass.tsx";
import MountainSearch from "./MountainSearch.tsx";
import type { MountainResult } from "../api/kartverket.ts";
import type { WindParams } from "../types/wind.ts";

interface ControlPanelProps {
  params: WindParams;
  simulating: boolean;
  showSnow: boolean;
  showWind: boolean;
  onParamsChange: (p: WindParams) => void;
  onMountainSelect: (m: MountainResult) => void;
  onSimulate: () => void;
  onToggleSnow: () => void;
  onToggleWind: () => void;
}

export default function ControlPanel({
  params,
  simulating,
  showSnow,
  showWind,
  onParamsChange,
  onMountainSelect,
  onSimulate,
  onToggleSnow,
  onToggleWind,
}: ControlPanelProps) {
  return (
    <div className="absolute top-4 left-4 z-10 bg-gray-900/90 text-white rounded-xl p-4 w-64 backdrop-blur-sm shadow-2xl flex flex-col gap-3">
      <h1 className="text-lg font-bold tracking-tight">Alpine Wind</h1>

      <MountainSearch onSelect={onMountainSelect} />

      <WindCompass
        direction={params.direction}
        onChange={(d) => onParamsChange({ ...params, direction: d })}
      />

      <label className="flex flex-col gap-1">
        <span className="text-xs text-gray-400">Wind Speed: {params.speed} m/s</span>
        <input
          type="range"
          min="0"
          max="30"
          value={params.speed}
          onChange={(e) => onParamsChange({ ...params, speed: Number(e.target.value) })}
          className="accent-blue-500"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-gray-400">Temperature: {params.temperature}°C</span>
        <input
          type="range"
          min="-20"
          max="5"
          value={params.temperature}
          onChange={(e) => onParamsChange({ ...params, temperature: Number(e.target.value) })}
          className="accent-orange-500"
        />
      </label>

      <button
        onClick={onSimulate}
        disabled={simulating}
        className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white font-semibold py-2 rounded-lg transition-colors"
      >
        {simulating ? "Simulating..." : "Run Simulation"}
      </button>

      <div className="flex gap-2 text-xs">
        <button
          onClick={onToggleWind}
          className={`flex-1 py-1 rounded ${showWind ? "bg-blue-600" : "bg-gray-700"}`}
        >
          Wind {showWind ? "ON" : "OFF"}
        </button>
        <button
          onClick={onToggleSnow}
          className={`flex-1 py-1 rounded ${showSnow ? "bg-cyan-600" : "bg-gray-700"}`}
        >
          Snow {showSnow ? "ON" : "OFF"}
        </button>
      </div>
    </div>
  );
}
