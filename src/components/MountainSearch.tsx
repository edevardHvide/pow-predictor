import { useState, useRef, useEffect } from "react";
import { searchMountains, type MountainResult } from "../api/kartverket.ts";

interface MountainSearchProps {
  onSelect: (result: MountainResult) => void;
}

export default function MountainSearch({ onSelect }: MountainSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MountainResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      const res = await searchMountains(query);
      setResults(res);
      setOpen(true);
      setLoading(false);
    }, 300);

    return () => clearTimeout(timerRef.current);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1">
      <span className="text-xs text-gray-400">Search Mountain</span>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="e.g. Trolltinden, Galdhøpiggen..."
        className="bg-gray-800 text-white px-2 py-1.5 rounded text-sm border border-gray-700 placeholder-gray-500"
      />
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl z-50 max-h-48 overflow-y-auto">
          {loading && (
            <div className="px-3 py-2 text-xs text-gray-400">Searching...</div>
          )}
          {!loading && results.length === 0 && query.length >= 2 && (
            <div className="px-3 py-2 text-xs text-gray-400">No mountains found</div>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.name}-${r.lat}-${r.lng}-${i}`}
              onClick={() => {
                onSelect(r);
                setQuery(r.name);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-gray-700 transition-colors border-b border-gray-700/50 last:border-0"
            >
              <div className="text-sm font-medium">{r.name}</div>
              <div className="text-xs text-gray-400">
                {r.type} — {r.municipality}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
