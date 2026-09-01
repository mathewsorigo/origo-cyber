import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const bodySchema = z.object({
  version: z.string().max(40).optional(),
  health: z.enum(['healthy', 'degraded', 'offline', 'unknown']).default('healthy'),
  queue_size: z.number().int().min(0).max(100000).default(0),
  active_scans: z.number().int().min(0).max(1000).default(0),
  metrics: z.record(z.unknown()).optional(),
});

export const Route = createFileRoute('/api/public/hermes/heartbeat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateHermes, unauthorized, badRequest, json } = await import(
          '@/lib/hermes-auth.server'
        );
        const caller = await authenticateHermes(request);
        if (!caller) return unauthorized();

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return badRequest('Invalid JSON body');
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) return badRequest('Invalid payload', parsed.error.issues);

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { data, error } = await supabaseAdmin
          .from('agent_status')
          .upsert(
            {
              agent_name: 'hermes',
              version: parsed.data.version ?? null,
              health: parsed.data.health,
              queue_size: parsed.data.queue_size,
              active_scans: parsed.data.active_scans,
              metrics: (parsed.data.metrics ?? {}) as never,
              last_heartbeat_at: new Date().toISOString(),
            },
            { onConflict: 'agent_name' },
          )
          .select('id, health, last_heartbeat_at')
          .single();

        if (error) return json({ error: error.message }, 500);

        const { data: policy } = await supabaseAdmin
          .from('hermes_policies')
          .select('mode, min_severity_to_act, auto_approved_actions, scan_schedule, maintenance_window, paused')
          .limit(1)
          .maybeSingle();

        const { count: pendingCommands } = await supabaseAdmin
          .from('hermes_commands')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending');

        return json({ ok: true, status: data, policy, pending_commands: pendingCommands ?? 0 });
      },
    },
  },
});
