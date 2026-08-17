#!/usr/bin/env bash
# Two roles: the migration role owns the schema, the application role only reads and writes.
# Removes the whole class of accidental migrations issued from application code.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE ROLE "$APP_DB_USER" WITH LOGIN PASSWORD '$APP_DB_PASSWORD';

  GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO "$APP_DB_USER";

  ALTER DEFAULT PRIVILEGES FOR ROLE "$POSTGRES_USER" IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "$APP_DB_USER";
  ALTER DEFAULT PRIVILEGES FOR ROLE "$POSTGRES_USER" IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO "$APP_DB_USER";
EOSQL
