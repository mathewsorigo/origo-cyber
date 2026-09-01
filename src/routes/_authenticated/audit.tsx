import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, PageHeader, Panel } from "@/components/common";
import { formatDateTime } from "@/lib/domain";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({
    meta: [
      { title: "Auditoria — Órigo Cyber" },
      {
        name: "description",
        content: "Trilha completa de decisões humanas e ações do agente Hermes.",
      },
      { property: "og:title", content: "Auditoria — Órigo Cyber" },
      { property: "og:description", content: "Trilha de auditoria do painel de cyber segurança." },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const [q, setQ] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data;
    },
  });

  const rows = data.filter((e) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return (
      e.action.toLowerCase().includes(needle) ||
      (e.actor_label ?? "").toLowerCase().includes(needle) ||
      (e.entity_type ?? "").toLowerCase().includes(needle)
    );
  });

  return (
    <div>
      <PageHeader
        title="Auditoria"
        subtitle="Cada mutação sensível do painel e do agente fica registrada aqui."
      />
      <Input
        placeholder="Filtrar por ação, autor ou entidade…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-4 max-w-sm"
      />
      <Panel title={`${rows.length} evento(s)`}>
        {isLoading ? (
          <EmptyState text="Carregando trilha…" />
        ) : rows.length === 0 ? (
          <EmptyState text="Nenhum evento encontrado." />
        ) : (
          <ul className="space-y-2 font-mono text-xs">
            {rows.map((e) => (
              <li key={e.id} className="border-b border-border pb-2 last:border-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-primary">{e.action}</span>
                  <span className="text-muted-foreground">{e.actor_label}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {formatDateTime(e.created_at)}
                  </span>
                </div>
                {e.entity_type && (
                  <p className="text-[10px] text-muted-foreground">
                    {e.entity_type} {e.entity_id ?? ""}
                  </p>
                )}
                {e.detail && (
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[10px] text-muted-foreground">
                    {JSON.stringify(e.detail)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
