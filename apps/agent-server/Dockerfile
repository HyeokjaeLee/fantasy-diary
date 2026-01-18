FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/agent-server/package.json ./apps/agent-server/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/configs/package.json ./packages/configs/package.json

RUN bun install --production

COPY apps/agent-server/src ./apps/agent-server/src
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/__generated__ ./packages/shared/__generated__

ENV NODE_ENV=production

CMD ["bun", "run", "apps/agent-server/src/index.ts"]
