#!/bin/sh
set -eu

: "${VITE_CLERK_PUBLISHABLE_KEY:?Set the matching Clerk publishable key as a build variable}"
export VITE_CLERK_PROXY_URL="${VITE_CLERK_PROXY_URL:-/api/__clerk}"

pnpm run typecheck:libs
pnpm --filter @workspace/ethio-hudhud run typecheck
pnpm --filter @workspace/api-server run typecheck
PORT="${PORT:-5000}" BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/ethio-hudhud run build
pnpm --filter @workspace/api-server run build
