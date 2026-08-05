#!/bin/sh
# Applies pending migrations, then hands off to the app.
#
# Migrations run as the owner role (MIGRATE_DATABASE_URL) because they create
# and alter tables; the app itself then connects as the restricted role in
# DATABASE_URL, which is what keeps row-level security in force at runtime.
set -e

if [ -n "$MIGRATE_DATABASE_URL" ]; then
  echo "==> Applying database migrations"
  DATABASE_URL="$MIGRATE_DATABASE_URL" npx prisma migrate deploy
else
  echo "==> MIGRATE_DATABASE_URL not set; applying migrations as the app role"
  npx prisma migrate deploy
fi

echo "==> Starting OpenHRM"
exec "$@"
