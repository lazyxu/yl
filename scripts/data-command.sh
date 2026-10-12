#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Git Bash converts POSIX-looking arguments passed to native Windows Node.
# Only --base is a remote path; keep normal conversion for local file paths.
args=()
while [ "$#" -gt 0 ]; do
  if [ "$1" = --base ]; then
    [ "$#" -ge 2 ] || { echo "Missing value: --base" >&2; exit 1; }
    args+=("--base=$2")
    shift 2
  else
    args+=("$1")
    shift
  fi
done
export MSYS2_ARG_CONV_EXCL="${MSYS2_ARG_CONV_EXCL:+${MSYS2_ARG_CONV_EXCL};}--base="
exec node "$ROOT_DIR/scripts/data-backup.mjs" "${args[@]}"
