export function canReportActionResult(current: string, next: "succeeded" | "failed"): boolean {
  return current === "executing" && (next === "succeeded" || next === "failed");
}

export function canReportCommandResult(
  current: string,
  next: "acknowledged" | "succeeded" | "failed",
): boolean {
  if (next === "acknowledged") return current === "dispatched";
  return current === "dispatched" || current === "acknowledged";
}

export function isValidLeaseRecovery(
  value: unknown,
): value is { confirm: "FAIL_STALE_LEASES"; older_than_minutes: number } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    record["confirm"] === "FAIL_STALE_LEASES" &&
    Number.isInteger(record["older_than_minutes"]) &&
    Number(record["older_than_minutes"]) >= 15 &&
    Number(record["older_than_minutes"]) <= 1440
  );
}

export function canReportScanResult(
  current: string,
  next: "running" | "completed" | "failed" | "cancelled",
): boolean {
  return current === "running" && ["running", "completed", "failed", "cancelled"].includes(next);
}
