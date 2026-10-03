import { ReactNode } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import * as api from "../../src/api.js";
import { AuthProvider } from "../../src/context/AuthContext.js";

// Shared by the migrated Lab 2 UI tests and the Lab 3 UI tests (docs/lab-03/tests.md): stands up
// the AuthProvider with a mocked GET /api/auth/me so a screen renders as a given signed-in user.
export const REQUESTER_USER: api.AuthUser = {
  id: 1,
  name: "Jennifer Anderson",
  email: "jennifer.anderson@toktickit.dev",
  role: "REQUESTER",
  mustChangePassword: false,
};
export const STAFF_USER: api.AuthUser = {
  id: 7,
  name: "Emily Davis",
  email: "emily.davis@toktickit.dev",
  role: "IT_STAFF",
  mustChangePassword: false,
};
export const ADMIN_USER: api.AuthUser = {
  id: 11,
  name: "John Smith",
  email: "john.smith@toktickit.dev",
  role: "ADMIN",
  mustChangePassword: false,
};

export function mockCurrentUser(user: api.AuthUser | null) {
  return vi.spyOn(api, "getCurrentUser").mockResolvedValue(user);
}

interface Options {
  user?: api.AuthUser | null;
  route?: string;
  // Extra routes rendered alongside `ui` (which is mounted at `path`), e.g. navigation targets.
  path?: string;
  extraRoutes?: { path: string; element: ReactNode }[];
}

export function renderWithAuth(ui: ReactNode, { user = REQUESTER_USER, route = "/", path = "*", extraRoutes = [] }: Options = {}) {
  mockCurrentUser(user);
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <Routes>
          <Route path={path} element={ui} />
          {extraRoutes.map((r) => (
            <Route key={r.path} path={r.path} element={r.element} />
          ))}
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}
