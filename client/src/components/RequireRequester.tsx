import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useRequester } from "../context/RequesterContext.js";
import AppShell from "./AppShell.js";

// AC-02 / BR-23 — opening any Requester-scoped screen without a selected Development
// Requester redirects to the selection screen instead of rendering the page.
export default function RequireRequester({ children }: { children: ReactNode }) {
  const { requester } = useRequester();

  if (!requester) {
    return <Navigate to="/select" replace />;
  }

  return <AppShell>{children}</AppShell>;
}
