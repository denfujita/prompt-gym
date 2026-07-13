FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json vitest.config.ts ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
RUN npm ci
COPY apps/api apps/api
COPY packages/contracts packages/contracts
COPY packages/core packages/core
COPY packages/db packages/db
RUN npm run build -w @prompt-gym/contracts && npm run build -w @prompt-gym/core && npm run build -w @prompt-gym/db && npm run build -w @prompt-gym/api

FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/packages/contracts ./packages/contracts
COPY --from=build /app/packages/core ./packages/core
COPY --from=build /app/packages/db ./packages/db
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
