import type { TerrainRegion } from "../types/terrain.ts";

interface RegionSelectorProps {
  regions: TerrainRegion[];
  selected: TerrainRegion;
  onChange: (r: TerrainRegion) => void;
}

export default function RegionSelector({ regions, selected, onChange }: RegionSelectorProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-gray-400">Region</span>
      <select
        value={selected.name}
        onChange={(e) => {
          const r = regions.find((r) => r.name === e.target.value);
          if (r) onChange(r);
        }}
        className="bg-gray-800 text-white px-2 py-1 rounded text-sm border border-gray-700"
      >
        {regions.map((r) => (
          <option key={r.name} value={r.name}>
            {r.name}
          </option>
        ))}
      </select>
    </label>
  );
}
