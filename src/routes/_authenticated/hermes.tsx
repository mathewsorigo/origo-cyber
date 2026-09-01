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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";

export const Route = createFileRoute("/_authenticated/hermes")({
  head: () => ({
    meta: [
      { title: "Controle do Hermes — Órigo Cyber" },
      {
        name: "description",
        content: "Modo de operação, políticas de resposta automática e comandos enviados ao agente Hermes.",
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
  { value: "autonomous", label: "Autônomo (dentro da política)" },
];

const autoActions = [
  { value: "block_ip", label: "Bloquear IP" },
  { value: "quarantine_file", label: "Quarentena de arquivo" },
  { value: "isolate_host", label: "Isolar host" },
  { value: "disable_user", label: "Desabilitar usuário" },
  { value: "revoke_token", label: "Revogar token" },
  { value: "rollback_deploy", label: "Reverter deploy" },
];

function HermesPage() {
  const { isAdmin, user } = useAuth();
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

  useRealtimeSync("hermes-live", ["agent_status", "hermes_policies", "hermes_commands"], [["hermes-control"], ["agent-status"]]);

  const savePolicy = useMutation({
    mutationFn: async (patch: Partial<{
      mode: string;
      min_severity_to_act: Severity;
      auto_approved_actions: string[];
      scan_schedule: string;
      maintenance_window: string | null;
      paused: boolean;
      notes: string | null;
    }>) => {
      if (!data?.policy) throw new Error("Política não encontrada.");
      const { error } = await supabase
        .from("hermes_policies")
        .update(patch)
        .eq("id", data.policy.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Política atualizada");
      queryClient.invalidateQueries({ queryKey: ["hermes-control"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendCommand = useMutation({
    mutationFn: async ({ command, payload }: { command: string; payload?: unknown }) => {
      const { error } = await supabase.from("hermes_commands").insert({
        command,
        args: (payload ?? {}) as never,
        status: "pending",
        issued_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Comando enfileirado para o agente");
      setCommandTarget("");
      queryClient.invalidateQueries({ queryKey: ["hermes-control"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Carregando agente…</p>;

  const policy = data.policy;
  const enabled = policy?.auto_approved_actions ?? [];

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
              <Button
                size="sm"
                onClick={() => sendCommand.mutate({ command: "resume_agent" })}
              >
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
        <StatCard label="Fila de comandos" value={data.agent?.queue_size ?? 0} hint="não confirmados" />
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

              <div>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Ações com aprovação automática
                </p>
                <ul className="space-y-2">
                  {autoActions.map((a) => (
                    <li key={a.value} className="flex items-center justify-between text-sm">
                      <span>{a.label}</span>
                      <Switch
                        checked={enabled.includes(a.value)}
                        disabled={!isAdmin}
                        onCheckedChange={(on) =>
                          savePolicy.mutate({
                            auto_approved_actions: on
                              ? [...enabled, a.value]
                              : enabled.filter((v: string) => v !== a.value),
                          })
                        }
                      />
                    </li>
                  ))}
                </ul>
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
                    <SelectItem value="isolate_host">Isolar host</SelectItem>
                    <SelectItem value="block_ip">Bloquear IP</SelectItem>
                    <SelectItem value="collect_forensics">Coletar forense</SelectItem>
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
                  <li key={c.id} className="flex flex-wrap items-center gap-2 border-b border-border pb-2 text-xs last:border-0">
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
