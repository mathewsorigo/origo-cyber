-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin','analyst','viewer');
CREATE TYPE public.severity AS ENUM ('critical','high','medium','low','info');
CREATE TYPE public.vuln_status AS ENUM ('new','triaging','confirmed','false_positive','mitigating','resolved','risk_accepted');
CREATE TYPE public.incident_phase AS ENUM ('open','contained','eradicated','recovered','closed');
CREATE TYPE public.action_status AS ENUM ('pending_approval','approved','rejected','executing','succeeded','failed');
CREATE TYPE public.scan_status AS ENUM ('queued','running','completed','failed','cancelled');
CREATE TYPE public.command_status AS ENUM ('pending','dispatched','acknowledged','succeeded','failed','cancelled');
CREATE TYPE public.asset_kind AS ENUM ('host','domain','repository','cloud','endpoint','database','saas');

-- UTIL
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.can_triage(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','analyst'));
$$;

CREATE POLICY "roles readable by authenticated" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- SIGNUP TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ASSETS
CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind public.asset_kind NOT NULL DEFAULT 'host',
  identifier text NOT NULL,
  environment text NOT NULL DEFAULT 'production',
  criticality public.severity NOT NULL DEFAULT 'medium',
  owner_team text,
  tags text[] NOT NULL DEFAULT '{}',
  monitored boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX assets_identifier_key ON public.assets (identifier);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
GRANT ALL ON public.assets TO service_role;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assets readable" ON public.assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "assets managed by triage" ON public.assets FOR ALL TO authenticated
  USING (public.can_triage(auth.uid())) WITH CHECK (public.can_triage(auth.uid()));
CREATE TRIGGER assets_updated_at BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- VULNERABILITIES
CREATE TABLE public.vulnerabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  severity public.severity NOT NULL DEFAULT 'medium',
  status public.vuln_status NOT NULL DEFAULT 'new',
  cve text,
  cvss numeric(3,1),
  category text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  remediation text,
  fingerprint text NOT NULL,
  source text NOT NULL DEFAULT 'hermes',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_at timestamptz,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX vulnerabilities_fingerprint_key ON public.vulnerabilities (fingerprint);
CREATE INDEX vulnerabilities_severity_idx ON public.vulnerabilities (severity, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vulnerabilities TO authenticated;
GRANT ALL ON public.vulnerabilities TO service_role;
ALTER TABLE public.vulnerabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vulns readable" ON public.vulnerabilities FOR SELECT TO authenticated USING (true);
CREATE POLICY "vulns managed by triage" ON public.vulnerabilities FOR ALL TO authenticated
  USING (public.can_triage(auth.uid())) WITH CHECK (public.can_triage(auth.uid()));
CREATE TRIGGER vulnerabilities_updated_at BEFORE UPDATE ON public.vulnerabilities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- INCIDENTS
CREATE TABLE public.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL,
  title text NOT NULL,
  summary text,
  severity public.severity NOT NULL DEFAULT 'high',
  phase public.incident_phase NOT NULL DEFAULT 'open',
  category text,
  affected_assets uuid[] NOT NULL DEFAULT '{}',
  timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'hermes',
  lead uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  contained_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX incidents_reference_key ON public.incidents (reference);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.incidents TO authenticated;
GRANT ALL ON public.incidents TO service_role;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "incidents readable" ON public.incidents FOR SELECT TO authenticated USING (true);
CREATE POLICY "incidents managed by triage" ON public.incidents FOR ALL TO authenticated
  USING (public.can_triage(auth.uid())) WITH CHECK (public.can_triage(auth.uid()));
CREATE TRIGGER incidents_updated_at BEFORE UPDATE ON public.incidents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RESPONSE ACTIONS
CREATE TABLE public.response_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid REFERENCES public.incidents(id) ON DELETE CASCADE,
  vulnerability_id uuid REFERENCES public.vulnerabilities(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  title text NOT NULL,
  rationale text,
  risk public.severity NOT NULL DEFAULT 'medium',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.action_status NOT NULL DEFAULT 'pending_approval',
  requested_by text NOT NULL DEFAULT 'hermes',
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decision_reason text,
  decided_at timestamptz,
  executed_at timestamptz,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.response_actions TO authenticated;
GRANT ALL ON public.response_actions TO service_role;
ALTER TABLE public.response_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "actions readable" ON public.response_actions FOR SELECT TO authenticated USING (true);
CREATE POLICY "actions decided by admins" ON public.response_actions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER response_actions_updated_at BEFORE UPDATE ON public.response_actions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- SCANS
CREATE TABLE public.scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  target text NOT NULL,
  scan_type text NOT NULL DEFAULT 'full',
  status public.scan_status NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0,
  findings_count integer NOT NULL DEFAULT 0,
  started_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scans TO authenticated;
GRANT ALL ON public.scans TO service_role;
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scans readable" ON public.scans FOR SELECT TO authenticated USING (true);
CREATE POLICY "scans managed by triage" ON public.scans FOR ALL TO authenticated
  USING (public.can_triage(auth.uid())) WITH CHECK (public.can_triage(auth.uid()));
CREATE TRIGGER scans_updated_at BEFORE UPDATE ON public.scans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- HERMES COMMANDS
CREATE TABLE public.hermes_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command text NOT NULL,
  args jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.command_status NOT NULL DEFAULT 'pending',
  issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  dispatched_at timestamptz,
  completed_at timestamptz,
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hermes_commands TO authenticated;
GRANT ALL ON public.hermes_commands TO service_role;
ALTER TABLE public.hermes_commands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commands readable" ON public.hermes_commands FOR SELECT TO authenticated USING (true);
CREATE POLICY "commands managed by admins" ON public.hermes_commands FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER hermes_commands_updated_at BEFORE UPDATE ON public.hermes_commands FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- POLICIES
CREATE TABLE public.hermes_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true,
  mode text NOT NULL DEFAULT 'supervised',
  min_severity_to_act public.severity NOT NULL DEFAULT 'high',
  auto_approved_actions text[] NOT NULL DEFAULT '{}',
  scan_schedule text NOT NULL DEFAULT 'daily_02_00',
  maintenance_window text,
  paused boolean NOT NULL DEFAULT false,
  notes text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX hermes_policies_singleton_key ON public.hermes_policies (singleton);
GRANT SELECT, INSERT, UPDATE ON public.hermes_policies TO authenticated;
GRANT ALL ON public.hermes_policies TO service_role;
ALTER TABLE public.hermes_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "policies readable" ON public.hermes_policies FOR SELECT TO authenticated USING (true);
CREATE POLICY "policies managed by admins" ON public.hermes_policies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER hermes_policies_updated_at BEFORE UPDATE ON public.hermes_policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- AGENT STATUS
CREATE TABLE public.agent_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name text NOT NULL DEFAULT 'hermes',
  version text,
  health text NOT NULL DEFAULT 'unknown',
  queue_size integer NOT NULL DEFAULT 0,
  active_scans integer NOT NULL DEFAULT 0,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_heartbeat_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX agent_status_name_key ON public.agent_status (agent_name);
GRANT SELECT ON public.agent_status TO authenticated;
GRANT ALL ON public.agent_status TO service_role;
ALTER TABLE public.agent_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent status readable" ON public.agent_status FOR SELECT TO authenticated USING (true);

-- AUDIT LOG
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_label text NOT NULL DEFAULT 'system',
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_idx ON public.audit_log (created_at DESC);
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit readable" ON public.audit_log FOR SELECT TO authenticated USING (true);

-- AGENT API KEYS
CREATE TABLE public.hermes_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  last_used_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hermes_api_keys TO authenticated;
GRANT ALL ON public.hermes_api_keys TO service_role;
ALTER TABLE public.hermes_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api keys readable by admins" ON public.hermes_api_keys FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- REALTIME
ALTER TABLE public.vulnerabilities REPLICA IDENTITY FULL;
ALTER TABLE public.incidents REPLICA IDENTITY FULL;
ALTER TABLE public.response_actions REPLICA IDENTITY FULL;
ALTER TABLE public.scans REPLICA IDENTITY FULL;
ALTER TABLE public.agent_status REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vulnerabilities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.incidents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.response_actions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scans;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_status;

-- SEED
INSERT INTO public.hermes_policies (mode, min_severity_to_act, auto_approved_actions, scan_schedule, maintenance_window, notes)
VALUES ('supervised','high','{"block_ip","quarantine_file"}','daily_02_00','Dom 01:00-05:00 BRT','Modo supervisionado: ações de alto impacto exigem aprovação humana.');

INSERT INTO public.agent_status (agent_name, version, health, queue_size, active_scans, metrics, last_heartbeat_at)
VALUES ('hermes','2.4.1','healthy',3,1,'{"cpu":31,"mem":54,"uptime_h":412}'::jsonb, now() - interval '40 seconds');

INSERT INTO public.assets (name, kind, identifier, environment, criticality, owner_team, tags) VALUES
('API Core Órigo','host','api-core-01.origo.internal','production','critical','Plataforma','{"api","pci"}'),
('Portal do Cliente','domain','cliente.origoenergia.com.br','production','critical','Digital','{"web","publico"}'),
('Faturamento Batch','host','billing-batch-03.origo.internal','production','high','Faturamento','{"batch","financeiro"}'),
('origo-monorepo','repository','github.com/origo/monorepo','production','high','Engenharia','{"sast","ci"}'),
('Cluster K8s Produção','cloud','aws:eks/origo-prod','production','critical','SRE','{"k8s","aws"}'),
('VPN Corporativa','endpoint','vpn.origo.internal','production','high','TI','{"acesso"}'),
('Data Warehouse','database','redshift://origo-dw','production','high','Dados','{"lgpd"}'),
('Ambiente de Homologação','host','hml-app-02.origo.internal','staging','medium','Plataforma','{"hml"}');

INSERT INTO public.vulnerabilities (asset_id, title, description, severity, status, cve, cvss, category, evidence, remediation, fingerprint, due_at, detected_at) VALUES
((SELECT id FROM public.assets WHERE identifier='api-core-01.origo.internal'),'RCE em dependência de serialização','Biblioteca de serialização vulnerável permite execução remota de código em endpoints públicos da API.','critical','confirmed','CVE-2026-21841',9.8,'Dependência','{"path":"/opt/api/package.json","package":"serial-fast@1.2.3","port":443}','Atualizar serial-fast para 1.4.1 e reiniciar o serviço.','vuln-api-core-rce-2026','2026-09-03', now() - interval '6 hours'),
((SELECT id FROM public.assets WHERE identifier='cliente.origoenergia.com.br'),'Cabeçalhos de segurança ausentes','CSP e HSTS ausentes no portal do cliente, ampliando risco de XSS e downgrade de protocolo.','medium','triaging',NULL,5.3,'Configuração Web','{"missing":["content-security-policy","strict-transport-security"]}','Adicionar CSP restritiva e HSTS com preload no edge.','vuln-portal-headers-2026','2026-09-12', now() - interval '2 days'),
((SELECT id FROM public.assets WHERE identifier='github.com/origo/monorepo'),'Credencial AWS versionada no repositório','Chave de acesso AWS encontrada em arquivo de teste no histórico do Git.','critical','mitigating',NULL,9.1,'Segredos','{"file":"packages/etl/tests/fixtures.ts","commit":"9f2a1c7"}','Revogar a chave, reescrever histórico e adicionar varredura de segredos no CI.','vuln-monorepo-secret-2026','2026-09-02', now() - interval '18 hours'),
((SELECT id FROM public.assets WHERE identifier='aws:eks/origo-prod'),'Pods executando como root','12 pods em produção sem securityContext, executando com usuário root.','high','new',NULL,7.4,'Configuração Cloud','{"namespaces":["billing","integrations"],"pods":12}','Definir runAsNonRoot e aplicar Pod Security Admission restricted.','vuln-k8s-root-2026','2026-09-08', now() - interval '9 hours'),
((SELECT id FROM public.assets WHERE identifier='billing-batch-03.origo.internal'),'SMB exposto na rede interna','Serviço SMB v1 habilitado, permitindo movimentação lateral.','high','confirmed','CVE-2025-33012',8.1,'Rede','{"port":445,"protocol":"SMBv1"}','Desabilitar SMBv1 e restringir por firewall interno.','vuln-billing-smb-2026','2026-09-05', now() - interval '3 days'),
((SELECT id FROM public.assets WHERE identifier='redshift://origo-dw'),'Coluna com dados pessoais sem máscara','Tabela de clientes expõe CPF em texto claro para perfis analíticos.','high','triaging',NULL,7.1,'LGPD','{"table":"dw.clientes","column":"cpf"}','Aplicar máscara dinâmica e revisar concessões de leitura.','vuln-dw-lgpd-2026','2026-09-10', now() - interval '1 day'),
((SELECT id FROM public.assets WHERE identifier='vpn.origo.internal'),'MFA opcional para acesso remoto','Grupo de fornecedores conecta na VPN sem segundo fator.','high','new',NULL,7.7,'Acesso','{"group":"vendors","users":23}','Tornar MFA obrigatório para todos os grupos.','vuln-vpn-mfa-2026','2026-09-06', now() - interval '5 hours'),
((SELECT id FROM public.assets WHERE identifier='hml-app-02.origo.internal'),'Debug habilitado em homologação','Stack traces completos expostos em respostas de erro.','low','resolved',NULL,3.1,'Configuração','{"env":"staging","flag":"DEBUG=true"}','Desligar debug e padronizar respostas de erro.','vuln-hml-debug-2026','2026-08-28', now() - interval '9 days'),
((SELECT id FROM public.assets WHERE identifier='api-core-01.origo.internal'),'Rate limit ausente em endpoint de login','Endpoint permite tentativas ilimitadas, favorecendo credential stuffing.','medium','confirmed',NULL,6.5,'Aplicação','{"endpoint":"/v1/auth/login"}','Aplicar limite por IP e por conta com backoff progressivo.','vuln-api-ratelimit-2026','2026-09-09', now() - interval '11 hours'),
((SELECT id FROM public.assets WHERE identifier='cliente.origoenergia.com.br'),'Certificado TLS próximo do vencimento','Certificado expira em 9 dias sem renovação automática configurada.','low','new',NULL,2.4,'Criptografia','{"expires_in_days":9}','Configurar renovação automática via ACME.','vuln-portal-tls-2026','2026-09-07', now() - interval '30 hours');

INSERT INTO public.incidents (reference, title, summary, severity, phase, category, affected_assets, timeline, detected_at, contained_at) VALUES
('INC-2026-0184','Tentativa de exfiltração a partir do batch de faturamento','Hermes detectou tráfego anômalo de 4,2 GB do host de faturamento para um destino externo desconhecido.','critical','contained','Exfiltração',
  ARRAY[(SELECT id FROM public.assets WHERE identifier='billing-batch-03.origo.internal')],
  '[{"at":"2026-09-01T09:12:00Z","actor":"hermes","event":"Tráfego anômalo detectado (4.2GB)"},{"at":"2026-09-01T09:13:00Z","actor":"hermes","event":"IP de destino bloqueado automaticamente"},{"at":"2026-09-01T09:41:00Z","actor":"analista","event":"Host isolado da rede após aprovação"}]'::jsonb,
  now() - interval '10 hours', now() - interval '9 hours'),
('INC-2026-0183','Credential stuffing no portal do cliente','Pico de 38 mil tentativas de login a partir de 900 IPs distintos.','high','eradicated','Acesso indevido',
  ARRAY[(SELECT id FROM public.assets WHERE identifier='cliente.origoenergia.com.br')],
  '[{"at":"2026-08-31T22:04:00Z","actor":"hermes","event":"Padrão de credential stuffing identificado"},{"at":"2026-08-31T22:06:00Z","actor":"hermes","event":"Desafio adicional aplicado no edge"},{"at":"2026-09-01T02:10:00Z","actor":"analista","event":"Contas afetadas notificadas"}]'::jsonb,
  now() - interval '22 hours', now() - interval '21 hours'),
('INC-2026-0182','Chave AWS vazada em repositório','Segredo válido encontrado no histórico do monorepo durante varredura de código.','critical','recovered','Segredos',
  ARRAY[(SELECT id FROM public.assets WHERE identifier='github.com/origo/monorepo')],
  '[{"at":"2026-08-31T14:30:00Z","actor":"hermes","event":"Segredo detectado no commit 9f2a1c7"},{"at":"2026-08-31T14:35:00Z","actor":"hermes","event":"Solicitada revogação da chave"},{"at":"2026-08-31T15:02:00Z","actor":"admin","event":"Revogação aprovada e executada"}]'::jsonb,
  now() - interval '2 days', now() - interval '2 days'),
('INC-2026-0181','Varredura interna a partir de estação comprometida','Host de colaborador realizando varredura de portas em sub-redes de produção.','medium','closed','Movimentação lateral',
  ARRAY[(SELECT id FROM public.assets WHERE identifier='vpn.origo.internal')],
  '[{"at":"2026-08-29T11:00:00Z","actor":"hermes","event":"Varredura de portas detectada"},{"at":"2026-08-29T11:20:00Z","actor":"analista","event":"Estação removida da rede e reimagem solicitada"},{"at":"2026-08-30T09:00:00Z","actor":"analista","event":"Incidente encerrado"}]'::jsonb,
  now() - interval '4 days', now() - interval '4 days');

INSERT INTO public.response_actions (incident_id, vulnerability_id, asset_id, action_type, title, rationale, risk, payload, status) VALUES
((SELECT id FROM public.incidents WHERE reference='INC-2026-0184'),NULL,(SELECT id FROM public.assets WHERE identifier='billing-batch-03.origo.internal'),'isolate_host','Isolar billing-batch-03 da rede','Tráfego de exfiltração ativo; isolamento contém o vazamento imediatamente.','critical','{"host":"billing-batch-03.origo.internal","mode":"network_quarantine"}','pending_approval'),
(NULL,(SELECT id FROM public.vulnerabilities WHERE fingerprint='vuln-monorepo-secret-2026'),(SELECT id FROM public.assets WHERE identifier='github.com/origo/monorepo'),'revoke_credential','Revogar chave AWS AKIA...7QJ2','Credencial válida exposta publicamente no histórico do Git.','critical','{"provider":"aws","key_id":"AKIA****7QJ2"}','pending_approval'),
(NULL,(SELECT id FROM public.vulnerabilities WHERE fingerprint='vuln-api-core-rce-2026'),(SELECT id FROM public.assets WHERE identifier='api-core-01.origo.internal'),'apply_patch','Aplicar patch serial-fast 1.4.1','Correção disponível para vulnerabilidade crítica com exploit público.','high','{"package":"serial-fast","from":"1.2.3","to":"1.4.1","restart":true}','pending_approval'),
((SELECT id FROM public.incidents WHERE reference='INC-2026-0183'),NULL,(SELECT id FROM public.assets WHERE identifier='cliente.origoenergia.com.br'),'block_ip','Bloquear 900 IPs do ataque de credential stuffing','Ação de baixo risco e auto-aprovada pela política vigente.','medium','{"ips_count":900,"ttl_hours":72}','succeeded'),
(NULL,(SELECT id FROM public.vulnerabilities WHERE fingerprint='vuln-vpn-mfa-2026'),(SELECT id FROM public.assets WHERE identifier='vpn.origo.internal'),'enforce_mfa','Exigir MFA para o grupo vendors','23 fornecedores conectam sem segundo fator.','high','{"group":"vendors"}','pending_approval');

INSERT INTO public.scans (asset_id, target, scan_type, status, progress, findings_count, started_at, finished_at) VALUES
((SELECT id FROM public.assets WHERE identifier='aws:eks/origo-prod'),'aws:eks/origo-prod','cloud_posture','running',62,4, now() - interval '25 minutes', NULL),
((SELECT id FROM public.assets WHERE identifier='api-core-01.origo.internal'),'api-core-01.origo.internal','full','completed',100,3, now() - interval '7 hours', now() - interval '6 hours'),
((SELECT id FROM public.assets WHERE identifier='github.com/origo/monorepo'),'github.com/origo/monorepo','sast_secrets','completed',100,2, now() - interval '20 hours', now() - interval '19 hours'),
((SELECT id FROM public.assets WHERE identifier='cliente.origoenergia.com.br'),'cliente.origoenergia.com.br','dast','failed',41,0, now() - interval '2 days', now() - interval '2 days'),
((SELECT id FROM public.assets WHERE identifier='vpn.origo.internal'),'vpn.origo.internal','network','queued',0,0,NULL,NULL);

INSERT INTO public.hermes_commands (command, args, status, dispatched_at, completed_at, result) VALUES
('start_scan','{"target":"aws:eks/origo-prod","scan_type":"cloud_posture"}','acknowledged', now() - interval '26 minutes', NULL, NULL),
('ping','{}','succeeded', now() - interval '3 hours', now() - interval '3 hours','{"latency_ms":142}'),
('update_policy','{"mode":"supervised","min_severity_to_act":"high"}','succeeded', now() - interval '1 day', now() - interval '1 day','{"applied":true}');

INSERT INTO public.audit_log (actor_label, action, entity_type, detail, created_at) VALUES
('hermes','finding.ingested','vulnerability','{"title":"RCE em dependência de serialização","severity":"critical"}', now() - interval '6 hours'),
('hermes','action.proposed','response_action','{"action_type":"isolate_host","host":"billing-batch-03.origo.internal"}', now() - interval '10 hours'),
('hermes','action.executed','response_action','{"action_type":"block_ip","ips":900}', now() - interval '21 hours'),
('sistema','policy.updated','hermes_policy','{"mode":"supervised"}', now() - interval '1 day'),
('hermes','scan.started','scan','{"target":"aws:eks/origo-prod"}', now() - interval '26 minutes');