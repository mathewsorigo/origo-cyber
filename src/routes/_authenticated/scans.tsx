import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { EmptyState, PageHeader, Panel, StatusPill } from "@/components/common";
import { formatDateTime, relativeTime, scanStatusLabel, type ScanStatus } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { runControlAction } from "@/lib/panel-control";

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
  useRealtimeSync(
    "scans-live",
    ["scans", "assets", "vulnerabilities"],
    [["scans"], ["assets-min"]],
  );
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [assetId, setAssetId] = useState<string>("");
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
      const { data, error } = await supabase
        .from("assets")
        .select("id,name,identifier")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const launch = useMutation({
    mutationFn: async () => {
      if (!assetId) throw new Error("Selecione um ativo cadastrado.");
      await runControlAction("scan.create", {
        asset_id: assetId,
        scan_type: profile,
      });
    },
    onSuccess: () => {
      toast.success("Scan enfileirado para o Hermes");
      queryClient.invalidateQueries({ queryKey: ["scans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      await runControlAction("scan.cancel", { id, note: "Cancelado pelo administrador no painel" });
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
              <Select value={assetId} onValueChange={setAssetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o ativo autorizado" />
                </SelectTrigger>
                <SelectContent>
                  {assets.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} · {a.identifier}
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
              <Button
                className="w-full"
                onClick={() => launch.mutate()}
                disabled={launch.isPending}
              >
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
