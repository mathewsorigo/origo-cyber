export const DEMO_ASSET_IDENTIFIERS = [
  "api-core-01.origo.internal",
  "cliente.origoenergia.com.br",
  "billing-batch-03.origo.internal",
  "github.com/origo/monorepo",
  "aws:eks/origo-prod",
  "vpn.origo.internal",
  "redshift://origo-dw",
  "hml-app-02.origo.internal",
] as const;

export const DEMO_VULNERABILITY_FINGERPRINTS = [
  "vuln-api-core-rce-2026",
  "vuln-portal-headers-2026",
  "vuln-monorepo-secret-2026",
  "vuln-k8s-root-2026",
  "vuln-billing-smb-2026",
  "vuln-dw-lgpd-2026",
  "vuln-vpn-mfa-2026",
  "vuln-hml-debug-2026",
  "vuln-api-ratelimit-2026",
  "vuln-portal-tls-2026",
] as const;

export const DEMO_INCIDENT_REFERENCES = [
  "INC-2026-0181",
  "INC-2026-0182",
  "INC-2026-0183",
  "INC-2026-0184",
] as const;

export const DEMO_ACTION_TITLES = [
  "Isolar billing-batch-03 da rede",
  "Revogar chave AWS AKIA...7QJ2",
  "Aplicar patch serial-fast 1.4.1",
  "Bloquear 900 IPs do ataque de credential stuffing",
  "Exigir MFA para o grupo vendors",
] as const;

export const DEMO_SCAN_TARGETS = [
  "aws:eks/origo-prod",
  "api-core-01.origo.internal",
  "github.com/origo/monorepo",
  "cliente.origoenergia.com.br",
  "vpn.origo.internal",
] as const;

type JsonRecord = Record<string, unknown>;

export function isDemoCleanupConfirmation(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Object.keys(value).length === 1 && value["confirm"] === "REMOVE_DEMO_DATA";
}

export function isDemoCommand(command: {
  command: string;
  args: unknown;
  result?: unknown;
}): boolean {
  const args = isRecord(command.args) ? command.args : {};
  const result = isRecord(command.result) ? command.result : {};
  return (
    (command.command === "start_scan" &&
      args["target"] === "aws:eks/origo-prod" &&
      args["scan_type"] === "cloud_posture") ||
    (command.command === "ping" && result["latency_ms"] === 142) ||
    (command.command === "update_policy" &&
      args["mode"] === "supervised" &&
      args["min_severity_to_act"] === "high")
  );
}

export function isDemoAuditEvent(event: {
  actor_label: string;
  action: string;
  detail: unknown;
}): boolean {
  const detail = isRecord(event.detail) ? event.detail : {};
  if (event.actor_label === "hermes" && event.action === "finding.ingested") {
    return detail["title"] === "RCE em dependência de serialização";
  }
  if (event.actor_label === "hermes" && event.action === "action.proposed") {
    return (
      detail["action_type"] === "isolate_host" &&
      detail["host"] === "billing-batch-03.origo.internal"
    );
  }
  if (event.actor_label === "hermes" && event.action === "action.executed") {
    return detail["action_type"] === "block_ip" && detail["ips"] === 900;
  }
  if (event.actor_label === "sistema" && event.action === "policy.updated") {
    return detail["mode"] === "supervised";
  }
  return (
    event.actor_label === "hermes" &&
    event.action === "scan.started" &&
    detail["target"] === "aws:eks/origo-prod"
  );
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
