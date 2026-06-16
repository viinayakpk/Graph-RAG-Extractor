# ── Stage 1: Build ────────────────────────────────────────────────────────────
# Compile TypeScript → dist/ using the full dev toolchain
FROM node:22-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json .
COPY src/ ./src/

RUN npm run build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
# Lean image with only production dependencies + compiled JS
FROM node:22-slim
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# /data/input  — mount tender PDFs here (read-only)
# /data/output — results land here (one folder of JSON per tender)
VOLUME ["/data/input", "/data/output"]

ENTRYPOINT ["node", "dist/cli.js"]
