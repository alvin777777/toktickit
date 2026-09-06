import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { RequesterProvider } from "./context/RequesterContext.js";
import RequireRequester from "./components/RequireRequester.js";
import RequesterSelect from "./pages/RequesterSelect.js";
import MyTicketsPlaceholder from "./pages/MyTicketsPlaceholder.js";
import CreateTicketPlaceholder from "./pages/CreateTicketPlaceholder.js";

// Lab 2 Issue 2 — App.tsx becomes the router root. The Lab 1 health-check demo now lives in
// components/SystemStatusCard.tsx (see docs/lab-02/specification.md §11).
export default function App() {
  return (
    <RequesterProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/select" element={<RequesterSelect />} />
          <Route
            path="/tickets"
            element={
              <RequireRequester>
                <MyTicketsPlaceholder />
              </RequireRequester>
            }
          />
          <Route
            path="/tickets/new"
            element={
              <RequireRequester>
                <CreateTicketPlaceholder />
              </RequireRequester>
            }
          />
          <Route path="/" element={<Navigate to="/tickets" replace />} />
          <Route path="*" element={<Navigate to="/tickets" replace />} />
        </Routes>
      </BrowserRouter>
    </RequesterProvider>
  );
}
