-- The application authenticates administrators in Fastify, not through the Supabase Data API.
-- Table owners retain server access; public API roles have no policies or table grants.
DO $$
DECLARE table_name text; role_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['Admin','Session','Student','RegistrationRequest','StudentCv','Work','Attachment','SchoolSettings','Supervisor','StorageDeletion','_prisma_migrations'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, role_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;
