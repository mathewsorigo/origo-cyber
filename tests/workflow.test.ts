import assert from "node:assert/strict";
import test from "node:test";

import {
  canReportActionResult,
  canReportCommandResult,
  canReportScanResult,
} from "../src/lib/workflow.ts";

test("ação só aceita resultado terminal quando está em execução", () => {
  assert.equal(canReportActionResult("executing", "succeeded"), true);
  assert.equal(canReportActionResult("executing", "failed"), true);
  assert.equal(canReportActionResult("approved", "succeeded"), false);
});

test("comando aceita ack após despacho e resultado terminal após despacho ou ack", () => {
  assert.equal(canReportCommandResult("dispatched", "acknowledged"), true);
  assert.equal(canReportCommandResult("acknowledged", "succeeded"), true);
  assert.equal(canReportCommandResult("pending", "succeeded"), false);
  assert.equal(canReportCommandResult("succeeded", "failed"), false);
});

test("scan só aceita progresso e resultado enquanto está executando", () => {
  assert.equal(canReportScanResult("running", "completed"), true);
  assert.equal(canReportScanResult("running", "cancelled"), true);
  assert.equal(canReportScanResult("queued", "completed"), false);
  assert.equal(canReportScanResult("completed", "failed"), false);
});
