#!/bin/sh
# Seed a minimal config so `ima2 serve` skips the interactive setup wizard
# (it prompts on a TTY-less container otherwise). Provider=oauth = GPT OAuth;
# the actual login is done later via ./login.sh (device-code).
set -e
CFG="${IMA2_CONFIG_DIR:-/data/ima2}/config.json"
mkdir -p "$(dirname "$CFG")"
# codex refuses to start if CODEX_HOME doesn't exist — pre-create it.
mkdir -p "${CODEX_HOME:-/data/codex}"
if [ ! -f "$CFG" ]; then
  printf '{"provider":"oauth"}\n' > "$CFG"
  echo "[entrypoint] seeded $CFG (provider=oauth)"
fi
exec ima2 serve
