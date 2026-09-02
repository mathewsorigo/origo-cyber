import { createFileRoute } from "@tanstack/react-router";
import {
  DEMO_ACTION_TITLES,
  DEMO_ASSET_IDENTIFIERS,
  DEMO_INCIDENT_REFERENCES,
  DEMO_SCAN_TARGETS,
  DEMO_VULNERABILITY_FINGERPRINTS,
  isDemoAuditEvent,
  isDemoCleanupConfirmation,
  isDemoCommand,
} from "@/lib/demo-data";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/hermes/maintenance")({
  server: {
    handlers: {
      // Read-only verification endpoint.
      GET: async ({ request }) => {
        const { authenticateHermes, unauthorized } = await import("@/lib/hermes-auth.server");
        const caller = await authenticateHermes(request);
        if (!caller) return unauthorized();

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const [{ data: policy, error: policyError }, demoRecords] = await Promise.all([
            supabaseAdmin
              .from("hermes_policies")
              .select("mode, paused, auto_approved_actions")
              .eq("singleton", true)
              .maybeSingle(),
            countDemoRecords(supabaseAdmin),
          ]);
          if (policyError) throw new Error(policyError.message);
          return response({ ok: true, demo_records: demoRecords, policy });
        } catch (error) {
          return response(
            { error: error instanceof Error ? error.message : "Maintenance check failed" },
            500,
          );
        }
      },

      // Authenticated, explicit and idempotent cleanup of the original demo seed.
      POST: async ({ request }) => {
        const { authenticateHermes, unauthorized } = await import("@/lib/hermes-auth.server");
        const caller = await authenticateHermes(request);
        if (!caller) return unauthorized();

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return response({ error: "invalid json" }, 400);
        }
        if (!isDemoCleanupConfirmation(body)) {
          return response({ error: "explicit cleanup confirmation required" }, 400);
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const before = await countDemoRecords(supabaseAdmin);
          await cleanupDemoRecords(supabaseAdmin);
          const after = await countDemoRecords(supabaseAdmin);
          return response({ ok: true, before, after });
        } catch (error) {
          return response(
            { error: error instanceof Error ? error.message : "Maintenance cleanup failed" },
            500,
          );
        }
      },
    },
  },
});

type AdminClient = typeof import("@/integrations/supabase/client.server").supabaseAdmin;

type QueryError = { message: string } | null;

function assertNoError(error: QueryError) {
  if (error) throw new Error(error.message);
}

async function cleanupDemoRecords(client: AdminClient): Promise<void> {
  const [assets, vulnerabilities, incidents, actions, scans, commands, audit] = await Promise.all([
    client
      .from("assets")
      .select("id, identifier")
      .in("identifier", [...DEMO_ASSET_IDENTIFIERS]),
    client
      .from("vulnerabilities")
      .select("id, fingerprint")
      .in("fingerprint", [...DEMO_VULNERABILITY_FINGERPRINTS]),
    client
      .from("incidents")
      .select("id, reference")
      .in("reference", [...DEMO_INCIDENT_REFERENCES]),
    client
      .from("response_actions")
      .select("id, vulnerability_id, incident_id, title")
      .in("title", [...DEMO_ACTION_TITLES]),
    client
      .from("scans")
      .select("id, asset_id, target, started_by")
      .in("target", [...DEMO_SCAN_TARGETS]),
    client.from("hermes_commands").select("id, command, args, result"),
    client
      .from("audit_log")
      .select("id, actor_label, action, detail")
      .in("action", [
        "finding.ingested",
        "action.proposed",
        "action.executed",
        "policy.updated",
        "scan.started",
      ]),
  ]);

  for (const result of [assets, vulnerabilities, incidents, actions, scans, commands, audit]) {
    assertNoError(result.error);
  }

  const assetIds = new Set((assets.data ?? []).map((record) => record.id));
  const vulnerabilityIds = new Set((vulnerabilities.data ?? []).map((record) => record.id));
  const incidentIds = new Set((incidents.data ?? []).map((record) => record.id));
  const actionIds = (actions.data ?? [])
    .filter(
      (record) =>
        (record.vulnerability_id && vulnerabilityIds.has(record.vulnerability_id)) ||
        (record.incident_id && incidentIds.has(record.incident_id)),
    )
    .map((record) => record.id);
  const scanIds = (scans.data ?? [])
    .filter(
      (record) =>
        record.started_by === null && record.asset_id !== null && assetIds.has(record.asset_id),
    )
    .map((record) => record.id);
  const commandIds = (commands.data ?? []).filter(isDemoCommand).map((record) => record.id);
  const auditIds = (audit.data ?? []).filter(isDemoAuditEvent).map((record) => record.id);

  if (actionIds.length) {
    const result = await client.from("response_actions").delete().in("id", actionIds);
    assertNoError(result.error);
  }
  if (scanIds.length) {
    const result = await client.from("scans").delete().in("id", scanIds);
    assertNoError(result.error);
  }

  const vulnerabilitiesDeletion = await client
    .from("vulnerabilities")
    .delete()
    .in("fingerprint", [...DEMO_VULNERABILITY_FINGERPRINTS]);
  assertNoError(vulnerabilitiesDeletion.error);

  const incidentsDeletion = await client
    .from("incidents")
    .delete()
    .in("reference", [...DEMO_INCIDENT_REFERENCES]);
  assertNoError(incidentsDeletion.error);

  const assetsDeletion = await client
    .from("assets")
    .delete()
    .in("identifier", [...DEMO_ASSET_IDENTIFIERS]);
  assertNoError(assetsDeletion.error);

  if (commandIds.length) {
    const result = await client.from("hermes_commands").delete().in("id", commandIds);
    assertNoError(result.error);
  }
  if (auditIds.length) {
    const result = await client.from("audit_log").delete().in("id", auditIds);
    assertNoError(result.error);
  }

  const policyUpdate = await client
    .from("hermes_policies")
    .update({
      mode: "supervised",
      auto_approved_actions: [],
      notes:
        "Controle supervisionado: execução crítica exige aprovação humana, rollback e validação.",
    })
    .eq("singleton", true);
  assertNoError(policyUpdate.error);
}

async function countDemoRecords(client: AdminClient): Promise<Record<string, number>> {
  const [assets, vulnerabilities, incidents, actions, scans, commands, audit] = await Promise.all([
    client
      .from("assets")
      .select("id", { count: "exact", head: true })
      .in("identifier", [...DEMO_ASSET_IDENTIFIERS]),
    client
      .from("vulnerabilities")
      .select("id", { count: "exact", head: true })
      .in("fingerprint", [...DEMO_VULNERABILITY_FINGERPRINTS]),
    client
      .from("incidents")
      .select("id", { count: "exact", head: true })
      .in("reference", [...DEMO_INCIDENT_REFERENCES]),
    client
      .from("response_actions")
      .select("id", { count: "exact", head: true })
      .in("title", [...DEMO_ACTION_TITLES]),
    client
      .from("scans")
      .select("id", { count: "exact", head: true })
      .in("target", [...DEMO_SCAN_TARGETS]),
    client.from("hermes_commands").select("id, command, args, result"),
    client
      .from("audit_log")
      .select("id, actor_label, action, detail")
      .in("action", [
        "finding.ingested",
        "action.proposed",
        "action.executed",
        "policy.updated",
        "scan.started",
      ]),
  ]);

  const error =
    assets.error ??
    vulnerabilities.error ??
    incidents.error ??
    actions.error ??
    scans.error ??
    commands.error ??
    audit.error;
  if (error) throw new Error(error.message);

  return {
    assets: assets.count ?? 0,
    vulnerabilities: vulnerabilities.count ?? 0,
    incidents: incidents.count ?? 0,
    response_actions: actions.count ?? 0,
    scans: scans.count ?? 0,
    hermes_commands: (commands.data ?? []).filter(isDemoCommand).length,
    audit_log: (audit.data ?? []).filter(isDemoAuditEvent).length,
  };
}
