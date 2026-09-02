-- 1. Private schema for role-check helpers (not exposed through the API)
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION private.can_triage(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','analyst')) $$;

CREATE OR REPLACE FUNCTION private.has_any_role(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id) $$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_triage(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_any_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_triage(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_any_role(uuid) TO authenticated, service_role;

-- 2. Profiles: own row or admins
DROP POLICY IF EXISTS "profiles readable by authenticated" ON public.profiles;
CREATE POLICY "profiles readable by owner or admin" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR private.has_role(auth.uid(), 'admin'));

-- 3. user_roles: own rows or admins
DROP POLICY IF EXISTS "roles readable by authenticated" ON public.user_roles;
CREATE POLICY "roles readable by owner or admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "admins manage roles" ON public.user_roles;
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));

-- 4. Operational tables: require an assigned role
DROP POLICY IF EXISTS "assets readable" ON public.assets;
CREATE POLICY "assets readable by roled users" ON public.assets FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid()));
DROP POLICY IF EXISTS "assets managed by triage" ON public.assets;
CREATE POLICY "assets managed by triage" ON public.assets FOR ALL TO authenticated
  USING (private.can_triage(auth.uid())) WITH CHECK (private.can_triage(auth.uid()));

DROP POLICY IF EXISTS "vulns readable" ON public.vulnerabilities;
CREATE POLICY "vulns readable by roled users" ON public.vulnerabilities FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid()));
DROP POLICY IF EXISTS "vulns managed by triage" ON public.vulnerabilities;
CREATE POLICY "vulns managed by triage" ON public.vulnerabilities FOR ALL TO authenticated
  USING (private.can_triage(auth.uid())) WITH CHECK (private.can_triage(auth.uid()));

DROP POLICY IF EXISTS "incidents readable" ON public.incidents;
CREATE POLICY "incidents readable by roled users" ON public.incidents FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid()));
DROP POLICY IF EXISTS "incidents managed by triage" ON public.incidents;
CREATE POLICY "incidents managed by triage" ON public.incidents FOR ALL TO authenticated
  USING (private.can_triage(auth.uid())) WITH CHECK (private.can_triage(auth.uid()));

DROP POLICY IF EXISTS "actions readable" ON public.response_actions;
CREATE POLICY "actions readable by roled users" ON public.response_actions FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid()));
DROP POLICY IF EXISTS "actions decided by admins" ON public.response_actions;
CREATE POLICY "actions decided by admins" ON public.response_actions FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "scans readable" ON public.scans;
CREATE POLICY "scans readable by roled users" ON public.scans FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid()));
DROP POLICY IF EXISTS "scans managed by triage" ON public.scans;
CREATE POLICY "scans managed by triage" ON public.scans FOR ALL TO authenticated
  USING (private.can_triage(auth.uid())) WITH CHECK (private.can_triage(auth.uid()));

-- 5. Agent internals: triage/admin only
DROP POLICY IF EXISTS "agent status readable" ON public.agent_status;
CREATE POLICY "agent status readable by triage" ON public.agent_status FOR SELECT TO authenticated
  USING (private.can_triage(auth.uid()));

DROP POLICY IF EXISTS "policies readable" ON public.hermes_policies;
CREATE POLICY "policies readable by triage" ON public.hermes_policies FOR SELECT TO authenticated
  USING (private.can_triage(auth.uid()));
DROP POLICY IF EXISTS "policies managed by admins" ON public.hermes_policies;
CREATE POLICY "policies managed by admins" ON public.hermes_policies FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "commands readable" ON public.hermes_commands;
CREATE POLICY "commands readable by admins" ON public.hermes_commands FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "commands managed by admins" ON public.hermes_commands;
CREATE POLICY "commands managed by admins" ON public.hermes_commands FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));

-- 6. Audit log: admins only
DROP POLICY IF EXISTS "audit readable" ON public.audit_log;
CREATE POLICY "audit readable by admins" ON public.audit_log FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

-- 7. API keys metadata: admins only (repoint to private helper)
DROP POLICY IF EXISTS "api keys readable by admins" ON public.hermes_api_keys;
CREATE POLICY "api keys readable by admins" ON public.hermes_api_keys FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

-- 8. Remove the API-exposed SECURITY DEFINER helpers
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.can_triage(uuid);