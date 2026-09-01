export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type VulnStatus =
  | "new"
  | "triaging"
  | "confirmed"
  | "false_positive"
  | "mitigating"
  | "resolved"
  | "risk_accepted";
export type IncidentPhase = "open" | "contained" | "eradicated" | "recovered" | "closed";
export type ActionStatus =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "executing"
  | "succeeded"
  | "failed";
export type ScanStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type CommandStatus =
  | "pending"
  | "dispatched"
  | "acknowledged"
  | "succeeded"
  | "failed"
  | "cancelled";
export type AppRole = "admin" | "analyst" | "viewer";

export const severityOrder: Severity[] = ["critical", "high", "medium", "low", "info"];

export const severityLabel: Record<Severity, string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
  info: "Informativa",
};

export const severityClass: Record<Severity, string> = {
  critical: "bg-critical/15 text-critical border-critical/40",
  high: "bg-high/15 text-high border-high/40",
  medium: "bg-medium/15 text-medium border-medium/40",
  low: "bg-low/15 text-low border-low/40",
  info: "bg-info/15 text-info border-info/40",
};

export const severityDot: Record<Severity, string> = {
  critical: "bg-critical",
  high: "bg-high",
  medium: "bg-medium",
  low: "bg-low",
  info: "bg-info",
};

export const vulnStatusLabel: Record<VulnStatus, string> = {
  new: "Nova",
  triaging: "Em triagem",
  confirmed: "Confirmada",
  false_positive: "Falso positivo",
  mitigating: "Em mitigação",
  resolved: "Resolvida",
  risk_accepted: "Risco aceito",
};

export const incidentPhaseLabel: Record<IncidentPhase, string> = {
  open: "Aberto",
  contained: "Contido",
  eradicated: "Erradicado",
  recovered: "Recuperado",
  closed: "Encerrado",
};

export const actionStatusLabel: Record<ActionStatus, string> = {
  pending_approval: "Aguardando aprovação",
  approved: "Aprovada",
  rejected: "Rejeitada",
  executing: "Em execução",
  succeeded: "Concluída",
  failed: "Falhou",
};

export const scanStatusLabel: Record<ScanStatus, string> = {
  queued: "Na fila",
  running: "Executando",
  completed: "Concluído",
  failed: "Falhou",
  cancelled: "Cancelado",
};

export const commandStatusLabel: Record<CommandStatus, string> = {
  pending: "Pendente",
  dispatched: "Enviado",
  acknowledged: "Reconhecido",
  succeeded: "Concluído",
  failed: "Falhou",
  cancelled: "Cancelado",
};

export const roleLabel: Record<AppRole, string> = {
  admin: "Administrador",
  analyst: "Analista",
  viewer: "Leitura",
};

export const assetKindLabel: Record<string, string> = {
  host: "Host",
  domain: "Domínio",
  repository: "Repositório",
  cloud: "Cloud",
  endpoint: "Endpoint",
  database: "Banco de dados",
  saas: "SaaS",
};

export const actionTypeLabel: Record<string, string> = {
  isolate_host: "Isolar host",
  block_ip: "Bloquear IP",
  revoke_credential: "Revogar credencial",
  apply_patch: "Aplicar patch",
  enforce_mfa: "Exigir MFA",
  quarantine_file: "Quarentena de arquivo",
  disable_account: "Desativar conta",
};

export const openVulnStatuses: VulnStatus[] = ["new", "triaging", "confirmed", "mitigating"];

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(value?: string | null): string {
  if (!value) return "—";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 1) return "agora";
  if (Math.abs(minutes) < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

export function slaState(dueAt?: string | null, status?: VulnStatus) {
  if (!dueAt || status === "resolved" || status === "risk_accepted" || status === "false_positive") {
    return { label: "—", danger: false, warn: false };
  }
  const diffDays = Math.ceil((new Date(dueAt).getTime() - Date.now()) / 86400000);
  if (diffDays < 0) return { label: `${Math.abs(diffDays)}d atrasado`, danger: true, warn: false };
  if (diffDays <= 2) return { label: `${diffDays}d restantes`, danger: false, warn: true };
  return { label: `${diffDays}d restantes`, danger: false, warn: false };
}
