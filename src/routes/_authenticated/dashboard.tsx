import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Panel, SeverityBadge, StatCard, PageHeader } from "@/components/common";
import {
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
  formatDateTime,
  incidentPhaseLabel,
  openVulnStatuses,
  relativeTime,
  severityDot,
  severityOrder,
  vulnStatusLabel,
  type IncidentPhase,
  type Severity,
  type VulnStatus,
} from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Visão geral — Órigo Cyber" },
      {
        name: "description",
        content: "Postura de risco, incidentes abertos e saúde do agente Hermes em tempo real.",
      },
      { property: "og:title", content: "Visão geral — Órigo Cyber" },
      { property: "og:description", content: "Postura de risco e saúde do agente Hermes." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [vulns, incidents, actions, scans, audit, agent] = await Promise.all([
        supabase
          .from("vulnerabilities")
          .select("id,title,severity,status,detected_at,due_at,cve")
          .order("detected_at", { ascending: false }),
        supabase.from("incidents").select("id,reference,title,severity,phase,detected_at"),
        supabase.from("response_actions").select("id,status"),
        supabase.from("scans").select("id,target,status,progress"),
        supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(8),
        supabase.from("agent_status").select("*").eq("agent_name", "hermes").maybeSingle(),
      ]);
      const err = vulns.error ?? incidents.error ?? actions.error ?? scans.error ?? audit.error;
      if (err) throw err;
      return {
        vulns: vulns.data ?? [],
        incidents: incidents.data ?? [],
        actions: actions.data ?? [],
        scans: scans.data ?? [],
        audit: audit.data ?? [],
        agent: agent.data,
      };
    },
  });

  useRealtimeSync(
    "dashboard-live",
    ["vulnerabilities", "response_actions", "incidents", "scans", "assets", "audit_log", "agent_status"],
    [["dashboard"]],
  );

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Carregando telemetria…</p>;
  }

  const open = data.vulns.filter((v) => openVulnStatuses.includes(v.status as VulnStatus));
  const bySeverity = severityOrder.map((sev) => ({
    severity: sev,
    count: open.filter((v) => v.severity === sev).length,
  }));
  const criticalCount = bySeverity.find((r) => r.severity === "critical")?.count ?? 0;
  const highCount = bySeverity.find((r) => r.severity === "high")?.count ?? 0;
  const overdue = open.filter((v) => v.due_at && new Date(v.due_at).getTime() < Date.now());
  const openIncidents = data.incidents.filter((i) => i.phase !== "closed");
  const pending = data.actions.filter((a) => a.status === "pending_approval");
  const running = data.scans.filter((s) => s.status === "running");

  const series = Array.from({ length: 14 }, (_, idx) => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - (13 - idx));
    const next = new Date(day.getTime() + 86400000);
    const found = data.vulns.filter((v) => {
      const t = new Date(v.detected_at).getTime();
      return t >= day.getTime() && t < next.getTime();
    });
    return {
      dia: day.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      achados: found.length,
      criticos: found.filter((v) => v.severity === "critical").length,
    };
  });

  return (
    <div>
      <PageHeader
        title="Visão geral"
        subtitle="Postura de risco consolidada dos achados e ações do agente Hermes."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Vulnerabilidades abertas"
          value={open.length}
          hint={`${criticalCount} críticas · ${highCount} altas`}
          tone={criticalCount > 0 ? "critical" : "default"}
        />
        <StatCard
          label="SLA estourado"
          value={overdue.length}
          hint="Itens com prazo de correção vencido"
          tone={overdue.length ? "warn" : "default"}
        />
        <StatCard
          label="Incidentes ativos"
          value={openIncidents.length}
          hint={`${data.incidents.length} no total`}
          tone={openIncidents.length ? "critical" : "default"}
        />
        <StatCard
          label="Ações aguardando você"
          value={pending.length}
          hint="Fila de aprovação do Hermes"
          tone={pending.length ? "primary" : "default"}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Achados nos últimos 14 dias" className="xl:col-span-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="dia" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="achados"
                  stroke="var(--color-primary)"
                  fill="url(#g1)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="criticos"
                  stroke="var(--color-critical)"
                  fill="transparent"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Status do agente Hermes">
          <div className="space-y-3 text-sm">
            <Row label="Saúde" value={data.agent?.health ?? "desconhecida"} />
            <Row label="Versão" value={data.agent?.version ?? "—"} />
            <Row label="Último heartbeat" value={relativeTime(data.agent?.last_heartbeat_at)} />
            <Row label="Fila de comandos" value={String(data.agent?.queue_size ?? 0)} />
            <Row label="Scans em execução" value={String(running.length)} />
          </div>
          <Link
            to="/hermes"
            className="mt-4 inline-flex w-full items-center justify-center rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary transition hover:bg-primary/20"
          >
            Abrir controle do Hermes
          </Link>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel title="Distribuição por severidade">
          <div className="space-y-3">
            {bySeverity.map((row) => {
              const total = open.length || 1;
              return (
                <div key={row.severity}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2">
                      <span className={`size-2 rounded-full ${severityDot[row.severity as Severity]}`} />
                      {row.severity}
                    </span>
                    <span className="font-mono">{row.count}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted">
                    <div
                      className={`h-1.5 rounded-full ${severityDot[row.severity as Severity]}`}
                      style={{ width: `${(row.count / total) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Incidentes ativos">
          {openIncidents.length === 0 ? (
            <EmptyState text="Nenhum incidente ativo." />
          ) : (
            <ul className="space-y-3">
              {openIncidents.slice(0, 5).map((inc) => (
                <li key={inc.id} className="border-b border-border pb-2 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {inc.reference}
                    </span>
                    <SeverityBadge severity={inc.severity as Severity} />
                  </div>
                  <p className="mt-1 text-sm">{inc.title}</p>
                  <p className="font-mono text-[10px] uppercase text-muted-foreground">
                    {incidentPhaseLabel[inc.phase as IncidentPhase]} ·{" "}
                    {relativeTime(inc.detected_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Link to="/incidents" className="mt-3 inline-block text-xs text-primary hover:underline">
            Ver todos os incidentes →
          </Link>
        </Panel>

        <Panel title="Feed do Hermes">
          {data.audit.length === 0 ? (
            <EmptyState text="Sem eventos recentes." />
          ) : (
            <ul className="space-y-2.5 font-mono text-xs">
              {data.audit.map((event) => (
                <li key={event.id} className="flex gap-2">
                  <span className="text-primary">›</span>
                  <div>
                    <p className="text-foreground">{event.action}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {event.actor_label} · {formatDateTime(event.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Achados mais recentes" className="mt-4">
        {data.vulns.length === 0 ? (
          <EmptyState text="Nenhum achado registrado." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="pb-2">Título</th>
                  <th className="pb-2">Severidade</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">CVE</th>
                  <th className="pb-2">Detectado</th>
                </tr>
              </thead>
              <tbody>
                {data.vulns.slice(0, 6).map((v) => (
                  <tr key={v.id} className="border-t border-border">
                    <td className="py-2 pr-4">{v.title}</td>
                    <td className="py-2 pr-4">
                      <SeverityBadge severity={v.severity as Severity} />
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {vulnStatusLabel[v.status as VulnStatus]}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                      {v.cve ?? "—"}
                    </td>
                    <td className="py-2 font-mono text-xs text-muted-foreground">
                      {relativeTime(v.detected_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Link to="/vulnerabilities" className="mt-3 inline-block text-xs text-primary hover:underline">
          Ver todas as vulnerabilidades →
        </Link>
      </Panel>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs uppercase">{value}</span>
    </div>
  );
}
