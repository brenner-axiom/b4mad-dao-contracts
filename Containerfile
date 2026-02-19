# Stage 1: Builder
FROM node:22-bookworm AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    git \
    build-essential \
    pkg-config \
    libssl-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./

RUN npm install

COPY . .

# Compile contracts to generate artifacts and cache
RUN npx hardhat compile

# Stage 2: Final image
FROM node:22-bookworm

ARG UID=1001
ARG GID=1001
RUN groupadd -g $GID appgroup && \
    useradd -u $UID -g appgroup -s /bin/bash -m appuser

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/hardhat.config.js ./hardhat.config.js
COPY --from=builder /app/contracts ./contracts
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/test ./test
COPY --from=builder /app/artifacts ./artifacts
COPY --from=builder /app/cache ./cache
COPY --from=builder /app/ignition ./ignition
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/README.md ./README.md

USER appuser
