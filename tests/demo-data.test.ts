import assert from "node:assert/strict";
import test from "node:test";

import {
  DEMO_ASSET_IDENTIFIERS,
  DEMO_INCIDENT_REFERENCES,
  DEMO_SCAN_TARGETS,
  DEMO_VULNERABILITY_FINGERPRINTS,
  isDemoAuditEvent,
  isDemoCommand,
  isDemoCleanupConfirmation,
} from "../src/lib/demo-data.ts";

test("catálogos de dados fictícios mantêm identificadores estáveis e únicos", () => {
  for (const values of [
    DEMO_ASSET_IDENTIFIERS,
    DEMO_INCIDENT_REFERENCES,
    DEMO_SCAN_TARGETS,
    DEMO_VULNERABILITY_FINGERPRINTS,
  ]) {
    assert.equal(new Set(values).size, values.length);
    assert.ok(values.length > 0);
  }
});

test("reconhece somente os comandos exatos do seed fictício", () => {
  assert.equal(
    isDemoCommand({
      command: "start_scan",
      args: { target: "aws:eks/origo-prod", scan_type: "cloud_posture" },
    }),
    true,
  );
  assert.equal(isDemoCommand({ command: "ping", args: {}, result: { latency_ms: 142 } }), true);
  assert.equal(isDemoCommand({ command: "ping", args: {} }), false);
  assert.equal(isDemoCommand({ command: "start_scan", args: { target: "ativo-real" } }), false);
});

test("confirmação de limpeza exige payload literal e não aceita aproximações", () => {
  assert.equal(isDemoCleanupConfirmation({ confirm: "REMOVE_DEMO_DATA" }), true);
  assert.equal(isDemoCleanupConfirmation({ confirm: "remove_demo_data" }), false);
  assert.equal(isDemoCleanupConfirmation({ confirm: "REMOVE_DEMO_DATA", extra: true }), false);
  assert.equal(isDemoCleanupConfirmation(null), false);
});

test("reconhece eventos fictícios pela combinação de ação e detalhe", () => {
  assert.equal(
    isDemoAuditEvent({
      actor_label: "hermes",
      action: "scan.started",
      detail: { target: "aws:eks/origo-prod" },
    }),
    true,
  );
  assert.equal(
    isDemoAuditEvent({
      actor_label: "hermes",
      action: "scan.started",
      detail: { target: "ativo-real" },
    }),
    false,
  );
  assert.equal(
    isDemoAuditEvent({
      actor_label: "hermes",
      action: "finding.ingested",
      detail: { title: "RCE em dependência de serialização" },
    }),
    true,
  );
});
