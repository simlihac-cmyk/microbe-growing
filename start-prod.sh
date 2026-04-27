#!/usr/bin/env bash
set -Eeuo pipefail

BASE_DIR="/Users/sg_mac/microbe-growing"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export NODE_ENV="${NODE_ENV:-production}"
export MICROBE_HOST="${MICROBE_HOST:-127.0.0.1}"
export MICROBE_PORT="${MICROBE_PORT:-4130}"

cd "$BASE_DIR"

if [[ ! -d node_modules ]]; then
  npm install
fi

npm run build
exec npm run start
