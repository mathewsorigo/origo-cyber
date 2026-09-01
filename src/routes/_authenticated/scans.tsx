import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { EmptyState, PageHeader, Panel, StatusPill } from "@/components/common";
import { formatDateTime, relativeTime, scanStatusLabel, type ScanStatus } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";

export const Route = createFileRoute("/_authenticated/scans")({
  head: () => ({
    meta: [
      { title: "Scans — Órigo Cyber" },
      {
        name: "description",
        content: "Dispare, acompanhe e cancele varreduras executadas pelo agente Hermes.",
      },
      { property: "og:title", content: "Scans — Órigo Cyber" },
      { property: "og:description", content: "Varreduras do agente Hermes em tempo real." },
    ],
  }),
  component: ScansPage,
});

const profiles = [
  { value: "quick", label: "Rápido (portas + banners)" },
  { value: "full", label: "Completo (rede + web)" },
  { value: "web", label: "Aplicação web (DAST)" },
  { value: "cloud", label: "Postura de nuvem" },
  { value: "code", label: "Repositório (SAST + deps)" },
];

function ScansPage() {
  useRealtimeSync("scans-live", ["scans", "assets", "vulnerabilities"], [["scans"], ["assets-min"]]);
  const { isAdmin, user } = useAuth();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState("");
  const [assetId, setAssetId] = useState<string>("none");
  const [profile, setProfile] = useState("quick");

  const { data: scans = [], isLoading } = useQuery({
    queryKey: ["scans"],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scans")
        .select("*, assets(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: assets = [] } = useQuery({
    queryKey: ["assets-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("assets").select("id,name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const launch = useMutation({
    mutationFn: async () => {
      if (!target.trim()) throw new Error("Informe o alvo do scan.");
      const { data: scan, error } = await supabase
        .from("scans")
        .insert({
          target: target.trim(),
          asset_id: assetId === "none" ? null : assetId,
          scan_type: profile,
          status: "queued",
          started_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: cmdError } = await supabase.from("hermes_commands").insert({
        command: "start_scan",
        args: { scan_id: scan.id, target: target.trim(), scan_type: profile },
        status: "pending",
        issued_by: user?.id ?? null,
      });
      if (cmdError) throw cmdError;
    },
    onSuccess: () => {
      toast.success("Scan enfileirado para o Hermes");
      setTarget("");
      queryClient.invalidateQueries({ queryKey: ["scans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("scans").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
      const { error: cmdError } = await supabase.from("hermes_commands").insert({
        command: "cancel_scan",
        args: { scan_id: id },
        status: "pending",
        issued_by: user?.id ?? null,
      });
      if (cmdError) throw cmdError;
    },
    onSuccess: () => {
      toast.success("Cancelamento enviado ao agente");
      queryClient.invalidateQueries({ queryKey: ["scans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader title="Scans" subtitle="Varreduras solicitadas ao Hermes e seus resultados." />

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Novo scan">
          {isAdmin ? (
            <div className="space-y-3">
              <Input
                placeholder="Alvo (host, domínio, repo, conta)"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
              <Select value={assetId} onValueChange={setAssetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Ativo vinculado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem ativo vinculado</SelectItem>
                  {assets.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={profile} onValueChange={setProfile}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button className="w-full" onClick={() => launch.mutate()} disabled={launch.isPending}>
                Disparar scan
              </Button>
              <p className="text-xs text-muted-foreground">
                O comando entra na fila do agente e é retirado no próximo polling.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Somente administradores disparam varreduras.
            </p>
          )}
        </Panel>

        <Panel title={`Histórico (${scans.length})`} className="xl:col-span-2">
          {isLoading ? (
            <EmptyState text="Carregando scans…" />
          ) : scans.length === 0 ? (
            <EmptyState text="Nenhum scan registrado." />
          ) : (
            <ul className="space-y-3">
              {scans.map((s) => (
                <li key={s.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">{s.target}</span>
                    <StatusPill
                      label={scanStatusLabel[s.status as ScanStatus]}
                      tone={
                        s.status === "running"
                          ? "primary"
                          : s.status === "failed"
                            ? "critical"
                            : "muted"
                      }
                    />
                    <span className="font-mono text-[10px] uppercase text-muted-foreground">
                      {s.scan_type}
                    </span>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      {relativeTime(s.created_at)}
                    </span>
                  </div>
                  {s.status === "running" && (
                    <Progress value={s.progress ?? 0} className="mt-2 h-1.5" />
                  )}
                  <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                    achados: {s.findings_count ?? 0} · início {formatDateTime(s.started_at)} · fim{" "}
                    {formatDateTime(s.finished_at)}
                  </p>
                  {isAdmin && (s.status === "running" || s.status === "queued") && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => cancel.mutate(s.id)}
                    >
                      Cancelar
                    </Button>
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
