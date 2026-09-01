import { supabase } from "@/integrations/supabase/client";

export type ControlAction =
  | "vulnerability.update"
  | "incident.update"
  | "asset.create"
  | "asset.update"
  | "asset.delete"
  | "scan.create"
  | "scan.cancel"
  | "response_action.decide"
  | "policy.update"
  | "command.create"
  | "user.role";

export async function runControlAction<T = unknown>(
  action: ControlAction,
  payload: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Sessão expirada. Entre novamente.");

  const response = await fetch("/api/panel/control", {
    method: "POST",
    headers: {
      authorization: `Bearer ${data.session.access_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ action, payload }),
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(body.error || `Falha no controle (${response.status})`);
  return body;
}
