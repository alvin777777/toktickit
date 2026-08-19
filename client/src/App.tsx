import { useState } from "react";
import { checkSystem, Category } from "./api.js";

// UI states you must handle for Issue 4: idle, loading, success, error.
type UiState = "idle" | "loading" | "success" | "error";

export default function App() {
  const [state, setState] = useState<UiState>("idle");
  const [categories, setCategories] = useState<Category[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleCheck() {
    setState("loading");
    try {
      const result = await checkSystem();
      setCategories(result.categories);
      setState("success");
    } catch {
      setErrorMessage("Unable to connect to TokTickIT API");
      setState("error");
    }
  }

  return (
    <div className="container py-5" style={{ maxWidth: 640 }}>
      <h1 className="h3 mb-4">
        TokTickIT <span className="text-success">IT Service Desk</span>
      </h1>

      <button className="btn btn-success" onClick={handleCheck} disabled={state === "loading"}>
        {state === "loading" ? "Loading…" : "Check System"}
      </button>

      {state === "loading" && <p className="mt-3 text-muted">⏳ Loading…</p>}

      {state === "success" && (
        <div className="mt-3">
          <p className="mb-2">
            System Status: <span className="text-success fw-bold">Online</span>
          </p>
          {categories.length > 0 && (
            <>
              <p className="mb-1">Supported Request Categories:</p>
              <ul>
                {categories.map((c) => (
                  <li key={c.id}>{c.name}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {state === "error" && (
        <div className="mt-3">
          <p className="mb-1">
            System Status: <span className="text-danger fw-bold">Offline</span>
          </p>
          <p className="text-danger">{errorMessage}</p>
        </div>
      )}
    </div>
  );
}
