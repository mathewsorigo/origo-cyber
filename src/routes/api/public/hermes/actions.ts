import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { canReportActionResult } from "@/lib/workflow";

const resultSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["succeeded", "failed"]),
  result: z.record(z.unknown()).optional(),
});

export const Route = createFileRoute("/api/public/hermes/actions")({
  server: {
    handlers: {
      // Agent pulls response actions approved by an admin and marks them executing.
      GET: async ({ request }) => {
        const { authenticateHermes, unauthorized, json, audit } =
          await import("@/lib/hermes-auth.server");
        const caller = await authenticateHermes(request);
        if (!caller) return unauthorized();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: approved, error } = await supabaseAdmin
          .from("response_actions")
          .select("id, action_type, title, payload, risk, incident_id, vulnerability_id, asset_id")
          .eq("status", "approved")
          .order("decided_at", { ascending: true })
          .limit(20);

        if (error) return json({ error: error.message }, 500);
        const claimed = [];
        for (const action of approved ?? []) {
          const { data } = await supabaseAdmin
            .from("response_actions")
            .update({ status: "executing", executed_at: new Date().toISOString() })
            .eq("id", action.id)
            .eq("status", "approved")
            .select(
              "id, action_type, title, payload, risk, incident_id, vulnerability_id, asset_id",
            )
            .maybeSingle();
          if (data) claimed.push(data);
        }
        if (!claimed.length) return json({ actions: [] });

        await audit(caller, "hermes.actions.pulled", "response_action", null, {
          count: claimed.length,
        });

        return json({ actions: claimed });
      },

      // Agent reports the outcome of an approved response action.
      POST: async ({ request }) => {
        const { authenticateHermes, unauthorized, badRequest, json, audit } =
          await import("@/lib/hermes-auth.server");
        const caller = await authenticateHermes(request);
        if (!caller) return unauthorized();

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return badRequest("Invalid JSON body");
        }
        const parsed = resultSchema.safeParse(raw);
        if (!parsed.success) return badRequest("Invalid payload", parsed.error.issues);
        const body = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: current, error: lookupError } = await supabaseAdmin
          .from("response_actions")
          .select("id, status")
          .eq("id", body.id)
          .maybeSingle();
        if (lookupError) return json({ error: lookupError.message }, 500);
        if (!current) return json({ error: "Action not found" }, 404);
        if (!canReportActionResult(current.status, body.status)) {
          return json(
            { error: `Invalid action transition: ${current.status} -> ${body.status}` },
            409,
          );
        }

        const { data, error } = await supabaseAdmin
          .from("response_actions")
          .update({
            status: body.status,
            result: (body.result ?? null) as never,
            executed_at: new Date().toISOString(),
          })
          .eq("id", body.id)
          .eq("status", "executing")
          .select("id, action_type, status")
          .maybeSingle();

        if (error) return json({ error: error.message }, 500);
        if (!data) return json({ error: "Action not found" }, 404);

        await audit(caller, `hermes.action.${body.status}`, "response_action", data.id, {
          action_type: data.action_type,
        });

        return json({ ok: true, action: data });
      },
    },
  },
});
