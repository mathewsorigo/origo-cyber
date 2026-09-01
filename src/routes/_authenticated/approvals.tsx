import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { EmptyState, PageHeader, Panel, SeverityBadge, StatusPill } from "@/components/common";
import {
  actionStatusLabel,
  actionTypeLabel,
  formatDateTime,
  relativeTime,
  type ActionStatus,
  type Severity,
} from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { runControlAction } from "@/lib/panel-control";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({
    meta: [
      { title: "Aprovações de resposta — Órigo Cyber" },
      {
        name: "description",
        content:
          "Aprove ou rejeite ações automáticas propostas pelo agente Hermes com justificativa.",
      },
      { property: "og:title", content: "Aprovações de resposta — Órigo Cyber" },
      { property: "og:description", content: "Fila de aprovação de ações do agente Hermes." },
    ],
  }),
  component: ApprovalsPage,
});

function ApprovalsPage() {
  useRealtimeSync(
    "approvals-live",
    ["response_actions", "incidents", "vulnerabilities"],
    [["response-actions"], ["pending-actions-count"]],
  );
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data = [], isLoading } = useQuery({
    queryKey: ["response-actions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("response_actions")
        .select("*, incidents(reference,title,severity), vulnerabilities(title,severity)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const decide = useMutation({
    mutationFn: async ({
      id,
      approve,
      justification,
    }: {
      id: string;
      approve: boolean;
      justification: string;
    }) => {
      if (!justification.trim()) throw new Error("Justificativa obrigatória.");
      await runControlAction("response_action.decide", {
        id,
        decision: approve ? "approve" : "reject",
        justification: justification.trim(),
      });
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.approve ? "Ação aprovada e enfileirada" : "Ação rejeitada");
      setNotes((n) => ({ ...n, [vars.id]: "" }));
      queryClient.invalidateQueries({ queryKey: ["response-actions"] });
      queryClient.invalidateQueries({ queryKey: ["pending-actions-count"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = data.filter((a) => a.status === "pending_approval");
  const history = data.filter((a) => a.status !== "pending_approval");

  return (
    <div>
      <PageHeader
        title="Aprovações de resposta"
        subtitle="Ações de contenção propostas pelo Hermes que exigem decisão humana."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={`Fila de aprovação (${pending.length})`}>
          {isLoading ? (
            <EmptyState text="Carregando fila…" />
          ) : pending.length === 0 ? (
            <EmptyState text="Nada aguardando aprovação." />
          ) : (
            <ul className="space-y-3">
              {pending.map((a) => {
                const severity = (a.incidents?.severity ?? a.vulnerabilities?.severity) as
                  Severity | undefined;
                return (
                  <li key={a.id} className="rounded-md border border-high/40 bg-high/5 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-primary">
                        {actionTypeLabel[a.action_type] ?? a.action_type}
                      </span>
                      {severity && <SeverityBadge severity={severity} />}
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        {relativeTime(a.created_at)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm">{a.title}</p>
                    {a.rationale && (
                      <p className="mt-1 text-xs text-muted-foreground">Motivo: {a.rationale}</p>
                    )}
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      risco: {a.risk} ·{" "}
                      {a.incidents?.reference ?? a.vulnerabilities?.title ?? "sem vínculo"}
                    </p>
                    <details className="mt-2 rounded border border-border p-2 text-xs">
                      <summary className="cursor-pointer font-mono text-[10px] uppercase text-muted-foreground">
                        Escopo técnico da execução
                      </summary>
                      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px]">
                        {JSON.stringify(a.payload ?? {}, null, 2)}
                      </pre>
                    </details>
                    {isAdmin ? (
                      <div className="mt-3 space-y-2">
                        <Textarea
                          placeholder="Justificativa da decisão (obrigatória)"
                          value={notes[a.id] ?? ""}
                          onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value }))}
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={decide.isPending}
                            onClick={() =>
                              decide.mutate({
                                id: a.id,
                                approve: true,
                                justification: notes[a.id] ?? "",
                              })
                            }
                          >
                            Aprovar execução
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={decide.isPending}
                            onClick={() =>
                              decide.mutate({
                                id: a.id,
                                approve: false,
                                justification: notes[a.id] ?? "",
                              })
                            }
                          >
                            Rejeitar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Somente administradores decidem sobre ações de resposta.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Histórico de decisões">
          {history.length === 0 ? (
            <EmptyState text="Sem decisões registradas." />
          ) : (
            <ul className="space-y-3">
              {history.map((a) => (
                <li key={a.id} className="border-b border-border pb-3 last:border-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">
                      {actionTypeLabel[a.action_type] ?? a.action_type}
                    </span>
                    <StatusPill
                      label={actionStatusLabel[a.status as ActionStatus]}
                      tone={
                        a.status === "succeeded"
                          ? "primary"
                          : a.status === "failed" || a.status === "rejected"
                            ? "critical"
                            : "muted"
                      }
                    />
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      {formatDateTime(a.decided_at ?? a.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">{a.title}</p>
                  {a.decision_reason && (
                    <p className="mt-1 text-xs text-muted-foreground">“{a.decision_reason}”</p>
                  )}
                  {a.result && (
                    <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded border border-border p-2 font-mono text-[10px] text-muted-foreground">
                      {JSON.stringify(a.result, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
