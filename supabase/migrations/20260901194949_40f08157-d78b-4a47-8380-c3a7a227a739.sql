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
