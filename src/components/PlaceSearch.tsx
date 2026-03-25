import { useState, useRef, useEffect } from "react";
import { searchPlaces, type PlaceResult } from "../api/kartverket.ts";

interface PlaceSearchProps {
  onSelect: (result: PlaceResult) => void;
  mobile?: boolean;
  query?: string;
  onQueryChange?: (q: string) => void;
  results?: PlaceResult[];
  onResultsChange?: (r: PlaceResult[]) => void;
}

export default function PlaceSearch({
  onSelect,
  mobile,
  query: controlledQuery,
  onQueryChange,
  results: controlledResults,
  onResultsChange,
}: PlaceSearchProps) {
  const [internalQuery, setInternalQuery] = useState("");
  const [internalResults, setInternalResults] = useState<PlaceResult[]>([]);

  const query = controlledQuery ?? internalQuery;
  const setQuery = onQueryChange ?? setInternalQuery;
  const results = controlledResults ?? internalResults;
  const setResults = onResultsChange ?? setInternalResults;

  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const skipSearchRef = useRef(false);

  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }

    if (query.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      const res = await searchPlaces(query);
      setResults(res);
      setOpen(true);
      setLoading(false);
    }, 300);

    return () => clearTimeout(timerRef.current);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Hvor går turen?"
        className={mobile
          ? "w-full bg-transparent text-white text-sm py-2.5 pr-3 placeholder-slate-400 outline-none"
          : "bg-slate-800/60 text-white px-3 py-2 rounded-lg text-sm border border-slate-600/30 placeholder-slate-500 outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20 transition-all"
        }
      />
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 glass-panel z-50 max-h-48 overflow-y-auto">
          {loading && (
            <div className="px-3 py-2.5 text-xs text-slate-400 font-light">Søker...</div>
          )}
          {!loading && results.length === 0 && query.length >= 2 && (
            <div className="px-3 py-2.5 text-xs text-slate-400 font-light">Ingen treff</div>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.name}-${r.lat}-${r.lng}-${i}`}
              onClick={() => {
                onSelect(r);
                skipSearchRef.current = true;
                setQuery(r.name);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2.5 hover:bg-sky-500/10 border-l-2 border-l-transparent hover:border-l-sky-400 transition-all border-b border-slate-700/30 last:border-b-0"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-100">{r.name}</span>
                <span className="text-[10px] text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded-full leading-none">{r.type}</span>
              </div>
              <div className="text-xs text-slate-400 font-light mt-0.5">
                {r.municipality}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
