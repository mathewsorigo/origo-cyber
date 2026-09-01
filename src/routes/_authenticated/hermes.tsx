import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { EmptyState, PageHeader, Panel, StatCard, StatusPill } from "@/components/common";
import {
  commandStatusLabel,
  formatDateTime,
  relativeTime,
  type CommandStatus,
  type Severity,
} from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { runControlAction } from "@/lib/panel-control";

export const Route = createFileRoute("/_authenticated/hermes")({
  head: () => ({
    meta: [
      { title: "Controle do Hermes — Órigo Cyber" },
      {
        name: "description",
        content:
          "Modo de operação, políticas de resposta automática e comandos enviados ao agente Hermes.",
      },
      { property: "og:title", content: "Controle do Hermes — Órigo Cyber" },
      { property: "og:description", content: "Governança e comandos do agente Hermes." },
    ],
  }),
  component: HermesPage,
});

const modes = [
  { value: "monitor_only", label: "Somente monitorar" },
  { value: "supervised", label: "Supervisionado (aprovação humana)" },
];

function HermesPage() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [manualCommand, setManualCommand] = useState("pause_agent");
  const [commandTarget, setCommandTarget] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["hermes-control"],
    refetchInterval: 20000,
    queryFn: async () => {
      const [policy, agent, commands] = await Promise.all([
        supabase.from("hermes_policies").select("*").limit(1).maybeSingle(),
        supabase.from("agent_status").select("*").eq("agent_name", "hermes").maybeSingle(),
        supabase
          .from("hermes_commands")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      const err = policy.error ?? commands.error;
      if (err) throw err;
      return { policy: policy.data, agent: agent.data, commands: commands.data ?? [] };
    },
  });

  useRealtimeSync(
    "hermes-live",
    ["agent_status", "hermes_policies", "hermes_commands"],
    [["hermes-control"], ["agent-status"]],
  );

  const savePolicy = useMutation({
    mutationFn: async (
      patch: Partial<{
        mode: string;
        min_severity_to_act: Severity;
        auto_approved_actions: string[];
        scan_schedule: string;
        maintenance_window: string | null;
        paused: boolean;
        notes: string | null;
      }>,
    ) => {
      if (!data?.policy) throw new Error("Política não encontrada.");
      await runControlAction("policy.update", patch);
    },
    onSuccess: () => {
      toast.success("Política atualizada");
      queryClient.invalidateQueries({ queryKey: ["hermes-control"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendCommand = useMutation({
    mutationFn: async ({ command, payload }: { command: string; payload?: unknown }) => {
      await runControlAction("command.create", { command, args: payload ?? {} });
    },
    onSuccess: () => {
      toast.success("Comando enfileirado para o agente");
      setCommandTarget("");
      queryClient.invalidateQueries({ queryKey: ["hermes-control"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data)
    return <p className="text-sm text-muted-foreground">Carregando agente…</p>;

  const policy = data.policy;

  return (
    <div>
      <PageHeader
        title="Controle do Hermes"
        subtitle="Modo de operação, política de resposta automática e fila de comandos."
        actions={
          isAdmin && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => sendCommand.mutate({ command: "pause_agent" })}
              >
                Pausar agente
              </Button>
              <Button size="sm" onClick={() => sendCommand.mutate({ command: "resume_agent" })}>
                Retomar agente
              </Button>
            </>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Saúde"
          value={data.agent?.health ?? "—"}
          hint={`heartbeat ${relativeTime(data.agent?.last_heartbeat_at)}`}
          tone={data.agent?.health === "healthy" ? "primary" : "critical"}
        />
        <StatCard label="Versão" value={data.agent?.version ?? "—"} hint="build em produção" />
        <StatCard
          label="Fila de comandos"
          value={data.agent?.queue_size ?? 0}
          hint="não confirmados"
        />
        <StatCard
          label="Modo atual"
          value={modes.find((m) => m.value === policy?.mode)?.label.split(" ")[0] ?? "—"}
          hint={policy?.scan_schedule ?? "sem agenda"}
          tone="primary"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Política de resposta">
          {!policy ? (
            <EmptyState text="Nenhuma política configurada." />
          ) : (
            <div className="space-y-4">
              <div>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Modo de operação
                </p>
                <Select
                  value={policy.mode}
                  disabled={!isAdmin}
                  onValueChange={(mode) => savePolicy.mutate({ mode })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {modes.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Severidade mínima para agir
                </p>
                <Select
                  value={policy.min_severity_to_act}
                  disabled={!isAdmin}
                  onValueChange={(v) => savePolicy.mutate({ min_severity_to_act: v as Severity })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["critical", "high", "medium", "low"].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-md border border-high/40 bg-high/5 p-3">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Execução crítica
                </p>
                <p className="text-sm text-muted-foreground">
                  Autoaprovações estão desabilitadas. Isolamento, bloqueio, quarentena, patch e
                  ações de identidade passam pela fila de aprovação com justificativa, rollback e
                  validação.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Agenda de scans
                  </p>
                  <Input
                    defaultValue={policy.scan_schedule ?? ""}
                    disabled={!isAdmin}
                    onBlur={(e) => savePolicy.mutate({ scan_schedule: e.target.value })}
                  />
                </div>
                <div>
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Janela de manutenção
                  </p>
                  <Input
                    defaultValue={policy.maintenance_window ?? ""}
                    disabled={!isAdmin}
                    onBlur={(e) => savePolicy.mutate({ maintenance_window: e.target.value })}
                  />
                </div>
              </div>
              {!isAdmin && (
                <p className="text-xs text-muted-foreground">
                  Somente administradores alteram a política do agente.
                </p>
              )}
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Enviar comando manual">
            {isAdmin ? (
              <div className="space-y-3">
                <Select value={manualCommand} onValueChange={setManualCommand}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pause_agent">Pausar agente</SelectItem>
                    <SelectItem value="resume_agent">Retomar agente</SelectItem>
                    <SelectItem value="reload_policy">Recarregar política</SelectItem>
                    <SelectItem value="update_signatures">Atualizar assinaturas</SelectItem>
                    <SelectItem value="ping">Testar comunicação</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Alvo opcional (host, IP…)"
                  value={commandTarget}
                  onChange={(e) => setCommandTarget(e.target.value)}
                />
                <Button
                  className="w-full"
                  disabled={sendCommand.isPending}
                  onClick={() =>
                    sendCommand.mutate({
                      command: manualCommand,
                      payload: commandTarget.trim() ? { target: commandTarget.trim() } : {},
                    })
                  }
                >
                  Enviar comando
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Somente administradores enviam comandos ao agente.
              </p>
            )}
          </Panel>

          <Panel title="Fila e histórico de comandos">
            {data.commands.length === 0 ? (
              <EmptyState text="Nenhum comando enviado." />
            ) : (
              <ul className="space-y-2">
                {data.commands.map((c) => (
                  <li key={c.id} className="border-b border-border pb-2 text-xs last:border-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-primary">{c.command}</span>
                      <StatusPill
                        label={commandStatusLabel[c.status as CommandStatus]}
                        tone={
                          c.status === "succeeded"
                            ? "primary"
                            : c.status === "failed"
                              ? "critical"
                              : "muted"
                        }
                      />
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        {formatDateTime(c.created_at)}
                      </span>
                    </div>
                    {c.error && <p className="mt-1 text-xs text-critical">{c.error}</p>}
                    {(Object.keys(c.args ?? {}).length > 0 || c.result) && (
                      <details className="mt-1 rounded border border-border p-2">
                        <summary className="cursor-pointer font-mono text-[10px] uppercase text-muted-foreground">
                          Entrada e resultado
                        </summary>
                        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] text-muted-foreground">
                          {JSON.stringify(
                            { args: c.args ?? {}, result: c.result ?? null },
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
