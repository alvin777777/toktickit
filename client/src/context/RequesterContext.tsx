import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Requester } from "../api.js";

// Lab 2 Issue 2 — holds the currently selected Development Requester. This is a client-side
// testing convenience only (BR-03/BR-24), not a session: in Lab 3 this whole file is replaced by
// real authentication, and requesterId will come from the server-verified session instead.
export const REQUESTER_STORAGE_KEY = "toktickit.devRequester";
const STORAGE_KEY = REQUESTER_STORAGE_KEY;

interface RequesterContextValue {
  requester: Requester | null;
  selectRequester: (requester: Requester) => void;
  clearRequester: () => void;
}

const RequesterContext = createContext<RequesterContextValue | undefined>(undefined);

export function RequesterProvider({ children }: { children: ReactNode }) {
  const [requester, setRequester] = useState<Requester | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Requester) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (requester) localStorage.setItem(STORAGE_KEY, JSON.stringify(requester));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage unavailable (private mode, etc.) — the in-memory state still works
      // for the current tab, which is all Lab 2's testing mechanism needs.
    }
  }, [requester]);

  function selectRequester(next: Requester) {
    setRequester(next);
  }

  function clearRequester() {
    setRequester(null);
  }

  return (
    <RequesterContext.Provider value={{ requester, selectRequester, clearRequester }}>
      {children}
    </RequesterContext.Provider>
  );
}

export function useRequester(): RequesterContextValue {
  const ctx = useContext(RequesterContext);
  if (!ctx) throw new Error("useRequester must be used within a RequesterProvider");
  return ctx;
}
