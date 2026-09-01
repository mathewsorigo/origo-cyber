import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PanelRole = "admin" | "analyst" | "viewer";
export type PanelCaller = {
  userId: string;
  email: string;
  roles: PanelRole[];
  isAdmin: boolean;
  canTriage: boolean;
};

export async function authenticatePanel(request: Request): Promise<PanelCaller | null> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: rows, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);
  if (roleError) return null;

  const roles = (rows ?? []).map((row) => row.role as PanelRole);
  return {
    userId: data.user.id,
    email: data.user.email?.trim().toLowerCase() ?? "",
    roles,
    isAdmin: roles.includes("admin"),
    canTriage: roles.includes("admin") || roles.includes("analyst"),
  };
}

export async function auditPanel(
  caller: PanelCaller,
  action: string,
  entityType: string | null,
  entityId: string | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabaseAdmin.from("audit_log").insert({
    actor_id: caller.userId,
    actor_label: caller.email || caller.userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    detail: detail as never,
  });
  if (error) throw new Error(`Audit failed: ${error.message}`);
}
