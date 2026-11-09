#!/bin/sh
set -eu

pnpm run typecheck:libs
pnpm --filter @workspace/ethio-hudhud run typecheck
pnpm --filter @workspace/api-server run typecheck
PORT="${PORT:-5000}" BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/ethio-hudhud run build
pnpm --filter @workspace/api-server run build
