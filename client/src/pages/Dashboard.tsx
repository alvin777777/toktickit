import { useAuth } from "../context/AuthContext.js";
import RequesterDashboard from "./RequesterDashboard.js";
import StaffDashboard from "./StaffDashboard.js";

// docs/lab-04/ui-spec.md §2 — /dashboard is every role's home (BR-38); the role picks the view.
// The backend still decides what each view may see (BR-33).
export default function Dashboard() {
  const { user } = useAuth();
  if (!user) return null;
  return user.role === "REQUESTER" ? <RequesterDashboard /> : <StaffDashboard />;
}
