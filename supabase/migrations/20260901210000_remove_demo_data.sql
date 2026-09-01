-- Remove os registros de demonstração incluídos na migração inicial.
-- Os filtros usam identificadores estáveis e combinações exatas para não afetar dados reais.

DELETE FROM public.response_actions AS action
USING public.vulnerabilities AS vulnerability
WHERE action.vulnerability_id = vulnerability.id
  AND vulnerability.fingerprint IN (
    'vuln-api-core-rce-2026',
    'vuln-monorepo-secret-2026',
    'vuln-vpn-mfa-2026'
  )
  AND action.title IN (
  'Isolar billing-batch-03 da rede',
  'Revogar chave AWS AKIA...7QJ2',
  'Aplicar patch serial-fast 1.4.1',
  'Bloquear 900 IPs do ataque de credential stuffing',
  'Exigir MFA para o grupo vendors'
);

DELETE FROM public.response_actions AS action
USING public.incidents AS incident
WHERE action.incident_id = incident.id
  AND incident.reference IN ('INC-2026-0183', 'INC-2026-0184')
  AND action.title IN (
    'Isolar billing-batch-03 da rede',
    'Bloquear 900 IPs do ataque de credential stuffing'
  );

DELETE FROM public.scans AS scan
USING public.assets AS asset
WHERE scan.asset_id = asset.id
  AND scan.started_by IS NULL
  AND (
    (asset.identifier = 'aws:eks/origo-prod' AND scan.target = asset.identifier AND scan.scan_type = 'cloud_posture')
    OR (asset.identifier = 'api-core-01.origo.internal' AND scan.target = asset.identifier AND scan.scan_type = 'full')
    OR (asset.identifier = 'github.com/origo/monorepo' AND scan.target = asset.identifier AND scan.scan_type = 'sast_secrets')
    OR (asset.identifier = 'cliente.origoenergia.com.br' AND scan.target = asset.identifier AND scan.scan_type = 'dast')
    OR (asset.identifier = 'vpn.origo.internal' AND scan.target = asset.identifier AND scan.scan_type = 'network')
  );

DELETE FROM public.vulnerabilities
WHERE fingerprint IN (
  'vuln-api-core-rce-2026',
  'vuln-portal-headers-2026',
  'vuln-monorepo-secret-2026',
  'vuln-k8s-root-2026',
  'vuln-billing-smb-2026',
  'vuln-dw-lgpd-2026',
  'vuln-vpn-mfa-2026',
  'vuln-hml-debug-2026',
  'vuln-api-ratelimit-2026',
  'vuln-portal-tls-2026'
);

DELETE FROM public.incidents
WHERE reference IN ('INC-2026-0181', 'INC-2026-0182', 'INC-2026-0183', 'INC-2026-0184');

DELETE FROM public.assets
WHERE identifier IN (
  'api-core-01.origo.internal',
  'cliente.origoenergia.com.br',
  'billing-batch-03.origo.internal',
  'github.com/origo/monorepo',
  'aws:eks/origo-prod',
  'vpn.origo.internal',
  'redshift://origo-dw',
  'hml-app-02.origo.internal'
);

DELETE FROM public.hermes_commands
WHERE
  (command = 'start_scan' AND args = '{"target":"aws:eks/origo-prod","scan_type":"cloud_posture"}'::jsonb)
  OR (command = 'ping' AND result = '{"latency_ms":142}'::jsonb)
  OR (command = 'update_policy' AND args = '{"mode":"supervised","min_severity_to_act":"high"}'::jsonb);

DELETE FROM public.audit_log
WHERE
  (actor_label = 'hermes' AND action = 'finding.ingested' AND detail->>'title' = 'RCE em dependência de serialização')
  OR (actor_label = 'hermes' AND action = 'action.proposed' AND detail->>'host' = 'billing-batch-03.origo.internal')
  OR (actor_label = 'hermes' AND action = 'action.executed' AND detail->>'ips' = '900')
  OR (actor_label = 'sistema' AND action = 'policy.updated' AND detail->>'mode' = 'supervised')
  OR (actor_label = 'hermes' AND action = 'scan.started' AND detail->>'target' = 'aws:eks/origo-prod');

INSERT INTO public.agent_status (
  agent_name,
  version,
  health,
  queue_size,
  active_scans,
  metrics,
  last_heartbeat_at
)
VALUES ('hermes', NULL, 'unknown', 0, 0, '{}'::jsonb, NULL)
ON CONFLICT (agent_name) DO UPDATE
SET version = NULL,
    health = 'unknown',
    queue_size = 0,
    active_scans = 0,
    metrics = '{}'::jsonb,
    last_heartbeat_at = NULL
WHERE public.agent_status.version = '2.4.1';

INSERT INTO public.hermes_policies (
  singleton,
  mode,
  min_severity_to_act,
  auto_approved_actions,
  scan_schedule,
  maintenance_window,
  paused,
  notes
)
VALUES (
  true,
  'supervised',
  'high',
  '{}',
  'manual',
  NULL,
  false,
  'Controle supervisionado: execução crítica exige aprovação humana, rollback e validação.'
)
ON CONFLICT (singleton) DO UPDATE
SET mode = EXCLUDED.mode,
    auto_approved_actions = EXCLUDED.auto_approved_actions,
    scan_schedule = EXCLUDED.scan_schedule,
    maintenance_window = EXCLUDED.maintenance_window,
    paused = EXCLUDED.paused,
    notes = EXCLUDED.notes
WHERE public.hermes_policies.mode = 'supervised'
  AND public.hermes_policies.min_severity_to_act = 'high'
  AND public.hermes_policies.scan_schedule = 'daily_02_00'
  AND public.hermes_policies.maintenance_window = 'Dom 01:00-05:00 BRT'
  AND public.hermes_policies.auto_approved_actions = '{"block_ip","quarantine_file"}'::text[]
  AND public.hermes_policies.paused = false
  AND public.hermes_policies.updated_by IS NULL
  AND public.hermes_policies.notes = 'Modo supervisionado: ações de alto impacto exigem aprovação humana.';
