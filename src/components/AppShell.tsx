import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  Bug,
  ClipboardList,
  Cpu,
  LayoutDashboard,
  LogOut,
  Radar,
  Server,
  ShieldCheck,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { roleLabel, relativeTime } from "@/lib/domain";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
  { to: "/vulnerabilities", label: "Vulnerabilidades", icon: Bug },
  { to: "/incidents", label: "Incidentes", icon: AlertTriangle },
  { to: "/approvals", label: "Aprovações", icon: ShieldCheck },
  { to: "/scans", label: "Scans", icon: Radar },
  { to: "/assets", label: "Ativos", icon: Server },
  { to: "/hermes", label: "Controle Hermes", icon: Cpu },
  { to: "/audit", label: "Auditoria", icon: ClipboardList },
  { to: "/users", label: "Usuários", icon: Users },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, roles } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: agent } = useQuery({
    queryKey: ["agent-status"],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_status")
        .select("*")
        .eq("agent_name", "hermes")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["pending-actions-count"],
    refetchInterval: 30000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("response_actions")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_approval");
      if (error) throw error;
      return count ?? 0;
    },
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const healthy = agent?.health === "healthy";

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="glow-primary flex size-9 items-center justify-center rounded-md bg-primary/15">
            <Activity className="size-5 text-primary" />
          </div>
          <div>
            <p className="font-display text-sm font-bold leading-none">ÓRIGO CYBER</p>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Hermes Command
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
              activeProps={{
                className:
                  "flex items-center justify-between rounded-md px-3 py-2 text-sm bg-sidebar-accent text-primary font-medium border-l-2 border-primary",
              }}
            >
              <span className="flex items-center gap-2.5">
                <item.icon className="size-4" />
                {item.label}
              </span>
              {item.to === "/approvals" && pendingCount > 0 && (
                <span className="rounded-full bg-critical/20 px-2 py-0.5 font-mono text-[10px] text-critical">
                  {pendingCount}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`size-2 rounded-full ${healthy ? "bg-primary animate-pulse" : "bg-critical"}`}
            />
            <span className="font-mono uppercase tracking-wider text-muted-foreground">
              Hermes {agent?.version ?? "—"}
            </span>
          </div>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            heartbeat {relativeTime(agent?.last_heartbeat_at)} · fila {agent?.queue_size ?? 0}
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/70 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-2 lg:hidden">
            <Activity className="size-4 text-primary" />
            <span className="font-display text-sm font-bold">ÓRIGO CYBER</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs font-medium">{user?.email}</p>
              <p className="font-mono text-[10px] uppercase text-muted-foreground">
                {roles.length ? roles.map((r) => roleLabel[r]).join(" · ") : "sem papel"}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 lg:hidden">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs text-muted-foreground"
              activeProps={{
                className: "whitespace-nowrap rounded-md px-3 py-1.5 text-xs bg-secondary text-primary",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="min-w-0 flex-1 p-5">{children}</main>
      </div>
    </div>
  );
}
