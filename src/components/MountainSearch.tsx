import { useState, useRef, useEffect } from "react";
import { searchMountains, type MountainResult } from "../api/kartverket.ts";

interface MountainSearchProps {
  onSelect: (result: MountainResult) => void;
  mobile?: boolean;
}

export default function MountainSearch({ onSelect, mobile }: MountainSearchProps) {
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
    <div ref={containerRef} className={`relative ${mobile ? "" : "flex flex-col gap-1.5"}`}>
      {!mobile && <span className="text-xs text-slate-400 font-light">Search Mountain</span>}
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={mobile ? "Search mountain..." : "e.g. Trolltinden, Galdhøpiggen..."}
        className={mobile
          ? "w-full bg-transparent text-white text-sm py-2.5 pr-3 placeholder-slate-400 outline-none"
          : "bg-slate-800/60 text-white px-3 py-2 rounded-lg text-sm border border-slate-600/30 placeholder-slate-500 outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20 transition-all"
        }
      />
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 glass-panel z-50 max-h-48 overflow-y-auto">
          {loading && (
            <div className="px-3 py-2.5 text-xs text-slate-400 font-light">Searching...</div>
          )}
          {!loading && results.length === 0 && query.length >= 2 && (
            <div className="px-3 py-2.5 text-xs text-slate-400 font-light">No mountains found</div>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.name}-${r.lat}-${r.lng}-${i}`}
              onClick={() => {
                onSelect(r);
                setQuery(r.name);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2.5 hover:bg-sky-500/10 border-l-2 border-l-transparent hover:border-l-sky-400 transition-all border-b border-slate-700/30 last:border-b-0"
            >
              <div className="text-sm font-medium text-slate-100">{r.name}</div>
              <div className="text-xs text-slate-400 font-light">
                {r.type} — {r.municipality}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
