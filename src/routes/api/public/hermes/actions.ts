import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const resultSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['executing', 'succeeded', 'failed']),
  result: z.record(z.unknown()).optional(),
});

export const Route = createFileRoute('/api/public/hermes/actions')({
  server: {
    handlers: {
      // Agent pulls response actions approved by an admin and marks them executing.
      GET: async ({ request }) => {
        const { authenticateHermes, unauthorized, json, audit } = await import(
          '@/lib/hermes-auth.server'
        );
        const caller = await authenticateHermes(request);
        if (!caller) return unauthorized();

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { data: approved, error } = await supabaseAdmin
          .from('response_actions')
          .select('id, action_type, title, payload, risk, incident_id, vulnerability_id, asset_id')
          .eq('status', 'approved')
          .order('decided_at', { ascending: true })
          .limit(20);

        if (error) return json({ error: error.message }, 500);
        if (!approved?.length) return json({ actions: [] });

        const ids = approved.map((a) => a.id);
        await supabaseAdmin
          .from('response_actions')
          .update({ status: 'executing', executed_at: new Date().toISOString() })
          .in('id', ids);

        await audit(caller, 'hermes.actions.pulled', 'response_action', null, {
          count: ids.length,
        });

        return json({ actions: approved });
      },

      // Agent reports the outcome of an approved response action.
      POST: async ({ request }) => {
        const { authenticateHermes, unauthorized, badRequest, json, audit } = await import(
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
        const parsed = resultSchema.safeParse(raw);
        if (!parsed.success) return badRequest('Invalid payload', parsed.error.issues);
        const body = parsed.data;

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { data, error } = await supabaseAdmin
          .from('response_actions')
          .update({
            status: body.status,
            result: (body.result ?? null) as never,
            executed_at: new Date().toISOString(),
          })
          .eq('id', body.id)
          .select('id, action_type, status')
          .maybeSingle();

        if (error) return json({ error: error.message }, 500);
        if (!data) return json({ error: 'Action not found' }, 404);

        await audit(caller, `hermes.action.${body.status}`, 'response_action', data.id, {
          action_type: data.action_type,
        });

        return json({ ok: true, action: data });
      },
    },
  },
});
