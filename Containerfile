# Stage 1: Builder
FROM node:20-bookworm AS builder

# Install system dependencies required for native module compilation
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    git \
    build-essential \
    pkg-config \
    libssl-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package.json package-lock.json ./

# Install Node.js dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Stage 2: Final image
FROM node:20-bookworm

# Create a non-root user
ARG UID=1001
ARG GID=1001
RUN groupadd -g $GID appgroup && \
    useradd -u $UID -g appgroup -s /bin/bash -m appuser

WORKDIR /app

# Copy only necessary files from the builder stage
# This ensures a smaller final image and only includes what's needed for execution
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
COPY --from=builder /app/.gitignore ./.gitignore

RUN mkdir -p /app/cache /app/artifacts && chown -R appuser:appgroup /app

# Set non-root user
USER appuser

# Define the default command to run when the container starts (optional, but good practice)
# CMD ["npx", "hardhat", "node"]
