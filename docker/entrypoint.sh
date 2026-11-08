#!/bin/sh
set -eu

mkdir -p /data
echo "Preparing BudgetPal database..."
./node_modules/.bin/prisma db push --skip-generate

# A marker is written only after successful initialization, so a failed seed
# is retried. Restarts preserve judge edits rather than adding new demo rows.
if [ ! -f /data/.budgetpal-initialized ]; then
  if [ "${SEED_DEMO:-true}" = "true" ]; then
    echo "Adding sample budgets, milestones, and groups..."
    node --import tsx prisma/seed.ts
  fi
  touch /data/.budgetpal-initialized
fi

exec "$@"
