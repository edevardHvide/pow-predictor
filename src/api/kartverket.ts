const API_BASE = "https://ws.geonorge.no/stedsnavn/v1/sted";
// API uses navneobjekttypekode (lowercase), not display names
const MOUNTAIN_TYPES = ["fjell", "topp", "berg", "egg", "fjellområde", "isbre"];

export interface MountainResult {
  name: string;
  type: string;
  municipality: string;
  lat: number;
  lng: number;
}

export async function searchMountains(query: string): Promise<MountainResult[]> {
  if (query.length < 2) return [];

  const params = new URLSearchParams({ sok: query, treffPerSide: "10" });
  for (const t of MOUNTAIN_TYPES) {
    params.append("navneobjekttype", t);
  }

  try {
    const res = await fetch(`${API_BASE}?${params}`);
    if (!res.ok) return [];

    const data = await res.json();
    return (data.navn ?? []).map((n: Record<string, unknown>) => {
      const punkt = n.representasjonspunkt as { nord: number; øst: number };
      const stedsnavn = (n.stedsnavn as Array<{ skrivemåte: string }>)?.[0];
      const kommune = (n.kommuner as Array<{ kommunenavn: string }>)?.[0];
      return {
        name: stedsnavn?.skrivemåte ?? "?",
        type: n.navneobjekttype as string,
        municipality: kommune?.kommunenavn ?? "",
        lat: punkt.nord,
        lng: punkt.øst,
      };
    });
  } catch {
    return [];
  }
}
