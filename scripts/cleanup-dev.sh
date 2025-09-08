#!/usr/bin/env bash
set -euo pipefail
PORT=${PORT:-3000}
RED="\033[31m"; GREEN="\033[32m"; YELLOW="\033[33m"; NC="\033[0m"

echo -e "${YELLOW}🔍 Checking for stale dev processes...${NC}" || true
# Kill processes that match our dev scripts (concurrently, nodemon, vite)
while :; do
  pids=$(ps -eo pid,command | grep -E "(nodemon --exec tsx server/index.ts|concurrently -n SERVER,VITE|vite --config ./client/vite.config.ts)" | grep -v grep | awk '{print $1}') || true
  if [ -z "${pids}" ]; then break; fi
  echo -e "${YELLOW}⚠️  Killing stale processes: ${pids}${NC}" || true
  kill -9 ${pids} 2>/dev/null || true
  sleep 0.5
done

# Free server port
if lsof -i:${PORT} >/dev/null 2>&1; then
  holder=$(lsof -t -i:${PORT} | xargs)
  echo -e "${YELLOW}⚠️  Port ${PORT} held by: ${holder} -> killing${NC}" || true
  kill -9 ${holder} 2>/dev/null || true
  sleep 0.5
fi

if lsof -i:${PORT} >/dev/null 2>&1; then
  echo -e "${RED}❌ Port ${PORT} still busy after cleanup. Abort.${NC}" >&2
  exit 1
fi

echo -e "${GREEN}✅ Clean environment; starting dev...${NC}" || true

# Exec the dev command (start server + client)
exec npm run dev
