import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AdminShell } from "@/components/admin-shell";
import { getAdminSession } from "@/lib/admin.functions";

// Server-enforced guard. `getAdminSession` is a server function wrapped in the
// `requireAdmin` middleware: the role decision happens on the server, so hiding
// navigation is never the security boundary. A non-admin session is redirected
// to /auth before any admin page renders.
export const Route = createFileRoute("/_admin")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const session = await getAdminSession();
      return { session };
    } catch {
      throw redirect({ to: "/auth" });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  const { session } = Route.useRouteContext();

  return (
    <AdminShell email={session.email}>
      <Outlet />
    </AdminShell>
  );
}
