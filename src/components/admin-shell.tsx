import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  BookOpen,
  Boxes,
  Gauge,
  LayoutDashboard,
  LogOut,
  Server,
  Users,
  Workflow,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.png";

const NAV = [
  { to: "/", label: "首页", icon: LayoutDashboard, exact: true },
  { to: "/providers", label: "Providers", icon: Server, exact: false },
  { to: "/models", label: "Models", icon: Boxes, exact: false },
  { to: "/workflows", label: "Workflows", icon: Workflow, exact: false },
  { to: "/knowledge", label: "Knowledge", icon: BookOpen, exact: false },
  { to: "/users", label: "用户", icon: Users, exact: false },
  { to: "/usage", label: "用量", icon: Gauge, exact: false },
] as const;

export function AdminShell({ email, children }: { email: string | null; children: ReactNode }) {
  const navigate = useNavigate();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-4">
          <img src={logo} alt="" className="size-8" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-sidebar-foreground">AI Studio</p>
            <p className="truncate text-xs text-muted-foreground">Admin Console</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.exact }}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
                activeProps={{ className: "bg-sidebar-accent text-foreground" }}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-6 py-3">
          <span className="text-sm font-medium md:hidden">AI Studio Admin</span>
          <span className="ml-auto truncate text-xs text-muted-foreground">{email ?? "—"}</span>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <LogOut className="size-3.5" /> 退出
          </button>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
