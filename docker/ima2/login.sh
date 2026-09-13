#!/usr/bin/env bash
# One-time GPT OAuth login inside the ima2 container, using the device-code flow
# (headless-friendly: prints a URL + code you authorize in any browser — no
# localhost callback, which is what makes it work inside Docker).
set -euo pipefail
cd "$(dirname "$0")"

echo "→ Device-code login. A URL + code will appear; open it in your browser and"
echo "  sign in with the SAME ChatGPT account you use for covers now."
echo

# codex is a nested dependency of ima2-gen; resolve its bin inside the container.
docker compose exec ima2 sh -lc '
  CODEX="$(npm root -g)/ima2-gen/node_modules/.bin/codex"
  if [ ! -x "$CODEX" ]; then echo "codex bin not found at $CODEX"; exit 1; fi
  exec "$CODEX" login --device-auth -c cli_auth_credentials_store="file"
'

echo
echo "→ Restarting server so the GPT OAuth proxy picks up the new session…"
docker compose restart ima2
sleep 2
echo "→ Status:"
docker compose exec ima2 ima2 status || true
