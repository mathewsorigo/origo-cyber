import { createFileRoute } from "@tanstack/react-router";

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
    },
  },
});
