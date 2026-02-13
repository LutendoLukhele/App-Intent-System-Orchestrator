# --- Build Stage ---
# This stage builds the TypeScript into JavaScript (monorepo with Turbo)
FROM node:18-alpine AS builder
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files for all workspaces
COPY package*.json ./
COPY turbo.json ./
COPY packages/ ./packages/
COPY apps/ ./apps/

# Install all dependencies
RUN npm install --production=false

# Copy source code
COPY src/ ./src/
COPY config/ ./config/
COPY tsconfig.json ./

# Build all packages with Turbo, then build legacy src
RUN npm run build && npm run build:legacy

# Remove development dependencies
RUN npm prune --production && npm cache clean --force

# --- Production Stage ---
# This stage creates the final, clean image for deployment with bootstrap
FROM node:18-alpine
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache dumb-init curl tini

# Copy necessary files from the build stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/config ./config
COPY --from=builder /app/packages ./packages

# Create application directories
RUN mkdir -p /app/logs /app/sessions /app/data

# Set environment defaults with bootstrap configuration
ENV NODE_ENV=production
ENV PORT=8080
ENV LOG_LEVEL=info
ENV OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318/v1/traces
ENV RATE_LIMIT_ENABLED=true
ENV RATE_LIMIT_MAX_REQUESTS=300
ENV CPU_THRESHOLD_WARNING=70
ENV CPU_THRESHOLD_CRITICAL=85
ENV MEMORY_THRESHOLD_WARNING=80
ENV MEMORY_THRESHOLD_CRITICAL=92

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs

# Health check endpoint with bootstrap status
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8080/health/detailed || exit 1

EXPOSE 8080 9090

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]

# --- done ---
