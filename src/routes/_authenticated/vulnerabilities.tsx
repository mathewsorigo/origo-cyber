import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { EmptyState, PageHeader, Panel, SeverityBadge } from "@/components/common";
import {
  formatDateTime,
  severityOrder,
  slaState,
  vulnStatusLabel,
  type Severity,
  type VulnStatus,
} from "@/lib/domain";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const statuses: VulnStatus[] = [
  "new",
  "triaging",
  "confirmed",
  "false_positive",
  "mitigating",
  "resolved",
  "risk_accepted",
];

export const Route = createFileRoute("/_authenticated/vulnerabilities")({
  head: () => ({
    meta: [
      { title: "Vulnerabilidades — Órigo Cyber" },
      {
        name: "description",
        content: "Triagem das vulnerabilidades detectadas pelo agente Hermes com SLA e severidade.",
      },
      { property: "og:title", content: "Vulnerabilidades — Órigo Cyber" },
      { property: "og:description", content: "Triagem de vulnerabilidades detectadas pelo Hermes." },
    ],
  }),
  component: VulnerabilitiesPage,
});

function VulnerabilitiesPage() {
  const { canTriage } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [selected, setSelected] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["vulnerabilities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vulnerabilities")
        .select("*, assets(name,kind)")
        .order("detected_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: VulnStatus }) => {
      const { error } = await supabase
        .from("vulnerabilities")
        .update({ status: next })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status atualizado");
      queryClient.invalidateQueries({ queryKey: ["vulnerabilities"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(
    () =>
      data.filter((v) => {
        const q = search.trim().toLowerCase();
        const matchesQ =
          !q ||
          v.title.toLowerCase().includes(q) ||
          (v.cve ?? "").toLowerCase().includes(q) ||
          (v.assets?.name ?? "").toLowerCase().includes(q);
        return (
          matchesQ &&
          (severity === "all" || v.severity === severity) &&
          (status === "all" || v.status === status)
        );
      }),
    [data, search, severity, status],
  );

  const current = rows.find((v) => v.id === selected) ?? null;

  return (
    <div>
      <PageHeader
        title="Vulnerabilidades"
        subtitle="Achados ingeridos pelo Hermes, deduplicados por fingerprint."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          placeholder="Buscar por título, CVE ou ativo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Severidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as severidades</SelectItem>
            {severityOrder.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {vulnStatusLabel[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title={`${rows.length} achado(s)`} className="xl:col-span-2">
          {isLoading ? (
            <EmptyState text="Carregando achados…" />
          ) : rows.length === 0 ? (
            <EmptyState text="Nenhum achado com esses filtros." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    <th className="pb-2">Achado</th>
                    <th className="pb-2">Sev.</th>
                    <th className="pb-2">Ativo</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">SLA</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((v) => {
                    const sla = slaState(v.due_at, v.status as VulnStatus);
                    return (
                      <tr
                        key={v.id}
                        onClick={() => setSelected(v.id)}
                        className={`cursor-pointer border-t border-border transition hover:bg-secondary/60 ${
                          selected === v.id ? "bg-secondary/60" : ""
                        }`}
                      >
                        <td className="py-2 pr-4">
                          <p>{v.title}</p>
                          <p className="font-mono text-[10px] text-muted-foreground">
                            {v.cve ?? "sem CVE"} · CVSS {v.cvss ?? "—"}
                          </p>
                        </td>
                        <td className="py-2 pr-4">
                          <SeverityBadge severity={v.severity as Severity} />
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">{v.assets?.name ?? "—"}</td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {vulnStatusLabel[v.status as VulnStatus]}
                        </td>
                        <td className={`py-2 font-mono text-xs ${sla.className}`}>{sla.label}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Detalhe do achado">
          {!current ? (
            <EmptyState text="Selecione um achado para ver os detalhes." />
          ) : (
            <div className="space-y-4 text-sm">
              <div>
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={current.severity as Severity} />
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {current.source ?? "hermes"}
                  </span>
                </div>
                <h3 className="mt-2 font-semibold">{current.title}</h3>
                <p className="mt-1 text-muted-foreground">{current.description}</p>
              </div>

              <dl className="space-y-2 border-t border-border pt-3 text-xs">
                <Field label="Ativo" value={current.assets?.name ?? "—"} />
                <Field label="CVE" value={current.cve ?? "—"} />
                <Field label="CVSS" value={String(current.cvss ?? "—")} />
                <Field label="Fingerprint" value={current.fingerprint} mono />
                <Field label="Detectado" value={formatDateTime(current.detected_at)} />
                <Field label="Prazo" value={formatDateTime(current.due_at)} />
                <Field label="Ocorrências" value={String(current.occurrences ?? 1)} />
              </dl>

              {current.remediation && (
                <div className="border-t border-border pt-3">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Remediação sugerida pelo Hermes
                  </p>
                  <p className="mt-1 text-sm">{current.remediation}</p>
                </div>
              )}

              <div className="border-t border-border pt-3">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Triagem
                </p>
                {canTriage ? (
                  <Select
                    value={current.status}
                    onValueChange={(next) =>
                      updateStatus.mutate({ id: current.id, next: next as VulnStatus })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statuses.map((s) => (
                        <SelectItem key={s} value={s}>
                          {vulnStatusLabel[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Seu perfil tem apenas leitura. Peça a um administrador permissão de analista para
                    triar achados.
                  </p>
                )}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-right ${mono ? "break-all font-mono text-[10px]" : ""}`}>{value}</dd>
    </div>
  );
}
