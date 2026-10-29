FROM node:24-bookworm-slim AS builder

WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# postinstall runs `prisma generate`, which only needs the variable to exist.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build

COPY package*.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
# npm's update notice goes to stderr, and Railway flags all stderr as an error.
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV PRISMA_HIDE_UPDATE_MESSAGE=1

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json prisma.config.ts ./

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
