import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const uuid = z.string().uuid();
const severity = z.enum(["critical", "high", "medium", "low", "info"]);
const vulnerabilityStatus = z.enum([
  "new",
  "triaging",
  "confirmed",
  "false_positive",
  "mitigating",
  "resolved",
  "risk_accepted",
]);
const incidentPhase = z.enum(["open", "contained", "eradicated", "recovered", "closed"]);
const assetKind = z.enum(["host", "domain", "repository", "cloud", "endpoint", "database", "saas"]);
const safeCommand = z.enum([
  "ping",
  "pause_agent",
  "resume_agent",
  "reload_policy",
  "update_signatures",
]);

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("vulnerability.update"),
    payload: z.object({
      id: uuid,
      status: vulnerabilityStatus,
      due_at: z.string().datetime().nullable().optional(),
      assigned_to: uuid.nullable().optional(),
      remediation: z.string().max(8000).nullable().optional(),
      note: z.string().max(4000).default(""),
    }),
  }),
  z.object({
    action: z.literal("incident.update"),
    payload: z.object({
      id: uuid,
      phase: incidentPhase,
      lead: uuid.nullable().optional(),
      summary: z.string().max(8000).nullable().optional(),
      note: z.string().max(4000).default(""),
    }),
  }),
  z.object({
    action: z.literal("asset.create"),
    payload: z.object({
      name: z.string().trim().min(2).max(200),
      identifier: z.string().trim().min(1).max(300),
      kind: assetKind,
      environment: z.string().trim().min(1).max(80).default("production"),
      criticality: severity,
      owner_team: z.string().trim().max(200).nullable().optional(),
      tags: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
      notes: z.string().max(4000).nullable().optional(),
    }),
  }),
  z.object({
    action: z.literal("asset.update"),
    payload: z.object({
      id: uuid,
      name: z.string().trim().min(2).max(200).optional(),
      environment: z.string().trim().min(1).max(80).optional(),
      criticality: severity.optional(),
      owner_team: z.string().trim().max(200).nullable().optional(),
      tags: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
      notes: z.string().max(4000).nullable().optional(),
      monitored: z.boolean().optional(),
    }),
  }),
  z.object({
    action: z.literal("asset.delete"),
    payload: z.object({ id: uuid, note: z.string().min(3).max(1000) }),
  }),
  z.object({
    action: z.literal("scan.create"),
    payload: z.object({
      target: z.string().trim().min(1).max(500),
      asset_id: uuid.nullable().optional(),
      scan_type: z.enum(["quick", "full", "web", "cloud", "code"]),
    }),
  }),
  z.object({
    action: z.literal("scan.cancel"),
    payload: z.object({ id: uuid, note: z.string().min(3).max(1000) }),
  }),
  z.object({
    action: z.literal("response_action.decide"),
    payload: z.object({
      id: uuid,
      decision: z.enum(["approve", "reject"]),
      justification: z.string().trim().min(3).max(4000),
    }),
  }),
  z.object({
    action: z.literal("policy.update"),
    payload: z.object({
      mode: z.enum(["monitor_only", "supervised"]).optional(),
      min_severity_to_act: severity.optional(),
      scan_schedule: z.string().max(200).optional(),
      maintenance_window: z.string().max(500).nullable().optional(),
      paused: z.boolean().optional(),
      notes: z.string().max(4000).nullable().optional(),
    }),
  }),
  z.object({
    action: z.literal("command.create"),
    payload: z.object({ command: safeCommand, args: z.record(z.unknown()).default({}) }),
  }),
  z.object({
    action: z.literal("user.role"),
    payload: z.object({ user_id: uuid, role: z.enum(["admin", "analyst", "viewer"]) }),
  }),
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/panel/control")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const contentLength = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(contentLength) && contentLength > 131_072)
          return json({ error: "Payload too large" }, 413);

        const { authenticatePanel, auditPanel } = await import("@/lib/panel-auth.server");
        const caller = await authenticatePanel(request);
        if (!caller) return json({ error: "Sessão inválida" }, 401);

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "JSON inválido" }, 400);
        }
        const parsed = requestSchema.safeParse(raw);
        if (!parsed.success)
          return json({ error: "Dados inválidos", issues: parsed.error.issues }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { action, payload } = parsed.data;
        const requireAdmin = () => {
          if (!caller.isAdmin) throw new Error("Ação restrita a administradores");
        };
        const requireTriage = () => {
          if (!caller.canTriage) throw new Error("Ação restrita a administradores e analistas");
        };

        try {
          if (action === "vulnerability.update") {
            requireTriage();
            if (
              ["resolved", "false_positive", "risk_accepted"].includes(payload.status) &&
              payload.note.trim().length < 3
            ) {
              return json({ error: "Justificativa obrigatória para o status selecionado" }, 400);
            }
            const patch = {
              status: payload.status,
              ...(payload.due_at !== undefined ? { due_at: payload.due_at } : {}),
              ...(payload.assigned_to !== undefined ? { assigned_to: payload.assigned_to } : {}),
              ...(payload.remediation !== undefined ? { remediation: payload.remediation } : {}),
              resolved_at: payload.status === "resolved" ? new Date().toISOString() : null,
            };
            const { data, error } = await supabaseAdmin
              .from("vulnerabilities")
              .update(patch)
              .eq("id", payload.id)
              .select("*")
              .maybeSingle();
            if (error) throw error;
            if (!data) return json({ error: "Vulnerabilidade não encontrada" }, 404);
            await auditPanel(caller, "panel.vulnerability.updated", "vulnerability", data.id, {
              status: payload.status,
              note: payload.note,
            });
            return json({ ok: true, entity: data });
          }

          if (action === "incident.update") {
            requireTriage();
            if (payload.phase === "closed" && payload.note.trim().length < 3)
              return json({ error: "Justificativa obrigatória para encerrar" }, 400);
            const patch = {
              phase: payload.phase,
              ...(payload.lead !== undefined ? { lead: payload.lead } : {}),
              ...(payload.summary !== undefined ? { summary: payload.summary } : {}),
              ...(payload.phase === "contained" ? { contained_at: new Date().toISOString() } : {}),
              closed_at: payload.phase === "closed" ? new Date().toISOString() : null,
            };
            const { data, error } = await supabaseAdmin
              .from("incidents")
              .update(patch)
              .eq("id", payload.id)
              .select("*")
              .maybeSingle();
            if (error) throw error;
            if (!data) return json({ error: "Incidente não encontrado" }, 404);
            await auditPanel(caller, "panel.incident.updated", "incident", data.id, {
              phase: payload.phase,
              note: payload.note,
            });
            return json({ ok: true, entity: data });
          }

          if (action === "asset.create") {
            requireAdmin();
            const { data, error } = await supabaseAdmin
              .from("assets")
              .insert({
                ...payload,
                owner_team: payload.owner_team ?? null,
                notes: payload.notes ?? null,
                monitored: true,
              })
              .select("*")
              .single();
            if (error) throw error;
            await auditPanel(caller, "panel.asset.created", "asset", data.id, {
              identifier: data.identifier,
            });
            return json({ ok: true, entity: data }, 201);
          }

          if (action === "asset.update") {
            requireAdmin();
            const { id } = payload;
            const patch = {
              ...(payload.name !== undefined ? { name: payload.name } : {}),
              ...(payload.environment !== undefined ? { environment: payload.environment } : {}),
              ...(payload.criticality !== undefined ? { criticality: payload.criticality } : {}),
              ...(payload.owner_team !== undefined ? { owner_team: payload.owner_team } : {}),
              ...(payload.tags !== undefined ? { tags: payload.tags } : {}),
              ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
              ...(payload.monitored !== undefined ? { monitored: payload.monitored } : {}),
            };
            const { data, error } = await supabaseAdmin
              .from("assets")
              .update(patch)
              .eq("id", id)
              .select("*")
              .maybeSingle();
            if (error) throw error;
            if (!data) return json({ error: "Ativo não encontrado" }, 404);
            await auditPanel(caller, "panel.asset.updated", "asset", data.id, {
              fields: Object.keys(patch),
            });
            return json({ ok: true, entity: data });
          }

          if (action === "asset.delete") {
            requireAdmin();
            const [vulnerabilities, scans, actions] = await Promise.all([
              supabaseAdmin
                .from("vulnerabilities")
                .select("id", { count: "exact", head: true })
                .eq("asset_id", payload.id),
              supabaseAdmin
                .from("scans")
                .select("id", { count: "exact", head: true })
                .eq("asset_id", payload.id),
              supabaseAdmin
                .from("response_actions")
                .select("id", { count: "exact", head: true })
                .eq("asset_id", payload.id),
            ]);
            const dependencies =
              (vulnerabilities.count ?? 0) + (scans.count ?? 0) + (actions.count ?? 0);
            if (dependencies > 0)
              return json(
                {
                  error: `Ativo possui ${dependencies} vínculo(s); pause o monitoramento em vez de excluir`,
                },
                409,
              );
            const { data, error } = await supabaseAdmin
              .from("assets")
              .delete()
              .eq("id", payload.id)
              .select("id,identifier")
              .maybeSingle();
            if (error) throw error;
            if (!data) return json({ error: "Ativo não encontrado" }, 404);
            await auditPanel(caller, "panel.asset.deleted", "asset", data.id, {
              identifier: data.identifier,
              note: payload.note,
            });
            return json({ ok: true });
          }

          if (action === "scan.create") {
            requireAdmin();
            const { data: scan, error } = await supabaseAdmin
              .from("scans")
              .insert({
                target: payload.target,
                asset_id: payload.asset_id ?? null,
                scan_type: payload.scan_type,
                status: "queued",
                started_by: caller.userId,
              })
              .select("*")
              .single();
            if (error) throw error;
            const { data: command, error: commandError } = await supabaseAdmin
              .from("hermes_commands")
              .insert({
                command: "start_scan",
                args: { scan_id: scan.id, target: payload.target, scan_type: payload.scan_type },
                status: "pending",
                issued_by: caller.userId,
              })
              .select("id")
              .single();
            if (commandError) {
              await supabaseAdmin.from("scans").delete().eq("id", scan.id);
              throw commandError;
            }
            await auditPanel(caller, "panel.scan.queued", "scan", scan.id, {
              command_id: command.id,
              target: payload.target,
              scan_type: payload.scan_type,
            });
            return json({ ok: true, entity: scan, command_id: command.id }, 201);
          }

          if (action === "scan.cancel") {
            requireAdmin();
            const { data: scan } = await supabaseAdmin
              .from("scans")
              .select("id,status,target")
              .eq("id", payload.id)
              .maybeSingle();
            if (!scan) return json({ error: "Scan não encontrado" }, 404);
            if (!["queued", "running"].includes(scan.status))
              return json(
                { error: "Somente scans na fila ou em execução podem ser cancelados" },
                409,
              );
            if (scan.status === "queued") {
              const { data: cancelled, error } = await supabaseAdmin
                .from("scans")
                .update({ status: "cancelled", finished_at: new Date().toISOString() })
                .eq("id", scan.id)
                .eq("status", "queued")
                .select("id")
                .maybeSingle();
              if (error) throw error;
              if (!cancelled)
                return json(
                  { error: "O scan iniciou antes do cancelamento; tente novamente" },
                  409,
                );
              await auditPanel(caller, "panel.scan.cancelled_before_execution", "scan", scan.id, {
                note: payload.note,
              });
              return json({ ok: true, command_id: null });
            }
            const { data: existingCancellation } = await supabaseAdmin
              .from("hermes_commands")
              .select("id")
              .eq("command", "cancel_scan")
              .contains("args", { scan_id: scan.id })
              .in("status", ["pending", "dispatched", "acknowledged"])
              .limit(1)
              .maybeSingle();
            if (existingCancellation)
              return json({ error: "Cancelamento já solicitado para este scan" }, 409);
            const { data: command, error: commandError } = await supabaseAdmin
              .from("hermes_commands")
              .insert({
                command: "cancel_scan",
                args: { scan_id: scan.id },
                status: "pending",
                issued_by: caller.userId,
              })
              .select("id")
              .single();
            if (commandError) throw commandError;
            await auditPanel(caller, "panel.scan.cancellation_requested", "scan", scan.id, {
              command_id: command.id,
              note: payload.note,
            });
            return json({ ok: true, command_id: command.id });
          }

          if (action === "response_action.decide") {
            requireAdmin();
            const { data: existing } = await supabaseAdmin
              .from("response_actions")
              .select("id,status,action_type,title,payload,risk")
              .eq("id", payload.id)
              .maybeSingle();
            if (!existing) return json({ error: "Ação não encontrada" }, 404);
            if (existing.status !== "pending_approval")
              return json({ error: `Ação já está ${existing.status}` }, 409);
            const status = payload.decision === "approve" ? "approved" : "rejected";
            const { data, error } = await supabaseAdmin
              .from("response_actions")
              .update({
                status,
                decided_at: new Date().toISOString(),
                decided_by: caller.userId,
                decision_reason: payload.justification,
              })
              .eq("id", existing.id)
              .eq("status", "pending_approval")
              .select("*")
              .maybeSingle();
            if (error) throw error;
            if (!data) return json({ error: "A ação já foi decidida por outro usuário" }, 409);
            await auditPanel(
              caller,
              `panel.response_action.${status}`,
              "response_action",
              data.id,
              {
                action_type: data.action_type,
                risk: data.risk,
                justification: payload.justification,
              },
            );
            return json({ ok: true, entity: data });
          }

          if (action === "policy.update") {
            requireAdmin();
            const patch = {
              ...(payload.mode !== undefined ? { mode: payload.mode } : {}),
              ...(payload.min_severity_to_act !== undefined
                ? { min_severity_to_act: payload.min_severity_to_act }
                : {}),
              ...(payload.scan_schedule !== undefined
                ? { scan_schedule: payload.scan_schedule }
                : {}),
              ...(payload.maintenance_window !== undefined
                ? { maintenance_window: payload.maintenance_window }
                : {}),
              ...(payload.paused !== undefined ? { paused: payload.paused } : {}),
              ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
              auto_approved_actions: [],
              updated_by: caller.userId,
            };
            const { data, error } = await supabaseAdmin
              .from("hermes_policies")
              .update(patch)
              .eq("singleton", true)
              .select("*")
              .single();
            if (error) throw error;
            await auditPanel(caller, "panel.policy.updated", "hermes_policy", data.id, {
              fields: Object.keys(payload),
              auto_approved_actions: [],
            });
            return json({ ok: true, entity: data });
          }

          if (action === "command.create") {
            requireAdmin();
            const { data, error } = await supabaseAdmin
              .from("hermes_commands")
              .insert({
                command: payload.command,
                args: payload.args as never,
                status: "pending",
                issued_by: caller.userId,
              })
              .select("*")
              .single();
            if (error) throw error;
            await auditPanel(caller, "panel.command.queued", "hermes_command", data.id, {
              command: data.command,
            });
            return json({ ok: true, entity: data }, 201);
          }

          if (action === "user.role") {
            requireAdmin();
            if (payload.user_id === caller.userId && payload.role !== "admin")
              return json(
                { error: "Você não pode remover seu próprio papel de administrador" },
                409,
              );
            const { count: adminCount } = await supabaseAdmin
              .from("user_roles")
              .select("id", { count: "exact", head: true })
              .eq("role", "admin");
            const { data: currentRoles } = await supabaseAdmin
              .from("user_roles")
              .select("role")
              .eq("user_id", payload.user_id);
            if (
              (adminCount ?? 0) <= 1 &&
              currentRoles?.some((row) => row.role === "admin") &&
              payload.role !== "admin"
            ) {
              return json({ error: "O último administrador não pode ser removido" }, 409);
            }
            const { error: upsertError } = await supabaseAdmin
              .from("user_roles")
              .upsert(
                { user_id: payload.user_id, role: payload.role },
                { onConflict: "user_id,role" },
              );
            if (upsertError) throw upsertError;
            const { error: deleteError } = await supabaseAdmin
              .from("user_roles")
              .delete()
              .eq("user_id", payload.user_id)
              .neq("role", payload.role);
            if (deleteError) throw deleteError;
            await auditPanel(caller, "panel.user.role_updated", "profile", payload.user_id, {
              role: payload.role,
            });
            return json({ ok: true });
          }

          return json({ error: "Ação não suportada" }, 400);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Falha interna";
          const forbidden = message.includes("restrita");
          return json({ error: message }, forbidden ? 403 : 500);
        }
      },
    },
  },
});
