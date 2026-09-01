import { createFileRoute } from "@tanstack/react-router";
import {
  DEMO_ACTION_TITLES,
  DEMO_ASSET_IDENTIFIERS,
  DEMO_INCIDENT_REFERENCES,
  DEMO_SCAN_TARGETS,
  DEMO_VULNERABILITY_FINGERPRINTS,
  isDemoAuditEvent,
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
      // Read-only verification endpoint. Cleanup is applied atomically by the database migration.
      GET: async ({ request }) => {
        const { authenticateHermes, unauthorized } = await import("@/lib/hermes-auth.server");
        const caller = await authenticateHermes(request);
        if (!caller) return unauthorized();

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          return response({ ok: true, demo_records: await countDemoRecords(supabaseAdmin) });
        } catch (error) {
          return response(
            { error: error instanceof Error ? error.message : "Maintenance check failed" },
            500,
          );
        }
      },
    },
  },
});

type AdminClient = typeof import("@/integrations/supabase/client.server").supabaseAdmin;

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
