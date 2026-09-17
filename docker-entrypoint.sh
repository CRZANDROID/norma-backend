#!/bin/sh
set -eu

if [ "${SKIP_PRISMA_MIGRATE:-}" != "true" ]; then
  echo "NORMA: applying Prisma migrations..."
  ./node_modules/.bin/prisma migrate deploy
fi

if [ "$#" -eq 0 ]; then
  set -- node dist/main.js
fi

echo "NORMA: starting $*"
exec "$@"
