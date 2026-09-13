# ima2-gen in a throwaway container — used to generate podcast covers via the
# GPT OAuth image model (same engine as ChatGPT web), without polluting the host.
#
# Cleanup later:  docker compose down  &&  docker image rm ima2-gen-local  &&  rm -rf data out
ARG NODE_VERSION=20-bookworm
FROM node:${NODE_VERSION}

# better-sqlite3 / sharp ship prebuilt linux binaries, but keep a toolchain
# around in case a prebuild is missing for this architecture.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Pin via build arg: docker compose build --build-arg IMA2_VERSION=2.0.20
ARG IMA2_VERSION=latest
RUN npm install -g ima2-gen@${IMA2_VERSION} \
  && npm cache clean --force

# All mutable state (config, tokens, sqlite db, generated images) lives under
# /data so a single bind mount captures everything and cleanup is `rm -rf data`.
ENV IMA2_CONFIG_DIR=/data/ima2 \
    CODEX_HOME=/data/codex \
    IMA2_HOST=127.0.0.1 \
    IMA2_PORT=3333
RUN mkdir -p /data /out
WORKDIR /data

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Loopback-only inside the container; drive it with `docker compose exec`.
# (EXPOSE is documentation only — no port is published by compose.)
EXPOSE 3333
ENTRYPOINT ["/entrypoint.sh"]
