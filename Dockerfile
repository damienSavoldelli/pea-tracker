FROM node:22.23.4-bookworm-slim

WORKDIR /workspace
RUN chown node:node /workspace
USER node

ENV WRANGLER_SEND_METRICS=false

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY --chown=node:node tsconfig.json wrangler.jsonc ./
COPY --chown=node:node src ./src
COPY --chown=node:node tests ./tests
COPY --chown=node:node scripts/smoke-mcp.mjs ./scripts/smoke-mcp.mjs

USER root
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
USER node

EXPOSE 8787
CMD ["./node_modules/.bin/wrangler", "dev", "--local", "--ip", "0.0.0.0", "--port", "8787", "--show-interactive-dev-session=false"]
