FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/protocol/package.json packages/protocol/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile --filter @nobar-party/server...
COPY packages/protocol/ packages/protocol/
COPY packages/server/ packages/server/
COPY tsconfig.base.json ./
RUN pnpm -r --filter "@nobar-party/server..." build

FROM node:20-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
COPY --from=build /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./
COPY --from=build /app/packages/protocol/package.json packages/protocol/
COPY --from=build /app/packages/server/package.json packages/server/
RUN pnpm install --prod --frozen-lockfile --filter @nobar-party/server...
COPY --from=build /app/packages/protocol/dist packages/protocol/dist
COPY --from=build /app/packages/server/dist packages/server/dist
ENV PORT=3050 HOST=0.0.0.0
EXPOSE 3050
CMD ["node", "packages/server/dist/index.js"]
