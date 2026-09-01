import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const severity = z.enum(['critical', 'high', 'medium', 'low', 'info']);

const findingSchema = z.object({
  fingerprint: z.string().min(6).max(200),
  title: z.string().min(3).max(300),
  description: z.string().max(8000).optional(),
  severity: severity.default('medium'),
  cve: z.string().max(40).optional(),
  cvss: z.number().min(0).max(10).optional(),
  category: z.string().max(80).optional(),
  remediation: z.string().max(8000).optional(),
  evidence: z.record(z.unknown()).optional(),
  due_at: z.string().datetime().optional(),
  detected_at: z.string().datetime().optional(),
  asset_identifier: z.string().min(1).max(200).optional(),
  asset_kind: z
    .enum(['host', 'domain', 'repository', 'cloud', 'endpoint', 'database', 'saas'])
    .optional(),
  scan_id: z.string().uuid().optional(),
});

const bodySchema = z.object({
  findings: z.array(findingSchema).min(1).max(200),
});

export const Route = createFileRoute('/api/public/hermes/findings')({
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

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

        // Resolve (and create when needed) the referenced assets.
        const identifiers = [
          ...new Set(
            parsed.data.findings
              .map((f) => f.asset_identifier)
              .filter((v): v is string => Boolean(v)),
          ),
        ];
        const assetIds = new Map<string, string>();
        if (identifiers.length > 0) {
          const { data: existing } = await supabaseAdmin
            .from('assets')
            .select('id, identifier')
            .in('identifier', identifiers);
          for (const a of existing ?? []) assetIds.set(a.identifier, a.id);

          const missing = identifiers.filter((id) => !assetIds.has(id));
          if (missing.length > 0) {
            const rows = missing.map((identifier) => {
              const found = parsed.data.findings.find((f) => f.asset_identifier === identifier);
              return {
                name: identifier,
                identifier,
                kind: found?.asset_kind ?? 'host',
                notes: 'Ativo descoberto automaticamente pelo Hermes.',
              };
            });
            const { data: created } = await supabaseAdmin
              .from('assets')
              .upsert(rows, { onConflict: 'identifier' })
              .select('id, identifier');
            for (const a of created ?? []) assetIds.set(a.identifier, a.id);
          }
        }

        const now = new Date().toISOString();
        const rows = parsed.data.findings.map((f) => ({
          fingerprint: f.fingerprint,
          title: f.title,
          description: f.description ?? null,
          severity: f.severity,
          cve: f.cve ?? null,
          cvss: f.cvss ?? null,
          category: f.category ?? null,
          remediation: f.remediation ?? null,
          evidence: (f.evidence ?? {}) as never,
          due_at: f.due_at ?? null,
          detected_at: f.detected_at ?? now,
          asset_id: f.asset_identifier ? assetIds.get(f.asset_identifier) ?? null : null,
          source: 'hermes',
        }));

        const { data: saved, error } = await supabaseAdmin
          .from('vulnerabilities')
          .upsert(rows, { onConflict: 'fingerprint' })
          .select('id, fingerprint, severity, status');

        if (error) return json({ error: error.message }, 500);

        // Update the originating scan counters when informed.
        const scanIds = [
          ...new Set(parsed.data.findings.map((f) => f.scan_id).filter((v): v is string => !!v)),
        ];
        for (const scanId of scanIds) {
          const count = parsed.data.findings.filter((f) => f.scan_id === scanId).length;
          const { data: scan } = await supabaseAdmin
            .from('scans')
            .select('findings_count')
            .eq('id', scanId)
            .maybeSingle();
          if (scan) {
            await supabaseAdmin
              .from('scans')
              .update({ findings_count: scan.findings_count + count })
              .eq('id', scanId);
          }
        }

        await audit(caller, 'hermes.findings.ingested', 'vulnerability', null, {
          count: saved?.length ?? 0,
          severities: rows.map((r) => r.severity),
        });

        return json({ ok: true, ingested: saved?.length ?? 0, vulnerabilities: saved });
      },
    },
  },
});
