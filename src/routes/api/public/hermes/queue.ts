import { createFileRoute } from "@tanstack/react-router";
import { isValidLeaseRecovery } from "@/lib/workflow";

export const Route = createFileRoute("/api/public/hermes/queue")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { authenticateHermes, unauthorized, json } = await import("@/lib/hermes-auth.server");
        const caller = await authenticateHermes(request);
        if (!caller) return unauthorized();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const [commands, actions, scans, executingActions, runningScans, policy] =
          await Promise.all([
            supabaseAdmin
              .from("hermes_commands")
              .select("id", { count: "exact", head: true })
              .eq("status", "pending"),
            supabaseAdmin
              .from("response_actions")
              .select("id", { count: "exact", head: true })
              .eq("status", "approved"),
            supabaseAdmin
              .from("scans")
              .select("id", { count: "exact", head: true })
              .eq("status", "queued"),
            supabaseAdmin
              .from("response_actions")
              .select("id", { count: "exact", head: true })
              .eq("status", "executing"),
            supabaseAdmin
              .from("scans")
              .select("id", { count: "exact", head: true })
              .eq("status", "running"),
            supabaseAdmin
              .from("hermes_policies")
              .select("mode, paused, auto_approved_actions")
              .eq("singleton", true)
              .maybeSingle(),
          ]);
        const error =
          commands.error ??
          actions.error ??
          scans.error ??
          executingActions.error ??
          runningScans.error ??
          policy.error;
        if (error) return json({ error: error.message }, 500);

        return json({
          ok: true,
          pending: {
            commands: commands.count ?? 0,
            approved_actions: actions.count ?? 0,
            queued_scans: scans.count ?? 0,
          },
          in_progress: {
            actions: executingActions.count ?? 0,
            scans: runningScans.count ?? 0,
          },
          policy: policy.data,
        });
      },

      POST: async ({ request }) => {
        const { authenticateHermes, unauthorized, badRequest, json, audit } =
          await import("@/lib/hermes-auth.server");
        const caller = await authenticateHermes(request);
        if (!caller) return unauthorized();

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return badRequest("Invalid JSON body");
        }
        if (!isValidLeaseRecovery(body)) {
          return badRequest("Explicit stale lease confirmation required");
        }

        const now = new Date().toISOString();
        const cutoff = new Date(Date.now() - body.older_than_minutes * 60_000).toISOString();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const actions = await supabaseAdmin
          .from("response_actions")
          .update({
            status: "failed",
            result: {
              observed: "execution lease expired without terminal report",
              recommendation:
                "review evidence and create a new approval; never retry automatically",
            },
            executed_at: now,
          })
          .eq("status", "executing")
          .lt("executed_at", cutoff)
          .select("id");
        if (actions.error) return json({ error: actions.error.message }, 500);

        const scans = await supabaseAdmin
          .from("scans")
          .update({
            status: "failed",
            error: "Worker lease expired without terminal report; automatic retry blocked",
            finished_at: now,
          })
          .eq("status", "running")
          .lt("started_at", cutoff)
          .select("id");
        if (scans.error) return json({ error: scans.error.message }, 500);

        const commands = await supabaseAdmin
          .from("hermes_commands")
          .update({
            status: "failed",
            error: "Worker lease expired without terminal report; automatic retry blocked",
            completed_at: now,
          })
          .in("status", ["dispatched", "acknowledged"])
          .lt("dispatched_at", cutoff)
          .select("id");
        if (commands.error) return json({ error: commands.error.message }, 500);

        const recovered = {
          actions_failed: actions.data?.length ?? 0,
          scans_failed: scans.data?.length ?? 0,
          commands_failed: commands.data?.length ?? 0,
        };
        if (Object.values(recovered).some((count) => count > 0)) {
          await audit(caller, "hermes.leases.failed_closed", "worker_lease", null, {
            cutoff,
            ...recovered,
          });
        }
        return json({ ok: true, recovered });
      },
    },
  },
});
