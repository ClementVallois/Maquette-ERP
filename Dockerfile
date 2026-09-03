# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.13.1-bookworm-slim@sha256:a81a03dd965b4052269a57fac857004022b522a4bf06e7a739e25e18bce45af2

FROM ${NODE_IMAGE} AS workspace

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN corepack enable

WORKDIR /workspace

# Keep dependency installation cacheable when application sources change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/billing/package.json packages/billing/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/platform/package.json packages/platform/package.json
COPY packages/timesheet/package.json packages/timesheet/package.json
COPY tests/harness/package.json tests/harness/package.json

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

FROM workspace AS build

RUN pnpm --filter @erp/web build
# The workspace deliberately keeps linked packages during development. `--legacy` confines the
# production injection to this deploy step instead of changing that development-time behaviour.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter maquette-erp deploy --prod --legacy /opt/erp
# `deploy` copies package contents the way `pnpm pack` would, which honours .gitignore — and
# `apps/web/dist` is gitignored as a build artifact, so it never reaches /opt/erp on its own.
# `registerSpa` (apps/api/src/web/spa.ts) reads it at its fixed path relative to the compiled
# module, so it has to land at the exact same path here.
RUN mkdir -p /opt/erp/apps/web/dist && cp -r apps/web/dist/. /opt/erp/apps/web/dist/
# Node 24 intentionally refuses to strip TypeScript below a node_modules realpath. `deploy`
# injects workspace packages there, while this repository executes their TypeScript sources
# directly. Point the package names back at the deployed workspace sources; third-party packages
# stay in the production-only virtual store that `deploy` created.
RUN rm -f /opt/erp/node_modules/@erp/api \
          /opt/erp/node_modules/@erp/billing \
          /opt/erp/node_modules/@erp/contracts \
          /opt/erp/node_modules/@erp/platform \
          /opt/erp/node_modules/@erp/timesheet \
    && ln -s ../../apps/api /opt/erp/node_modules/@erp/api \
    && ln -s ../../packages/billing /opt/erp/node_modules/@erp/billing \
    && ln -s ../../packages/contracts /opt/erp/node_modules/@erp/contracts \
    && ln -s ../../packages/platform /opt/erp/node_modules/@erp/platform \
    && ln -s ../../packages/timesheet /opt/erp/node_modules/@erp/timesheet \
    && ln -s .pnpm/node_modules/@fastify /opt/erp/node_modules/@fastify \
    && ln -s .pnpm/node_modules/fastify /opt/erp/node_modules/fastify \
    && ln -s .pnpm/node_modules/pino /opt/erp/node_modules/pino

FROM ${NODE_IMAGE} AS runtime

ARG VCS_REF=unknown

LABEL org.opencontainers.image.source="https://github.com/ClementVallois/Maquette-ERP" \
      org.opencontainers.image.description="CRA-to-invoice ERP demonstrator" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.revision="${VCS_REF}"

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3000

WORKDIR /app

COPY --from=build --chown=10001:10001 /opt/erp/ ./

USER 10001:10001

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "apps/api/src/main.ts"]
