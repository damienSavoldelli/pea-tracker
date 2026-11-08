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
COPY --chown=node:node migrations/0001_instruments.sql migrations/0002_instrument_create_outcomes.sql ./migrations/
COPY --chown=node:node scripts/dev-instruments-d1.mjs ./scripts/dev-instruments-d1.mjs
COPY --chown=node:node aidd_docs/api/openapi.json ./aidd_docs/api/openapi.json
COPY --chown=node:node aidd_docs/api/schemas/openapi-3.1-2025-09-15.json ./aidd_docs/api/schemas/openapi-3.1-2025-09-15.json
COPY --chown=node:node scripts/smoke-mcp.mjs ./scripts/smoke-mcp.mjs

USER root
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
USER node
COPY --chown=node:node aidd_docs/api/schemas/LICENSE ./aidd_docs/api/schemas/LICENSE

EXPOSE 8787
CMD ["./node_modules/.bin/wrangler", "dev", "--local", "--ip", "0.0.0.0", "--port", "8787", "--show-interactive-dev-session=false"]
