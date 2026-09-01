import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const severity = z.enum(['critical', 'high', 'medium', 'low', 'info']);

const actionSchema = z.object({
  action_type: z.string().min(2).max(80),
  title: z.string().min(3).max(300),
  rationale: z.string().max(4000).optional(),
  risk: severity.default('medium'),
  payload: z.record(z.unknown()).optional(),
});

const bodySchema = z.object({
  reference: z.string().min(3).max(60),
  title: z.string().min(3).max(300),
  summary: z.string().max(8000).optional(),
  severity: severity.default('high'),
  phase: z.enum(['open', 'contained', 'eradicated', 'recovered', 'closed']).optional(),
  category: z.string().max(80).optional(),
  detected_at: z.string().datetime().optional(),
  timeline: z.array(z.record(z.unknown())).max(200).optional(),
  affected_asset_identifiers: z.array(z.string().min(1).max(200)).max(100).optional(),
  proposed_actions: z.array(actionSchema).max(20).optional(),
});

export const Route = createFileRoute('/api/public/hermes/incidents')({
  server: {
    handlers: {
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
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) return badRequest('Invalid payload', parsed.error.issues);
        const body = parsed.data;

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

        let affected: string[] = [];
        if (body.affected_asset_identifiers?.length) {
          const { data: assets } = await supabaseAdmin
            .from('assets')
            .select('id')
            .in('identifier', body.affected_asset_identifiers);
          affected = (assets ?? []).map((a) => a.id);
        }

        const { data: incident, error } = await supabaseAdmin
          .from('incidents')
          .upsert(
            {
              reference: body.reference,
              title: body.title,
              summary: body.summary ?? null,
              severity: body.severity,
              ...(body.phase ? { phase: body.phase } : {}),
              category: body.category ?? null,
              detected_at: body.detected_at ?? new Date().toISOString(),
              timeline: (body.timeline ?? []) as never,
              affected_assets: affected,
              source: 'hermes',
              ...(body.phase === 'contained' ? { contained_at: new Date().toISOString() } : {}),
              ...(body.phase === 'closed' ? { closed_at: new Date().toISOString() } : {}),
            },
            { onConflict: 'reference' },
          )
          .select('id, reference, phase, severity')
          .single();

        if (error || !incident) return json({ error: error?.message ?? 'Upsert failed' }, 500);

        let actions: unknown[] = [];
        if (body.proposed_actions?.length) {
          const { data: inserted, error: actionError } = await supabaseAdmin
            .from('response_actions')
            .insert(
              body.proposed_actions.map((a) => ({
                incident_id: incident.id,
                action_type: a.action_type,
                title: a.title,
                rationale: a.rationale ?? null,
                risk: a.risk,
                payload: (a.payload ?? {}) as never,
                status: 'pending_approval' as const,
                requested_by: 'hermes',
              })),
            )
            .select('id, action_type, status');
          if (actionError) return json({ error: actionError.message }, 500);
          actions = inserted ?? [];
        }

        await audit(caller, 'hermes.incident.reported', 'incident', incident.id, {
          reference: incident.reference,
          severity: incident.severity,
          proposed_actions: actions.length,
        });

        return json({ ok: true, incident, proposed_actions: actions });
      },
    },
  },
});
