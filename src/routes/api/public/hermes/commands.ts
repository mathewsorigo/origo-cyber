import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const resultSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['acknowledged', 'succeeded', 'failed']),
  result: z.record(z.unknown()).optional(),
  error: z.string().max(4000).optional(),
});

export const Route = createFileRoute('/api/public/hermes/commands')({
  server: {
    handlers: {
      // Agent pulls pending commands issued from the panel and marks them dispatched.
      GET: async ({ request }) => {
        const { authenticateHermes, unauthorized, json, audit } = await import(
          '@/lib/hermes-auth.server'
        );
        const caller = await authenticateHermes(request);
        if (!caller) return unauthorized();

        const limitParam = Number(new URL(request.url).searchParams.get('limit') ?? '10');
        const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 10, 1), 50);

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { data: pending, error } = await supabaseAdmin
          .from('hermes_commands')
          .select('id, command, args, created_at')
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
          .limit(limit);

        if (error) return json({ error: error.message }, 500);
        if (!pending?.length) return json({ commands: [] });

        const ids = pending.map((c) => c.id);
        await supabaseAdmin
          .from('hermes_commands')
          .update({ status: 'dispatched', dispatched_at: new Date().toISOString() })
          .in('id', ids);

        await audit(caller, 'hermes.commands.pulled', 'hermes_command', null, { count: ids.length });

        return json({ commands: pending });
      },

      // Agent reports command execution outcome.
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
        const terminal = body.status === 'succeeded' || body.status === 'failed';
        const { data, error } = await supabaseAdmin
          .from('hermes_commands')
          .update({
            status: body.status,
            result: (body.result ?? null) as never,
            error: body.error ?? null,
            ...(terminal ? { completed_at: new Date().toISOString() } : {}),
          })
          .eq('id', body.id)
          .select('id, command, status')
          .maybeSingle();

        if (error) return json({ error: error.message }, 500);
        if (!data) return json({ error: 'Command not found' }, 404);

        await audit(caller, `hermes.command.${body.status}`, 'hermes_command', data.id, {
          command: data.command,
          error: body.error ?? null,
        });

        return json({ ok: true, command: data });
      },
    },
  },
});
