#!/bin/bash
# Runs once, on first boot of an empty Postgres volume.
#
# Creates the restricted role the application connects as. This matters: Postgres
# superusers and table owners bypass row-level security even with FORCE, so the
# RLS policies in prisma/migrations only protect anything if the app is NOT the
# owner. Migrations run as `postgres`; the app runs as `openhrm_app`.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE ROLE openhrm_app WITH LOGIN PASSWORD '${POSTGRES_APP_PASSWORD}';

    GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO openhrm_app;
    GRANT USAGE ON SCHEMA public TO openhrm_app;

    -- Data access only. No DDL: the app can never alter its own schema.
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO openhrm_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO openhrm_app;

    -- Tables created by future migrations inherit the same grants.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO openhrm_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO openhrm_app;
EOSQL

echo "Created restricted application role 'openhrm_app'."
