import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { canReportScanResult } from "@/lib/workflow";

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["running", "completed", "failed", "cancelled"]),
  progress: z.number().int().min(0).max(100).optional(),
  findings_count: z.number().int().min(0).max(100000).optional(),
  error: z.string().max(4000).optional(),
});

export const Route = createFileRoute("/api/public/hermes/scans")({
  server: {
    handlers: {
      // Agent pulls queued scans requested from the panel and marks them running.
      GET: async ({ request }) => {
        const { authenticateHermes, unauthorized, json, audit } =
          await import("@/lib/hermes-auth.server");
        const caller = await authenticateHermes(request);
        if (!caller) return unauthorized();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: queued, error } = await supabaseAdmin
          .from("scans")
          .select("id, target, scan_type, asset_id, created_at")
          .eq("status", "queued")
          .order("created_at", { ascending: true })
          .limit(10);

        if (error) return json({ error: error.message }, 500);
        if (!queued?.length) return json({ scans: [] });

        const claimed = [];
        for (const scan of queued) {
          const { data } = await supabaseAdmin
            .from("scans")
            .update({ status: "running", started_at: new Date().toISOString(), progress: 1 })
            .eq("id", scan.id)
            .eq("status", "queued")
            .select("id, target, scan_type, asset_id, created_at")
            .maybeSingle();
          if (data) claimed.push(data);
        }
        if (!claimed.length) return json({ scans: [] });

        await audit(caller, "hermes.scans.pulled", "scan", null, { count: claimed.length });

        return json({ scans: claimed });
      },

      // Agent reports scan progress / completion.
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
        const parsed = updateSchema.safeParse(raw);
        if (!parsed.success) return badRequest("Invalid payload", parsed.error.issues);
        const body = parsed.data;

        const finished =
          body.status === "completed" || body.status === "failed" || body.status === "cancelled";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: current, error: lookupError } = await supabaseAdmin
          .from("scans")
          .select("id, status")
          .eq("id", body.id)
          .maybeSingle();
        if (lookupError) return json({ error: lookupError.message }, 500);
        if (!current) return json({ error: "Scan not found" }, 404);
        if (!canReportScanResult(current.status, body.status)) {
          return json(
            { error: `Invalid scan transition: ${current.status} -> ${body.status}` },
            409,
          );
        }

        const { data, error } = await supabaseAdmin
          .from("scans")
          .update({
            status: body.status,
            ...(body.progress !== undefined
              ? { progress: body.progress }
              : body.status === "completed"
                ? { progress: 100 }
                : {}),
            ...(body.findings_count !== undefined ? { findings_count: body.findings_count } : {}),
            error: body.error ?? null,
            ...(finished ? { finished_at: new Date().toISOString() } : {}),
          })
          .eq("id", body.id)
          .eq("status", "running")
          .select("id, target, status, progress, findings_count")
          .maybeSingle();

        if (error) return json({ error: error.message }, 500);
        if (!data) return json({ error: "Scan not found" }, 404);

        if (finished) {
          await audit(caller, `hermes.scan.${body.status}`, "scan", data.id, {
            target: data.target,
            findings_count: data.findings_count,
          });
        }

        return json({ ok: true, scan: data });
      },
    },
  },
});
