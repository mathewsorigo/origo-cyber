import assert from "node:assert/strict";
import test from "node:test";

import { isCompleteResponsePlan } from "../src/lib/response-action.ts";

test("plano de resposta exige plataforma, alvo, execução, rollback e validação", () => {
  assert.equal(
    isCompleteResponsePlan({
      platform: "bitdefender",
      target: "endpoint-id",
      execution: "isolate endpoint",
      rollback: "remove isolation",
      validation: "read back isolation state",
    }),
    true,
  );
  assert.equal(
    isCompleteResponsePlan({
      platform: "bitdefender",
      target: "endpoint-id",
      execution: "isolate endpoint",
      rollback: "",
      validation: "read back isolation state",
    }),
    false,
  );
  assert.equal(isCompleteResponsePlan(null), false);
});

test("plano de resposta rejeita campos extras para manter contrato previsível", () => {
  assert.equal(
    isCompleteResponsePlan({
      platform: "microsoft-graph",
      target: "user-id",
      execution: "revoke sessions",
      rollback: "not applicable: token revocation is irreversible",
      validation: "read back sign-in sessions",
      secret: "must-not-be-accepted",
    }),
    false,
  );
});
