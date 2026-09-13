#!/usr/bin/env bash
# Generate a podcast cover from a prompt using ima2-gen (GPT OAuth) in Docker.
# Same image engine as your ChatGPT web-chat covers, but scripted + batchable.
#
# Usage:
#   ./gen-cover.sh <name> <prompt-file>          # prompt from a file
#   pbpaste | ./gen-cover.sh <name>              # prompt from stdin (mac clipboard)
#   ./gen-cover.sh <name> - <<'EOF' ... EOF      # heredoc
#
# Env overrides:
#   IMA2_SIZE     (default 1024x1536 — portrait base for a 9:16 cover)
#   IMA2_QUALITY  (default high)
#   IMA2_MODEL    (e.g. gpt-5.6-terra; default = server's default)
set -euo pipefail
cd "$(dirname "$0")"

name="${1:?usage: gen-cover.sh <name> [prompt-file]}"
promptfile="${2:-}"
size="${IMA2_SIZE:-1024x1536}"
quality="${IMA2_QUALITY:-high}"
# oauth = GPT OAuth (Codex — KHÔNG gen được ảnh); api = OpenAI API key (gpt-image);
# grok = Grok OAuth; gemini-api = Gemini nano-banana.
provider="${IMA2_PROVIDER:-oauth}"
model_args=()
[ -n "${IMA2_MODEL:-}" ] && model_args=(--model "$IMA2_MODEL")

# Fail early with a clear hint if the server/oauth aren't ready.
if ! docker compose exec -T ima2 ima2 status >/dev/null 2>&1; then
  echo "✗ ima2 server not reachable. Run:  docker compose up -d  &&  ./login.sh" >&2
  exit 1
fi

read_prompt() { if [ -n "$promptfile" ] && [ "$promptfile" != "-" ]; then cat "$promptfile"; else cat; fi; }

echo "→ Generating cover '$name' (size=$size quality=$quality provider=$provider)…"
read_prompt | docker compose exec -T ima2 ima2 gen --stdin \
  --provider "$provider" --mode direct -q "$quality" -s "$size" \
  ${model_args[@]+"${model_args[@]}"} \
  -o "/out/${name}.png"

echo "→ Saved: $(pwd)/out/${name}.png"
