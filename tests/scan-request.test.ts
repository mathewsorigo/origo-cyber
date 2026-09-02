import assert from "node:assert/strict";
import test from "node:test";

import { authorizedScanTarget } from "../src/lib/scan-request.ts";

test("scan usa somente o identificador persistido do ativo autorizado", () => {
  assert.equal(
    authorizedScanTarget({ id: "asset-1", identifier: "srv-app-01.origo.local" }),
    "srv-app-01.origo.local",
  );
});

test("scan rejeita ativo ausente ou sem identificador", () => {
  assert.throws(() => authorizedScanTarget(null), /Ativo cadastrado/);
  assert.throws(
    () => authorizedScanTarget({ id: "asset-1", identifier: "  " }),
    /identificador válido/,
  );
});
