// Vendored from the portfolio repo's client/src/lib/pypiStats.ts — the world
// module's only cross-boundary import. The apiConfig dependency is inlined as
// a plain timeout constant; the data file is a committed snapshot in
// public/data/pypi-stats.json (refresh it from the portfolio repo's cache).

export interface PyPIPackageStats {
  name: string;
  total_all_time: number;
  total_180d: number;
  last_day: number;
  last_week: number;
  last_month: number;
  daily: { date: string; downloads: number }[];
  weekly: { date: string; downloads: number }[];
}

export interface PyPIStatsData {
  fetched_at: string;
  total_downloads: number;
  packages: Record<string, PyPIPackageStats>;
}

const BASE_URL = import.meta.env.BASE_URL || '/';
const FETCH_TIMEOUT_MS = 10_000;

export async function loadPyPIStats(): Promise<PyPIStatsData | null> {
  try {
    const response = await fetch(`${BASE_URL}data/pypi-stats.json`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
