#!/usr/bin/env bash
set -euo pipefail

psql -v ON_ERROR_STOP=1 "postgres://erp_migration:erp_local_dev@localhost:5433/erp" <<'EOSQL'
  CREATE ROLE erp_app WITH LOGIN PASSWORD 'erp_local_dev';
  GRANT CONNECT ON DATABASE erp TO erp_app;
  ALTER DEFAULT PRIVILEGES FOR ROLE erp_migration IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO erp_app;
  ALTER DEFAULT PRIVILEGES FOR ROLE erp_migration IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO erp_app;
EOSQL
