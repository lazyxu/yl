#!/usr/bin/env bash
set -euo pipefail
export MYSQL_PWD="${BACKUP_TEST_PASSWORD:-ci-only-password}"
for attempt in $(seq 1 60); do
  if mysql --host="${BACKUP_TEST_HOST:-mysql}" --port="${BACKUP_TEST_PORT:-3306}" --user="${BACKUP_TEST_USER:-root}" --execute='SELECT 1' >/dev/null 2>&1; then
    exit 0
  fi
  sleep 1
done
echo "MySQL test service was not ready within 60 seconds" >&2
exit 1
