#!/usr/bin/env bash
set -euo pipefail

# Executed on the SSH host against an unpacked release. Keep the existing
# BASE files (including .env, uploads and previous runnable code) untouched.
BASE="${1:?remote base required}"
STAGE="${2:?staged release required}"
WITH_NGINX="${3:-0}"
APP_NAME="yl"
NGINX_TARGET="/etc/nginx/conf.d/yl0126.conf"
NGINX_NEW="$STAGE/.nginx-new.conf"
NGINX_OLD="$STAGE/.nginx-previous.conf"

[[ "$BASE" == /* && "$BASE" != / && "$BASE" != *..* &&
   "$STAGE" == "$BASE"/.yl-releases/release-* && "$STAGE" != *..* &&
   ( "$WITH_NGINX" == 0 || "$WITH_NGINX" == 1 ) ]] || {
  echo "Invalid staging target" >&2
  exit 2
}
[[ -f "$BASE/.env" && -d "$BASE/uploads" && -f "$STAGE/index.js" &&
   -f "$STAGE/package.json" && -f "$STAGE/dist/index.html" ]] || {
  echo "Missing runtime data or staged program" >&2
  exit 2
}
[[ ! -e "$STAGE/.env" && ! -L "$STAGE/.env" &&
   ! -e "$STAGE/uploads" && ! -L "$STAGE/uploads" ]] || {
  echo "Staged release contains unexpected runtime files" >&2
  exit 2
}
if [[ "$WITH_NGINX" == 1 && ! -f "$NGINX_NEW" ]]; then
  echo "Missing staged Nginx config" >&2
  exit 2
fi

old_cwd=""
switched=0
nginx_modified=0
nginx_existed=0
priv=()
if [[ "$(id -u)" != 0 ]]; then priv=(sudo -n); fi

rollback() {
  local failure="$?"
  trap - ERR
  echo "Release activation failed (exit $failure); rolling back application" >&2
  if [[ "$nginx_modified" == 1 ]]; then
    if [[ "$nginx_existed" == 1 ]]; then
      "${priv[@]}" cp -p "$NGINX_OLD" "$NGINX_TARGET" || echo "CRITICAL: Nginx config restore failed" >&2
    else
      "${priv[@]}" rm -f "$NGINX_TARGET" || echo "CRITICAL: Nginx new config removal failed" >&2
    fi
    "${priv[@]}" nginx -t && "${priv[@]}" systemctl reload nginx || echo "CRITICAL: Nginx reload after rollback failed" >&2
  fi
  if [[ "$switched" == 1 ]]; then
    pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
    if [[ -n "$old_cwd" ]]; then
      (cd "$old_cwd" && pm2 start index.js --name "$APP_NAME" --update-env) ||
        echo "CRITICAL: previous PM2 process could not be restored: $old_cwd" >&2
    fi
  fi
  exit "$failure"
}
trap rollback ERR

# Install inside the staged release only. Failures here cannot affect the live app.
ln -s "$BASE/.env" "$STAGE/.env"
ln -s "$BASE/uploads" "$STAGE/uploads"
(
  cd "$STAGE"
  npm install --production --no-audit --no-fund
  node --check index.js
)

old_cwd="$(pm2 jlist | node -e '
  const fs = require("fs")
  const apps = JSON.parse(fs.readFileSync(0, "utf8")).filter(app => app.name === "yl")
  if (apps.length > 1 || apps.length && apps[0].pm2_env.status !== "online") process.exit(10)
  if (apps.length) process.stdout.write(apps[0].pm2_env.pm_cwd || "")
')"
if [[ -n "$old_cwd" &&
      "$old_cwd" != "$BASE" &&
      "$old_cwd" != "$BASE"/.yl-releases/release-* ]]; then
  echo "Existing PM2 application is outside the target base; aborting" >&2
  exit 3
fi
if [[ -n "$old_cwd" && ! -f "$old_cwd/index.js" ]]; then
  echo "Previous PM2 release is missing, cannot guarantee rollback" >&2
  exit 3
fi

# PM2 switch happens only after staged code and dependencies pass validation.
switched=1
pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
(cd "$STAGE" && pm2 start index.js --name "$APP_NAME" --update-env)

port="$(cd "$STAGE" && node -e '
  const fs = require("fs"), env = require("dotenv").parse(fs.readFileSync(".env"))
  process.stdout.write(String(env.PORT || 3000))
')"
[[ "$port" =~ ^[0-9]+$ && "$port" -ge 1 && "$port" -le 65535 ]] || {
  echo "Invalid application port" >&2
  false
}

attempts="${YL_DEPLOY_HEALTH_ATTEMPTS:-30}"
[[ "$attempts" =~ ^[0-9]+$ && "$attempts" -ge 1 && "$attempts" -le 120 ]] || attempts=30
healthy=0
for (( i=0; i<attempts; i++ )); do
  if curl --fail --silent --max-time 2 "http://127.0.0.1:$port/api/garden/species" >/dev/null; then
    healthy=1
    break
  fi
  sleep 1
done
if [[ "$healthy" != 1 ]]; then
  echo "New PM2 process did not pass HTTP health check" >&2
  false
fi

# Change Nginx only after the new application is healthy.
if [[ "$WITH_NGINX" == 1 ]]; then
  if "${priv[@]}" test -f "$NGINX_TARGET"; then
    "${priv[@]}" cp -p "$NGINX_TARGET" "$NGINX_OLD"
    nginx_existed=1
  fi
  nginx_modified=1
  "${priv[@]}" cp -p "$NGINX_NEW" "$NGINX_TARGET"
  "${priv[@]}" nginx -t
  "${priv[@]}" systemctl reload nginx
fi

switched=0
nginx_modified=0
trap - ERR
echo "Release activated: $STAGE"
if [[ -n "$old_cwd" ]]; then echo "Previous runnable release: $old_cwd"; fi
