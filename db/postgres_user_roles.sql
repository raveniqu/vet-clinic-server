-- =============================================================================
-- PostgreSQL roles, grants and default privileges for the DEV database
-- Run by hand as root_superuser, connected to vet_clinic_dev. Safe to re-run.
-- No passwords live in this file (see section 6).
--
-- Re-run it after restoring a backup: Dokploy's dump carries no grants, and its
-- restore recreates the tables owned by root_superuser.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Roles (instance-wide). dev_user_rw owns the database and creates tables.
--    The other three can only read or change rows.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dev_user_rw') THEN
        CREATE ROLE dev_user_rw LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vet_serverapp_rw') THEN
        CREATE ROLE vet_serverapp_rw LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vet_serverapp_ro') THEN
        CREATE ROLE vet_serverapp_ro LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'test_automation_runner_rw') THEN
        CREATE ROLE test_automation_runner_rw LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
    END IF;
END
$$;


SELECT rolname, rolsuper, rolcanlogin, rolcreatedb
FROM pg_roles
ORDER BY rolname;

-- The read-only pool is read-only because of the role itself, not only because
-- of how the backend opens its connections.
ALTER ROLE vet_serverapp_ro SET default_transaction_read_only = on;

-- -----------------------------------------------------------------------------
-- 2. Database: owned by dev_user_rw, and closed to everyone not listed here.
--    By default every role may connect to every database (PUBLIC).
-- -----------------------------------------------------------------------------
ALTER DATABASE vet_clinic_dev OWNER TO dev_user_rw;

REVOKE ALL ON DATABASE vet_clinic_dev FROM PUBLIC;
GRANT CONNECT ON DATABASE vet_clinic_dev
    TO dev_user_rw, vet_serverapp_rw, vet_serverapp_ro, test_automation_runner_rw;

-- -----------------------------------------------------------------------------
-- 3. Schema public: only dev_user_rw may create objects.
-- -----------------------------------------------------------------------------
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO dev_user_rw;
GRANT USAGE ON SCHEMA public TO vet_serverapp_rw, vet_serverapp_ro, test_automation_runner_rw;

-- -----------------------------------------------------------------------------
-- 4. Objects created later by dev_user_rw: grants are applied automatically.
--    Covers tables created by hand in DBeaver.
-- -----------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE dev_user_rw IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
    TO vet_serverapp_rw, test_automation_runner_rw;

ALTER DEFAULT PRIVILEGES FOR ROLE dev_user_rw IN SCHEMA public
    GRANT SELECT ON TABLES
    TO vet_serverapp_ro;

ALTER DEFAULT PRIVILEGES FOR ROLE dev_user_rw IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES
    TO vet_serverapp_rw, test_automation_runner_rw;

-- -----------------------------------------------------------------------------
-- 5. Objects that exist already: ownership and grants.
--    root_superuser must not own anything in vet_clinic_dev, but a restore
--    makes it the owner of every table. REASSIGN OWNED cannot be used for it
--    (the bootstrap superuser is required by the database system), so tables,
--    views and standalone sequences in schema public are handed over one by
--    one. Indexes and sequences linked to a table column follow their table.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    object record;
BEGIN
    FOR object IN
        SELECT n.nspname AS schema_name, c.relname AS object_name
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relowner = 'root_superuser'::regrole
          AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
          AND NOT (
              c.relkind = 'S'
              AND EXISTS (
                  SELECT 1
                  FROM pg_depend AS d
                  WHERE d.classid = 'pg_class'::regclass
                    AND d.objid = c.oid
                    AND d.deptype IN ('a', 'i')
              )
          )
    LOOP
        EXECUTE format(
            'ALTER TABLE %I.%I OWNER TO dev_user_rw',
            object.schema_name,
            object.object_name
        );
    END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
    TO vet_serverapp_rw, test_automation_runner_rw;
GRANT SELECT ON ALL TABLES IN SCHEMA public
    TO vet_serverapp_ro;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
    TO vet_serverapp_rw, test_automation_runner_rw;

-- -----------------------------------------------------------------------------
-- 6. Passwords: by hand, one statement per role, never committed.
--    Generate each one in the password manager. Use URL-safe characters only
--    (letters, digits, - and _), so connection strings need no encoding.
-- -----------------------------------------------------------------------------
-- ALTER ROLE dev_user_rw PASSWORD '<paste>';
-- ALTER ROLE vet_serverapp_rw PASSWORD '<paste>';
-- ALTER ROLE vet_serverapp_ro PASSWORD '<paste>';
-- ALTER ROLE test_automation_runner_rw PASSWORD '<paste>';
