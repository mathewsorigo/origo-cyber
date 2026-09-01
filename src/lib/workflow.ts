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

export function canReportScanResult(
  current: string,
  next: "running" | "completed" | "failed" | "cancelled",
): boolean {
  return current === "running" && ["running", "completed", "failed", "cancelled"].includes(next);
}
