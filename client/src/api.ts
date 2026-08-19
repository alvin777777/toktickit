const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export interface Category {
  id: number;
  name: string;
}

export interface SystemStatus {
  online: boolean;
  categories: Category[];
}

// Issue 2 — verify the backend is up via a real API call.
// Throwing on failure lets the UI show a single Offline/error state.
// TODO(Issue 4): once GET /api/categories exists, fetch it here too and
// populate `categories` below instead of returning an empty array.
export async function checkSystem(): Promise<SystemStatus> {
  const healthRes = await fetch(`${API_URL}/api/health`);
  if (!healthRes.ok) throw new Error("Unable to connect to TokTickIT API");

  return { online: true, categories: [] };
}
