FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
ARG SITE_URL=http://localhost:4321
ARG ZEABUR_GIT_COMMIT_SHA=development
ENV SITE_URL=${SITE_URL}
ENV ZEABUR_GIT_COMMIT_SHA=${ZEABUR_GIT_COMMIT_SHA}
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321 \
    UPLOAD_DIR=/app/data/uploads SECRETS_DIR=/run/kaiyo-secrets
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/db ./db
RUN mkdir -p /app/data/uploads && chown node:node /app/data/uploads
USER node
EXPOSE 4321
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:4321/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/start.mjs"]
