#!/bin/sh
set -eu

echo "NORMA: applying Prisma migrations..."
./node_modules/.bin/prisma migrate deploy

if [ "$#" -eq 0 ]; then
  set -- node dist/main.js
fi

echo "NORMA: starting $*"
exec "$@"
