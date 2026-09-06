const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export interface Category {
  id: number;
  name: string;
}

export interface SystemStatus {
  online: boolean;
  categories: Category[];
}

// Issue 2 + Issue 4 — verify the backend is up, then load the categories.
// Throwing on failure lets the UI show a single Offline/error state.
export async function checkSystem(): Promise<SystemStatus> {
  const healthRes = await fetch(`${API_URL}/api/health`);
  if (!healthRes.ok) throw new Error("Unable to connect to TokTickIT API");

  const categoriesRes = await fetch(`${API_URL}/api/categories`);
  if (!categoriesRes.ok) throw new Error("Unable to connect to TokTickIT API");
  const categories: Category[] = await categoriesRes.json();

  return { online: true, categories };
}

// -----------------------------------------------------------------------------
// Lab 2 Issue 2 — Development Requester context (docs/lab-02/api-spec.md §1).
// This is a testing mechanism, not authentication (BR-03/BR-09).
// -----------------------------------------------------------------------------
export interface Requester {
  id: number;
  name: string;
  email: string;
}

export async function getActiveRequesters(): Promise<Requester[]> {
  const res = await fetch(`${API_URL}/api/requesters`);
  if (!res.ok) throw new Error("Unable to load development requesters");
  return res.json();
}
