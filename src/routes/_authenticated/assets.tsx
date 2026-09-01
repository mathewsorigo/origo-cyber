import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { EmptyState, PageHeader, Panel, SeverityBadge, StatusPill } from "@/components/common";
import { assetKindLabel, type Severity } from "@/lib/domain";
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

const kinds = ["host", "domain", "repository", "cloud", "endpoint", "database", "saas"] as const;
const criticalities = ["critical", "high", "medium", "low"] as const;

export const Route = createFileRoute("/_authenticated/assets")({
  head: () => ({
    meta: [
      { title: "Ativos monitorados — Órigo Cyber" },
      {
        name: "description",
        content: "Inventário dos alvos monitorados pelo Hermes, com criticidade e exposição.",
      },
      { property: "og:title", content: "Ativos monitorados — Órigo Cyber" },
      { property: "og:description", content: "Inventário de ativos e alvos do agente Hermes." },
    ],
  }),
  component: AssetsPage,
});

function AssetsPage() {
  useRealtimeSync("assets-live", ["assets", "vulnerabilities"], [["assets"], ["assets-min"]]);
  const { isAdmin, user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [kind, setKind] = useState<(typeof kinds)[number]>("host");
  const [criticality, setCriticality] = useState<Severity>("medium");
  const [owner, setOwner] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["assets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("*, vulnerabilities(id,severity,status)")
        .order("criticality");
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !identifier.trim()) throw new Error("Nome e identificador são obrigatórios.");
      const { error } = await supabase.from("assets").insert({
        name: name.trim(),
        identifier: identifier.trim(),
        kind,
        criticality,
        owner_team: owner.trim() || null,
        monitored: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ativo cadastrado");
      setName("");
      setIdentifier("");
      setOwner("");
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMonitor = useMutation({
    mutationFn: async ({ id, monitored }: { id: string; monitored: boolean }) => {
      const { error } = await supabase.from("assets").update({ monitored }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assets"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Ativos monitorados"
        subtitle="Escopo que o Hermes varre continuamente."
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Novo ativo">
          {isAdmin ? (
            <div className="space-y-3">
              <Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
              <Input
                placeholder="Identificador (IP, domínio, ARN, repo)"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
              <Select value={kind} onValueChange={(v) => setKind(v as (typeof kinds)[number])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {kinds.map((k) => (
                    <SelectItem key={k} value={k}>
                      {assetKindLabel[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={criticality} onValueChange={(v) => setCriticality(v as Severity)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {criticalities.map((c) => (
                    <SelectItem key={c} value={c}>
                      Criticidade {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Time responsável"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              />
              <Button className="w-full" onClick={() => create.mutate()} disabled={create.isPending}>
                Cadastrar ativo
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Somente administradores editam o escopo.</p>
          )}
        </Panel>

        <Panel title={`Inventário (${data.length})`} className="xl:col-span-2">
          {isLoading ? (
            <EmptyState text="Carregando inventário…" />
          ) : data.length === 0 ? (
            <EmptyState text="Nenhum ativo cadastrado." />
          ) : (
            <ul className="space-y-2">
              {data.map((a) => {
                const openVulns = (a.vulnerabilities ?? []).filter(
                  (v) => v.status !== "resolved" && v.status !== "false_positive",
                );
                const worst = (["critical", "high", "medium", "low", "info"] as Severity[]).find(
                  (sev) => openVulns.some((v) => v.severity === sev),
                );
                return (
                  <li key={a.id} className="rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{a.name}</span>
                      <StatusPill label={assetKindLabel[a.kind] ?? a.kind} />
                      <span className="font-mono text-[10px] uppercase text-muted-foreground">
                        crit. {a.criticality}
                      </span>
                      {worst && <SeverityBadge severity={worst} />}
                      <div className="ml-auto flex items-center gap-2">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {a.monitored ? "monitorado" : "pausado"}
                        </span>
                        <Switch
                          checked={!!a.monitored}
                          disabled={!isAdmin}
                          onCheckedChange={(v) => toggleMonitor.mutate({ id: a.id, monitored: v })}
                        />
                      </div>
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {a.identifier} · {a.owner_team ?? "sem responsável"} · {openVulns.length} achado(s)
                      aberto(s)
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
