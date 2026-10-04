import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, roleHome, useAuth } from "./context/AuthContext.js";
import RequireAuth from "./components/RequireAuth.js";
import Login from "./pages/Login.js";
import ChangePassword from "./pages/ChangePassword.js";
import MyTickets from "./pages/MyTickets.js";
import CreateTicket from "./pages/CreateTicket.js";
import RequesterTicketDetail from "./pages/RequesterTicketDetail.js";
import StaffTicketQueue from "./pages/StaffTicketQueue.js";
import StaffTicketDetail from "./pages/StaffTicketDetail.js";
import UserManagement from "./pages/UserManagement.js";

// Lab 3 Issue 2 — the router root. Lab 2's /select route and RequesterProvider are gone; every
// screen sits behind RequireAuth, which mirrors the server-side guards for navigation only.
function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.mustChangePassword ? "/change-password" : roleHome(user.role)} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/change-password"
        element={
          <RequireAuth>
            <ChangePassword />
          </RequireAuth>
        }
      />
      <Route
        path="/tickets"
        element={
          <RequireAuth roles={["REQUESTER"]}>
            <MyTickets />
          </RequireAuth>
        }
      />
      <Route
        path="/tickets/new"
        element={
          <RequireAuth roles={["REQUESTER"]}>
            <CreateTicket />
          </RequireAuth>
        }
      />
      <Route
        path="/tickets/:ticketNumber"
        element={
          <RequireAuth roles={["REQUESTER"]}>
            <RequesterTicketDetail />
          </RequireAuth>
        }
      />
      <Route
        path="/staff/queue"
        element={
          <RequireAuth roles={["IT_STAFF", "ADMIN"]}>
            <StaffTicketQueue />
          </RequireAuth>
        }
      />
      <Route
        path="/staff/tickets/:ticketNumber"
        element={
          <RequireAuth roles={["IT_STAFF", "ADMIN"]}>
            <StaffTicketDetail />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/users"
        element={
          <RequireAuth roles={["ADMIN"]}>
            <UserManagement />
          </RequireAuth>
        }
      />
      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
