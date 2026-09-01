ALTER TABLE public.assets REPLICA IDENTITY FULL;
ALTER TABLE public.audit_log REPLICA IDENTITY FULL;
ALTER TABLE public.hermes_commands REPLICA IDENTITY FULL;
ALTER TABLE public.hermes_policies REPLICA IDENTITY FULL;
ALTER TABLE public.user_roles REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.vulnerabilities REPLICA IDENTITY FULL;
ALTER TABLE public.incidents REPLICA IDENTITY FULL;
ALTER TABLE public.response_actions REPLICA IDENTITY FULL;
ALTER TABLE public.scans REPLICA IDENTITY FULL;
ALTER TABLE public.agent_status REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.assets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_log;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hermes_commands;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hermes_policies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;