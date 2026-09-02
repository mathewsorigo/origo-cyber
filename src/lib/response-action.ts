export const RESPONSE_ACTION_PLATFORMS = [
  "bitdefender",
  "compassone",
  "microsoft-graph",
  "azure",
  "intune",
  "defender",
  "network",
  "application",
  "manual",
] as const;

export const RESPONSE_ACTION_TYPES = [
  "isolate_endpoint",
  "release_endpoint",
  "block_ip",
  "unblock_ip",
  "quarantine_file",
  "restore_file",
  "deploy_patch",
  "revoke_sessions",
  "disable_account",
  "enable_account",
  "collect_forensics",
  "run_scan",
  "manual_remediation",
] as const;

export type ResponseExecutionPlan = {
  platform: (typeof RESPONSE_ACTION_PLATFORMS)[number];
  target: string;
  execution: string;
  rollback: string;
  validation: string;
};

export function isCompleteResponsePlan(value: unknown): value is ResponseExecutionPlan {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  const expected = ["execution", "platform", "rollback", "target", "validation"];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    return false;
  }
  if (!RESPONSE_ACTION_PLATFORMS.includes(value["platform"] as never)) return false;
  return ["target", "execution", "rollback", "validation"].every(
    (key) => typeof value[key] === "string" && value[key].trim().length >= 3,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
