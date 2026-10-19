-- Runs once, when the pgdata volume is first initialised.
--
-- Least privilege (MASTER_PROMPT.md 0.4 rule 5): two roles.
--   campus_owner  - the container superuser; owns objects, runs migrations.
--   campus_app    - the application; may read and write data, never change schema.
--
-- Objects live in a dedicated schema (default "campus"), not "public".

\set ON_ERROR_STOP on

-- psql cannot interpolate shell env vars directly, so pull them in.
\set app_password `echo "$APP_ROLE_PASSWORD"`
\set db_schema `echo "${DB_SCHEMA:-campus}"`

CREATE ROLE campus_app WITH LOGIN PASSWORD :'app_password';

CREATE SCHEMA IF NOT EXISTS :"db_schema" AUTHORIZATION campus_owner;

-- The application never needs to create objects.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA :"db_schema" TO campus_app;

-- Data rights on everything the owner creates from now on, including tables
-- added by future migrations.
ALTER DEFAULT PRIVILEGES FOR ROLE campus_owner IN SCHEMA :"db_schema"
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO campus_app;
ALTER DEFAULT PRIVILEGES FOR ROLE campus_owner IN SCHEMA :"db_schema"
  GRANT USAGE, SELECT ON SEQUENCES TO campus_app;
ALTER DEFAULT PRIVILEGES FOR ROLE campus_owner IN SCHEMA :"db_schema"
  GRANT EXECUTE ON FUNCTIONS TO campus_app;

-- Resolve unqualified names to the project schema for both roles.
ALTER ROLE campus_owner IN DATABASE campus SET search_path TO :"db_schema", public;
ALTER ROLE campus_app   IN DATABASE campus SET search_path TO :"db_schema", public;

-- Extensions are created by Alembic migrations, not here, so that a database
-- restored from scratch by migrations alone is identical to this one
-- (MASTER_PROMPT.md 0.4 rule 4). btree_gist is required by the booking
-- exclusion constraint.
