import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { EmptyState, PageHeader, Panel, SeverityBadge, StatusPill } from "@/components/common";
import {
  formatDateTime,
  incidentPhaseLabel,
  relativeTime,
  type IncidentPhase,
  type Severity,
} from "@/lib/domain";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { runControlAction } from "@/lib/panel-control";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const phases: IncidentPhase[] = ["open", "contained", "eradicated", "recovered", "closed"];

export const Route = createFileRoute("/_authenticated/incidents")({
  head: () => ({
    meta: [
      { title: "Incidentes — Órigo Cyber" },
      {
        name: "description",
        content: "Resposta a incidentes com fases de contenção, erradicação e recuperação.",
      },
      { property: "og:title", content: "Incidentes — Órigo Cyber" },
      { property: "og:description", content: "Ciclo de resposta a incidentes da Órigo." },
    ],
  }),
  component: IncidentsPage,
});

function IncidentsPage() {
  useRealtimeSync("incidents-live", ["incidents", "response_actions"], [["incidents"]]);
  const { canTriage } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [phaseDraft, setPhaseDraft] = useState<IncidentPhase>("open");
  const [summaryDraft, setSummaryDraft] = useState("");
  const [decisionNote, setDecisionNote] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["incidents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incidents")
        .select("*, response_actions(id,action_type,status,created_at)")
        .order("detected_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const setPhase = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      await runControlAction("incident.update", {
        id,
        phase: phaseDraft,
        summary: summaryDraft.trim() || null,
        note: decisionNote.trim(),
      });
    },
    onSuccess: () => {
      toast.success("Fase do incidente atualizada");
      setDecisionNote("");
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const current = data.find((i) => i.id === selected) ?? null;

  useEffect(() => {
    if (!current) return;
    setPhaseDraft(current.phase as IncidentPhase);
    setSummaryDraft(current.summary ?? "");
    setDecisionNote("");
  }, [current]);

  return (
    <div>
      <PageHeader
        title="Incidentes"
        subtitle="Casos abertos pelo Hermes ou pela equipe, com trilha de resposta."
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title={`${data.length} incidente(s)`} className="xl:col-span-2">
          {isLoading ? (
            <EmptyState text="Carregando incidentes…" />
          ) : data.length === 0 ? (
            <EmptyState text="Nenhum incidente registrado." />
          ) : (
            <ul className="space-y-2">
              {data.map((inc) => (
                <li
                  key={inc.id}
                  onClick={() => setSelected(inc.id)}
                  className={`cursor-pointer rounded-md border border-border p-3 transition hover:border-primary/50 ${
                    selected === inc.id ? "border-primary/60 bg-secondary/50" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {inc.reference}
                    </span>
                    <SeverityBadge severity={inc.severity as Severity} />
                    <StatusPill
                      label={incidentPhaseLabel[inc.phase as IncidentPhase]}
                      tone={inc.phase === "closed" ? "muted" : "primary"}
                    />
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      {relativeTime(inc.detected_at)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm font-medium">{inc.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {inc.response_actions?.length ?? 0} ação(ões) de resposta
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Detalhe do incidente">
          {!current ? (
            <EmptyState text="Selecione um incidente." />
          ) : (
            <div className="space-y-4 text-sm">
              <div>
                <p className="font-mono text-[10px] text-muted-foreground">{current.reference}</p>
                <h3 className="mt-1 font-semibold">{current.title}</h3>
                <p className="mt-1 text-muted-foreground">{current.summary}</p>
              </div>

              <dl className="space-y-2 border-t border-border pt-3 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Detectado</dt>
                  <dd>{formatDateTime(current.detected_at)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Encerrado</dt>
                  <dd>{current.closed_at ? formatDateTime(current.closed_at) : "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Origem</dt>
                  <dd>{current.source ?? "hermes"}</dd>
                </div>
              </dl>

              <div className="border-t border-border pt-3">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Fase da resposta
                </p>
                {canTriage ? (
                  <div className="space-y-2">
                    <Select
                      value={phaseDraft}
                      onValueChange={(p) => setPhaseDraft(p as IncidentPhase)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {phases.map((p) => (
                          <SelectItem key={p} value={p}>
                            {incidentPhaseLabel[p]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Textarea
                      rows={3}
                      value={summaryDraft}
                      onChange={(e) => setSummaryDraft(e.target.value)}
                      placeholder="Resumo operacional"
                    />
                    <Textarea
                      rows={2}
                      value={decisionNote}
                      onChange={(e) => setDecisionNote(e.target.value)}
                      placeholder="Justificativa (obrigatória para encerrar)"
                    />
                    <Button
                      className="w-full"
                      disabled={setPhase.isPending}
                      onClick={() => setPhase.mutate({ id: current.id })}
                    >
                      Salvar incidente
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Apenas analistas e administradores alteram a fase.
                  </p>
                )}
              </div>

              {current.response_actions && current.response_actions.length > 0 && (
                <div className="border-t border-border pt-3">
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Ações vinculadas
                  </p>
                  <ul className="space-y-1.5 font-mono text-xs">
                    {current.response_actions.map((a) => (
                      <li key={a.id} className="flex justify-between gap-2">
                        <span>{a.action_type}</span>
                        <span className="text-muted-foreground">{a.status}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
