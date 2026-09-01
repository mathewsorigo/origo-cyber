// Server-only helpers for the Hermes agent public API.
import { supabaseAdmin } from '@/integrations/supabase/client.server';

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export function badRequest(message: string, issues?: unknown): Response {
  return json({ error: message, issues }, 400);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function extractToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (header && header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  const direct = request.headers.get('x-hermes-token');
  return direct ? direct.trim() : null;
}

export type HermesCaller = { keyId: string | null; label: string };

/**
 * Authenticates the Hermes agent. Accepts either the shared ingest secret
 * (HERMES_INGEST_SECRET) or an active key stored in hermes_api_keys.
 * Returns null when the caller is not authorized.
 */
export async function authenticateHermes(request: Request): Promise<HermesCaller | null> {
  const token = extractToken(request);
  if (!token || token.length < 16) return null;

  const shared = process.env['HERMES_INGEST_SECRET'];
  if (shared && timingSafeEqual(token, shared)) {
    return { keyId: null, label: 'hermes (shared secret)' };
  }

  const hash = await sha256Hex(token);
  const { data } = await supabaseAdmin
    .from('hermes_api_keys')
    .select('id, label, revoked')
    .eq('key_hash', hash)
    .eq('revoked', false)
    .maybeSingle();

  if (!data) return null;

  await supabaseAdmin
    .from('hermes_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id);

  return { keyId: data.id, label: data.label };
}

export async function audit(
  caller: HermesCaller,
  action: string,
  entityType: string | null,
  entityId: string | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await supabaseAdmin.from('audit_log').insert({
    actor_label: caller.label,
    action,
    entity_type: entityType,
    entity_id: entityId,
    detail: detail as never,
  });
}

export function unauthorized(): Response {
  return json({ error: 'Unauthorized' }, 401);
}
