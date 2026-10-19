#!/usr/bin/env bash
set -euo pipefail

# Build, verify a local data backup, then deploy to the existing application.
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"
DRYRUN=0
REMOTE_USER="root"
REMOTE_HOST="t-fluid.com"
REMOTE_PORT="22"
REMOTE_BASE="/yl0126"
BACKUP_DIR="$ROOT_DIR/backups"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dryrun) DRYRUN=1; shift ;;
    --no-dryrun) DRYRUN=0; shift ;;
    --host|--user|--port|--base|--backup-dir)
      [ "$#" -ge 2 ] || { echo "Missing value for $1" >&2; exit 1; }
      case "$1" in
        --host) REMOTE_HOST="$2" ;;
        --user) REMOTE_USER="$2" ;;
        --port) REMOTE_PORT="$2" ;;
        --base) REMOTE_BASE="$2" ;;
        --backup-dir) BACKUP_DIR="$2" ;;
      esac
      shift 2 ;;
    --help)
      echo "Usage: $0 [--dryrun|--no-dryrun] [--host host] [--user user] [--port port] [--base /path] [--backup-dir local-path]"
      exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

[[ "$REMOTE_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ && "$REMOTE_USER" =~ ^[a-zA-Z_][a-zA-Z0-9_-]*$ && "$REMOTE_PORT" =~ ^[0-9]+$ ]] || { echo "Invalid remote target" >&2; exit 1; }
[[ "$REMOTE_BASE" == /* && "$REMOTE_BASE" != / && "$REMOTE_BASE" != *..* && "$REMOTE_BASE" =~ ^/[a-zA-Z0-9_/-]+$ ]] || { echo "Invalid remote base" >&2; exit 1; }

echo "==> Build release"
bash ./release.sh
latest=$(cat releases/.latest-release)
[[ "$latest" == release-* && "$latest" != */* ]] || { echo "Invalid release name" >&2; exit 1; }
release_dir="releases/$latest"
[ -d "$release_dir" ] || { echo "Missing release directory" >&2; exit 1; }

if [ "$DRYRUN" -eq 1 ]; then
  echo "Preview: $release_dir -> $REMOTE_USER@$REMOTE_HOST:$REMOTE_BASE"
  echo "A verified data backup will be saved to $BACKUP_DIR before a real deploy."
  echo "Dry-run complete; no remote connection was made."
  exit 0
fi

echo "==> Back up remote MySQL, uploads and .env to local storage"
bash ./backup_data.sh --host "$REMOTE_HOST" --user "$REMOTE_USER" --port "$REMOTE_PORT" --base "$REMOTE_BASE" --backup-dir "$BACKUP_DIR"

ssh_options=(-o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new -p "$REMOTE_PORT")
target="$REMOTE_USER@$REMOTE_HOST"
echo "==> Upload $release_dir into an isolated version directory"
[[ "$latest" =~ ^release-[A-Za-z0-9._-]+$ && "$latest" != *..* ]] || {
  echo "Invalid release name" >&2; exit 1;
}
remote_stage="$REMOTE_BASE/.yl-releases/$latest"
# Deliberately refuse to overwrite an existing release (which may be serving).
ssh "${ssh_options[@]}" "$target" "mkdir -p '$REMOTE_BASE/.yl-releases' && mkdir '$remote_stage'"
# Keep uploads and credentials exclusively in the stable BASE directory.
tar -C "$release_dir" --exclude=.env --exclude=uploads -czf - . |
  ssh "${ssh_options[@]}" "$target" "tar -xzf - -C '$remote_stage'"

with_nginx=0
if [ -f deploy/nginx/yl0126.conf ]; then
  scp -o BatchMode=yes -o StrictHostKeyChecking=accept-new -P "$REMOTE_PORT" deploy/nginx/yl0126.conf "$target:$remote_stage/.nginx-new.conf"
  with_nginx=1
fi

echo "==> Activate staged PM2 process with automatic code rollback on failure"
ssh "${ssh_options[@]}" "$target" "bash -s -- '$REMOTE_BASE' '$remote_stage' '$with_nginx'" < "$ROOT_DIR/scripts/activate-staged-release.sh"
echo "Deploy complete: $latest. Version record: $remote_stage/release.json"
