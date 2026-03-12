# Build stage
FROM node:22-slim AS builder

WORKDIR /app

# Install build dependencies for native modules (sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .
# Build core
RUN npm run build

# Build dashboard
WORKDIR /app/dashboard
RUN npm install && npm run build
WORKDIR /app

# Production stage
FROM node:22-slim

WORKDIR /app

# Ensure we have runtime dependencies if needed (e.g., for sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
# Note: we might need to copy native bindings explicitly if they aren't in dist
# But usually they stay in node_modules

# Create data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 3000

ENV PORT=3000
ENV HOST=0.0.0.0
ENV QDRANT_URL=http://localhost:6333
ENV QDRANT_COLLECTION=neural_nexus_universal
ENV REPLACEMENT_LOG_PATH=/app/data/replacements.sqlite

CMD ["npm", "start"]
